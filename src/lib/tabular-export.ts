import { deflateRawSync } from "node:zlib";

/**
 * Tabular exports with NO new dependency.
 *
 * Two formats are required by the specification: CSV (for spreadsheets and
 * data pipelines) and XLSX (for finance users who expect a real workbook).
 * Rather than pulling a spreadsheet library into a visa back-office, XLSX is
 * written directly as OOXML inside a ZIP container — the format is small and
 * stable, and every writer here is verifiable: the produced archive is a
 * standard ZIP that any reader (Excel, LibreOffice, `unzip`) can open.
 *
 * Correctness rules that matter for money and Arabic text:
 *  - CSV is emitted as UTF-8 **with BOM** so Excel shows DZD and Arabic labels
 *    instead of mojibake, and cells are escaped per RFC 4180.
 *  - Numbers are written as numbers, text as inline strings, so spreadsheet
 *    formulas can never be triggered by a value that starts with "=" (a CSV
 *    injection vector): text cells are prefixed-safe and XLSX strings are never
 *    interpreted as formulas.
 */

export type Cell = string | number | null | undefined;
export interface Column {
  key: string;
  header: string;
  /** "text" (default) | "number" | "money" — money renders as a numeric cell. */
  kind?: "text" | "number" | "money";
}
export type Row = Record<string, Cell>;

/* --------------------------------- CSV ---------------------------------- */

/** RFC 4180 cell escaping, with spreadsheet-formula neutralisation. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  // A leading =, +, -, @ (or tab/CR) is executed as a formula by Excel/Sheets.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) || text !== raw ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(columns: readonly Column[], rows: readonly Row[]): string {
  const header = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(","));
  // \uFEFF = UTF-8 BOM (Excel + Arabic/French accents), CRLF per RFC 4180.
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
}

/* --------------------------------- ZIP ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  return (crc ^ -1) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Minimal, standards-compliant ZIP (deflate) writer. */
function zip(entries: ZipEntry[], date = new Date()): Buffer {
  const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const deflated = deflateRawSync(entry.data, { level: 6 });
    const useDeflate = deflated.byteLength < entry.data.byteLength;
    const payload = useDeflate ? deflated : entry.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 filenames
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.byteLength, 18);
    local.writeUInt32LE(entry.data.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, payload);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(dosTime, 12);
    dir.writeUInt16LE(dosDate, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(payload.byteLength, 20);
    dir.writeUInt32LE(entry.data.byteLength, 24);
    dir.writeUInt16LE(name.byteLength, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += local.byteLength + name.byteLength + payload.byteLength;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuffer, end]);
}

/* -------------------------------- XLSX ---------------------------------- */

const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    // strip control characters that make the XML invalid
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** A real .xlsx workbook (OOXML in a ZIP) — no dependency, opens in Excel. */
export function toXlsx(sheetName: string, columns: readonly Column[], rows: readonly Row[]): Buffer {
  const sheetRows: string[] = [];
  const headerCells = columns
    .map((c, i) => `<c r="${columnLetter(i)}1" s="1" t="inlineStr"><is><t>${xmlEscape(c.header)}</t></is></c>`)
    .join("");
  sheetRows.push(`<row r="1">${headerCells}</row>`);

  rows.forEach((row, index) => {
    const r = index + 2;
    const cells = columns
      .map((c, i) => {
        const ref = `${columnLetter(i)}${r}`;
        const value = row[c.key];
        if (value === null || value === undefined || value === "") return "";
        const numeric = typeof value === "number" || c.kind === "number" || c.kind === "money";
        if (numeric && Number.isFinite(Number(value))) {
          return `<c r="${ref}" t="n"><v>${Number(value)}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
      })
      .join("");
    sheetRows.push(`<row r="${r}">${cells}</row>`);
  });

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

  return zip(
    [
      { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
      { name: "_rels/.rels", data: Buffer.from(rootRels, "utf8") },
      { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
      { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels, "utf8") },
      { name: "xl/styles.xml", data: Buffer.from(styles, "utf8") },
      { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet, "utf8") },
    ],
    new Date(),
  );
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
