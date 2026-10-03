/**
 * Disposable browser-QA seed.
 * Runs only against the local embedded PostgreSQL created inside GitHub Actions.
 * It reuses deterministic test fixtures and creates one draft application so
 * both Agency and Staff dossier screens are available to the browser smoke.
 */
import { eq } from "drizzle-orm";
import { seedFixtures, agencyByEmail, userByEmail } from "../tests/helpers/fixtures";
import { db, pool } from "../src/lib/db";
import { applicants, visaTypes } from "../src/db/schema";
import { createDraftApplication } from "../src/lib/applications";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Browser QA seed is local-only.");
  }

  await pool.query(`
    truncate table
      audit_logs, notifications, communications, wallet_transactions,
      documents, document_blobs, checklist_items, applicants,
      application_status_history, applications,
      visa_requirements, visa_types, document_types, visa_categories, countries,
      status_transitions, statuses, priorities, currencies,
      account_activation_tokens, agency_registration_history,
      agency_registration_documents, agency_registrations,
      auth_rate_limits, legal_versions, sessions, users, agencies, site_settings
    restart identity cascade
  `);

  await seedFixtures();

  const agency = await agencyByEmail("ops@agencya.example");
  const actor = await userByEmail("a-admin@test.example");
  const visa = (await db.select().from(visaTypes).where(eq(visaTypes.code, "FR-SCH-TOUR")).limit(1))[0];
  if (!agency || !visa) throw new Error("Browser QA fixtures are incomplete.");

  const app = await createDraftApplication({
    agencyId: agency.id,
    visaTypeId: visa.id,
    agencyNotes: "Browser QA fixture — disposable local data.",
    createdBy: actor,
  });

  await db.insert(applicants).values({
    applicationId: app.id,
    firstName: "Leila",
    lastName: "Haddad",
    dateOfBirth: "1992-04-18",
    gender: "FEMALE",
    nationality: "Algerian",
    passportNumber: "QA1234567",
    passportIssueDate: "2024-02-01",
    passportExpiryDate: "2034-02-01",
    email: "leila.qa@example.test",
    phone: "+213555000001",
    city: "Algiers",
    country: "Algeria",
  });

  console.log("Browser QA seed ready:", app.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
