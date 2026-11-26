import {createHash} from "node:crypto";
type Programme={fee:string;minDays:number;maxDays:number};
type Requirement={documentTypeId:string;name:string;nameFr?:string|null;nameAr?:string|null;code:string;required:boolean;sortOrder:number;notes?:string|null};
/** Compare the exact displayed checklist, independent of row order and language. Not an authorization token. */
export function bookingCatalogueFingerprint(programme:Programme,rows:readonly Requirement[]):string{
 const sorted=rows.map(r=>[r.documentTypeId,r.name,r.nameFr??null,r.nameAr??null,r.code,r.required,r.sortOrder,r.notes??null]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
 return createHash("sha256").update(JSON.stringify([1,Number(programme.fee),programme.minDays,programme.maxDays,sorted])).digest("hex");
}
