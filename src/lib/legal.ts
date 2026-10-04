import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { requirePermission } from "@/lib/rbac";
import { AppError,type AuthUser } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";
import { recordAuditPg } from "@/lib/audit";
import { currentOperationActorPg } from "@/lib/operation-identity";
export type LegalKind="terms"|"privacy";
export interface PublishedLegal { body:string;version:number;publishedAt:Date;authorId:string }
export async function readPublishedLegal(kind:LegalKind,locale:UiLocale):Promise<PublishedLegal|null>{
  const result=await pool.query(`select body,version,published_at as "publishedAt",author_id as "authorId" from ${qualifiedTable("legal_versions")} where kind=$1 and locale=$2 and published_at<=now() order by version desc limit 1`,[kind,locale]);
  return result.rows[0]??null;
}
export interface LegalPublication {kind:LegalKind;locale:UiLocale;body:string;publishedAt:Date;actor:AuthUser}
export async function publishLegalContent(input:LegalPublication):Promise<void>{
  await publishLegalContents([input]);
}
/** One editor save creates its immutable versions and audits atomically. */
export async function publishLegalContents(inputs:LegalPublication[]):Promise<void>{
  const publications=[...inputs].sort((a,b)=>`${a.kind}:${a.locale}`.localeCompare(`${b.kind}:${b.locale}`));
  if (!publications.length || new Set(publications.map(p=>`${p.kind}:${p.locale}`)).size !== publications.length) throw new AppError("VALIDATION","Supply approved legal content and its actual published date.");
  for (const input of publications) {
    requirePermission(input.actor,"cms.manage");
    if(input.actor.agencyId) throw new AppError("FORBIDDEN","Staff access required.");
    if(!["terms","privacy"].includes(input.kind)||!["en","fr","ar"].includes(input.locale)||!input.body.trim()||input.body.length>50_000||!Number.isFinite(input.publishedAt.getTime())||input.publishedAt.getTime()>Date.now()) throw new AppError("VALIDATION","Supply approved legal content and its actual published date.");
  }
  const client=await pool.connect();
  try{
    await client.query("begin");
    for (const input of publications) {
      input.actor = await currentOperationActorPg(client,input.actor);
      await client.query("select pg_advisory_xact_lock(hashtext($1))",[`legal:${input.kind}:${input.locale}`]);
      const latest=await client.query(`select body,version from ${qualifiedTable("legal_versions")} where kind=$1 and locale=$2 order by version desc limit 1`,[input.kind,input.locale]);
      if(latest.rows[0]?.body===input.body.trim()) continue;
      const version=Number(latest.rows[0]?.version??0)+1;
      await client.query(`insert into ${qualifiedTable("legal_versions")} (kind,locale,version,body,published_at,author_id) values ($1,$2,$3,$4,$5,$6)`,[input.kind,input.locale,version,input.body.trim(),input.publishedAt,input.actor.id]);
      await recordAuditPg(client,{actor:input.actor,action:"LEGAL_PUBLISHED",entity:"legal_version",metadata:{kind:input.kind,locale:input.locale,version,publishedAt:input.publishedAt.toISOString()}});
    }
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
}
