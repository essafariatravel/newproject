import { describe, expect, it } from "vitest";
import { validateDocumentFormat } from "@/lib/upload-validation";
import { fileNameProblem } from "@/lib/filename";
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


describe("upload filename and active-content boundary", () => {
  it.each([
    "../passport.pdf",
    "..\\passport.pdf",
    "folder/passport.pdf",
    "folder\\passport.pdf",
    "..",
    ".",
    "passport\nInjected.pdf",
  ])("rejects traversal/control filename %p", (name) => {
    expect(fileNameProblem(name)).not.toBeNull();
  });

  it("rejects SVG and HTML even when their bytes are otherwise valid text", () => {
    expect(() => validateDocumentFormat({
      name: "payload.svg",
      type: "image/svg+xml",
      data: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
    })).toThrow();
    expect(() => validateDocumentFormat({
      name: "payload.html",
      type: "text/html",
      data: Buffer.from("<script>alert(1)</script>"),
    })).toThrow();
  });
});
