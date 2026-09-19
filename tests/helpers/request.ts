import { vi } from "vitest";

/** Request-local cookies for login/session integration tests only. */
export const request = { cookie: "", set: vi.fn() };
