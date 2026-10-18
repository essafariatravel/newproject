import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {suiteSetup} from './helpers/global-state';
import {userByEmail as fixtureUser} from './helpers/fixtures';
import {pool} from '@/lib/db';
import {coalesceVisaSubmission} from '@/lib/requests';
import {createSession} from '@/lib/auth';
import {hashToken} from '@/lib/crypto';
import {revokeSession} from '@/lib/session-security';
suiteSetup();
async function userByEmail(email:string){
 const actor=await fixtureUser(email);
 const row=(await pool.query('select credential_version from users where id=$1',[actor.id])).rows[0];
 const {token}=await createSession(actor.id);
 const session=(await pool.query('select id from sessions where token_hash=$1',[hashToken(token)])).rows[0];
 return {...actor,credentialVersion:row.credential_version as number,sessionId:session.id as string};
}
describe('bounded same-actor HTTP submission coalescing',()=>{
 it('rejects an unversioned captured identity before executing work',async()=>{
  const actor=await fixtureUser('b-admin@test.example');let called=false;
  await expect(coalesceVisaSubmission(actor,randomUUID(),async()=>{called=true;return 'id';})).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  expect(called).toBe(false);
 });
 it('executes one upload/submission callback for concurrent retries, then permits later retries',async()=>{
  const actor=await userByEmail('b-admin@test.example'),attempt=randomUUID();let calls=0;
  const submit=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,30));return 'opaque-application-id';};
  const results=await Promise.all(Array.from({length:25},()=>coalesceVisaSubmission(actor,attempt,submit)));
  expect(calls).toBe(1);expect(new Set(results).size).toBe(1);await coalesceVisaSubmission(actor,attempt,submit);expect(calls).toBe(2);
 });
 it('does not share work across identities or leave a poisoned result after failure',async()=>{
  const first=await userByEmail('b-admin@test.example'),other=await userByEmail('b-user@test.example'),attempt=randomUUID();let calls=0;
  const submit=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return randomUUID();};
  const results=await Promise.all([coalesceVisaSubmission(first,attempt,submit),coalesceVisaSubmission(other,attempt,submit)]);expect(calls).toBe(2);expect(results[0]).not.toBe(results[1]);
  await expect(coalesceVisaSubmission(first,attempt,async()=>{throw Error('fictional failure');})).rejects.toThrow('fictional failure');
  expect(await coalesceVisaSubmission(first,attempt,async()=>'retry-success')).toBe('retry-success');
 });
 it('revalidates every waiter after revocation while the shared operation was pending',async()=>{
  const actor=await userByEmail('a-user@test.example');let release!:()=>void,started!:()=>void;
  const ready=new Promise<void>(resolve=>started=resolve),hold=new Promise<void>(resolve=>release=resolve);
  const pending=coalesceVisaSubmission(actor,randomUUID(),async()=>{started();await hold;return 'opaque-id';});
  await ready;await pool.query('update users set credential_version=credential_version+1 where id=$1',[actor.id]);release();
  await expect(pending).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 });
 it('rejects only the individually revoked session while the live session receives the shared result',async()=>{
  const live=await userByEmail('b-admin@test.example'),revoked=await userByEmail('b-admin@test.example'),attempt=randomUUID();
  let release!:()=>void,started!:()=>void,calls=0;
  const ready=new Promise<void>(resolve=>started=resolve),hold=new Promise<void>(resolve=>release=resolve);
  const submit=async()=>{calls++;started();await hold;return 'shared-id';};
  const accepted=coalesceVisaSubmission(live,attempt,submit);
  const denied=coalesceVisaSubmission(revoked,attempt,submit).then(()=>null,error=>error);
  await ready;await revokeSession(live,revoked.sessionId);release();
  expect(await accepted).toBe('shared-id');expect(await denied).toMatchObject({code:'UNAUTHENTICATED'});expect(calls).toBe(1);
 });
});
