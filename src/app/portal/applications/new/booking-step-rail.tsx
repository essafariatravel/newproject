"use client";
import type {Ref} from "react";
export function BookingStepRail({labels,step,pending,onStep,headingRef}:{labels:readonly string[];step:number;pending:boolean;onStep:(step:number)=>void;headingRef?:Ref<HTMLOListElement>}){
return <ol ref={headingRef} tabIndex={-1} className="booking-rail" data-testid="wizard-steps">{labels.map((label,i)=><li key={label} aria-current={step===i+1?"step":undefined} data-state={step===i+1?"active":step>i+1?"complete":"pending"}><button type="button" disabled={step<=i+1||pending} onClick={()=>onStep(i+1)}><span className="booking-marker">{step>i+1?"✓":step===i+1?<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 10 21 3l-7 18-4-7-7-4Zm7 4L21 3"/></svg>:i+1}</span><span>{label}</span></button></li>)}</ol>
}
