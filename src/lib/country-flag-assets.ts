// Vendored flag-icons assets; keep this inventory in sync with public/flags.
export const COUNTRY_FLAG_CODES = ["AE","AM","AZ","BJ","BT","CA","CN","DE","DJ","EG","ES","ET","FR","GB","ID","IN","IT","JO","JP","KH","LB","LK","MA","MG","NL","OM","QA","SA","TH","TR","TZ","UG","US","UZ","VN","ZA"] as const;
const supported = new Set<string>(COUNTRY_FLAG_CODES);
export function countryFlagPath(iso?: string | null): string | null {
 const code=iso?.trim().toUpperCase()??"";
 return supported.has(code)?"/flags/"+code.toLowerCase()+".svg":null;
}
