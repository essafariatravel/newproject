import {randomUUID} from 'node:crypto';
import {beforeAll,describe,expect,it} from 'vitest';
import {pool} from '@/lib/db';
import {createDraftApplication} from '@/lib/applications';
import {userByEmail} from './helpers/fixtures';
import {suiteSetup} from './helpers/global-state';
import {verifyPerfWalletSubmission} from '../scripts/lib/perf-wallet-evidence';
suiteSetup();
const cases:Array<{applicationId:string;agencyId:string;actorId:string;attempt:string}>=[];
beforeAll(async()=>{
  const visa=(await pool.query('select id from visa_types where active order by code limit 1')).rows[0];
  for(const email of ['a-user@test.example','b-admin@test.example']){
    const actor=await userByEmail(email),attempt=randomUUID();
    const app=await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor});
    await pool.query('update applications set idempotency_key=$2,submitted_price=100,submitted_currency=\'DZD\' where id=$1',[app.id,attempt]);
    await pool.query("insert into wallet_transactions(agency_id,application_id,type,amount,currency,balance_before,balance_after,reason,actor_id) values($1,$2,'APPLICATION_CHARGE',100,'DZD',1000,900,'Synthetic verification fixture',$3)",[actor.agencyId,app.id,actor.id]);
    cases.push({applicationId:app.id,agencyId:actor.agencyId!,actorId:actor.id,attempt});
  }
});
describe('tenant-bound actual submission evidence',()=>{
  it('accepts a matching independently owned dossier and debit',async()=>{
    expect(await verifyPerfWalletSubmission(pool,{...cases[0]!,seen:new Set()})).toEqual({n:1,amount:'100.00'});
  });
  it('rejects swapped equal-priced application IDs between agencies',async()=>{
    await expect(verifyPerfWalletSubmission(pool,{...cases[0]!,applicationId:cases[1]!.applicationId,seen:new Set()})).rejects.toThrow('WALLET_TENANT_OR_ATTEMPT');
  });
  it('rejects the wrong attempt even for the right agency',async()=>{
    await expect(verifyPerfWalletSubmission(pool,{...cases[0]!,attempt:randomUUID(),seen:new Set()})).rejects.toThrow('WALLET_TENANT_OR_ATTEMPT');
  });
  it('rejects a dossier shared between distinct participant evidence entries',async()=>{
    const seen=new Set<string>();await verifyPerfWalletSubmission(pool,{...cases[0]!,seen});
    await expect(verifyPerfWalletSubmission(pool,{...cases[0]!,seen})).rejects.toThrow('WALLET_SHARED_APPLICATION');
  });
  it('rejects a debit recorded against another agency despite the same amount',async()=>{
    const actor=await userByEmail('a-user@test.example'),attempt=randomUUID();
    const visa=(await pool.query('select id from visa_types where active order by code limit 1')).rows[0];
    const app=await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor});
    await pool.query("update applications set idempotency_key=$2,submitted_price=100,submitted_currency='DZD' where id=$1",[app.id,attempt]);
    // Insert an intentionally misattributed synthetic entry; never disable the
    // ledger's UPDATE/DELETE immutability guard to arrange this regression.
    await pool.query("insert into wallet_transactions(agency_id,application_id,type,amount,currency,balance_before,balance_after,reason,actor_id) values($1,$2,'APPLICATION_CHARGE',100,'DZD',1000,900,'Synthetic misattribution fixture',$3)",[cases[1]!.agencyId,app.id,actor.id]);
    await expect(verifyPerfWalletSubmission(pool,{applicationId:app.id,agencyId:actor.agencyId!,actorId:actor.id,attempt,seen:new Set()})).rejects.toThrow('WALLET_TENANT_OR_ATTEMPT');
  });
});
