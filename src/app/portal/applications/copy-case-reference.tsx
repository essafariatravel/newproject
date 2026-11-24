"use client";
import {useState} from "react";
export function CopyCaseReference({reference,label,copied,failed}:{reference:string;label:string;copied:string;failed:string}){
 const [message,setMessage]=useState("");
 async function copy(){try{await navigator.clipboard.writeText(reference);setMessage(copied)}catch{setMessage(failed)}}
 return <div className="dossier-reference"><bdi>{reference}</bdi><button type="button" onClick={copy} aria-label={label} title={label}><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="6" y="6" width="10" height="11" rx="1.5"/><path d="M12 6V3H3v10h3"/></svg></button><span role="status">{message}</span></div>
}
