"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAgencyPopover } from "./agency-popover-controller";
import { NotificationRead, NotificationOpen, NotificationIcon } from "@/app/portal/notifications/notification-interactions";
import { notificationCopy } from "@/app/portal/notifications/notification-copy";
import { startNotificationPolling } from "@/lib/notification-polling";
import { createNotificationSharing } from "@/lib/notification-sharing";

type NotificationEvent = { id: string; title: string; link: string | null; createdAt: string; readAt?:string|null; type?:string; applicationId?:string|null; context?:string; priority?:boolean; reference?:string|null; digestKey?:string; actionTotal?:number };
export function LiveNotifications({ initialCount, href, label, soundLabel, closeLabel, refreshFirstEvent=false, agencyLocale, initialEvents, notificationScope }: {
  initialCount: number; href: string; label: string; soundLabel: string; closeLabel: string; refreshFirstEvent?: boolean; agencyLocale?:"fr"|"en"|"ar"; initialEvents?:NotificationEvent[]; notificationScope?:string|null;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [events,setEvents]=useState<NotificationEvent[]|null>(initialEvents??null),[open,setOpen]=useState(false),[unreadOnly,setUnreadOnly]=useState(false);const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useAgencyPopover(root,open,setOpen,trigger);
  const countRef=useRef(initialCount); useEffect(()=>{countRef.current=initialCount},[initialCount]);
  const feedSignature=(rows:NotificationEvent[])=>rows.map(n=>n.id+":"+n.readAt+":"+n.priority).sort().join("|")+":"+(rows[0]?.actionTotal??0);
  const feedRef=useRef(feedSignature(initialEvents??[]));
  const priorityRef=useRef((initialEvents??[]).filter(n=>n.priority).map(n=>n.id).sort().join(",")+":"+(initialEvents?.[0]?.actionTotal??0));
  const actionTotal=events?.find(n=>typeof n.actionTotal==="number")?.actionTotal??0;
  const hasPriority=actionTotal>0||!!events?.some(n=>n.priority);
  const bellItems=(()=>{const selected=(events??[]).filter(n=>!unreadOnly||n.readAt===null).sort((a,b)=>Number(!!b.priority)-Number(!!a.priority)||Date.parse(b.createdAt)-Date.parse(a.createdAt));const groups=new Map<string,NotificationEvent[]>();for(const n of selected){const key=!unreadOnly&&!n.priority&&n.digestKey?.startsWith("case:")?n.digestKey:n.id;const existing=groups.get(key);if(existing)existing.push(n);else groups.set(key,[n]);}return [...groups.values()].slice(0,8);})();
  useEffect(()=>{priorityRef.current=(initialEvents??[]).filter(n=>n.priority).map(n=>n.id).sort().join(",")+":"+(initialEvents?.[0]?.actionTotal??0)},[initialEvents]);
  const [toast, setToast] = useState<NotificationEvent | null>(null);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  useEffect(() => { setCount(initialCount); }, [initialCount]);
  useEffect(()=>{if(initialEvents){setEvents(initialEvents);feedRef.current=feedSignature(initialEvents)}},[initialEvents]);
  useEffect(() => {
    try { const enabled = localStorage.getItem("essafaria.notification-sound") === "on"; soundEnabled.current = enabled; setSound(enabled); } catch { /* Storage may be disabled. */ }
    let seen: Set<string> | null = null;
    const onlineSince = Date.now();
    const shared=notificationScope?createNotificationSharing(notificationScope):null;
    const stop=startNotificationPolling<{ unread: number; events: NotificationEvent[] }>((data) => {
        const previous=countRef.current;countRef.current=data.unread;
        setCount(data.unread);
        if(agencyLocale){setEvents(data.events);const priority=data.events.filter(n=>n.priority).map(n=>n.id).sort().join(",")+":"+(data.events[0]?.actionTotal??0);const signature=feedSignature(data.events);const changed=priorityRef.current!==priority||feedRef.current!==signature;priorityRef.current=priority;feedRef.current=signature;if((previous!==data.unread||changed)&&window.location.pathname==="/portal/notifications"&&document.visibilityState==="visible")router.refresh();}
        window.dispatchEvent(new CustomEvent("essafaria-notifications", { detail: data.unread }));
        const fresh = seen && data.events.find((n) => !seen!.has(n.id) && Date.parse(n.createdAt) > onlineSince);
        const freshAfterStart = data.events.some(n => Date.parse(n.createdAt) > onlineSince && !seen?.has(n.id));
        seen = new Set(data.events.map((n) => n.id));
        if(refreshFirstEvent&&freshAfterStart&&!fresh&&document.visibilityState==="visible")router.refresh();
        if (fresh) {
          setToast(fresh);
          router.refresh();
          if (soundEnabled.current && audio.current?.state === "running") {
            const ctx = audio.current, tone = ctx.createOscillator(), gain = ctx.createGain();
            tone.frequency.value = 660; gain.gain.setValueAtTime(.035, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
            tone.connect(gain); gain.connect(ctx.destination); tone.start(); tone.stop(ctx.currentTime + .2);
          }
        }
    },shared?.read,()=>{if(notificationScope){setCount(0);setEvents([]);setToast(null);router.refresh()}});
    return()=>{stop();shared?.close()};
  }, [router,refreshFirstEvent,agencyLocale,notificationScope]);
  useEffect(()=>{if(!agencyLocale)return;const handler:EventListener=(event)=>{if(!(event instanceof CustomEvent))return;const next:unknown=event.detail;if(typeof next!=="boolean")return;soundEnabled.current=next;setSound(next);try{localStorage.setItem("essafaria.notification-sound",next?"on":"off")}catch{};if(next){try{audio.current??=new AudioContext();void audio.current.resume().catch(()=>{})}catch{}}window.dispatchEvent(new Event("essafaria-sound-changed"))};window.addEventListener("essafaria-sound-request",handler);return()=>window.removeEventListener("essafaria-sound-request",handler)},[agencyLocale]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 7000); return () => clearTimeout(timer); }, [toast]);
  return <>
    {agencyLocale?<div ref={root} className="sn-bell-root"><style>{bellCss}</style><button ref={trigger} type="button" aria-label={label+": "+count+(hasPriority?" · "+notificationCopy[agencyLocale].action:"")} aria-expanded={open} onClick={()=>setOpen(v=>!v)} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg text-navy-900 hover:bg-ivory-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{count>0?<span className="absolute end-0 top-0 min-w-4 rounded-full bg-red-600 px-1 text-center text-xs text-white">{count>99?"99+":count}</span>:null}{hasPriority?<span className="sn-bell-attention" aria-hidden="true"/>:null}</button>
    {open?<section className="sn-bell-panel" aria-label={label}><header><strong>{label}</strong>{count>0?<NotificationRead all back={href} label={notificationCopy[agencyLocale].markAll} locale={agencyLocale}/>:null}</header><div className="sn-bell-tabs"><button type="button" aria-pressed={!unreadOnly} onClick={()=>setUnreadOnly(false)}>{notificationCopy[agencyLocale].recent}</button><button type="button" aria-pressed={unreadOnly} onClick={()=>setUnreadOnly(true)}>{notificationCopy[agencyLocale].unread}{count?` (${count})`:""}</button>{hasPriority?<Link href={href+"?filter=action"} className="sn-bell-priority-link" onClick={()=>setOpen(false)}>{notificationCopy[agencyLocale].priority}{actionTotal?` · ${actionTotal}`:""}</Link>:null}</div><div className="sn-bell-events">{events===null?<p className="sn-bell-empty">{notificationCopy[agencyLocale].loading}</p>:bellItems.map((items,index)=>{const n=items[0]!;const digest=items.length>1&&!!n.reference;const target=n.type==="MESSAGE_POSTED"&&n.applicationId?"/portal/communications?thread="+n.applicationId:n.link&&/^\/portal(?:\/|$)/.test(n.link)&&!n.link.includes("..")&&!n.link.includes("\\")?n.link:href;return <div key={n.id}>{!unreadOnly&&(index===0||!!bellItems[index-1]?.[0]?.priority!==!!n.priority)?<p className="sn-bell-section">{n.priority?notificationCopy[agencyLocale].attention:notificationCopy[agencyLocale].recentActivity}</p>:null}<div className="sn-bell-row"><NotificationIcon kind={digest?"folder":n.priority?"action":n.type?.includes("WALLET")||n.type==="TOPUP_REQUESTED"?"wallet":n.type==="MESSAGE_POSTED"?"message":"case"}/><div>{digest?<Link className="sn-open-title" href={href+"?q="+encodeURIComponent(n.reference!)} onClick={()=>setOpen(false)}>{notificationCopy[agencyLocale].activity}</Link>:<NotificationOpen id={n.id} href={target} unread={n.readAt===null} locale={agencyLocale} title={n.title} onOpen={()=>setOpen(false)}/>}{n.context?<small className="sn-bell-context"><bdi>{n.context}</bdi></small>:null}<time dateTime={n.createdAt}>{new Intl.DateTimeFormat(agencyLocale==="fr"?"fr-FR":agencyLocale==="ar"?"ar-DZ":"en-GB",{timeZone:"Africa/Algiers",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(n.createdAt))}</time></div>{n.priority?<span className="sn-bell-priority-dot" aria-label={notificationCopy[agencyLocale].action}/>:items.some(x=>x.readAt===null)?<span className="sn-bell-dot"/>:null}</div></div>})}{events!==null&&!events.some(n=>!unreadOnly||n.readAt===null)?<p className="sn-bell-empty">{unreadOnly&&count===0?notificationCopy[agencyLocale].noUnread:notificationCopy[agencyLocale].viewAll}</p>:null}</div><Link className="sn-bell-all" href={href+(unreadOnly?"?filter=unread":"")} onClick={()=>setOpen(false)}>{notificationCopy[agencyLocale].viewAll} <span aria-hidden="true" className="directional-arrow">→</span></Link></section>:null}</div>:<Link href={href} aria-label={`${label}: ${count}`} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg text-navy-900 hover:bg-ivory-100">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {count > 0 ? <span className="absolute end-0 top-0 min-w-4 rounded-full bg-red-600 px-1 text-center text-xs text-white">{count > 99 ? "99+" : count}</span> : null}
    </Link>}
    <button type="button" aria-label={soundLabel} title={soundLabel} aria-pressed={sound} className="notification-sound-toggle h-11 w-11 shrink-0 rounded-lg border border-line text-xs" onClick={() => {
      const next = !sound; soundEnabled.current = next; setSound(next);
      try { localStorage.setItem("essafaria.notification-sound", next ? "on" : "off"); } catch { /* Optional preference. */ }
      if(agencyLocale)window.dispatchEvent(new Event("essafaria-sound-changed"));
      if (next) { try { audio.current ??= new AudioContext(); void audio.current.resume().catch(() => {}); } catch { /* Browser audio restrictions. */ } }
    }}>{sound ? "♪" : "♪̸"}</button>
    {toast ? <div role="status" className="fixed bottom-6 end-6 z-50 max-w-[calc(100vw-3rem)] rounded-lg border border-line bg-white p-4 text-base text-navy-900 shadow-lg">
      <Link href={toast.link || href}>{toast.title}</Link><button type="button" aria-label={closeLabel} className="ms-4 inline-flex h-11 w-11 items-center justify-center rounded-md" onClick={() => setToast(null)}>×</button>
    </div> : null}
  </>;
}

const bellCss=`.sn-bell-root{position:relative;flex:none}.sn-bell-panel{position:absolute;inset-inline-end:0;top:100%;z-index:90;width:min(420px,calc(100vw - 24px));background:white;border:1px solid #d8dfe6;border-radius:10px;color:#0b1c30;box-shadow:0 12px 35px #0b1c3020;text-align:start;font-size:15px}.sn-bell-panel header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px}.sn-bell-panel header strong{font-size:17px;font-weight:600}.sn-bell-panel .sn-read{display:inline-flex;align-items:center;gap:5px;padding:6px;color:#647182;font-size:12px}.sn-bell-tabs{display:flex;gap:18px;padding-inline:14px;border-bottom:1px solid #e2e5e9}.sn-bell-tabs button{padding:9px 0;color:#647182}.sn-bell-tabs button[aria-pressed=true]{color:#0b1c30;border-bottom:2px solid #0b1c30;font-weight:600}.sn-bell-events{max-height:min(360px,50dvh);overflow:auto;scrollbar-width:thin}.sn-bell-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #edf0f3}.sn-bell-row:hover{background:#f5f7fa}.sn-bell-row>div{flex:1;min-width:0}.sn-bell-row .sn-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:#f3f5f7;color:#344457;flex:none}.sn-bell-row .sn-open-title{text-align:start;font-weight:500;font-size:15px;overflow-wrap:anywhere}.sn-bell-context{display:block;color:#647182;font-size:13px;overflow-wrap:anywhere}.sn-bell-row time{display:block;font-size:13px;color:#647182;margin-top:1px}.sn-bell-dot{width:7px;height:7px;background:#285582;border-radius:50%;flex:none}.sn-bell-all{display:block;text-align:center;padding:13px;color:#285582;font-weight:500}.sn-bell-empty{padding:24px 14px;text-align:center;color:#647182}.sn-bell-panel button:disabled{opacity:.5}@media(max-width:760px){.sn-bell-panel{position:fixed;inset-inline:12px;top:64px;width:auto}.sn-bell-panel header strong{font-size:16px}}.sn-bell-attention{position:absolute;inset-inline-end:3px;top:3px;width:8px;height:8px;background:#a06a25;border-radius:50%}.sn-bell-priority-dot{width:7px;height:7px;background:#a06a25;border-radius:50%;flex:none}.sn-bell-priority-link{margin-inline-start:auto;padding:9px 0;color:#85551c}.sn-bell-row .sn-icon[data-kind=action]{color:#85551c;background:#faf4e9}.sn-bell-section{padding:8px 14px 4px;color:#647182;font-size:12px;font-weight:600}.sn-bell-attention{inset-inline-end:2px;top:auto;bottom:3px}.sn-bell-row .sn-open-title:focus-visible{outline:2px solid #304b64;outline-offset:2px} .sn-bell-panel{border-radius:12px;box-shadow:0 12px 36px #0b1c3018}.sn-bell-row{gap:12px;padding:10px 14px}.sn-bell-row .sn-open-title{line-height:1.35}.sn-bell-context{line-height:1.35;margin-top:3px}.sn-bell-row time{font-variant-numeric:tabular-nums}.sn-bell-section{font-weight:500;padding:10px 14px 4px}.sn-bell-row:has(.sn-bell-priority-dot){border-inline-start:2px solid #a06a25;padding-inline-start:12px}.sn-bell-all:hover{background:#f5f7fa}.sn-bell-panel .sn-bell-tabs{gap:14px} `;
