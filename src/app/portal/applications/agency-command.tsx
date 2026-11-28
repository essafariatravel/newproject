"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Locale = "fr" | "en" | "ar";
type Item = { id: string; title: string; detail?: string; href: string };
const strings = {
  fr: { title: "Que souhaitez-vous faire ?", search: "Rechercher un dossier ou une action", close: "Fermer", commands: "Actions rapides", results: "Dossiers et actions", none: "Aucun dossier trouvé. Vous pouvez lancer la recherche complète.", loading: "Recherche…", error: "Suggestions indisponibles. La recherche complète reste accessible.", all: "Rechercher tous les dossiers", new: "Créer une demande", work: "Traiter les dossiers", decisions: "Consulter les décisions", messages: "Ouvrir les messages", wallet: "Consulter le portefeuille", cases: "Tous les dossiers", home: "Accueil", notifications: "Notifications", profile: "Profil de l’agence", catalogue: "Actualités du catalogue", documents: "Documents", short: "Saisissez au moins 3 caractères pour rechercher un dossier.", long: "La recherche est limitée à 80 caractères.", shortcut: "Navigation", select: "Ouvrir" },
  en: { title: "What would you like to do?", search: "Search cases or actions", close: "Close", commands: "Quick actions", results: "Cases and actions", none: "No matching case. You can still run a full search.", loading: "Searching…", error: "Suggestions unavailable. Full search is still available.", all: "Search all cases", new: "Create a request", work: "Process outstanding cases", decisions: "View decisions", messages: "Open messages", wallet: "View wallet", cases: "All cases", home: "Home", notifications: "Notifications", profile: "Agency profile", catalogue: "Catalogue updates", documents: "Documents", short: "Enter at least 3 characters to search for a case.", long: "Search is limited to 80 characters.", shortcut: "Navigate", select: "Open" },
  ar: { title: "ماذا تريد أن تفعل؟", search: "ابحث عن طلب أو إجراء", close: "إغلاق", commands: "إجراءات سريعة", results: "الطلبات والإجراءات", none: "لا توجد طلبات مطابقة. يمكنك إجراء بحث كامل.", loading: "جارٍ البحث…", error: "الاقتراحات غير متاحة. لا يزال البحث الكامل متاحاً.", all: "البحث في جميع الطلبات", new: "إنشاء طلب", work: "معالجة الطلبات", decisions: "عرض القرارات", messages: "فتح الرسائل", wallet: "عرض المحفظة", cases: "جميع الطلبات", home: "الرئيسية", notifications: "الإشعارات", profile: "ملف الوكالة", catalogue: "تحديثات الخدمات", documents: "الوثائق", short: "أدخل 3 أحرف على الأقل للبحث عن طلب.", long: "الحد الأقصى للبحث 80 حرفاً.", shortcut: "التنقل", select: "فتح" },
};
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const paths: Record<string, string> = {
  new: "M12 5v14M5 12h14",
  wallet: "M3 6h17v14H3V6Zm0 0V4h14v2m0 5h4v5h-4Z",
  messages: "M4 4h16v12H9l-5 4V4Z",
  home: "M3 10 12 3l9 7v10h-6v-7H9v7H3Z",
  work: "m5 12 4 4L19 6",
  decisions: "M7 17 17 7M7 7h10v10",
  notifications: "M18 8a6 6 0 0 0-12 0c0 5-2 6-2 8h16c0-2-2-3-2-8Zm-8 11a2 2 0 0 0 4 0",
  profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
  catalogue: "M4 5h16v14H4ZM8 9h8m-8 4h8",
  documents: "M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6",
  cases: "M4 6h16M4 12h16M4 18h16",
  "all-results": "M16 16l4 4M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z",
};
function CommandIcon({ id }: { id: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d={paths[id] ?? paths.documents} /></svg>;
}
function safePortalHref(href: string) {
  // Reject external, protocol-relative, or malformed destinations.
  if (typeof href !== "string" || href.includes("\\") || /[\u0000-\u0020]/.test(href)) return false;
  return href === "/portal" || href.startsWith("/portal/") || href.startsWith("/portal?");
}

export function AgencyCommand({ locale, canCreate, canUpload, canWallet }: { locale: Locale; canCreate: boolean; canUpload: boolean; canWallet: boolean }) {
  const t = strings[locale], router = useRouter(), path = usePathname(), uid = useId();
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), previous = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false), [q, setQ] = useState(""), [active, setActive] = useState(0);
  const [remote, setRemote] = useState<{q: string; items: Item[]; error: boolean} | null>(null);
  const commands: Item[] = [
    { id: "cases", title: t.cases, href: "/portal/applications" },
    ...(canCreate ? [{ id: "new", title: t.new, href: "/portal/applications/new" }] : []),
    ...(canUpload ? [{ id: "work", title: t.work, href: "/portal/applications?documents=requested&sort=oldest&work=1" }, { id: "documents", title: t.documents, href: "/portal/documents" }] : []),
    { id: "decisions", title: t.decisions, href: "/portal/applications?focus=decision" },
    { id: "messages", title: t.messages, href: "/portal/communications" },
    ...(canWallet ? [{ id: "wallet", title: t.wallet, href: "/portal/wallet" }] : []),
    { id: "notifications", title: t.notifications, href: "/portal/notifications" },
    { id: "profile", title: t.profile, href: "/portal/profile" },
    { id: "catalogue", title: t.catalogue, href: "/portal/catalogue-updates" },
    { id: "home", title: t.home, href: "/portal" },
  ];
  const show = useCallback(() => {
    const node = dialog.current;
    if (!node || node.open || document.querySelector("dialog[open]")) return;
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQ(""); setRemote(null); setActive(0);
    node.showModal(); setOpen(true); input.current?.focus();
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing || e.repeat || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
      if (document.querySelector("dialog[open]") && !dialog.current?.open) return;
      e.preventDefault(); e.stopPropagation();
      if (dialog.current?.open) dialog.current.close(); else { const local=document.querySelector<HTMLInputElement>("[data-directory-shortcut]"); if(local){local.focus();local.select();return;} show(); }
    }
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [show]);
  useEffect(() => { dialog.current?.close(); }, [path]);

  const term = q.trim();
  useEffect(() => {
    if (!open || term.length < 3 || term.length > 80) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/agency/cases/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: term, filters: { sort: "recent" } }), cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json() as { items?: Item[] };
        if (!Array.isArray(data.items)) throw new Error("Invalid response");
        const valid = data.items.filter(item => item && typeof item.id === "string" && typeof item.title === "string" && safePortalHref(item.href));
        if (!controller.signal.aborted) setRemote({ q: term, items: valid, error: false });
      } catch {
        if (!controller.signal.aborted) setRemote({ q: term, items: [], error: true });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, term]);

  const local = commands.filter(c => fold(c.title).includes(fold(term)));
  const cases = remote?.q === term ? remote.items : [];
  const all: Item[] = term && term.length <= 80 ? [{ id: "all-results", title: t.all + " · " + term, href: "/portal/applications?q=" + encodeURIComponent(term) }] : [];
  const items = [...local, ...cases, ...all];
  const selected = Math.min(active, Math.max(0, items.length - 1));
  const pending = open && term.length >= 3 && term.length <= 80 && remote?.q !== term;
  const hint = !term ? t.commands : term.length < 3 ? t.short : term.length > 80 ? t.long : pending ? t.loading : remote?.error ? t.error : !cases.length ? t.none : "";
  function choose(item: Item) {
    if (!safePortalHref(item.href)) return;
    dialog.current?.close(); router.push(item.href);
  }
  function move(index: number) {
    const next = Math.max(0, Math.min(items.length - 1, index));
    setActive(next);
    document.getElementById(uid + "-" + next)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }
  return <>
    <button type="button" className="agency-command-trigger agency-command-in-header" aria-label={t.search} title={t.search + " (Ctrl / ⌘ K)"} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
      <CommandIcon id="all-results" /><kbd>Ctrl K</kbd>
    </button>
    <dialog ref={dialog} className="agency-command-dialog" aria-labelledby={uid + "-title"} dir={locale === "ar" ? "rtl" : "ltr"} onClose={() => { setOpen(false); setQ(""); setRemote(null); if (previous.current?.isConnected) previous.current.focus({ preventScroll: true }); }} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className="agency-command-inner">
        <header><h2 id={uid + "-title"}>{t.title}</h2><button type="button" aria-label={t.close} onClick={() => dialog.current?.close()}>×</button></header>
        <input ref={input} value={q} onChange={e => { const next=e.target.value; if(next.trim()!==q.trim()){setActive(0);setRemote(null);}setQ(next); }} placeholder={t.search} aria-label={t.search} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={uid + "-results"} aria-activedescendant={items[selected] ? uid + "-" + selected : undefined} onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); move(selected + (e.key === "ArrowDown" ? 1 : -1)); }
          if (e.key === "Enter" && items[selected]) { e.preventDefault(); choose(items[selected]!); }
        }} />
        <p role="status" aria-live="polite" style={{ minHeight: "1.5em", margin: 0 }}>{hint}</p>
        <div id={uid + "-results"} role="listbox" aria-label={t.results} aria-busy={pending} className="agency-command-results">
          {items.map((item, i) => <div key={item.id + ":" + i} id={uid + "-" + i} role="option" aria-selected={selected === i} onPointerMove={e => { if (e.pointerType === "mouse") setActive(i); }} onMouseDown={e => e.preventDefault()} onClick={() => choose(item)}>
            <span className="command-item-label"><span className="command-item-icon" style={{display:"grid",placeItems:"center"}}><CommandIcon id={item.id} /></span><span><strong><bdi>{item.title}</bdi></strong>{item.detail ? <small><bdi>{item.detail}</bdi></small> : null}</span></span>
            <span className="directional" aria-hidden="true">{locale === "ar" ? "←" : "→"}</span>
          </div>)}
        </div>
        <footer className="command-key-hints"><span><kbd>↑ ↓</kbd> {t.shortcut} · <kbd>Enter</kbd> {t.select}</span><span><kbd>Esc</kbd> {t.close}</span></footer>
      </div>
    </dialog>
  </>;
}
