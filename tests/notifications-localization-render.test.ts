import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuthUser } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getUiLocale: vi.fn(async (sp?: Record<string, unknown>) => String(sp?.lang ?? "en")),
  listNotificationsForUser: vi.fn(),
}));

vi.mock("@/lib/ui-i18n", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/ui-i18n")>()),
  getUiLocale: mocks.getUiLocale,
}));
vi.mock("@/lib/queries", () => ({
  listNotificationsForUser: mocks.listNotificationsForUser,
  unreadNotificationCount: vi.fn(async () => 0),
}));
vi.mock("@/app/actions/communications", () => ({ markNotificationsReadAction: vi.fn() }));

import { NotificationsPage } from "@/components/notifications-page";

const staff = { id: "staff", agencyId: null } as AuthUser;
const agencyUser = { id: "agency", agencyId: "agency-1" } as AuthUser;
const notification = {
  id: "notification-1", type: "DOCUMENT_REQUESTED", readAt: new Date(),
  createdAt: new Date("2026-11-10T14:15:00Z"),
  link: "/portal/applications/app-1", agencyName: "EPE/SPA REMCHAVI",
  travellerName: "BOB", destination: "CHINA", countryIso2: "CN",
  visaName: "First-Time Sticker Visa (30D/90D)",
  visaNameFr: "Visa autocollant – première demande (30 j/90 j)",
  visaNameAr: "تأشيرة ملصقة – طلب أول (30 يومًا/90 يومًا)",
  reference: "EVT-26-JP73AGVV",
  body: "PASSPORT FLOU RENVOYER UN AUTRE D'UNE MEILLEURE QUALITE",
};

describe("notification details rendered in the chosen language", () => {
  it.each([
    ["en", "CHINA", notification.visaName],
    ["fr", "Chine", notification.visaNameFr],
    ["ar", "الصين", notification.visaNameAr],
  ] as const)("renders %s for both audiences while leaving user text intact", async (locale, country, visa) => {
    mocks.listNotificationsForUser.mockResolvedValue([notification]);
    for (const user of [staff, agencyUser]) {
      const html = renderToStaticMarkup(await NotificationsPage({
        user, basePath: user.agencyId ? "/portal/notifications" : "/admin/notifications", sp: { lang: locale },
      }));
      expect(html).toContain(`<bdi>${country}</bdi>`);
      expect(html).toContain(`<bdi>${visa}</bdi>`);
      expect(html).toContain("<bdi>BOB</bdi>");
      expect(html.replaceAll("&#x27;", "'")).toContain(notification.body);
      if (locale !== "en") expect(html).not.toContain(`<bdi>${notification.visaName}</bdi>`);
      if (user.agencyId) expect(html).not.toContain("EPE/SPA REMCHAVI");
      else expect(html).toContain("EPE/SPA REMCHAVI");
    }
  });

  it("keeps an unconfigured historical programme name instead of guessing a translation", async () => {
    mocks.listNotificationsForUser.mockResolvedValue([{ ...notification, visaNameFr: null, visaNameAr: null }]);
    for (const lang of ["fr", "ar"]) {
      const html = renderToStaticMarkup(await NotificationsPage({ user: staff, basePath: "/admin/notifications", sp: { lang } }));
      expect(html).toContain(`<bdi>${notification.visaName}</bdi>`);
    }
  });
});
