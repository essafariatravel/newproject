"use client";
import {useEffect,useState} from "react";
import {durationLabel,processingDuration} from "./case-workspace";
export function LiveCaseDuration({submitted,initialMinutes,terminal,locale}:{submitted:string;initialMinutes:number;terminal:boolean;locale:"fr"|"en"|"ar"}){
 const [minutes,setMinutes]=useState(initialMinutes);
 useEffect(()=>{setMinutes(initialMinutes);if(terminal)return;const tick=()=>{const v=processingDuration(submitted,null,null,false);if(v)setMinutes(v.minutes)};tick();const timer=window.setInterval(tick,60000);return()=>window.clearInterval(timer)},[submitted,initialMinutes,terminal]);
 return <bdi>{durationLabel(terminal?initialMinutes:minutes,locale)}</bdi>
}
