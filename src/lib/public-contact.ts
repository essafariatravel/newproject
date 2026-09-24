import { settingObject, settingString, type SiteSettingsMap } from "@/lib/settings";

/** Omit demonstration contact details shipped in the seed data. */
export function publicContactDetails(settings: SiteSettingsMap) {
  const email = settingString(settings, "site.contactEmail");
  const phone = settingString(settings, "site.contactPhone");
  const address = settingString(settings, "site.address");
  const officeHours = settingString(settings, "site.officeHours");
  const social = Object.fromEntries(
    Object.entries(settingObject(settings, "site.social")).filter(
      ([, url]) => url && url !== "https://www.linkedin.com/company/essafaria",
    ),
  );
  return {
    email: email.endsWith(".example") ? "" : email,
    phone: phone === "+212 5 00 00 00 00" ? "" : phone,
    address: address === "Boulevard Mohammed V, Casablanca, Morocco" ? "" : address,
    officeHours: officeHours === "Monday – Friday, 09:00 – 18:00 (GMT+1)" ? "" : officeHours,
    social,
  };
}
