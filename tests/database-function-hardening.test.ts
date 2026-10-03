import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { pool } from "@/lib/db";
import { databaseSchema } from "@/lib/database-schema";

suiteSetup();

describe("database function privilege hardening", () => {
  it("pins every application function search_path and removes PUBLIC execute", async () => {
    const schema = databaseSchema();
    const result = await pool.query<{
      proname: string;
      proconfig: string[] | null;
      public_execute: boolean;
    }>(`
      select
        p.proname,
        p.proconfig,
        exists (
          select 1
            from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
           where acl.grantee = 0
             and acl.privilege_type = 'EXECUTE'
        ) as public_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = $1
      order by p.proname
    `, [schema]);

    expect(result.rows.length).toBeGreaterThan(0);
    for (const fn of result.rows) {
      const searchPath = fn.proconfig?.find((entry) => entry.startsWith("search_path=")) ?? "";
      expect(searchPath).toContain("pg_catalog");
      expect(searchPath).toContain(schema);
      expect(fn.public_execute, `${fn.proname} must not be executable by PUBLIC`).toBe(false);
    }
  });
});
