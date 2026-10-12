import "./lib/load-env";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

type ExplainFile = {
  plans?: Array<{
    name: string;
    executionMs?: number;
    findings?: Array<{ code?: string }>;
    nodes?: Array<{ nodeType?: string; relation?: string }>;
  }>;
};

type Candidate = {
  id: string;
  table: string;
  columns: string[];
  predicate?: string;
  evidenceQueries: string[];
  measuredExecutionMs?: number;
  rationale: string;
  candidateSql: string;
};

const candidates: Candidate[] = [
  {
    id: "applications_agency_created",
    table: "applications",
    columns: ["agency_id", "created_at"],
    evidenceQueries: ["agency_applications_first_page"],
    rationale: "Tenant application lists are scoped by agency and ordered by newest first.",
    candidateSql: "create index concurrently if not exists applications_agency_created_idx on <schema>.applications (agency_id, created_at desc);"
  },
  {
    id: "applications_assigned_created",
    table: "applications",
    columns: ["assigned_to", "created_at"],
    evidenceQueries: [],
    rationale: "Staff queues filter assigned/unassigned dossiers and sort by recency. No current synthetic EXPLAIN case matches this predicate, so this remains review-only until that query shape is measured.",
    candidateSql: "create index concurrently if not exists applications_assigned_created_idx on <schema>.applications (assigned_to, created_at desc);"
  },
  {
    id: "applications_country_created",
    table: "applications",
    columns: ["country_id", "created_at"],
    evidenceQueries: [],
    rationale: "Country filters can become material at scale. The current country report groups by country but does not filter by country_id, so it is not valid evidence for this index.",
    candidateSql: "create index concurrently if not exists applications_country_created_idx on <schema>.applications (country_id, created_at desc);"
  },
  {
    id: "applications_visa_type_created",
    table: "applications",
    columns: ["visa_type_id", "created_at"],
    evidenceQueries: [],
    rationale: "Visa-type filtering is a real staff/agency list dimension, but the current synthetic EXPLAIN pack does not isolate that predicate.",
    candidateSql: "create index concurrently if not exists applications_visa_type_created_idx on <schema>.applications (visa_type_id, created_at desc);"
  },
  {
    id: "applications_priority_created",
    table: "applications",
    columns: ["priority_id", "created_at"],
    evidenceQueries: [],
    rationale: "Priority queues are filtered/sorted operationally, but the current synthetic EXPLAIN pack does not isolate that predicate.",
    candidateSql: "create index concurrently if not exists applications_priority_created_idx on <schema>.applications (priority_id, created_at desc);"
  },
  {
    id: "notifications_unread_user",
    table: "notifications",
    columns: ["user_id"],
    predicate: "read_at is null",
    evidenceQueries: ["notifications_unread_count"],
    measuredExecutionMs: 50,
    rationale: "Unread counts are polled frequently and should avoid scanning already-read rows if volume becomes large.",
    candidateSql: "create index concurrently if not exists notifications_unread_user_idx on <schema>.notifications (user_id) where read_at is null;"
  },
  {
    id: "audit_agency_created",
    table: "audit_logs",
    columns: ["agency_id", "created_at"],
    evidenceQueries: [],
    rationale: "Audit filters commonly combine tenant scope with reverse chronological order. The current audit benchmark filters synthetic action, not agency_id, so it cannot justify this index.",
    candidateSql: "create index concurrently if not exists audit_logs_agency_created_idx on <schema>.audit_logs (agency_id, created_at desc);"
  },
  {
    id: "audit_actor_created",
    table: "audit_logs",
    columns: ["actor_id", "created_at"],
    evidenceQueries: [],
    rationale: "Actor-filtered audit review should not require a full audit scan at high volume. The current audit benchmark does not filter actor_id, so it cannot justify this index.",
    candidateSql: "create index concurrently if not exists audit_logs_actor_created_idx on <schema>.audit_logs (actor_id, created_at desc);"
  },
  {
    id: "documents_checklist_item",
    table: "documents",
    columns: ["checklist_item_id"],
    evidenceQueries: [],
    rationale: "Document workflows repeatedly resolve the latest upload for checklist slots. The current document benchmark filters status and does not query checklist_item_id.",
    candidateSql: "create index concurrently if not exists documents_checklist_item_idx on <schema>.documents (checklist_item_id);"
  },
  {
    id: "status_history_application_created",
    table: "application_status_history",
    columns: ["application_id", "created_at"],
    evidenceQueries: [],
    rationale: "Aging filters resolve the latest transition per application. The current EXPLAIN pack does not measure this lookup shape directly.",
    candidateSql: "create index concurrently if not exists application_status_history_application_created_idx on <schema>.application_status_history (application_id, created_at desc);"
  }
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/"/g, "");
}

function covers(indexdef: string, candidate: Candidate): boolean {
  const def = normalize(indexdef);
  let cursor = -1;
  for (const column of candidate.columns) {
    const next = def.indexOf(column.toLowerCase(), cursor + 1);
    if (next < 0) return false;
    cursor = next;
  }
  if (candidate.predicate && !def.includes(normalize(candidate.predicate))) return false;
  return true;
}

async function loadExplain(path?: string): Promise<ExplainFile | null> {
  if (!path) return null;
  return JSON.parse(await readFile(path, "utf8")) as ExplainFile;
}

function evidenceFor(candidate: Candidate, explain: ExplainFile | null) {
  if (!explain?.plans) return { observed: false, signals: [] as string[] };
  const plans = explain.plans.filter((plan) => candidate.evidenceQueries.includes(plan.name));
  const signals = plans.flatMap((plan) => (plan.findings ?? []).map((finding) => `${plan.name}:${finding.code ?? "UNKNOWN"}`));
  // A sequential scan alone is not sufficient evidence for a new index:
  // synthetic dataset-marker predicates can legitimately cause scans that do not
  // correspond to a production filter. Escalate only when the measured plan is
  // actually slow or spills to temporary/disk I/O.
  const executionThresholdMs = candidate.measuredExecutionMs ?? 100;
  const observed = plans.some((plan) =>
    Number(plan.executionMs ?? 0) >= executionThresholdMs
    || (plan.findings ?? []).some((finding) => ["EXECUTION_GT_100MS", "EXECUTION_GT_500MS", "DISK_TEMP_IO"].includes(String(finding.code)))
  );
  return { observed, signals };
}

async function main() {
  const target = assertSafePerfTarget();
  const explain = await loadExplain(process.env.PERF_EXPLAIN_INPUT);
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });

  try {
    const indexes = await pool.query<{
      tablename: string;
      indexname: string;
      indexdef: string;
    }>(`
      select tablename,indexname,indexdef
        from pg_indexes
       where schemaname=$1
       order by tablename,indexname
    `, [target.schema]);

    const tableStats = await pool.query<{
      relname: string;
      n_live_tup: string;
      seq_scan: string;
      idx_scan: string;
    }>(`
      select relname,n_live_tup::text,seq_scan::text,coalesce(idx_scan,0)::text idx_scan
        from pg_stat_user_tables
       where schemaname=$1
    `, [target.schema]);

    const stats = new Map(tableStats.rows.map((row) => [row.relname, row]));
    const output = candidates.map((candidate) => {
      const current = indexes.rows.filter((idx) => idx.tablename === candidate.table);
      const matched = current.filter((idx) => covers(idx.indexdef, candidate));
      const evidence = evidenceFor(candidate, explain);
      const stat = stats.get(candidate.table);
      const liveRows = Number(stat?.n_live_tup ?? 0);
      let recommendation: "ALREADY_COVERED" | "REVIEW_IF_MEASURED" | "MEASURED_CANDIDATE" | "DEFER_SMALL_TABLE";
      if (matched.length) recommendation = "ALREADY_COVERED";
      else if (liveRows > 0 && liveRows < 1000 && !evidence.observed) recommendation = "DEFER_SMALL_TABLE";
      else if (evidence.observed) recommendation = "MEASURED_CANDIDATE";
      else recommendation = "REVIEW_IF_MEASURED";

      return {
        id: candidate.id,
        table: candidate.table,
        liveRows,
        seqScans: Number(stat?.seq_scan ?? 0),
        indexScans: Number(stat?.idx_scan ?? 0),
        recommendation,
        matchedIndexes: matched.map((idx) => ({ name: idx.indexname, definition: idx.indexdef })),
        evidence,
        rationale: candidate.rationale,
        candidateSql: matched.length ? null : candidate.candidateSql.replaceAll("<schema>", target.schema),
      };
    });

    const result = {
      generatedAt: new Date().toISOString(),
      target: safeTargetSummary(target),
      explainInput: process.env.PERF_EXPLAIN_INPUT ?? null,
      policy: "No index is created by this script. Evidence must match the proposed index predicate/order shape; unrelated slow synthetic queries never promote a candidate. LARGE_SEQ_SCAN alone is insufficient. Apply only MEASURED_CANDIDATE entries after reviewing the exact production-shaped plan and rerun the failing scenario.",
      candidates: output,
      counts: {
        alreadyCovered: output.filter((x) => x.recommendation === "ALREADY_COVERED").length,
        measuredCandidate: output.filter((x) => x.recommendation === "MEASURED_CANDIDATE").length,
        reviewIfMeasured: output.filter((x) => x.recommendation === "REVIEW_IF_MEASURED").length,
        deferredSmallTable: output.filter((x) => x.recommendation === "DEFER_SMALL_TABLE").length,
      }
    };
    const json = JSON.stringify(result, null, 2);
    if (process.env.PERF_INDEX_ADVISOR_OUTPUT) {
      const file = resolve(process.env.PERF_INDEX_ADVISOR_OUTPUT);
      await mkdir(resolve(file, ".."), { recursive: true }).catch(() => undefined);
      await writeFile(file, json, { mode: 0o600 });
    }
    console.log(json);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Index advisor failed.");
  process.exit(1);
});
