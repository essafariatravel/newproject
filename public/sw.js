/* ESSAFARIA VISA OS — background Web Push. No offline caching of private pages. */
const copy = {
  fr: {
    DEFAULT: "Nouvelle notification. Ouvrez VISA OS pour consulter les détails.",
    APPLICATION_SUBMITTED: "Un nouveau dossier visa a été soumis.",
    APPLICATION_ASSIGNED: "Un dossier visa vous a été attribué.",
    DOCUMENT_REQUEST_FULFILLED: "Un document demandé vient d'être reçu.",
    MESSAGE_POSTED: "Un nouveau message est disponible.",
    REGISTRATION_SUBMITTED: "Une agence demande son inscription.",
    TOPUP_REQUESTED: "Une nouvelle demande de recharge est arrivée.",
    TEST: "Les notifications mobiles fonctionnent.",
  },
  en: {
    DEFAULT: "New notification. Open VISA OS for details.",
    APPLICATION_SUBMITTED: "A new visa application was submitted.",
    APPLICATION_ASSIGNED: "A visa application was assigned to you.",
    DOCUMENT_REQUEST_FULFILLED: "A requested document was received.",
    MESSAGE_POSTED: "A new message is available.",
    REGISTRATION_SUBMITTED: "A new agency registration is awaiting review.",
    TOPUP_REQUESTED: "A new wallet top-up request was submitted.",
    TEST: "Mobile notifications are working.",
  },
  ar: {
    DEFAULT: "إشعار جديد. افتح نظام التأشيرات للاطلاع على التفاصيل.",
    APPLICATION_SUBMITTED: "تم تقديم طلب تأشيرة جديد.",
    APPLICATION_ASSIGNED: "تم إسناد ملف تأشيرة إليك.",
    DOCUMENT_REQUEST_FULFILLED: "تم استلام مستند مطلوب.",
    MESSAGE_POSTED: "توجد رسالة جديدة.",
    REGISTRATION_SUBMITTED: "توجد وكالة جديدة تنتظر المراجعة.",
    TOPUP_REQUESTED: "تم تقديم طلب جديد لشحن الرصيد.",
    TEST: "إشعارات الهاتف تعمل بنجاح.",
  },
};
function safePath(raw) {
  if (typeof raw !== "string") return "/admin/notifications";
  try {
    const target = new URL(raw, self.location.origin);
    return target.origin === self.location.origin &&
      /^\/admin(?:\/|$)/.test(target.pathname)
      ? target.pathname + target.search + target.hash
      : "/admin/notifications";
  } catch { return "/admin/notifications"; }
}
self.addEventListener("push", function (event) {
  event.waitUntil((async () => {
    let value = {};
    try { value = event.data ? event.data.json() : {}; } catch { /* malformed payload */ }
    const language = ((self.navigator && self.navigator.language) || "fr").slice(0, 2);
    const strings = copy[language] || copy.fr;
    const kind = typeof value.kind === "string" ? value.kind : "DEFAULT";
    const body = strings[kind] || strings.DEFAULT;
    await self.registration.showNotification("ESSAFARIA VISA OS", {
      body,
      icon: "/images/essafaria-logo.png",
      tag: "essafaria-" + (kind === "TEST" ? "test" : String(Date.now())),
      data: { url: safePath(value.url) },
    });
  })());
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = new URL(safePath(event.notification.data?.url), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
