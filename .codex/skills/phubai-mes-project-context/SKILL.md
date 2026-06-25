---
name: phubai-mes-project-context
description: Onboard Codex into the PHUBAI-MES workspace before code changes. Use when working in D:\DU-AN-PHAN-MEM\PHUBAI-MES\phubai-mes, when starting a fresh chat on this repo, when updating project documentation, or when a task needs current business logic, routes, Prisma schema, development commands, and feature history.
---

# PHUBAI-MES Project Context

Before changing code in PHUBAI-MES, read the project memory files in this order:

1. `AGENTS.md`
2. `BUSINESS_LOGIC_CONTEXT.md`
3. `PLANS/yeucau.md` when the task touches the electric module
4. `prisma/schema.prisma`
5. The route/API/component files directly related to the task

Use `BUSINESS_LOGIC_CONTEXT.md` as the source of truth for current state, business rules, known gaps, and feature history. If code and the document disagree, inspect the live code, update the document, and call out the drift.

## Required workflow

- Answer the user in Vietnamese.
- Keep PHUBAI-MES independent from PHUBAI-ERP. ERP is a reference source, not a shared runtime.
- Preserve user edits and unrelated dirty files.
- After every feature, update `BUSINESS_LOGIC_CONTEXT.md` in the same turn.
- Run `npm run lint` and `npm run build` when code changes touch TypeScript/Next UI/API.
- Run `npx prisma generate` after Prisma schema changes.
- Run a Prisma migration when schema changes need database tables/columns.

## References

- Read `references/context-files.md` for a quick map of source-of-truth files and update responsibilities.