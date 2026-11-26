import { cookies } from "next/headers";
import { AGENCY_PREF_COOKIE,parsePrefs } from "./agency-preference-values";
export async function readAgencyPrefs(userId:string){return parsePrefs((await cookies()).get(AGENCY_PREF_COOKIE)?.value,userId)}
