"use client";
import { useEffect, type RefObject } from "react";
import { usePathname } from "next/navigation";
import { shouldSchedulePointerClose, POPOVER_EXIT_DELAY } from "./agency-popover-policy";
const OPEN="essafaria:agency-popover-open", CLOSE="essafaria:agency-popover-close";
const scope=".workspace-agency";
const nativeMenus="details.account-menu, details.ui-locale-menu, details.dash-more, details.dash-capacity, details.cancellation-menu";
const controlled="[data-agency-popover-open]";
const isNative=(node:HTMLElement):node is HTMLDetailsElement=>node instanceof HTMLDetailsElement&&node.matches(nativeMenus);
const isOpen=(node:HTMLElement)=>node.isConnected&&(isNative(node)?node.open:node.hasAttribute("data-agency-popover-open"));
function dismiss(node:HTMLElement,reason:"pointer"|"outside"|"switch"|"escape"|"navigation"){
 if(isNative(node)){
  const focusInside=node.contains(document.activeElement);
  node.open=false;
  if(reason==="escape"&&focusInside)node.querySelector<HTMLElement>("summary")?.focus({preventScroll:true});
 }else node.dispatchEvent(new CustomEvent(CLOSE,{detail:reason}));
}
// React-controlled popovers close through state, never by mutating hidden/ARIA in the DOM.
export function useAgencyPopover<T extends HTMLElement>(ref:RefObject<T|null>,open:boolean,setOpen:(value:boolean)=>void,trigger?:RefObject<HTMLElement|null>){
 useEffect(()=>{
  const root=ref.current;
  if(!open||!root?.closest(scope))return;
  const close=(event:Event)=>{setOpen(false);if((event as CustomEvent).detail==="escape")trigger?.current?.focus({preventScroll:true});};
  root.setAttribute("data-agency-popover-open","");
  root.addEventListener(CLOSE,close);
  root.dispatchEvent(new CustomEvent(OPEN,{bubbles:true}));
  return()=>{root.removeEventListener(CLOSE,close);root.removeAttribute("data-agency-popover-open");};
 },[ref,open,setOpen,trigger]);
}
/** Agency-only controller. Disclosure content and modal forms are deliberately excluded. */
export function AgencyPopoverController(){
 const pathname=usePathname();
 useEffect(()=>{
  const workspace=document.querySelector<HTMLElement>(scope);
  if(!workspace)return;
  let active:HTMLElement|null=null, timer:number|undefined;
  let modality:"mouse"|"keyboard"|"touch"="keyboard";
  let lastX:number|undefined,lastY:number|undefined;
  const clear=()=>{if(timer!==undefined){window.clearTimeout(timer);timer=undefined;}};
  const closeActive=(reason:Parameters<typeof dismiss>[1])=>{clear();const previous=active;active=null;if(previous&&isOpen(previous))dismiss(previous,reason);};
  const activate=(node:HTMLElement)=>{
   if(!workspace.contains(node)||!isOpen(node))return;
   if(active===node)return;
   closeActive("switch");
   // Also resolve batched React/native openings or pre-hydration disclosures.
   workspace.querySelectorAll<HTMLElement>(nativeMenus+","+controlled).forEach(other=>{if(other!==node&&isOpen(other))dismiss(other,"switch");});
   active=node;
  };
  const onOpen=(e:Event)=>{if(e.target instanceof HTMLElement)activate(e.target);};
  const onToggle=(e:Event)=>{if(e.target instanceof HTMLElement&&isNative(e.target)){if(e.target.open)activate(e.target);else if(active===e.target){clear();active=null;}}};
  const onDown=(e:PointerEvent)=>{
   modality=e.pointerType==="mouse"?"mouse":"touch";clear();
   if(active&&e.target instanceof Node&&!active.contains(e.target))closeActive("outside");
  };
  const schedule=()=>{
   if(timer!==undefined||!active)return;
   const candidate=active;
   timer=window.setTimeout(()=>{timer=undefined;if(active===candidate&&modality==="mouse"&&isOpen(candidate))closeActive("pointer");},POPOVER_EXIT_DELAY);
  };
  const onMove=(e:PointerEvent)=>{
   if(e.pointerType!=="mouse")return;
   if(lastX===e.clientX&&lastY===e.clientY)return;
   lastX=e.clientX;lastY=e.clientY;modality="mouse";
   if(!active||!isOpen(active)){clear();active=null;return;}
   if(shouldSchedulePointerClose(e.pointerType,modality,active.contains(e.target as Node)))schedule();else clear();
  };
  const onOut=(e:PointerEvent)=>{if(e.pointerType==="mouse"&&modality==="mouse"&&active&&e.relatedTarget===null)schedule();};
  const onKey=(e:KeyboardEvent)=>{modality="keyboard";clear();if(e.key==="Escape"&&!e.defaultPrevented&&active&&isOpen(active)){e.preventDefault();closeActive("escape");}};
  const onFocus=(e:FocusEvent)=>{if(active&&modality==="keyboard"&&e.target instanceof Node&&!active.contains(e.target))closeActive("outside");};
  // Closing on route change prevents a persistent header menu from following navigation.
  workspace.querySelectorAll<HTMLElement>(nativeMenus+","+controlled).forEach(node=>{if(isOpen(node))activate(node);});
  workspace.addEventListener(OPEN,onOpen);workspace.addEventListener("toggle",onToggle,true);
  document.addEventListener("pointerdown",onDown,true);document.addEventListener("pointermove",onMove,{passive:true});
  document.addEventListener("pointerout",onOut,{passive:true});document.addEventListener("keydown",onKey);
  document.addEventListener("focusin",onFocus);
  return()=>{closeActive("navigation");workspace.removeEventListener(OPEN,onOpen);workspace.removeEventListener("toggle",onToggle,true);document.removeEventListener("pointerdown",onDown,true);document.removeEventListener("pointermove",onMove);document.removeEventListener("pointerout",onOut);document.removeEventListener("keydown",onKey);document.removeEventListener("focusin",onFocus);};
 },[pathname]);
 return null;
}
