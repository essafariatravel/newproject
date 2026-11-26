import {describe,it,expect} from "vitest";
import {reusableStagingToken,stagingReceiptKey,STAGED_REUSE_MS} from "@/lib/request-upload-retry";
describe("in-memory upload retry receipts",()=>{
 it("only reuses the identical file and expected slot within the bounded lifetime",()=>{
  const file=new File(["data"],"passport.pdf"),replacement=new File(["data"],"passport.pdf");
  const receipt={file,token:"document/0",at:1000};
  expect(reusableStagingToken(receipt,file,"document/0",2000)).toBe("document/0");
  expect(reusableStagingToken(receipt,replacement,"document/0",2000)).toBeNull();
  expect(reusableStagingToken(receipt,file,"document/1",2000)).toBeNull();
  expect(reusableStagingToken(receipt,file,"document/0",1000+STAGED_REUSE_MS)).toBeNull();
  expect(reusableStagingToken(receipt,file,"document/0",999)).toBeNull();
  expect(reusableStagingToken(undefined,file,"document/0",2000)).toBeNull();
 });
 it("isolates programmes, document types and slots",()=>{
  expect(new Set([stagingReceiptKey("visa-a","doc",0),stagingReceiptKey("visa-b","doc",0),stagingReceiptKey("visa-a","doc",1),stagingReceiptKey("visa-a","doc2",0)]).size).toBe(4);
 });
});
