import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { requirePermission } from "@/lib/rbac";
import { AppError,type AuthUser } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";
export type LegalKind="terms"|"privacy";
export interface PublishedLegal { body:string;version:number;publishedAt:Date;authorId:string }
export async function readPublishedLegal(kind:LegalKind,locale:UiLocale):Promise<PublishedLegal|null>{
  const result=await pool.query(`select body,version,published_at as "publishedAt",author_id as "authorId" from ${qualifiedTable("legal_versions")} where kind=$1 and locale=$2 and published_at<=now() order by version desc limit 1`,[kind,locale]);
  return result.rows[0]??null;
}
export async function publishLegalContent(input:{kind:LegalKind;locale:UiLocale;body:string;publishedAt:Date;actor:AuthUser}):Promise<void>{
  requirePermission(input.actor,"cms.manage");
  if(input.actor.agencyId) throw new AppError("FORBIDDEN","Staff access required.");
  if(!["terms","privacy"].includes(input.kind)||!["en","fr","ar"].includes(input.locale)||!input.body.trim()||input.body.length>50_000||!Number.isFinite(input.publishedAt.getTime())||input.publishedAt.getTime()>Date.now()+60_000) throw new AppError("VALIDATION","Supply approved legal content and its actual published date.");
  const client=await pool.connect();
  try{
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))",[`legal:${input.kind}:${input.locale}`]);
    const latest=await client.query(`select body,version from ${qualifiedTable("legal_versions")} where kind=$1 and locale=$2 order by version desc limit 1`,[input.kind,input.locale]);
    if(latest.rows[0]?.body===input.body.trim()){await client.query("commit");return;}
    const version=Number(latest.rows[0]?.version??0)+1;
    await client.query(`insert into ${qualifiedTable("legal_versions")} (kind,locale,version,body,published_at,author_id) values ($1,$2,$3,$4,$5,$6)`,[input.kind,input.locale,version,input.body.trim(),input.publishedAt,input.actor.id]);
    await client.query(`insert into ${qualifiedTable("audit_logs")} (actor_id,actor_email,actor_role,action,entity,metadata) values ($1,$2,$3,'LEGAL_PUBLISHED','legal_version',$4)`,[input.actor.id,input.actor.email,input.actor.role,JSON.stringify({kind:input.kind,locale:input.locale,version,publishedAt:input.publishedAt.toISOString()})]);
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
}
