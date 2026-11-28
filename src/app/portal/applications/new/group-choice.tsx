"use client";
import {useEffect,useRef,useState} from "react";
import {CountryFlag} from "@/components/country-flag";
import {useAgencyPopover} from "@/components/agency-popover-controller";
type Option={id:string;label:string;detail?:string;iso?:string|null};
export function GroupChoice({id,label,placeholder,empty,options,value,disabled,onChange}:{id:string;label:string;placeholder:string;empty:string;options:Option[];value:string;disabled:boolean;onChange:(id:string)=>void}){
const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null),[open,setOpen]=useState(false),[q,setQ]=useState("");
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const filtered=options.filter(o=>normalize(o.label+" "+(o.detail??"")).includes(normalize(q))),current=options.find(o=>o.id===value);
useAgencyPopover(root,open,setOpen,trigger);
useEffect(()=>{if(open)input.current?.focus()},[open]);
function choose(id:string){onChange(id);setOpen(false);trigger.current?.focus()}
return <div className="group-choice" ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setOpen(false);trigger.current?.focus()}}}><label htmlFor={id}>{label}</label><button ref={trigger} id={id} type="button" className="input group-choice-trigger" disabled={disabled} aria-expanded={open} aria-controls={id+"-options"} onClick={()=>{setQ("");setOpen(!open)}}><span>{current?.iso?<CountryFlag iso={current.iso}/>:null}{current?.label??placeholder}</span><span aria-hidden="true">⌄</span></button>{open?<div className="group-choice-pop" id={id+"-options"}><input ref={input} className="input" type="search" value={q} placeholder={placeholder} aria-label={placeholder} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&filtered.length===1){e.preventDefault();choose(filtered[0]!.id)}}}/><div className="group-choice-options">{filtered.map(o=><button type="button" key={o.id} aria-pressed={o.id===value} onClick={()=>choose(o.id)}><span>{o.iso?<CountryFlag iso={o.iso}/>:null}<span>{o.label}{o.detail?<small>{o.detail}</small>:null}</span></span>{o.id===value?"✓":null}</button>)}{!filtered.length?<p>{empty}</p>:null}</div></div>:null}</div>
}
