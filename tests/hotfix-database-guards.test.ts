import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { pool } from "@/lib/db";
suiteSetup();
it("aborts the release guard on conflicts, then enforces single active account and normalized email without deleting history", async () => {
  const client = await pool.connect();
  const script = readFileSync("docs/operations/sql/hotfix-identity-guards.sql","utf8");
  try {
    await client.query("create schema hotfix_guard_test; set search_path=hotfix_guard_test; create table users(id int primary key,agency_id int,email text,status text)");
    await client.query("insert into users values(1,1,'First@example.test','ACTIVE'),(2,1,'second@example.test','ACTIVE')");
    await expect(client.query(script)).rejects.toMatchObject({message:"HOTFIX_AGENCY_ACCOUNT_CONFLICT"});
    await client.query("rollback");
    expect((await client.query("select count(*)::int as n from users")).rows[0].n).toBe(2);
    await client.query("update users set status='SUSPENDED' where id=2");
    await client.query(script);
    await expect(client.query("insert into users values(3,1,'third@example.test','ACTIVE')")).rejects.toMatchObject({code:"23505"});
    await expect(client.query("insert into users values(4,2,' first@EXAMPLE.test ','ACTIVE')")).rejects.toMatchObject({code:"23505"});
    expect((await client.query("select count(*)::int as n from users")).rows[0].n).toBe(2);
  } finally {
    await client.query("rollback; set search_path=public; drop schema if exists hotfix_guard_test cascade");
    client.release();
  }
});
