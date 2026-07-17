# Hướng dẫn tích hợp: lấy dữ liệu tự động từ một portal web ngoài vào PHUBAI-MES

> **Mục đích tài liệu.** Đây là tài liệu kỹ thuật mô tả *phương pháp chung* để đưa dữ liệu từ một hệ thống web bên ngoài (không có API chính thức) vào PHUBAI-MES một cách tự động. Nó được viết để một tác nhân AI (hoặc lập trình viên) đọc và **lặp lại được cho một portal khác** trong tương lai.
>
> Trường hợp đã triển khai thực tế — lấy chỉ số công tơ điện trung thế từ portal CSKH của Điện lực Miền Trung (EVNCPC) — được dùng xuyên suốt làm **ví dụ minh hoạ cụ thể**. Khi gặp một hệ thống mới, hãy đọc phần "Phương pháp chung" trước, rồi đối chiếu với "Case study EVN" để thấy từng bước áp dụng ra sao.

---

## 0. Nguyên tắc nền tảng: "trang web" và "dữ liệu" là hai thứ khác nhau

Điều quan trọng nhất cần hiểu trước khi bắt đầu.

Khi người dùng mở một web app và bấm một nút để xem dữ liệu, trình duyệt làm **hai việc tách biệt**:

1. Tải về **bộ khung giao diện** (HTML/CSS/JS) — phần trang trí: nút bấm, bảng, màu sắc.
2. Bộ khung đó **gửi một request HTTP riêng** tới máy chủ và nhận về **dữ liệu thuần** (thường là JSON), rồi tự vẽ ra bảng cho người xem.

Cái bảng đẹp trên màn hình chỉ là lớp trang trí. **Dữ liệu thật nằm trong request JSON ngầm kia.**

Hệ quả: nếu một trang web cho người dùng đăng nhập và xem được dữ liệu, thì một *script* cũng đăng nhập và lấy được đúng dữ liệu đó — bằng cách **lặp lại chính những request mà trình duyệt vẫn gửi ngầm**. Không cần nhà cung cấp mở API chính thức. Không cần điều khiển trình duyệt (thường thế; xem mục 8 về ngoại lệ).

Toàn bộ công việc quy về: **quan sát trình duyệt nói chuyện với máy chủ như thế nào, rồi bắt chước lại y hệt từ một script.**

---

## 1. Phương pháp chung — tổng quan 6 bước

```
[1] Do thám (DevTools)      -> hiểu portal gửi request gì, xác thực ra sao
[2] Kiểm chứng (curl)        -> tái tạo request bằng tay, chắc chắn lấy được data
[3] Viết collector (script)  -> tự động hoá cuộc hội thoại đó, chạy ở máy gần nguồn
[4] Viết endpoint nhận (MES) -> kênh máy-tới-máy đẩy data vào DB, idempotent
[5] Lên lịch (cron/PM2)      -> chạy đều đặn, đúng múi giờ
[6] Chốt an toàn + dự phòng  -> luôn giữ đường nhập tay, cảnh báo khi hỏng
```

Nguyên tắc bao trùm: **tự động hoá không được thay thế con người bằng một quy trình dễ vỡ hơn.** Portal ngoài có thể đổi giao diện, đổi cách đăng nhập, thêm captcha bất cứ lúc nào. Vì vậy mọi thiết kế đều phải: (a) log rõ ràng khi hỏng, (b) không bao giờ ghi đè dữ liệu người nhập tay, (c) giữ nguyên đường nhập tay làm phương án dự phòng.

---

## 2. Bước 1 — Do thám bằng DevTools

Mục tiêu: tìm ra **request dữ liệu** và **cách xác thực**.

### 2.1. Bắt request dữ liệu

1. Mở portal bằng Chrome, đăng nhập, tới đúng màn hình hiển thị dữ liệu cần lấy.
2. Nhấn **F12** → tab **Network** → tick **Preserve log** (để log không bị xoá khi trang chuyển).
3. Bấm nút hiển thị dữ liệu (ví dụ "Xem"). Lọc **Fetch/XHR** để bỏ ảnh/CSS cho dễ nhìn.
4. Tìm dòng request trả về đúng dữ liệu cần (nhìn cột Size, hoặc mở tab Response/Preview của từng dòng).
5. **Chuột phải dòng đó → Copy → Copy as cURL.** Lệnh cURL này chứa trọn: URL đầy đủ, method, mọi header, token, cookie. Đây là "bản ghi" đầy đủ của một cuộc gọi thành công.
6. Mở tab **Response** của dòng đó, copy nguyên JSON. Đây là thứ quan trọng nhất: nó cho biết dữ liệu cần nằm ở **trường (field) tên gì**.

### 2.2. Nhận diện cơ chế xác thực

Nhìn trong request đã bắt:
- Có header `Authorization: Bearer <chuỗi dài>` → xác thực bằng **token JWT**. Đây là kiểu dễ tự động hoá nhất.
- Có `Cookie: session=...` → xác thực bằng **cookie phiên**.
- Xuất hiện một request `OPTIONS` (status 204) ngay trước request thật → đó là **CORS preflight**, dấu hiệu request mang header tuỳ chỉnh (gần như chắc chắn là `Authorization`).

### 2.3. Bắt request đăng nhập

1. Vẫn bật Preserve log, **đăng xuất rồi đăng nhập lại.**
2. Tìm request POST tên kiểu `login`, `token`, `authenticate`, `connect/token`, `dang-nhap`...
3. Copy **Request URL**, tab **Payload** (xem gửi username/password dạng gì), và **Response** (xem token trả về nằm ở field nào, và thời hạn `expires_in`).

### 2.4. Bảng thông tin cần thu thập xong bước 1

| Hạng mục | Ví dụ EVN |
| --- | --- |
| URL đăng nhập | `POST https://cskh-api.cpc.vn/api/cskh/user/login` |
| Payload đăng nhập | `{ username, password, grant_type:"password", scope:"CSKH", ThongTinCaptcha:{captcha:"undefined",token:"undefined"} }` |
| Token nằm ở field | `access_token` (JWT) |
| Thời hạn token | `expires_in: 31536000` (~1 năm) |
| URL dữ liệu | `POST https://cskh-api.cpc.vn/api/remote/dspm/thongsovanhanh?customerPoint=...&customerCode=...&time=...` |
| Method dữ liệu | POST (không phải GET — xem mục 3) |
| Tham số định danh điểm dữ liệu | `customerPoint`, `customerCode` |
| Tham số thời gian | `time=MM/DD/YYYY HH:mm` (định dạng Mỹ!) |
| Field dữ liệu cần | `results[0].impbt / impcd / imptd` (3 khung giá) |
| Có captcha? | Không |

---

## 3. Bước 2 — Kiểm chứng bằng curl trước khi viết code

**Đừng viết script ngay.** Tái tạo cuộc gọi bằng `curl` trên chính máy sẽ chạy collector, để tách bạch lỗi mạng/xác thực khỏi lỗi logic code.

Lấy token (nếu đã có phiên đăng nhập, lấy từ cache; hoặc gọi login trước):

```bash
curl -i -X POST <URL_LOGIN> \
  -H "Content-Type: application/json" \
  -d '{"username":"...","password":"...","grant_type":"password","scope":"CSKH","ThongTinCaptcha":{"captcha":"undefined","token":"undefined"}}'
# -> chép access_token từ response
```

Gọi thử request dữ liệu:

```bash
curl -i -X POST "<URL_DATA>?customerPoint=...&time=..." \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Đọc kỹ dòng `HTTP/...` đầu tiên và các header trả về — chúng **dạy** ta cách gọi đúng. Ví dụ thực tế đã gặp với EVN:

- Gọi **GET** → `405 Method Not Allowed`, header `allow: POST`. → Bài học: endpoint chỉ nhận **POST**, dù nhìn như một truy vấn đọc dữ liệu.
- Gọi **POST không body** → `411 Length Required` (server IIS). → Bài học: phải gửi body dù rỗng (`-d '{}'` + `Content-Type: application/json`).
- Khi ra `200 OK` + JSON có dữ liệu → sẵn sàng viết script.

**Nguyên tắc: mã lỗi HTTP là chỉ dẫn, không phải ngõ cụt.** 401=token sai/thiếu, 403=không đủ quyền, 404=sai URL, 405=sai method (đọc header `allow`), 411/400=thiếu/sai body, 429=bị rate-limit.

---

## 4. Bước 3 — Viết collector script

### 4.1. Chạy ở đâu

Collector chạy trên **máy gần nguồn dữ liệu nhất** — thường là mini PC tại mạng công ty, KHÔNG phải VPS. Lý do: (a) nếu portal giới hạn IP hoặc ưu tiên IP nội địa, IP công ty là phù hợp; (b) gom chung với các collector khác (ví dụ collector Modbus) để dùng chung `.env` và `node_modules`.

Trong dự án này, thư mục là `/home/ubuntu/energy-collector/` trên mini PC, chạy chung với `energy-push-collector.js` (Modbus).

### 4.2. Cấu trúc script chuẩn (theo `evn-portal-collector.js`)

```
1. Đọc cấu hình (.env + file tài khoản JSON riêng)
2. Với TỪNG tài khoản/điểm dữ liệu:
   a. Lấy token (từ cache; nếu chưa có thì login)
   b. Gọi request dữ liệu với đúng method/body/header
   c. Nếu 401 -> login lại 1 lần rồi thử lại (token hết hạn/bị thu hồi)
   d. Kiểm tra dữ liệu TƯƠI (đúng mốc thời gian mong đợi) trước khi nhận
   e. Đối chiếu định danh (điểm dữ liệu trả về khớp cấu hình)
   f. Trích các field cần, chuẩn hoá về đơn vị/khoá của MES
3. Gom kết quả, POST 1 lần lên endpoint MES
4. Nếu POST lỗi (mất mạng) -> lưu buffer, lần chạy sau gửi lại
5. Log rõ ràng + exit code khác 0 khi có lỗi (để cron/monitor bắt được)
```

### 4.3. Các quyết định thiết kế quan trọng (áp dụng cho mọi portal)

**Tách bí mật ra file riêng, chmod 600, gitignore.** Mật khẩu/tài khoản KHÔNG nằm trong `.env` chung nếu chúng có ký tự đặc biệt (`@`, `|`, `;`) dễ làm vỡ chuỗi. Dùng file JSON riêng (ví dụ `evn-accounts.json`), quyền `600`, và thêm vào `.gitignore` cùng thư mục token cache và buffer:
```
evn-accounts.json
.evn-tokens/
evn-mv-buffer.jsonl
evn.log
```

**Cache token ra file.** Nếu token sống lâu (EVN: ~1 năm), lưu ra `.evn-tokens/<username>.json` và tái sử dụng; chỉ login lại khi gặp 401. Giảm số lần đăng nhập → giảm nguy cơ bị portal coi là bất thường.

**Đa tài khoản = token riêng, cô lập lỗi.** Nếu một nguồn cấp nhiều tài khoản (EVN: mỗi công tơ một tài khoản), mỗi tài khoản có cache riêng và được xử lý trong vòng lặp `try/catch` riêng. Một tài khoản hỏng KHÔNG được kéo sập các tài khoản khác. Chạy **tuần tự**, không song song, để không dội request vào portal.

**Tính thời gian độc lập với múi giờ máy.** Đây là bẫy đã thực sự xảy ra. Dùng `Intl.DateTimeFormat` với `timeZone` cố định (ví dụ `Asia/Ho_Chi_Minh`) để tính ngày/giờ nghiệp vụ, thay vì `new Date()` thô (phụ thuộc timezone hệ điều hành). Nhờ vậy dù máy chạy UTC, script vẫn query đúng mốc giờ địa phương và gán đúng ngày.

```js
function vnDateParts(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return { y: get("year"), m: get("month"), d: get("day") };
}
```

**Kiểm tra dữ liệu TƯƠI trước khi nhận.** Portal có thể trả về bản đọc CŨ nếu nguồn (công tơ) mất kết nối. Script phải kiểm tra mốc thời gian trong response (`ngaygio`) khớp đúng mốc mong đợi; nếu không → KHÔNG đẩy, để người vận hành nhập tay. Ghi nhầm số cũ thành số mới sẽ sai âm thầm và rất khó phát hiện.

**Đối chiếu định danh chống lắp nhầm.** Nếu nhiều tài khoản/điểm dữ liệu gần giống nhau, so field định danh trong response (`mA_DIEMDO`) với cấu hình; lệch thì dừng, tránh ghi dữ liệu nguồn A sang chỗ của nguồn B.

**Buffer khi mất mạng.** Nếu POST lên MES lỗi, ghi các bản đọc vào file `.jsonl`; lần chạy sau nạp lại và gửi kèm. Xoá buffer khi gửi thành công.

---

## 5. Bước 4 — Endpoint nhận phía MES

### 5.1. Vì sao cần endpoint riêng

Collector là tiến trình **máy-tới-máy**, không có phiên đăng nhập người dùng. Không dùng được các API đòi session (ví dụ `/api/electric/daily-input` đòi NextAuth). Cần một endpoint riêng xác thực bằng **API key** dùng chung khoá với collector — theo mẫu `/api/collector/ingest` đã có.

Endpoint đã tạo: `POST /api/collector/mv-ingest`, xác thực header `x-api-key` qua `requireCollectorKey`.

### 5.2. Ba nguyên tắc bắt buộc của endpoint

**Idempotent — không ghi đè, không nhân đôi.** Nếu bản ghi `(recordDate, meterId)` đã tồn tại → BỎ QUA, trả trạng thái `exists-skipped`. Hệ quả kép rất quan trọng: (a) **dữ liệu người nhập tay luôn thắng** — máy không đè lên; (b) **chạy lại script bao nhiêu lần cũng an toàn** — cho phép lên lịch nhiều nhịp (mục 6) mà không sợ nhân đôi.

**Dùng chung logic tính toán với đường nhập tay.** Endpoint gọi cùng hàm dựng bản ghi (`buildPowerRecordValues`) mà form nhập tay dùng — cùng cách phát hiện baseline/reset, cùng cách nhân hệ số, cùng cách tính. **Một nguồn sự thật duy nhất**, không nhân bản logic ở hai nơi (nếu không, hai đường sẽ trôi khác nhau theo thời gian).

**Đánh dấu nguồn gốc.** Ghi `dataSource: "AUTO"`, `createdBy: "evn-collector"`, và note mô tả để về sau phân biệt được bản ghi nào do máy lấy, bản nào người nhập.

### 5.3. Quy ước dữ liệu (đặc thù nghiệp vụ, ví dụ EVN)

Số chốt lúc 06:00 sáng nay = tiêu thụ của **ngày hôm qua** (vì hôm nay chưa kết thúc). Nên collector gửi `recordDate = hôm qua`. Endpoint KHÔNG tự suy diễn ngày — collector chịu trách nhiệm gửi đúng, để logic tập trung một chỗ.

---

## 6. Bước 5 — Lên lịch chạy

### 6.1. Múi giờ là ưu tiên số một cần kiểm tra

Cron chạy theo **giờ hệ điều hành**. Nếu máy đặt UTC mà lịch ghi `6 * * *` với ý định 6h sáng VN, nó sẽ bắn lúc 6h UTC = 13h VN. Đây là lỗi đã thực sự xảy ra và làm collector "im lặng không chạy".

```bash
date                    # phải ra giờ địa phương mong đợi
timedatectl             # xem Time zone
sudo timedatectl set-timezone Asia/Ho_Chi_Minh   # sửa nếu cần
```

**Bẫy đã thực sự vấp phải: đổi `timedatectl` là CHƯA đủ với PM2.** Khi dùng PM2 để lên lịch, cron của PM2 tính giờ theo **PM2 daemon**, không theo giờ hệ thống. PM2 daemon khởi động từ trước vẫn giữ nguyên timezone CŨ (UTC) trong bộ nhớ, kể cả sau khi đã `timedatectl` sửa giờ hệ thống. `pm2 restart`/`delete`/`start` chỉ thao tác tiến trình con — daemon vẫn ôm TZ cũ. Hệ quả: `date` ra đúng giờ VN nhưng cron PM2 vẫn im. Muốn PM2 nhận TZ mới phải nạp lại HẲN daemon (`pm2 kill` rồi `pm2 resurrect`) — nhưng lệnh này tắt MỌI tiến trình PM2 trên máy, phải cân nhắc. Chính vì bẫy này mà dự án đã chuyển sang **crontab Linux** (mục 6.3), vốn chạy thẳng theo giờ hệ thống, không qua daemon trung gian.

### 6.2. Chạy nhiều nhịp để chờ nguồn cập nhật

Nguồn (portal EVN) có thể chưa cập nhật kịp bản đọc 06:00 ngay lúc 06:00. Vì endpoint idempotent, cứ chạy nhiều nhịp cho chắc — nhịp nào có dữ liệu thì tạo, nhịp sau thấy đã có thì `exists-skipped`:

```
15,30,45 6 * * *    # chạy 06:15, 06:30, 06:45 giờ VN
```

### 6.3. Lên lịch bằng crontab Linux (CÁCH ĐANG DÙNG — khuyến nghị)

Với script **one-shot** (chạy xong thoát), crontab Linux đơn giản và đáng tin hơn PM2 cron: nó chạy thẳng theo giờ hệ thống, không qua daemon trung gian, nên **miễn nhiễm với bẫy timezone-daemon** ở mục 6.1 — vừa `timedatectl` xong là đúng ngay.

Đây là cách dự án ĐANG dùng cho `evn-portal-collector.js`. Lưu ý `energy-push-collector.js` (Modbus, daemon) vẫn nằm trong PM2 — hai script hai công cụ quản lý khác nhau, không lẫn.

```bash
which node        # LẤY ĐƯỜNG DẪN NODE TUYỆT ĐỐI — bắt buộc
crontab -e
```

Thêm dòng (thay đường dẫn node bằng kết quả `which node`, KHÔNG bọc dấu nháy):
```
15,30,45 6 * * * cd /home/ubuntu/energy-collector && /home/ubuntu/.nvm/versions/node/v24.12.0/bin/node evn-portal-collector.js >> /home/ubuntu/energy-collector/evn.log 2>&1
```

**Ba điểm bắt buộc:**
- **Đường dẫn node TUYỆT ĐỐI.** Crontab chạy với môi trường tối giản, KHÔNG có PATH của nvm. Ghi `node` trơn sẽ báo `command not found`. Phải lấy từ `which node` và ghi nguyên đường dẫn.
- **`cd` vào đúng thư mục** trước khi gọi node, vì script tìm `evn-accounts.json`, `.evn-tokens/`, buffer theo `process.cwd()`.
- **Chuyển hướng ra file log** (`>> evn.log 2>&1`) — vì crontab không hiện trong `pm2 list`, file log này là cách DUY NHẤT để kiểm tra nó có tự chạy hay không. `tail -30 evn.log` mỗi sáng.

Kiểm tra đã lưu:
```bash
crontab -l | grep evn      # phải thấy đúng 1 dòng lịch
```

**Cách test cron bắn thật (không đợi tới sáng):** xem `date`, đặt một dòng lịch tạm chạy sau 2–3 phút (ví dụ bây giờ 08:08 thì đặt `11 8 * * *`), đợi qua mốc rồi `tail -20 evn.log`. Có dòng `[08:11 ...] EVN portal collector bat dau` là crontab hoạt động đúng giờ VN. Test xong XÓA dòng tạm, chỉ giữ dòng `15,30,45 6 * * *`.

### 6.4. Phương án thay thế: PM2 cho script one-shot

Nếu vì lý do gì đó phải dùng PM2 thay crontab (ví dụ muốn gom mọi tiến trình vào một chỗ quản lý), lưu ý các cờ bắt buộc:
- `--cron-restart "15,30,45 6 * * *"` — lịch chạy.
- `--no-autorestart` — **BẮT BUỘC**. Thiếu cờ này, PM2 tưởng script "chết" (vì nó exit) và khởi động lại liên tục → dội request vào portal → dễ bị chặn IP.
- Chạy `pm2 start` từ **đúng thư mục** collector (hoặc dùng `--cwd`).

```bash
cd /home/ubuntu/energy-collector
pm2 start evn-portal-collector.js --name evn-collector \
  --cron-restart "15,30,45 6 * * *" --no-autorestart
pm2 save
```

Trạng thái `stopped` giữa các lần chạy là **đúng**, không phải lỗi. NHƯNG phải nhớ bẫy timezone-daemon ở mục 6.1: sau khi đổi timezone hệ thống, cron PM2 chỉ nhận giờ mới khi daemon được nạp lại hoàn toàn (`pm2 kill` + `pm2 resurrect`). Vì rủi ro này, crontab (mục 6.3) là lựa chọn mặc định của dự án.

---

## 7. Bước 6 — Chốt an toàn & vận hành

- **Luôn giữ đường nhập tay.** Tự động chỉ là tiện ích; khi nó hỏng (portal đổi giao diện, hết hạn tài khoản, mất mạng), người vận hành vẫn phải nhập tay được như cũ.
- **Log mọi lần chạy.** Ai lấy được, ai lỗi, lý do gì. Exit code khác 0 khi có lỗi để hệ thống giám sát bắt.
- **Đối chiếu chéo nếu có thể.** Ví dụ EVN trả cả `importkwh` lẫn 3 khung `impbt/impcd/imptd`; script kiểm tra tổng 3 khung ≈ tổng, cảnh báo nếu lệch.
- **Bảo mật.** Đổi mật khẩu nếu lỡ để lộ. Không commit bí mật. `chmod 600` file tài khoản.
- **Ghi lại quyết định vào tài liệu ngữ cảnh** (`BUSINESS_LOGIC_CONTEXT.md`) — đặc biệt các đặc thù dễ quên: POST-không-GET, body-rỗng-vẫn-cần, định dạng ngày Mỹ, quy ước lùi-1-ngày.

---

## 8. Khi nào KHÔNG dùng được phương pháp này

Phương pháp "bắt chước request" (mục 2–7) hiệu quả với đa số portal. Nó **không** dùng được khi:

- **Có captcha thật khi đăng nhập.** Nếu portal bắt captcha mỗi lần login, script không tự vượt được. Mẹo giảm nhẹ: nhiều portal chỉ bắt captcha ở login mới, còn token/phiên sống lâu — có thể login tay một lần lấy token, cache lại, dùng nhiều ngày, chỉ báo người login lại khi token chết.
- **Xác thực mã hoá phía client phức tạp** (ký request động, đổi token liên tục theo thuật toán khó tái tạo).

Khi rơi vào các trường hợp trên, chuyển sang **điều khiển trình duyệt thật** bằng Playwright/Puppeteer: script mở Chrome headless, tự điền form, bấm nút, đọc số trên màn hình. Nặng hơn (vài trăm MB RAM), dễ gãy khi portal đổi giao diện, nhưng "trang thấy gì, script lấy được nấy". Đây là phương án dự phòng, không phải lựa chọn đầu tiên.

---

## 9. Checklist tích hợp một portal MỚI

Khi cần lấy dữ liệu từ một hệ thống khác, đi theo checklist:

```
DO THÁM
[ ] Đăng nhập portal bằng Chrome, tới màn hình dữ liệu cần
[ ] F12 > Network > Preserve log; bấm nút hiển thị dữ liệu
[ ] Copy as cURL request dữ liệu; lưu Response JSON
[ ] Đăng xuất/đăng nhập lại; bắt request login (URL, payload, field token, expires_in)
[ ] Ghi lại: có captcha không? xác thực token hay cookie?

KIỂM CHỨNG
[ ] curl login -> lấy token
[ ] curl request dữ liệu -> đọc mã HTTP, sửa method/body/header tới khi 200
[ ] Xác định field dữ liệu cần trong JSON; xác định tham số định danh & thời gian

COLLECTOR
[ ] Tạo file cấu hình tài khoản riêng (chmod 600, gitignore)
[ ] Login + cache token; tự re-login khi 401
[ ] Tính thời gian theo timezone cố định (Intl.DateTimeFormat)
[ ] Kiểm tra dữ liệu tươi (đúng mốc thời gian) trước khi nhận
[ ] Đối chiếu định danh chống lắp nhầm
[ ] Chuẩn hoá field về khoá/đơn vị của MES
[ ] Buffer khi mất mạng; log rõ; exit code

ENDPOINT MES
[ ] Endpoint /api/collector/... xác thực x-api-key
[ ] Idempotent: bỏ qua bản ghi đã tồn tại (exists-skipped)
[ ] Dùng chung hàm dựng bản ghi với đường nhập tay
[ ] Đánh dấu dataSource=AUTO, createdBy

LÊN LỊCH
[ ] Kiểm tra & sửa timezone máy
[ ] PM2 --cron-restart + --no-autorestart + đúng cwd (hoặc crontab)
[ ] Test bắn cron bằng mốc giả sau vài phút

AN TOÀN
[ ] Giữ đường nhập tay hoạt động song song
[ ] Ghi quyết định & đặc thù vào BUSINESS_LOGIC_CONTEXT.md
```

---

## 10. Phụ lục — Bản đồ nhanh case study EVN

| Thành phần | Đường dẫn / giá trị |
| --- | --- |
| Collector | `scripts/evn-portal-collector.js` (chạy ở mini PC `/home/ubuntu/energy-collector/`) |
| File tài khoản | `evn-accounts.json` (mẫu: `scripts/evn-accounts.example.json`) |
| Token cache | `.evn-tokens/<username>.json` |
| Endpoint MES | `POST /api/collector/mv-ingest` (`src/app/api/collector/mv-ingest/route.ts`) |
| Login | `POST https://cskh-api.cpc.vn/api/cskh/user/login` |
| Dữ liệu | `POST https://cskh-api.cpc.vn/api/remote/dspm/thongsovanhanh` |
| Method/body | POST + body `{}` (GET→405, body rỗng→411) |
| Định dạng time | `MM/DD/YYYY HH:mm` (Mỹ) |
| Field 3 khung giá | `results[0].impbt` (bình thường) / `impcd` (cao điểm) / `imptd` (thấp điểm) |
| Token sống | ~1 năm (`expires_in: 31536000`) |
| Lịch chạy | `15,30,45 6 * * *` (giờ VN) |
| Quy ước ngày | số 06:00 sáng nay → recordDate = hôm qua |
| 3 tài khoản | NM1 `PC03PP0202258`, NM2 `PC03PP0202257`, NM3 `PC03PP0240108` (customerPoint = mã + "001") |
