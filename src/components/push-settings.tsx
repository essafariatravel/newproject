"use client";

import { useEffect, useState } from "react";
import { pushAvailability, isIOSLikeDevice } from "@/lib/push-capabilities";

type Locale = "fr" | "en" | "ar";
const words = {
  fr: {
    title: "Notifications sur téléphone", intro: "Recevez les alertes VISA OS même lorsque le portail est fermé.",
    enabled: "Notifications activées sur cet appareil", disabled: "Notifications non activées",
    activate: "Activer sur cet appareil", deactivate: "Désactiver sur cet appareil",
    test: "Envoyer une notification test", unsupported: "Ce navigateur ne prend pas en charge Web Push. Sur Android, utilisez une version récente de Chrome hors navigateur intégré.",
    iosUnsupported: "Web Push nécessite iOS 16.4 ou ultérieur et VISA OS installé comme application sur l’écran d’accueil. Vérifiez votre version iOS et ouvrez l’icône de VISA OS.",
    install: "Sur iPhone : ouvrez le portail dans Safari, puis Partager → Sur l'écran d'accueil. Lancez VISA OS depuis son icône et réessayez.",
    blocked: "Notifications refusées dans les réglages du téléphone ou du navigateur.",
    setup: "Le service push n'est pas encore configuré par l'administrateur.",
    sent: "Notification test envoyée.", failed: "Impossible d'activer les notifications. Vérifiez les autorisations et réessayez.",
    device: "Chaque membre du Staff doit activer son propre téléphone.",
    revokeAll: "Révoquer tous les appareils",
    revoked: "Tous les appareils ont été révoqués.",
    confirmRevoke: "Révoquer les notifications de tous vos appareils ? Vous devrez les réactiver un par un.",
    rateLimited: "Trop de tests. Veuillez réessayer dans une minute.",
    alreadyOwned: "Cet appareil est déjà lié à un autre compte. Révoquez-le depuis ce compte avant de le réactiver.",
  },
  en: {
    title: "Phone notifications", intro: "Receive VISA OS alerts even while the portal is closed.",
    enabled: "Notifications enabled on this device", disabled: "Notifications not enabled",
    activate: "Enable on this device", deactivate: "Disable on this device",
    test: "Send a test notification", unsupported: "This browser does not support Web Push. On Android, use an up-to-date Chrome browser instead of an in-app browser.",
    iosUnsupported: "Web Push requires iOS 16.4 or later and VISA OS installed as a Home Screen web app. Check your iOS version and launch VISA OS from its icon.",
    install: "On iPhone: open in Safari, Share → Add to Home Screen; launch VISA OS from its icon and retry.",
    blocked: "Notification permission is blocked in your browser or phone settings.",
    setup: "Push delivery is not yet configured by the administrator.",
    sent: "Test notification sent.", failed: "Notifications could not be enabled. Check permissions and try again.",
    device: "Every Staff member must enable their own phone.",
    revokeAll: "Revoke all devices",
    revoked: "All devices have been revoked.",
    confirmRevoke: "Stop notifications on all devices? You will need to re-enable them individually.",
    rateLimited: "Too many tests. Try again in one minute.",
    alreadyOwned: "This device belongs to another account. Revoke it from the previous account before enrolling.",
  },
  ar: {
    title: "إشعارات الهاتف", intro: "احصل على تنبيهات نظام التأشيرات حتى عند إغلاق الموقع.",
    enabled: "الإشعارات مفعلة على هذا الجهاز", disabled: "الإشعارات غير مفعلة",
    activate: "تفعيل على هذا الجهاز", deactivate: "إلغاء التفعيل على هذا الجهاز",
    test: "إرسال إشعار تجريبي", unsupported: "هذا المتصفح لا يدعم إشعارات الويب. على أندرويد استخدم أحدث إصدار من Chrome خارج المتصفح المدمج.",
    iosUnsupported: "تتطلب الإشعارات iOS 16.4 أو أحدث وتثبيت VISA OS على الشاشة الرئيسية. تحقق من إصدار iOS وافتح التطبيق من أيقونته.",
    install: "على iPhone: افتح الموقع في Safari ثم مشاركة ← إضافة إلى الشاشة الرئيسية وأعد المحاولة.",
    blocked: "إذن الإشعارات محظور من إعدادات الهاتف أو المتصفح.",
    setup: "خدمة الإشعارات لم تُجهّز بعد.",
    sent: "تم إرسال الإشعار التجريبي.", failed: "تعذر تفعيل الإشعارات. تحقق من الأذونات.",
    device: "يجب على كل موظف تفعيل هاتفه بشكل مستقل.",
    revokeAll: "إلغاء ربط جميع الأجهزة",
    revoked: "تم إلغاء ربط جميع الأجهزة.",
    confirmRevoke: "هل تريد إلغاء ربط جميع الأجهزة؟ يجب تفعيلها مرة أخرى لاحقًا.",
    rateLimited: "اختبارات كثيرة. حاول مجددًا بعد دقيقة.",
    alreadyOwned: "هذا الجهاز مرتبط بحساب آخر. ألغِ ربطه من الحساب السابق أولًا.",
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
  const [deviceCount, setDeviceCount] = useState(0);
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
        const status = await response.json() as { configured: boolean; publicKey: string | null; registeredHashes: string[]; devices: number };
        const registration = await navigator.serviceWorker.getRegistration("/");
        const existing = await registration?.pushManager.getSubscription();
        let isRegistered = false;
        if (existing) {
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(existing.endpoint));
          const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
          isRegistered = status.registeredHashes.includes(hash);
        }
        if (live) {
          // Prepare the worker before the user tap: Safari requires the actual
          // PushManager.subscribe call to be initiated by a user gesture.
          if (status.configured) {
            void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
          }
          setConfigured(status.configured);
          setKey(status.publicKey || "");
          setActive(isRegistered);
          setDeviceCount(status.devices);
        }
      } catch { if (live) setMessage(t.failed); }
      finally { if (live) setReady(true); }
    })();
    return () => { live = false; };
  }, [t.failed]);

  const iPhone = typeof navigator !== "undefined" &&
    isIOSLikeDevice(navigator.userAgent, navigator.maxTouchPoints);
  const standalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
  // iOS Safari/Chrome tabs intentionally do not expose PushManager. Show the
  // installation instructions BEFORE treating the browser as unsupported.
  const availability = pushAvailability(iPhone, standalone, supported);

  async function enable() {
    setMessage(""); setBusy(true);
    try {
      if (Notification.permission === "denied") throw new Error(t.blocked);
      // On iOS this request MUST start in the user's tap handler. Do not
      // await service-worker registration or an API call before prompting.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(t.blocked);
      const worker = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const subscription = await worker.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: toBytes(key),
      });
      const saved = await fetch("/api/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!saved.ok) {
        if (saved.status !== 409) await subscription.unsubscribe();
        throw new Error(saved.status === 409 ? t.alreadyOwned : saved.status === 429 ? t.rateLimited : t.failed);
      }
      setActive(true);
      setDeviceCount(n => n + 1);
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
      setDeviceCount(n => Math.max(0, n - 1));
    } catch { setMessage(t.failed); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = await response.json() as { delivered?: number };
      setMessage(response.status === 429 ? t.rateLimited : response.ok && (data.delivered || 0) > 0 ? t.sent : t.failed);
    } catch { setMessage(t.failed); }
    finally { setBusy(false); }
  }

  async function revokeAll() {
    if (!window.confirm(t.confirmRevoke)) return;
    setBusy(true); setMessage("");
    try {
      const result = await fetch("/api/push", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!result.ok) throw new Error(t.failed);
      const registration = await navigator.serviceWorker.getRegistration("/");
      const existing = await registration?.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      setActive(false);
      setDeviceCount(0);
      setMessage(t.revoked);
    } catch { setMessage(t.failed); }
    finally { setBusy(false); }
  }

  return <section className="mb-6 rounded-xl border border-line bg-white p-5" aria-labelledby="phone-push-title">
    <h2 id="phone-push-title" className="text-lg font-semibold text-navy-900">{t.title}</h2>
    <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
    {!ready ? <p role="status" className="mt-3 text-sm">…</p> :
      availability === "install" ? <p role="status" className="mt-3 text-sm text-slate-600">{t.install}</p> :
      availability === "unsupported" ? <p role="status" className="mt-3 text-sm text-slate-600">{iPhone ? t.iosUnsupported : t.unsupported}</p> :
      !configured ? <p className="mt-3 text-sm text-slate-600">{t.setup}</p> :
      <>
        <p className="mt-3 text-sm font-medium text-navy-900">{active ? t.enabled : t.disabled}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={active ? disable : enable}>
            {active ? t.deactivate : t.activate}
          </button>
          {active ? <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={test}>{t.test}</button> : null}
          {deviceCount > 0 ? <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={revokeAll}>{t.revokeAll} ({deviceCount})</button> : null}
        </div>
      </>}
    <p className="mt-3 text-xs text-slate-500">{t.device}</p>
    {message ? <p role="status" className="mt-3 text-sm text-slate-700">{message}</p> : null}
  </section>;
}
