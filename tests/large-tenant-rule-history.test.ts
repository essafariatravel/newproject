import {describe,it,expect,vi} from "vitest";
import {eq} from "drizzle-orm";
import {suiteSetup} from "./helpers/global-state";
import {userByEmail} from "./helpers/fixtures";
import {db,pool} from "@/lib/db";
import {applications,visaTypes} from "@/db/schema";
import {createDraftApplication} from "@/lib/applications";
import {searchApplications,listCommunications,listNotificationsForUser,recentCommunications,listAuditLogs} from "@/lib/queries";
suiteSetup();
describe("large tenant and historical rule provenance",()=>{
  it("does not apply future or expired configuration to a new dossier",async()=>{
    const actor=await userByEmail("a-admin@test.example");const visa=(await db.select().from(visaTypes).limit(1))[0]!;
    try{
      for(const evidence of [{effectiveFrom:"2999-01-01"},{effectiveTo:"2000-01-01"}]){
        await db.update(visaTypes).set({ruleGovernance:evidence}).where(eq(visaTypes.id,visa.id));
        await expect(createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor})).rejects.toMatchObject({code:"RULE_NOT_EFFECTIVE"});
      }
    }finally{await db.update(visaTypes).set({ruleGovernance:{}}).where(eq(visaTypes.id,visa.id));}
  });
  it("invalidates review evidence when material rules change",async()=>{
    const actor=await userByEmail("a-admin@test.example");const visa=(await db.select().from(visaTypes).limit(1))[0]!;
    const review={state:"ACTIVE",reviewedAt:new Date().toISOString(),reviewerId:actor.id,officialSource:"https://official.example/visa"};
    await db.update(visaTypes).set({ruleGovernance:review}).where(eq(visaTypes.id,visa.id));
    const reviewed=await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor});
    expect(reviewed.visaRuleSnapshot?.governance).toMatchObject(review);
    await pool.query("update visa_types set fee=fee+1 where id=$1",[visa.id]);
    const changed=await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor});
    expect(changed.visaRuleSnapshot?.governance).toMatchObject({state:"STALE"});
    expect(changed.visaRuleSnapshot?.governance).not.toHaveProperty("reviewedAt");
    await db.update(visaTypes).set({ruleGovernance:review}).where(eq(visaTypes.id,visa.id));
    await pool.query("update visa_requirements set notes='Synthetic changed requirement' where visa_type_id=$1",[visa.id]);
    expect((await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor})).visaRuleSnapshot?.governance).toMatchObject({state:"STALE"});
    expect((await db.select().from(applications).where(eq(applications.id,reviewed.id)))[0]!.visaRuleSnapshot?.governance).toMatchObject(review);
  });
  it("retains immutable rule evidence across configuration changes",async()=>{
    const actor=await userByEmail("a-admin@test.example");const visa=(await db.select().from(visaTypes).limit(1))[0]!;
    await db.update(visaTypes).set({ruleGovernance:{state:"UNVERIFIED",officialSource:null,nationalityApplicability:["DZA"]}}).where(eq(visaTypes.id,visa.id));
    const app=await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor});
    expect(app.visaRuleSnapshot).toMatchObject({programmeId:visa.id,governance:{state:"UNVERIFIED",nationalityApplicability:["DZA"]}});
    await db.update(visaTypes).set({ruleGovernance:{state:"STALE"}}).where(eq(visaTypes.id,visa.id));
    const [old]=await db.select().from(applications).where(eq(applications.id,app.id));
    expect(old!.visaRuleSnapshot).toEqual(app.visaRuleSnapshot);
    await expect(pool.query("update applications set visa_rule_snapshot='{}' where id=$1",[app.id])).rejects.toThrow("immutable");
    const [current]=await db.select().from(visaTypes).where(eq(visaTypes.id,visa.id));
    expect(current!.ruleVersion).toBeGreaterThan(Number(app.visaRuleSnapshot?.version));
  });
  it("serves bounded stable reads with 50,000 dossiers and long histories",async()=>{
    const actor=await userByEmail("a-admin@test.example");const foreign=await userByEmail("b-admin@test.example");const staff=await userByEmail("superadmin@test.example");
    const visa=(await db.select().from(visaTypes).limit(1))[0]!;const app=await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor});
    await pool.query(`insert into applications(reference,agency_id,visa_type_id,country_id,status_id,priority_id,visa_type_name,visa_type_code,category_name,country_name,fee,currency,processing_min_days,processing_max_days,created_by,created_at)
      select 'SYN-LARGE-'||n,a.agency_id,a.visa_type_id,a.country_id,a.status_id,a.priority_id,a.visa_type_name,a.visa_type_code,a.category_name,a.country_name,a.fee,a.currency,a.processing_min_days,a.processing_max_days,a.created_by,'2026-01-01'::timestamptz
      from applications a cross join generate_series(1,50000) n where a.id=$1`,[app.id]);
    await pool.query("insert into communications(application_id,author_id,body,visibility) select $1,$2,'Synthetic bounded history','AGENCY' from generate_series(1,5000)",[app.id,actor.id]);
    await pool.query("insert into notifications(user_id,type,title,body) select $1,'MESSAGE_POSTED','Synthetic notification','Synthetic safe body' from generate_series(1,5000)",[actor.id]);
    await pool.query("insert into audit_logs(actor_id,action,entity,entity_id) select $1::uuid,'SYNTHETIC_HISTORY','user',$1::uuid::text from generate_series(1,5000)",[staff.id]);
    await pool.query("analyze applications; analyze communications; analyze notifications; analyze audit_logs");
    const first=await searchApplications(actor,{statusCode:"DRAFT",pageSize:100});const next=await searchApplications(actor,{statusCode:"DRAFT",pageSize:100,page:2});
    expect(first.total).toBeGreaterThanOrEqual(50001);expect(first.rows).toHaveLength(100);expect(first.pageCount).toBe(Math.ceil(first.total/100));
    const ids=new Set(first.rows.map(row=>row.app.id));expect(next.rows.every(row=>!ids.has(row.app.id))).toBe(true);
    expect((await searchApplications(foreign,{statusCode:"DRAFT",agencyId:actor.agencyId!})).total).toBe(0);
    expect((await searchApplications(actor,{statusCode:"DRAFT",q:"SYN-LARGE-",pageSize:100})).rows).toHaveLength(100);
    // EXPLAIN the actual wide read, rather than a simplified ID-only query.
    // Detail projections must run only for the returned page, not OFFSET rows.
    const querySpy=vi.spyOn(pool,"query");
    let deepSql:string|undefined,deepParams:unknown[]=[];
    try{
      const deep=await searchApplications(staff,{statusCode:"DRAFT",pageSize:100,page:450});
      expect(deep.rows).toHaveLength(100);
      // pg's overloaded query signature reports only its last overload to the
      // spy type. Inspect the actual captured driver arguments as unknowns.
      const calls=querySpy.mock.calls as unknown as Array<[unknown,unknown]>;
      const call=calls.find(([query])=>typeof query==="object"&&query!==null&&"text" in query&&String(query.text).startsWith("select ")&&String(query.text).includes(" offset "));
      if(call&&typeof call[0]==="object"&&call[0]!==null&&"text" in call[0]){
        deepSql=String(call[0].text);deepParams=Array.isArray(call[1])?call[1]:[];
      }
      expect((await searchApplications(staff,{statusCode:"DRAFT",pageSize:100,page:450})).rows.map(r=>r.app.id)).toEqual(deep.rows.map(r=>r.app.id));
    }finally{querySpy.mockRestore();}
    expect(deepSql).toBeTruthy();
    const fullPlan=await pool.query("explain (analyze,buffers,format json) "+deepSql,deepParams);
    type PlanNode={"Relation Name"?:string;"Actual Loops"?:number;Plans?:PlanNode[]};
    const detailRelations=new Set(["visa_types","applicants","documents","agencies","countries","application_status_history","users","document_requests"]);
    const detailLoops:number[]=[];
    function visit(node:PlanNode){if(detailRelations.has(node["Relation Name"]??""))detailLoops.push(node["Actual Loops"]??0);for(const child of node.Plans??[])visit(child);}
    visit(fullPlan.rows[0]["QUERY PLAN"][0].Plan as PlanNode);
    expect(detailLoops.length).toBeGreaterThan(0);
    expect(Math.max(...detailLoops)).toBeLessThanOrEqual(100);
    expect(await listCommunications(app.id,actor)).toHaveLength(50);expect(await listNotificationsForUser(actor.id,50000)).toHaveLength(100);
    expect(await recentCommunications(50000,{agencyId:actor.agencyId,agencyVisibleOnly:true})).toHaveLength(100);
    expect((await listAuditLogs({pageSize:100})).rows.length).toBeLessThanOrEqual(100);
    const explain=await pool.query("explain (analyze,buffers,format json) select id from communications where application_id=$1 order by created_at desc,id desc limit 50",[app.id]);
    expect(JSON.stringify(explain.rows)).toContain("communications_history_cursor_idx");
  },120_000);
});
