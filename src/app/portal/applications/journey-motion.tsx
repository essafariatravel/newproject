"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
export function JourneyMotion({caseId,status,children}:{caseId:string;status:string;children:ReactNode}){
 const previous=useRef({caseId,status});
 const [changed,setChanged]=useState(false);
 useEffect(()=>{
  const old=previous.current;
  previous.current={caseId,status};
  if(old.caseId!==caseId||old.status===status){setChanged(false);return}
  setChanged(true);
  const timer=window.setTimeout(()=>setChanged(false),420);
  return()=>window.clearTimeout(timer);
 },[caseId,status]);
 return <ol data-testid="application-progress" className="trajectory-stages" data-status-changed={changed}>{children}</ol>
}
