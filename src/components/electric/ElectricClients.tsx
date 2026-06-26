"use client";

import {
  ApiOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
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
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MeterFace } from "./MeterFace";

function useRole() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  return {
    role,
    isAdmin: role === "ADMIN",
    canManageCatalog: role === "ADMIN" || role === "MANAGER",
    canEditDaily: role === "ADMIN" || role === "MANAGER" || role === "EDITOR",
  };
}

const { Text, Title } = Typography;

type Factory = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  location?: string | null;
  isActive: boolean;
  _count?: { transformers: number };
};

type Transformer = {
  id: string;
  code: string;
  name: string;
  factoryId?: string | null;
  factory?: Factory | null;
  location?: string | null;
  capacityKva?: number | null;
  isActive: boolean;
};

type MeterGroup = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
};

type ElectricMeter = {
  id: string;
  code: string;
  name: string;
  meterNo?: string | null;
  transformerId?: string | null;
  groupId?: string | null;
  isActive: boolean;
  type: number; // 1: Hạ thế, 2: Trung thế
  isAuto: boolean;
  modbusId?: number | null;
  gatewayIp?: string | null;
  gatewayPort: number;
  registerAddr: number;
  tu: number;
  ti: number;
  note?: string | null;
  group?: MeterGroup | null;
  transformer?: Transformer | null;
  todayRecord?: PowerRecord | null;
};

type ElectricityPrice = {
  id: string;
  type: string;
  name: string;
  price: number;
  description?: string | null;
  effectiveFrom: string;
  note?: string | null;
};

type PowerRecord = {
  id: string;
  recordDate: string;
  meterId: string;
  dataSource: "AUTO" | "MANUAL";
  prevTotal: number;
  currTotal: number;
  consTotal: number;
  prevNormal?: number | null;
  currNormal?: number | null;
  consNormal?: number | null;
  prevPeak?: number | null;
  currPeak?: number | null;
  consPeak?: number | null;
  prevOffPeak?: number | null;
  currOffPeak?: number | null;
  consOffPeak?: number | null;
  unitPrice: number;
  costTotal: number;
  isReset: boolean;
  note?: string | null;
  meter?: ElectricMeter;
};

type Telemetry = {
  id: string;
  meterId: string;
  totalEnergy: number;
  voltage?: number | null;
  current?: number | null;
  power?: number | null;
  powerFactor?: number | null;
  timestamp: string;
  meter?: ElectricMeter;
};

type EnergyType = {
  id: string;
  code: string;
  name: string;
  note?: string | null;
  isActive: boolean;
};

type LiveData = {
  timestamp: string;
  totalEnergy: number;
  voltage?: number | null;
  current?: number | null;
  power?: number | null;
  pf?: number | null;
  meter?: ElectricMeter;
};

type ReportData = {
  summary: {
    totalConsumption: number;
    totalCost: number;
    totalNormal: number;
    totalPeak: number;
    totalOffPeak: number;
    avgPerDay: number;
    daysWithData: number;
  };
  byMeter: Array<{
    meterId: string;
    meterCode: string;
    meterName: string;
    factoryName?: string;
    groupName: string;
    substationName: string;
    consTotal: number;
    costTotal: number;
  }>;
  byFactory?: Array<{
    factoryId: string | null;
    factoryCode: string;
    factoryName: string;
    consTotal: number;
    costTotal: number;
  }>;
};

const fmtNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || data?.message || "HTTP " + response.status);
  }

  return data as T;
}

function postBody(method: "POST" | "PUT" | "DELETE", body: object): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa đủ dữ liệu để vẽ biểu đồ" />;
  }

  const width = 560;
  const height = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (width - 16) + 8;
    const y = height - 12 - ((value - min) / range) * (height - 24);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPoints = `8,${height - 12} ${points.join(" ")} ${width - 8},${height - 12}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <polygon points={areaPoints} fill="#faad14" opacity={0.12} />
      <polyline points={points.join(" ")} fill="none" stroke="#faad14" strokeWidth={2} />
      {points.map((point, index) => {
        const [x, y] = point.split(",");
        return <circle key={index} cx={x} cy={y} r={index === points.length - 1 ? 3.5 : 2} fill="#faad14" />;
      })}
    </svg>
  );
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Title level={3} style={{ margin: 0 }}>{title}</Title>
      <Text type="secondary">{subtitle}</Text>
    </div>
  );
}

export function ElectricCatalogClient() {
  const { canManageCatalog } = useRole();
  const [loading, setLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [groups, setGroups] = useState<MeterGroup[]>([]);
  const [energyTypes, setEnergyTypes] = useState<EnergyType[]>([]);
  const [factoryModalOpen, setFactoryModalOpen] = useState(false);
  const [transformerModalOpen, setTransformerModalOpen] = useState(false);
  const [meterModalOpen, setMeterModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [energyTypeModalOpen, setEnergyTypeModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);
  const [editingTransformer, setEditingTransformer] = useState<Transformer | null>(null);
  const [editingMeter, setEditingMeter] = useState<ElectricMeter | null>(null);
  const [editingGroup, setEditingGroup] = useState<MeterGroup | null>(null);
  const [editingEnergyType, setEditingEnergyType] = useState<EnergyType | null>(null);
  const [meterFilterFactory, setMeterFilterFactory] = useState<string>();
  const [meterFilterTransformer, setMeterFilterTransformer] = useState<string>();
  const [formFactory] = Form.useForm();
  const [formTransformer] = Form.useForm();
  const [formMeter] = Form.useForm();
  const [formGroup] = Form.useForm();
  const [formEnergyType] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextFactories, nextTransformers, nextMeters, nextGroups, nextEnergyTypes] = await Promise.all([
        fetchJson<Factory[]>("/api/electric/factories"),
        fetchJson<Transformer[]>("/api/electric/substations"),
        fetchJson<ElectricMeter[]>("/api/electric/meters"),
        fetchJson<MeterGroup[]>("/api/electric/meter-groups"),
        fetchJson<EnergyType[]>("/api/electric/energy-types"),
      ]);
      setFactories(nextFactories);
      setTransformers(nextTransformers);
      setMeters(nextMeters);
      setGroups(nextGroups);
      setEnergyTypes(nextEnergyTypes);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không tải được danh mục điện năng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const deleteRecord = async (url: string, id: string) => {
    await fetchJson(url, postBody("DELETE", { id }));
    message.success("Đã cập nhật trạng thái danh mục");
    await load();
  };

  const openFactory = (record?: Factory) => {
    setEditingFactory(record || null);
    formFactory.resetFields();
    formFactory.setFieldsValue(record || { isActive: true });
    setFactoryModalOpen(true);
  };

  const openTransformer = (record?: Transformer) => {
    setEditingTransformer(record || null);
    formTransformer.resetFields();
    formTransformer.setFieldsValue(record || { isActive: true });
    setTransformerModalOpen(true);
  };

  const openMeter = (record?: ElectricMeter) => {
    setEditingMeter(record || null);
    formMeter.resetFields();
    formMeter.setFieldsValue(record || { isActive: true, type: 1, isAuto: false, gatewayPort: 502, registerAddr: 0, tu: 1, ti: 1 });
    setMeterModalOpen(true);
  };

  const openGroup = (record?: MeterGroup) => {
    setEditingGroup(record || null);
    formGroup.resetFields();
    formGroup.setFieldsValue(record || { isActive: true, sortOrder: 0 });
    setGroupModalOpen(true);
  };

  const openEnergyType = (record?: EnergyType) => {
    setEditingEnergyType(record || null);
    formEnergyType.resetFields();
    formEnergyType.setFieldsValue(record || { isActive: true });
    setEnergyTypeModalOpen(true);
  };

  const saveFactory = async (values: Record<string, unknown>) => {
    await fetchJson<Factory>("/api/electric/factories", postBody(editingFactory ? "PUT" : "POST", { ...values, id: editingFactory?.id }));
    message.success("Đã lưu nhà máy");
    setFactoryModalOpen(false);
    await load();
  };

  const saveTransformer = async (values: Record<string, unknown>) => {
    await fetchJson<Transformer>("/api/electric/substations", postBody(editingTransformer ? "PUT" : "POST", { ...values, id: editingTransformer?.id }));
    message.success("Đã lưu trạm biến áp");
    setTransformerModalOpen(false);
    await load();
  };

  const saveMeter = async (values: Record<string, unknown>) => {
    await fetchJson<ElectricMeter>("/api/electric/meters", postBody(editingMeter ? "PUT" : "POST", { ...values, id: editingMeter?.id }));
    message.success("Đã lưu đồng hồ điện");
    setMeterModalOpen(false);
    await load();
  };

  const saveGroup = async (values: Record<string, unknown>) => {
    await fetchJson<MeterGroup>("/api/electric/meter-groups", postBody(editingGroup ? "PUT" : "POST", { ...values, id: editingGroup?.id }));
    message.success("Đã lưu nhóm đồng hồ");
    setGroupModalOpen(false);
    await load();
  };

  const saveEnergyType = async (values: Record<string, unknown>) => {
    await fetchJson<EnergyType>("/api/electric/energy-types", postBody(editingEnergyType ? "PUT" : "POST", { ...values, id: editingEnergyType?.id }));
    message.success("Đã lưu loại điện năng");
    setEnergyTypeModalOpen(false);
    await load();
  };

  const filteredTransformers = useMemo(
    () => transformers.filter((item) => !meterFilterFactory || item.factoryId === meterFilterFactory),
    [transformers, meterFilterFactory],
  );

  const filteredMeters = useMemo(
    () => meters.filter((meter) => {
      if (meterFilterTransformer && meter.transformerId !== meterFilterTransformer) return false;
      return !meterFilterFactory || meter.transformer?.factoryId === meterFilterFactory;
    }),
    [meters, meterFilterFactory, meterFilterTransformer],
  );

  const meterColumns: ColumnsType<ElectricMeter> = [
    { title: "Mã", dataIndex: "code", width: 110, render: (value: string) => <b>{value}</b> },
    { title: "Tên đồng hồ", dataIndex: "name" },
    { title: "Mô tả", dataIndex: "note", render: (value?: string | null) => value || <Text type="secondary">---</Text> },
    { title: "Loại", dataIndex: "type", render: (value: number) => value === 2 ? <Tag color="purple">Trung thế</Tag> : <Tag color="blue">Hạ thế</Tag> },
    {
      title: "Chế độ",
      dataIndex: "isAuto",
      render: (isAuto: boolean, record) => isAuto ? (
        <div>
          <Tag color="green">AUTO</Tag>
          <Text type="secondary">{record.gatewayIp}:{record.gatewayPort} / ID {record.modbusId}</Text>
        </div>
      ) : <Tag color="gold">MANUAL</Tag>,
    },
    { title: "TU/TI", render: (_, record) => String(record.tu) + " / " + String(record.ti) },
    { title: "Nhà máy", render: (_, record) => record.transformer?.factory?.name || "---" },
    { title: "Trạm", render: (_, record) => record.transformer?.name || "---" },
    { title: "Nhóm", render: (_, record) => record.group?.name || "---" },
    {
      title: "Thao tác",
      width: 110,
      render: (_, record) => canManageCatalog ? (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openMeter(record)} />
          <Popconfirm title="Xóa hoặc ngưng dùng đồng hồ này?" onConfirm={() => deleteRecord("/api/electric/meters", record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) : null,
    },
  ];

  return (
    <>
      <PageTitle title="Danh mục điện năng" subtitle="Quản lý nhà máy, trạm biến áp, đồng hồ, nhóm đồng hồ và loại điện năng." />
      <Card>
        <Tabs
          items={[
            {
              key: "factories",
              label: "Nhà máy",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && <Button type="primary" icon={<PlusOutlined />} onClick={() => openFactory()}>Thêm nhà máy</Button>}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={factories}
                    pagination={false}
                    columns={[
                      { title: "Mã", dataIndex: "code", render: (value: string) => <b>{value}</b> },
                      { title: "Tên nhà máy", dataIndex: "name" },
                      { title: "Vị trí", dataIndex: "location" },
                      { title: "Số trạm", render: (_: unknown, record: Factory) => record._count?.transformers ?? 0 },
                      { title: "Trạng thái", dataIndex: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "Đang dùng" : "Ngưng"}</Tag> },
                      {
                        title: "Thao tác",
                        render: (_: unknown, record: Factory) => canManageCatalog ? (
                          <Space>
                            <Button size="small" icon={<EditOutlined />} onClick={() => openFactory(record)} />
                            <Popconfirm title="Xóa hoặc ngưng dùng nhà máy này?" onConfirm={() => deleteRecord("/api/electric/factories", record.id)}>
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        ) : null,
                      },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: "transformers",
              label: "Trạm biến áp",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && <Button type="primary" icon={<PlusOutlined />} onClick={() => openTransformer()}>Thêm trạm biến áp</Button>}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={transformers}
                    columns={[
                      { title: "Mã trạm", dataIndex: "code", render: (value: string) => <b>{value}</b> },
                      { title: "Tên trạm", dataIndex: "name" },
                      { title: "Nhà máy", render: (_: unknown, record: Transformer) => record.factory?.name || "---" },
                      { title: "Vị trí", dataIndex: "location" },
                      { title: "kVA", dataIndex: "capacityKva" },
                      {
                        title: "Thao tác",
                        render: (_: unknown, record: Transformer) => canManageCatalog ? (
                          <Space>
                            <Button size="small" icon={<EditOutlined />} onClick={() => openTransformer(record)} />
                            <Popconfirm title="Xóa hoặc ngưng dùng trạm này?" onConfirm={() => deleteRecord("/api/electric/substations", record.id)}>
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        ) : null,
                      },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: "meters",
              label: "Đồng hồ điện",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Row gutter={[8, 8]} justify="space-between">
                    <Col>
                      <Space wrap>
                        <Select allowClear placeholder="Lọc theo nhà máy" style={{ width: 190 }} value={meterFilterFactory} onChange={(value) => { setMeterFilterFactory(value); setMeterFilterTransformer(undefined); }} options={factories.map((factory) => ({ label: factory.name, value: factory.id }))} />
                        <Select allowClear placeholder="Lọc theo trạm biến áp" style={{ width: 220 }} value={meterFilterTransformer} onChange={setMeterFilterTransformer} disabled={!meterFilterFactory} options={filteredTransformers.map((transformer) => ({ label: transformer.name, value: transformer.id }))} />
                      </Space>
                    </Col>
                    <Col>{canManageCatalog && <Button type="primary" icon={<PlusOutlined />} onClick={() => openMeter()}>Thêm đồng hồ</Button>}</Col>
                  </Row>
                  <Table rowKey="id" loading={loading} dataSource={filteredMeters} columns={meterColumns} scroll={{ x: 980 }} />
                </Space>
              ),
            },
            {
              key: "groups",
              label: "Nhóm đồng hồ",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && <Button type="primary" icon={<PlusOutlined />} onClick={() => openGroup()}>Thêm nhóm đồng hồ</Button>}
                  <Table rowKey="id" loading={loading} dataSource={groups} columns={[
                    { title: "Mã nhóm", dataIndex: "code", render: (value: string) => <b>{value}</b> },
                    { title: "Tên nhóm", dataIndex: "name" },
                    { title: "Mô tả", dataIndex: "description" },
                    { title: "Thứ tự", dataIndex: "sortOrder", width: 100 },
                    { title: "Thao tác", render: (_: unknown, record: MeterGroup) => canManageCatalog ? <Space><Button size="small" icon={<EditOutlined />} onClick={() => openGroup(record)} /><Popconfirm title="Xóa hoặc ngưng dùng nhóm này?" onConfirm={() => deleteRecord("/api/electric/meter-groups", record.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> : null },
                  ]} />
                </Space>
              ),
            },
            {
              key: "energyTypes",
              label: "Loại điện năng",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEnergyType()}>Thêm loại điện năng</Button>}
                  <Table rowKey="id" loading={loading} dataSource={energyTypes} pagination={false} columns={[
                    { title: "Mã", dataIndex: "code", render: (value: string) => <b>{value}</b> },
                    { title: "Tên loại", dataIndex: "name" },
                    { title: "Ghi chú", dataIndex: "note" },
                    { title: "Trạng thái", dataIndex: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "Đang dùng" : "Ngưng"}</Tag> },
                    { title: "Thao tác", render: (_: unknown, record: EnergyType) => canManageCatalog ? <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEnergyType(record)} /><Popconfirm title="Xóa loại điện năng này?" onConfirm={() => deleteRecord("/api/electric/energy-types", record.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> : null },
                  ]} />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal title={editingFactory ? "Sửa nhà máy" : "Thêm nhà máy"} open={factoryModalOpen} onCancel={() => setFactoryModalOpen(false)} onOk={() => formFactory.submit()}>
        <Form form={formFactory} layout="vertical" onFinish={saveFactory}><Form.Item name="code" label="Mã nhà máy" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="name" label="Tên nhà máy" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="location" label="Vị trí"><Input /></Form.Item><Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item><Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item></Form>
      </Modal>
      <Modal title={editingTransformer ? "Sửa trạm biến áp" : "Thêm trạm biến áp"} open={transformerModalOpen} onCancel={() => setTransformerModalOpen(false)} onOk={() => formTransformer.submit()}>
        <Form form={formTransformer} layout="vertical" onFinish={saveTransformer}><Form.Item name="factoryId" label="Nhà máy" rules={[{ required: true }]}><Select options={factories.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item><Form.Item name="code" label="Mã trạm" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="name" label="Tên trạm" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="capacityKva" label="Công suất kVA"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item name="location" label="Vị trí"><Input /></Form.Item><Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item></Form>
      </Modal>
      <Modal title={editingGroup ? "Sửa nhóm đồng hồ" : "Thêm nhóm đồng hồ"} open={groupModalOpen} onCancel={() => setGroupModalOpen(false)} onOk={() => formGroup.submit()}>
        <Form form={formGroup} layout="vertical" onFinish={saveGroup}><Form.Item name="code" label="Mã nhóm" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="name" label="Tên nhóm" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="sortOrder" label="Thứ tự"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item><Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item></Form>
      </Modal>
      <Modal title={editingEnergyType ? "Sửa loại điện năng" : "Thêm loại điện năng"} open={energyTypeModalOpen} onCancel={() => setEnergyTypeModalOpen(false)} onOk={() => formEnergyType.submit()}>
        <Form form={formEnergyType} layout="vertical" onFinish={saveEnergyType}><Form.Item name="code" label="Mã loại điện" rules={[{ required: true }]}><Input disabled={!!editingEnergyType} /></Form.Item><Form.Item name="name" label="Tên loại điện" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item><Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item></Form>
      </Modal>
      <Modal title={editingMeter ? "Sửa đồng hồ điện" : "Thêm đồng hồ điện"} open={meterModalOpen} width={760} onCancel={() => setMeterModalOpen(false)} onOk={() => formMeter.submit()}>
        <Form form={formMeter} layout="vertical" onFinish={saveMeter}>
          <Row gutter={12}><Col xs={24} md={8}><Form.Item name="code" label="Mã đồng hồ" rules={[{ required: true }]}><Input /></Form.Item></Col><Col xs={24} md={16}><Form.Item name="name" label="Tên đồng hồ" rules={[{ required: true }]}><Input /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="transformerId" label="Trạm biến áp" rules={[{ required: true }]}><Select allowClear options={transformers.map((item) => ({ label: item.factory ? item.factory.name + " - " + item.name : item.name, value: item.id }))} /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="groupId" label="Nhóm đồng hồ"><Select allowClear options={groups.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="type" label="Loại đồng hồ" rules={[{ required: true }]}><Select options={[{ label: "Hạ thế (1 chỉ số)", value: 1 }, { label: "Trung thế (3 chỉ số)", value: 2 }]} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="tu" label="TU" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="ti" label="TI" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="meterNo" label="Số serial"><Input /></Form.Item></Col></Row>
          <Card size="small" title="Cấu hình thu thập tự động qua Gateway" style={{ marginBottom: 16 }}><Form.Item name="isAuto" label="Chế độ lấy số" valuePropName="checked"><Switch checkedChildren="AUTO" unCheckedChildren="MANUAL" /></Form.Item><Form.Item noStyle shouldUpdate={(prev, next) => prev.isAuto !== next.isAuto}>{({ getFieldValue }) => getFieldValue("isAuto") ? <Row gutter={12}><Col xs={24} md={10}><Form.Item name="gatewayIp" label="Gateway IP" rules={[{ required: true }]}><Input placeholder="192.168.1.253" /></Form.Item></Col><Col xs={24} md={7}><Form.Item name="gatewayPort" label="Gateway Port" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={7}><Form.Item name="modbusId" label="Slave ID" rules={[{ required: true }]}><InputNumber min={1} max={255} style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={7}><Form.Item name="registerAddr" label="Register Active Energy"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col></Row> : null}</Form.Item></Card>
          <Form.Item name="note" label="Mô tả / khu vực đo"><Input.TextArea rows={2} /></Form.Item><Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ElectricDailyInputClient() {
  const { canEditDaily } = useRole();
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs().subtract(1, "day"));
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [selectedTransformer, setSelectedTransformer] = useState<string>();
  const [currentMeter, setCurrentMeter] = useState<ElectricMeter | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { fetchJson<Transformer[]>("/api/electric/substations").then(setTransformers).catch(() => message.error("Không tải được trạm biến áp")); }, []);

  const loadMeters = useCallback(async () => {
    if (!selectedTransformer) return;
    setLoading(true);
    try { setMeters(await fetchJson<ElectricMeter[]>("/api/electric/daily-status?substationId=" + selectedTransformer + "&date=" + selectedDate.format("YYYY-MM-DD"))); }
    catch (error) { message.error(error instanceof Error ? error.message : "Không tải được trạng thái chốt số"); }
    finally { setLoading(false); }
  }, [selectedDate, selectedTransformer]);

  useEffect(() => { const timer = window.setTimeout(() => void loadMeters(), 0); return () => window.clearTimeout(timer); }, [loadMeters]);

  const openRecord = async (meter: ElectricMeter) => {
    setCurrentMeter(meter); form.resetFields();
    const lastRecord = await fetchJson<PowerRecord | null>("/api/electric/last-record?meterId=" + meter.id + "&date=" + selectedDate.format("YYYY-MM-DD"));
    if (meter.type === 2) {
      form.setFieldsValue({
        meterId: meter.id,
        currNormal: meter.todayRecord?.currNormal ?? undefined,
        currPeak: meter.todayRecord?.currPeak ?? undefined,
        currOffPeak: meter.todayRecord?.currOffPeak ?? undefined,
        note: meter.todayRecord?.note ?? undefined,
      });
    } else {
      form.setFieldsValue({ meterId: meter.id, prevTotal: meter.todayRecord?.prevTotal ?? lastRecord?.currTotal ?? 0, currTotal: meter.todayRecord?.currTotal ?? undefined, unitPrice: meter.todayRecord?.unitPrice ?? undefined, isReset: meter.todayRecord?.isReset ?? false, note: meter.todayRecord?.note ?? undefined });
    }
    setModalOpen(true);
  };

  const saveRecord = async () => {
    const values = await form.validateFields();
    if (currentMeter?.type !== 2 && !values.isReset && Number(values.currTotal || 0) < Number(values.prevTotal || 0)) { message.error("Chỉ số sau nhỏ hơn chỉ số trước. Bật reset nếu đã thay đồng hồ."); return; }
    await fetchJson("/api/electric/daily-input", postBody("POST", { ...values, recordDate: selectedDate.format("YYYY-MM-DD") }));
    message.success("Đã chốt chỉ số MANUAL"); setModalOpen(false); await loadMeters();
  };

  return <><PageTitle title="Nhập chỉ số điện" subtitle="Chốt chỉ số thủ công MANUAL và theo dõi bản ghi AUTO đã chốt trong ngày." /><Row gutter={[12,12]} style={{ marginBottom: 16 }}><Col xs={24} md={8}><DatePicker value={selectedDate} onChange={(value) => value && setSelectedDate(value)} style={{ width: "100%" }} /></Col><Col xs={24} md={10}><Select placeholder="Chọn trạm biến áp" value={selectedTransformer} onChange={setSelectedTransformer} options={transformers.map((item) => ({ label: item.factory ? item.factory.name + " - " + item.name : item.name, value: item.id }))} style={{ width: "100%" }} /></Col><Col xs={24} md={6}><Button icon={<ReloadOutlined />} onClick={loadMeters} loading={loading} block>Tải dữ liệu</Button></Col></Row><Row gutter={[12,12]} style={{ marginBottom: 16 }}><Col xs={24} md={8}><Card><Statistic title="Tiến độ chốt" value={meters.filter((meter) => meter.todayRecord).length} suffix={"/ " + meters.length + " đồng hồ"} /></Card></Col></Row>{!selectedTransformer ? <Card><Empty description="Chọn trạm biến áp để nhập/chốt chỉ số" /></Card> : <Table rowKey="id" loading={loading} dataSource={meters} columns={[{ title: "Mã", dataIndex: "code", render: (value: string) => <b>{value}</b> }, { title: "Tên đồng hồ", dataIndex: "name" }, { title: "Loại", dataIndex: "type", render: (value: number) => value === 2 ? <Tag color="purple">Trung thế</Tag> : <Tag color="blue">Hạ thế</Tag> }, { title: "Chế độ", dataIndex: "isAuto", render: (value: boolean) => <Tag color={value ? "green" : "gold"}>{value ? "AUTO" : "MANUAL"}</Tag> }, { title: "Trạng thái", render: (_: unknown, record: ElectricMeter) => record.todayRecord ? <Tag color={record.todayRecord.dataSource === "AUTO" ? "green" : "orange"}>{record.todayRecord.dataSource}</Tag> : <Tag>Chưa chốt</Tag> }, { title: "Tiêu thụ", render: (_: unknown, record: ElectricMeter) => record.todayRecord ? fmtNumber.format(record.todayRecord.consTotal) + " kWh" : "---" }, { title: "Thao tác", render: (_: unknown, record: ElectricMeter) => canEditDaily ? <Button icon={<EditOutlined />} onClick={() => openRecord(record)}>Nhập MANUAL</Button> : null }]} />}<Modal title={"Chốt chỉ số: " + (currentMeter?.code || "")} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={saveRecord} okText="Lưu MANUAL"><Form form={form} layout="vertical"><Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Đồng hồ AUTO chỉ nên nhập tay khi gateway hoặc telemetry gặp sự cố." /><Form.Item name="meterId" hidden><Input /></Form.Item>{currentMeter?.type === 2 ? <><Alert type="info" showIcon style={{ marginBottom: 12 }} message="Đồng hồ trung thế: nhập 3 chỉ số hiển thị trên mặt đồng hồ điện tử, hệ thống tự tính tiêu thụ và tiền điện theo từng khung giờ." /><Row gutter={12}><Col span={8}><Form.Item name="currNormal" label="Chỉ số Bình thường" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col><Col span={8}><Form.Item name="currPeak" label="Chỉ số Cao điểm" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col><Col span={8}><Form.Item name="currOffPeak" label="Chỉ số Thấp điểm" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col></Row></> : <><Form.Item name="isReset" label="Reset / thay đồng hồ" valuePropName="checked"><Switch /></Form.Item><Row gutter={12}><Col span={12}><Form.Item name="prevTotal" label="Chỉ số trước"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col><Col span={12}><Form.Item name="currTotal" label="Chỉ số sau" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col><Col span={12}><Form.Item name="unitPrice" label="Đơn giá"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col></Row></>}<Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item></Form></Modal></>;
}

export function ElectricLiveClient() {
  const { canEditDaily } = useRole();
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [selectedMeter, setSelectedMeter] = useState<string>();
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchJson<ElectricMeter[]>("/api/electric/meters")
      .then((data) => setMeters(data.filter((meter) => meter.isAuto)))
      .catch(() => message.error("Không tải được đồng hồ AUTO"));
  }, []);

  const meter = meters.find((item) => item.id === selectedMeter);

  const loadHistory = useCallback(async (meterId: string) => {
    setHistoryLoading(true);
    try {
      const data = await fetchJson<Telemetry[]>("/api/energy/telemetry?meterId=" + meterId + "&take=20");
      setHistory(data.slice().reverse());
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const selectMeter = (meterId: string) => {
    setSelectedMeter(meterId);
    setLiveData(null);
    void loadHistory(meterId);
  };

  const readLive = async () => {
    if (!selectedMeter) { message.warning("Chọn đồng hồ AUTO cần đọc"); return; }
    setLoading(true);
    try {
      const data = await fetchJson<LiveData>("/api/electric/live?meterId=" + selectedMeter);
      setLiveData(data);
      message.success("Đã đọc realtime và lưu telemetry");
      void loadHistory(selectedMeter);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không đọc được realtime");
    } finally {
      setLoading(false);
    }
  };

  const displayValue = liveData?.totalEnergy ?? history[history.length - 1]?.totalEnergy ?? 0;

  return (
    <>
      <PageTitle title="Realtime điện năng" subtitle="Đọc trực tiếp đồng hồ AUTO qua Modbus Gateway và lưu PowerTelemetry." />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size={12}>
          <Select
            placeholder="Chọn đồng hồ AUTO"
            style={{ minWidth: 340 }}
            value={selectedMeter}
            onChange={selectMeter}
            options={meters.map((item) => ({ label: item.code + " - " + item.name, value: item.id }))}
          />
          {canEditDaily && (
            <Button type="primary" icon={<ThunderboltOutlined />} loading={loading} onClick={readLive} disabled={!selectedMeter}>
              Đọc realtime
            </Button>
          )}
        </Space>
      </Card>

      {!selectedMeter ? (
        <Card><Empty description="Chọn một đồng hồ AUTO để xem mặt đồng hồ realtime" /></Card>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card style={{ background: "#0d1117", borderColor: "#0d1117" }} styles={{ body: { padding: 20 } }}>
              <MeterFace value={displayValue} online={!!liveData} label={(meter?.code || "") + " · " + (meter?.name || "")} />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Card>
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic title="Tổng kWh hiện tại" value={displayValue} precision={2} suffix="kWh" valueStyle={{ color: "#389e0d" }} />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Lần đọc gần nhất"
                      value={liveData ? dayjs(liveData.timestamp).format("HH:mm:ss") : history[history.length - 1] ? dayjs(history[history.length - 1].timestamp).format("HH:mm:ss") : "---"}
                    />
                  </Col>
                </Row>
                {liveData ? (
                  <Text type="secondary">Đã đọc lúc {dayjs(liveData.timestamp).format("DD/MM/YYYY HH:mm:ss")} — dữ liệu chỉ dùng realtime/biểu đồ, không dùng trực tiếp để tính tiền điện.</Text>
                ) : (
                  <Text type="secondary">Bấm &quot;Đọc realtime&quot; để lấy chỉ số mới nhất qua Gateway, hoặc xem lịch sử telemetry tự động bên dưới.</Text>
                )}
              </Card>
              <Card title="Xu hướng kWh gần đây" loading={historyLoading}>
                <Sparkline values={history.map((item) => item.totalEnergy)} />
              </Card>
              <Card size="small" title="Thông tin đồng hồ">
                <Space direction="vertical" size={4}>
                  <Text>Gateway: <b>{meter?.gatewayIp}:{meter?.gatewayPort}</b> — Slave ID <b>{meter?.modbusId}</b></Text>
                  <Text>Nhà máy: {meter?.transformer?.factory?.name || "---"} — Trạm: {meter?.transformer?.name || "---"}</Text>
                  <Text>TU/TI: {meter?.tu} / {meter?.ti}</Text>
                </Space>
              </Card>
            </Space>
          </Col>
        </Row>
      )}
    </>
  );
}

export function ElectricPricesClient() {
  const { canManageCatalog } = useRole();
  const [prices, setPrices] = useState<ElectricityPrice[]>([]); const [editing, setEditing] = useState<ElectricityPrice | null>(null); const [modalOpen, setModalOpen] = useState(false); const [loading, setLoading] = useState(false); const [form] = Form.useForm();
  const load = useCallback(async () => { setLoading(true); try { setPrices(await fetchJson<ElectricityPrice[]>("/api/electric/prices")); } catch (error) { message.error(error instanceof Error ? error.message : "Không tải được đơn giá điện"); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const priceTypeOptions = [
    { label: "Bình thường (NORMAL)", value: "NORMAL" },
    { label: "Cao điểm (PEAK)", value: "PEAK" },
    { label: "Thấp điểm (OFF_PEAK)", value: "OFF_PEAK" },
  ];
  const priceTypeName: Record<string, string> = { NORMAL: "Bình thường", PEAK: "Cao điểm", OFF_PEAK: "Thấp điểm" };
  const openPrice = (record?: ElectricityPrice) => { setEditing(record || null); form.resetFields(); form.setFieldsValue(record ? { ...record, effectiveFrom: dayjs(record.effectiveFrom) } : { type: "NORMAL", name: priceTypeName.NORMAL, effectiveFrom: dayjs() }); setModalOpen(true); };
  const savePrice = async (values: { type: string; name: string; price: number; description?: string; effectiveFrom?: Dayjs; note?: string }) => { await fetchJson("/api/electric/prices", postBody(editing ? "PUT" : "POST", { ...values, effectiveFrom: values.effectiveFrom?.toISOString() })); message.success("Đã lưu đơn giá điện"); setModalOpen(false); await load(); };
  return <><PageTitle title="Đơn giá điện" subtitle="Quản lý 3 khung giá Bình thường/Cao điểm/Thấp điểm dùng khi chốt PowerRecord." /><Card extra={canManageCatalog && <Button type="primary" icon={<PlusOutlined />} onClick={() => openPrice()}>Thêm/Cập nhật giá</Button>}><Table rowKey="id" loading={loading} dataSource={prices} columns={[{ title: "Loại giá", dataIndex: "type", render: (value: string) => <Tag color={value === "NORMAL" ? "blue" : value === "PEAK" ? "red" : "green"}>{value}</Tag> }, { title: "Tên hiển thị", dataIndex: "name" }, { title: "Đơn giá", dataIndex: "price", align: "right", render: (value: number) => <b>{fmtMoney.format(value)} VNĐ/kWh</b> }, { title: "Khung giờ / Mô tả", dataIndex: "description" }, { title: "Hiệu lực", dataIndex: "effectiveFrom", render: (value: string) => dayjs(value).format("DD/MM/YYYY") }, { title: "Ghi chú", dataIndex: "note" }, { title: "Thao tác", render: (_: unknown, record: ElectricityPrice) => canManageCatalog ? <Button icon={<EditOutlined />} onClick={() => openPrice(record)}>Cập nhật</Button> : null }]} /></Card><Modal title={editing ? "Cập nhật đơn giá" : "Thêm đơn giá"} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}><Form form={form} layout="vertical" onFinish={savePrice}><Form.Item name="type" label="Loại giá" rules={[{ required: true }]}><Select disabled={!!editing} options={priceTypeOptions} onChange={(value) => form.setFieldsValue({ name: priceTypeName[value] })} /></Form.Item><Form.Item name="name" label="Tên hiển thị" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="price" label="Đơn giá VNĐ/kWh" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item name="description" label="Khung giờ / Mô tả"><Input placeholder="Vd: 04:00-09:30, 11:30-17:00, 20:00-22:00" /></Form.Item><Form.Item name="effectiveFrom" label="Ngày hiệu lực"><DatePicker style={{ width: "100%" }} /></Form.Item><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item></Form></Modal></>;
}

export function ElectricReportsClient() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]); const [report, setReport] = useState<ReportData | null>(null); const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const url = "/api/electric/reports?startDate=" + range[0].format("YYYY-MM-DD") + "&endDate=" + range[1].format("YYYY-MM-DD"); setReport(await fetchJson<ReportData>(url)); } catch (error) { message.error(error instanceof Error ? error.message : "Không tải được báo cáo điện năng"); } finally { setLoading(false); } }, [range]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return <><PageTitle title="Báo cáo điện năng" subtitle="Tổng hợp PowerRecord theo nhà máy, trạm, đồng hồ và nhóm đồng hồ." /><Space wrap style={{ marginBottom: 16 }}><DatePicker.RangePicker value={range} onChange={(value) => value && setRange(value as [Dayjs, Dayjs])} /><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button></Space><Row gutter={[12,12]} style={{ marginBottom: 16 }}><Col xs={24} md={6}><Card><Statistic title="Tổng tiêu thụ" value={report?.summary.totalConsumption || 0} precision={2} suffix="kWh" prefix={<ThunderboltOutlined />} /></Card></Col><Col xs={24} md={6}><Card><Statistic title="Chi phí điện" value={report?.summary.totalCost || 0} precision={0} suffix="VNĐ" prefix={<DollarOutlined />} /></Card></Col><Col xs={24} md={6}><Card><Statistic title="Trung bình/ngày" value={report?.summary.avgPerDay || 0} precision={2} suffix="kWh" prefix={<ApiOutlined />} /></Card></Col><Col xs={24} md={6}><Card><Statistic title="Cao điểm / Thấp điểm" value={report?.summary.totalPeak || 0} precision={2} suffix={"/ " + fmtNumber.format(report?.summary.totalOffPeak || 0) + " kWh"} /></Card></Col></Row><Card title="Tổng hợp theo nhà máy" style={{ marginBottom: 16 }}><Table rowKey={(record) => record.factoryId || record.factoryCode} loading={loading} dataSource={report?.byFactory || []} pagination={false} columns={[{ title: "Nhà máy", dataIndex: "factoryName" }, { title: "Tiêu thụ", dataIndex: "consTotal", align: "right", render: (value: number) => fmtNumber.format(value) + " kWh" }, { title: "Chi phí", dataIndex: "costTotal", align: "right", render: (value: number) => fmtMoney.format(value) + " VNĐ" }]} /></Card><Card title="Chi tiết theo đồng hồ"><Table rowKey="meterId" loading={loading} dataSource={report?.byMeter || []} columns={[{ title: "Mã ĐH", dataIndex: "meterCode", render: (value: string) => <Tag color="blue">{value}</Tag> }, { title: "Tên đồng hồ", dataIndex: "meterName" }, { title: "Nhà máy", dataIndex: "factoryName" }, { title: "Trạm", dataIndex: "substationName" }, { title: "Nhóm", dataIndex: "groupName" }, { title: "Tiêu thụ", dataIndex: "consTotal", align: "right", render: (value: number) => fmtNumber.format(value) + " kWh" }, { title: "Chi phí", dataIndex: "costTotal", align: "right", render: (value: number) => fmtMoney.format(value) + " VNĐ" }]} /></Card></>;
}

export function ElectricOverviewClient() {
  const [report, setReport] = useState<ReportData | null>(null); const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  useEffect(() => { const startDate = dayjs().startOf("month").format("YYYY-MM-DD"); const endDate = dayjs().format("YYYY-MM-DD"); fetchJson<ReportData>("/api/electric/reports?startDate=" + startDate + "&endDate=" + endDate).then(setReport).catch(() => undefined); fetchJson<Telemetry[]>("/api/energy/telemetry?take=8").then(setTelemetry).catch(() => undefined); }, []);
  return <><PageTitle title="Tổng quan điện năng" subtitle="Ảnh nhanh tiêu thụ tháng hiện tại và telemetry gần nhất." /><Row gutter={[12,12]} style={{ marginBottom: 16 }}><Col xs={24} md={8}><Card><Statistic title="Tiêu thụ tháng" value={report?.summary.totalConsumption || 0} precision={2} suffix="kWh" prefix={<ThunderboltOutlined />} /></Card></Col><Col xs={24} md={8}><Card><Statistic title="Chi phí tháng" value={report?.summary.totalCost || 0} precision={0} suffix="VNĐ" prefix={<DollarOutlined />} /></Card></Col><Col xs={24} md={8}><Card><Statistic title="Ngày có dữ liệu" value={report?.summary.daysWithData || 0} suffix="ngày" prefix={<SaveOutlined />} /></Card></Col></Row><Card title="Telemetry AUTO gần nhất"><Table rowKey="id" dataSource={telemetry} pagination={false} columns={[{ title: "Thời điểm", dataIndex: "timestamp", render: (value: string) => dayjs(value).format("DD/MM/YYYY HH:mm:ss") }, { title: "Đồng hồ", render: (_: unknown, record: Telemetry) => (record.meter?.code || "") + " - " + (record.meter?.name || "") }, { title: "Tổng kWh", dataIndex: "totalEnergy", align: "right", render: (value: number) => fmtNumber.format(value) }]} /></Card></>;
}
