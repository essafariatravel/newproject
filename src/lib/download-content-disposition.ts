/**
 * RFC 6266 attachment header with an ASCII fallback and an RFC 5987 UTF-8
 * filename*. File names accepted at upload may contain Arabic or other Unicode;
 * writing them directly into filename="" makes Headers/NextResponse throw.
 */
export function downloadContentDisposition(originalFilename: string): string {
  // Normalize ill-formed UTF-16 and remove characters that could affect header
  // syntax or filename paths without changing stored filename metadata.
  const safe = Buffer.from(originalFilename, "utf8").toString("utf8")
    .replace(/[\u0000-\u001f\u007f-\u009f\\\/"]/g, "_").trim() || "document";

  const extension = safe.match(/\.([a-zA-Z0-9]{1,8})$/)?.[0] ?? "";
  const stem = extension ? safe.slice(0, -extension.length) : safe;
  const asciiStem = stem.replace(/[^\x20-\x7e]/g, "_").replace(/[%;]/g, "_")
    .replace(/_+/g, "_").replace(/^[_ .]+|[_ .]+$/g, "");
  const asciiName = (asciiStem || "document") + extension;
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, (char) =>
    "%" + char.charCodeAt(0).toString(16).toUpperCase());

  return ['attachment; filename="', asciiName, '"; filename*=UTF-8', "''", encoded].join("");
}
