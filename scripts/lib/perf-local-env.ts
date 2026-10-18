// Deliberately do not load .env files: they can contain cloud credentials.
// Keep this import first in performance entry points, before evidence/session
// reads, pool construction, HTTP requests or child processes.
import { assertLocalPerfEnvironment } from "../../perf/local-safety.js";

assertLocalPerfEnvironment(process.env);
