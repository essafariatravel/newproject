/** One heartbeat per active tab per minute, never overlapping in flight. */
export function startPresenceHeartbeat(onOnline:(online:number)=>void,onUnavailable:()=>void):()=>void {
  let stopped=false;
  let inFlight=false;
  let lastBeatAt=-Infinity;
  let controller:AbortController|undefined;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  async function beat(){
    if(stopped||inFlight||document.visibilityState!=="visible"||Date.now()-lastBeatAt<60_000)return;
    inFlight=true;
    lastBeatAt=Date.now();
    const request=new AbortController();controller=request;
    timeout=setTimeout(()=>request.abort(),20_000);
    try{
      const response=await fetch("/api/presence",{method:"POST",cache:"no-store",signal:request.signal});
      if(stopped)return;
      if(!response.ok){onUnavailable();return;}
      const data=await response.json();
      if(!stopped&&typeof data.online==="number")onOnline(data.online);
    }catch{if(!stopped)onUnavailable();}
    finally{clearTimeout(timeout);controller=undefined;inFlight=false;}
  }
  const visible=()=>{if(document.visibilityState!=="visible"){controller?.abort();return;}void beat();};
  void beat();
  const timer=setInterval(visible,60_000);
  document.addEventListener("visibilitychange",visible);
  return()=>{stopped=true;clearInterval(timer);clearTimeout(timeout);controller?.abort();document.removeEventListener("visibilitychange",visible);};
}
