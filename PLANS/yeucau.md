# SPEC — Refactor MES Electric Module giống PHUBAI-ERP

## Bối cảnh

Project hiện tại là `PHUBAI-MES`, app MES mới độc lập với PHUBAI-ERP.

Codex trước đó đã xây dựng module điện năng nhưng đang gộp quá nhiều chức năng vào một trang duy nhất. Cần refactor lại theo đúng cấu trúc của PHUBAI-ERP: có sidebar, có các trang/tabs riêng cho danh mục, nhập liệu, realtime, báo cáo.

Module điện năng trong ERP hiện nằm rải ở các thư mục:

- `src/app/categories/meters/page.tsx`
- `src/app/categories/meter-group/page.tsx`
- `src/app/categories/energy-type/page.tsx`
- `src/app/dashboard/energy/daily-input/page.tsx`
- `src/app/dashboard/energy/live/page.tsx`
- `src/app/dashboard/energy/reports/page.tsx`
- `src/app/dashboard/energy/prices/page.tsx`
- `src/app/api/energy/*`
- `src/app/api/meter-group-categories/*`
- `src/app/api/energy-type-categories/*`
- `scripts/energy-cron.js`

Trong MES không dùng tên `categories` cho module này. Hãy đổi namespace giao diện sang `electric`.

## Mục tiêu

Refactor module điện năng trong PHUBAI-MES thành module độc lập tên `electric`, sao chép logic/giao diện/API từ PHUBAI-ERP càng sát càng tốt.

Không thiết kế lại nghiệp vụ. Không gộp tất cả vào một trang.

## Route UI mong muốn trong MES

Tạo nhóm sidebar: `ĐIỆN NĂNG`

Các trang:

| Route MES               | Mục đích                                   | Nguồn tham chiếu ERP                            |
| ----------------------- | ------------------------------------------ | ----------------------------------------------- |
| `/electric/overview`    | Dashboard tổng quan điện năng              | có thể lấy từ reports/live                      |
| `/electric/daily-input` | Nhập/chốt chỉ số điện thủ công và xem AUTO | `src/app/dashboard/energy/daily-input/page.tsx` |
| `/electric/live`        | Theo dõi realtime / test đọc đồng hồ       | `src/app/dashboard/energy/live/page.tsx`        |
| `/electric/reports`     | Báo cáo điện năng                          | `src/app/dashboard/energy/reports/page.tsx`     |
| `/electric/prices`      | Đơn giá điện                               | `src/app/dashboard/energy/prices/page.tsx`      |
| `/electric/catalog`     | Trang danh mục dạng Tabs                   | gom danh mục bên dưới                           |

## Trang `/electric/catalog`

Trang này là trang quản trị danh mục điện năng, dùng Ant Design Tabs.

Tabs cần có:

1. `Nhà máy`
   - Quản lý danh mục Factory.
   - Có thể copy logic từ ERP `src/app/factories/page.tsx` nếu MES chưa có trang factory riêng.

2. `Trạm biến áp`
   - Copy từ phần tab/trang trạm trong ERP `src/app/categories/meters/page.tsx`.

3. `Đồng hồ điện`
   - Copy từ ERP `src/app/categories/meters/page.tsx`.
   - Giữ nguyên các field:
     - code
     - name
     - description
     - type: 1 hạ thế, 2 trung thế
     - tu
     - ti
     - isActive
     - isAuto
     - modbusId
     - gatewayIp
     - gatewayPort
     - factoryId
     - substationId
     - meterGroupId

4. `Nhóm đồng hồ`
   - Copy từ ERP `src/app/categories/meter-group/page.tsx`.

5. `Loại điện năng`
   - Copy từ ERP `src/app/categories/energy-type/page.tsx` nếu model này đã có trong MES.

Yêu cầu UX:

- Không để tất cả form cùng hiện một lúc.
- Mỗi tab có bảng riêng, nút thêm mới riêng, modal/form riêng.
- Filter đồng hồ theo Nhà máy và Trạm biến áp giống ERP.
- Khi bật `isAuto`, mới hiện các field Gateway:
  - `gatewayIp`
  - `gatewayPort`
  - `modbusId`
- Đồng hồ AUTO hiển thị tag xanh, MANUAL hiển thị tag vàng/xám.

## Sidebar

MES phải có layout/sidebar tương tự ERP.

Nhóm sidebar `ĐIỆN NĂNG` gồm:

- Tổng quan: `/electric/overview`
- Nhập chỉ số điện: `/electric/daily-input`
- Realtime: `/electric/live`
- Báo cáo điện năng: `/electric/reports`
- Đơn giá điện: `/electric/prices`
- Danh mục điện năng: `/electric/catalog`

Nếu project đã có sidebar/layout, thêm các route này vào đó. Nếu chưa có, tạo layout cơ bản với Ant Design `Layout`, `Sider`, `Menu`.

## API namespace trong MES

Không dùng lẫn lộn `/api/categories`.

Đưa API điện năng về namespace thống nhất:

| API MES                      | Nguồn ERP                                                     |
| ---------------------------- | ------------------------------------------------------------- |
| `/api/electric/factories`    | `/api/factories`                                              |
| `/api/electric/substations`  | `/api/energy/substations`                                     |
| `/api/electric/meters`       | `/api/energy/meters`                                          |
| `/api/electric/meter-groups` | `/api/meter-group-categories` hoặc `/api/energy/meter-groups` |
| `/api/electric/energy-types` | `/api/energy-type-categories`                                 |
| `/api/electric/prices`       | `/api/energy/prices`                                          |
| `/api/electric/daily-status` | `/api/energy/daily-status`                                    |
| `/api/electric/daily-input`  | `/api/energy/daily-input`                                     |
| `/api/electric/live`         | `/api/energy/live`                                            |
| `/api/electric/reports`      | `/api/energy/reports`                                         |
| `/api/electric/last-record`  | `/api/energy/last-record`                                     |

Có thể giữ alias API cũ nếu code hiện tại đang gọi, nhưng UI mới phải gọi namespace `/api/electric/...`.

## Logic nghiệp vụ bắt buộc giữ giống ERP

- `PowerTelemetry`: dữ liệu thô từ đồng hồ tự động.
- `PowerRecord`: dữ liệu chốt ngày.
- `dataSource = AUTO | MANUAL`.
- AUTO do `scripts/energy-cron.js` ghi.
- MANUAL do người dùng nhập từ `/electric/daily-input`.
- Chốt số tự động lúc 08:00 sáng giờ Việt Nam.
- RecordDate dùng mốc `T12:00:00.000+07:00` để tránh lệch ngày.
- Đồng hồ Selec EM368 đọc `Active Energy` tại register `0x00`.
- Parse float phải đảo byte CDAB → ABCD.
- `Total kW` chỉ dùng realtime/chart, không dùng tính tiền.
- Tiêu thụ hạ thế:
  - bình thường: `(currTotal - prevTotal) * tu * ti`
  - reset: `currTotal * tu * ti`
- Không tính toán nghiệp vụ chính ở frontend; API phải tính/validate lại.

## File cần tạo/refactor trong MES

Gợi ý cấu trúc:

```txt
src/app/electric/layout.tsx
src/app/electric/overview/page.tsx
src/app/electric/catalog/page.tsx
src/app/electric/daily-input/page.tsx
src/app/electric/live/page.tsx
src/app/electric/reports/page.tsx
src/app/electric/prices/page.tsx

src/app/api/electric/factories/route.ts
src/app/api/electric/substations/route.ts
src/app/api/electric/meters/route.ts
src/app/api/electric/meter-groups/route.ts
src/app/api/electric/energy-types/route.ts
src/app/api/electric/prices/route.ts
src/app/api/electric/daily-status/route.ts
src/app/api/electric/daily-input/route.ts
src/app/api/electric/live/route.ts
src/app/api/electric/reports/route.ts
src/app/api/electric/last-record/route.ts

scripts/energy-cron.js
Nếu muốn tách component cho dễ bảo trì:
src/components/electric/FactoryTab.tsx
src/components/electric/SubstationTab.tsx
src/components/electric/MeterTab.tsx
src/components/electric/MeterGroupTab.tsx
src/components/electric/EnergyTypeTab.tsx
Quy tắc refactor
Đọc code ERP trước khi sửa:
PHUBAI-ERP/src/app/categories/meters/page.tsx
PHUBAI-ERP/src/app/categories/meter-group/page.tsx
PHUBAI-ERP/src/app/categories/energy-type/page.tsx
PHUBAI-ERP/src/app/dashboard/energy/*
PHUBAI-ERP/src/app/api/energy/*

Copy logic sang MES, đổi đường dẫn từ:
/categories/... → /electric/catalog
/dashboard/energy/... → /electric/...
/api/energy/... → /api/electric/...

Không gộp lại thành một trang nhập liệu duy nhất.

Giữ UI Ant Design tương tự ERP để người dùng quen thao tác.

Nếu MES hiện đã có page/module điện năng gộp chung, hãy tách chức năng ra các route trên. Không xóa logic đang chạy nếu chưa cần; di chuyển/tái dùng lại.

Verify
Sau khi hoàn thành, kiểm tra:
Sidebar có nhóm ĐIỆN NĂNG.
Vào /electric/catalog thấy tabs:Nhà máy
Trạm biến áp
Đồng hồ điện
Nhóm đồng hồ
Loại điện năng

Thêm/sửa đồng hồ AUTO được nhập Gateway IP/Port/Slave ID.
/electric/daily-input hoạt động giống ERP.
/electric/live gọi được API realtime.
/electric/reports hiển thị báo cáo giống ERP.
/electric/prices sửa được đơn giá.
npm run build pass.
scripts/energy-cron.js vẫn chạy với database MES.
```
