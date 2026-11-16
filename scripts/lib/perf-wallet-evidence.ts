import type {Pool} from 'pg';

/** Read-only evidence for an actual HTTP response, never a direct SQL charge. */
export async function verifyPerfWalletSubmission(pool:Pick<Pool,'query'>,input:{applicationId:string;agencyId:string;actorId:string;attempt:string;seen:Set<string>}):Promise<{n:number;amount:string}>{
  if(input.seen.has(input.applicationId))throw Error('WALLET_SHARED_APPLICATION');
  const row=(await pool.query(`select a.agency_id,a.created_by,a.idempotency_key,
    count(t.id)::int n,coalesce(sum(t.amount),0)::text amount,
    bool_and(t.agency_id=a.agency_id and t.actor_id=a.created_by and t.currency=a.submitted_currency) valid_ledger,
    coalesce(sum(t.amount),0)=a.submitted_price correct_price
    from public.applications a left join public.wallet_transactions t on t.application_id=a.id and t.type='APPLICATION_CHARGE'
    where a.id=$1 group by a.id`,[input.applicationId])).rows[0];
  if(!row||row.agency_id!==input.agencyId||row.created_by!==input.actorId||row.idempotency_key!==input.attempt||
     row.n!==1||row.valid_ledger!==true||row.correct_price!==true)throw Error('WALLET_TENANT_OR_ATTEMPT_MISMATCH');
  input.seen.add(input.applicationId);
  return {n:row.n,amount:row.amount};
}
