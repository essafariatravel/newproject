"use client";

import { useRef } from "react";
import type { ReactNode } from "react";

/** Native modal supplies focus trapping, Escape, inert background and focus return. */
export function MobileNavigation({ children, openLabel, closeLabel }: {
  children: ReactNode; openLabel: string; closeLabel: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="workspace-menu lg:hidden" aria-label={openLabel}
      onClick={() => dialog.current?.showModal()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </button>
    <dialog ref={dialog} className="workspace-drawer" aria-label={openLabel}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="flex h-full flex-col" onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) dialog.current?.close();
      }}>
        <button type="button" className="m-4 inline-flex min-h-11 self-end items-center rounded-lg border border-white/20 px-4 text-base text-white"
          onClick={() => dialog.current?.close()}>{closeLabel} ×</button>
        {children}
      </div>
    </dialog>
  </>;
}
