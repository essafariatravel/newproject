import "./lib/load-env";
import { Pool, type PoolClient } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

async function requirePerfActor(client: PoolClient, email: string): Promise<string> {
  const result = await client.query<{ id: string; status: string }>(
    `select id, status from ${perfTable("users")} where lower(email)=lower($1) limit 1`,
    [email],
  );
  if (!result.rows[0] || result.rows[0].status !== "ACTIVE") {
    throw new Error(`Run perf-seed-identities first; ${email} is missing or inactive.`);
  }
  return result.rows[0].id;
}


async function requirePerfAgency(client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string; status: string; currency: string }>(
    `select id, status, currency from ${perfTable("agencies")} where lower(email)=lower($1) limit 1`,
    ["perf.agency@load.example"],
  );
  const row = result.rows[0];
  if (!row || row.status !== "ACTIVE" || row.currency !== "DZD") {
    throw new Error("Run perf-seed-identities first; PERF_LOAD_AGENCY is missing or inactive.");
  }
  return row.id;
}

async function main() {
  const target = assertSafePerfTarget();
  const datasetId = (process.env.PERF_DATASET_ID ?? "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(datasetId)) {
    throw new Error("PERF_DATASET_ID is required (3-30 lowercase letters/digits/_/-).");
  }
  if (target.remote && process.env.PERF_ALLOW_REMOTE_BULK !== "YES") {
    throw new Error("Remote bulk seeding is disabled. Use a disposable local/test database or explicitly set PERF_ALLOW_REMOTE_BULK=YES.");
  }

  const applicationCount = intEnv("PERF_APPLICATIONS", 1000, 1, 100000);
  const agencyCount = intEnv("PERF_AGENCIES", Math.min(100, Math.max(10, Math.ceil(applicationCount / 100))), 2, 1000);
  const docsPerApp = intEnv("PERF_DOCS_PER_APP", 4, 0, 10);
  const notificationsPerApp = intEnv("PERF_NOTIFICATIONS_PER_APP", 3, 0, 10);
  const messagesPerApp = intEnv("PERF_MESSAGES_PER_APP", 1, 0, 5);
  const auditsPerApp = intEnv("PERF_AUDITS_PER_APP", 3, 0, 10);
  const ledgerRows = intEnv("PERF_LEDGER_ROWS", Math.max(100, Math.ceil(applicationCount / 5)), 0, 200000);
  const batchSize = intEnv("PERF_BATCH_SIZE", 1000, 100, 5000);

  if (target.remote && applicationCount > 10000 && process.env.PERF_ALLOW_LARGE_REMOTE_BULK !== "YES") {
    throw new Error("More than 10,000 applications on a remote Preview requires PERF_ALLOW_LARGE_REMOTE_BULK=YES.");
  }

  const marker = `PERF_DATASET:${datasetId}`;
  const refPrefix = `PERF-${datasetId.toUpperCase()}-`;
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });

  try {
    const client = await pool.connect();
    try {
      const prior = await client.query<{ count: string }>(
        `select count(*)::text as count from ${perfTable("applications")} where agency_notes=$1`,
        [marker],
      );
      if (Number(prior.rows[0]?.count ?? 0) > 0) {
        throw new Error(`Dataset ${datasetId} already exists. Choose a new PERF_DATASET_ID; this script never deletes immutable history.`);
      }

      const actorId = await requirePerfActor(client, "perf.superadmin@load.example");
      const staffNotificationUserId = await requirePerfActor(client, "perf.agent@load.example");
      const portalAgencyId = await requirePerfAgency(client);

      await client.query("begin");

      // Include the authenticated PERF agency so Agency Portal list/detail/search
      // paths receive realistic scale. Remaining agencies exercise Staff/global views.
      const agencies: string[] = [portalAgencyId];
      const dataAgencyCount = agencyCount - 1;
      const ledgerAgencyIds: string[] = [];
      for (let offset = 0; offset < dataAgencyCount; offset += 250) {
        const n = Math.min(250, dataAgencyCount - offset);
        const rows = await client.query<{ id: string }>(
          `insert into ${perfTable("agencies")}
             (legal_name, trading_name, email, status, balance, currency, notes)
           select
             'PERF_DATA_${datasetId}_' || lpad(($2 + g)::text,4,'0'),
             'PERF_DATA_${datasetId}_' || lpad(($2 + g)::text,4,'0'),
             'perf.data.${datasetId}.' || lpad(($2 + g)::text,4,'0') || '@load.example',
             'ACTIVE', 0, 'DZD', $3
           from generate_series(1,$1::int) g
           returning id`,
          [n, offset + 1, marker],
        );
        const createdIds = rows.rows.map((row) => row.id);
        agencies.push(...createdIds);
        ledgerAgencyIds.push(...createdIds);
      }

      for (let offset = 0; offset < applicationCount; offset += batchSize) {
        const n = Math.min(batchSize, applicationCount - offset);
        const inserted = await client.query<{ id: string; agency_id: string }>(
          `insert into ${perfTable("applications")}
             (id, reference, agency_id, country_id, visa_type_id, status_id, priority_id,
              visa_type_name, visa_type_code, category_name, country_name,
              fee, submitted_price, submitted_currency, effective_price, currency,
              processing_min_days, processing_max_days, agency_notes, created_by,
              submitted_at, created_at, updated_at)
           select
             gen_random_uuid(),
             $1 || lpad(($2 + g)::text,8,'0'),
             ($4::uuid[])[1 + (($2 + g - 1) % array_length($4::uuid[],1))],
             cfg.country_id, cfg.visa_type_id, cfg.status_id, cfg.priority_id,
             cfg.visa_name, cfg.visa_code, cfg.category_name, cfg.country_name,
             cfg.fee, cfg.fee, 'DZD', cfg.fee, 'DZD',
             cfg.processing_min_days, cfg.processing_max_days, $5, $6,
             now() - (($2 + g) % 365) * interval '1 day',
             now() - (($2 + g) % 365) * interval '1 day' - interval '1 hour',
             now() - (($2 + g) % 365) * interval '1 day'
           from generate_series(1,$3::int) g
           cross join lateral (
             select vt.id as visa_type_id, vt.name as visa_name, vt.code as visa_code,
                    vt.fee, vt.processing_min_days, vt.processing_max_days,
                    c.id as country_id, c.name as country_name, vc.name as category_name,
                    s.id as status_id, p.id as priority_id
               from ${perfTable("visa_types")} vt
               join ${perfTable("countries")} c on c.id=vt.country_id
               join ${perfTable("visa_categories")} vc on vc.id=vt.category_id
               cross join lateral (
                 select id from ${perfTable("statuses")}
                  where active and not is_terminal and not is_draft
                  order by sort_order, code limit 1
               ) s
               cross join lateral (
                 select id from ${perfTable("priorities")}
                  where active order by sort_order, code limit 1
               ) p
              where vt.active
              order by vt.code
              limit 1
           ) cfg
           returning id, agency_id`,
          [refPrefix, offset, n, agencies, marker, actorId],
        );

        const ids = inserted.rows.map((row) => row.id);
        if (ids.length !== n) throw new Error("Synthetic application batch insert was incomplete.");

        await client.query(
          `insert into ${perfTable("applicants")}
             (application_id, first_name, last_name, full_name, nationality, passport_number)
           select seed.id, 'PERF', 'Traveller', 'PERF Traveller ' || left(replace(seed.id::text,'-',''),10),
                  'Algerian', 'P' || upper(left(replace(seed.id::text,'-',''),12))
             from unnest($1::uuid[]) as seed(id)`,
          [ids],
        );

        if (docsPerApp > 0) {
          await client.query(
            `insert into ${perfTable("checklist_items")}
               (application_id, document_type_id, document_type_name, document_type_code, required, sort_order, active)
             select seed.app_id, dt.id, dt.name, dt.code, true, dt.rn, true
               from unnest($1::uuid[]) as seed(app_id)
               cross join lateral (
                 select id, name, code, row_number() over(order by sort_order,code)::int as rn
                   from ${perfTable("document_types")}
                  where active and agency_uploadable
                  order by sort_order, code
                  limit $2::int
               ) dt
             on conflict do nothing`,
            [ids, docsPerApp],
          );

          await client.query(
            `insert into ${perfTable("documents")}
               (application_id, checklist_item_id, document_type_id, original_filename, mime_type,
                size_bytes, storage_key, status, reviewed_by, reviewed_at, uploaded_by, version)
             select ci.application_id, ci.id, ci.document_type_id,
                    'perf-' || ci.document_type_code || '.pdf', 'application/pdf', 250000,
                    'perf-metadata/' || $2 || '/' || ci.application_id::text || '/' || ci.id::text,
                    'ACCEPTED', $3, now(), $3, 1
               from ${perfTable("checklist_items")} ci
              where ci.application_id = any($1::uuid[])`,
            [ids, datasetId, actorId],
          );
        }

        if (notificationsPerApp > 0) {
          await client.query(
            `insert into ${perfTable("notifications")}
               (user_id, agency_id, application_id, type, title, body, link, read_at, created_at)
             select $2, a.agency_id, a.id, 'APPLICATION_SUBMITTED',
                    'PERF synthetic application', 'Synthetic performance dataset row.',
                    '/admin/applications/' || a.id::text,
                    case when n % 3 = 0 then now() else null end,
                    a.created_at + n * interval '1 minute'
               from ${perfTable("applications")} a
               cross join generate_series(1,$3::int) n
              where a.id = any($1::uuid[])`,
            [ids, staffNotificationUserId, notificationsPerApp],
          );
        }

        if (messagesPerApp > 0) {
          await client.query(
            `insert into ${perfTable("communications")}
               (application_id, author_id, visibility, body, created_at)
             select a.id, $2, case when n % 2 = 0 then 'INTERNAL' else 'AGENCY' end,
                    'PERF synthetic communication ' || n::text,
                    a.created_at + n * interval '2 minutes'
               from ${perfTable("applications")} a
               cross join generate_series(1,$3::int) n
              where a.id = any($1::uuid[])`,
            [ids, actorId, messagesPerApp],
          );
        }

        if (auditsPerApp > 0) {
          await client.query(
            `insert into ${perfTable("audit_logs")}
               (actor_id, actor_email, actor_role, agency_id, action, entity, entity_id, metadata, created_at)
             select $2, 'perf.superadmin@load.example', 'SUPER_ADMIN', a.agency_id,
                    'PERF_SYNTHETIC_EVENT', 'application', a.id::text,
                    jsonb_build_object('dataset',$3,'event',n),
                    a.created_at + n * interval '3 minutes'
               from ${perfTable("applications")} a
               cross join generate_series(1,$4::int) n
              where a.id = any($1::uuid[])`,
            [ids, actorId, datasetId, auditsPerApp],
          );
        }

        await client.query(
          `insert into ${perfTable("application_status_history")}
             (application_id, from_status_id, to_status_id, changed_by, reason, created_at)
           select a.id, null, a.status_id, $2, 'PERF synthetic history', a.created_at
             from ${perfTable("applications")} a
            where a.id = any($1::uuid[])`,
          [ids, actorId],
        );

        console.log(`seeded applications: ${offset + n}/${applicationCount}`);
      }

      if (ledgerRows > 0) {
        const ledgerAgency = ledgerAgencyIds[0];
        if (!ledgerAgency) throw new Error("Synthetic ledger requires at least one dedicated PERF_DATA agency.");
        await client.query(
          `insert into ${perfTable("wallet_transactions")}
             (agency_id, application_id, type, amount, currency, balance_before, balance_after, reason, actor_id, created_at)
           select $1, null, 'CREDIT', 1, 'DZD', (g-1)::numeric, g::numeric,
                  $2, $3, now() - ($4 - g) * interval '1 minute'
             from generate_series(1,$4::int) g`,
          [ledgerAgency, `${marker}:LEDGER`, actorId, ledgerRows],
        );
        await client.query(
          `update ${perfTable("agencies")} set balance=$2::numeric, updated_at=now() where id=$1`,
          [ledgerAgency, ledgerRows],
        );
      }

      await client.query("commit");

      console.log(JSON.stringify({
        ok: true,
        target: safeTargetSummary(target),
        datasetId,
        marker,
        agencies: agencyCount,
        applications: applicationCount,
        documentsMetadataApprox: applicationCount * docsPerApp,
        notificationsApprox: applicationCount * notificationsPerApp,
        communicationsApprox: applicationCount * messagesPerApp,
        auditRowsApprox: applicationCount * auditsPerApp,
        ledgerRows,
        note: "Document metadata is scaled without creating large file blobs. Dedicated storage tests create real 2 MB synthetic files.",
      }, null, 2));
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Synthetic scale dataset failed.");
  process.exit(1);
});
