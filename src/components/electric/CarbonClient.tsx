"use client";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CloudOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

type Factory = { id: string; code: string; name: string };
type EmissionFactor = {
  id: string;
  year: number;
  factorKgCo2ePerKwh: number;
  source: string | null;
  effectiveFrom: string;
  note: string | null;
  isActive: boolean;
};
type CarbonSummary = {
  billedKwh: number;
  internalKwh: number;
  emissionsKg: number;
  emissionsTon: number;
  avgFactorKgCo2ePerKwh: number;
  activeYears: number[];
  factorCount: number;
  warnings: string[];
};
type CarbonData = {
  summary: CarbonSummary;
  byDate: Array<{
    date: string;
    billedKwh: number;
    internalKwh: number;
    emissionsKg: number;
    emissionsTon: number;
  }>;
  byFactory: Array<{
    factoryId: string | null;
    factoryCode: string;
    factoryName: string;
    billedKwh: number;
    internalKwh: number;
    emissionsTon: number;
    avgFactorKgCo2ePerKwh: number;
  }>;
  byGroup: Array<{
    groupId: string | null;
    groupCode: string;
    groupName: string;
    internalKwh: number;
    emissionsTon: number;
  }>;
  byMeter: Array<{
    meterId: string;
    meterCode: string;
    meterName: string;
    groupName: string;
    factoryName: string;
    internalKwh: number;
    emissionsTon: number;
  }>;
};
type FactorForm = {
  id?: string;
  year: number;
  factorKgCo2ePerKwh: number;
  source?: string;
  effectiveFrom?: Dayjs;
  note?: string;
  isActive?: boolean;
};

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function fmt(value: number | undefined | null) {
  return nf.format(value || 0);
}

function TinyTrend({ rows }: { rows: CarbonData["byDate"] }) {
  const values = rows.map((row) => row.emissionsTon);
  if (values.length < 2)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Chưa đủ dữ liệu xu hướng"
      />
    );
  const width = 680;
  const height = 160;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 24) - 12;
      return x.toFixed(1) + "," + y.toFixed(1);
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 680 160"
      style={{ width: "100%", height: 160, display: "block" }}
      role="img"
      aria-label="Xu hướng phát thải CO2"
    >
      <defs>
        <linearGradient id="co2Trend" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset="0.55" stopColor="#16a34a" />
          <stop offset="1" stopColor="#65a30d" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke="url(#co2Trend)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {values.map((value, index) => {
        const x =
          values.length === 1 ? 0 : (index / (values.length - 1)) * width;
        const y = height - ((value - min) / span) * (height - 24) - 12;
        return <circle key={index} cx={x} cy={y} r="4" fill="#047857" />;
      })}
    </svg>
  );
}

export function CarbonClient() {
  const [messageApi, contextHolder] = message.useMessage();
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [carbon, setCarbon] = useState<CarbonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmissionFactor | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("year"),
    dayjs().endOf("month"),
  ]);
  const [factoryId, setFactoryId] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState("month");
  const [form] = Form.useForm<FactorForm>();

  const activeFactorText = useMemo(() => {
    const years = carbon?.summary.activeYears || [];
    return years.length ? years.join(", ") : "Chưa có";
  }, [carbon]);

  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({}))).error || "Không tải được dữ liệu",
      );
    return res.json();
  }

  async function loadFactors() {
    const data = await fetchJson<EmissionFactor[]>(
      "/api/electric/emission-factors",
    );
    setFactors(data);
  }

  async function loadCarbon() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: range[0].format("YYYY-MM-DD"),
        endDate: range[1].format("YYYY-MM-DD"),
        groupBy,
      });
      if (factoryId) params.set("factoryId", factoryId);
      const data = await fetchJson<CarbonData>(
        "/api/electric/carbon?" + params.toString(),
      );
      setCarbon(data);
    } catch (error) {
      messageApi.error(
        error instanceof Error
          ? error.message
          : "Không tải được dữ liệu phát thải",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadInitial() {
    setLoading(true);
    try {
      const [factoryRows, factorRows] = await Promise.all([
        fetchJson<Factory[]>("/api/electric/factories"),
        fetchJson<EmissionFactor[]>("/api/electric/emission-factors"),
      ]);
      setFactories(factoryRows);
      setFactors(factorRows);
    } catch (error) {
      messageApi.error(
        error instanceof Error
          ? error.message
          : "Không tải được cấu hình phát thải",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    void loadCarbon();
  }, [factoryId, groupBy, range[0], range[1]]);

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({
      year: dayjs().year(),
      factorKgCo2ePerKwh: 0,
      effectiveFrom: dayjs().startOf("year"),
      isActive: true,
    });
    setModalOpen(true);
  }

  function openEdit(row: EmissionFactor) {
    setEditing(row);
    form.setFieldsValue({
      id: row.id,
      year: row.year,
      factorKgCo2ePerKwh: row.factorKgCo2ePerKwh,
      source: row.source || undefined,
      effectiveFrom: dayjs(row.effectiveFrom),
      note: row.note || undefined,
      isActive: row.isActive,
    });
    setModalOpen(true);
  }

  async function saveFactor() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        ...values,
        id: editing?.id,
        effectiveFrom: values.effectiveFrom
          ? values.effectiveFrom.toISOString()
          : undefined,
      };
      const res = await fetch("/api/electric/emission-factors", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body.error || "Không lưu được hệ số phát thải");
      messageApi.success("Đã lưu hệ số phát thải");
      setModalOpen(false);
      await loadFactors();
      await loadCarbon();
    } catch (error) {
      messageApi.error(
        error instanceof Error
          ? error.message
          : "Không lưu được hệ số phát thải",
      );
    } finally {
      setSaving(false);
    }
  }

  const factorColumns: ColumnsType<EmissionFactor> = [
    {
      title: "Năm",
      dataIndex: "year",
      width: 90,
      sorter: (a, b) => a.year - b.year,
    },
    {
      title: "Hệ số kgCO2e/kWh",
      dataIndex: "factorKgCo2ePerKwh",
      render: (v) => fmt(v),
    },
    { title: "Nguồn", dataIndex: "source", render: (v) => v || "-" },
    {
      title: "Hiệu lực",
      dataIndex: "effectiveFrom",
      render: (v) => dayjs(v).format("DD/MM/YYYY"),
    },
    {
      title: "Trạng thái",
      dataIndex: "isActive",
      render: (v) => (
        <Tag color={v ? "green" : "default"}>{v ? "Đang dùng" : "Tắt"}</Tag>
      ),
    },
    {
      title: "",
      width: 64,
      render: (_, row) => (
        <Button icon={<EditOutlined />} onClick={() => openEdit(row)} />
      ),
    },
  ];

  const factoryColumns: ColumnsType<CarbonData["byFactory"][number]> = [
    { title: "Nhà máy", dataIndex: "factoryName" },
    {
      title: "Điện EVN (kWh)",
      dataIndex: "billedKwh",
      align: "right",
      render: fmt,
    },
    {
      title: "Phát thải (tCO2e)",
      dataIndex: "emissionsTon",
      align: "right",
      render: fmt,
    },
    {
      title: "Hệ số BQ",
      dataIndex: "avgFactorKgCo2ePerKwh",
      align: "right",
      render: fmt,
    },
    {
      title: "Điện nội bộ HT (kWh)",
      dataIndex: "internalKwh",
      align: "right",
      render: fmt,
    },
  ];

  const groupColumns: ColumnsType<CarbonData["byGroup"][number]> = [
    { title: "Nhóm hạ thế", dataIndex: "groupName" },
    {
      title: "Điện nội bộ (kWh)",
      dataIndex: "internalKwh",
      align: "right",
      render: fmt,
    },
    {
      title: "Quy đổi tham khảo (tCO2e)",
      dataIndex: "emissionsTon",
      align: "right",
      render: fmt,
    },
  ];

  const meterColumns: ColumnsType<CarbonData["byMeter"][number]> = [
    {
      title: "Đồng hồ",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.meterCode}</Text>
          <Text type="secondary">{row.meterName}</Text>
        </Space>
      ),
    },
    { title: "Nhóm", dataIndex: "groupName" },
    { title: "Nhà máy", dataIndex: "factoryName" },
    {
      title: "Điện nội bộ (kWh)",
      dataIndex: "internalKwh",
      align: "right",
      render: fmt,
    },
    {
      title: "Quy đổi tham khảo (tCO2e)",
      dataIndex: "emissionsTon",
      align: "right",
      render: fmt,
    },
  ];

  const summary = carbon?.summary;

  return (
    <div
      style={{
        padding: 24,
        background:
          "linear-gradient(180deg, #ecfdf5 0%, #f8fafc 34%, #ffffff 100%)",
        minHeight: "100vh",
      }}
    >
      {contextHolder}
      <div
        style={{
          borderRadius: 8,
          padding: 24,
          marginBottom: 18,
          background:
            "linear-gradient(135deg, #064e3b 0%, #0f766e 54%, #4d7c0f 100%)",
          color: "white",
          boxShadow: "0 16px 42px rgba(5, 95, 70, 0.22)",
        }}
      >
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col xs={24} lg={14}>
            <Space align="center" size={14}>
              <CloudOutlined style={{ fontSize: 40 }} />
              <div>
                <Title level={2} style={{ color: "white", margin: 0 }}>
                  Phát thải CO2
                </Title>
                <Text style={{ color: "rgba(255,255,255,0.88)" }}>
                  Quy đổi điện năng chốt trong MES sang phát thải Scope 2 theo
                  hệ số kgCO2e/kWh từng năm.
                </Text>
              </div>
            </Space>
          </Col>
          <Col xs={24} lg={10} style={{ textAlign: "right" }}>
            <Tag color="success" style={{ fontSize: 14, padding: "6px 10px" }}>
              Năm hệ số đang bật: {activeFactorText}
            </Tag>
          </Col>
        </Row>
      </div>

      <Card
        style={{ marginBottom: 16, borderRadius: 8 }}
        bodyStyle={{ padding: 16 }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={10} lg={8}>
            <RangePicker
              value={range}
              onChange={(value) => value && setRange(value as [Dayjs, Dayjs])}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={7} lg={6}>
            <Select
              allowClear
              placeholder="Tất cả nhà máy"
              value={factoryId}
              onChange={setFactoryId}
              style={{ width: "100%" }}
              options={factories.map((factory) => ({
                value: factory.id,
                label: factory.code + " - " + factory.name,
              }))}
            />
          </Col>
          <Col xs={12} md={4} lg={4}>
            <Segmented
              block
              value={groupBy}
              onChange={(value) => setGroupBy(String(value))}
              options={[
                { label: "Ngày", value: "day" },
                { label: "Tháng", value: "month" },
              ]}
            />
          </Col>
          <Col xs={12} md={3} lg={6} style={{ textAlign: "right" }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadCarbon}
              loading={loading}
            >
              Tải lại
            </Button>
          </Col>
        </Row>
      </Card>

      {summary?.warnings?.length ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="Thiếu hệ số phát thải"
          description={summary.warnings.join(" ")}
        />
      ) : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic
              title="Tổng phát thải"
              value={summary?.emissionsTon || 0}
              precision={2}
              suffix="tCO2e"
              valueStyle={{ color: "#047857" }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic
              title="Điện EVN"
              value={summary?.billedKwh || 0}
              formatter={(v) => compact.format(Number(v))}
              suffix="kWh"
              valueStyle={{ color: "#0f766e" }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic
              title="Hệ số bình quân"
              value={summary?.avgFactorKgCo2ePerKwh || 0}
              precision={4}
              suffix="kgCO2e/kWh"
              valueStyle={{ color: "#2563eb" }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic
              title="Điện nội bộ hạ thế"
              value={summary?.internalKwh || 0}
              formatter={(v) => compact.format(Number(v))}
              suffix="kWh"
              valueStyle={{ color: "#65a30d" }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            title="Xu hướng phát thải"
            loading={loading}
            extra={
              <Text type="secondary">
                {groupBy === "month" ? "Theo tháng" : "Theo ngày"}
              </Text>
            }
          >
            <TinyTrend rows={carbon?.byDate || []} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card
            title="Bảng hệ số phát thải"
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreate}
              >
                Thêm hệ số
              </Button>
            }
          >
            <Table
              rowKey="id"
              size="small"
              dataSource={factors}
              columns={factorColumns}
              pagination={false}
              scroll={{ x: 620 }}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Phát thải theo nhà máy" loading={loading}>
            <Table
              rowKey={(row) => row.factoryId || "none"}
              dataSource={carbon?.byFactory || []}
              columns={factoryColumns}
              pagination={false}
              scroll={{ x: 820 }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="Nhóm hạ thế tiêu thụ nhiều" loading={loading}>
            <Table
              rowKey={(row) => row.groupId || "none"}
              size="small"
              dataSource={(carbon?.byGroup || []).slice(0, 10)}
              columns={groupColumns}
              pagination={false}
              scroll={{ x: 560 }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="Đồng hồ hạ thế tiêu thụ nhiều" loading={loading}>
            <Table
              rowKey="meterId"
              size="small"
              dataSource={(carbon?.byMeter || []).slice(0, 12)}
              columns={meterColumns}
              pagination={false}
              scroll={{ x: 760 }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={editing ? "Sửa hệ số phát thải" : "Thêm hệ số phát thải"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={saveFactor}
        okButtonProps={{ loading: saving, icon: <SaveOutlined /> }}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item
                name="year"
                label="Năm áp dụng"
                rules={[{ required: true }]}
              >
                <InputNumber min={2000} max={2100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item
                name="factorKgCo2ePerKwh"
                label="Hệ số kgCO2e/kWh"
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={0}
                  step={0.0001}
                  precision={4}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="source" label="Nguồn hệ số">
            <Input placeholder="VD: Bộ TNMT, EVN, báo cáo kiểm kê..." />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Ngày hiệu lực">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            name="isActive"
            label="Đang áp dụng"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
