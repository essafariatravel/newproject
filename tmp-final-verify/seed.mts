process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5440/essafaria_live";
import pg from "pg";
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await p.query(`truncate table audit_logs, notifications, communications, wallet_transactions, documents, document_blobs, checklist_items, applicants, application_status_history, applications, visa_requirements, visa_types, document_types, visa_categories, countries, status_transitions, statuses, priorities, currencies, account_activation_tokens, agency_registration_history, agency_registration_documents, agency_registrations, sessions, users, agencies, site_settings restart identity cascade`);
await p.end();
const { seedFixtures } = await import("../tests/helpers/fixtures");
await seedFixtures();
import { createHash } from "node:crypto";
const p2 = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const h = (t: string) => createHash("sha256").update(t).digest("hex");
const ag = await p2.query(`select id, agency_id from users where email='b-admin@test.example'`);
const st = await p2.query(`select id from users where email='admin@test.example'`);
await p2.query(`insert into sessions (user_id, token_hash, expires_at) values ($1,$2, now() + interval '2 hours'),($3,$4, now() + interval '2 hours')`,
  [ag.rows[0].id, h("gate-agency"), st.rows[0].id, h("gate-staff")]);
await p2.end();
console.log("SEED_DONE"); process.exit(0);
