# Electric Module File Map

Main UI namespace:

- `src/app/electric/layout.tsx`
- `src/app/electric/overview/page.tsx`
- `src/app/electric/catalog/page.tsx`
- `src/app/electric/daily-input/page.tsx`
- `src/app/electric/live/page.tsx`
- `src/app/electric/reports/page.tsx`
- `src/app/electric/prices/page.tsx`
- `src/components/electric/ElectricShell.tsx`
- `src/components/electric/ElectricClients.tsx`

Main API namespace:

- `src/app/api/electric/factories/route.ts`
- `src/app/api/electric/substations/route.ts`
- `src/app/api/electric/meters/route.ts`
- `src/app/api/electric/meter-groups/route.ts`
- `src/app/api/electric/energy-types/route.ts`
- `src/app/api/electric/prices/route.ts`
- `src/app/api/electric/daily-status/route.ts`
- `src/app/api/electric/daily-input/route.ts`
- `src/app/api/electric/live/route.ts`
- `src/app/api/electric/reports/route.ts`
- `src/app/api/electric/last-record/route.ts`

Initial/compatibility implementation:

- `src/app/energy/page.tsx`
- `src/app/api/energy/*`

Shared logic:

- `src/lib/prisma.ts`
- `src/lib/energy-modbus.ts`
- `src/lib/energy-record.ts`
- `scripts/energy-cron.js`

Prisma models:

- `PowerTransformer`
- `PowerMeterGroup`
- `PowerMeter`
- `ElectricityPrice`
- `PowerTelemetry`
- `PowerRecord`
- `PowerDataSource`

Known current gap: `EnergyType` may still be represented by static API data rather than a full Prisma model. `Factory` is now a persisted Prisma model and links to `PowerTransformer` through `PowerTransformer.factoryId`.