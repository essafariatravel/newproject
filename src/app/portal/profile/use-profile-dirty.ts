"use client";
import {useEffect} from "react";
/** Scoped guard for profile drafts. No changes to global navigation or session policies. */
export function useProfileDirty(dirty:boolean,message:string,formId:string){
 useEffect(()=>{
  if(!dirty)return;
  const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=""};
  const click=(e:MouseEvent)=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;const a=e.target instanceof Element?e.target.closest("a[href]"):null;if(!(a instanceof HTMLAnchorElement)||a.target==="_blank"||a.hasAttribute("download"))return;const url=new URL(a.href,location.href);if(url.pathname===location.pathname&&url.search===location.search)return;if(!window.confirm(message)){e.preventDefault();e.stopPropagation()}};
  const submit=(e:SubmitEvent)=>{if(e.target instanceof HTMLFormElement&&e.target.id!==formId&&!window.confirm(message)){e.preventDefault();e.stopPropagation()}};
  window.addEventListener("beforeunload",before);document.addEventListener("click",click,true);document.addEventListener("submit",submit,true);
  return()=>{window.removeEventListener("beforeunload",before);document.removeEventListener("click",click,true);document.removeEventListener("submit",submit,true)};
 },[dirty,message,formId]);
}
