Chúng ta đang xây dựng app PHUBAI-MES mới, độc lập với PHUBAI-ERP.

Workspace:
D:\DU-AN-PHAN-MEM\PHUBAI-MES\phubai-mes

Mục tiêu:
Xây dựng app MES hoàn toàn mới từ đầu. Module đầu tiên là module điện năng, copy logic giống PHUBAI-ERP để không phải thiết kế lại nghiệp vụ.

Stack:
Next.js App Router, TypeScript, PostgreSQL, Prisma ORM, Ant Design, NextAuth.js v5.

Port:
http://localhost:3002

Database:
DATABASE_URL="postgresql://postgres:123456@localhost:5432/phubai_mes_db?schema=public"

Module điện năng cần dựng giống ERP:

- Danh mục đồng hồ điện
- Danh mục trạm biến áp
- Danh mục nhóm đồng hồ
- Giá điện
- Nhập chỉ số điện thủ công MANUAL
- Lấy dữ liệu tự động AUTO từ đồng hồ Selec EM368 qua Gateway USR-N520
- Lưu dữ liệu thô vào PowerTelemetry
- Chốt dữ liệu ngày vào PowerRecord lúc 08:00 giờ Việt Nam
- Trang realtime đọc trực tiếp đồng hồ qua Modbus
- Báo cáo dữ liệu điện năng
- Copy scripts/energy-cron.js từ PHUBAI-ERP sang PHUBAI-MES

Yêu cầu:
Hãy đọc project hiện tại, kiểm tra package.json, .env, prisma/schema.prisma, scripts/energy-cron.js nếu có, rồi hướng dẫn/triển khai tiếp module điện năng cho PHUBAI-MES.

--- project-memory ---

Project memory source of truth:
- Read `BUSINESS_LOGIC_CONTEXT.md` before making feature changes.
- If the task touches the electric module, also read `PLANS/yeucau.md` and `PROJECT_SKILLS/phubai-mes-electric/SKILL.md`.
- After each feature, schema change, route/API change, cron/job change, or business-rule change, update `BUSINESS_LOGIC_CONTEXT.md` in the same turn.
- Keep `/electric` and `/api/electric/*` as the main MES electric namespace. Treat `/energy` and `/api/energy/*` as initial/compatibility implementation unless the user explicitly asks otherwise.
- Project skills:
  - `.codex/skills/phubai-mes-project-context/SKILL.md`
  - `PROJECT_SKILLS/phubai-mes-electric/SKILL.md`
