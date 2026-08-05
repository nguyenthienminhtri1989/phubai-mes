"use client";

import {
  CloudDownloadOutlined,
  DatabaseOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Result, Typography, message } from "antd";
import { useSession } from "next-auth/react";
import { useState } from "react";

const { Paragraph, Text } = Typography;

export default function BackupPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const [loading, setLoading] = useState(false);

  // Guard phía client (menu đã ẩn với non-admin, nhưng chặn cả khi gõ URL trực tiếp).
  if (session && role !== "ADMIN") {
    return (
      <Result
        status="403"
        title="403"
        subTitle="Chỉ Quản trị viên mới được truy cập chức năng sao lưu."
      />
    );
  }

  async function handleBackup() {
    setLoading(true);
    const hide = message.loading("Đang tạo bản sao lưu trên máy chủ, vui lòng chờ...", 0);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });

      if (!res.ok) {
        // Lỗi trả về dạng JSON
        let detail = "Không rõ nguyên nhân";
        try {
          const j = await res.json();
          detail = j.detail || j.error || detail;
        } catch {
          /* bỏ qua */
        }
        message.error("Sao lưu thất bại: " + detail, 6);
        return;
      }

      // Thành công => nhận file, trích tên từ Content-Disposition
      const disp = res.headers.get("Content-Disposition") || "";
      const match = disp.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || "phubai-mes-backup.dump";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      message.success("Đã tạo và tải bản sao lưu về máy: " + filename, 5);
    } catch (err) {
      message.error(
        "Lỗi kết nối khi tải bản sao lưu: " +
          (err instanceof Error ? err.message : String(err)),
        6,
      );
    } finally {
      hide();
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#e8f3ff",
              color: "#006dcb",
              fontSize: 22,
            }}
          >
            <DatabaseOutlined />
          </span>
          <div>
            <Text strong style={{ fontSize: 16 }}>
              Sao lưu cơ sở dữ liệu
            </Text>
            <div style={{ color: "#526174", fontSize: 13 }}>
              Tạo bản sao lưu toàn bộ dữ liệu PHUBAI-MES và tải về máy tính của bạn.
            </div>
          </div>
        </div>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Bản sao lưu được tải thẳng về máy bạn"
          description="Máy chủ tạo bản dump rồi truyền thẳng về trình duyệt; không lưu lại trên VPS. Nhờ vậy nếu máy chủ gặp sự cố, bản sao lưu vẫn an toàn trên máy bạn. Nên đặt bản sao lưu ở nơi an toàn (ổ ngoài, cloud cá nhân)."
        />

        <Button
          type="primary"
          size="large"
          icon={<CloudDownloadOutlined />}
          loading={loading}
          onClick={handleBackup}
          block
        >
          {loading ? "Đang tạo bản sao lưu..." : "Tạo & tải bản sao lưu về máy"}
        </Button>

        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          Định dạng file <Text code>.dump</Text> (PostgreSQL custom format, đã nén). Thời gian tạo
          tùy kích thước dữ liệu — vui lòng không đóng tab khi đang tải.
        </Paragraph>
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <WarningOutlined style={{ color: "#b7791f", fontSize: 18 }} />
          <Text strong>Phục hồi dữ liệu</Text>
        </div>

        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Phục hồi là thao tác nguy hiểm, thực hiện qua SSH"
          description="Phục hồi sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại và cắt kết nối của ứng dụng. Để tránh rủi ro tự ghi đè khi hệ thống đang chạy, chức năng phục hồi không đặt trong giao diện web. Khi cần phục hồi, hãy SSH vào máy chủ và chạy lệnh dưới đây."
        />

        <Paragraph style={{ marginBottom: 6 }}>
          <Text strong>Các bước phục hồi từ file </Text>
          <Text code>.dump</Text>:
        </Paragraph>
        <Paragraph style={{ marginBottom: 0 }}>
          <pre
            style={{
              background: "#0f1729",
              color: "#e6edf5",
              padding: "14px 16px",
              borderRadius: 8,
              fontSize: 12.5,
              overflowX: "auto",
              margin: 0,
              lineHeight: 1.6,
            }}
          >{`# 1. Đưa file backup lên máy chủ (từ máy bạn)
scp phubai-mes_YYYY-MM-DD_HH-mm-ss.dump deploy@phubaimes.site:/tmp/

# 2. SSH vào máy chủ
ssh deploy@phubaimes.site

# 3. (Khuyến nghị) tạo bản sao lưu hiện tại trước khi ghi đè
pg_dump "$DATABASE_URL" -Fc -f /tmp/truoc-khi-phuc-hoi.dump

# 4. Phục hồi (ghi đè). --clean --if-exists: xoá đối tượng cũ trước khi tạo lại
pg_restore --clean --if-exists --no-owner --no-privileges \\
  -d "$DATABASE_URL" /tmp/phubai-mes_YYYY-MM-DD_HH-mm-ss.dump

# 5. Khởi động lại ứng dụng để làm mới connection pool
pm2 reload phubai-mes`}</pre>
        </Paragraph>

        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          Lưu ý: phiên bản <Text code>pg_restore</Text> trên máy chủ phải bằng hoặc mới hơn phiên bản
          PostgreSQL của server dữ liệu.
        </Paragraph>
      </Card>
    </div>
  );
}
