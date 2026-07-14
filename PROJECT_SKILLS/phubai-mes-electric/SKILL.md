---
name: phubai-mes-electric
description: Continue or refactor the PHUBAI-MES electric module. Use when working on /electric UI, /api/electric APIs, PowerMeter, PowerTransformer, PowerMeterGroup, ElectricityPrice, PowerTelemetry, PowerRecord, Selec EM368 Modbus reads, USR-N520 gateway integration, MANUAL daily input, AUTO cron closing, realtime electric pages, electric reports, or copying electric business logic from PHUBAI-ERP into PHUBAI-MES.
---

# PHUBAI-MES Electric Module

Read these before editing electric code:

1. `BUSINESS_LOGIC_CONTEXT.md`
2. `PLANS/yeucau.md`
3. `prisma/schema.prisma`
4. `scripts/energy-cron.js`
5. The relevant `/electric`, `/api/electric`, `/api/energy`, `src/components/electric`, and `src/lib/energy-*` files

## Direction

- Treat `/electric` and `/api/electric/*` as the main namespace.
- Treat `/energy` and `/api/energy/*` as initial implementation or compatibility layer unless the user asks to remove it.
- Copy PHUBAI-ERP business behavior closely, but adapt paths and schema to PHUBAI-MES.
- Do not collapse catalog, daily input, live, reports, and prices into one page.

## Core rules

- AUTO meter requires `isAuto`, `modbusId`, `gatewayIp`, `gatewayPort`.
- Selec EM368 Active Energy is read from register 0x00 and parsed by CDAB -> ABCD byte order.
- `PowerTelemetry` stores raw AUTO/realtime readings.
- `PowerRecord` stores daily closed readings.
- AUTO records use the 06:00 Vietnam-time business cutoff; the cron executes at 06:15 so hourly telemetry has time to arrive.
- MANUAL records come from user input.
- Consumption formula:
  - normal: `(currTotal - prevTotal) * tu * ti`
  - reset: `currTotal * tu * ti`
- API/helper code must compute and validate business values; frontend is only an input/display surface.

## Encoding rule

- Preserve Vietnamese text as UTF-8. Do not write Vietnamese literals through PowerShell commands because this workspace has produced mojibake such as `KhÄ`, `MÄ`, `Ă`, `Æ`, `Â`, `â`, `áº`, `á»`.
- Prefer Node `fs.writeFileSync(path, content, 'utf8')`, Node REPL, or a UTF-8-safe patch workflow for files containing Vietnamese UI labels/messages.
- Before finishing UI work, scan changed files for mojibake markers and fix them.

## Verification

For code changes, usually run:

- `npx prisma generate` if schema or generated client changes
- `npm run lint`
- `npm run build`
- targeted HTTP/API checks against `http://localhost:3002` when dev server is running
- `npm run energy:cron` only when intentionally testing cron behavior

## References

- Read `references/electric-module.md` for the current file map and expected module shape.
