import { describe, expect, it } from "vitest";
import { validateDocumentFormat } from "@/lib/upload-validation";
describe("document format boundary", () => {
  it("rejects executable bytes disguised as PDF and a misleading extension", () => {
    expect(() => validateDocumentFormat({ name: "passport.pdf", type: "application/pdf", data: Buffer.from("MZ executable") })).toThrow();
    expect(() => validateDocumentFormat({ name: "passport.exe", type: "application/pdf", data: Buffer.from("%PDF-1.4") })).toThrow();
    expect(() => validateDocumentFormat({ name: "passport.PDF", type: "application/pdf", data: Buffer.from("%PDF-1.4") })).not.toThrow();
  });
  it("requires Word content inside a DOCX container", () => {
    const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(() => validateDocumentFormat({ name: "form.docx", type, data: Buffer.from("PK\u0003\u0004other.zip") })).toThrow();
    expect(() => validateDocumentFormat({ name: "form.docx", type, data: Buffer.from("PK\u0003\u0004word/document.xml") })).not.toThrow();
  });
});
