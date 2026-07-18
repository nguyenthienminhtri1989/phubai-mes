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

> Cập nhật 2026-07-08: hạ tầng production thật là VPS Ubuntu, deploy thủ công qua Git. Mô tả Windows self-hosted runner + GitHub Actions ở các phiên bản trước ĐÃ LỖI THỜI.

- PHUBAI-MES chạy trên VPS Ubuntu (AZDIGI): IP `221.132.16.177`, user SSH `deploy`, thư mục app `/home/deploy/apps/phubai-mes`.
- Node.js qua nvm + PM2; process PM2 tên `phubai-mes`, port production `3002`. Nginx reverse proxy + Cloudflare, domain `phubaimes.site`.
- PostgreSQL 17 chạy trên chính VPS: DB `phubai_mes_db`, user riêng `phubai_mes_user`; web app kết nối qua `localhost:5432`. User `postgres` chỉ để quản trị.
- Deploy THỦ CÔNG qua Git: sửa code ở local → commit → push lên `main` → trên VPS `git pull` → `npm ci` (khi có thay đổi dependency) → `npx prisma migrate deploy` → `npx prisma generate` → `npm run build` → `pm2 reload ecosystem.config.cjs --only phubai-mes --update-env`.
- PM2 web app phải start/reload qua `ecosystem.config.cjs`; không dùng `pm2 start npm --name phubai-mes -- start -p 3002` vì `package.json` đã có `next start -p 3002`, truyền thêm `-p 3002` làm Next nhận dư tham số `3002` và hiểu nhầm đó là thư mục project.
- Trên server production chỉ dùng `npx prisma migrate deploy`, KHÔNG dùng `prisma migrate dev`.
- PM2 ecosystem (`ecosystem.config.cjs`) khai báo 2 process trên VPS: `phubai-mes` (web Next.js port 3002) và `phubai-mes-energy-cron` (chốt mốc dữ liệu 06:00 nhưng thực thi lúc 06:15 giờ VN + dọn telemetry cũ; chế độ PUSH nên không còn thu Modbus theo giờ).
- Collector PUSH (`scripts/energy-push-collector.js`) KHÔNG chạy trên VPS và KHÔNG nằm trong ecosystem; nó chạy ở máy văn phòng / mini PC tại nhà máy và đẩy dữ liệu về VPS qua HTTPS `/api/collector/*`.
- `.env` production đặt tại `/home/deploy/apps/phubai-mes/.env`, bắt buộc có `ENERGY_API_KEY` (khớp với máy chạy collector) và `DATABASE_URL` trỏ `phubai_mes_user@localhost:5432/phubai_mes_db`.
- (2026-07-08) Đã dọn tàn dư kiến trúc Windows: XÓA `.github/workflows/deploy.yml` (deploy thủ công, không còn GitHub Actions), viết lại `ecosystem.config.cjs` cho VPS Linux (bỏ `windowsHide`, đường dẫn `D:\apps`), và cập nhật `HUONG-DAN-DEPLOY-PHUBAI-MES.md` theo quy trình VPS + kiến trúc PUSH.

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
- `src/app/electric/daily-input/page.tsx` dùng màn nhập tay vận hành: lọc theo ngày/nhà máy/trạm/máy biến áp/nhóm/chế độ, ưu tiên đồng hồ chưa chốt, cho phép nhập MANUAL cho đồng hồ thường và khi AUTO gặp sự cố Gateway/mạng. Từ 2026-07-01, đồng hồ hạ thế (type=1) nhập chỉ số trực tiếp trên bảng (inline), hệ thống tự tính Δ kWh real-time và cảnh báo màu (đỏ nếu chỉ số mới < kỳ trước, vàng nếu = 0, cam nếu bất thường so với TB 7 ngày, xanh nếu hợp lệ); từ 2026-07-17 bảng hạ thế hiển thị thêm số chữ điện của bản ghi kế cận trước (`previousConsTotal = lastRecord.consTotal`) ngay trước số chữ hôm nay để người nhập so sánh cao/thấp trực quan. Đồng hồ được sắp theo `PowerMeter.sortOrder` tăng dần, sau đó mới tới `code`, để người dùng tự chỉnh dòng trên/dưới trong danh mục. Đồng hồ trung thế (type=2) vẫn dùng modal chi tiết 3 chỉ số. Có nút "Lưu tất cả" để commit hàng loạt các dòng hợp lệ.
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
- `PowerMeter`: đồng hồ điện, thuộc trạm qua `transformerId`, có `sortOrder` để điều khiển thứ tự hiển thị trên danh mục và màn nhập liệu.
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
- Mốc chốt nghiệp vụ là 06:00 sáng giờ Việt Nam (`Asia/Ho_Chi_Minh`) và vẫn dùng `CLOSING_HOUR` cho cửa sổ tách khung giá 24h. Cron thực thi lúc 06:15 qua `CLOSING_RUN_MINUTE` để chờ collector ghi đủ telemetry 06:00 của mọi đồng hồ; việc lùi giờ chạy không đổi `recordDate` hay cửa sổ tính điện.
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
| 2026-07-17 | Bổ sung cột số chữ điện hôm trước trên bảng nhập hạ thế `/electric/daily-input`, lấy từ `lastRecord.consTotal` của đồng hồ và hiển thị so sánh cao/thấp với số chữ hôm nay/draft. | `src/app/api/electric/daily-status/route.ts`, `src/components/electric/ElectricClients.tsx`, `BUSINESS_LOGIC_CONTEXT.md` | `npm run lint`, `npm run build` |
| 2026-07-17 | Thêm `PowerMeter.sortOrder` để người dùng tự chỉnh thứ tự đồng hồ trong danh mục; API danh mục và `/api/electric/daily-status` sắp theo `sortOrder`, sau đó `code`. | `prisma/schema.prisma`, `prisma/migrations/20260717090000_add_power_meter_sort_order/migration.sql`, `src/app/api/energy/meters/route.ts`, `src/app/api/electric/daily-status/route.ts`, `src/components/electric/ElectricClients.tsx` | `npx prisma generate`, `npm run build` |
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
| 2026-07-02 | Doi gio chot so dien nang tu 08:00 sang 06:00 gio Viet Nam; gom vao hang so `CLOSING_HOUR` dung chung cho lich cron va cua so tach khung gia 24h (06:00 hom truoc -> 06:00 hom nay). | `scripts/energy-cron.js`, `BUSINESS_LOGIC_CONTEXT.md` | `node --check scripts/energy-cron.js`, `pm2 restart phubai-mes-energy-cron`, `npm run energy:cron -- --close-once` |

## 2026-07-04 - Chuyen giao dien PHUBAI-MES sang Light theme

### Current State Update

- App shell desktop `AdminLayout` va mobile layout da chuyen tu Ant Design dark algorithm sang default light algorithm.
- Palette chinh dung nen sang `#f5f7fb` / card trang, chu chinh `#172033`, chu phu `#526174`, border xam xanh nhat de dam bao do tuong phan khi xem tren nen sang.
- Cac diem hard-code dark trong mobile daily input va live meter card da duoc dieu chinh de dong bo Light theme.

### Business Rules Update

- Khong thay doi schema, API, cong thuc tinh dien, cron, quyen han, hay namespace `/electric`.
- Thay doi chi anh huong presentation layer: shell, sidebar, header, card/table/input tokens va mot so mau cuc bo trong UI.

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-04 | Chuyen giao dien PHUBAI-MES tu Dark sang Light theme, giu contrast chu va cac trang dien nang/mobile de thao tac de doc hon. | `src/components/AdminLayout.tsx`, `src/app/mobile/layout.tsx`, `src/components/mobile/MobileDailyInputClient.tsx`, `src/components/electric/ElectricClients.tsx` | `npx eslint src/components/AdminLayout.tsx src/app/mobile/layout.tsx src/components/mobile/MobileDailyInputClient.tsx src/components/electric/ElectricClients.tsx`, `npm run build` |

## 2026-07-06 - Fix electric runtime 500 and realtime API contract

### Current State Update

- Ran `npx prisma generate` after schema/API changes so generated Prisma Client includes current electric fields such as `PowerMeter.factoryId` and `PowerMeter.transformerUnitId`.
- Hardened `/api/electric/live`: missing `meterId` now returns 400, unknown meter returns 404, and meters not configured for AUTO realtime return 400 instead of Prisma/runtime 500.
- `/api/electric/live` success payload now includes top-level `timestamp`, `totalEnergy`, voltage/current/power fields, `meter`, and `telemetry`, matching `ElectricLiveClient` expectations while keeping telemetry available.

### Business Rules Update

- Realtime remains one selected AUTO meter per request; the API must not try Modbus/agent reads when no meter is selected or the meter is not configured for AUTO.

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-06 | Sua loi runtime sau khi Prisma Client lech schema va lam `/api/electric/live` tra loi ro rang khi thieu/chua dung `meterId`, dong thoi tra payload dung cho UI realtime. | `src/app/api/electric/live/route.ts`, `src/generated/prisma/*` (generated, gitignored), `BUSINESS_LOGIC_CONTEXT.md` | `npx prisma generate`, `npx prisma migrate status`, `npx eslint src/app/api/electric/live/route.ts src/app/api/electric/daily-status/route.ts src/components/electric/ElectricClients.tsx src/components/electric/MvDailyInputClient.tsx src/components/mobile/MobileDailyInputClient.tsx`, `npm run build`, HTTP smoke `/electric/catalog`, `/electric/daily-input`, `/electric/daily-mv`, `/electric/live`, `/mobile/daily-input` |

## 2026-07-06 - Add missing PowerMeter factory migration

### Current State Update

- Added migration `20260706090000_add_power_meter_factory_id` because `prisma/schema.prisma` and generated Prisma Client expected `PowerMeter.factoryId`, but the live PostgreSQL table did not have that column.
- Migration adds nullable `PowerMeter.factoryId`, backfills it from `PowerTransformer.factoryId` for meters that already have `transformerId`, then creates `PowerMeter_factoryId_idx` and `PowerMeter_factoryId_fkey`.
- This fixes Prisma P2022 `The column PowerMeter.factoryId does not exist in the current database` on `/api/electric/meters` and `/api/electric/daily-status`, which affected `/electric/catalog`, `/electric/daily-input`, `/electric/daily-mv`, and `/mobile/daily-input`.

### Business Rules Update

- `PowerMeter.factoryId` remains a compatibility/direct filter field, especially for medium-voltage meters; low-voltage meters can still derive factory through `PowerMeter.transformerId -> PowerTransformer.factoryId`.

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-06 | Them migration bo sung cot `PowerMeter.factoryId` con thieu trong DB, backfill tu tram bien ap, sua loi P2022 tren API meters/daily-status. | `prisma/migrations/20260706090000_add_power_meter_factory_id/migration.sql`, `BUSINESS_LOGIC_CONTEXT.md` | `npx prisma migrate deploy`, `npx prisma migrate status`, `npx prisma generate`, `npx eslint src/app/api/energy/meters/route.ts src/app/api/electric/daily-status/route.ts src/app/api/electric/live/route.ts src/components/electric/ElectricClients.tsx src/components/electric/MvDailyInputClient.tsx src/components/mobile/MobileDailyInputClient.tsx`, `npm run build`, HTTP smoke electric pages and affected APIs |## 2026-07-07 - User factory scope for electric daily input

### Current State Update

- Added optional `User.factoryId` relation to `Factory` for daily-input permission scope.
- Admin user management now shows and edits the factory assigned to each user.
- Desktop low-voltage daily input, medium-voltage daily input, and mobile daily input still load all meters for viewing, but disable/save-block meters outside the current user's assigned factory.
- The daily record API enforces the same rule server-side for POST requests so UI bypass cannot write records for another factory.
- The MANAGER label in the app header was changed from department-head wording to a neutral management label.

### Business Rules Update

- Factory scope limits data entry only; it must not hide meters, reports, catalogs, or realtime read visibility.
- `ADMIN` users can input all factories.
- Non-admin users with `User.factoryId` can only input readings for meters whose factory is resolved from `PowerMeter.factoryId`, `PowerMeter.transformer.factoryId`, or `PowerMeter.transformerUnit.transformer.factoryId`.
- Non-admin users without `User.factoryId` keep the previous input behavior during transition so existing accounts are not accidentally locked out before factory assignment.

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-07 | Them lien ket user-nha may va gioi han quyen nhap chi so dien theo nha may, trong khi van cho xem toan bo dong ho. Doi nhan role MANAGER tren header sang nhan quan ly trung tinh. | `prisma/schema.prisma`, `prisma/migrations/20260707090000_add_user_factory_scope/migration.sql`, `src/auth.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[id]/route.ts`, `src/app/api/energy/records/route.ts`, `src/components/electric/UsersClient.tsx`, `src/components/electric/ElectricClients.tsx`, `src/components/electric/MvDailyInputClient.tsx`, `src/components/mobile/MobileDailyInputClient.tsx`, `src/components/AdminLayout.tsx` | `npx prisma migrate deploy`, `npx prisma generate`, `npx prisma migrate status`, `npx eslint src/auth.ts src/app/api/admin/users/route.ts src/app/api/admin/users/[id]/route.ts src/app/api/energy/records/route.ts src/components/AdminLayout.tsx src/components/electric/UsersClient.tsx src/components/electric/ElectricClients.tsx src/components/electric/MvDailyInputClient.tsx src/components/mobile/MobileDailyInputClient.tsx`, `node --check scripts/energy-cron.js`, `npm run build` |

## 2026-07-07 - User multi-factory input scope correction

### Current State Update

- Replaced single `User.factoryId` input scope with many-to-many `UserFactoryScope` because one user can input one, two, or all three factories.
- Migration `20260707093000_user_factory_multi_scope` backfills existing single-factory assignments into `UserFactoryScope`, then removes the legacy `User.factoryId` column.
- Admin user management now uses a multi-select `factoryIds` field for factories allowed for daily input.
- Session data now exposes `session.user.factoryIds`, and daily input authorization checks membership in that array.

### Business Rules Update

- Empty `factoryIds` means no factory restriction during the transition.
- Non-admin users with one or more `factoryIds` can input only meters whose resolved factory is included in that list.
- Visibility remains unrestricted: catalogs, filters, reports, realtime, and meter lists still show all factories.

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-07 | Doi phan quyen nhap lieu user-nha may tu 1 nha may sang nhieu nha may bang bang noi `UserFactoryScope`; modal user chon duoc nhieu nha may. | `prisma/schema.prisma`, `prisma/migrations/20260707093000_user_factory_multi_scope/migration.sql`, `src/auth.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[id]/route.ts`, `src/app/api/energy/records/route.ts`, `src/components/electric/UsersClient.tsx`, `src/components/electric/ElectricClients.tsx`, `src/components/electric/MvDailyInputClient.tsx`, `src/components/mobile/MobileDailyInputClient.tsx` | `npx prisma migrate deploy`, `npx prisma generate`, `npx eslint src/auth.ts src/app/api/admin/users/route.ts src/app/api/admin/users/[id]/route.ts src/app/api/energy/records/route.ts src/components/electric/UsersClient.tsx src/components/electric/ElectricClients.tsx src/components/electric/MvDailyInputClient.tsx src/components/mobile/MobileDailyInputClient.tsx`, `npm run build` |


## 2026-07-08 - Chuyen thu thap dien nang sang co che PUSH (bo SSH tunnel/agent)

### Current State Update

- Thu thap dien nang chuyen tu SSH tunnel + energy-agent (nhieu tien trinh, hay chet tren Windows) sang co che PUSH qua HTTPS: mot tien trinh collector duy nhat o phia nha may doc Modbus va day len VPS.
- Them model Prisma `PowerLiveReading` (khoa chinh `meterId`, `totalEnergy`, `readAt` @db.Timestamptz, `updatedAt`) luu ban doc MOI NHAT cho realtime; migration `20260708090000_add_power_live_reading`.
- Them endpoint may-toi-may bao ve bang header `x-api-key` (bien moi truong `ENERGY_API_KEY`):
  - `GET /api/collector/meters`: tra danh sach dong ho AUTO du cau hinh (isActive, isAuto, modbusId, gatewayIp) duoi dang `{ meters: [...] }`.
  - `POST /api/collector/ingest`: nhan `{ readings: [{ meterId, totalEnergy, readAt }] }`, upsert `PowerLiveReading` (chi khi readAt moi hon ban dang luu) + insert `PowerTelemetry` theo MOC GIO TRON (timestamp = readAt, chi luu ban doc DAU TIEN cua moi gio - so sanh hour bucket UTC, trung khop moc gio VN vi lech 7 tieng chan). Bo qua reading cua dong ho khong ton tai/du lieu sai.
- Helper xac thuc collector: `src/lib/collector-auth.ts` (`requireCollectorKey`), tach rieng khoi `@/lib/permissions` (session NextAuth).
- `src/middleware.ts` loai tru `api/collector` khoi auth NextAuth (route tu bao ve bang api-key), giong `api/auth`.
- `GET /api/electric/live` viet lai: doc `PowerLiveReading` thay vi goi agent/Modbus. Bo phu thuoc `AGENT_URL`/`AGENT_TOKEN`. Giu dung shape `LiveData` (timestamp, totalEnergy, voltage/current/power/pf null, meter). Tra 404 khi chua co ban doc realtime.
- `scripts/energy-cron.js`: BO lich collect telemetry theo gio khoi cron server (telemetry gio do collector day len). Chi con lich chot moc du lieu `CLOSING_HOUR` (06:00 VN), thuc thi tre tai `CLOSING_RUN_MINUTE` (06:15) + don telemetry cu > 6 thang. Van giu ham `collectTelemetry` + `--collect-once` de test tay.
- Them `scripts/energy-push-collector.js` (collector PUSH: doc Modbus theo gateway, push HTTPS, buffer `energy-buffer.jsonl` khi mat mang). Chay o may van phong / mini PC, KHONG chay tren web server. `energy-buffer.jsonl` da them vao `.gitignore`.
- `.env` local da them `ENERGY_API_KEY`. VPS va may chay collector phai dung CUNG mot key.

### Business Rules Update

- Realtime = doc ban moi nhat tu `PowerLiveReading` (do collector day day moi ~60s), do tre chap nhan <= READ_INTERVAL_SECONDS. Nut realtime KHONG con cham Modbus qua mang.
- Collector chi doc `totalEnergy` (2 input registers, parse Selec CDAB->ABCD) nen voltage/current/power tam thoi null tren realtime.
- Telemetry lich su lay theo MOC GIO TRON: moi gio luu 1 dong (ban doc dau tien cua gio do), giong cron cu `0 * * * *`, khong phinh theo chu ky 60s cua collector. Ingest gom telemetry bang hour bucket (`Math.floor(ms/3_600_000)`).
- Prisma phai chay session `timezone=UTC` (cau hinh trong `src/lib/prisma.ts` qua `PrismaPg({ ..., options: "-c timezone=UTC" })`). Neu khong, session TZ mac dinh theo server (Postgres local Windows = Asia/Bangkok +7) lam Prisma ghi cot Timestamptz (`PowerTelemetry.timestamp`, `PowerLiveReading.readAt`) lech -7h. Cot `timestamp without time zone` nhu `PowerRecord.recordDate` khong bi anh huong.
- `readAt` goc duoc giu lam `timestamp` telemetry va `readAt` live, nen buffer gui bu sau khi mat mang van dung moc thoi gian.
- Endpoint `/api/collector/*` la kenh may-toi-may, chi xac thuc bang `x-api-key`; khong dung session/role.
- Chot so hang ngay (`closeDailyRecords`) khong doi logic, chi doi cho chay: nay chi con o cron server (doc DB local), khong con thu Modbus.

### Open Decisions / Luu y hạ tang

- (Da chot 2026-07-08) Production that = VPS Ubuntu AZDIGI (221.132.16.177), deploy thu cong qua Git; xem muc Deployment / Operations. Da don xong tan du Windows: xoa .github/workflows/deploy.yml, viet lai ecosystem.config.cjs (Linux) va HUONG-DAN-DEPLOY-PHUBAI-MES.md (VPS + kien truc PUSH).
- Collector chay bang PM2 o may nha may: `pm2 start scripts/energy-push-collector.js --name energy-collector` (can `API_BASE_URL`, `ENERGY_API_KEY`, `READ_INTERVAL_SECONDS` trong .env cung thu muc). Go 3 tien trinh cu: `pm2 delete energy-cron energy-agent pg-tunnel` neu con.
- Neu bat buoc doc dung giay bam nut realtime (thay vi <=60s tre) thi can them co che hang doi lenh, chua lam.

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-08 | Chuyen thu thap dien sang PUSH HTTPS: them model PowerLiveReading + migration, endpoint /api/collector/meters + /api/collector/ingest (x-api-key), sua /api/electric/live doc DB, bo lich collect theo gio khoi cron server, them collector energy-push-collector.js, loai api/collector khoi middleware. | `prisma/schema.prisma`, `prisma/migrations/20260708090000_add_power_live_reading/migration.sql`, `src/lib/collector-auth.ts`, `src/app/api/collector/meters/route.ts`, `src/app/api/collector/ingest/route.ts`, `src/app/api/electric/live/route.ts`, `src/middleware.ts`, `scripts/energy-cron.js`, `scripts/energy-push-collector.js`, `.gitignore`, `.env` | `npx prisma migrate deploy`, `npx prisma generate`, `node --check scripts/energy-cron.js`, `node --check scripts/energy-push-collector.js`, `npx eslint` cac route moi, `npm run build`, smoke: GET/POST /api/collector/* voi x-api-key (401 khong key, 200 co key, ingest upsert live + telemetry theo gio) |
| 2026-07-08 | Don tan du kien truc Windows: xoa GitHub Actions workflow (chuyen han sang deploy thu cong tren VPS), viet lai ecosystem.config.cjs cho VPS Linux (2 process phubai-mes + phubai-mes-energy-cron, bo windowsHide/D:appspaths), cap nhat huong dan deploy theo VPS Ubuntu + kien truc PUSH. | `.github/workflows/deploy.yml` (deleted), `ecosystem.config.cjs`, `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `BUSINESS_LOGIC_CONTEXT.md` | `node -e "require(./ecosystem.config.cjs)"`, doc review, `git rm` workflow |

## 2026-07-08 - Xu ly ban ghi MOC GOC (baseline) cho lan chot/nhap chi so dau tien

### Current State Update

- Them nhanh baseline cho ca AUTO va MANUAL: khi mot dong ho CHUA co `PowerRecord` ky truoc, lan chot/nhap dau tien chi luu chi so hien tai lam MOC GOC (prev = curr), `consTotal = 0`, `costTotal = 0`, khong phat sinh tieu thu; danh dau bang `note = "Chi so dau ky (baseline) - chua tinh tieu thu"`. Tu ky sau moi lay hieu de tinh san luong.
- `scripts/energy-cron.js` (`closeDailyRecords`): neu `lastRecord.rowCount === 0` -> insert record baseline (upsert, `cons* = 0`) roi `continue`, khong tinh delta/khung gia; tranh loi ngay dau tinh nham ca chi so luy ke thanh tieu thu 1 ngay.
- `src/lib/energy-record.ts` (`buildPowerRecordValues`): them nhanh baseline cho type=1 (khi khong co lastRecord VA nguoi dung khong tu nhap `prevTotal`) va type=2 (khi khong co lastRecord -> set MOC GOC cho ca 3 tier Binh thuong/Cao diem/Thap diem). Helper tra them field `note`.
- `src/app/api/energy/records/route.ts`: doi `note: body.note || null` thanh `note: body.note || values.note || null` de note baseline tu helper duoc ghi khi nguoi dung khong nhap note rieng.

### Business Rules Update

- Dieu kien nhan biet "lan dau" la KHONG co `PowerRecord` ky truoc (`recordDate < ngay dang chot`), KHONG dua vao `PowerTelemetry` (voi co che PUSH, telemetry da co san truoc khi chot lan dau nen khong dung lam moc baseline).
- Ban ghi baseline khong phat sinh chi phi nen khong can chot gia; gia chi ap khi thuc su co consumption.
- Type=2 (Trung the, MANUAL-only): baseline phai set dong thoi ca 3 thanh ghi, neu khong lan tinh dau tien se lech tier.
- MANUAL type=1 van cho phep nhap tay `prevTotal` (chi so dau ky da biet) de tinh tieu thu ngay tu ngay dau; khi do khong coi la baseline.
- Chinh sach reset (`curr < prev` -> cons = curr) GIU NGUYEN, chua doi trong lan nay (tach thanh quyet dinh nghiep vu rieng neu can).

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-08 | Them xu ly ban ghi MOC GOC (baseline) cho lan chot/nhap dau tien: AUTO (cron) va MANUAL (helper) chi luu chi so lam moc, tieu thu = 0, danh dau bang note; tranh ngay dau tinh nham chi so luy ke thanh tieu thu. | `scripts/energy-cron.js`, `src/lib/energy-record.ts`, `src/app/api/energy/records/route.ts`, `BUSINESS_LOGIC_CONTEXT.md` | `node --check scripts/energy-cron.js`, `npx eslint src/lib/energy-record.ts src/app/api/energy/records/route.ts`, `npm run build`, smoke: chot/nhap lan dau -> record co cons=0 + note baseline; ngay ke tinh delta binh thuong |

### Bo sung: Xu ly reset/thay dong ho (chi so moi < ky truoc)

- Truoc day: khi `curr < prev` he thong tu coi `consTotal = curr` (gia dinh dong ho ve 0 dau ky). Rui ro: thoi phong khi thay dong ho co chi so khoi tao != 0, hoac reset giua ngay.
- Nay: khi phat hien tut so (AUTO trong `closeDailyRecords`, MANUAL trong `buildPowerRecordValues` type=1 va type=2), KHONG tu tinh tieu thu: ghi record voi `consTotal = 0` (ca 3 tier = 0 voi type=2), `costTotal = 0`, `isReset = true`, va `note = "Nghi reset/thay dong ho (chi so moi < ky truoc) - chua tinh tieu thu, can kiem tra & nhap tay"`. Van luu prev/curr that de nguoi van hanh thay va xu ly.
- MANUAL van cho nguoi van hanh nhap tay de tinh dung khi da biet chi so cat (vd nhap `prevTotal` phu hop cho type=1).

| 2026-07-08 | Xu ly reset/thay dong ho: khi chi so moi < ky truoc thi khong tu tinh tieu thu (cons=0, isReset=true, note canh bao) o ca AUTO (cron) va MANUAL (helper type=1/type=2), thay cho hanh vi cu cons=curr de tranh du lieu sai. | `scripts/energy-cron.js`, `src/lib/energy-record.ts`, `BUSINESS_LOGIC_CONTEXT.md` | `node --check scripts/energy-cron.js`, `npx eslint src/lib/energy-record.ts`, `npm run build`, smoke: chot/nhap voi chi so tut -> record cons=0 + isReset + note canh bao |
| 2026-07-08 | Telemetry lay theo moc gio tron (ban doc dau moi gio thay vi nguong 59 phut) va sua bug Prisma ghi Timestamptz lech -7h bang cach ep session timezone=UTC. | `src/app/api/collector/ingest/route.ts`, `src/lib/prisma.ts`, `BUSINESS_LOGIC_CONTEXT.md` | `npx eslint`, `npm run build`, smoke ingest: 5 reading/3 gio => telemetryInserted=3 (dau moi gio); SQL kiem tra timestamp luu dung UTC khong lech |
| 2026-07-08 | Dong bo quy trinh PM2 VPS sau loi command cu `npm start -p 3002` lam Next nhan thanh `next start -p 3002 3002`; deploy/reload web phai di qua `ecosystem.config.cjs --only phubai-mes --update-env`, khong start bang `pm2 start npm`. | `ecosystem.config.cjs`, `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `BUSINESS_LOGIC_CONTEXT.md` | `node -e "require('./ecosystem.config.cjs')"`, doc review |

## 2026-07-14 - Hoa don EVN la nguon tien duy nhat + tu dong lay chi so trung the tu portal CSKH

### Current State Update

**1. Bao cao dien nang (`/electric/reports`) viet lai theo mo hinh 2 LOP:**

- `src/app/api/electric/reports/route.ts` viet lai hoan toan. Truoc day route SUM het `costTotal` cua MOI `PowerRecord` (ca trung the lan ha the) vao mot con so -> DEM TRUNG gan gap doi, vi cong to trung the la cong to tong dau nguon do TRUM len toan bo dong ho ha the cung nha may.
- Nay tach 2 lop khong bao gio cong vao nhau:
  - `billed*` = so lieu cong to Trung the (type=2, cong to EVN) -> TIEN THAT phai tra.
  - `internal*` = tong dong ho Ha the (type=1) -> dien di dau trong nha may.
- Chi phi tung dong ho ha the duoc PHAN BO NGUOC tu hoa don EVN theo ty trong kWh (xem Business Rules).
- Them cac field moi trong response: `billedConsumption`, `billedCost`, `internalConsumption`, `lossConsumption`, `lossPercent`, `hasNegativeLoss`, `avgUnitPrice`, `mvMeterCount`, `lvMeterCount`, `warnings[]`; them mang `byMvMeter` (danh sach cong to EVN + 3 khung + thanh tien). `byMeter` nay CHI con dong ho ha the, co them `costRaw` (so cu do dong ho tu tinh, chi de doi chieu).
- Giu alias `totalConsumption`/`totalCost` = so lieu EVN de `ElectricOverviewClient` khong vo.
- FIX BUG LOC NHA MAY: bo loc cu `meter: { transformer: { factoryId } }` loai sach cong to trung the (vi trung the co `transformerId = null`, gan thang `factoryId` tren `PowerMeter`). Nay dung `OR` do ca 3 duong: `factoryId` truc tiep / qua `transformer` / qua `transformerUnit.transformer`.
- Bo fallback `consNormal ?? consTotal` khi tinh ty trong khung gio (fallback cu don het san luong chua tach khung vao Binh thuong, thoi phong ty trong). Nay 3 khung lay TRUC TIEP tu cong to EVN.
- `src/components/electric/ElectricClients.tsx`: cap nhat type `ReportData`; doi 4 the KPI (San luong EVN / Chi phi EVN + don gia binh quan / Ton that & chua do duoc / Nhanh ha the ton dien nhat); them banner canh bao `warnings`; them bang doi chieu theo nha may; them bang cong to trung the rieng; bang ha the them cot "Chi phi phan bo" + "Tu tinh (doi chieu)".

**2. FIX: cong to trung the khong nhap duoc he so TU/TI:**

- Form quan ly dong ho (`ElectricClients.tsx`) truoc day AN khoi TU/TI khi `type === 2` (`getFieldValue("type") === 2 ? null : ...`). Hau qua: cong to trung the KHONG CO DUONG NAO nhap he so, luon giu mac dinh `tu = ti = 1` -> san luong chi bang hieu so tho, THIEU he so nhan.
- Cong thuc trong `src/lib/energy-record.ts` KHONG sai (da nhan `deltaNormal * meter.tu * meter.ti` cho ca 3 khung tu dau), schema cung da co san `tu`/`ti`. Loi CHI o form.
- Nay: bo dieu kien an, TU/TI hien voi moi loai dong ho; them o "He so nhan (TU x TI)" tu tinh; them cot "He so nhan" vao bang danh muc DH Trung the, dong ho chua dat hien tag DO "Chua dat (x1)".
- KHONG them truong moi vao schema (tranh 2 nguon su that song song voi `tu`/`ti`).

**3. Tu dong lay chi so trung the hang ngay tu portal CSKH cua EVNCPC:**

- Them `POST /api/collector/mv-ingest` (`src/app/api/collector/mv-ingest/route.ts`): kenh may-toi-may, xac thuc `x-api-key` qua `requireCollectorKey` (giong `/api/collector/ingest`; khong dung duoc `/api/electric/daily-input` vi route do doi session NextAuth). Nhan `{ readings: [{ meterCode, recordDate, currNormal, currPeak, currOffPeak, note? }] }`.
- Them `scripts/evn-portal-collector.js`: chay o mini PC nha may (KHONG chay tren VPS), one-shot qua PM2 cron sau moc 06:00; khuyen nghi chay nhieu nhip 06:15/06:30/06:45 de cho portal EVN cap nhat kip. Ho tro DA TAI KHOAN (EVN cap moi cong to mot tai khoan rieng), moi tai khoan co token cache rieng.
- Them `scripts/evn-accounts.example.json` (mau cau hinh). `.gitignore` da chan `evn-accounts.json`, `.evn-tokens/`, `evn-mv-buffer.jsonl`, `evn.log`.

### Business Rules Update

**Nguyen tac tien dien (QUAN TRONG NHAT):**

- Cong to Trung the (type=2) = cong to EVN dau nguon, do TRUM len toan bo dong ho ha the cung nha may. TUYET DOI KHONG duoc cong tien MV + tien LV -> se dem trung gan gap doi.
- MV la NGUON TIEN DUY NHAT. Chi MV moi co du 3 thanh ghi TOU nen `costTotal` tinh dung 3 gia = so tien that phai tra EVN.
- Tien cua dong ho ha the KHONG dang tin:
  - LV nhap tay (chot 1 lan/ngay luc 06:00): khong du du lieu tach khung gio -> don het vao gia Binh thuong -> SAI.
  - LV AUTO (telemetry 1 lan/gio): tach duoc 3 khung nhung chi la NOI SUY tuyen tinh theo so phut giao voi bieu khung gio -> gan dung, van khong khop EVN.
- KHONG the dung bieu khung gio (`TariffTimeRange`) de tach 3 gia cho dong ho nhap tay: bieu chi cho biet gio nao thuoc khung nao, KHONG cho biet dien tieu thu roi vao gio nao. Cach duy nhat la gia dinh phu tai phang 24/24 -> sai nghiem trong voi nha may chay ca, va tao ra con so trong rat chinh xac nhung thuc chat la bia.

**Cong thuc phan bo nguoc (chi o TANG BAO CAO, khong doi `PowerRecord`):**

```
rate(nha may)         = SUM costTotal(MV) / SUM consTotal(LV)   [VND/kWh]
costAllocated(record) = consTotal(record) x rate(nha may)
```

- Tong chi phi phan bo LUON khop hoa don EVN -> ke toan doi chieu duoc.
- Khong phu thuoc viec LV da lap AUTO hay chua: LV chi dong vai tro TY TRONG. Khi LV len AUTO het, ty trong chi chinh xac hon, KHONG phai sua code.
- `rate` tinh tu `costTotal` DA LUU CUNG cua MV nen mien nhiem voi viec EVN doi gia (bao cao thang cu khong bi tinh lai).
- `avgUnitPrice` = don gia binh quan thuc te cua nha may, DA bao gom san anh huong cua ca 3 khung gia.

**Ton that:**

- `lossCons = consMV - SUM consLV` = ton that duong day/MBA + phu tai chua gan dong ho.
- Neu AM (LV vuot MV) = du lieu bat thuong (sai TU/TI, hoac MV nhap thieu ngay). GIU NGUYEN dau am (khong kep ve 0) + canh bao DO, de lo ngay loi thay vi giau di.

**Cong thuc san luong trung the:**

- `cons = (chi so sau - chi so truoc) x TU x TI`, ap cho CA 3 KHUNG (Binh thuong/Cao diem/Thap diem). He so nhan = `tu * ti`.
- Chi so cong to (`currNormal/currPeak/currOffPeak`) luu THO (chua nhan he so); chi cac cot `cons*` moi nhan he so. Nhat quan giua nhap tay va AUTO.

**EVN portal collector:**

- Portal: `https://cskh.cpc.vn`, API: `https://cskh-api.cpc.vn`.
- Login: `POST /api/cskh/user/login`, body `{ username, password, grant_type: "password", scope: "CSKH", ThongTinCaptcha: { captcha: "undefined", token: "undefined" } }` -> tra `access_token` (JWT, `expires_in = 31536000` = ~1 NAM). Khong co captcha.
- Du lieu: `POST /api/remote/dspm/thongsovanhanh?customerPoint=...&customerCode=...&time=MM/DD/YYYY HH:mm`, header `Authorization: Bearer <token>`.
  - PHAI la POST: GET tra 405 (`allow: POST`).
  - PHAI co body (gui `"{}"` + `Content-Type: application/json`): IIS tra 411 Length Required neu body rong.
  - `time` dung dinh dang MY (MM/DD/YYYY), khong phai DD/MM/YYYY.
- Response: `results[0].impbt / impcd / imptd` = chi so LUY KE 3 khung Binh thuong/Cao diem/Thap diem (kiem chung: `impbt + impcd + imptd ~= importkwh`). Day dung la 3 so nguoi van hanh dang go tay -> collector chi thay ban phim, KHONG doi logic tinh toan nao.
- Truong `chuoI_GIA` tra luon don gia 3 khung cua EVN (vd `BT: 100%*1604-SXBT-A; CD: ...; TD: ...`), duoc ghi vao `note` de doi chieu voi bang `ElectricityPrice`.
- Quy uoc ngay: so doc luc 06:00 SANG NAY duoc ghi cho `recordDate = NGAY HOM QUA` (giong het trang nhap tay `/electric/daily-mv`, mac dinh `dayjs().subtract(1, "day")`). Collector chiu trach nhiem gui dung ngay; endpoint KHONG tu suy dien.
- CHOT AN TOAN 1 - du lieu phai TUOI: script kiem tra `results[0].ngaygio` phai dung `hom-nay T06:00:00`. Neu cong to mat song va portal tra ban doc CU -> KHONG day, de nguoi van hanh nhap tay. Ghi nham so cu thanh so chot hom nay se sai ca san luong lan tien, va rat kho phat hien.
- CHOT AN TOAN 2 - chong lap nham tai khoan: doi chieu `results[0].mA_DIEMDO` voi `customerPoint` trong cau hinh; lech thi dung, tranh ghi so nha may nay sang nha may khac.
- CHOT AN TOAN 3 - khong ghi de: endpoint BO QUA neu da co `PowerRecord (recordDate, meterId)` -> tra `exists-skipped`. NHAP TAY LUON THANG, va chay lai script bao nhieu lan cung khong nhan doi du lieu.
- Endpoint dung chung `buildPowerRecordValues` voi flow nhap tay -> baseline / phat hien reset / nhan TU x TI / tinh 3 gia deu la MOT NGUON SU THAT, khong nhan ban logic.
- Ghi `dataSource: "AUTO"`, `createdBy: "evn-collector"`.
- Lich chay collector EVN co the lap lai nhieu nhip trong buoi sang, vi endpoint idempotent theo `(recordDate, meterId)`. Khuyen nghi PM2 cron `15,30,45 6 * * *`: van query DU LIEU moc 06:00, chi lui thoi diem truy cap portal sang 06:15/06:30/06:45 de tranh EVN chua cap nhat kip.

### Open Decisions / Luu y

- `ElectricityPrice.type` dang `@unique` -> KHONG CO LICH SU GIA. `getUnitPrice()` luon `findUnique({ where: { type } })` = lay gia HIEN TAI bat ke `recordDate`. Rui ro: sau khi EVN tang gia va cap nhat bang gia, neu nhap BO SUNG/SUA mot ban ghi cua thang truoc thi no an gia MOI -> sai. Can them bang lich su gia (hoac bo `@unique`, tra gia theo `effectiveFrom <= recordDate`). CHUA LAM. (Co che phan bo nguoc MIEN NHIEM voi loi nay vi lay tu `costTotal` da luu cung cua MV.)
- Bug nhe trong `splitTelemetryByTariff`: khoang telemetry vat qua nua dem (23:30 -> 00:30) bi gan `dayType` va khung gio theo NGAY CU (`endMinute` co the vuot 1440 nhung range chi toi 1440). HIEN CHUA GAY SAI SO vi khung 22:00-04:00 hai ben nua dem deu la Thap diem. Nhung neu sau nay MV len AUTO thi bug nay se anh huong TRUC TIEP toi hoa don -> phai sua.
- BACKFILL DU LIEU MV CU: cac `PowerRecord` trung the tao TRUOC khi dat TU/TI da luu cung `cons*` va `costTotal` voi he so 1 -> SAI, khong tu sua. Sau khi dat TU/TI phai chay UPDATE nhan `cons*` va `costTotal` len `tu * ti`, BAT BUOC gioi han `recordDate < ngay dat he so` (neu khong, ban ghi tao SAU do von da dung se bi nhan he so LAN THU HAI), backup DB truoc, chay DUNG MOT LAN.
- Mini PC (`/home/ubuntu/energy-collector`) nay chay HAI collector: `energy-collector` (daemon, Modbus/ha the, 60s) va `evn-collector` (one-shot, portal EVN/trung the, PM2 cron `15,30,45 6 * * *`). PM2 phai dung `--no-autorestart` cho `evn-collector` (script `process.exit()` khi xong; thieu co nay PM2 tuong crash va restart lien tuc -> doi request vao portal EVN, de bi chan IP).

### Feature Ledger Update

| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-14 | Bao cao dien viet lai theo 2 lop: chi phi CHI lay tu cong to EVN (trung the), chi phi dong ho ha the PHAN BO NGUOC theo ty trong kWh (tong luon khop hoa don); them metric ton that (`consMV - SUM consLV`) + canh bao do khi am; fix bug loc nha may lam mat sach cong to trung the (`transformer.factoryId` -> OR 3 duong); bo fallback consNormal ?? consTotal lam thoi phong ty trong khung Binh thuong. | `src/app/api/electric/reports/route.ts`, `src/components/electric/ElectricClients.tsx`, `BUSINESS_LOGIC_CONTEXT.md` | `npm run build`, smoke: `/electric/reports` tong chi phi = hoa don EVN (khong con gap doi), loc theo nha may van thay cong to trung the, bang ha the tong "Chi phi phan bo" = tong "Chi phi EVN" |
| 2026-07-14 | FIX cong to trung the khong nhap duoc TU/TI: form an khoi TU/TI khi type=2 nen `tu=ti=1` mai mai -> san luong thieu he so nhan. Bo dieu kien an, them o "He so nhan (TU x TI)" tu tinh, them cot he so + tag do "Chua dat (x1)" vao bang danh muc DH Trung the. Cong thuc trong energy-record.ts va schema KHONG sai, khong them truong moi. | `src/components/electric/ElectricClients.tsx`, `BUSINESS_LOGIC_CONTEXT.md` | `npm run build`, smoke: sua DH trung the -> nhap duoc TU/TI, he so nhan hien dung; bang danh muc hien tag do voi DH chua dat; ban ghi moi co `cons = delta * tu * ti` |
| 2026-07-14 | Tu dong lay chi so trung the tu portal CSKH EVNCPC: them endpoint `/api/collector/mv-ingest` (x-api-key, dung chung buildPowerRecordValues, BO QUA ngay da co ban ghi -> nhap tay luon thang) + collector `evn-portal-collector.js` (da tai khoan, token cache ~1 nam, POST + body `{}` vi GET tra 405 / body rong tra 411, kiem tra ngaygio phai dung 06:00 hom nay, doi chieu mA_DIEMDO chong lap nham tai khoan, buffer khi mat mang). Lich PM2 nen chay nhieu nhip 06:15/06:30/06:45 de doi portal EVN cap nhat ban doc 06:00; endpoint idempotent nen chay lai khong nhan doi. | `src/app/api/collector/mv-ingest/route.ts`, `scripts/evn-portal-collector.js`, `scripts/evn-accounts.example.json`, `.gitignore`, `BUSINESS_LOGIC_CONTEXT.md` | `node --check scripts/evn-portal-collector.js`, `npm run build`, smoke VPS: `curl -X POST /api/collector/mv-ingest` voi meterCode gia -> `meter-not-found` (401 neu thieu key); smoke mini PC: `node evn-portal-collector.js` -> 3 cong to tra BT/CD/TD, status `created` / `exists-skipped` / `created-baseline`; PM2: `pm2 start evn-portal-collector.js --name evn-collector --cron-restart "15,30,45 6 * * *" --no-autorestart` |
| 2026-07-14 | Tach moc chot nghiep vu khoi thoi diem cron thuc thi: giu cua so dien ket thuc luc 06:00 (`CLOSING_HOUR`) nhung doi cron tao `PowerRecord` sang 06:15 (`CLOSING_RUN_MINUTE`) de collector co 15 phut ghi du telemetry 06:00 cua cac dong ho; khong doi cong thuc, `recordDate`, schema hay API. | `scripts/energy-cron.js`, `ecosystem.config.cjs`, `HUONG-DAN-DEPLOY-PHUBAI-MES.md`, `PROJECT_SKILLS/phubai-mes-electric/SKILL.md`, `BUSINESS_LOGIC_CONTEXT.md` | `node --check scripts/energy-cron.js`, `node -e "require('./ecosystem.config.cjs')"`, restart/reload `phubai-mes-energy-cron` tren VPS va kiem tra log hien moc 06:00 / thuc thi 06:15 |


## 2026-07-18 - Module hệ số phát thải CO2 và dấu chân carbon điện năng

### Current State Update
- Thêm trang `/electric/carbon` trong sidebar điện năng với tên `Hệ số phát thải CO2` để xem phát thải từ điện năng và quản lý hệ số quy đổi theo năm.
- Thêm model `EmissionFactor` lưu `year`, `factorKgCo2ePerKwh`, nguồn hệ số, ngày hiệu lực, ghi chú và trạng thái đang áp dụng.
- Thêm API `/api/electric/emission-factors` cho danh sách/thêm/sửa hệ số phát thải; thao tác ghi dùng quyền quản lý danh mục điện năng.
- Thêm API `/api/electric/carbon` tổng hợp `PowerRecord.consTotal` theo ngày/tháng, nhà máy, nhóm đồng hồ hạ thế và đồng hồ hạ thế.

### Business Rules Update
- Công thức quy đổi: `emissionKgCO2e = consTotal(kWh) * factorKgCo2ePerKwh`; giao diện hiển thị tCO2e bằng cách chia cho 1000.
- Hệ số phát thải được tra theo năm của `recordDate`; nếu thiếu hệ số cho một năm thì API cảnh báo và tạm tính phát thải năm đó bằng 0 để tránh dùng nhầm hệ số.
- Tổng phát thải Scope 2 của nhà máy dùng lớp đồng hồ trung thế EVN `PowerMeter.type = 2`; đồng hồ hạ thế chỉ dùng cho phân tích nội bộ theo nhóm/đồng hồ.
- Bộ lọc nhà máy phải dò đủ 3 đường liên kết đang dùng trong module điện: `PowerMeter.factoryId`, `PowerMeter.transformer.factoryId`, và `PowerMeter.transformerUnit.transformer.factoryId`.

### Feature Ledger Update
| Ngày | Thay đổi | File chính | Verify |
| --- | --- | --- | --- |
| 2026-07-18 | Thêm quản lý hệ số phát thải CO2 và báo cáo dấu chân carbon từ điện năng | `prisma/schema.prisma`, `src/app/api/electric/emission-factors/route.ts`, `src/app/api/electric/carbon/route.ts`, `src/components/electric/CarbonClient.tsx` | `npx prisma generate`, `npm run build` |

## 2026-07-18 - Dev server uses Turbopack by default

### Current State Update
- `npm run dev` now runs `next dev --turbopack -p 3002` again because Webpack dev made route switching too slow on the local machine.
- `npm run dev:webpack` is kept as an explicit fallback command if Turbopack panic recurs.
- If Turbopack reports `Next.js package not found`, first stop the process holding port 3002, remove `.next`, and restart `npm run dev` before falling back to Webpack.

### Feature Ledger Update
| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-18 | Restore Turbopack as the default dev server for faster local navigation and keep Webpack as a fallback script. | `package.json`, `BUSINESS_LOGIC_CONTEXT.md` | smoke `npm run dev` on port 3002 |

## 2026-07-18 - Sap xep dong ho trung the theo ten

### Current State Update
- Cac danh sach dong ho trung the (type=2) trong nhap chi so trung the, danh muc, bao cao EVN va cos phi duoc sap theo `PowerMeter.name` tang dan, fallback `code`.
- Dong ho ha the van giu thu tu `sortOrder` tang dan roi den `code`, de khong pha co che nguoi dung tu chinh dong tren/duoi trong danh muc.

### Feature Ledger Update
| Ngay | Thay doi | File chinh | Verify |
| --- | --- | --- | --- |
| 2026-07-18 | Doi thu tu hien thi dong ho trung the tu uu tien ma dong ho sang ten dong ho; giu nguyen `sortOrder` cho ha the. | `src/app/api/electric/daily-status/route.ts`, `src/components/electric/ElectricClients.tsx`, `src/app/api/electric/reports/route.ts`, `src/app/api/electric/power-factor/route.ts` | `npx eslint <cac file vua sua>`, `npm run build` |
