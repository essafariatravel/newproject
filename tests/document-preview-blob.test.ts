import {describe,it,expect} from "vitest";
import {supportsDocumentPreview,verifiedPreviewBlob} from "../src/app/portal/applications/document-preview-blob";
const pdf="%PDF-1.4\nsynthetic fixture";
const response=(body:string,mime:string,status=200)=>new Response(body,{status,headers:{"Content-Type":mime}});
describe("authenticated document preview payload",()=>{
  it("preserves original PDF bytes with exact PDF MIME",async()=>{
    const result=await verifiedPreviewBlob(response(pdf,"application/pdf"),"application/pdf");
    expect(result.type).toBe("application/pdf");expect(await result.text()).toBe(pdf);
  });
  it("allows response MIME parameters without changing PDF bytes",async()=>{
    expect(await (await verifiedPreviewBlob(response(pdf,"application/pdf; charset=binary"),"application/pdf")).text()).toBe(pdf);
  });
  it.each([401,403,404,500,503])("never previews HTTP %s",async status=>{
    await expect(verifiedPreviewBlob(response(pdf,"application/pdf",status),"application/pdf")).rejects.toThrow();
  });
  it("rejects HTML even when the response declares PDF",async()=>{
    await expect(verifiedPreviewBlob(response("<html>login</html>","application/pdf"),"application/pdf")).rejects.toThrow();
  });
  it("rejects MIME mismatches and empty PDFs",async()=>{
    await expect(verifiedPreviewBlob(response(pdf,"text/html"),"application/pdf")).rejects.toThrow();
    await expect(verifiedPreviewBlob(response("","application/pdf"),"application/pdf")).rejects.toThrow();
  });
  it.each(["image/jpeg","image/png","image/webp"])("preserves %s image preview",async mime=>{
    const blob=await verifiedPreviewBlob(response("synthetic image",mime),mime);
    expect(blob.type).toBe(mime);expect(await blob.text()).toBe("synthetic image");
  });
  it("does not enable arbitrary HTML or office files in the native preview",async()=>{
    expect(supportsDocumentPreview("text/html")).toBe(false);
    expect(supportsDocumentPreview("application/msword")).toBe(false);
    await expect(verifiedPreviewBlob(response("<html>","text/html"),"text/html")).rejects.toThrow();
  });
});
