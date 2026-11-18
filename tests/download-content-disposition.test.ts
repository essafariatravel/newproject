import { describe, expect, it } from "vitest";
import { downloadContentDisposition } from "@/lib/download-content-disposition";

describe("document download Content-Disposition", () => {
  it.each([
    "passport.pdf",
    "État civil.pdf",
    "جواز السفر.pdf",
    "护照.pdf",
    "scan 📄.pdf",
    "nom;avec%caractères.pdf",
    "file'with(brackets).pdf",
  ])("generates a valid ASCII-only header that preserves the UTF-8 name: %s", (name) => {
    const header = downloadContentDisposition(name);
    expect(header).toMatch(/^attachment; filename="[^"]+"; filename\*=UTF-8''/);
    expect([...header].every(char => char.charCodeAt(0) <= 0x7f)).toBe(true);
    expect(() => new Headers({ "Content-Disposition": header })).not.toThrow();
    expect(decodeURIComponent(header.split("filename*=UTF-8''")[1])).toBe(name);
  });

  it("uses a readable ASCII fallback and the original Unicode name", () => {
    const header = downloadContentDisposition("جواز السفر.pdf");
    expect(header).toContain('filename="document.pdf"');
    expect(header).toContain("filename*=UTF-8''%D8%AC%D9%88%D8%A7%D8%B2");
  });

  it("neutralizes CRLF, quote, path, and percent injection", () => {
    const header = downloadContentDisposition('bad"\r\nX-Injected: yes/evil%.pdf');
    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
    expect(header).toMatch(/^attachment; filename="[^"]+"; filename\*=UTF-8''/);
    expect(() => new Headers({ "Content-Disposition": header })).not.toThrow();
  });

  it("handles malformed Unicode rather than turning a download into HTTP 500", () => {
    const header = downloadContentDisposition("scan\uD800.pdf");
    expect(header).toContain("%EF%BF%BD.pdf");
    expect(() => new Headers({ "Content-Disposition": header })).not.toThrow();
  });
});
