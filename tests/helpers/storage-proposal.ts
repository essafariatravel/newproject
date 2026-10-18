import type {Pool} from 'pg';
/** Only the explicitly installed disposable proposal, never application data. */
export async function removeStorageProposal(pool:Pool){
 await pool.query(`drop trigger if exists document_retention_pending_documents on public.documents;
 drop trigger if exists document_retention_pending_blobs on public.document_blobs;
 drop trigger if exists document_retention_pending_case on public.applications;
 drop table if exists public.document_retention_jobs,public.storage_operation_events,public.storage_operations;
 drop function if exists public.protect_pending_document_retention(),public.reject_retention_job_mutation(),public.reject_storage_operation_identity_mutation(),public.reject_storage_operation_event_mutation()`);
}
