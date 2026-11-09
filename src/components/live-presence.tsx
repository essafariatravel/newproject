"use client";
import { useEffect, useState } from "react";
import { startPresenceHeartbeat } from "@/lib/presence-heartbeat";
export function LivePresence({ staff, label }: { staff: boolean; label: string }) {
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    return startPresenceHeartbeat(setOnline, () => setOnline(null));
  }, []);
  if (!staff) return null;
  return <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-slate-600" title={label}>
    <span className={`h-1.5 w-1.5 rounded-full ${online === null ? "bg-slate-300" : "bg-emerald-600"}`} aria-hidden="true" />
    <span className="hidden xl:inline">{label}</span><span aria-label={label}>{online ?? "—"}</span>
  </span>;
}
