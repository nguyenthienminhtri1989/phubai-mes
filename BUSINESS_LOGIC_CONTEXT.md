# PHUBAI-MES Business Logic Context

File này là trí nhớ nghiệp vụ và kỹ thuật của PHUBAI-MES. Mọi AI/agent khi mở dự án trong cửa sổ chat mới phải đọc file này trước khi sửa code, sau đó đọc `AGENTS.md` và `PLANS/yeucau.md` nếu task liên quan module điện năng.

## Quy tắc cập nhật bắt buộc

Sau mỗi lần phát triển tính năng mới, sửa logic nghiệp vụ, đổi schema, đổi route/API, hoặc đổi cron/job, phải cập nhật file này trong cùng lượt làm việc.

Cập nhật tối thiểu gồm:

- `Current State`: tính năng đang có, route/API/model đã thay đổi.
- `Feature Ledger`: thêm một dòng ngày, mô tả thay đổi, file chính, cách verify.
- `Business Rules`: nếu thay đổi công thức, trạng thái, timezone, source-of-truth, quyền hạn hoặc fallback.
- `Open Decisions`: nếu còn điểm chưa chốt hoặc cần hỏi người dùng.

Không để logic quan trọng chỉ nằm trong chat. Nếu một AI mới chỉ đọc repo, nó phải hiểu được dự án đang ở đâu và phát triển tiếp thế nào.

## Quy tắc encoding tiếng Việt

- Tất cả file chứa tiếng Việt phải lưu bằng UTF-8.
- Không ghi hoặc thay thế chuỗi tiếng Việt bằng PowerShell literal trong `Set-Content`, here-string, hoặc `[System.IO.File]::WriteAllText` từ command PowerShell, vì môi trường shell có thể làm mojibake.
- Khi cần ghi nhiều text tiếng Việt, ưu tiên dùng Node `fs.writeFileSync(path, content, 'utf8')` qua Node/Node REPL, hoặc dùng công cụ patch giữ UTF-8 an toàn.
- Sau khi sửa UI tiếng Việt, quét lại các dấu hiệu mojibake như `Ä`, `Ă`, `Æ`, `Â`, `â`, `áº`, `á»` trong các file giao diện.
- Nếu thấy chữ như `KhÄ`, `MÄ`, `TÄ`, `Ä‘`, `Æ°`, phải sửa ngay trước khi kết thúc lượt làm việc.

## Project Identity

- Tên app: PHUBAI-MES.
- Workspace: `D:\DU-AN-PHAN-MEM\PHUBAI-MES\phubai-mes`.
- Đây là app MES mới, độc lập với PHUBAI-ERP.
- PHUBAI-ERP chỉ là nguồn tham chiếu nghiệp vụ/UI cho module đầu tiên, không phải app chạy chung.
- Ngôn ngữ trao đổi với người dùng: tiếng Việt.

## Stack

- Next.js App Router, TypeScript, React.
- PostgreSQL qua Prisma ORM.
- Prisma 7 dùng generated client tại `src/generated/prisma` và PostgreSQL adapter `@prisma/adapter-pg`.
- Ant Design cho UI.
- NextAuth.js v5 dự kiến cho auth.
- Port local: `http://localhost:3002`.
- Database local: `postgresql://postgres:123456@localhost:5432/phubai_mes_db?schema=public`.

## Development Commands

- Dev server: `npm run dev`.
- Build: `npm run build`.
- Lint: `npm run lint`.
- Prisma generate: `npx prisma generate` hoặc `npm run prisma:generate`.
- Prisma migrate dev: `npx prisma migrate dev --name <name>`.
- Deploy migration: `npm run prisma:deploy`.
- Energy cron: `npm run energy:cron`.

## Deployment / Operations

- Quy trình deploy PHUBAI-MES làm tương tự PHUBAI-ERP/PHUBAI-HRM: push lên `main` thì GitHub Actions chạy trên Windows self-hosted runner, sau đó Prisma migrate, build Next.js và restart PM2.
- Port production của PHUBAI-MES: `3002`.
- Database production mặc định: `phubai_mes_db`.
- Tài liệu thao tác chính: `HUONG-DAN-DEPLOY-PHUBAI-MES.md`.
- GitHub Actions workflow chính: `.github/workflows/deploy.yml`.
- PM2 ecosystem file: `ecosystem.config.cjs`.
- Workflow gọi PM2 qua `npx pm2` vì Windows self-hosted runner service có thể không thấy PM2 global trong `PATH`.
- Workflow đặt `PM2_HOME` vào `${{ github.workspace }}\.pm2` để tránh PM2 ghi vào profile `NetworkService`.
- PM2 apps hiện dùng:
  - `phubai-mes-web`: chạy `next start -p 3002`.
  - `phubai-mes-energy-cron`: chạy `scripts/energy-cron.js` bằng `tsx`.
- `ecosystem.config.cjs` dùng `__dirname` làm `cwd`, phù hợp với thư mục checkout của GitHub Actions self-hosted runner.
- Trên server production chỉ dùng `npx prisma migrate deploy`, không dùng `prisma migrate dev`.
- Trước khi deploy, code local phải được commit và push lên GitHub; server nhận job từ GitHub Actions thay vì pull/build thủ công.

## Source-Of-Truth Files

Đọc theo thứ tự khi bắt đầu task mới:

1. `AGENTS.md` - quy định làm việc trong repo.
2. `BUSINESS_LOGIC_CONTEXT.md` - bối cảnh nghiệp vụ/kỹ thuật hiện tại.
3. `PLANS/yeucau.md` - spec refactor module điện năng sang namespace `/electric` nếu task chạm điện năng.
4. `prisma/schema.prisma` - schema thật hiện tại.
5. `scripts/energy-cron.js` - logic AUTO telemetry và chốt số.
6. Các route/API/component liên quan trực tiếp tới task.

## Current State

### App shell

- Trang gốc `src/app/page.tsx` redirect sang `/electric/overview`.
- Module điện năng có layout riêng tại `src/app/electric/layout.tsx`, dùng `src/components/electric/ElectricShell.tsx`.
- Sidebar nhóm `ĐIỆN NĂNG` gồm:
  - `/electric/overview`
  - `/electric/daily-input`
  - `/electric/live`
  - `/electric/reports`
  - `/electric/prices`
  - `/electric/catalog`

### Legacy/initial route

- `/energy` và `/api/energy/*` là lát cắt ban đầu của module điện năng.
- Hướng phát triển chính hiện tại là `/electric` và `/api/electric/*` theo `PLANS/yeucau.md`.
- Có thể giữ `/api/energy/*` làm implementation/alias nếu UI mới vẫn gọi qua `/api/electric/*`.

### Electric UI namespace

Các page hiện có:

- `src/app/electric/overview/page.tsx`
- `src/app/electric/catalog/page.tsx`
- `src/app/electric/daily-input/page.tsx`
- `src/app/electric/live/page.tsx`
- `src/app/electric/reports/page.tsx`
- `src/app/electric/prices/page.tsx`

Shared UI:

- `src/components/electric/ElectricShell.tsx`
- `src/components/electric/ElectricClients.tsx`

### Electric API namespace

Các route hiện có:

- `/api/electric/factories`
- `/api/electric/substations`
- `/api/electric/meters`
- `/api/electric/meter-groups`
- `/api/electric/energy-types`
- `/api/electric/prices`
- `/api/electric/daily-status`
- `/api/electric/daily-input`
- `/api/electric/live`
- `/api/electric/reports`
- `/api/electric/last-record`

Một số route `/api/electric/*` đang re-export hoặc dùng chung implementation từ `/api/energy/*`. UI mới phải gọi namespace `/api/electric/*`.

### Prisma models hiện có

- `Factory`: danh mục nhà máy, là cấp cha của trạm biến áp để thống kê điện/tiền điện theo từng nhà máy.
- `PowerTransformer`: trạm biến áp, có `factoryId`.
- `PowerMeterGroup`: nhóm đồng hồ.
- `PowerMeter`: đồng hồ điện, thuộc trạm qua `transformerId`.
- `ElectricityPrice`: giá điện, key chính theo `type`, mặc định `NORMAL`.
- `PowerTelemetry`: dữ liệu thô từ đồng hồ AUTO.
- `PowerRecord`: dữ liệu chốt ngày, nguồn `AUTO` hoặc `MANUAL`.
- Enum `PowerDataSource`: `MANUAL`, `AUTO`.

Migrations chính:

- `prisma/migrations/20260624162518_init_energy_module/migration.sql`
- `prisma/migrations/20260625012836_add_factory_electric_hierarchy/migration.sql`

## Electric Business Rules

### Factory hierarchy

- `Factory` là cấp nhà máy và là cha của các trạm biến áp.
- `PowerTransformer.factoryId` liên kết trạm biến áp vào nhà máy.
- `PowerMeter.transformerId` liên kết đồng hồ vào trạm biến áp.
- Cây thống kê chuẩn: `PowerRecord -> PowerMeter -> PowerTransformer -> Factory`.
- `/api/electric/reports` hỗ trợ filter `factoryId` và trả thêm `byFactory` để tổng hợp tiêu thụ/chi phí theo nhà máy.
- Xóa nhà máy đã có trạm sẽ chuyển `isActive = false`, không xóa cứng, để giữ lịch sử thống kê.

### Đồng hồ và Modbus

- Đồng hồ AUTO phải có `isAuto = true`, `modbusId`, `gatewayIp`, `gatewayPort`.
- Gateway mặc định port `502`.
- Register mặc định `registerAddr = 0`.
- Đồng hồ Selec EM368 đọc Active Energy tại register `0x00`, 2 input registers.
- Float của Selec phải đảo byte theo CDAB -> ABCD trước khi đọc `FloatBE`.
- Helper chính: `src/lib/energy-modbus.ts`.

### Telemetry AUTO

- `PowerTelemetry` lưu dữ liệu thô đọc tự động.
- Cron thu telemetry mỗi giờ theo `scripts/energy-cron.js`.
- Realtime page/API cũng có thể đọc trực tiếp và lưu telemetry.
- Telemetry dùng để quan sát realtime/chart và làm nguồn chốt AUTO.

### Chốt số ngày

- `PowerRecord` là dữ liệu chốt ngày.
- `dataSource = AUTO` do cron ghi.
- `dataSource = MANUAL` do người dùng nhập/chốt trên UI.
- Cron chốt số lúc 08:00 sáng giờ Việt Nam (`Asia/Ho_Chi_Minh`).
- Ngày chốt phải xử lý cẩn thận timezone Việt Nam để không lệch ngày.
- Unique theo `(recordDate, meterId)`.

### Công thức tiêu thụ

- Bình thường: `consTotal = (currTotal - prevTotal) * tu * ti`.
- Khi đồng hồ reset, nếu `currTotal < prevTotal`: `consTotal = currTotal * tu * ti` và `isReset = true`.
- `costTotal = consTotal * unitPrice`.
- `unitPrice` lấy từ `ElectricityPrice.type = NORMAL` nếu người dùng không nhập rõ.
- Không tin công thức frontend; API/helper phải tính và validate lại.
- Helper tính record chính: `src/lib/energy-record.ts`.

## UX Rules For Electric Module

- Không gộp toàn bộ chức năng vào một page duy nhất.
- `/electric/catalog` dùng tabs cho danh mục, mỗi tab có bảng và modal/form riêng.
- Khi bật AUTO mới hiển thị/nhập các field gateway: `gatewayIp`, `gatewayPort`, `modbusId`.
- AUTO hiển thị tag xanh, MANUAL tag vàng/xám.
- Giữ UI Ant Design gần PHUBAI-ERP để người dùng quen thao tác.
- Module điện năng MES dùng namespace `/electric`, không dùng `/categories` hay `/dashboard/energy` trong UI mới.

## Known Gaps / Open Decisions

- `EnergyType` hiện chưa có model Prisma riêng; API đang trả dữ liệu tĩnh neo theo `ElectricityPrice.type` để UI đủ flow.
- Cần quyết định có thêm model `EnergyType` thật vào Prisma hay giữ đơn giản theo `ElectricityPrice.type` cho phase đầu.
- Cần rà lại toàn bộ `/api/electric/*` để đảm bảo không chỉ alias mà còn đúng contract ERP cần copy.
- Cần kiểm thử thực tế với Gateway USR-N520 và đồng hồ Selec EM368 trong mạng nhà máy.
- Auth/permission NextAuth v5 chưa phải trọng tâm module điện đầu tiên.

## Feature Ledger

| Ngày | Thay đổi | File chính | Verify |
| --- | --- | --- | --- |
| 2026-06-24 | Khởi tạo module điện năng phase 1: schema Prisma, API `/api/energy/*`, UI `/energy`, helper Modbus, cron telemetry/chốt số. | `prisma/schema.prisma`, `src/app/api/energy/*`, `src/app/energy/*`, `src/lib/energy-*`, `scripts/energy-cron.js` | `npx prisma generate`, `npx prisma migrate dev --name init_energy_module`, `npm run lint`, `npm run build`, HTTP `/energy` 200 |
| 2026-06-25 | Refactor hướng module điện năng sang namespace `/electric` theo spec, thêm sidebar/layout và các page/API electric. | `PLANS/yeucau.md`, `src/app/electric/*`, `src/components/electric/*`, `src/app/api/electric/*` | `npm run lint`, `npm run build` |
| 2026-06-25 | Thêm tài liệu trí nhớ dự án và skill hỗ trợ agent mới đọc bối cảnh. | `BUSINESS_LOGIC_CONTEXT.md`, `.codex/skills/phubai-mes-project-context/*`, `PROJECT_SKILLS/phubai-mes-electric/*` | Đọc tài liệu từ `AGENTS.md` |
| 2026-06-25 | Bổ sung quản lý nhà máy CRUD thật và quan hệ `Factory -> PowerTransformer -> PowerMeter`, hỗ trợ lọc/thống kê theo `factoryId`. | `prisma/schema.prisma`, `src/app/api/electric/factories/route.ts`, `src/app/api/energy/transformers/route.ts`, `src/app/api/energy/meters/route.ts`, `src/app/api/electric/reports/route.ts`, `src/components/electric/ElectricClients.tsx` | `npx prisma generate`, `npx prisma migrate dev --name add_factory_electric_hierarchy`, `npm run lint`, `npm run build`, HTTP `/api/electric/factories` 200 |
| 2026-06-25 | Sửa lỗi mojibake tiếng Việt trong giao diện điện năng và bổ sung quy tắc encoding UTF-8. | `src/components/electric/ElectricClients.tsx`, `BUSINESS_LOGIC_CONTEXT.md` | `npm run lint`, `npm run build`, quét mojibake trong UI |
| 2026-06-25 | Bổ sung tài liệu deploy PHUBAI-MES và cấu hình PM2 chạy web + cron điện năng theo mô hình PHUBAI-ERP. | `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `ecosystem.config.cjs`, `BUSINESS_LOGIC_CONTEXT.md` | `node -e "require('./ecosystem.config.cjs')"` |
| 2026-06-25 | Chuyển hướng deploy sang GitHub Actions tự động sau mỗi lần push `main`, dùng Windows self-hosted runner và PM2. | `.github/workflows/deploy.yml`, `ecosystem.config.cjs`, `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `BUSINESS_LOGIC_CONTEXT.md` | `node -e "require('./ecosystem.config.cjs')"`, kiểm tra workflow YAML |
| 2026-06-25 | Bổ sung bước validate GitHub Actions secrets để lỗi thiếu `DATABASE_URL`/auth secrets rõ trước khi chạy Prisma migrate. | `.github/workflows/deploy.yml`, `BUSINESS_LOGIC_CONTEXT.md` | Kiểm tra workflow có step `Validate required secrets` |
| 2026-06-25 | Sửa workflow deploy để không đặt `NODE_ENV=production` trước `npm ci`, đảm bảo devDependencies như `@tailwindcss/postcss` được cài cho Next build. | `.github/workflows/deploy.yml`, `BUSINESS_LOGIC_CONTEXT.md` | Kiểm tra workflow dùng `npm ci --include=dev` và `ecosystem.config.cjs` vẫn set PM2 `NODE_ENV=production` |
| 2026-06-25 | Sửa deploy workflow dùng `npx pm2` và thêm `pm2` vào dependency để runner Windows không phụ thuộc PATH global. | `package.json`, `package-lock.json`, `.github/workflows/deploy.yml`, `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `BUSINESS_LOGIC_CONTEXT.md` | `npm install pm2 --save`, kiểm tra workflow gọi `npx pm2` |
| 2026-06-25 | Bổ sung `PM2_HOME` riêng trong workflow để giảm lỗi quyền PM2 pipe/profile khi runner Windows chạy bằng service account. | `.github/workflows/deploy.yml`, `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `BUSINESS_LOGIC_CONTEXT.md` | Kiểm tra workflow có env `PM2_HOME` và step `Prepare PM2 home` |
