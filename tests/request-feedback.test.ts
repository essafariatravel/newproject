import { describe, expect, it } from "vitest";
import { requestErrorMessage, readRequestResponse, requestFailureFeedback, registrationUploadProblem } from "@/lib/request-feedback";
describe("actionable upload feedback", () => {
  it("turns interrupted requests into retry guidance without raw browser errors", () => {
    expect(requestFailureFeedback(new TypeError("Failed to fetch"),"fr")).toMatchObject({catalogue:false});
    expect(requestFailureFeedback(new TypeError("Failed to fetch"),"fr").message).toContain("Vérifiez votre connexion");
    expect(requestFailureFeedback(new TypeError("Failed to fetch"),"fr").message).not.toContain("Failed to fetch");
  });
  it("returns English upload guidance rather than an internal translation key", () => {
    expect(requestErrorMessage("FILE_TOO_LARGE","en")).toBe("Files must be 2 MB or smaller.");
  });
  it("offers catalogue recovery for a disabled programme returned by the real response parser", async () => {
    try { await readRequestResponse(new Response(JSON.stringify({code:"VISA_TYPE_INVALID",error:"raw server message"}),{status:400}),"ar"); }
    catch(error) { const feedback=requestFailureFeedback(error,"ar"); expect(feedback.catalogue).toBe(true); expect(feedback.message).toContain("حدّث الكتالوج"); return; }
    throw new Error("Expected a rejected response");
  });
  it("never forwards an unrecognized API error message", async () => {
    try { await readRequestResponse(new Response(JSON.stringify({code:"UNKNOWN",error:"Sensitive debug data"}),{status:400}),"en"); }
    catch(error) { expect(requestFailureFeedback(error,"en").message).not.toContain("Sensitive debug data"); return; }
    throw new Error("Expected a rejected response");
  });
  it("rejects oversized or unsupported registration files before upload", () => {
    expect(registrationUploadProblem(new File([new Uint8Array(2*1024*1024+1)],"large.pdf",{type:"application/pdf"}))).toBe("FILE_TOO_LARGE");
    expect(registrationUploadProblem(new File(["text"],"program.exe",{type:"application/x-msdownload"}))).toBe("UNSUPPORTED_TYPE");
    expect(registrationUploadProblem(new File(["%PDF-1.4"],"letter.pdf",{type:"application/pdf"}))).toBeNull();
  });
});
