/** In-memory staging receipts only; never persist files or tokens across reloads.
 * Reuse is limited to the same file object, programme, document and slot.
 * The final server commit remains the authority, including after a lost response.
 */
export type StagedReceipt={file:File;token:string;at:number};
export const STAGED_REUSE_MS=5*60*1000;
export function stagingReceiptKey(visaTypeId:string,documentTypeId:string,slot:number){return JSON.stringify([visaTypeId,documentTypeId,slot])}
export function reusableStagingToken(receipt:StagedReceipt|undefined,file:File,expectedToken:string,now=Date.now()){
 if(!receipt||receipt.file!==file||receipt.token!==expectedToken||now<receipt.at||now-receipt.at>=STAGED_REUSE_MS)return null;
 return receipt.token;
}
