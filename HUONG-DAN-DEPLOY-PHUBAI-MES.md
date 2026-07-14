# Hướng Dẫn Deploy PHUBAI-MES

PHUBAI-MES chạy trên **VPS Ubuntu (AZDIGI)** và deploy **thủ công qua Git**: sửa code ở máy dev → push lên `main` → SSH vào VPS `git pull` + build + reload PM2 theo `ecosystem.config.cjs`. Không dùng GitHub Actions (workflow cũ đã xóa).

## 1. Kiến trúc

### Web app + Database (trên VPS)

```
Người dùng -> phubaimes.site -> Cloudflare (SSL Full Strict) -> Nginx -> localhost:3002 -> Next.js (PM2) -> PostgreSQL (localhost:5432)
```

- VPS Ubuntu, IP `221.132.16.177`, user SSH `deploy`, thư mục app `/home/deploy/apps/phubai-mes`.
- Node.js qua nvm + PM2.
- PostgreSQL 17: DB `phubai_mes_db`, user riêng `phubai_mes_user`. Web app kết nối `localhost:5432`.
- Hai process PM2 trên VPS (xem `ecosystem.config.cjs`):
  - `phubai-mes`: web Next.js production, port `3002`.
  - `phubai-mes-energy-cron`: chốt mốc dữ liệu 06:00, thực thi lúc 06:15 giờ VN + dọn telemetry cũ > 6 tháng.

### Thu thập điện năng theo cơ chế PUSH (từ 2026-07-08)

Đã bỏ SSH tunnel + agent. Kiến trúc mới:

```
[Máy văn phòng / mini PC tại nhà máy]                 [VPS: phubaimes.site]
energy-push-collector.js  ── HTTPS (443, x-api-key) ─►  /api/collector/meters  (danh sách đồng hồ AUTO)
(1 tiến trình duy nhất)                                  /api/collector/ingest  (nhận readings)
     │ Modbus TCP (LAN/internet)                                │
     ▼                                                          ▼
gateway Modbus (Selec EM368)                          PostgreSQL: PowerLiveReading (realtime) + PowerTelemetry (theo giờ)
                                                                │
                                                                ▼
                                                       phubai-mes-energy-cron (PM2): chốt mốc 06:00 lúc 06:15 (chỉ đọc DB local)
```

- **Collector** (`scripts/energy-push-collector.js`) chạy ở **máy văn phòng / mini PC**, KHÔNG chạy trên VPS. Nó đọc Modbus rồi đẩy dữ liệu về VPS qua HTTPS, có buffer `energy-buffer.jsonl` khi mất mạng.
- **VPS** giữ web app + DB + cron chốt số. Trang realtime `/electric/live` chỉ đọc `PowerLiveReading` (không chạm Modbus qua mạng).
- Xác thực collector ↔ VPS bằng header `x-api-key` khớp biến môi trường `ENERGY_API_KEY` ở cả hai phía.

## 2. Chuẩn bị VPS lần đầu

```bash
# Node qua nvm + PM2
nvm install 24
npm install -g pm2

# PostgreSQL 17: tạo DB + user riêng (chạy dưới quyền postgres)
sudo -u postgres psql <<'SQL'
CREATE DATABASE phubai_mes_db;
CREATE USER phubai_mes_user WITH PASSWORD 'MAT_KHAU_MANH';
GRANT ALL PRIVILEGES ON DATABASE phubai_mes_db TO phubai_mes_user;
SQL

# Lấy code lần đầu
mkdir -p /home/deploy/apps
cd /home/deploy/apps
git clone <repo-url> phubai-mes
```

Nginx reverse proxy `phubaimes.site` -> `http://localhost:3002`, Cloudflare Proxy bật SSL Full (Strict).

## 3. File .env trên VPS

Đặt tại `/home/deploy/apps/phubai-mes/.env`:

```env
DATABASE_URL="postgresql://phubai_mes_user:MAT_KHAU_MANH@localhost:5432/phubai_mes_db?schema=public"
NEXTAUTH_URL="https://phubaimes.site"
NEXTAUTH_SECRET="CHUOI_SECRET_>=32_KY_TU"
AUTH_SECRET="CHUOI_SECRET_>=32_KY_TU"
AUTH_TRUST_HOST=true

# Collector PUSH: PHẢI khớp với .env trên máy chạy collector
ENERGY_API_KEY="<openssl rand -hex 32>"

# SMTP (nếu cần gửi email phản hồi)
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
FEEDBACK_TO=""
```

Sinh API key: `openssl rand -hex 32`.

## 4. Quy trình deploy (mỗi lần cập nhật tính năng)

Trên máy dev:

```bash
git add .
git commit -m "noi dung thay doi"
git push origin main
```

Trên VPS:

```bash
cd /home/deploy/apps/phubai-mes
git pull
npm ci                      # chỉ khi package.json / package-lock.json đổi
npx prisma migrate deploy   # áp migration mới (KHÔNG dùng prisma migrate dev trên production)
npx prisma generate
npm run build
pm2 reload ecosystem.config.cjs --only phubai-mes --update-env
# nếu có thay đổi liên quan cron:
pm2 reload ecosystem.config.cjs --only phubai-mes-energy-cron --update-env
pm2 save
```

Luôn reload/start qua `ecosystem.config.cjs` để PM2 dùng đúng `script` và `args` đang khai báo trong repo.
Không dùng lệnh kiểu dưới đây cho web app:

```bash
pm2 start npm --name phubai-mes -- start -p 3002
```

`package.json` đã có `npm start = next start -p 3002`; nếu PM2 gọi thêm `start -p 3002`, Next có thể nhận dư tham số thành `next start -p 3002 3002` và hiểu `3002` là thư mục project.

Lần đầu chạy PM2 (thay cho restart):

```bash
cd /home/deploy/apps/phubai-mes
pm2 start ecosystem.config.cjs --only phubai-mes
pm2 start ecosystem.config.cjs --only phubai-mes-energy-cron
pm2 save
pm2 startup   # làm theo lệnh in ra để PM2 tự chạy lại khi VPS reboot
```

## 5. Cấu hình collector (máy văn phòng / mini PC — KHÔNG phải VPS)

`.env` cùng thư mục chạy collector:

```env
API_BASE_URL=https://phubaimes.site
ENERGY_API_KEY=<khớp với VPS>
READ_INTERVAL_SECONDS=60
```

Chạy:

```bash
npm install modbus-serial dotenv
# gỡ 3 tiến trình kiến trúc cũ nếu còn:
pm2 delete energy-cron energy-agent pg-tunnel
pm2 start scripts/energy-push-collector.js --name energy-collector
pm2 save
```

Collector EVN trung thế chạy one-shot theo cron, dùng cùng `API_BASE_URL` và `ENERGY_API_KEY`, thêm file `evn-accounts.json` theo mẫu `scripts/evn-accounts.example.json`. Khuyến nghị chạy nhiều nhịp sau 06:00 để chờ portal EVN cập nhật bản đọc 06:00; endpoint MES bỏ qua ngày đã có bản ghi nên chạy lại không nhân đôi:

```bash
pm2 start scripts/evn-portal-collector.js --name evn-collector --cron-restart "15,30,45 6 * * *" --no-autorestart
pm2 save
```

Lưu ý: `evn-collector` phải có `--no-autorestart` vì script tự thoát sau khi chạy xong; nếu thiếu, PM2 sẽ restart liên tục và có thể dội request vào portal EVN.

Sau này chuyển sang mini PC tại nhà máy 3: copy `energy-push-collector.js` + `.env` (giữ nguyên `API_BASE_URL`, `ENERGY_API_KEY`), chạy PM2 như trên, rồi đóng hẳn port 502 trên router.

## 6. Kiểm tra sau deploy

Trên VPS:

```bash
pm2 status
pm2 logs phubai-mes
pm2 logs phubai-mes-energy-cron
curl http://localhost:3002/api/electric/factories
```

Kiểm tra kênh collector (thay KEY bằng `ENERGY_API_KEY`):

```bash
curl -H "x-api-key: KEY" https://phubaimes.site/api/collector/meters   # phải trả {"meters":[...]}
```

Chốt số thủ công để kiểm chứng (không cần chờ 06:00):

```bash
cd /home/deploy/apps/phubai-mes
node scripts/energy-cron.js --status
node scripts/energy-cron.js --close-once
```

Trên trình duyệt: mở `https://phubaimes.site/electric/catalog`, `/electric/live`, `/electric/reports`.

## 7. Lưu ý riêng module điện năng

- Từ cơ chế PUSH: **collector** (máy nhà máy) lo phần đọc Modbus + telemetry theo giờ; **cron VPS** chỉ còn chốt số + dọn telemetry. Không cần Gateway kết nối được từ VPS.
- Trang realtime `/electric/live` đọc `PowerLiveReading` (bản đọc mới nhất do collector đẩy lên), độ trễ tối đa bằng `READ_INTERVAL_SECONDS`.
- Mốc chốt nghiệp vụ vẫn là 06:00 giờ Việt Nam (`CLOSING_HOUR`), nhưng cron thực thi lúc 06:15 (`CLOSING_RUN_MINUTE`) để collector ghi đủ telemetry 06:00 của mọi đồng hồ.
- `ENERGY_API_KEY` phải giống nhau ở VPS và máy chạy collector, nếu lệch collector sẽ nhận 401.
- Nếu đổi port `3002`: sửa `ecosystem.config.cjs`, Nginx và tài liệu này.
