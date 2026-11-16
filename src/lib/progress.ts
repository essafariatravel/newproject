/**
 * §17/§18 — data-driven progress for an application.
 *
 * The old overview rendered a FIXED chip strip (Submitted → Documents
 * checking → In process → Completed) with an embassy step that did not exist
 * for most programmes — a false progress claim. This module derives the strip
 * from what actually happened:
 *
 *   - steps come from the persisted status history (never from a hardcoded
 *     story), so a step is only "done" when the application really visited it,
 *   - the embassy stage appears only when the visa programme declares it
 *     (APPLICABLE) or when the dossier has genuinely been there,
 *   - every reached step carries its real timestamp, and the current step is
 *     the live status.
 */
import type { EmbassyApplicability } from "@/lib/queries";

export type ProgressStepState = "done" | "current" | "pending";

export interface ProgressStep {
  /** Stable key for tests and translation lookup. */
  key: "submitted" | "documents" | "processing" | "embassy" | "decision";
  /** English source label (translated by the caller). */
  label: string;
  state: ProgressStepState;
  /** Real timestamp of the transition that reached this step, if any. */
  at: Date | null;
}

export interface ProgressHistoryRow {
  toStatusCode: string;
  createdAt: Date;
}

const DECISION_CODES = new Set(["APPROVED", "REJECTED", "COMPLETED", "REFUSED"]);
/** Statuses that mean "the dossier is with the embassy". */
const EMBASSY_CODES = new Set(["EMBASSY_SENT", "EMBASSY_SUBMISSION"]);

function firstAt(history: ProgressHistoryRow[], codes: Set<string>): Date | null {
  const hits = history.filter((h) => codes.has(h.toStatusCode)).map((h) => h.createdAt);
  if (hits.length === 0) return null;
  return hits.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

export function buildProgress(input: {
  statusCode: string;
  history: ProgressHistoryRow[];
  embassyApplicability?: EmbassyApplicability | string | null;
}): ProgressStep[] {
  const { statusCode, history } = input;
  const embassyApplicable = input.embassyApplicability === "APPLICABLE";
  const embassyVisited = history.some((h) => EMBASSY_CODES.has(h.toStatusCode)) || EMBASSY_CODES.has(statusCode);
  const includeEmbassy = embassyApplicable || embassyVisited;

  const inDecision = DECISION_CODES.has(statusCode);
  const steps: ProgressStep[] = [
    {
      key: "submitted",
      label: "Submitted",
      state: "done",
      at: firstAt(history, new Set(["SUBMITTED"])) ?? firstAt(history, new Set(["DRAFT"])) ?? null,
    },
    {
      key: "documents",
      label: "Documents",
      state: "pending",
      at: firstAt(history, new Set(["DOCUMENTS_CHECKING", "DOCUMENTS_REQUESTED"])),
    },
    {
      key: "processing",
      label: "In process",
      state: "pending",
      at: firstAt(history, new Set(["IN_PROCESS"])),
    },
  ];
  if (includeEmbassy) {
    steps.push({
      key: "embassy",
      label: "Sent to embassy",
      state: "pending",
      at: firstAt(history, EMBASSY_CODES),
    });
  }
  steps.push({ key: "decision", label: "Decision", state: "pending", at: firstAt(history, DECISION_CODES) });

  // Current position: the first step the live status maps to, otherwise the
  // last step whose timestamp exists, otherwise the beginning.
  const currentKey: ProgressStep["key"] | null = inDecision
    ? "decision"
    : EMBASSY_CODES.has(statusCode)
      ? "embassy"
      : statusCode === "IN_PROCESS"
        ? "processing"
        : statusCode === "DOCUMENTS_CHECKING" || statusCode === "DOCUMENTS_REQUESTED"
          ? "documents"
          : statusCode === "SUBMITTED"
            ? "submitted"
            : null;

  let reachedCurrent = false;
  for (const step of steps) {
    if (currentKey && step.key === currentKey) {
      step.state = "current";
      reachedCurrent = true;
      continue;
    }
    if (reachedCurrent) {
      step.state = step.at ? "done" : "pending";
      continue;
    }
    if (step.at) {
      step.state = "done";
    } else {
      step.state = "pending";
    }
  }
  // Terminal outcomes are finished business: nothing stays "current" in a
  // decision state when the strip ends there.
  if (inDecision) {
    for (const step of steps) if (step.state === "current" && step.key === "decision") step.state = "done";
  }
  return steps;
}
