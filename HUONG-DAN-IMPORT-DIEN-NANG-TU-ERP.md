# Hướng Dẫn Chuyển Dữ Liệu Điện Năng Từ PHUBAI-ERP Sang PHUBAI-MES

Mục tiêu: chuyển dữ liệu module điện năng từ database ERP cũ sang database MES mới, không ghi ngược vào ERP.

Script chính:

```txt
scripts/import-energy-from-erp.js
```

NPM script:

```powershell
npm run energy:import-erp
```

## 1. Bảng nguồn ERP

Script đọc các bảng ERP:

- `factories`
- `substations`
- `meter_group_categories`
- `electricity_prices`
- `power_meters`
- `power_telemetries`
- `power_records`

## 2. Bảng đích MES

Script ghi vào các bảng MES:

- `Factory`
- `PowerTransformer`
- `PowerMeterGroup`
- `ElectricityPrice`
- `PowerMeter`
- `PowerTelemetry`
- `PowerRecord`

## 3. Mapping chính

- ERP `factories` -> MES `Factory`.
- ERP `substations` -> MES `PowerTransformer`.
- ERP `meter_group_categories` -> MES `PowerMeterGroup`.
- ERP `electricity_prices` -> MES `ElectricityPrice`.
- ERP `power_meters` -> MES `PowerMeter`.
- ERP `power_telemetries` -> MES `PowerTelemetry`.
- ERP `power_records` -> MES `PowerRecord`.

ID ERP kiểu số được chuyển sang ID MES kiểu chuỗi có tiền tố `erp-*`, ví dụ:

- `erp-factory-1`
- `erp-substation-1`
- `erp-meter-group-1`
- `erp-meter-1`
- `erp-telemetry-1`

Cách này giúp script chạy lại được nhiều lần và giữ đúng quan hệ giữa record/telemetry với đồng hồ.

## 4. Chạy kiểm tra trước khi import

Chạy dry-run trước, script chỉ đọc và đếm dữ liệu, chưa ghi MES:

```powershell
$env:ERP_DATABASE_URL='postgresql://postgres:123456@localhost:5432/phubai_erp_db?schema=public'
$env:DATABASE_URL='postgresql://postgres:123456@localhost:5432/phubai_mes_db?schema=public'
npm run energy:import-erp -- --dry-run
```

Trên server, thay connection string theo database thật của server.

## 5. Backup trước khi import thật

Trước khi ghi vào MES production, backup database MES:

```powershell
pg_dump -h localhost -p 5432 -U postgres -d phubai_mes_db -F c -f D:\backup\phubai_mes_db_before_energy_import.backup
```

Nếu cần backup ERP để đối chiếu:

```powershell
pg_dump -h localhost -p 5432 -U postgres -d phubai_erp_db -F c -f D:\backup\phubai_erp_db_energy_source.backup
```

## 6. Import thật

Sau khi dry-run đúng số dòng, chạy:

```powershell
$env:ERP_DATABASE_URL='postgresql://postgres:123456@localhost:5432/phubai_erp_db?schema=public'
$env:DATABASE_URL='postgresql://postgres:123456@localhost:5432/phubai_mes_db?schema=public'
npm run energy:import-erp -- --yes
```

Script dùng transaction. Nếu có lỗi giữa chừng, MES rollback lần import đó.

## 7. Kiểm tra sau import

Kiểm tra trong app MES:

- `/electric/catalog`: Nhà máy, Trạm biến áp, Nhóm đồng hồ, Đồng hồ.
- `/electric/reports`: báo cáo theo ngày/tháng và theo nhà máy.
- `/electric/daily-input`: dữ liệu chốt ngày.

Kiểm tra nhanh bằng SQL:

```sql
select count(*) from "Factory";
select count(*) from "PowerTransformer";
select count(*) from "PowerMeterGroup";
select count(*) from "PowerMeter";
select count(*) from "PowerTelemetry";
select count(*) from "PowerRecord";
```

## 8. Lưu ý

- Không chạy import thật nếu chưa backup MES production.
- Nếu ERP và MES nằm trên 2 máy khác nhau, máy chạy script phải kết nối được tới cả 2 PostgreSQL database.
- Nếu ERP đã có dữ liệu điện năng thật trên server, nên chạy script trực tiếp trên server hoặc máy có network tới server database.
- MES có thêm cấp `Factory -> PowerTransformer -> PowerMeter`; ERP `substations` được xem là `PowerTransformer`.
- ERP local hiện có thể ít dữ liệu hơn ERP server; luôn tin dry-run trên đúng database nguồn cần chuyển.
