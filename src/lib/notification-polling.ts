/** One owned request at a time; polling never weakens session/API controls. */
export function startNotificationPolling<T>(publish:(payload:T)=>void):()=>void {
 let stopped=false,inFlight=false,failures=0,retryAt=0;
 let timer:ReturnType<typeof setTimeout>|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
 let controller:AbortController|undefined;
 function schedule(){
  if(stopped||inFlight||document.visibilityState!=='visible')return;
  clearTimeout(timer);timer=setTimeout(()=>{void poll();},Math.max(0,retryAt-Date.now()));
 }
 function stop(){
  stopped=true;clearTimeout(timer);clearTimeout(timeout);controller?.abort();
  document.removeEventListener('visibilitychange',visibilityChanged);
 }
 function visibilityChanged(){
  clearTimeout(timer);
  if(document.visibilityState!=='visible'){controller?.abort();return;}
  schedule();
 }
 async function poll(){
  if(stopped||inFlight||document.visibilityState!=='visible')return;
  inFlight=true;const request=new AbortController();controller=request;
  // Aborting the browser request does not claim cancellation of server SQL.
  timeout=setTimeout(()=>request.abort(),20_000);
  try{
   const response=await fetch('/api/notifications',{cache:'no-store',signal:request.signal});
   if(stopped||request.signal.aborted)return;
   if(response.status===401||response.status===403){stop();return;}
   if(!response.ok){failures++;return;}
   const data=await response.json() as T;
   if(!stopped&&!request.signal.aborted){publish(data);failures=0;}
  }catch{if(!stopped&&document.visibilityState==='visible')failures++;}
  finally{
   clearTimeout(timeout);controller=undefined;inFlight=false;
   retryAt=Date.now()+15_000*2**Math.min(failures,3);schedule();
  }
 }
 document.addEventListener('visibilitychange',visibilityChanged);void poll();return stop;
}
