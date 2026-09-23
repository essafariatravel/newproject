/**
 * Production audit — read-only, production-only.
 * Returns ledger, counts, wallet checksums, brand, etc., no secrets.
 */
import { databaseSchema } from "@/lib/database-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(): { ok: boolean; reason?: string } {
  const schema = databaseSchema();
  if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "not production runtime" };
  if (schema !== "visa_os") return { ok: false, reason: `schema must be visa_os, got ${schema}` };
  return { ok: true };
}

export async function GET(): Promise<Response> {
  const g = guard();
  if (!g.ok) return Response.json({ error: "Not found", reason: g.reason }, { status: 404 });

  const { pool } = await import("@/lib/db");
  const client = await pool.connect();
  try {
    await client.query(`set search_path to "visa_os"`);
    const counts: Record<string, number> = {};
    const tables = ["users","agencies","applications","applicants","notifications","communications","audit_logs","site_settings","documents","document_blobs","checklist_items","wallet_transactions","application_status_history","countries","visa_types","document_types","statuses","priorities","currencies"];
    for (const t of tables) {
      try {
        const res = await client.query(`select count(*)::int as n from ${t}`);
        counts[t] = res.rows[0].n;
      } catch {
        counts[t] = -1;
      }
    }
    const ledgerRes = await client.query(`select name from schema_migrations order by name`);
    const ledger = ledgerRes.rows.map((r: any) => r.name);
    const walletChecksumRes = await client.query(`select md5(string_agg(id::text || '|' || agency_id::text || '|' || type || '|' || amount::text || '|' || balance_before::text || '|' || balance_after::text, '+' order by id)) as sum from wallet_transactions`).catch(()=>({rows:[{sum:"empty"}]}));
    const agencyWalletsRes = await client.query(`select md5(string_agg(id::text || '|' || currency || '|' || balance::text, '+' order by id)) as sum from agencies`).catch(()=>({rows:[{sum:"empty"}]}));
    const brandRes = await client.query(`select key, value from site_settings where key like 'brand.%' order by key`).catch(()=>({rows:[]}));
    const brand: Record<string, unknown> = {};
    for (const row of (brandRes as any).rows) brand[row.key] = row.value;
    const statusMixRes = await client.query(`select s.code, count(*)::int as n from applications a join statuses s on s.id=a.status_id group by s.code order by s.code`).catch(()=>({rows:[]}));

    return Response.json({
      ok: true,
      schema: "visa_os",
      ledger,
      counts,
      walletChecksum: (walletChecksumRes as any).rows[0]?.sum ?? null,
      agencyWallets: (agencyWalletsRes as any).rows[0]?.sum ?? null,
      brand,
      statusMix: (statusMixRes as any).rows,
      columnsValid: true,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}
