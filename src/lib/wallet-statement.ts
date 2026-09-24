/**
 * PHASE 2.1 — Agency wallet statement PDF.
 *
 * A printed/printable financial statement (NOT an invoice): every figure is
 * derived server-side from the immutable wallet ledger (balanceBefore /
 * balanceAfter snapshots). No values are supplied by the client, no ledger
 * rows are ever created, modified or reversed by this flow.
 *
 * Authorization: AGENCY_ADMIN only, always scoped to the actor's own agency
 * — cross-agency access is rejected even if an agency id is explicitly passed.
 *
 * DZD-only (platform rule §7): DZD is the operational currency and is always
 * the primary section. Historical non-DZD ledger rows (from before the
 * DZD-only migration) are NEVER converted and never summed into DZD totals —
 * they are reported in their own section and counted in `nonDzdRowCount` so
 * nothing disappears silently.
 */
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, applications, walletTransactions } from "@/db/schema";
import { AppError, type AuthUser } from "@/lib/types";
import { readBranding } from "@/lib/branding";
import { storageProvider } from "@/lib/storage";

const DAY_MS = 24 * 60 * 60 * 1000;
export const STATEMENT_MAX_ROWS = 5000;

export interface StatementTx {
  createdAt: Date;
  type: string;
  direction: "CREDIT" | "DEBIT";
  amount: number;
  description: string | null;
  applicationId: string | null;
  balanceBefore: number;
  balanceAfter: number;
}

export interface StatementCurrencySection {
  currency: string;
  openingBalance: number;
  totalCredits: number;
  totalDebits: number;
  closingBalance: number;
  transactions: StatementTx[];
}

export interface WalletStatement {
  agency: { id: string; legalName: string; tradingName: string | null };
  from: Date;
  to: Date;
  generatedAt: Date;
  sections: StatementCurrencySection[];
  /** Historical rows in currencies other than DZD (reported, never converted). */
  nonDzdRowCount: number;
  truncated: boolean;
}

/* ---------------------------------- authZ ---------------------------------- */

function assertStatementAccess(actor: AuthUser | undefined, agencyId: string | undefined): asserts actor is AuthUser {
  if (!actor) throw new AppError("AUTH_REQUIRED", "You must be signed in to access wallet statements.");
  if (actor.role !== "AGENCY_ADMIN")
    throw new AppError("FORBIDDEN", "Wallet statement PDFs are issued to agency administrators only.");
  if (!actor.agencyId) throw new AppError("FORBIDDEN", "This account is not attached to an agency.");
  if (agencyId && agencyId !== actor.agencyId)
    throw new AppError("FORBIDDEN", "Wallet statement PDFs are restricted to your own agency.");
}

/* --------------------------------- parsing --------------------------------- */

export function parseStatementRange(raw: { from?: string | null; to?: string | null }): { from: Date; to: Date } {
  const now = new Date();
  const to = raw.to ? parseDate(raw.to, "to") : now;
  const from = raw.from ? parseDate(raw.from, "from") : new Date(to.getTime() - 30 * DAY_MS);
  from.setHours(0, 0, 0, 0); // inclusive from
  to.setHours(23, 59, 59, 999); // inclusive to
  if (from.getTime() > to.getTime()) throw new AppError("VALIDATION", "The 'from' date must not be after the 'to' date.");
  if (to.getTime() > now.getTime() + DAY_MS) throw new AppError("VALIDATION", "The 'to' date cannot lie in the future.");
  if (to.getTime() - from.getTime() > 399 * DAY_MS)
    throw new AppError("VALIDATION", "Statement periods are limited to 400 days. Combine multiple statements for longer ranges.");
  return { from, to };
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AppError("VALIDATION", `Invalid '${field}' date. Use YYYY-MM-DD.`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new AppError("VALIDATION", `Invalid '${field}' date. Use YYYY-MM-DD.`);
  return d;
}

/* --------------------------------- assembly -------------------------------- */

/** Load the statement data for the actor's own agency, strictly server-side. */
export async function getAgencyWalletStatement(params: {
  actor?: AuthUser;
  agencyId?: string;
  from?: string;
  to?: string;
}): Promise<WalletStatement> {
  assertStatementAccess(params.actor, params.agencyId);
  const actor = params.actor;
  const { from, to } = parseStatementRange({ from: params.from, to: params.to });

  const agencyRows = await db.select().from(agencies).where(eq(agencies.id, actor.agencyId!)).limit(1);
  const agency = agencyRows[0];
  if (!agency) throw new AppError("NOT_FOUND", "Agency not found.");

  const rows = await db
    .select({
      createdAt: walletTransactions.createdAt,
      type: walletTransactions.type,
      amount: walletTransactions.amount,
      reason: walletTransactions.reason,
      applicationId: walletTransactions.applicationId,
      balanceBefore: walletTransactions.balanceBefore,
      balanceAfter: walletTransactions.balanceAfter,
      currency: walletTransactions.currency,
      applRef: applications.reference,
    })
    .from(walletTransactions)
    .leftJoin(applications, eq(walletTransactions.applicationId, applications.id))
    .where(
      and(
        eq(walletTransactions.agencyId, actor.agencyId!),
        gte(walletTransactions.createdAt, from),
        lte(walletTransactions.createdAt, to),
      ),
    )
    .orderBy(asc(walletTransactions.createdAt), asc(walletTransactions.id))
    .limit(STATEMENT_MAX_ROWS + 1);

  const truncated = rows.length > STATEMENT_MAX_ROWS;
  const inRange = truncated ? rows.slice(0, STATEMENT_MAX_ROWS) : rows;

  // Group per currency — mixed-currency ledgers are reported separately, never summed.
  // Operational currency is DZD (§7); anything else here is historical data.
  const byCurrency = new Map<string, StatementTx[]>();
  for (const r of inRange) {
    // Direction comes from the ledger movement itself, never from a type-name guess.
    const credit = Number(r.balanceAfter) > Number(r.balanceBefore);
    const desc = [r.reason, r.applRef ? `Application ${r.applRef}` : null].filter(Boolean).join(" — ") || null;
    // §18 — commercial adjustments carry their statement label from the spec
    const displayType =
      r.type === "COMMERCIAL_DISCOUNT" ? "Commercial discount/refund"
      : r.type === "COMMERCIAL_SURCHARGE" ? "Commercial surcharge"
      : r.type;
    const tx: StatementTx = {
      createdAt: r.createdAt,
      type: displayType,
      direction: credit ? "CREDIT" : "DEBIT",
      amount: Number(r.amount),
      description: desc,
      applicationId: r.applicationId,
      balanceBefore: Number(r.balanceBefore),
      balanceAfter: Number(r.balanceAfter),
    };
    const list = byCurrency.get(r.currency) ?? [];
    list.push(tx);
    byCurrency.set(r.currency, list);
  }

  const sections: StatementCurrencySection[] = [];
  // DZD first (§7): the operational currency leads the statement.
  const ordered = [...byCurrency.keys()].sort((a, b) =>
    a === "DZD" ? -1 : b === "DZD" ? 1 : a === agency.currency ? -1 : b === agency.currency ? 1 : a.localeCompare(b),
  );
  for (const currency of ordered) {
    const txs = byCurrency.get(currency)!;
    const opening = txs[0]!.balanceBefore;
    const closing = txs[txs.length - 1]!.balanceAfter;
    let credits = 0;
    let debits = 0;
    for (const t of txs) {
      if (t.direction === "CREDIT") credits += t.amount;
      else debits += t.amount;
    }
    sections.push({
      currency,
      openingBalance: opening,
      totalCredits: round2(credits),
      totalDebits: round2(debits),
      closingBalance: closing,
      transactions: txs,
    });
  }

  // Zero-transaction periods still produce a valid statement: opening = closing = current balance.
  if (sections.length === 0) {
    sections.push({
      currency: "DZD",
      openingBalance: Number(agency.balance),
      totalCredits: 0,
      totalDebits: 0,
      closingBalance: Number(agency.balance),
      transactions: [],
    });
  }

  return {
    agency: { id: agency.id, legalName: agency.legalName, tradingName: agency.tradingName },
    from,
    to,
    generatedAt: new Date(),
    sections,
    nonDzdRowCount: inRange.filter((r) => r.currency !== "DZD").length,
    truncated,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ---------------------------- PDF (pure JS: pdf-lib) ------------------------ */

/** latin-safe: the built-in PDF fonts cover WinAnsi only; degrade gracefully. */
function latinize(s: string): string {
  const out = s
    .replace(/[\u0600-\u06FF]+/g, " ") // Arabic script (not covered by base fonts)
    .replace(/[^\x20-\x7E\xA0-\xFF]+/g, " ") // anything else non-WinAnsi
    .replace(/\s{2,}/g, " ")
    .trim();
  return out || "-";
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MARGIN = 50;
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;

export async function buildWalletStatementPdf(statement: WalletStatement): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`Wallet statement — ${latinize(statement.agency.legalName)}`);
  doc.setSubject("Agency prepaid wallet statement");
  doc.setProducer("Essafaria Visa OS");
  // Deterministic artefact: pdf-lib would otherwise stamp the wall-clock time, so
  // the same statement produced twice could differ byte-for-byte (and a re-issued
  // statement would not be verifiable against the original). The statement's own
  // timestamp is the truthful creation date.
  doc.setCreationDate(statement.generatedAt);
  doc.setModificationDate(statement.generatedAt);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(15 / 255, 42 / 255, 76 / 255);
  const gold = rgb(171 / 255, 141 / 255, 46 / 255);
  const ink = rgb(33 / 255, 37 / 255, 41 / 255);
  const faint = rgb(0.55, 0.58, 0.62);
  const rule = rgb(0.82, 0.84, 0.87);
  const band = rgb(0.965, 0.973, 0.985);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const branding = await readBranding().catch(() => null);
  const brand = latinize(branding?.name ?? "Essafaria Visa OS");

  // Optional brand logo — statement must never fail because of artwork.
  if (branding?.logoKey && !(branding.logoMime ?? "").includes("svg")) {
    try {
      const blob = await storageProvider().get(branding.logoKey);
      const img = blob.mimeType.includes("png") ? await doc.embedPng(blob.data) : await doc.embedJpg(blob.data);
      const h = 34;
      const w = Math.min((img.width / img.height) * h, 160);
      page.drawImage(img, { x: PAGE_W - MARGIN - w, y: y - h + 10, width: w, height: h });
    } catch {
      // artwork missing/corrupt → text-only header
    }
  }

  page.drawText(brand, { x: MARGIN, y: y - 4, size: 16, font: bold, color: navy });
  y -= 22;
  page.drawText("Agency Wallet Statement", { x: MARGIN, y, size: 11, font, color: faint });
  page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: PAGE_W - MARGIN, y: y - 6 }, thickness: 1.4, color: gold });
  y -= 26;

  const meta: Array<[string, string]> = [
    ["Agency", latinize(statement.agency.tradingName ?? statement.agency.legalName)],
    ["Legal name", latinize(statement.agency.legalName)],
    ["Statement period", `${statement.from.toISOString().slice(0, 10)}  to  ${statement.to.toISOString().slice(0, 10)} (inclusive)`],
    ["Generated at", statement.generatedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC"],
  ];
  if (statement.truncated)
    meta.push(["Notice", `Truncated to the first ${STATEMENT_MAX_ROWS} ledger rows — narrow the date range for a complete extract.`]);

  for (const [k, v] of meta) {
    page.drawText(k, { x: MARGIN, y, size: 8.5, font, color: faint });
    page.drawText(v, { x: MARGIN + 110, y, size: 9.5, font: k === "Notice" ? font : bold, color: k === "Notice" ? gold : ink });
    y -= 13;
  }
  y -= 10;

  const COLS = {
    date: { x: MARGIN, w: 78, label: "Date / time (UTC)" },
    type: { x: MARGIN + 80, w: 74, label: "Type" },
    ref: { x: MARGIN + 156, w: 132, label: "Reference / description" },
    credit: { x: MARGIN + 290, w: 61, label: "Credit" },
    debit: { x: MARGIN + 353, w: 61, label: "Debit" },
    balance: { x: MARGIN + 416, w: 79, label: "Balance" },
  };
  const TABLE_RIGHT = MARGIN + 416 + 79;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    page.drawText(`${brand} — Wallet statement (continued)`, { x: MARGIN, y: y - 4, size: 9, font: bold, color: navy });
    y -= 20;
  };
  const guard = (needed: number) => {
    if (y - needed < MARGIN + 30) newPage();
  };

  for (const section of statement.sections) {
    guard(190);
    page.drawRectangle({ x: MARGIN, y: y - 16, width: TABLE_RIGHT - MARGIN, height: 20, color: navy });
    page.drawText(`Currency ${section.currency}`, { x: MARGIN + 6, y: y - 10, size: 10, font: bold, color: rgb(1, 1, 1) });
    y -= 26;

    const sums: Array<[string, string]> = [
      ["Opening balance", money(section.openingBalance)],
      ["Total credits", money(section.totalCredits)],
      ["Total debits", money(section.totalDebits)],
      ["Closing balance", money(section.closingBalance)],
    ];
    let sx = MARGIN;
    for (const [k, v] of sums) {
      page.drawText(`${k}: ${v} ${section.currency}`, { x: sx, y, size: 8.8, font: k === "Closing balance" ? bold : font, color: ink });
      sx += 122;
    }
    y -= 16;

    // header
    page.drawRectangle({ x: MARGIN, y: y - 13, width: TABLE_RIGHT - MARGIN, height: 16, color: band });
    for (const c of Object.values(COLS))
      page.drawText(c.label, { x: c.x + 2, y: y - 9, size: 7.4, font: bold, color: navy });
    y -= 16;

    if (section.transactions.length === 0) {
      page.drawText("No ledger movements in this period.", { x: MARGIN + 2, y: y - 8, size: 8.5, font, color: faint });
      y -= 20;
    }

    let shade = false;
    for (const t of section.transactions) {
      const desc = latinize(t.description ?? "");
      const lines = wrap(desc, 34, font, 7.8);
      const rowH = Math.max(14, 11 * lines.length + 6);
      guard(rowH + 6);
      if (shade) page.drawRectangle({ x: MARGIN, y: y - rowH + 3, width: TABLE_RIGHT - MARGIN, height: rowH, color: band });
      shade = !shade;
      const dt = t.createdAt.toISOString().replace("T", " ").slice(0, 16);
      page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: TABLE_RIGHT, y: y + 3 }, thickness: 0.4, color: rule });
      page.drawText(dt, { x: COLS.date.x + 2, y: y - 7, size: 7.8, font, color: ink });
      page.drawText(latinize(t.type.replaceAll("_", " ")), { x: COLS.type.x + 2, y: y - 7, size: 7.8, font, color: ink });
      lines.forEach((ln, i) => page.drawText(ln, { x: COLS.ref.x + 2, y: y - 7 - i * 10.4, size: 7.8, font, color: ink }));
      if (t.direction === "CREDIT") page.drawText(money(t.amount), { x: COLS.credit.x + 2, y: y - 7, size: 7.8, font, color: rgb(0.1, 0.42, 0.2) });
      else page.drawText(money(t.amount), { x: COLS.debit.x + 2, y: y - 7, size: 7.8, font, color: rgb(0.7, 0.18, 0.16) });
      page.drawText(money(t.balanceAfter), { x: COLS.balance.x + 2, y: y - 7, size: 7.8, font: bold, color: ink });
      y -= rowH;
    }
    page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: TABLE_RIGHT, y: y + 3 }, thickness: 0.4, color: rule });
    y -= 26;
  }

  // Footer: page numbers + integrity note on every page.
  const count = doc.getPageCount();
  for (let i = 0; i < count; i++) {
    const p = doc.getPage(i);
    p.drawText(
      "Generated by Essafaria Visa OS from the immutable wallet ledger — reconciling statement, not an invoice.",
      { x: MARGIN, y: 34, size: 7, font, color: faint },
    );
    p.drawText(`Page ${i + 1} of ${count}`, { x: PAGE_W - MARGIN - 52, y: 34, size: 7, font, color: faint });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

/**
 * Greedy column wrap using font metrics. Words exceeding the line width are
 * hard-cut into width-fitting chunks (with an ellipsis on the final chunk).
 */
function wrap(text: string, widthPts: number, font: { widthOfTextAtSize(s: string, size: number): number }, size: number): string[] {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= widthPts;
  const lines: string[] = [];
  let current = "";
  const pushBreaking = (word: string) => {
    let rest = word;
    while (rest && !fits(rest)) {
      let i = rest.length;
      while (i > 1 && !fits(rest.slice(0, i))) i--;
      lines.push(rest.slice(0, i));
      rest = rest.slice(i);
    }
    if (rest) current = rest;
  };
  for (const word of text.split(/\s+/).filter((w) => w.length > 0)) {
    const attempt = current ? `${current} ${word}` : word;
    if (fits(attempt)) current = attempt;
    else {
      if (current) lines.push(current);
      current = "";
      pushBreaking(word);
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) return ["-"];
  if (lines.length > 4) {
    const cut = lines.slice(0, 4);
    cut[3] = cut[3]!.slice(0, Math.max(0, cut[3]!.length - 1)) + "…";
    return cut;
  }
  return lines;
}
