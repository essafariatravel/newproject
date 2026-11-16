import {describe,it,expect} from 'vitest';
import {db,pool} from '@/lib/db';
import {currentOperationActor,currentOperationActorPg} from '@/lib/operation-identity';
import {lockIdentityState} from '@/lib/account-security';
import {suiteSetup} from './helpers/global-state';
import {userByEmail,registrationData,registrationPdf,nextIp} from './helpers/fixtures';
import {submitAgencyRegistration,approveRegistration} from '@/lib/registrations';
import type {AuthUser} from '@/lib/types';
suiteSetup();
function latch(){let release!:()=>void;return{promise:new Promise<void>(resolve=>release=resolve),release:()=>release()};}
async function holdReader(mode:'drizzle'|'native',actor:AuthUser){
 const ready=latch(),hold=latch();
 const operation=mode==='drizzle'?db.transaction(async tx=>{await currentOperationActor(tx,actor,'read');ready.release();await hold.promise;}):(async()=>{const client=await pool.connect();try{await client.query('begin');await currentOperationActorPg(client,actor,'read');ready.release();await hold.promise;await client.query('commit');}catch(error){await client.query('rollback');throw error;}finally{client.release();}})();
 void operation.catch(()=>ready.release());await ready.promise;return{release:hold.release,operation};
}
async function completesBeforeRelease(operation:Promise<unknown>){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation.then(()=>true),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),750);})]);}finally{if(timer)clearTimeout(timer);}}
describe.each(['drizzle','native'] as const)('identity readers and exclusive credential writers: %s',mode=>{
 it('allows independent identity validations to overlap',async()=>{
  const first=await holdReader(mode,await userByEmail('b-admin@test.example'));
  const second=holdReader(mode,await userByEmail('a-admin@test.example'));let held:Awaited<ReturnType<typeof holdReader>>|undefined;
  try{expect(await completesBeforeRelease(second.then(value=>{held=value;}))).toBe(true);}
  finally{first.release();await first.operation;held??=await second;held.release();await held.operation;}
 });
 it('keeps identity mutations exclusive until the operation commits',async()=>{
  const actor=await userByEmail('b-user@test.example'),first=await holdReader(mode,actor),entered=latch();
  const writer=db.transaction(async tx=>{await lockIdentityState(tx);entered.release();});
  try{expect(await completesBeforeRelease(entered.promise)).toBe(false);}
  finally{first.release();await Promise.all([first.operation,writer]);}
 });
 it('waits for an existing credential writer then rejects the stale actor',async()=>{
  const actor=await userByEmail('a-user@test.example'),client=await pool.connect();let operation:Promise<unknown>|undefined;
  const version=(await client.query('select credential_version from users where id=$1',[actor.id])).rows[0].credential_version;
  try{
   await client.query('begin');await client.query('select pg_advisory_xact_lock(1163087699)');
   const captured={...actor,credentialVersion:version};
   operation=mode==='drizzle'?db.transaction(tx=>currentOperationActor(tx,captured,'read')):(async()=>{const reader=await pool.connect();try{await reader.query('begin');return await currentOperationActorPg(reader,captured,'read');}finally{await reader.query('rollback');reader.release();}})();
   void operation.catch(()=>{});expect(await completesBeforeRelease(operation.catch(()=>{}))).toBe(false);
   await client.query('update users set credential_version=credential_version+1 where id=$1',[actor.id]);await client.query('commit');
   await expect(operation).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  }finally{await client.query('rollback');client.release();await operation?.catch(()=>{});}
 });
});
it('keeps registration account creation exclusive against active identity readers',async()=>{
 const actor=await userByEmail('superadmin@test.example');
 const registration=await submitAgencyRegistration({data:registrationData(),files:[registrationPdf()],ipAddress:nextIp()});
 const held=await holdReader('native',actor),approval=approveRegistration({registrationId:registration.id,actor});
 try{expect(await completesBeforeRelease(approval)).toBe(false);}
 finally{held.release();await Promise.all([held.operation,approval]);}
});
