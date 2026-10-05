"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Event = { id: string; title: string; link: string | null; createdAt: string };
export function LiveNotifications({ initialCount, href, label, soundLabel, closeLabel }: {
  initialCount: number; href: string; label: string; soundLabel: string; closeLabel: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [toast, setToast] = useState<Event | null>(null);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  useEffect(() => { setCount(initialCount); }, [initialCount]);
  useEffect(() => {
    try { const enabled = localStorage.getItem("essafaria.notification-sound") === "on"; soundEnabled.current = enabled; setSound(enabled); } catch { /* Storage may be disabled. */ }
    let stopped = false;
    let seen: Set<string> | null = null;
    const onlineSince = Date.now();
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok || stopped) return;
        const data = await response.json() as { unread: number; events: Event[] };
        if (stopped) return;
        setCount(data.unread);
        window.dispatchEvent(new CustomEvent("essafaria-notifications", { detail: data.unread }));
        const fresh = seen && data.events.find((n) => !seen!.has(n.id) && Date.parse(n.createdAt) > onlineSince);
        seen = new Set(data.events.map((n) => n.id));
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
      } catch { /* Keep current state during temporary network failures. */ }
    }
    void poll(); const timer = setInterval(poll, 15_000);
    document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [router]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 7000); return () => clearTimeout(timer); }, [toast]);
  return <>
    <Link href={href} aria-label={`${label}: ${count}`} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg text-navy-900 hover:bg-ivory-100">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {count > 0 ? <span className="absolute end-0 top-0 min-w-4 rounded-full bg-red-600 px-1 text-center text-xs text-white">{count > 99 ? "99+" : count}</span> : null}
    </Link>
    <button type="button" aria-label={soundLabel} title={soundLabel} aria-pressed={sound} className="notification-sound-toggle h-11 w-11 shrink-0 rounded-lg border border-line text-xs" onClick={() => {
      const next = !sound; soundEnabled.current = next; setSound(next);
      try { localStorage.setItem("essafaria.notification-sound", next ? "on" : "off"); } catch { /* Optional preference. */ }
      if (next) { try { audio.current ??= new AudioContext(); void audio.current.resume().catch(() => {}); } catch { /* Browser audio restrictions. */ } }
    }}>{sound ? "♪" : "♪̸"}</button>
    {toast ? <div role="status" className="fixed bottom-6 end-6 z-50 max-w-[calc(100vw-3rem)] rounded-lg border border-line bg-white p-4 text-base text-navy-900 shadow-lg">
      <Link href={toast.link || href}>{toast.title}</Link><button type="button" aria-label={closeLabel} className="ms-4 inline-flex h-11 w-11 items-center justify-center rounded-md" onClick={() => setToast(null)}>×</button>
    </div> : null}
  </>;
}
