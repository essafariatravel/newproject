// Only a verified, browser-supported response can become a preview object URL.
const PREVIEW_TYPES = ["application/pdf","image/jpeg","image/png","image/webp"] as const;
export function supportsDocumentPreview(mime: string): boolean {
  return (PREVIEW_TYPES as readonly string[]).includes(mime);
}
export async function verifiedPreviewBlob(response: Response, expectedMime: string): Promise<Blob> {
  if (!response.ok || !supportsDocumentPreview(expectedMime)) throw new Error("preview");
  const blob = await response.blob();
  if (blob.size === 0 || blob.type.split(";")[0] !== expectedMime) throw new Error("mime");
  if (expectedMime === "application/pdf") {
    // Do not navigate an unrestricted native PDF frame to arbitrary HTML or a server URL.
    const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (header.length !== 5 || ![37,80,68,70,45].every((byte,index)=>header[index]===byte)) throw new Error("pdf-signature");
    return new Blob([blob], {type:"application/pdf"});
  }
  return blob;
}
