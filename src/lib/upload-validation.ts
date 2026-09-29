import { AppError } from "@/lib/types";

/** Match the declared format to both its extension and signature before storage. */
export function validateDocumentFormat(file: { name: string; type: string; data: Buffer }) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const bytes = file.data;
  const starts = (hex: string) => bytes.subarray(0, hex.length / 2).toString("hex") === hex;
  const formats: Record<string, { extensions: string[]; valid: boolean }> = {
    "application/pdf": { extensions: ["pdf"], valid: bytes.subarray(0, 5).toString() === "%PDF-" },
    "image/jpeg": { extensions: ["jpg", "jpeg"], valid: starts("ffd8ff") },
    "image/png": { extensions: ["png"], valid: starts("89504e470d0a1a0a") },
    "image/webp": { extensions: ["webp"], valid: bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" },
    "application/msword": { extensions: ["doc"], valid: starts("d0cf11e0a1b11ae1") },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extensions: ["docx"], valid: starts("504b0304") && bytes.includes(Buffer.from("word/document.xml")) },
  };
  const format = formats[file.type];
  if (!format || !format.extensions.includes(extension ?? "") || !format.valid) throw new AppError("UNSUPPORTED_TYPE", "The file content, extension and format must match.");
}
