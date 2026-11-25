"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function WalletDrawer({id,title,trigger,close,children,className="btn-primary",openFromHash=false}:{id:string;title:string;trigger:string;close:string;children:ReactNode;className?:string;openFromHash?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 const button=useRef<HTMLButtonElement>(null);
 const open=()=>{if(dialog.current&&!dialog.current.open)dialog.current.showModal()};
 useEffect(()=>{
   if(!openFromHash)return;
   const check=()=>{if(window.location.hash==="#"+id&&dialog.current&&!dialog.current.open)dialog.current.showModal()};
   check();window.addEventListener("hashchange",check);return()=>window.removeEventListener("hashchange",check);
 },[id,openFromHash]);
 return <><button ref={button} type="button" className={className} onClick={open}>{trigger}</button>
 <dialog id={id+"-dialog"} ref={dialog} className="wallet-drawer" aria-labelledby={id+"-title"} onClose={()=>{if(openFromHash&&window.location.hash==="#"+id)window.history.replaceState(null,"",window.location.pathname+window.location.search);button.current?.focus()}}>
 <div className="wallet-drawer-head"><h2 id={id+"-title"}>{title}</h2><button type="button" className="wallet-close" onClick={()=>dialog.current?.close()} aria-label={close}>×</button></div>
 <div className="wallet-drawer-body">{children}</div></dialog></>
}
export function WalletPeriodFields({period,from,to,options,fromLabel,toLabel}:{period:string;from?:string;to?:string;options:{value:string;label:string}[];fromLabel:string;toLabel:string}){
 const [value,setValue]=useState(period);
 useEffect(()=>setValue(period),[period]);
 return <><label className="wallet-period-control"><span>{options.find(x=>x.value===value)?.label??options[0]?.label}</span><select name="period" aria-label={options[0]?.label??"Period"} value={value} onChange={e=>setValue(e.target.value)}>{options.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
 {value==="custom"?<div className="wallet-custom-range"><label>{fromLabel}<input className="input" type="date" name="from" defaultValue={from}/></label><label>{toLabel}<input className="input" type="date" name="to" defaultValue={to}/></label></div>:null}</>
}
