import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getSessionUser} from '@/lib/auth';
import {pool} from '@/lib/db';
import {consumeAuthRateLimit} from '@/lib/auth-rate-limit';
import {readRequestBodyLimited} from '@/lib/http-body';
import {createDocumentRetentionService} from '@/lib/document-retention';
import {requireRetentionExecutionTarget} from '@/lib/document-retention-policy';
import {storageOperationsBinding} from '@/lib/storage';
import {AppError} from '@/lib/types';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
const input=z.object({applicationId:z.string().uuid(),manifestHash:z.string().regex(/^[a-f0-9]{64}$/),confirmation:z.literal('DELETE_VISA_DOCUMENTS_AFTER_120_DAYS')}).strict();

/** Operator endpoint; disabled outside the explicit disposable local qualification.
 * An env update cannot authorize hosted retention or a Production migration. */
function localService(){
 if(process.env.DOCUMENT_RETENTION_ENABLED!=='local-qualification')throw new AppError('NOT_FOUND','Unavailable.');
 requireRetentionExecutionTarget({enabled:true,databaseUrl:process.env.DATABASE_URL??'',schema:process.env.DATABASE_SCHEMA??'',vercelEnvironment:process.env.VERCEL_ENV});
 storageOperationsBinding();
 return createDocumentRetentionService(pool,{enabled:true});
}
function failure(error:unknown){
 const code=error instanceof AppError?error.code:error instanceof z.ZodError?'VALIDATION':'SERVICE_UNAVAILABLE';
 const status=code==='NOT_FOUND'?404:code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'?403:code==='RATE_LIMITED'?429:code==='VALIDATION'?400:code.startsWith('RETENTION_')?409:503;
 return NextResponse.json({code},{status,headers});
}
async function owner(){
 const actor=await getSessionUser();
 if(!actor)throw new AppError('UNAUTHENTICATED','Authentication required.');
 if(actor.agencyId||actor.role!=='SUPER_ADMIN'||actor.mustChangePassword||actor.mfaPending)throw new AppError('FORBIDDEN','Not authorized.');
 return actor;
}
export async function GET(request:Request){
 try{
  const service=localService(),actor=await owner();
  if(!await consumeAuthRateLimit('retention-read-user-minute',actor.id,60,60_000))throw new AppError('RATE_LIMITED','Try later.');
  const applicationId=z.string().uuid().parse(new URL(request.url).searchParams.get('applicationId'));
  return NextResponse.json(await service.dryRun(actor,applicationId),{headers});
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 try{
  const service=localService();
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new AppError('FORBIDDEN','Not authorized.');
  const actor=await owner();
  if(!await consumeAuthRateLimit('retention-write-user-minute',actor.id,20,60_000))throw new AppError('RATE_LIMITED','Try later.');
  const raw=await readRequestBodyLimited(request,4096);
  let body:unknown;try{body=JSON.parse(raw.toString('utf8'));}catch{throw new AppError('VALIDATION','Invalid request.');}
  const result=await service.purge(actor,input.parse(body));
  return NextResponse.json(result,{status:result.status==='PENDING'?202:200,headers});
 }catch(error){return failure(error);}
}
