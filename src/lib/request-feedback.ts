import { contentT } from "@/lib/i18n-content";
import type { UiLocale } from "@/lib/ui-i18n";

const EN: Record<string, string> = {
  FILE_TOO_LARGE:"Files must be 2 MB or smaller.", EMPTY_FILE:"The uploaded file is empty. Select a file and try again.",
  UNSUPPORTED_TYPE:"Choose a supported file format: PDF, JPEG, PNG, WebP, DOC or DOCX.", INVALID_FILENAME:"Choose a valid file name.",
  REQUIRED_DOCUMENT_MISSING:"A required document is missing.", INSUFFICIENT_FUNDS:"The wallet balance is insufficient for this request.",
  VISA_TYPE_INVALID:"This programme is unavailable. Refresh the catalogue, choose an available programme and review the price and documents again.",
  COUNTRY_INVALID:"This programme is unavailable. Refresh the catalogue, choose an available programme and review the price and documents again.",
  PRIORITY_INVALID:"The selected priority is unavailable. Refresh the catalogue and review your request again.",
  VISA_TYPE_REQUIRED:"Choose a visa programme.", COUNTRY_REQUIRED:"Choose a destination.",
  COUNTRY_VISA_MISMATCH:"Choose a programme for the selected destination.",
  APPLICANT_REQUIRED:"Enter the traveller’s full name and nationality.", APPLICANT_FULL_NAME:"Enter the traveller’s full name.",
  APPLICANT_NATIONALITY:"Choose the traveller’s nationality.", APPLICANT_NATIONALITY_INVALID:"Choose a nationality from the list.",
  APPLICANT_LIMIT:"A request must contain exactly one traveller.", NOTES_TOO_LONG:"Notes must be 1000 characters or fewer.",
  FORBIDDEN:"You cannot submit this request. Contact your agency administrator.",
  UNAUTHENTICATED:"Your session has expired. Sign in again to continue.",
  VALIDATION:"Please check the form values and try again.", INTERNAL:"Something went wrong. Please try again.",
  NETWORK:"The connection was interrupted. Check your connection and try again. Your selected files are kept on this page.",
};
const CATALOGUE = new Set(["VISA_TYPE_INVALID","COUNTRY_INVALID","PRIORITY_INVALID","COUNTRY_VISA_MISMATCH"]);
class RequestFailure extends Error { constructor(readonly code: string) {super(code);} }
export function requestErrorMessage(code: string, locale: UiLocale): string {
  const known = EN[code] ? code : "INTERNAL";
  const ct=contentT(locale);
  if (locale === "en") return EN[known]!;
  if (CATALOGUE.has(known)) return ct(EN.VISA_TYPE_INVALID!);
  if (["NETWORK","UNAUTHENTICATED","VALIDATION","INTERNAL"].includes(known)) return ct(EN[known]!);
  const translated=ct(`request.error.${known}`);
  return translated.startsWith("request.error.") ? ct(EN.INTERNAL!) : translated;
}
export async function readRequestResponse<T extends object>(response: Response, _locale: UiLocale): Promise<T> {
  let data: Record<string, unknown>;
  try { data=await response.json(); } catch {throw new RequestFailure("NETWORK");}
  if (!response.ok) throw new RequestFailure(typeof data.code === "string" ? data.code : response.status === 401 ? "UNAUTHENTICATED" : "INTERNAL");
  return data as T;
}
export function requestFailureFeedback(error: unknown, locale: UiLocale) {
  const code=error instanceof RequestFailure ? error.code : "NETWORK";
  return {message:requestErrorMessage(code,locale),catalogue:CATALOGUE.has(code),session:code === "UNAUTHENTICATED"};
}
export function registrationUploadProblem(file: File): string | null {
  if (file.size > 2*1024*1024) return "FILE_TOO_LARGE";
  const extensions: Record<string,string[]> = {"application/pdf":["pdf"],"image/jpeg":["jpg","jpeg"],"image/png":["png"],"image/webp":["webp"]};
  if (!file.size || !extensions[file.type]?.includes(file.name.split(".").at(-1)?.toLowerCase() ?? "")) return "UNSUPPORTED_TYPE";
  return null;
}
