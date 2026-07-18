"use client";

import {
  CheckCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";

const { Text, Title } = Typography;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || data?.message || "HTTP " + response.status);
  return data as T;
}

type PfRow = {
  id: string;
  date: string;
  readAt: string | null;
  meterId: string;
  meterCode: string;
  meterName: string;
  factoryName: string;
  pfA: number | null;
  pfB: number | null;
  pfC: number | null;
  pfMin: number | null;
  isLow: boolean;
};

type PfData = {
  threshold: number;
  days: number;
  latest: PfRow[];
  rows: PfRow[];
  alertCount: number;
};

const fmtPf = (value: number | null) =>
  typeof value === "number" ? value.toFixed(3) : "---";

/** Mau theo muc do: <= nguong canh bao = do, duoi 0.95 = cam, con lai = xanh. */
function pfColor(value: number | null, threshold: number) {
  if (typeof value !== "number") return undefined;
  if (value <= threshold) return "#cf1322";
  if (value < 0.95) return "#fa8c16";
  return "#389e0d";
}

function PfCell({ value, threshold }: { value: number | null; threshold: number }) {
  const color = pfColor(value, threshold);
  return (
    <Text strong={typeof value === "number" && value <= threshold} style={{ color }}>
      {fmtPf(value)}
    </Text>
  );
}

export function PowerFactorClient() {
  const [data, setData] = useState<PfData | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchJson<PfData>(`/api/electric/power-factor?days=${days}`);
      setData(result);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Không tải được dữ liệu cos φ");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const threshold = data?.threshold ?? 0.91;
  const lowMeters = (data?.latest || []).filter((r) => r.isLow);

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>
        Theo dõi hệ số cos φ
      </Title>
      <Text type="secondary">
        Số đọc lúc 6h sáng hàng ngày từ công tơ trung thế (EVN). Cảnh báo khi cos φ ≤{" "}
        {threshold} — cần kiểm tra tụ bù. Dữ liệu lưu {data?.days ?? 30} ngày gần nhất.
      </Text>

      <Space style={{ margin: "16px 0" }}>
        <Segmented
          value={days}
          onChange={(value) => setDays(Number(value))}
          options={[
            { label: "7 ngày", value: 7 },
            { label: "15 ngày", value: 15 },
            { label: "30 ngày", value: 30 },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Tải lại
        </Button>
      </Space>

      {lowMeters.length > 0 ? (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={`Cảnh báo: ${lowMeters.length} công tơ có cos φ ≤ ${threshold}`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lowMeters.map((r) => (
                <li key={r.meterId}>
                  <b>{r.meterCode}</b> ({r.factoryName}) — thấp nhất{" "}
                  <b>{fmtPf(r.pfMin)}</b> ngày {dayjs(r.date).format("DD/MM/YYYY")}. Nên
                  kiểm tra tụ bù.
                </li>
              ))}
            </ul>
          }
        />
      ) : data && data.latest.length > 0 ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          style={{ marginBottom: 16 }}
          message={`Tất cả công tơ đang có cos φ trên ngưỡng ${threshold}`}
        />
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {(data?.latest || []).map((row) => (
          <Col xs={24} md={8} key={row.meterId}>
            <Card loading={loading}>
              <Statistic
                title={`${row.meterCode} — ${row.factoryName}`}
                value={row.pfMin ?? 0}
                precision={3}
                prefix={
                  row.isLow ? (
                    <WarningOutlined style={{ color: "#cf1322" }} />
                  ) : (
                    <ThunderboltOutlined />
                  )
                }
                valueStyle={{ color: pfColor(row.pfMin, threshold) }}
              />
              <Space size={4} wrap style={{ marginTop: 8 }}>
                <Tag>A: {fmtPf(row.pfA)}</Tag>
                <Tag>B: {fmtPf(row.pfB)}</Tag>
                <Tag>C: {fmtPf(row.pfC)}</Tag>
              </Space>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Pha thấp nhất, đo {dayjs(row.date).format("DD/MM/YYYY")} lúc 6h
                </Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="Nhật ký cos φ theo ngày">
        {data && data.rows.length === 0 && !loading ? (
          <Empty description="Chưa có dữ liệu cos φ. Dữ liệu được thu thập tự động lúc 6h15 sáng hàng ngày." />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={data?.rows || []}
            scroll={{ x: true }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            rowClassName=""
            onRow={(record: PfRow) => ({
              style: record.isLow ? { background: "#fff1f0" } : undefined,
            })}
            columns={[
              {
                title: "Ngày",
                dataIndex: "date",
                render: (value: string) => dayjs(value).format("DD/MM/YYYY"),
              },
              {
                title: "Công tơ",
                dataIndex: "meterCode",
                render: (value: string) => <Tag color="volcano">{value}</Tag>,
              },
              { title: "Nhà máy", dataIndex: "factoryName" },
              {
                title: "Pha A",
                dataIndex: "pfA",
                align: "right",
                render: (value: number | null) => (
                  <PfCell value={value} threshold={threshold} />
                ),
              },
              {
                title: "Pha B",
                dataIndex: "pfB",
                align: "right",
                render: (value: number | null) => (
                  <PfCell value={value} threshold={threshold} />
                ),
              },
              {
                title: "Pha C",
                dataIndex: "pfC",
                align: "right",
                render: (value: number | null) => (
                  <PfCell value={value} threshold={threshold} />
                ),
              },
              {
                title: "Thấp nhất",
                dataIndex: "pfMin",
                align: "right",
                render: (value: number | null, record: PfRow) =>
                  record.isLow ? (
                    <Tag color="red">{fmtPf(value)}</Tag>
                  ) : (
                    <PfCell value={value} threshold={threshold} />
                  ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
