"use client";
import {useEffect,useRef,useState,type KeyboardEvent} from "react";
import {useAgencyPopover} from "@/components/agency-popover-controller";
type Option={value:string;label:string};
type Props={id:string;name:string;label:string;options:Option[];value?:string;defaultValue?:string;compact?:boolean;onChange?:(value:string,form:HTMLFormElement|null)=>void};
const normalize=(s:string)=>s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[أإآٱ]/g,"ا");
export function CaseSelectField({id,name,label,options,value,defaultValue="",compact=false,onChange}:Props){
 const [internal,setInternal]=useState(defaultValue),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),field=useRef<HTMLInputElement>(null),panel=useRef<HTMLDivElement>(null);
 const typed=useRef({text:"",time:0});
 const chosen=Math.max(0,options.findIndex(o=>o.value===(value??internal)));
 const current=options[chosen];
 useAgencyPopover(root,open,setOpen,trigger);
 useEffect(()=>{if(open&&active>=0)document.getElementById(id+"-option-"+active)?.scrollIntoView({block:"nearest"});},[open,active,id]);
 useEffect(()=>{if(!open||!panel.current)return;const place=()=>{const p=panel.current;if(!p)return;p.style.removeProperty("--case-menu-offset");p.style.removeProperty("--case-menu-max");p.removeAttribute("data-up");let r=p.getBoundingClientRect();const below=window.innerHeight-(trigger.current?.getBoundingClientRect().bottom??0)-12,above=(trigger.current?.getBoundingClientRect().top??0)-12;if(below<Math.min(r.height,180)&&above>below){p.dataset.up="true";p.style.setProperty("--case-menu-max",Math.max(80,Math.min(288,above))+"px")}else p.style.setProperty("--case-menu-max",Math.max(80,Math.min(288,below))+"px");r=p.getBoundingClientRect();p.style.setProperty("--case-menu-offset",Math.max(12-r.left,Math.min(0,window.innerWidth-12-r.right))+"px")};place();window.addEventListener("resize",place);return()=>window.removeEventListener("resize",place)},[open]);
 function select(i:number){const opt=options[i];if(!opt)return;setInternal(opt.value);setOpen(false);typed.current={text:"",time:0};trigger.current?.focus({preventScroll:true});if(opt.value!==current?.value)onChange?.(opt.value,field.current?.form??null)}
 function toggle(){setActive(chosen);setOpen(v=>!v);typed.current={text:"",time:0}}
 function key(e:KeyboardEvent<HTMLButtonElement>){
  if(e.nativeEvent.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==="Escape"){if(open){e.preventDefault();setOpen(false)}return}
  if(e.key==="Tab"){setOpen(false);return}
  if(e.key==="Enter"||e.key===" "){e.preventDefault();if(open)select(active);else toggle();return}
  if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){e.preventDefault();if(!open){setOpen(true);setActive(e.key==="Home"?0:e.key==="End"?options.length-1:chosen)}else setActive(i=>e.key==="Home"?0:e.key==="End"?options.length-1:Math.max(0,Math.min(options.length-1,i+(e.key==="ArrowDown"?1:-1))));return}
  if(e.key.length===1){const now=Date.now(),ch=normalize(e.key),word=now-typed.current.time>650?ch:typed.current.text+ch;typed.current={text:word,time:now};const i=options.findIndex(o=>normalize(o.label).startsWith(word));if(i>=0){e.preventDefault();setOpen(true);setActive(i)}}
 }
 return <div className={"case-select-field"+(compact?" case-select-compact":"")} ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}>
  <input ref={field} type="hidden" name={name} value={current?.value??""}/>
  <button ref={trigger} id={id} type="button" role="combobox" aria-label={label+": "+(current?.label??"")} aria-haspopup="listbox" aria-expanded={open} aria-controls={id+"-list"} aria-activedescendant={open&&active>=0?id+"-option-"+active:undefined} className="case-select-trigger" onClick={toggle} onKeyDown={key}><span>{current?.label??"—"}</span><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>
  {open?<div ref={panel} className="case-select-panel" id={id+"-list"} role="listbox" aria-label={label}>{options.map((opt,i)=><div key={opt.value} id={id+"-option-"+i} role="option" aria-selected={i===chosen} data-active={i===active} onPointerMove={e=>{if(e.pointerType==="mouse")setActive(i)}} onMouseDown={e=>e.preventDefault()} onClick={()=>select(i)}><span>{opt.label}</span>{i===chosen?<svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>:null}</div>)}</div>:null}
 </div>
}
