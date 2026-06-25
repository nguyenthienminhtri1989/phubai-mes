"use client";

import {
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { Dayjs } from "dayjs";
import type { FormInstance } from "antd";

const { Title, Text } = Typography;

type AnyRecord = {
  id: string;
  code?: string;
  name?: string;
  type?: string;
  price?: number;
  effectiveFrom?: string;
  recordDate?: string;
  prevTotal?: number;
  currTotal?: number;
  consTotal?: number;
  unitPrice?: number;
  costTotal?: number;
  dataSource?: string;
  totalEnergy?: number;
  timestamp?: string;
  isAuto?: boolean;
  gatewayIp?: string | null;
  gatewayPort?: number;
  modbusId?: number | null;
  tu?: number;
  ti?: number;
  capacityKva?: number | null;
  sortOrder?: number;
  transformer?: AnyRecord | null;
  group?: AnyRecord | null;
  meter?: AnyRecord | null;
  telemetry?: AnyRecord | null;
  [key: string]: unknown;
};

const money = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 2,
});

async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
  }

  return data;
}

export default function EnergyClient() {
  const [loading, setLoading] = useState(false);
  const [meters, setMeters] = useState<AnyRecord[]>([]);
  const [groups, setGroups] = useState<AnyRecord[]>([]);
  const [transformers, setTransformers] = useState<AnyRecord[]>([]);
  const [prices, setPrices] = useState<AnyRecord[]>([]);
  const [records, setRecords] = useState<AnyRecord[]>([]);
  const [telemetry, setTelemetry] = useState<AnyRecord[]>([]);
  const [realtimeMeterId, setRealtimeMeterId] = useState<string>();
  const [realtimeResult, setRealtimeResult] = useState<AnyRecord | null>(null);

  const [meterForm] = Form.useForm();
  const [transformerForm] = Form.useForm();
  const [groupForm] = Form.useForm();
  const [priceForm] = Form.useForm();
  const [recordForm] = Form.useForm();

  const meterOptions = useMemo(
    () => meters.map((meter) => ({ label: `${meter.code} - ${meter.name}`, value: meter.id })),
    [meters],
  );

  async function loadAll() {
    setLoading(true);
    try {
      const [nextMeters, nextGroups, nextTransformers, nextPrices, nextRecords, nextTelemetry] =
        (await Promise.all([
          fetchJson("/api/energy/meters"),
          fetchJson("/api/energy/groups"),
          fetchJson("/api/energy/transformers"),
          fetchJson("/api/energy/prices"),
          fetchJson("/api/energy/records"),
          fetchJson("/api/energy/telemetry?take=20"),
        ])) as [AnyRecord[], AnyRecord[], AnyRecord[], AnyRecord[], AnyRecord[], AnyRecord[]];
      setMeters(nextMeters);
      setGroups(nextGroups);
      setTransformers(nextTransformers);
      setPrices(nextPrices);
      setRecords(nextRecords);
      setTelemetry(nextTelemetry);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không tải được dữ liệu điện năng");
    } finally {
      setLoading(false);
    }
  }

  async function postForm(path: string, values: Record<string, unknown>, form: FormInstance) {
    await fetchJson(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    message.success("Đã lưu dữ liệu");
    form.resetFields();
    await loadAll();
  }

  async function readRealtime() {
    if (!realtimeMeterId) {
      message.warning("Chọn đồng hồ cần đọc realtime");
      return;
    }

    setLoading(true);
    setRealtimeResult(null);
    try {
      const data = await fetchJson("/api/energy/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meterId: realtimeMeterId }),
      });
      setRealtimeResult(data);
      message.success("Đã đọc đồng hồ và lưu telemetry");
      await loadAll();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không đọc được đồng hồ realtime");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAll();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const meterColumns = [
    { title: "Mã", dataIndex: "code", width: 120 },
    { title: "Tên đồng hồ", dataIndex: "name" },
    { title: "Trạm", render: (_: unknown, row: AnyRecord) => row.transformer?.name || "-" },
    { title: "Nhóm", render: (_: unknown, row: AnyRecord) => row.group?.name || "-" },
    { title: "Auto", dataIndex: "isAuto", render: (value: boolean) => (value ? "AUTO" : "MANUAL") },
    { title: "Gateway", render: (_: unknown, row: AnyRecord) => row.gatewayIp ? `${row.gatewayIp}:${row.gatewayPort}` : "-" },
    { title: "ID", dataIndex: "modbusId", width: 70 },
    { title: "TU/TI", render: (_: unknown, row: AnyRecord) => `${row.tu} / ${row.ti}` },
  ];

  const recordColumns = [
    { title: "Ngày", dataIndex: "recordDate", render: (value: string) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Đồng hồ", render: (_: unknown, row: AnyRecord) => `${row.meter?.code || ""} - ${row.meter?.name || ""}` },
    { title: "Nguồn", dataIndex: "dataSource" },
    { title: "Đầu", dataIndex: "prevTotal", align: "right" as const, render: (value: number) => number.format(value) },
    { title: "Cuối", dataIndex: "currTotal", align: "right" as const, render: (value: number) => number.format(value) },
    { title: "Tiêu thụ", dataIndex: "consTotal", align: "right" as const, render: (value: number) => number.format(value) },
    { title: "Giá", dataIndex: "unitPrice", align: "right" as const, render: (value: number) => money.format(value) },
    { title: "Thành tiền", dataIndex: "costTotal", align: "right" as const, render: (value: number) => money.format(value) },
  ];

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Space size={14}>
            <ThunderboltOutlined className="text-2xl text-amber-500" />
            <div>
              <Title level={3} className="!mb-0">PHUBAI-MES Điện năng</Title>
              <Text type="secondary">Module đầu tiên cho MES độc lập, port 3002</Text>
            </div>
          </Space>
          <Button icon={<DashboardOutlined />} onClick={loadAll} loading={loading}>Tải lại</Button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <Tabs
          defaultActiveKey="meters"
          items={[
            {
              key: "meters",
              label: "Đồng hồ",
              icon: <DatabaseOutlined />,
              children: (
                <Space direction="vertical" size={16} className="w-full">
                  <Card title="Thêm đồng hồ điện" size="small">
                    <Form form={meterForm} layout="vertical" onFinish={(values) => postForm("/api/energy/meters", values, meterForm)} initialValues={{ gatewayPort: 502, registerAddr: 0, tu: 1, ti: 1, isActive: true }}>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        <Form.Item name="code" label="Mã" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item name="name" label="Tên đồng hồ" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item name="transformerId" label="Trạm biến áp"><Select allowClear options={transformers.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item>
                        <Form.Item name="groupId" label="Nhóm"><Select allowClear options={groups.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item>
                        <Form.Item name="isAuto" label="AUTO" valuePropName="checked"><Switch /></Form.Item>
                        <Form.Item name="modbusId" label="Modbus ID"><InputNumber className="w-full" min={1} /></Form.Item>
                        <Form.Item name="gatewayIp" label="Gateway IP"><Input placeholder="192.168.1.10" /></Form.Item>
                        <Form.Item name="gatewayPort" label="Port"><InputNumber className="w-full" min={1} /></Form.Item>
                        <Form.Item name="registerAddr" label="Register"><InputNumber className="w-full" min={0} /></Form.Item>
                        <Form.Item name="tu" label="TU"><InputNumber className="w-full" min={0} step={0.01} /></Form.Item>
                        <Form.Item name="ti" label="TI"><InputNumber className="w-full" min={0} step={0.01} /></Form.Item>
                        <Form.Item name="meterNo" label="Số serial"><Input /></Form.Item>
                      </div>
                      <Button type="primary" htmlType="submit" loading={loading}>Lưu đồng hồ</Button>
                    </Form>
                  </Card>
                  <Table rowKey="id" size="small" loading={loading} dataSource={meters} columns={meterColumns} pagination={{ pageSize: 10 }} />
                </Space>
              ),
            },
            {
              key: "catalogs",
              label: "Trạm và nhóm",
              children: (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card title="Trạm biến áp" size="small">
                    <Form form={transformerForm} layout="vertical" onFinish={(values) => postForm("/api/energy/transformers", values, transformerForm)}>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Form.Item name="code" label="Mã" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item name="name" label="Tên trạm" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item name="capacityKva" label="Công suất kVA"><InputNumber className="w-full" min={0} /></Form.Item>
                        <Form.Item name="location" label="Vị trí"><Input /></Form.Item>
                      </div>
                      <Button type="primary" htmlType="submit">Lưu trạm</Button>
                    </Form>
                    <Table rowKey="id" className="mt-4" size="small" dataSource={transformers} columns={[{ title: "Mã", dataIndex: "code" }, { title: "Tên", dataIndex: "name" }, { title: "kVA", dataIndex: "capacityKva" }]} pagination={false} />
                  </Card>
                  <Card title="Nhóm đồng hồ" size="small">
                    <Form form={groupForm} layout="vertical" onFinish={(values) => postForm("/api/energy/groups", values, groupForm)}>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Form.Item name="code" label="Mã" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item name="name" label="Tên nhóm" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item name="sortOrder" label="Thứ tự"><InputNumber className="w-full" min={0} /></Form.Item>
                        <Form.Item name="description" label="Ghi chú"><Input /></Form.Item>
                      </div>
                      <Button type="primary" htmlType="submit">Lưu nhóm</Button>
                    </Form>
                    <Table rowKey="id" className="mt-4" size="small" dataSource={groups} columns={[{ title: "Mã", dataIndex: "code" }, { title: "Tên", dataIndex: "name" }, { title: "Thứ tự", dataIndex: "sortOrder" }]} pagination={false} />
                  </Card>
                </div>
              ),
            },
            {
              key: "prices",
              label: "Giá điện",
              icon: <DollarOutlined />,
              children: (
                <Card title="Giá điện áp dụng" size="small">
                  <Form form={priceForm} layout="vertical" onFinish={(values) => postForm("/api/energy/prices", values, priceForm)} initialValues={{ type: "NORMAL", effectiveFrom: dayjs() }}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <Form.Item name="type" label="Loại giá" rules={[{ required: true }]}><Input /></Form.Item>
                      <Form.Item name="price" label="Đơn giá" rules={[{ required: true }]}><InputNumber className="w-full" min={0} /></Form.Item>
                      <Form.Item name="effectiveFrom" label="Hiệu lực"><DatePicker className="w-full" /></Form.Item>
                      <Form.Item name="note" label="Ghi chú"><Input /></Form.Item>
                    </div>
                    <Button type="primary" htmlType="submit">Lưu giá</Button>
                  </Form>
                  <Table rowKey="id" className="mt-4" size="small" dataSource={prices} columns={[{ title: "Loại", dataIndex: "type" }, { title: "Giá", dataIndex: "price", render: (value: number) => money.format(value) }, { title: "Hiệu lực", dataIndex: "effectiveFrom", render: (value: string) => dayjs(value).format("DD/MM/YYYY") }]} pagination={false} />
                </Card>
              ),
            },
            {
              key: "manual",
              label: "Nhập MANUAL",
              children: (
                <Space direction="vertical" size={16} className="w-full">
                  <Card title="Nhập chỉ số điện thủ công" size="small">
                    <Form form={recordForm} layout="vertical" onFinish={(values) => { const recordDate = values.recordDate as Dayjs | undefined; return postForm("/api/energy/records", { ...values, recordDate: recordDate?.format("YYYY-MM-DD") }, recordForm); }} initialValues={{ recordDate: dayjs() }}>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                        <Form.Item name="recordDate" label="Ngày" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
                        <Form.Item name="meterId" label="Đồng hồ" rules={[{ required: true }]}><Select options={meterOptions} showSearch optionFilterProp="label" /></Form.Item>
                        <Form.Item name="prevTotal" label="Chỉ số đầu"><InputNumber className="w-full" min={0} /></Form.Item>
                        <Form.Item name="currTotal" label="Chỉ số cuối" rules={[{ required: true }]}><InputNumber className="w-full" min={0} /></Form.Item>
                        <Form.Item name="unitPrice" label="Đơn giá"><InputNumber className="w-full" min={0} /></Form.Item>
                      </div>
                      <Form.Item name="note" label="Ghi chú"><Input /></Form.Item>
                      <Button type="primary" htmlType="submit">Chốt MANUAL</Button>
                    </Form>
                  </Card>
                  <Table rowKey="id" size="small" dataSource={records} columns={recordColumns} pagination={{ pageSize: 10 }} />
                </Space>
              ),
            },
            {
              key: "realtime",
              label: "Realtime Modbus",
              icon: <ExperimentOutlined />,
              children: (
                <Space direction="vertical" size={16} className="w-full">
                  <Card title="Đọc trực tiếp đồng hồ Selec EM368" size="small">
                    <Space wrap>
                      <Select className="min-w-80" placeholder="Chọn đồng hồ AUTO" options={meterOptions} value={realtimeMeterId} onChange={setRealtimeMeterId} showSearch optionFilterProp="label" />
                      <Button type="primary" icon={<ThunderboltOutlined />} onClick={readRealtime} loading={loading}>Đọc realtime</Button>
                    </Space>
                    {realtimeResult ? (
                      <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4">
                        <Text strong>{realtimeResult.meter?.code}</Text>
                        <div>Chỉ số tổng: {number.format(Number(realtimeResult.telemetry?.totalEnergy ?? 0))} kWh</div>
                        <div>Thời điểm: {dayjs(realtimeResult.telemetry?.timestamp).format("DD/MM/YYYY HH:mm:ss")}</div>
                      </div>
                    ) : null}
                  </Card>
                  <Table rowKey="id" size="small" dataSource={telemetry} columns={[{ title: "Thời điểm", dataIndex: "timestamp", render: (value: string) => dayjs(value).format("DD/MM/YYYY HH:mm:ss") }, { title: "Đồng hồ", render: (_: unknown, row: AnyRecord) => `${row.meter?.code || ""} - ${row.meter?.name || ""}` }, { title: "Tổng kWh", dataIndex: "totalEnergy", align: "right" as const, render: (value: number) => number.format(value) }]} pagination={{ pageSize: 10 }} />
                </Space>
              ),
            },
            {
              key: "reports",
              label: "Báo cáo",
              children: <Table rowKey="id" size="small" loading={loading} dataSource={records} columns={recordColumns} pagination={{ pageSize: 20 }} />,
            },
          ]}
        />
      </div>
    </main>
  );
}
