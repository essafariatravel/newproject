/** Runs before any test-file imports — pins the test environment. */
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/essafaria_test";
process.env.SESSION_SECRET = "test-secret-not-for-production";
process.env.STORAGE_PROVIDER = "db";
// NODE_ENV stays as-is (vitest manages it)
process.env.SEED_ADMIN_PASSWORD = "Test-Admin-123";
process.env.SEED_AGENCY_PASSWORD = "Test-Agency-123";
