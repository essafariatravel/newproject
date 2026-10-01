import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { sessions, users } from "@/db/schema";
import { createSession, getSessionUser } from "@/lib/auth";
import { updateUserAction } from "@/app/actions/admin";
import { changePasswordAction } from "@/app/actions/auth";
import { hashToken } from "@/lib/crypto";

suiteSetup();
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
afterEach(() => { request.cookie = ""; });

describe("hardening account and session invariants", () => {
  it("rejects an operational ADMIN promoting another staff account", async () => {
    const actor = await userByEmail("admin@test.example"), target = await userByEmail("agent@test.example");
    request.cookie = (await createSession(actor.id)).token;
    const form = new FormData();
    form.set("id", target.id); form.set("name", target.name); form.set("role", "SUPER_ADMIN");
    await expect(updateUserAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await db.select().from(users).where(eq(users.id, target.id)))[0]?.role).toBe("VISA_AGENT");
  });

  it("suspension removes sessions permanently across reactivation", async () => {
    const actor = await userByEmail("superadmin@test.example"), target = await userByEmail("accounting@test.example");
    const old = await createSession(target.id);
    request.cookie = (await createSession(actor.id)).token;
    const form = new FormData(); form.set("id", target.id); form.set("toggleStatus", "1");
    await expect(updateUserAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await db.select().from(sessions).where(eq(sessions.userId, target.id))).toEqual([]);
    await expect(updateUserAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
    request.cookie = old.token;
    expect(await getSessionUser()).toBeNull();
  });

  it("password changes revoke earlier sessions", async () => {
    const target = await userByEmail("a-user@test.example");
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, target.id));
    const older = await createSession(target.id), current = await createSession(target.id);
    request.cookie = current.token;
    const form = new FormData();
    form.set("current", "Test-Password-123"); form.set("password", "Changed-Pass-123"); form.set("confirm", "Changed-Pass-123");
    await expect(changePasswordAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
    request.cookie = older.token;
    expect(await getSessionUser()).toBeNull();
    expect(await db.select().from(sessions).where(and(eq(sessions.userId, target.id), eq(sessions.tokenHash, hashToken(older.token))))).toEqual([]);
  });
});
