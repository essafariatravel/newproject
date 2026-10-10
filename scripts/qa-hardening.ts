/** Synthetic QA only; never seed remote or production databases. */
import path from "node:path";
import { eq } from "drizzle-orm";
import { db,pool } from "../src/lib/db";
import { applicants,communications,notifications,visaTypes } from "../src/db/schema";
import { applyMigrations } from "./lib/migrations";
import { seedFixtures,userByEmail,agencyByEmail } from "../tests/helpers/fixtures";
import { createDraftApplication,getChecklist,submitApplication,changeApplicationStatus } from "../src/lib/applications";
import { uploadDocument } from "../src/lib/documents";
import { requestDocumentReplacement } from "../src/lib/document-requests";
import { adjustWallet } from "../src/lib/wallet";
import { qualifiedTable } from "../src/lib/database-schema";
async function main(){
 const connection=new URL(process.env.DATABASE_URL??"");
 if(connection.hostname!=="localhost"||connection.port!=="5434"||connection.pathname!=="/essafaria_hardening_qa"||process.env.VERCEL) throw new Error("QA fixture is restricted to the dedicated disposable local database.");
 await applyMigrations(pool,path.join(process.cwd(),"migrations"));
 const existing=await db.select().from(visaTypes).limit(1);
 if(existing.length) throw new Error("QA database already populated; no reset attempted.");
 const configTables=["status_transitions","statuses","priorities","currencies","visa_requirements","visa_types","visa_categories","document_types","countries"];
 await pool.query(`truncate ${configTables.map(name=>qualifiedTable(name)).join(",")} cascade`);
 await seedFixtures();
 const actor=await userByEmail("a-admin@test.example"),staff=await userByEmail("agent@test.example"),agency=await agencyByEmail("ops@agencya.example"),visa=(await db.select().from(visaTypes).where(eq(visaTypes.code,"FR-SCH-TOUR")))[0]!;
 await adjustWallet({agencyId:agency.id,amount:250000,reason:"Synthetic QA fixture funding",actor:staff});
 for(const name of ["Lina Benali","Yacine Rahmani","Meriem Haddad"]){
  const app=await createDraftApplication({agencyId:agency.id,visaTypeId:visa.id,createdBy:actor});
  await db.insert(applicants).values({applicationId:app.id,fullName:name,firstName:name,lastName:"",nationality:"Algeria"});
  const checklist=await getChecklist(app.id);
  for(const item of checklist.filter(row=>row.required)) await uploadDocument({applicationId:app.id,actor,file:{name:"qa-scan.pdf",type:"application/pdf",size:36,data:Buffer.from("%PDF-1.4\nSYNTHETIC QA SCAN\n%%EOF")},checklistItemId:item.id});
  await submitApplication({applicationId:app.id,actor});
  if(name==="Lina Benali"){
   await changeApplicationStatus({applicationId:app.id,toStatusCode:"DOCUMENTS_CHECKING",actor:staff});
   await requestDocumentReplacement({applicationId:app.id,checklistItemId:checklist[0]!.id,reason:"The passport scan needs a clearer full page.",actor:staff});
  }
  await db.insert(communications).values({applicationId:app.id,authorId:staff.id,visibility:"AGENCY",body:"Your dossier is with the ESSAFARIA team. Reply here if your departure details change."});
  await db.insert(notifications).values({userId:actor.id,agencyId:agency.id,applicationId:app.id,type:"MESSAGE_POSTED",title:"Team reply",body:"Your dossier has a team reply",link:`/portal/applications/${app.id}?tab=communications`});
 }
 console.log("Synthetic local QA ready: Agency Admin, Agency User, Staff and Super Admin; no remote data accessed.");
 await pool.end();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
