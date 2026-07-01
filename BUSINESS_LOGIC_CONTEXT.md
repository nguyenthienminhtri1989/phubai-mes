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
- Energy cron: `npm run energy:cron` (chạy bằng Node JS thuần, không phụ thuộc `tsx`).
- Energy cron hỗ trợ chế độ kiểm tra: `npm run energy:cron -- --status`, `npm run energy:cron -- --collect-once`, `npm run energy:cron -- --close-once`.
- Energy cron dùng `pg` trực tiếp để đọc/ghi DB và `modbus-serial` trực tiếp để đọc Selec EM368, tránh lỗi `tsx/esbuild spawn EPERM` trên Windows.
- AUTO telemetry mở một kết nối TCP cho mỗi Gateway rồi đọc lần lượt các đồng hồ bằng `client.setID()`, giống cron ERP cũ để tránh nghẽn Gateway USR-N520.

## Deployment / Operations

- Quy trình deploy PHUBAI-MES làm tương tự PHUBAI-ERP/PHUBAI-HRM: push lên `main` thì GitHub Actions chạy trên Windows self-hosted runner, sau đó Prisma migrate, build Next.js và restart PM2.
- Port production của PHUBAI-MES: `3002`.
- Database production mặc định: `phubai_mes_db`.
- Tài liệu thao tác chính: `HUONG-DAN-DEPLOY-PHUBAI-MES.md`.
- GitHub Actions workflow chính: `.github/workflows/deploy.yml`.
- Deploy workflow MES chỉ stop/start `phubai-mes-web` và `phubai-mes-energy-cron`, chỉ giải phóng port `3002`, không động tới ERP/HRM hoặc app khác.
- PM2 ecosystem file: `ecosystem.config.cjs`.
- Workflow gọi PM2 qua `npx pm2` vì Windows self-hosted runner service có thể không thấy PM2 global trong `PATH`.
- Workflow đặt `PM2_HOME` vào `${{ github.workspace }}\.pm2` để tránh PM2 ghi vào profile `NetworkService`.
- PM2 apps đặt `windowsHide: true` để không hiện cửa sổ `node.exe` trên Windows khi chạy web/cron.
- PM2 apps hiện dùng:
  - `phubai-mes-web`: chạy `next start -p 3002`.
  - `phubai-mes-energy-cron`: chạy `scripts/energy-cron.js` bằng Node JS thuần.
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
- Sidebar nhóm `GIÁM SÁT ĐIỆN NĂNG` gồm:
  - `/electric/overview`
  - `/electric/daily-input`
  - `/electric/live`
  - `/electric/reports`
  - `/electric/prices`
  - `/electric/catalog`
- Sidebar nhóm `MOBILE` gồm:
  - `/mobile/daily-input`

### Legacy/initial route

- `/energy` và `/api/energy/*` là lát cắt ban đầu của module điện năng.
- Hướng phát triển chính hiện tại là `/electric` và `/api/electric/*` theo `PLANS/yeucau.md`.
- Có thể giữ `/api/energy/*` làm implementation/alias nếu UI mới vẫn gọi qua `/api/electric/*`.

### Electric UI namespace

Các page hiện có:

- `src/app/electric/overview/page.tsx`
- `src/app/electric/catalog/page.tsx`
- `src/app/electric/daily-input/page.tsx`
- `src/app/electric/daily-input/page.tsx` dùng màn nhập tay vận hành: lọc theo ngày/nhà máy/trạm/máy biến áp/nhóm/chế độ, ưu tiên đồng hồ chưa chốt, cho phép nhập MANUAL cho đồng hồ thường và khi AUTO gặp sự cố Gateway/mạng. Từ 2026-07-01, đồng hồ hạ thế (type=1) nhập chỉ số trực tiếp trên bảng (inline), hệ thống tự tính Δ kWh real-time và cảnh báo màu (đỏ nếu chỉ số mới < kỳ trước, vàng nếu = 0, cam nếu bất thường so với TB 7 ngày, xanh nếu hợp lệ); đồng hồ trung thế (type=2) vẫn dùng modal chi tiết 3 chỉ số. Có nút "Lưu tất cả" để commit hàng loạt các dòng hợp lệ.
- `src/app/electric/live/page.tsx`
- `src/app/electric/live/page.tsx` hỗ trợ lọc đồng hồ AUTO theo Factory/PowerTransformer/PowerMeterGroup, nhưng chỉ đọc realtime một đồng hồ mỗi lần qua `/api/electric/live` để tránh quá tải Gateway/Modbus.
- `src/app/electric/reports/page.tsx`
- `src/app/electric/prices/page.tsx`

### Mobile UI namespace

- `src/app/mobile/layout.tsx` — layout riêng cho mobile: ẩn sidebar, header gọn với nút Home, avatar user dropdown (giao diện Desktop / Đăng xuất).
- `src/app/mobile/daily-input/page.tsx` — trang nhập chỉ số điện tối ưu cho điện thoại, dùng `src/components/mobile/MobileDailyInputClient.tsx`.
- Chỉ hỗ trợ đồng hồ hạ thế (type=1) inline. Đồng hồ trung thế (type=2) không hiển thị trên mobile.
- Giao diện: card dọc cho mỗi đồng hồ, input lớn 48px, bộ lọc ẩn/hiện, progress bar, nút Lưu tất cả, cảnh báo màu giống bản desktop.
- Mobile pages dùng chung API `/api/electric/*`.

Shared UI:

- `src/components/electric/ElectricShell.tsx`
- `src/components/electric/ElectricClients.tsx`
- `src/components/mobile/MobileDailyInputClient.tsx`

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

## Import dữ liệu điện năng từ ERP

- Script import chính: `scripts/import-energy-from-erp.js`.
- NPM script: `npm run energy:import-erp`.
- Tài liệu thao tác: `HUONG-DAN-IMPORT-DIEN-NANG-TU-ERP.md`.
- Bắt buộc chạy `--dry-run` trước, sau đó mới chạy `--yes` để ghi dữ liệu vào MES.
- Biến môi trường nguồn ERP: `ERP_DATABASE_URL`.
- Biến môi trường đích MES: `DATABASE_URL`.
- Import dùng upsert và map ID ERP sang ID MES dạng `erp-*` để giữ quan hệ và có thể chạy lại.
- ERP `substations` được map sang MES `PowerTransformer`; ERP `meter_group_categories` map sang MES `PowerMeterGroup`.
- Phải backup MES production trước khi import thật.

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
| 2026-06-25 | Thêm `windowsHide: true` vào PM2 ecosystem để app/cron không bật cửa sổ `node.exe` trên Windows. | `ecosystem.config.cjs`, `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `BUSINESS_LOGIC_CONTEXT.md` | `node -e "require('./ecosystem.config.cjs')"` |
| 2026-06-25 | Thêm script và tài liệu import dữ liệu điện năng từ PHUBAI-ERP sang PHUBAI-MES bằng database-to-database upsert. | `scripts/import-energy-from-erp.js`, `package.json`, `HUONG-DAN-IMPORT-DIEN-NANG-TU-ERP.md`, `BUSINESS_LOGIC_CONTEXT.md` | `npm run energy:import-erp -- --dry-run` với ERP local `phubai_erp_db` và MES local `phubai_mes_db` |
| 2026-06-25 | Bổ sung chế độ kiểm tra một lần cho `scripts/energy-cron.js` để xác minh AUTO telemetry và chốt số mà không phải chờ cron theo giờ. | `scripts/energy-cron.js`, `BUSINESS_LOGIC_CONTEXT.md` | `npm run energy:cron -- --status`, `npm run energy:cron -- --collect-once` |
| 2026-06-25 | Chuyển `scripts/energy-cron.js` sang JS thuần dùng `pg` + `modbus-serial`, không cần `tsx`, để test và chạy PM2 ổn định trên Windows. | `scripts/energy-cron.js`, `package.json`, `ecosystem.config.cjs`, `BUSINESS_LOGIC_CONTEXT.md` | `node --check scripts/energy-cron.js`, `npm run energy:cron -- --status` |
| 2026-06-25 | Port lại logic cron ERP ổn định: nhóm đồng hồ theo Gateway, mở TCP một lần cho mỗi Gateway, đọc từng Modbus ID rồi mới đóng kết nối. | `scripts/energy-cron.js`, `BUSINESS_LOGIC_CONTEXT.md` | `node --check scripts/energy-cron.js`, `npm run energy:cron -- --status`, `npm run lint` |
| 2026-06-25 | Thiết kế lại workflow deploy MES theo mẫu ERP: trước checkout chỉ dừng app MES, sau build chỉ start/reload app MES bằng `--only`, không động app khác. | `.github/workflows/deploy.yml`, `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `BUSINESS_LOGIC_CONTEXT.md` | Kiểm tra workflow chỉ dùng `phubai-mes-web`, `phubai-mes-energy-cron`, port `3002` |
| 2026-06-26 | Bổ sung bộ lọc cho `/electric/live` theo nhà máy/trạm biến áp/nhóm đồng hồ, giữ thao tác đọc realtime ở một đồng hồ mỗi lần để tránh quá tải Gateway/Modbus. | `src/components/electric/ElectricClients.tsx`, `BUSINESS_LOGIC_CONTEXT.md` | `npx eslint src/components/electric/ElectricClients.tsx`, `npm run build` |
| 2026-06-26 | Thiết kế lại `/electric/daily-input` thành màn nhập tay trực quan: bộ lọc ngày/nhà máy/trạm/nhóm, dashboard tiến độ, danh sách cần nhập, modal có chỉ số kỳ trước và ước tính kWh cho MANUAL/AUTO fallback. | `src/components/electric/ElectricClients.tsx`, `BUSINESS_LOGIC_CONTEXT.md` | `npx eslint src/components/electric/ElectricClients.tsx`, `npm run build` |


## 2026-06-27 - Bo sung danh muc may bien ap cho module dien

### Current State Update

- Da bo sung model Prisma `PowerTransformerUnit` de quan ly danh muc may bien ap nam giua `PowerTransformer` (tram bien ap) va `PowerMeter` (dong ho dien).
- `PowerTransformerUnit.id` dung `Int @default(autoincrement())` dung yeu cau id tu dong tang; cac thong tin quan ly gom ma may, ten may, hang san xuat, nam san xuat, so seri, cong suat dinh muc + don vi kVA/MVA, cap dien ap, dong dien dinh muc, trang thai dang dung.
- `PowerMeter` co them `transformerUnitId` nullable de lien ket dong ho vao may bien ap, trong khi van giu `transformerId` de bao toan du lieu/logic cu theo tram bien ap.
- API moi: `/api/electric/transformer-units` CRUD danh muc may bien ap, co filter `factoryId`, `substationId`/`transformerId`, va neu may da co dong ho thi DELETE chuyen sang `isActive=false` thay vi xoa cung.
- API dong ho `/api/electric/meters`/`/api/energy/meters` tra them `transformerUnit`, nhan `transformerUnitId`, va tu dong dong bo `transformerId` theo tram cua may bien ap khi luu dong ho.
- `/api/electric/daily-status` va `/api/electric/reports` ho tro filter `transformerUnitId`; bao cao chi tiet dong ho tra them `transformerUnitName`.
- UI `/electric/catalog` co them tab `May bien ap`, form dong ho co truong may bien ap, cac man nhap chi so/realtime/bao cao hien thi hoac loc theo may bien ap.

### Business Rules Update

- Cay danh muc dien nang chuan tu ngay 2026-06-27: `Factory -> PowerTransformer (tram bien ap) -> PowerTransformerUnit (may bien ap) -> PowerMeter`.
- May bien ap bat buoc co `code` va `name`; cac thong tin ky thuat khac la tuy chon.
- Dong ho moi nen gan vao `transformerUnitId`; `transformerId` tiep tuc ton tai nhu compatibility field de cac bao cao/cron/API cu khong bi vo trong giai do chuyen tiep.
- Khi xoa tram bien ap da co may bien ap hoac dong ho, he thong chi ngung dung tram thay vi xoa cung.

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-06-27 | Them danh muc may bien ap va lien ket cay Factory -> Tram -> May bien ap -> Dong ho dien. | `prisma/schema.prisma`, `prisma/migrations/20260627090000_add_power_transformer_units/migration.sql`, `src/app/api/electric/transformer-units/route.ts`, `src/app/api/energy/meters/route.ts`, `src/app/api/electric/daily-status/route.ts`, `src/app/api/electric/reports/route.ts`, `src/components/electric/ElectricClients.tsx` | `npx prisma generate`, `npx prisma migrate dev --name add_power_transformer_units`, `npm run lint`, `npm run build` |
| 2026-07-01 | Cai tien trang `/electric/daily-input`: cho phep nhap chi so truc tiep tren bang, hien chi so ky truc + TB 7 ngay ngay tren dong, tinh delta kWh real-time, canh bao mau (do/vang/cam/xanh) khi nhap sai/bat thuong, them nut "Luu tat ca". API `daily-status` tra them `lastRecord` va `avgConsumption7d` cho moi dong ho. | `src/app/api/electric/daily-status/route.ts`, `src/components/electric/ElectricClients.tsx` | `npx eslint src/components/electric/ElectricClients.tsx src/app/api/electric/daily-status/route.ts`, `npm run build` |
| 2026-07-01 | Them trang nhap lieu mobile `/mobile/daily-input` voi layout rieng (an sidebar, header gon + nut Home), giao dien card doc toi uu cho dien thoai, bo loc an/hien, progress bar, luu tung dong hoac luu tat ca. Them nhom MOBILE vao sidebar AdminLayout. | `src/app/mobile/layout.tsx`, `src/app/mobile/daily-input/page.tsx`, `src/components/mobile/MobileDailyInputClient.tsx`, `src/components/AdminLayout.tsx` | `npm run lint`, `npm run build`, truy cap `/mobile/daily-input` tren trinh duyet mobile |
