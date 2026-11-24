"use client";
import {useEffect,useRef} from "react";
import {useRouter} from "next/navigation";
export function CaseMessagesRead({id}:{id:string}){
 const router=useRouter(),started=useRef(false);
 useEffect(()=>{const abort=new AbortController();function mark(){if(started.current||document.visibilityState!=="visible")return;started.current=true;void fetch("/api/agency/cases/"+encodeURIComponent(id)+"/messages-read",{method:"POST",cache:"no-store",signal:abort.signal}).then(r=>{if(r.ok&&!abort.signal.aborted)router.refresh();else started.current=false}).catch(()=>{started.current=false})}mark();document.addEventListener("visibilitychange",mark);return()=>{abort.abort();started.current=false;document.removeEventListener("visibilitychange",mark)}},[id,router]);return null
}
