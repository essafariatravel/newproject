/** Stage at most two independent files in flight. Drain all started jobs on
 * failure before releasing the submit lock; preserve input order for commit.
 * The server's existing quota lock, validation and idempotency stay authoritative.
 */
export async function runBoundedUploads<T,R>(jobs:readonly T[],concurrency:number,stage:(job:T,index:number)=>Promise<R>):Promise<R[]> {
 const limit=Number.isFinite(concurrency)?Math.max(1,Math.min(2,Math.floor(concurrency))):1;
 const output=new Array<R>(jobs.length);
 let next=0,failed=false,firstError:unknown;
 async function worker(){
  while(!failed&&next<jobs.length){
   const index=next++;
   try{output[index]=await stage(jobs[index]!,index)}
   catch(error){if(!failed){failed=true;firstError=error}}
  }
 }
 await Promise.all(Array.from({length:Math.min(limit,jobs.length)},()=>worker()));
 if(failed)throw firstError;
 return output;
}
