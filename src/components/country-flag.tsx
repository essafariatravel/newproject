import { countryFlagPath } from "@/lib/country-flag-assets";

/** Decorative country flag: visible country name is rendered by the caller. */
export function CountryFlag({iso,className="dash-flag"}:{iso?:string|null;className?:string}){
 const src=countryFlagPath(iso);
 const classes="agency-country-flag "+className;
 if(!src)return <svg className={classes} aria-hidden="true" viewBox="0 0 26 18" width="26" height="18" fill="none" stroke="#647182" strokeWidth="1.1"><circle cx="13" cy="9" r="7"/><ellipse cx="13" cy="9" rx="3" ry="7"/><path d="M6 9h14"/></svg>;
 // eslint-disable-next-line @next/next/no-img-element
 return <img className={classes} src={src} alt="" aria-hidden="true" width={26} height={18} decoding="async"/>;
}
