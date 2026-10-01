"use client";
import { useEffect } from "react";
import { touchSessionAction } from "@/app/actions/auth";

/** Real interaction renews idle expiry; background presence/polls never do. */
export function SessionActivity() {
  useEffect(()=>{
    let sentAt=0;
    let pending=false;
    const expire=()=>window.location.assign("/login?reason=session-expired");
    const activity=(event:Event)=>{
      if (!event.isTrusted || pending || Date.now()-sentAt<60_000) return;
      pending=true; sentAt=Date.now();
      void touchSessionAction().then(result=>{if(result.expired) expire();}).catch(()=>{}).finally(()=>{pending=false;});
    };
    const check=()=>{void fetch("/api/session",{cache:"no-store"}).then(response=>{if(response.status===401) expire();}).catch(()=>{});};
    for(const event of ["pointerdown","keydown","scroll"]) window.addEventListener(event,activity,{passive:true});
    const timer=window.setInterval(check,60_000);
    return ()=>{window.clearInterval(timer);for(const event of ["pointerdown","keydown","scroll"]) window.removeEventListener(event,activity);};
  },[]);
  return null;
}
