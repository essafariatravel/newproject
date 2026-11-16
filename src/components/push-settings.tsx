"use client";

import { useEffect, useState } from "react";

type Locale = "fr" | "en" | "ar";
const words = {
  fr: {
    title: "Notifications sur téléphone", intro: "Recevez les alertes VISA OS même lorsque le portail est fermé.",
    enabled: "Notifications activées sur cet appareil", disabled: "Notifications non activées",
    activate: "Activer sur cet appareil", deactivate: "Désactiver sur cet appareil",
    test: "Envoyer une notification test", unsupported: "Ce navigateur ne prend pas en charge Web Push.",
    install: "Sur iPhone : ouvrez le portail dans Safari, puis Partager → Sur l'écran d'accueil. Lancez VISA OS depuis son icône et réessayez.",
    blocked: "Notifications refusées dans les réglages du téléphone ou du navigateur.",
    setup: "Le service push n'est pas encore configuré par l'administrateur.",
    sent: "Notification test envoyée.", failed: "Impossible d'activer les notifications. Vérifiez les autorisations et réessayez.",
    device: "Chaque membre du Staff doit activer son propre téléphone.",
  },
  en: {
    title: "Phone notifications", intro: "Receive VISA OS alerts even while the portal is closed.",
    enabled: "Notifications enabled on this device", disabled: "Notifications not enabled",
    activate: "Enable on this device", deactivate: "Disable on this device",
    test: "Send a test notification", unsupported: "This browser does not support Web Push.",
    install: "On iPhone: open in Safari, Share → Add to Home Screen; launch VISA OS from its icon and retry.",
    blocked: "Notification permission is blocked in your browser or phone settings.",
    setup: "Push delivery is not yet configured by the administrator.",
    sent: "Test notification sent.", failed: "Notifications could not be enabled. Check permissions and try again.",
    device: "Every Staff member must enable their own phone.",
  },
  ar: {
    title: "إشعارات الهاتف", intro: "احصل على تنبيهات نظام التأشيرات حتى عند إغلاق الموقع.",
    enabled: "الإشعارات مفعلة على هذا الجهاز", disabled: "الإشعارات غير مفعلة",
    activate: "تفعيل على هذا الجهاز", deactivate: "إلغاء التفعيل على هذا الجهاز",
    test: "إرسال إشعار تجريبي", unsupported: "هذا المتصفح لا يدعم إشعارات الويب.",
    install: "على iPhone: افتح الموقع في Safari ثم مشاركة ← إضافة إلى الشاشة الرئيسية وأعد المحاولة.",
    blocked: "إذن الإشعارات محظور من إعدادات الهاتف أو المتصفح.",
    setup: "خدمة الإشعارات لم تُجهّز بعد.",
    sent: "تم إرسال الإشعار التجريبي.", failed: "تعذر تفعيل الإشعارات. تحقق من الأذونات.",
    device: "يجب على كل موظف تفعيل هاتفه بشكل مستقل.",
  },
} satisfies Record<Locale, Record<string, string>>;

function toBytes(key: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (key.length % 4)) % 4);
  const data = atob((key + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(data.length));
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  return bytes;
}

export function PushSettings({ locale }: { locale: Locale }) {
  const t = words[locale];
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [key, setKey] = useState("");
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    const eligible = typeof window !== "undefined" &&
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!eligible) { setSupported(false); setReady(true); return; }
    (async () => {
      try {
        const response = await fetch("/api/push", { cache: "no-store" });
        if (!response.ok) throw new Error("PUSH_UNAVAILABLE");
        const status = await response.json() as { configured: boolean; publicKey: string | null };
        const registration = await navigator.serviceWorker.getRegistration("/");
        const existing = await registration?.pushManager.getSubscription();
        if (live) {
          setConfigured(status.configured);
          setKey(status.publicKey || "");
          setActive(Boolean(existing));
        }
      } catch { if (live) setMessage(t.failed); }
      finally { if (live) setReady(true); }
    })();
    return () => { live = false; };
  }, [t.failed]);

  const iPhone = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
  const needsInstall = iPhone && !standalone;

  async function enable() {
    setMessage(""); setBusy(true);
    try {
      if (Notification.permission === "denied") throw new Error(t.blocked);
      const worker = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const subscription = await worker.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: toBytes(key),
      });
      const saved = await fetch("/api/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!saved.ok) {
        await subscription.unsubscribe();
        throw new Error(t.failed);
      }
      setActive(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : t.failed); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const saved = await fetch("/api/push", {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!saved.ok) throw new Error(t.failed);
        await subscription.unsubscribe();
      }
      setActive(false);
    } catch { setMessage(t.failed); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = await response.json() as { delivered?: number };
      setMessage(response.ok && (data.delivered || 0) > 0 ? t.sent : t.failed);
    } catch { setMessage(t.failed); }
    finally { setBusy(false); }
  }

  return <section className="mb-6 rounded-xl border border-line bg-white p-5" aria-labelledby="phone-push-title">
    <h2 id="phone-push-title" className="text-lg font-semibold text-navy-900">{t.title}</h2>
    <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
    {!ready ? <p role="status" className="mt-3 text-sm">…</p> :
      !supported ? <p className="mt-3 text-sm text-slate-600">{t.unsupported}</p> :
      !configured ? <p className="mt-3 text-sm text-slate-600">{t.setup}</p> :
      needsInstall ? <p className="mt-3 text-sm text-slate-600">{t.install}</p> :
      <>
        <p className="mt-3 text-sm font-medium text-navy-900">{active ? t.enabled : t.disabled}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={active ? disable : enable}>
            {active ? t.deactivate : t.activate}
          </button>
          {active ? <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={test}>{t.test}</button> : null}
        </div>
      </>}
    <p className="mt-3 text-xs text-slate-500">{t.device}</p>
    {message ? <p role="status" className="mt-3 text-sm text-slate-700">{message}</p> : null}
  </section>;
}
