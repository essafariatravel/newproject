import { AppError } from "@/lib/types";

export const CORE_WORKFLOW_CODES = ["DRAFT", "SUBMITTED", "DOCUMENTS_CHECKING", "DOCUMENTS_REQUESTED", "IN_PROCESS", "EMBASSY_SENT", "SENT_TO_EMBASSY", "APPROVED", "REJECTED", "CANCELLED"] as const;
export function assertWorkflowCode(code: string): void {
  // Historical aliases remain protected records, but cannot create new states
  // or edges unless the operational engine interprets their exact code.
  if (code === "SENT_TO_EMBASSY" || !(CORE_WORKFLOW_CODES as readonly string[]).includes(code)) throw new AppError("VALIDATION", "This status is not supported by the application workflow.");
}
export function assertMutableWorkflowState(code: string): void {
  if ((CORE_WORKFLOW_CODES as readonly string[]).includes(code)) throw new AppError("FORBIDDEN", "Core workflow statuses cannot be deleted or disabled.");
}
export function assertMutableDocumentType(code: string): void {
  if (code.startsWith("DECISION_")) throw new AppError("FORBIDDEN", "Official decision document types must remain active and cannot be deleted.");
}
export function assertProgrammeRequirementType(code: string): void {
  if (code.startsWith("DECISION_")) throw new AppError("FORBIDDEN", "Official decision files are recorded with the final decision, not requested in an Agency checklist.");
}
export function assertActiveProgrammeChecklist(active: boolean, agencyRequirements: number): void {
  if (active && agencyRequirements < 1) throw new AppError("VALIDATION", "An active visa must keep an active Agency upload requirement. Deactivate the visa before removing its last requirement.");
}
export function assertWorkflowTransition(from: string, to: string, scope: string): void {
  assertWorkflowCode(from); assertWorkflowCode(to);
  if (["APPROVED", "REJECTED", "CANCELLED"].includes(from) || to === "DRAFT" || (from === "DRAFT" && !["SUBMITTED", "CANCELLED"].includes(to))) {
    throw new AppError("VALIDATION", "This transition bypasses the supported submission or final-decision workflow.");
  }
  if (scope !== "STAFF" && !(from === "DRAFT" && ["SUBMITTED", "CANCELLED"].includes(to))) {
    throw new AppError("FORBIDDEN", "Agency users can submit or cancel their drafts. Operational processing transitions must remain Staff-only.");
  }
}
export function validateVisaActivation(input: { countryActive: boolean; categoryActive: boolean; name: string; nameFr: string | null; nameAr: string | null; fee: string; minDays: number; maxDays: number; agencyRequirements: number }): void {
  if (!input.countryActive || !input.categoryActive) throw new AppError("VALIDATION", "Activate the country and category before this visa.");
  if (![input.name, input.nameFr, input.nameAr].every(value => value?.trim())) throw new AppError("VALIDATION", "English, French and Arabic visa names are required for activation.");
  if (!Number.isFinite(Number(input.fee)) || Number(input.fee) < 0) throw new AppError("VALIDATION", "Enter a valid DZD fee.");
  if (!((input.minDays === 0 && input.maxDays === 0) || (input.minDays > 0 && input.maxDays >= input.minDays))) throw new AppError("VALIDATION", "Choose on-request processing or a valid working-day range.");
  if (input.agencyRequirements < 1) throw new AppError("VALIDATION", "Add an active Agency-provided document checklist before activation.");
}
