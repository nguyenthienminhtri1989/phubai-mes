# Hướng Dẫn Deploy PHUBAI-MES

Quy trình này làm tương tự PHUBAI-ERP: Windows Server + PostgreSQL + Next.js build/start bằng PM2 + Cloudflare Tunnel.

## 1. Kiến trúc

Người dùng -> domain MES -> Cloudflare SSL -> Cloudflare Tunnel -> localhost:3002 -> Next.js/PM2 -> PostgreSQL.

Module điện năng có thêm tiến trình cron riêng:

- `phubai-mes-web`: chạy Next.js production ở port 3002.
- `phubai-mes-energy-cron`: chạy `scripts/energy-cron.js` để thu telemetry và chốt điện năng 08:00.

## 2. Chuẩn bị server

Cài trên máy chủ Windows:

- Node.js LTS.
- Git.
- PostgreSQL.
- Cloudflare Tunnel connector nếu dùng domain qua Cloudflare.
- PM2 và PM2 Windows startup.

```powershell
npm install -g pm2 pm2-windows-startup
```

## 3. Tạo database PostgreSQL

Mở pgAdmin hoặc psql trên server, tạo database:

```sql
CREATE DATABASE phubai_mes_db;
```

Database URL production nên dùng mật khẩu thật của PostgreSQL server:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/phubai_mes_db?schema=public"
```

## 4. Đưa source code lên server

Khuyến nghị dùng GitHub:

```powershell
cd D:\
mkdir PHUBAI-MES
cd D:\PHUBAI-MES
git clone https://github.com/nguyenthienminhtri1989/phubai-mes.git phubai-mes
cd D:\PHUBAI-MES\phubai-mes
npm install
```

Nếu server đã clone rồi thì update:

```powershell
cd D:\PHUBAI-MES\phubai-mes
git pull origin main
npm install
```

## 5. Tạo file .env production

Tạo file `.env` trên server tại `D:\PHUBAI-MES\phubai-mes\.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/phubai_mes_db?schema=public"
NEXTAUTH_URL="https://YOUR_MES_DOMAIN"
NEXTAUTH_SECRET="TAO_CHUOI_SECRET_DAI_TOI_THIEU_32_KY_TU"
AUTH_SECRET="TAO_CHUOI_SECRET_DAI_TOI_THIEU_32_KY_TU"
AUTH_TRUST_HOST=true

SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
FEEDBACK_TO="minhtri154@gmail.com"
```

Nếu chưa có domain riêng, tạm thời có thể để:

```env
NEXTAUTH_URL="http://localhost:3002"
```

## 6. Khởi tạo database schema

Chạy migration production:

```powershell
cd D:\PHUBAI-MES\phubai-mes
npx prisma generate
npx prisma migrate deploy
```

Không dùng `prisma migrate dev` trên server production.

## 7. Build production

```powershell
npm run build
```

Nếu build lỗi, không start PM2. Sửa lỗi trước rồi build lại.

## 8. Chạy bằng PM2

Repo có sẵn `ecosystem.config.cjs`. File này mặc định dùng đường dẫn server:

```txt
D:/PHUBAI-MES/phubai-mes
```

Nếu anh đặt source ở đường dẫn khác, sửa field `cwd` trong `ecosystem.config.cjs` trước khi start.

```powershell
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs phubai-mes-web
pm2 logs phubai-mes-energy-cron
```

Lưu cấu hình tự khởi động:

```powershell
pm2-startup install
pm2 save
```

## 9. Cloudflare Tunnel

Trong Cloudflare Zero Trust:

1. Vào Tunnels.
2. Chọn tunnel đang chạy trên server hoặc tạo tunnel mới.
3. Add public hostname cho domain MES.
4. Service trỏ về `http://localhost:3002`.

Ví dụ domain có thể là `mes.phubaierp.site`.

Khi có domain thật, cập nhật lại `.env`:

```env
NEXTAUTH_URL="https://mes.phubaierp.site"
```

Sau đó restart PM2:

```powershell
pm2 restart phubai-mes-web
pm2 restart phubai-mes-energy-cron
pm2 save
```

## 10. Kiểm tra sau deploy

Trên server:

```powershell
curl http://localhost:3002/electric/overview
curl http://localhost:3002/api/electric/factories
pm2 status
```

Trên trình duyệt:

- Mở domain MES.
- Vào `/electric/catalog`.
- Thử danh mục Nhà máy, Trạm biến áp, Đồng hồ.
- Vào `/electric/reports` để kiểm tra báo cáo.

## 11. Quy trình update phiên bản sau này

Trên máy dev:

```powershell
git status
git add .
git commit -m "noi dung thay doi"
git push origin main
```

Trên server:

```powershell
cd D:\PHUBAI-MES\phubai-mes
git pull origin main
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart ecosystem.config.cjs
pm2 save
```

## 12. Lưu ý riêng module điện năng

- Tiến trình `phubai-mes-energy-cron` phải chạy cùng web để thu telemetry/chốt số.
- Nếu server không kết nối được Gateway USR-N520 trong mạng nhà máy, realtime và cron AUTO sẽ lỗi đọc đồng hồ.
- Cron chốt dữ liệu ngày lúc 08:00 giờ Việt Nam.
- Nếu đổi port 3002, phải đổi cả `package.json`, `ecosystem.config.cjs`, và Cloudflare Tunnel service.
