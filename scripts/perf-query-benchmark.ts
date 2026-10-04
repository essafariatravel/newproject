import "./lib/load-env";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

type QueryCase = { name: string; sql: string; params: unknown[]; category: string; offset?: number };
type QueryResult = {
  name: string;
  category: string;
  offset?: number;
  samplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  rowsLast: number;
};

function percentile(values: number[], pct: number): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be ${min}..${max}.`);
  return value;
}

async function datasetContext(client: PoolClient, datasetId: string) {
  const marker = `PERF_DATASET:${datasetId}`;
  const apps = perfTable("applications");
  const users = perfTable("users");
  const agencies = perfTable("agencies");
  const count = Number((await client.query<{ count: string }>(
    `select count(*)::text as count from ${apps} where agency_notes=$1`,
    [marker],
  )).rows[0]?.count ?? 0);
  if (!count) throw new Error(`Dataset ${datasetId} was not found. Seed it first.`);

  const staff = (await client.query<{ id: string }>(
    `select id from ${users} where lower(email)='perf.agent@load.example' limit 1`,
  )).rows[0]?.id;
  const agency = (await client.query<{ id: string }>(
    `select id from ${agencies} where lower(email)='perf.agency@load.example' limit 1`,
  )).rows[0]?.id;
  if (!staff || !agency) throw new Error("Synthetic identities are missing. Run perf:seed-identities.");

  return { marker, count, staff, agency };
}

function offsetSet(count: number): number[] {
  const values = [0, 500, 1000, 5000, 10000, 50000, Math.max(0, Math.floor(count * 0.9) - 50)];
  return [...new Set(values.map((v) => Math.min(Math.max(0, v), Math.max(0, count - 50))))].sort((a, b) => a - b);
}

function cases(ctx: { marker: string; count: number; staff: string; agency: string }): QueryCase[] {
  const a = perfTable("applications");
  const ap = perfTable("applicants");
  const s = perfTable("statuses");
  const p = perfTable("priorities");
  const audit = perfTable("audit_logs");
  const notifications = perfTable("notifications");
  const communications = perfTable("communications");
  const wt = perfTable("wallet_transactions");
  const docs = perfTable("documents");

  const result: QueryCase[] = [];
  for (const offset of offsetSet(ctx.count)) {
    result.push({
      name: `applications_offset_${offset}`,
      category: "pagination",
      offset,
      sql: `select x.id
              from ${a} x
              join ${s} st on st.id=x.status_id
              join ${p} pr on pr.id=x.priority_id
             where x.agency_notes=$1
             order by x.created_at desc
             limit 50 offset ${offset}`,
      params: [ctx.marker],
    });
  }

  result.push(
    {
      name: "agency_applications_first_page",
      category: "applications",
      sql: `select x.id
              from ${a} x join ${s} st on st.id=x.status_id join ${p} pr on pr.id=x.priority_id
             where x.agency_notes=$1 and x.agency_id=$2 and st.code not in ('DRAFT','CANCELLED')
             order by x.created_at desc limit 50`,
      params: [ctx.marker, ctx.agency],
    },
    {
      name: "applications_search_broad",
      category: "search",
      sql: `select x.id
              from ${a} x
              join ${s} st on st.id=x.status_id
              join ${p} pr on pr.id=x.priority_id
             where x.agency_notes=$1
               and (
                 x.reference ilike $2 or x.visa_type_name ilike $2 or x.country_name ilike $2
                 or exists (
                   select 1 from ${ap} traveller
                    where traveller.application_id=x.id
                      and (coalesce(nullif(traveller.full_name,''),traveller.first_name || ' ' || traveller.last_name) ilike $2
                           or traveller.passport_number ilike $2)
                 )
               )
             order by x.created_at desc limit 50`,
      params: [ctx.marker, "%PERF%"],
    },
    {
      name: "applications_count_filtered",
      category: "applications",
      sql: `select count(*) from ${a} x join ${s} st on st.id=x.status_id where x.agency_notes=$1`,
      params: [ctx.marker],
    },
    {
      name: "applications_export_5001",
      category: "export",
      sql: `select x.id,x.reference,x.country_name,x.visa_type_name,x.fee,x.submitted_at,x.updated_at
              from ${a} x join ${s} st on st.id=x.status_id join ${p} pr on pr.id=x.priority_id
             where x.agency_notes=$1 order by x.created_at desc limit 5001`,
      params: [ctx.marker],
    },
    {
      name: "report_by_country",
      category: "report",
      sql: `select country_name,count(*)::int,
                    coalesce(sum(fee) filter (where submitted_at is not null),0)::text
               from ${a} where agency_notes=$1 group by country_name order by count(*) desc`,
      params: [ctx.marker],
    },
    {
      name: "report_by_status",
      category: "report",
      sql: `select st.code,count(*)::int
               from ${a} x join ${s} st on st.id=x.status_id
              where x.agency_notes=$1 group by st.code,st.sort_order order by st.sort_order`,
      params: [ctx.marker],
    },
    {
      name: "report_processing_times",
      category: "report",
      sql: `select count(*)::int,
                    avg(extract(epoch from (decision_at-submitted_at))/86400.0)
               from ${a}
              where agency_notes=$1 and submitted_at is not null and decision_at is not null`,
      params: [ctx.marker],
    },
    {
      name: "wallet_flow",
      category: "report",
      sql: `select
               coalesce(sum(amount) filter (where type='CREDIT'),0)::text,
               coalesce(sum(amount) filter (where type='DEBIT'),0)::text,
               coalesce(sum(amount) filter (where type='APPLICATION_CHARGE'),0)::text
              from ${wt} where reason=$1`,
      params: [`${ctx.marker}:LEDGER`],
    },
    {
      name: "audit_first_page",
      category: "audit",
      sql: `select id,created_at,actor_email,action,entity,entity_id
               from ${audit}
              where action='PERF_SYNTHETIC_EVENT'
              order by created_at desc,id desc limit 50`,
      params: [],
    },
    {
      name: "audit_deep_page",
      category: "audit",
      sql: `select id,created_at,actor_email,action,entity,entity_id
               from ${audit}
              where action='PERF_SYNTHETIC_EVENT'
              order by created_at desc,id desc limit 50 offset ${Math.min(Math.max(0, ctx.count * 2), 50000)}`,
      params: [],
    },
    {
      name: "notifications_latest",
      category: "notifications",
      sql: `select id,type,created_at,read_at
               from ${notifications}
              where user_id=$1 order by created_at desc limit 50`,
      params: [ctx.staff],
    },
    {
      name: "notifications_unread_count",
      category: "notifications",
      sql: `select count(*) from ${notifications} where user_id=$1 and read_at is null`,
      params: [ctx.staff],
    },
    {
      name: "communications_recent",
      category: "communications",
      sql: `select c.id,c.created_at,c.visibility
               from ${communications} c join ${a} x on x.id=c.application_id
              where x.agency_notes=$1 order by c.created_at desc limit 30`,
      params: [ctx.marker],
    },
    {
      name: "document_issue_count",
      category: "documents",
      sql: `select d.status,count(*)::int
               from ${docs} d join ${a} x on x.id=d.application_id
              where x.agency_notes=$1 and d.status in ('REJECTED','RESUBMISSION_REQUIRED')
              group by d.status`,
      params: [ctx.marker],
    },
  );
  return result;
}

async function measure(client: PoolClient, spec: QueryCase, repeats: number): Promise<QueryResult> {
  const samples: number[] = [];
  let rowsLast = 0;
  for (let i = 0; i < repeats; i++) {
    const started = performance.now();
    const response = await client.query(spec.sql, spec.params);
    samples.push(performance.now() - started);
    rowsLast = response.rowCount ?? response.rows.length;
  }
  return {
    name: spec.name,
    category: spec.category,
    offset: spec.offset,
    samplesMs: samples,
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    p99Ms: percentile(samples, 99),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    rowsLast,
  };
}

async function main() {
  const target = assertSafePerfTarget();
  const datasetId = String(process.env.PERF_DATASET_ID ?? "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(datasetId)) throw new Error("PERF_DATASET_ID is required.");
  const repeats = intEnv("PERF_BENCH_REPEATS", 7, 1, 30);
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });

  try {
    const client = await pool.connect();
    try {
      await client.query("set statement_timeout='15s'");
      const ctx = await datasetContext(client, datasetId);
      const results: QueryResult[] = [];
      for (const spec of cases(ctx)) {
        const result = await measure(client, spec, repeats);
        results.push(result);
        console.log(`${result.name}: p95=${result.p95Ms.toFixed(2)}ms`);
      }

      const output = {
        generatedAt: new Date().toISOString(),
        target: safeTargetSummary(target),
        datasetId,
        datasetRows: ctx.count,
        repeats,
        queries: results,
      };
      const file = resolve(process.env.PERF_BENCH_OUTPUT ?? `perf/results/query-benchmark-${datasetId}.json`);
      await mkdir(resolve("perf/results"), { recursive: true });
      await writeFile(file, JSON.stringify(output, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ ok: true, file, datasetRows: ctx.count, queries: results.length }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Query benchmark failed.");
  process.exit(1);
});
