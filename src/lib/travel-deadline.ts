const DAY=86400000;
export function civilDay(value:string):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const time=Date.parse(value+"T00:00:00Z");
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time/DAY:null;
}
export function algeriaToday(now:Date=new Date()):string{
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Algiers",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const get=(type:string)=>parts.find(p=>p.type===type)?.value??"";
 return get("year")+"-"+get("month")+"-"+get("day");
}
export type DeadlineState="none"|"invalid"|"unknown"|"risk"|"tight"|"favourable";
export function assessTravelDeadline(departure:string,today:string,minDays:number,maxDays:number):{state:DeadlineState;calendarDays:number|null;workingDays:number|null;buffer:number|null}{
 const empty={calendarDays:null,workingDays:null,buffer:null};
 if(!departure)return {state:"none",...empty};
 const start=civilDay(today),end=civilDay(departure);
 if(start===null||end===null||end<start||end-start>730)return {state:"invalid",...empty};
 const calendarDays=end-start;
 // Reference calendar: Sunday to Thursday, excluding today and departure.
 // This is a planning estimate, not the authority's calendar; no holidays inferred.
 let workingDays=0;
 for(let day=start+1;day<end;day++){const weekday=new Date(day*DAY).getUTCDay();if(weekday!==5&&weekday!==6)workingDays++}
 if(!Number.isInteger(minDays)||!Number.isInteger(maxDays)||minDays<=0||maxDays<minDays)return {state:"unknown",calendarDays,workingDays,buffer:null};
 const buffer=workingDays-maxDays;
 return {state:workingDays<minDays?"risk":buffer<2?"tight":"favourable",calendarDays,workingDays,buffer};
}
