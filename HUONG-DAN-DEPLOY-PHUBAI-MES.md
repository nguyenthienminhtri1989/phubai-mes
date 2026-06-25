# Hướng Dẫn Deploy PHUBAI-MES

Quy trình chính của PHUBAI-MES làm giống PHUBAI-ERP/PHUBAI-HRM: mỗi lần push code lên nhánh `main`, GitHub Actions chạy trên Windows self-hosted runner ở máy chủ, tự cài dependencies, migrate database, build Next.js và restart PM2.

## 1. Kiến trúc

Người dùng -> domain MES -> Cloudflare SSL -> Cloudflare Tunnel -> localhost:3002 -> Next.js/PM2 -> PostgreSQL.

Trên máy chủ có 2 tiến trình PM2:

- `phubai-mes-web`: chạy Next.js production ở port `3002`.
- `phubai-mes-energy-cron`: chạy `scripts/energy-cron.js` để thu telemetry và chốt điện năng lúc 08:00.

Workflow dùng `npx pm2` từ dependency của repo để không phụ thuộc PATH của PM2 global trong Windows service account.

Workflow deploy chính:

Dev push GitHub -> GitHub Actions self-hosted runner trên server -> Prisma migrate deploy -> Next build -> PM2 restart.

## 2. Chuẩn bị server lần đầu

Cài trên máy chủ Windows:

- Node.js LTS, khuyến nghị Node 22.
- Git.
- PostgreSQL.
- PM2 và PM2 Windows startup.
- GitHub Actions self-hosted runner.
- Cloudflare Tunnel connector nếu dùng domain qua Cloudflare.

Cài PM2:

```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
```

## 3. Tạo database PostgreSQL

Mở pgAdmin hoặc psql trên server, tạo database:

```sql
CREATE DATABASE phubai_mes_db;
```

Database URL production dùng mật khẩu thật của PostgreSQL server:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/phubai_mes_db?schema=public"
```

## 4. Cài GitHub Actions self-hosted runner

Trong GitHub repo `nguyenthienminhtri1989/phubai-mes`:

1. Vào `Settings -> Actions -> Runners`.
2. Chọn `New self-hosted runner`.
3. Chọn Windows.
4. Làm theo lệnh GitHub đưa ra trên máy chủ.
5. Khi cấu hình runner, thêm label:

```txt
phubai-mes
```

Workflow hiện tại yêu cầu runner labels:

```yaml
[self-hosted, windows, phubai-mes]
```

Nếu runner chưa có label `phubai-mes`, workflow sẽ đứng chờ runner phù hợp.

Nên cài runner chạy dạng service để máy chủ khởi động lại vẫn tự nhận job:

```powershell
.\svc.cmd install
.\svc.cmd start
```

## 5. Tạo GitHub Secrets

Vào repo GitHub:

```txt
Settings -> Secrets and variables -> Actions -> New repository secret
```

Tạo các secret tối thiểu:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST`

Giá trị gợi ý:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/phubai_mes_db?schema=public
NEXTAUTH_URL=https://YOUR_MES_DOMAIN
NEXTAUTH_SECRET=TAO_CHUOI_SECRET_DAI_TOI_THIEU_32_KY_TU
AUTH_SECRET=TAO_CHUOI_SECRET_DAI_TOI_THIEU_32_KY_TU
AUTH_TRUST_HOST=true
```

Các secret SMTP nếu cần gửi email:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `FEEDBACK_TO`

Nếu chưa có domain riêng, tạm thời có thể dùng:

```env
NEXTAUTH_URL=http://localhost:3002
```

Khi có domain thật, đổi lại thành HTTPS domain.

## 6. Workflow deploy tự động

Repo có workflow:

```txt
.github/workflows/deploy.yml
```

Workflow chạy khi:

- Push code lên nhánh `main`.
- Bấm chạy thủ công bằng `workflow_dispatch` trong tab Actions.

Các bước workflow:

1. Checkout source.
2. Setup Node.js 22.
3. Tạo file `.env` từ GitHub Secrets.
4. Chạy `npm ci`.
5. Chạy `npx prisma generate`.
6. Chạy `npx prisma migrate deploy`.
7. Chạy `npm run build`.
8. Chạy `npx pm2 startOrRestart ecosystem.config.cjs --update-env`.
9. Chạy `npx pm2 save`.

## 7. PM2 ecosystem

Repo có file:

```txt
ecosystem.config.cjs
```

File này dùng `__dirname` làm `cwd`, nên có thể chạy trong thư mục checkout của GitHub Actions, không cần hard-code `D:/PHUBAI-MES/phubai-mes`.

Nếu cần kiểm tra thủ công trên server:

```powershell
npx pm2 startOrRestart ecosystem.config.cjs --update-env
npx pm2 status
npx pm2 logs phubai-mes-web
npx pm2 logs phubai-mes-energy-cron
npx pm2 save
```

## 8. Cloudflare Tunnel

Trong Cloudflare Zero Trust:

1. Vào Tunnels.
2. Chọn tunnel đang chạy trên server hoặc tạo tunnel mới.
3. Add public hostname cho domain MES.
4. Service trỏ về:

```txt
http://localhost:3002
```

Ví dụ domain có thể là:

```txt
mes.phubaierp.site
```

Khi có domain thật, cập nhật GitHub Secret:

```env
NEXTAUTH_URL=https://mes.phubaierp.site
```

Sau đó vào GitHub Actions chạy lại workflow deploy.

## 9. Quy trình update tính năng sau này

Trên máy dev:

```powershell
cd D:\DU-AN-PHAN-MEM\PHUBAI-MES\phubai-mes
git status
git add .
git commit -m "noi dung thay doi"
git push origin main
```

Sau khi push, GitHub Actions tự deploy. Không cần đăng nhập server để pull/build thủ công, trừ khi workflow lỗi.

## 10. Kiểm tra sau deploy

Trên GitHub:

- Vào tab `Actions`.
- Mở workflow `Deploy PHUBAI-MES`.
- Kiểm tra tất cả steps màu xanh.

Trên server nếu cần:

```powershell
npx pm2 status
curl http://localhost:3002/electric/overview
curl http://localhost:3002/api/electric/factories
```

Trên trình duyệt:

- Mở domain MES.
- Vào `/electric/catalog`.
- Thử danh mục Nhà máy, Trạm biến áp, Đồng hồ.
- Vào `/electric/reports` để kiểm tra báo cáo.

## 11. Lưu ý riêng module điện năng

- Tiến trình `phubai-mes-energy-cron` phải chạy cùng web để thu telemetry/chốt số.
- Nếu server không kết nối được Gateway USR-N520 trong mạng nhà máy, realtime và cron AUTO sẽ lỗi đọc đồng hồ.
- Cron chốt dữ liệu ngày lúc 08:00 giờ Việt Nam.
- Nếu đổi port `3002`, phải đổi cả `package.json`, `ecosystem.config.cjs`, Cloudflare Tunnel service và tài liệu deploy.
