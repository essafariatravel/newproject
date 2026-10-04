"use client";
import { useEffect, useState } from "react";
export function LivePresence({ staff, label }: { staff: boolean; label: string }) {
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    let stopped = false;
    async function beat() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/presence", { method: "POST", cache: "no-store" });
        if (!response.ok) { if (!stopped) setOnline(null); return; }
        const data = await response.json();
        if (!stopped && typeof data.online === "number") setOnline(data.online);
      } catch { if (!stopped) setOnline(null); }
    }
    void beat(); const timer = setInterval(beat, 45000);
    document.addEventListener("visibilitychange", beat);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", beat); };
  }, []);
  if (!staff) return null;
  return <span className="workspace-header-presence inline-flex items-center gap-2 whitespace-nowrap text-xs text-slate-600" title={label}>
    <span className={`h-1.5 w-1.5 rounded-full ${online === null ? "bg-slate-300" : "bg-emerald-600"}`} aria-hidden="true" />
    <span className="hidden xl:inline">{label}</span><span aria-label={label}>{online ?? "—"}</span>
  </span>;
}
