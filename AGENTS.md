# ESSAFARIA presentation work

Use `.agents/skills/essafaria-product-design/SKILL.md` for product design.
Preserve authentication, RBAC, tenant isolation, wallet, pricing, workflow semantics and migrations. Production is out of scope for design branches.

## Browser screenshots

Follow the screenshots skill at the workspace `.agents/skills/screenshots/SKILL.md` (the upstream convention refers to `.claude/skills/screenshots/`). Save timestamped captures in `.screenshots/qa/` for final evidence or `.screenshots/debug/` for working checks. Never commit captures; surface final QA images to the user. Copies of final evidence may be placed in the chat's user-facing outputs directory.

## Build commands

Use the locked dependencies. Run typecheck, lint, build and tests. Only use disposable localhost databases for fixture creation; never apply design migrations or seed to Preview or Production.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
