# PHUBAI-MES Context Files

- `AGENTS.md`: repo-level instruction for AI agents.
- `BUSINESS_LOGIC_CONTEXT.md`: living memory for current architecture, business rules, routes, models, feature ledger, and open decisions.
- `PLANS/yeucau.md`: current detailed spec for refactoring electric module to `/electric` namespace.
- `prisma/schema.prisma`: actual database schema.
- `scripts/energy-cron.js`: AUTO telemetry and 08:00 Vietnam-time daily closing logic.
- `.codex/skills/phubai-mes-project-context/SKILL.md`: onboarding skill for general PHUBAI-MES work.
- `PROJECT_SKILLS/phubai-mes-electric/SKILL.md`: task skill for electric module work.

When adding a feature, update `BUSINESS_LOGIC_CONTEXT.md` sections: Current State, Business Rules if needed, Known Gaps/Open Decisions if needed, and Feature Ledger.