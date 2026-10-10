import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { nextIp, registrationData, registrationPdf, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { agencyRegistrationDocuments, agencyRegistrationHistory, agencyRegistrations, auditLogs, documentBlobs, users } from "@/db/schema";
import { publishLegalContent } from "@/lib/legal";
import { submitAgencyRegistration } from "@/lib/registrations";
import * as notifications from "@/lib/notifications";
import * as nextHeaders from "next/headers";
import { submitRegistrationAction } from "@/app/actions/registrations";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import type { UiLocale } from "@/lib/ui-i18n";
import { Client } from "pg";
import { testConnectionString } from "./helpers/pg";

suiteSetup();
afterEach(async () => {
  vi.restoreAllMocks();
  await db.execute(sql`drop trigger if exists integration_audit_failure on audit_logs`);
  await db.execute(sql`drop function if exists integration_audit_failure()`);
});

async function rejectAudit(action: string) {
  // Real PostgreSQL failure proves mutation and audit share their transaction.
  await db.execute(sql`create function integration_audit_failure() returns trigger language plpgsql as $$ begin
    if new.action=TG_ARGV[0] then raise exception 'Test audit unavailable'; end if; return new;
    end $$`);
  await db.execute(sql`create trigger integration_audit_failure before insert on audit_logs for each row execute function integration_audit_failure(${sql.raw(`'${action}'`)})`);
}

async function approvedConsent(locale: UiLocale = "en") {
  const actor = await userByEmail("superadmin@test.example");
  const effectiveAt = new Date("2026-01-01T00:00:00Z");
  const terms = await publishLegalContent({ kind: "terms", locale, body: "TEST ONLY approved terms", effectiveAt, actor });
  const privacy = await publishLegalContent({ kind: "privacy", locale, body: "TEST ONLY approved privacy", effectiveAt, actor });
  return {
    locale,
    terms: { id: terms.id, version: terms.version, effectiveAt: terms.effectiveAt.toISOString() },
    privacy: { id: privacy.id, version: privacy.version, effectiveAt: privacy.effectiveAt.toISOString() },
  };
}

describe("integrated legal authorization and atomic registration audits", () => {
  it.each(["credential", "role", "suspension"] as const)("rejects a captured SUPER_ADMIN after %s revocation", async kind => {
    const actor = await userByEmail("superadmin@test.example");
    const [user] = await db.select().from(users).where(eq(users.id, actor.id));
    const captured = { ...actor, credentialVersion: user!.credentialVersion };
    await db.update(users).set(kind === "credential" ? { credentialVersion: user!.credentialVersion + 1 }
      : kind === "role" ? { role: "ADMIN" } : { status: "SUSPENDED" }).where(eq(users.id, actor.id));
    try {
      await expect(publishLegalContent({ kind: "terms", locale: "fr", body: `TEST ONLY revoked ${kind}`,
        effectiveAt: new Date("2026-01-01"), actor: captured })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect((await db.execute(sql`select id from legal_versions where body=${`TEST ONLY revoked ${kind}`}`)).rows).toHaveLength(0);
      expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "LEGAL_PUBLISHED"))).toHaveLength(0);
    } finally {
      await db.update(users).set({ credentialVersion: user!.credentialVersion, role: user!.role, status: user!.status }).where(eq(users.id, actor.id));
    }
  });

  it.each(["AGENCY_REGISTRATION_SUBMITTED", "TERMS_ACCEPTED", "PRIVACY_NOTICE_ACKNOWLEDGED"])("rolls back registration, history, files and prior audits when %s cannot persist", async action => {
    const consent = await approvedConsent();
    const data = registrationData({ legalConsentVersions: consent });
    const before = await db.select().from(documentBlobs);
    await rejectAudit(action);
    await expect(submitAgencyRegistration({ data, files: [registrationPdf()], ipAddress: nextIp() })).rejects.toMatchObject({ cause: { message: "Test audit unavailable" } });
    expect(await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.email, data.email))).toHaveLength(0);
    expect(await db.select().from(agencyRegistrationDocuments)).toHaveLength(0);
    expect(await db.select().from(agencyRegistrationHistory)).toHaveLength(0);
    expect(await db.select().from(documentBlobs)).toEqual(before);
    expect(await db.select().from(auditLogs).where(sql`${auditLogs.action} in ('AGENCY_REGISTRATION_SUBMITTED','TERMS_ACCEPTED','PRIVACY_NOTICE_ACKNOWLEDGED')`)).toHaveLength(0);
  });

  it("persists all consent identities and PII-minimized audits before returning success", async () => {
    const consent = await approvedConsent();
    const data = registrationData({ legalConsentVersions: consent });
    const result = await submitAgencyRegistration({ data, files: [], ipAddress: nextIp() });
    const [reg] = await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, result.id));
    expect(reg!.legalConsentVersions).toEqual(consent);
    expect(reg!.ipAddress).toBeNull();
    const events = await db.select().from(auditLogs).where(eq(auditLogs.entityId, result.id));
    expect(events.map(event => event.action).sort()).toEqual(["AGENCY_REGISTRATION_SUBMITTED", "PRIVACY_NOTICE_ACKNOWLEDGED", "TERMS_ACCEPTED"]);
    for (const event of events) {
      expect(event.actorId).toBeNull(); expect(event.ipAddress).toBeNull();
      expect(JSON.stringify(event.metadata)).not.toContain(data.email);
      expect(JSON.stringify(event.metadata)).not.toContain(data.legalName);
    }
    expect(events.find(event => event.action === "TERMS_ACCEPTED")!.metadata).toMatchObject({ legalVersionId: consent.terms.id, version: consent.terms.version, effectiveAt: consent.terms.effectiveAt });
    expect(events.find(event => event.action === "PRIVACY_NOTICE_ACKNOWLEDGED")!.metadata).toMatchObject({ legalVersionId: consent.privacy.id, version: consent.privacy.version, effectiveAt: consent.privacy.effectiveAt });
  });

  it("retains committed registration files when staff notification delivery fails", async () => {
    vi.spyOn(notifications, "notifyUsers").mockRejectedValue(new Error("Test delivery unavailable"));
    const file = registrationPdf(), data = registrationData();
    const result = await submitAgencyRegistration({ data, files: [file], ipAddress: nextIp() });
    const [doc] = await db.select().from(agencyRegistrationDocuments).where(eq(agencyRegistrationDocuments.registrationId, result.id));
    const [blob] = await db.select().from(documentBlobs).where(eq(documentBlobs.key, doc!.storageKey));
    expect(blob!.data).toEqual(file.data);
    expect(await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, result.id))).toHaveLength(1);
  });

  it("rejects genuine captured consent when a new effective version is published before persistence", async () => {
    const consent=await approvedConsent(), data=registrationData({legalConsentVersions:consent});
    const beforeDocuments=await db.select().from(agencyRegistrationDocuments), beforeBlobs=await db.select().from(documentBlobs);
    const transaction=db.transaction.bind(db);
    vi.spyOn(db,"transaction").mockImplementationOnce(async (fn,config) => {
      await publishLegalContent({kind:"privacy",locale:"en",body:"TEST ONLY newly effective notice after form validation",
        effectiveAt:new Date("2026-01-02"),actor:await userByEmail("superadmin@test.example")});
      return transaction(fn,config);
    });
    await expect(submitAgencyRegistration({data,files:[registrationPdf()],ipAddress:nextIp()})).rejects.toMatchObject({code:"LEGAL_CHANGED"});
    expect(await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.email,data.email))).toHaveLength(0);
    expect(await db.select().from(agencyRegistrationDocuments)).toEqual(beforeDocuments);
    expect(await db.select().from(documentBlobs)).toEqual(beforeBlobs);
  });

  it.each(["UUID","version","effective date","locale"] as const)("rejects fabricated consent %s before creating a registration or audit", async field => {
    const consent=await approvedConsent();
    if(field==="UUID")consent.terms.id=crypto.randomUUID();
    if(field==="version")consent.terms.version+=1;
    if(field==="effective date")consent.terms.effectiveAt="2026-02-01T00:00:00.000Z";
    const data=registrationData({legalConsentVersions:consent,locale:field==="locale"?"fr":"en"});
    const before=await db.select().from(auditLogs);
    await expect(submitAgencyRegistration({data,files:[],ipAddress:nextIp()})).rejects.toMatchObject({code:"LEGAL_CHANGED"});
    expect(await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.email,data.email))).toHaveLength(0);
    expect(await db.select().from(auditLogs)).toEqual(before);
  });

  it.each(["fr","ar"] as const)("returns %s legal-change feedback when publication changes after public form validation", async locale => {
    const consent=await approvedConsent(locale), data=registrationData({locale,legalConsentVersions:consent});
    const form=new FormData();
    for(const field of ["legalName","contactFirstName","city","phone","email","terms","privacy","accuracy","locale"] as const) form.set(field,data[field]!);
    form.set("renderedAt",String(Date.now()-30_000));
    form.set("termsVersionId",consent.terms.id); form.set("termsVersion",String(consent.terms.version));
    form.set("privacyVersionId",consent.privacy.id); form.set("privacyVersion",String(consent.privacy.version));
    vi.spyOn(nextHeaders,"headers").mockResolvedValue(new Headers({"x-forwarded-for":nextIp()}));
    const transaction=db.transaction.bind(db);
    vi.spyOn(db,"transaction").mockImplementationOnce(async (fn,config) => {
      await publishLegalContent({kind:"terms",locale,body:"TEST ONLY newly effective terms after public validation",
        effectiveAt:new Date("2026-01-02"),actor:await userByEmail("superadmin@test.example")});
      return transaction(fn,config);
    });
    expect(await submitRegistrationAction({},form)).toEqual({error:publicBrandCopy(locale).legalChanged});
    expect(await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.email,data.email))).toHaveLength(0);
  });

  it("accepts the still-effective versions even when a future replacement has been scheduled", async () => {
    const consent=await approvedConsent();
    await publishLegalContent({kind:"terms",locale:"en",body:"TEST ONLY future terms not yet effective",
      effectiveAt:new Date("2099-01-01"),actor:await userByEmail("superadmin@test.example")});
    const data=registrationData({legalConsentVersions:consent});
    const result=await submitAgencyRegistration({data,files:[],ipAddress:nextIp()});
    expect((await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id,result.id)))[0]!.legalConsentVersions).toEqual(consent);
  });

  it("uses the acceptance instant after a real publication-lock wait crosses an effective-date boundary", async () => {
    const consent=await approvedConsent(), actor=await userByEmail("superadmin@test.example");
    const data=registrationData({legalConsentVersions:consent});
    // This independent connection represents the publication transaction.
    // The registration uses the application's separate real transaction client.
    const publisher=new Client({connectionString:testConnectionString()});
    await publisher.connect();
    let pending: Promise<{ error: unknown; result: unknown }> | undefined;
    try {
      await publisher.query("begin");
      const publisherPid=(await publisher.query("select pg_backend_pid() pid")).rows[0].pid as number;
      await publisher.query("select pg_advisory_xact_lock(hashtext($1))",["legal:privacy:en"]);
      let transactionBegan!: (instant:Date)=>void;
      const began=new Promise<Date>(resolve=>{transactionBegan=resolve;});
      const transaction=db.transaction.bind(db);
      vi.spyOn(db,"transaction").mockImplementationOnce(async (fn,config)=>transaction(async tx=>{
        const stamp=await tx.execute(sql`select now() as "begunAt"`);
        const instant=stamp.rows[0]!.begunAt as Date|string;
        transactionBegan(instant instanceof Date?instant:new Date(instant));
        return fn(tx);
      },config));
      pending=submitAgencyRegistration({data,files:[],ipAddress:nextIp()})
        .then(result=>({result,error:null}),error=>({result:null,error}));
      const begunAt=await began;
      let blocked=false;
      for(let attempt=0;attempt<100;attempt++) {
        blocked=(await publisher.query("select exists(select 1 from pg_stat_activity where datname=current_database() and $1::int=any(pg_blocking_pids(pid))) waiting",[publisherPid])).rows[0].waiting as boolean;
        if(blocked)break;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(blocked,"the separate registration connection must actually wait for the publication lock").toBe(true);
      const effectiveAt=new Date(begunAt.getTime()+100);
      const published=await publisher.query(`insert into legal_versions(kind,locale,version,body,effective_at,published_at,author_id)
        select 'privacy','en',coalesce(max(version),0)+1,'TEST ONLY scheduled notice active during registration wait',$1,clock_timestamp(),$2
        from legal_versions where kind='privacy' and locale='en' returning id,version`,[effectiveAt,actor.id]);
      const version=published.rows[0] as {id:string;version:number};
      await publisher.query(`insert into audit_logs(actor_id,actor_email,actor_role,action,entity,entity_id,metadata)
        values($1,$2,$3,'LEGAL_PUBLISHED','legal_version',$4,$5)`,[actor.id,actor.email,actor.role,version.id,
        JSON.stringify({kind:"privacy",locale:"en",version:version.version,effectiveAt:effectiveAt.toISOString()})]);
      // Database time, not a mocked JS clock, crosses the scheduled instant.
      await publisher.query("select pg_sleep(0.2)");
      const releaseAt=(await publisher.query("select clock_timestamp() instant")).rows[0].instant as Date;
      expect(begunAt.getTime()).toBeLessThan(effectiveAt.getTime());
      expect(releaseAt.getTime()).toBeGreaterThanOrEqual(effectiveAt.getTime());
      await publisher.query("commit");
      const outcome=await pending;
      expect(outcome.error).toMatchObject({code:"LEGAL_CHANGED"});
      expect(outcome.result).toBeNull();
      expect(await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.email,data.email))).toHaveLength(0);
    } finally {
      await publisher.query("rollback").catch(()=>{});
      await pending;
      await publisher.end();
    }
  });
});
