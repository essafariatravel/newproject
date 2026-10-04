import { settingObject, settingString, type SiteSettingsMap } from "@/lib/settings";

/** Omit demonstration contact details shipped in the seed data. */
export function publicContactDetails(settings: SiteSettingsMap) {
  const email = settingString(settings, "site.contactEmail").trim();
  const phone = settingString(settings, "site.contactPhone").trim();
  const address = settingString(settings, "site.address").trim();
  const officeHours = settingString(settings, "site.officeHours").trim();
  const social = Object.fromEntries(
    Object.entries(settingObject(settings, "site.social")).flatMap(([name, value]) => {
      if (typeof value !== "string") return [];
      const url = value.trim();
      if (!url || url.replace(/\/$/, "").toLowerCase() === "https://www.linkedin.com/company/essafaria") return [];
      try { if (!["http:","https:"].includes(new URL(url).protocol)) return []; } catch { return []; }
      return [[name,url]];
    }),
  );
  return {
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.toLowerCase().endsWith(".example") ? "" : email,
    phone: phone.replace(/\s/g, "") === "+212500000000" ? "" : phone,
    address: address.toLowerCase() === "boulevard mohammed v, casablanca, morocco" ? "" : address,
    officeHours: officeHours === "Monday – Friday, 09:00 – 18:00 (GMT+1)" ? "" : officeHours,
    social,
  };
}
