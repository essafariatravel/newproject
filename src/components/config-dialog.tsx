"use client";
import { useRef, type ReactNode } from "react";

export function ConfigDialog({ title, closeLabel, children }: { title: string; closeLabel: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="btn-secondary btn-sm" onClick={() => dialog.current?.showModal()}>{title}</button>
    <dialog ref={dialog} aria-label={title} className="config-dialog" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="p-6 text-start">
        <div className="mb-6 flex items-center justify-between gap-4"><h2 className="text-lg font-semibold text-navy-900">{title}</h2><button type="button" className="btn-secondary btn-sm" onClick={() => dialog.current?.close()}>{closeLabel} ×</button></div>
        {children}
      </div>
    </dialog>
  </>;
}
