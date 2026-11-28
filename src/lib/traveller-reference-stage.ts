import "server-only";
import {AppError,type AuthUser} from "@/lib/types";
import {repeatSource} from "@/lib/traveller-hub";
import {vaultRead} from "@/lib/traveller-vault";
import {vaultEnabled} from "@/lib/traveller-hub-policy";
import {getDocumentForUser} from "@/lib/documents";
import {storageProvider} from "@/lib/storage";
import {assertStoredFileIntegrity,sha256Hex} from "@/lib/file-integrity";
import {recordAuditStrict} from "@/lib/audit";
import {db} from "@/lib/db";
import {currentOperationActor} from "@/lib/operation-identity";
import {stageRequestUpload} from "@/lib/request-uploads";
export async function stageTravellerReference(actor:AuthUser&{agencyId:string},input:{profileId:string;documentId:string;vault:boolean;sha256:string;attempt:string;visaTypeId:string;documentTypeId:string;slot:number}){
 if(!vaultEnabled())throw new AppError("FORBIDDEN","Unavailable");
 const source=await repeatSource(actor,input.profileId);
 const option=source?.reusable.find(d=>d.id===input.documentId&&Boolean(d.vault)===input.vault&&d.typeId===input.documentTypeId&&(!d.tripSpecific||d.programmeId===input.visaTypeId));
 if(!option)throw new AppError("TRAVELLER_CHANGED","Document changed");
 let data:Buffer;
 if(input.vault){const r=await vaultRead(actor,input.profileId,input.documentId,true);if(r.typeId!==input.documentTypeId||r.filename!==option.name||r.mime!==option.mime)throw new AppError("TRAVELLER_CHANGED","Document changed");data=r.data}
 else{
 const row=await getDocumentForUser(input.documentId,actor);
 if(row.appAgencyId!==actor.agencyId||row.doc.documentTypeId!==option.typeId||row.doc.originalFilename!==option.name||row.doc.mimeType!==option.mime||row.doc.sizeBytes!==option.size)throw new AppError("TRAVELLER_CHANGED","Document changed");
 data=(await storageProvider().get(row.doc.storageKey)).data;assertStoredFileIntegrity({data,expectedSizeBytes:row.doc.sizeBytes,expectedSha256:row.doc.sha256});
 await db.transaction(async tx=>{const active=await currentOperationActor(tx,actor,"read");await recordAuditStrict({actor:active,agencyId:actor.agencyId,action:"TRAVELLER_DOCUMENT_REUSED",entity:"document",entityId:input.documentId,metadata:{profileId:input.profileId,integrity:"VERIFIED"}},tx)});
 }
 if(data.length!==option.size||sha256Hex(data)!==input.sha256)throw new AppError("TRAVELLER_CHANGED","Document changed after review");
 return stageRequestUpload({actor,attempt:input.attempt,visaTypeId:input.visaTypeId,documentTypeId:input.documentTypeId,slot:input.slot,file:{name:option.name,type:option.mime,size:data.length,data}});
}
