import "./lib/load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

type NodeSummary = {
  nodeType: string;
  relation?: string;
  index?: string;
  actualRows?: number;
  planRows?: number;
  loops?: number;
  actualTotalMs?: number;
  sharedHit?: number;
  sharedRead?: number;
  tempRead?: number;
  tempWritten?: number;
  sortMethod?: string;
  sortSpaceType?: string;
};

function flatten(node: Record<string, unknown>, output: NodeSummary[] = []): NodeSummary[] {
  output.push({
    nodeType: String(node["Node Type"] ?? ""),
    relation: typeof node["Relation Name"] === "string" ? node["Relation Name"] : undefined,
    index: typeof node["Index Name"] === "string" ? node["Index Name"] : undefined,
    actualRows: typeof node["Actual Rows"] === "number" ? node["Actual Rows"] : undefined,
    planRows: typeof node["Plan Rows"] === "number" ? node["Plan Rows"] : undefined,
    loops: typeof node["Actual Loops"] === "number" ? node["Actual Loops"] : undefined,
    actualTotalMs: typeof node["Actual Total Time"] === "number" ? node["Actual Total Time"] : undefined,
    sharedHit: typeof node["Shared Hit Blocks"] === "number" ? node["Shared Hit Blocks"] : undefined,
    sharedRead: typeof node["Shared Read Blocks"] === "number" ? node["Shared Read Blocks"] : undefined,
    tempRead: typeof node["Temp Read Blocks"] === "number" ? node["Temp Read Blocks"] : undefined,
    tempWritten: typeof node["Temp Written Blocks"] === "number" ? node["Temp Written Blocks"] : undefined,
    sortMethod: typeof node["Sort Method"] === "string" ? node["Sort Method"] : undefined,
    sortSpaceType: typeof node["Sort Space Type"] === "string" ? node["Sort Space Type"] : undefined,
  });
  const plans = node.Plans;
  if (Array.isArray(plans)) {
    for (const child of plans) if (child && typeof child === "object") flatten(child as Record<string, unknown>, output);
  }
  return output;
}

function findings(nodes: NodeSummary[], executionMs: number) {
  const issues: Array<{ severity: "INFO" | "REVIEW" | "HIGH"; code: string; detail: string }> = [];
  if (executionMs > 500) issues.push({ severity: "HIGH", code: "EXECUTION_GT_500MS", detail: `Execution time ${executionMs.toFixed(2)} ms` });
  else if (executionMs > 100) issues.push({ severity: "REVIEW", code: "EXECUTION_GT_100MS", detail: `Execution time ${executionMs.toFixed(2)} ms` });

  for (const node of nodes) {
    if (node.nodeType === "Seq Scan" && (node.actualRows ?? 0) >= 1000) {
      issues.push({ severity: "REVIEW", code: "LARGE_SEQ_SCAN", detail: `${node.relation ?? "relation"}: ${node.actualRows} rows` });
    }
    if (node.sortSpaceType === "Disk" || (node.tempRead ?? 0) > 0 || (node.tempWritten ?? 0) > 0) {
      issues.push({ severity: "HIGH", code: "DISK_TEMP_IO", detail: `${node.nodeType}: temp read ${node.tempRead ?? 0}, written ${node.tempWritten ?? 0}` });
    }
    if (node.nodeType === "Nested Loop" && ((node.actualRows ?? 0) * (node.loops ?? 1)) > 10000) {
      issues.push({ severity: "REVIEW", code: "LARGE_NESTED_LOOP", detail: `${(node.actualRows ?? 0) * (node.loops ?? 1)} produced rows across loops` });
    }
    if ((node.actualRows ?? 0) > 0 && (node.planRows ?? 0) > 0) {
      const ratio = (node.actualRows ?? 1) / (node.planRows ?? 1);
      if (ratio >= 10 || ratio <= 0.1) {
        issues.push({ severity: "REVIEW", code: "CARDINALITY_MISESTIMATE", detail: `${node.nodeType}: actual/plan ratio ${ratio.toFixed(2)}` });
      }
    }
  }
  return issues;
}

async function context(client: PoolClient, datasetId: string) {
  const marker = `PERF_DATASET:${datasetId}`;
  const a = perfTable("applications");
  const count = Number((await client.query<{ count: string }>(`select count(*)::text count from ${a} where agency_notes=$1`, [marker])).rows[0]?.count ?? 0);
  if (!count) throw new Error(`Dataset ${datasetId} not found.`);
  const staff = (await client.query<{ id: string }>(`select id from ${perfTable("users")} where lower(email)='perf.agent@load.example' limit 1`)).rows[0]?.id;
  if (!staff) throw new Error("PERF Visa Agent identity is missing.");
  return { marker, count, staff };
}

function specs(ctx: { marker: string; count: number; staff: string }) {
  const a = perfTable("applications"), ap = perfTable("applicants"), s = perfTable("statuses"), p = perfTable("priorities");
  const audit = perfTable("audit_logs"), n = perfTable("notifications"), wt = perfTable("wallet_transactions");
  const deep = Math.min(Math.max(0, Math.floor(ctx.count * 0.9) - 50), 50000);
  return [
    {
      name: "applications_first_page",
      sql: `select x.id from ${a} x join ${s} st on st.id=x.status_id join ${p} pr on pr.id=x.priority_id
             where x.agency_notes=$1 order by x.created_at desc limit 50`,
      params: [ctx.marker],
    },
    {
      name: "applications_deep_page",
      sql: `select x.id from ${a} x join ${s} st on st.id=x.status_id join ${p} pr on pr.id=x.priority_id
             where x.agency_notes=$1 order by x.created_at desc limit 50 offset ${deep}`,
      params: [ctx.marker],
    },
    {
      name: "applications_search_broad",
      sql: `select x.id from ${a} x join ${s} st on st.id=x.status_id join ${p} pr on pr.id=x.priority_id
             where x.agency_notes=$1 and (
               x.reference ilike $2 or x.visa_type_name ilike $2 or x.country_name ilike $2
               or exists (select 1 from ${ap} traveller where traveller.application_id=x.id
                  and (coalesce(nullif(traveller.full_name,''),traveller.first_name || ' ' || traveller.last_name) ilike $2
                       or traveller.passport_number ilike $2))
             ) order by x.created_at desc limit 50`,
      params: [ctx.marker, "%PERF%"],
    },
    {
      name: "report_by_country",
      sql: `select country_name,count(*) from ${a} where agency_notes=$1 group by country_name order by count(*) desc`,
      params: [ctx.marker],
    },
    {
      name: "audit_deep_page",
      sql: `select id from ${audit} where action='PERF_SYNTHETIC_EVENT'
             order by created_at desc,id desc limit 50 offset ${Math.min(ctx.count * 2, 50000)}`,
      params: [],
    },
    {
      name: "notifications_latest",
      sql: `select id,type,created_at from ${n} where user_id=$1 order by created_at desc limit 50`,
      params: [ctx.staff],
    },
    {
      name: "notifications_unread_count",
      sql: `select count(*) from ${n} where user_id=$1 and read_at is null`,
      params: [ctx.staff],
    },
    {
      name: "wallet_flow",
      sql: `select coalesce(sum(amount),0) from ${wt} where reason=$1`,
      params: [`${ctx.marker}:LEDGER`],
    },
  ];
}

async function explain(client: PoolClient, spec: { name: string; sql: string; params: unknown[] }) {
  await client.query("begin read only");
  try {
    await client.query("set local statement_timeout='15s'");
    await client.query("set local lock_timeout='2s'");
    const response = await client.query(`explain (analyze, buffers, format json) ${spec.sql}`, spec.params);
    const raw = response.rows[0]?.["QUERY PLAN"] as unknown;
    const envelope = Array.isArray(raw) ? raw[0] as Record<string, unknown> : undefined;
    if (!envelope || typeof envelope.Plan !== "object" || envelope.Plan === null) throw new Error(`No plan for ${spec.name}.`);
    const nodes = flatten(envelope.Plan as Record<string, unknown>);
    const executionMs = Number(envelope["Execution Time"] ?? 0);
    return {
      name: spec.name,
      planningMs: Number(envelope["Planning Time"] ?? 0),
      executionMs,
      nodes,
      findings: findings(nodes, executionMs),
      plan: envelope,
    };
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
}

async function main() {
  const target = assertSafePerfTarget();
  if (process.env.PERF_ALLOW_EXPLAIN_ANALYZE !== "YES") {
    throw new Error("Set PERF_ALLOW_EXPLAIN_ANALYZE=YES after confirming the non-Production target.");
  }
  const datasetId = String(process.env.PERF_DATASET_ID ?? "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(datasetId)) throw new Error("PERF_DATASET_ID is required.");
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  try {
    const client = await pool.connect();
    try {
      const ctx = await context(client, datasetId);
      const plans = [];
      for (const spec of specs(ctx)) {
        const item = await explain(client, spec);
        plans.push(item);
        console.log(`${item.name}: ${item.executionMs.toFixed(2)}ms, findings=${item.findings.length}`);
      }
      const output = {
        generatedAt: new Date().toISOString(),
        target: safeTargetSummary(target),
        datasetId,
        datasetRows: ctx.count,
        plans,
      };
      const file = resolve(process.env.PERF_EXPLAIN_OUTPUT ?? `perf/results/explain-${datasetId}.json`);
      await mkdir(resolve("perf/results"), { recursive: true });
      await writeFile(file, JSON.stringify(output, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ ok: true, file, plans: plans.length }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "EXPLAIN diagnostics failed.");
  process.exit(1);
});
