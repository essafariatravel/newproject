/** Small, format-valid receipt fixture; no file or balance behavior is mocked. */
export function paymentProof() {
  const data = Buffer.from("%PDF-1.7\nESSAFARIA bank transfer receipt fixture\n%%EOF\n");
  return { name: "transfer-receipt.pdf", type: "application/pdf", size: data.length, data };
}
