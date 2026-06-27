"use client";

import {
  ApiOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  FireOutlined,
  MinusCircleOutlined,
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
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  TimePicker,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DonutChart, RankedBarChart, TrendLineChart } from "./Charts";
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


type TransformerUnit = {
  id: number;
  code: string;
  name: string;
  transformerId?: string | null;
  transformer?: Transformer | null;
  manufacturer?: string | null;
  manufacturingYear?: number | null;
  serialNumber?: string | null;
  ratedCapacity?: number | null;
  ratedCapacityUnit?: string | null;
  voltageLevel?: string | null;
  ratedCurrent?: string | null;
  isActive: boolean;
  _count?: { meters: number };
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
  transformerUnitId?: number | null;
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
  transformerUnit?: TransformerUnit | null;
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

type TariffTimeRange = {
  id: string;
  dayType: "WEEKDAY" | "SUNDAY";
  priceType: "NORMAL" | "PEAK" | "OFF_PEAK";
  startMinute: number;
  endMinute: number;
};

type TariffScheduleVersion = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  note?: string | null;
  ranges: TariffTimeRange[];
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
    prevPeriodConsumption: number;
    trendPercent: number | null;
  };
  byDate: Array<{ date: string; consTotal: number; costTotal: number }>;
  byMeter: Array<{
    meterId: string;
    meterCode: string;
    meterName: string;
    factoryName?: string;
    groupName: string;
    substationName: string;
    transformerUnitName: string;
    consTotal: number;
    costTotal: number;
  }>;
  byGroup?: Array<{
    groupId: string | null;
    groupCode: string;
    groupName: string;
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
  const [transformerUnits, setTransformerUnits] = useState<TransformerUnit[]>([]);
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [groups, setGroups] = useState<MeterGroup[]>([]);
  const [energyTypes, setEnergyTypes] = useState<EnergyType[]>([]);
  const [factoryModalOpen, setFactoryModalOpen] = useState(false);
  const [transformerModalOpen, setTransformerModalOpen] = useState(false);
  const [transformerUnitModalOpen, setTransformerUnitModalOpen] = useState(false);
  const [meterModalOpen, setMeterModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [energyTypeModalOpen, setEnergyTypeModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);
  const [editingTransformer, setEditingTransformer] = useState<Transformer | null>(null);
  const [editingTransformerUnit, setEditingTransformerUnit] = useState<TransformerUnit | null>(null);
  const [editingMeter, setEditingMeter] = useState<ElectricMeter | null>(null);
  const [editingGroup, setEditingGroup] = useState<MeterGroup | null>(null);
  const [editingEnergyType, setEditingEnergyType] = useState<EnergyType | null>(null);
  const [meterFilterFactory, setMeterFilterFactory] = useState<string>();
  const [meterFilterTransformer, setMeterFilterTransformer] = useState<string>();
  const [meterFilterTransformerUnit, setMeterFilterTransformerUnit] = useState<number>();
  const [formFactory] = Form.useForm();
  const [formTransformer] = Form.useForm();
  const [formTransformerUnit] = Form.useForm();
  const [formMeter] = Form.useForm();
  const [formGroup] = Form.useForm();
  const [formEnergyType] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextFactories, nextTransformers, nextTransformerUnits, nextMeters, nextGroups, nextEnergyTypes] = await Promise.all([
        fetchJson<Factory[]>("/api/electric/factories"),
        fetchJson<Transformer[]>("/api/electric/substations"),
        fetchJson<TransformerUnit[]>("/api/electric/transformer-units"),
        fetchJson<ElectricMeter[]>("/api/electric/meters"),
        fetchJson<MeterGroup[]>("/api/electric/meter-groups"),
        fetchJson<EnergyType[]>("/api/electric/energy-types"),
      ]);
      setFactories(nextFactories);
      setTransformers(nextTransformers);
      setTransformerUnits(nextTransformerUnits);
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

  const openTransformerUnit = (record?: TransformerUnit) => {
    setEditingTransformerUnit(record || null);
    formTransformerUnit.resetFields();
    formTransformerUnit.setFieldsValue(record || { isActive: true, ratedCapacityUnit: "kVA" });
    setTransformerUnitModalOpen(true);
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

  const saveTransformerUnit = async (values: Record<string, unknown>) => {
    await fetchJson<TransformerUnit>("/api/electric/transformer-units", postBody(editingTransformerUnit ? "PUT" : "POST", { ...values, id: editingTransformerUnit?.id }));
    message.success("Da luu may bien ap");
    setTransformerUnitModalOpen(false);
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

  const filteredTransformerUnits = useMemo(
    () => transformerUnits.filter((item) => {
      if (meterFilterTransformer && item.transformerId !== meterFilterTransformer) return false;
      return !meterFilterFactory || item.transformer?.factoryId === meterFilterFactory;
    }),
    [transformerUnits, meterFilterFactory, meterFilterTransformer],
  );

  const filteredMeters = useMemo(
    () => meters.filter((meter) => {
      if (meterFilterTransformer && meter.transformerId !== meterFilterTransformer) return false;
      if (meterFilterTransformerUnit && meter.transformerUnitId !== meterFilterTransformerUnit) return false;
      return !meterFilterFactory || meter.transformer?.factoryId === meterFilterFactory;
    }),
    [meters, meterFilterFactory, meterFilterTransformer, meterFilterTransformerUnit],
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
    { title: "Máy biến áp", render: (_, record) => record.transformerUnit?.name || "---" },
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
              key: "transformerUnits",
              label: "Máy biến áp",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && <Button type="primary" icon={<PlusOutlined />} onClick={() => openTransformerUnit()}>Thêm máy biến áp</Button>}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={transformerUnits}
                    columns={[
                      { title: "Mã máy", dataIndex: "code", render: (value: string) => <b>{value}</b> },
                      { title: "Tên máy biến áp", dataIndex: "name" },
                      { title: "Trạm", render: (_: unknown, record: TransformerUnit) => record.transformer?.name || "---" },
                      { title: "Nhà máy", render: (_: unknown, record: TransformerUnit) => record.transformer?.factory?.name || "---" },
                      { title: "Hãng", dataIndex: "manufacturer" },
                      { title: "Năm SX", dataIndex: "manufacturingYear", width: 90 },
                      { title: "Serial", dataIndex: "serialNumber" },
                      { title: "Công suất", render: (_: unknown, record: TransformerUnit) => record.ratedCapacity ? fmtNumber.format(record.ratedCapacity) + " " + (record.ratedCapacityUnit || "kVA") : "---" },
                      { title: "Cấp điện áp", dataIndex: "voltageLevel" },
                      { title: "Dòng định mức", dataIndex: "ratedCurrent" },
                      { title: "Số đồng hồ", render: (_: unknown, record: TransformerUnit) => record._count?.meters ?? 0 },
                      { title: "Thao tác", render: (_: unknown, record: TransformerUnit) => canManageCatalog ? <Space><Button size="small" icon={<EditOutlined />} onClick={() => openTransformerUnit(record)} /><Popconfirm title="Xóa hoặc ngưng dùng máy biến áp này?" onConfirm={() => deleteRecord("/api/electric/transformer-units", String(record.id))}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> : null },
                    ]}
                    scroll={{ x: 1180 }}
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
                        <Select allowClear placeholder="Lọc theo nhà máy" style={{ width: 190 }} value={meterFilterFactory} onChange={(value) => { setMeterFilterFactory(value); setMeterFilterTransformer(undefined); setMeterFilterTransformerUnit(undefined); }} options={factories.map((factory) => ({ label: factory.name, value: factory.id }))} />
                        <Select allowClear placeholder="Lọc theo trạm biến áp" style={{ width: 220 }} value={meterFilterTransformer} onChange={(value) => { setMeterFilterTransformer(value); setMeterFilterTransformerUnit(undefined); }} disabled={!meterFilterFactory} options={filteredTransformers.map((transformer) => ({ label: transformer.name, value: transformer.id }))} />
                        <Select allowClear placeholder="Lọc theo máy biến áp" style={{ width: 220 }} value={meterFilterTransformerUnit} onChange={setMeterFilterTransformerUnit} disabled={!meterFilterTransformer} options={filteredTransformerUnits.map((unit) => ({ label: unit.name, value: unit.id }))} />
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
      <Modal title={editingTransformerUnit ? "Sửa máy biến áp" : "Thêm máy biến áp"} open={transformerUnitModalOpen} width={760} onCancel={() => setTransformerUnitModalOpen(false)} onOk={() => formTransformerUnit.submit()}>
        <Form form={formTransformerUnit} layout="vertical" onFinish={saveTransformerUnit}>
          <Row gutter={12}>
            <Col xs={24} md={12}><Form.Item name="transformerId" label="Trạm biến áp" rules={[{ required: true }]}><Select options={transformers.map((item) => ({ label: item.factory ? item.factory.name + " - " + item.name : item.name, value: item.id }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="code" label="Mã máy biến áp" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="name" label="Tên máy biến áp" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="manufacturer" label="Hãng sản xuất"><Input /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="manufacturingYear" label="Năm sản xuất"><InputNumber min={1900} max={2100} style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="serialNumber" label="Số Seri"><Input /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="ratedCapacity" label="Công suất định mức"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="ratedCapacityUnit" label="Đơn vị công suất"><Select options={[{ label: "kVA", value: "kVA" }, { label: "MVA", value: "MVA" }]} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="voltageLevel" label="Cấp điện áp"><Input placeholder="22/0.4 kV" /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="ratedCurrent" label="Dòng điện định mức"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
      <Modal title={editingGroup ? "Sửa nhóm đồng hồ" : "Thêm nhóm đồng hồ"} open={groupModalOpen} onCancel={() => setGroupModalOpen(false)} onOk={() => formGroup.submit()}>
        <Form form={formGroup} layout="vertical" onFinish={saveGroup}><Form.Item name="code" label="Mã nhóm" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="name" label="Tên nhóm" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="sortOrder" label="Thứ tự"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item><Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item></Form>
      </Modal>
      <Modal title={editingEnergyType ? "Sửa loại điện năng" : "Thêm loại điện năng"} open={energyTypeModalOpen} onCancel={() => setEnergyTypeModalOpen(false)} onOk={() => formEnergyType.submit()}>
        <Form form={formEnergyType} layout="vertical" onFinish={saveEnergyType}><Form.Item name="code" label="Mã loại điện" rules={[{ required: true }]}><Input disabled={!!editingEnergyType} /></Form.Item><Form.Item name="name" label="Tên loại điện" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item><Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item></Form>
      </Modal>
      <Modal title={editingMeter ? "Sửa đồng hồ điện" : "Thêm đồng hồ điện"} open={meterModalOpen} width={760} onCancel={() => setMeterModalOpen(false)} onOk={() => formMeter.submit()}>
        <Form form={formMeter} layout="vertical" onFinish={saveMeter}>
          <Row gutter={12}><Col xs={24} md={8}><Form.Item name="code" label="Mã đồng hồ" rules={[{ required: true }]}><Input /></Form.Item></Col><Col xs={24} md={16}><Form.Item name="name" label="Tên đồng hồ" rules={[{ required: true }]}><Input /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="transformerId" label="Trạm biến áp" rules={[{ required: true }]}><Select allowClear options={transformers.map((item) => ({ label: item.factory ? item.factory.name + " - " + item.name : item.name, value: item.id }))} /></Form.Item></Col><Col xs={24} md={12}><Form.Item noStyle shouldUpdate={(prev, next) => prev.transformerId !== next.transformerId}>{({ getFieldValue }) => <Form.Item name="transformerUnitId" label="Máy biến áp" rules={[{ required: true }]}><Select allowClear options={transformerUnits.filter((unit) => !getFieldValue("transformerId") || unit.transformerId === getFieldValue("transformerId")).map((unit) => ({ label: unit.name, value: unit.id }))} /></Form.Item>}</Form.Item></Col><Col xs={24} md={12}><Form.Item name="groupId" label="Nhóm đồng hồ"><Select allowClear options={groups.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="type" label="Loại đồng hồ" rules={[{ required: true }]}><Select options={[{ label: "Hạ thế (1 chỉ số)", value: 1 }, { label: "Trung thế (3 chỉ số)", value: 2 }]} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="tu" label="TU" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="ti" label="TI" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="meterNo" label="Số serial"><Input /></Form.Item></Col></Row>
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
  const [factories, setFactories] = useState<Factory[]>([]);
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [transformerUnits, setTransformerUnits] = useState<TransformerUnit[]>([]);
  const [groups, setGroups] = useState<MeterGroup[]>([]);
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<string>();
  const [selectedTransformer, setSelectedTransformer] = useState<string>();
  const [selectedTransformerUnit, setSelectedTransformerUnit] = useState<number>();
  const [selectedGroup, setSelectedGroup] = useState<string>();
  const [modeFilter, setModeFilter] = useState<"all" | "manual" | "auto">("all");
  const [statusFilter, setStatusFilter] = useState<"needsInput" | "all" | "done">("needsInput");
  const [keyword, setKeyword] = useState("");
  const [currentMeter, setCurrentMeter] = useState<ElectricMeter | null>(null);
  const [currentLastRecord, setCurrentLastRecord] = useState<PowerRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const watchedValues = Form.useWatch([], form) as Record<string, number | boolean | string | undefined> | undefined;

  useEffect(() => {
    Promise.all([
      fetchJson<Factory[]>("/api/electric/factories"),
      fetchJson<Transformer[]>("/api/electric/substations"),
      fetchJson<TransformerUnit[]>("/api/electric/transformer-units"),
      fetchJson<MeterGroup[]>("/api/electric/meter-groups"),
    ])
      .then(([nextFactories, nextTransformers, nextTransformerUnits, nextGroups]) => {
        setFactories(nextFactories.filter((item) => item.isActive));
        setTransformers(nextTransformers.filter((item) => item.isActive));
        setTransformerUnits(nextTransformerUnits.filter((item) => item.isActive));
        setGroups(nextGroups.filter((item) => item.isActive));
      })
      .catch(() => message.error("Không tải được danh mục điện năng"));
  }, []);

  const filteredTransformers = useMemo(
    () => transformers.filter((item) => !selectedFactory || item.factoryId === selectedFactory),
    [transformers, selectedFactory],
  );

  const filteredDailyTransformerUnits = useMemo(
    () => transformerUnits.filter((item) => {
      if (selectedTransformer && item.transformerId !== selectedTransformer) return false;
      return !selectedFactory || item.transformer?.factoryId === selectedFactory;
    }),
    [transformerUnits, selectedFactory, selectedTransformer],
  );

  const loadMeters = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate.format("YYYY-MM-DD") });
      if (selectedTransformer) params.set("substationId", selectedTransformer);
      if (selectedTransformerUnit) params.set("transformerUnitId", String(selectedTransformerUnit));
      if (!selectedTransformer && selectedFactory) params.set("factoryId", selectedFactory);
      setMeters(await fetchJson<ElectricMeter[]>("/api/electric/daily-status?" + params.toString()));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không tải được trạng thái chốt số");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedFactory, selectedTransformer, selectedTransformerUnit]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMeters(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMeters]);

  const displayedMeters = useMemo(() => meters.filter((meter) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (selectedGroup && meter.groupId !== selectedGroup) return false;
    if (modeFilter === "manual" && meter.isAuto) return false;
    if (modeFilter === "auto" && !meter.isAuto) return false;
    if (statusFilter === "needsInput" && meter.todayRecord) return false;
    if (statusFilter === "done" && !meter.todayRecord) return false;
    if (!normalizedKeyword) return true;
    return [meter.code, meter.name, meter.meterNo || ""].some((value) => value.toLowerCase().includes(normalizedKeyword));
  }), [meters, selectedGroup, modeFilter, statusFilter, keyword]);

  const totalMeters = meters.length;
  const doneMeters = meters.filter((meter) => meter.todayRecord).length;
  const pendingMeters = totalMeters - doneMeters;
  const manualPending = meters.filter((meter) => !meter.isAuto && !meter.todayRecord).length;
  const autoFallbackPending = meters.filter((meter) => meter.isAuto && !meter.todayRecord).length;

  const openRecord = async (meter: ElectricMeter) => {
    setCurrentMeter(meter);
    setCurrentLastRecord(null);
    form.resetFields();
    const lastRecord = await fetchJson<PowerRecord | null>("/api/electric/last-record?meterId=" + meter.id + "&date=" + selectedDate.format("YYYY-MM-DD"));
    setCurrentLastRecord(lastRecord);
    if (meter.type === 2) {
      form.setFieldsValue({
        meterId: meter.id,
        currNormal: meter.todayRecord?.currNormal ?? undefined,
        currPeak: meter.todayRecord?.currPeak ?? undefined,
        currOffPeak: meter.todayRecord?.currOffPeak ?? undefined,
        note: meter.todayRecord?.note ?? undefined,
      });
    } else {
      form.setFieldsValue({
        meterId: meter.id,
        prevTotal: meter.todayRecord?.prevTotal ?? lastRecord?.currTotal ?? 0,
        currTotal: meter.todayRecord?.currTotal ?? undefined,
        unitPrice: meter.todayRecord?.unitPrice ?? undefined,
        isReset: meter.todayRecord?.isReset ?? false,
        note: meter.todayRecord?.note ?? undefined,
      });
    }
    setModalOpen(true);
  };

  const saveRecord = async () => {
    const values = await form.validateFields();
    if (currentMeter?.type !== 2 && !values.isReset && Number(values.currTotal || 0) < Number(values.prevTotal || 0)) {
      message.error("Chỉ số sau nhỏ hơn chỉ số trước. Bật reset nếu đã thay đồng hồ.");
      return;
    }
    await fetchJson("/api/electric/daily-input", postBody("POST", { ...values, recordDate: selectedDate.format("YYYY-MM-DD") }));
    message.success("Đã chốt chỉ số MANUAL");
    setModalOpen(false);
    await loadMeters();
  };

  const lowVoltageDelta = currentMeter?.type !== 2
    ? ((watchedValues?.isReset ? Number(watchedValues?.currTotal || 0) : Math.max(0, Number(watchedValues?.currTotal || 0) - Number(watchedValues?.prevTotal || 0))) * (currentMeter?.tu || 1) * (currentMeter?.ti || 1))
    : 0;
  const mediumVoltageDelta = currentMeter?.type === 2
    ? ([
        Math.max(0, Number(watchedValues?.currNormal || 0) - Number(currentLastRecord?.currNormal || 0)),
        Math.max(0, Number(watchedValues?.currPeak || 0) - Number(currentLastRecord?.currPeak || 0)),
        Math.max(0, Number(watchedValues?.currOffPeak || 0) - Number(currentLastRecord?.currOffPeak || 0)),
      ].reduce((sum, value) => sum + value, 0) * (currentMeter?.tu || 1) * (currentMeter?.ti || 1))
    : 0;

  return (
    <>
      <PageTitle title="Nhập chỉ số điện" subtitle="Màn hình nhập tay cho đồng hồ MANUAL và các tình huống AUTO bị mất mạng, đứt cáp hoặc lỗi Gateway." />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6} lg={4}><DatePicker value={selectedDate} onChange={(value) => value && setSelectedDate(value)} style={{ width: "100%" }} /></Col>
          <Col xs={24} md={6} lg={5}><Select allowClear placeholder="Nhà máy" value={selectedFactory} onChange={(value) => { setSelectedFactory(value); setSelectedTransformer(undefined); setSelectedTransformerUnit(undefined); }} options={factories.map((item) => ({ label: item.name, value: item.id }))} style={{ width: "100%" }} /></Col>
          <Col xs={24} md={8} lg={6}><Select allowClear showSearch optionFilterProp="label" placeholder="Trạm biến áp" value={selectedTransformer} onChange={(value) => { setSelectedTransformer(value); setSelectedTransformerUnit(undefined); }} options={filteredTransformers.map((item) => ({ label: item.factory ? item.factory.name + " - " + item.name : item.name, value: item.id }))} style={{ width: "100%" }} /></Col>
          <Col xs={24} md={8} lg={5}><Select allowClear showSearch optionFilterProp="label" placeholder="Máy biến áp" value={selectedTransformerUnit} onChange={setSelectedTransformerUnit} options={filteredDailyTransformerUnits.map((item) => ({ label: item.name, value: item.id }))} style={{ width: "100%" }} /></Col>
          <Col xs={24} md={4} lg={3}><Button icon={<ReloadOutlined />} onClick={loadMeters} loading={loading} block>Tải</Button></Col>
          <Col xs={24} lg={6}><Input.Search allowClear placeholder="Tìm mã, tên, serial" value={keyword} onChange={(event) => setKeyword(event.target.value)} /></Col>
        </Row>
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} md={8}><Select allowClear placeholder="Nhóm đồng hồ" value={selectedGroup} onChange={setSelectedGroup} options={groups.map((item) => ({ label: item.name, value: item.id }))} style={{ width: "100%" }} /></Col>
          <Col xs={24} md={8}><Segmented block options={[{ label: "Cần nhập", value: "needsInput" }, { label: "Tất cả", value: "all" }, { label: "Đã chốt", value: "done" }]} value={statusFilter} onChange={(value) => setStatusFilter(value as "needsInput" | "all" | "done")} /></Col>
          <Col xs={24} md={8}><Segmented block options={[{ label: "Tất cả", value: "all" }, { label: "MANUAL", value: "manual" }, { label: "AUTO", value: "auto" }]} value={modeFilter} onChange={(value) => setModeFilter(value as "all" | "manual" | "auto")} /></Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}><Card><Statistic title="Tổng đồng hồ" value={totalMeters} suffix="đồng hồ" /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="MANUAL chưa chốt" value={manualPending} suffix={"/ " + pendingMeters + " chưa chốt"} valueStyle={{ color: manualPending ? "#cf1322" : "#389e0d" }} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Đã chốt" value={doneMeters} suffix={"/ " + totalMeters} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="AUTO cần dự phòng" value={autoFallbackPending} suffix="đồng hồ" valueStyle={{ color: autoFallbackPending ? "#d46b08" : undefined }} /></Card></Col>
      </Row>

      <Alert
        type={autoFallbackPending ? "warning" : "info"}
        showIcon
        style={{ marginBottom: 16 }}
        message={autoFallbackPending ? "Có đồng hồ AUTO chưa chốt. Nếu Gateway/mạng lỗi, có thể nhập MANUAL tạm thời." : "Ưu tiên nhập các đồng hồ chưa chốt. Dữ liệu MANUAL vẫn được API tính lại tiêu thụ và tiền điện."}
      />

      <Table
        rowKey="id"
        loading={loading}
        dataSource={displayedMeters}
        pagination={{ pageSize: 12 }}
        scroll={{ x: 1040 }}
        columns={[
          { title: "Mã", dataIndex: "code", width: 110, render: (value: string, record: ElectricMeter) => <Space direction="vertical" size={0}><b>{value}</b><Text type="secondary" style={{ fontSize: 12 }}>{record.meterNo || "---"}</Text></Space> },
          { title: "Tên đồng hồ", dataIndex: "name" },
          { title: "Khu vực", render: (_: unknown, record: ElectricMeter) => <Space direction="vertical" size={0}><Text>{record.transformer?.factory?.name || "---"}</Text><Text type="secondary" style={{ fontSize: 12 }}>{record.transformer?.name || "---"}</Text><Text type="secondary" style={{ fontSize: 12 }}>{record.transformerUnit?.name || "---"}</Text></Space> },
          { title: "Nhóm", render: (_: unknown, record: ElectricMeter) => record.group?.name || "---" },
          { title: "Loại", dataIndex: "type", render: (value: number) => value === 2 ? <Tag color="purple">Trung thế</Tag> : <Tag color="blue">Hạ thế</Tag> },
          { title: "Chế độ", dataIndex: "isAuto", render: (value: boolean) => <Tag color={value ? "green" : "gold"}>{value ? "AUTO" : "MANUAL"}</Tag> },
          { title: "Trạng thái", render: (_: unknown, record: ElectricMeter) => record.todayRecord ? <Tag color={record.todayRecord.dataSource === "AUTO" ? "green" : "orange"}>{record.todayRecord.dataSource}</Tag> : <Tag color={record.isAuto ? "volcano" : "red"}>{record.isAuto ? "Cần dự phòng" : "Cần nhập"}</Tag> },
          { title: "Tiêu thụ", align: "right" as const, render: (_: unknown, record: ElectricMeter) => record.todayRecord ? fmtNumber.format(record.todayRecord.consTotal) + " kWh" : "---" },
          { title: "Thao tác", width: 150, fixed: "right" as const, render: (_: unknown, record: ElectricMeter) => canEditDaily ? <Button type={!record.todayRecord ? "primary" : "default"} icon={<EditOutlined />} onClick={() => openRecord(record)}>{record.todayRecord ? "Sửa" : "Nhập"}</Button> : null },
        ]}
      />

      <Modal title={(currentMeter?.todayRecord ? "Sửa chỉ số: " : "Nhập chỉ số: ") + (currentMeter?.code || "")} open={modalOpen} width={820} onCancel={() => setModalOpen(false)} onOk={saveRecord} okText="Lưu MANUAL">
        <Form form={form} layout="vertical">
          {currentMeter?.isAuto ? <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Đồng hồ AUTO chỉ nên nhập tay khi mạng, cáp hoặc Gateway gặp sự cố." /> : null}
          <Form.Item name="meterId" hidden><Input /></Form.Item>
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col xs={24} md={8}><Card size="small"><Statistic title="Kỳ trước" value={currentMeter?.type === 2 ? (currentLastRecord?.recordDate ? dayjs(currentLastRecord.recordDate).format("DD/MM/YYYY") : "---") : (currentLastRecord?.currTotal ?? 0)} suffix={currentMeter?.type === 2 ? undefined : "kWh"} /></Card></Col>
            <Col xs={24} md={8}><Card size="small"><Statistic title="TU/TI" value={(currentMeter?.tu || 1) + " / " + (currentMeter?.ti || 1)} /></Card></Col>
            <Col xs={24} md={8}><Card size="small"><Statistic title="Ước tính" value={currentMeter?.type === 2 ? mediumVoltageDelta : lowVoltageDelta} precision={2} suffix="kWh" /></Card></Col>
          </Row>
          {currentMeter?.type === 2 ? (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Đồng hồ trung thế: nhập 3 chỉ số hiển thị trên mặt đồng hồ. Hệ thống sẽ tính lại theo đơn giá từng khung giờ." />
              <Row gutter={12}>
                <Col xs={24} md={8}><Form.Item name="currNormal" label="Chỉ số Bình thường" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Text type="secondary">Trước: {fmtNumber.format(currentLastRecord?.currNormal || 0)}</Text></Col>
                <Col xs={24} md={8}><Form.Item name="currPeak" label="Chỉ số Cao điểm" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Text type="secondary">Trước: {fmtNumber.format(currentLastRecord?.currPeak || 0)}</Text></Col>
                <Col xs={24} md={8}><Form.Item name="currOffPeak" label="Chỉ số Thấp điểm" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Text type="secondary">Trước: {fmtNumber.format(currentLastRecord?.currOffPeak || 0)}</Text></Col>
              </Row>
            </>
          ) : (
            <>
              <Form.Item name="isReset" label="Reset / thay đồng hồ" valuePropName="checked"><Switch /></Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={8}><Form.Item name="prevTotal" label="Chỉ số trước"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item name="currTotal" label="Chỉ số sau" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item name="unitPrice" label="Đơn giá"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
              </Row>
            </>
          )}
          <Form.Item name="note" label="Ghi chú sự cố / lý do nhập tay"><Input.TextArea rows={2} placeholder="Vd: Gateway mất kết nối, đứt cáp mạng, thay đồng hồ..." /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ElectricLiveClient() {
  const { canEditDaily } = useRole();
  const [factories, setFactories] = useState<Factory[]>([]);
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [transformerUnits, setTransformerUnits] = useState<TransformerUnit[]>([]);
  const [groups, setGroups] = useState<MeterGroup[]>([]);
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [filterFactoryId, setFilterFactoryId] = useState<string>();
  const [filterTransformerId, setFilterTransformerId] = useState<string>();
  const [filterTransformerUnitId, setFilterTransformerUnitId] = useState<number>();
  const [filterGroupId, setFilterGroupId] = useState<string>();
  const [selectedMeterId, setSelectedMeterId] = useState<string>();
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchJson<Factory[]>("/api/electric/factories"),
      fetchJson<Transformer[]>("/api/electric/substations"),
      fetchJson<TransformerUnit[]>("/api/electric/transformer-units"),
      fetchJson<MeterGroup[]>("/api/electric/meter-groups"),
      fetchJson<ElectricMeter[]>("/api/electric/meters"),
    ])
      .then(([nextFactories, nextTransformers, nextTransformerUnits, nextGroups, nextMeters]) => {
        setFactories(nextFactories.filter((item) => item.isActive));
        setTransformers(nextTransformers.filter((item) => item.isActive));
        setTransformerUnits(nextTransformerUnits.filter((item) => item.isActive));
        setGroups(nextGroups.filter((item) => item.isActive));
        setMeters(nextMeters.filter((meter) => meter.isActive && meter.isAuto));
      })
      .catch(() => message.error("Không tải được dữ liệu realtime điện năng"));
  }, []);

  const filteredTransformers = useMemo(
    () => transformers.filter((item) => !filterFactoryId || item.factoryId === filterFactoryId),
    [transformers, filterFactoryId],
  );

  const filteredLiveTransformerUnits = useMemo(
    () => transformerUnits.filter((item) => {
      if (filterTransformerId && item.transformerId !== filterTransformerId) return false;
      return !filterFactoryId || item.transformer?.factoryId === filterFactoryId;
    }),
    [transformerUnits, filterFactoryId, filterTransformerId],
  );

  const filteredMeters = useMemo(() => meters.filter((meter) => {
    if (filterFactoryId && meter.transformer?.factoryId !== filterFactoryId) return false;
    if (filterTransformerId && meter.transformerId !== filterTransformerId) return false;
    if (filterTransformerUnitId && meter.transformerUnitId !== filterTransformerUnitId) return false;
    if (filterGroupId && meter.groupId !== filterGroupId) return false;
    return true;
  }), [meters, filterFactoryId, filterTransformerId, filterTransformerUnitId, filterGroupId]);

  const meter = meters.find((item) => item.id === selectedMeterId);

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

  const selectMeter = (meterId?: string) => {
    setSelectedMeterId(meterId);
    setLiveData(null);
    if (meterId) {
      void loadHistory(meterId);
    } else {
      setHistory([]);
    }
  };

  const readLive = async () => {
    if (!selectedMeterId) { message.warning("Chọn một đồng hồ AUTO cần đọc"); return; }
    setLoading(true);
    try {
      const data = await fetchJson<LiveData>("/api/electric/live?meterId=" + encodeURIComponent(selectedMeterId));
      setLiveData(data);
      message.success("Đã đọc realtime và lưu telemetry");
      void loadHistory(selectedMeterId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không đọc được realtime");
    } finally {
      setLoading(false);
    }
  };

  const displayValue = liveData?.totalEnergy ?? history[history.length - 1]?.totalEnergy ?? 0;

  return (
    <>
      <PageTitle title="Realtime điện năng" subtitle="Lọc nhanh và đọc trực tiếp từng đồng hồ AUTO qua Modbus Gateway." />
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8} lg={5}>
            <Select allowClear placeholder="Nhà máy" style={{ width: "100%" }} value={filterFactoryId} onChange={(value) => { setFilterFactoryId(value); setFilterTransformerId(undefined); setFilterTransformerUnitId(undefined); selectMeter(undefined); }} options={factories.map((item) => ({ label: item.name, value: item.id }))} />
          </Col>
          <Col xs={24} md={8} lg={6}>
            <Select allowClear placeholder="Trạm biến áp" style={{ width: "100%" }} value={filterTransformerId} onChange={(value) => { setFilterTransformerId(value); setFilterTransformerUnitId(undefined); selectMeter(undefined); }} options={filteredTransformers.map((item) => ({ label: item.factory ? item.factory.name + " - " + item.name : item.name, value: item.id }))} />
          </Col>
          <Col xs={24} md={8} lg={5}>
            <Select allowClear placeholder="Nhóm đồng hồ" style={{ width: "100%" }} value={filterGroupId} onChange={(value) => { setFilterGroupId(value); selectMeter(undefined); }} options={groups.map((item) => ({ label: item.name, value: item.id }))} />
          </Col>
          <Col xs={24} md={8} lg={5}>
            <Select allowClear placeholder="Máy biến áp" style={{ width: "100%" }} value={filterTransformerUnitId} onChange={(value) => { setFilterTransformerUnitId(value); selectMeter(undefined); }} options={filteredLiveTransformerUnits.map((item) => ({ label: item.name, value: item.id }))} />
          </Col>
          <Col xs={24} lg={8}>
            <Space wrap style={{ width: "100%" }}>
              <Select
                allowClear
                showSearch
                placeholder="Chọn đồng hồ AUTO"
                style={{ minWidth: 280, flex: 1 }}
                value={selectedMeterId}
                onChange={selectMeter}
                optionFilterProp="label"
                options={filteredMeters.map((item) => ({ label: item.code + " - " + item.name, value: item.id }))}
              />
              {canEditDaily && (
                <Button type="primary" icon={<ThunderboltOutlined />} loading={loading} onClick={readLive} disabled={!selectedMeterId}>
                  Đọc realtime
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {!selectedMeterId ? (
        <Card><Empty description="Chọn một đồng hồ AUTO để xem realtime" /></Card>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card style={{ background: "#0d1117", borderColor: "#0d1117" }} styles={{ body: { padding: 20 } }}>
              <MeterFace value={displayValue} online={!!liveData} label={(meter?.code || "") + " - " + (meter?.name || "")} />
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
                  <Text type="secondary">Đã đọc lúc {dayjs(liveData.timestamp).format("DD/MM/YYYY HH:mm:ss")} - dữ liệu chỉ dùng realtime/biểu đồ, không dùng trực tiếp để tính tiền điện.</Text>
                ) : (
                  <Text type="secondary">Bấm &quot;Đọc realtime&quot; để lấy chỉ số mới nhất qua Gateway. Mỗi lần chỉ đọc một đồng hồ để tránh quá tải Gateway.</Text>
                )}
              </Card>
              <Card title="Xu hướng kWh gần đây" loading={historyLoading}>
                <Sparkline values={history.map((item) => item.totalEnergy)} />
              </Card>
              <Card size="small" title="Thông tin đồng hồ">
                <Space direction="vertical" size={4}>
                  <Text>Gateway: <b>{meter?.gatewayIp}:{meter?.gatewayPort}</b> - Slave ID <b>{meter?.modbusId}</b></Text>
                  <Text>Nhà máy: {meter?.transformer?.factory?.name || "---"} - Trạm: {meter?.transformer?.name || "---"}</Text>
                  <Text>Nhóm: {meter?.group?.name || "---"} - TU/TI: {meter?.tu} / {meter?.ti}</Text>
                </Space>
              </Card>
            </Space>
          </Col>
        </Row>
      )}
    </>
  );
}

function minuteToHHMM(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const tariffPriceTypeName: Record<string, string> = { NORMAL: "Bình thường", PEAK: "Cao điểm", OFF_PEAK: "Thấp điểm" };
const tariffPriceTypeColor: Record<string, string> = { NORMAL: "blue", PEAK: "red", OFF_PEAK: "green" };
const tariffDayTypeName: Record<string, string> = { WEEKDAY: "Thứ 2 - Thứ 7", SUNDAY: "Chủ Nhật" };

const tariffDayTypeOptions = [
  { label: "Thứ 2 - Thứ 7", value: "WEEKDAY" },
  { label: "Chủ Nhật", value: "SUNDAY" },
];
const tariffPriceTypeOptions = [
  { label: "Bình thường", value: "NORMAL" },
  { label: "Cao điểm", value: "PEAK" },
  { label: "Thấp điểm", value: "OFF_PEAK" },
];

function TariffScheduleCard() {
  const { canManageCatalog } = useRole();
  const [versions, setVersions] = useState<TariffScheduleVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<TariffScheduleVersion | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVersions(await fetchJson<TariffScheduleVersion[]>("/api/electric/tariff-schedule"));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không tải được biểu khung giờ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const activate = async (id: string) => {
    try {
      await fetchJson(`/api/electric/tariff-schedule/${id}/activate`, postBody("POST", {}));
      message.success("Đã kích hoạt phiên bản khung giờ này");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không kích hoạt được");
    }
  };

  const openEdit = (version: TariffScheduleVersion) => {
    setEditing(version);
    form.setFieldsValue({
      ranges: version.ranges
        .slice()
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((r) => ({
          dayType: r.dayType,
          priceType: r.priceType,
          range: [dayjs().startOf("day").add(r.startMinute, "minute"), dayjs().startOf("day").add(r.endMinute, "minute")],
        })),
    });
    setModalOpen(true);
  };

  const saveRanges = async (values: { ranges: Array<{ dayType: string; priceType: string; range: [Dayjs, Dayjs] }> }) => {
    if (!editing) return;
    setSaving(true);
    try {
      const ranges = values.ranges.map((r) => ({
        dayType: r.dayType,
        priceType: r.priceType,
        startMinute: r.range[0].hour() * 60 + r.range[0].minute(),
        endMinute: r.range[1].hour() * 60 + r.range[1].minute() || 1440,
      }));
      await fetchJson("/api/electric/tariff-schedule", postBody("PUT", { id: editing.id, ranges }));
      message.success("Đã lưu biểu khung giờ");
      setModalOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không lưu được biểu khung giờ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Biểu khung giờ áp dụng tính tiền điện" style={{ marginTop: 16 }} loading={loading}>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Dùng để tự động tách tiêu thụ của đồng hồ Hạ thế đọc AUTO (theo giờ) thành 3 khung giá Bình thường/Cao điểm/Thấp điểm,
        dựa trên dữ liệu telemetry hàng giờ. Đồng hồ Trung thế không phụ thuộc bảng này vì phần cứng đã tự tách sẵn 3 chỉ số.
      </Text>
      {versions.map((version) => (
        <Card
          key={version.id}
          type="inner"
          style={{ marginBottom: 12 }}
          title={
            <Space>
              {version.name}
              <Tag color={version.isActive ? "green" : "default"}>{version.isActive ? "Đang áp dụng" : "Chưa áp dụng"}</Tag>
            </Space>
          }
          extra={
            canManageCatalog ? (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(version)}>Sửa khoảng giờ</Button>
                {!version.isActive ? (
                  <Popconfirm title="Kích hoạt phiên bản khung giờ này để tính tiền điện?" onConfirm={() => activate(version.id)}>
                    <Button size="small">Kích hoạt</Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ) : null
          }
        >
          {version.note ? <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>{version.note}</Text> : null}
          {(["WEEKDAY", "SUNDAY"] as const).map((dayType) => (
            <div key={dayType} style={{ marginBottom: 8 }}>
              <Text strong>{tariffDayTypeName[dayType]}: </Text>
              <Space wrap style={{ marginTop: 4 }}>
                {version.ranges
                  .filter((r) => r.dayType === dayType)
                  .sort((a, b) => a.startMinute - b.startMinute)
                  .map((r) => (
                    <Tag key={r.id} color={tariffPriceTypeColor[r.priceType]}>
                      {minuteToHHMM(r.startMinute)} - {minuteToHHMM(r.endMinute)} ({tariffPriceTypeName[r.priceType]})
                    </Tag>
                  ))}
              </Space>
            </div>
          ))}
        </Card>
      ))}
      <Modal
        title={`Sửa khoảng giờ - ${editing?.name || ""}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={saveRanges}>
          <Form.List name="ranges">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: "flex", marginBottom: 8 }} wrap>
                    <Form.Item name={[field.name, "dayType"]} rules={[{ required: true, message: "Chọn ngày" }]} style={{ width: 140, marginBottom: 0 }}>
                      <Select placeholder="Loại ngày" options={tariffDayTypeOptions} />
                    </Form.Item>
                    <Form.Item name={[field.name, "priceType"]} rules={[{ required: true, message: "Chọn khung giá" }]} style={{ width: 140, marginBottom: 0 }}>
                      <Select placeholder="Khung giá" options={tariffPriceTypeOptions} />
                    </Form.Item>
                    <Form.Item name={[field.name, "range"]} rules={[{ required: true, message: "Chọn giờ" }]} style={{ marginBottom: 0 }}>
                      <TimePicker.RangePicker format="HH:mm" minuteStep={30} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} block>
                  Thêm khoảng giờ
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Card>
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
  return <><PageTitle title="Đơn giá điện" subtitle="Quản lý 3 khung giá Bình thường/Cao điểm/Thấp điểm dùng khi chốt PowerRecord." /><Card extra={canManageCatalog && <Button type="primary" icon={<PlusOutlined />} onClick={() => openPrice()}>Thêm/Cập nhật giá</Button>}><Table rowKey="id" loading={loading} dataSource={prices} columns={[{ title: "Loại giá", dataIndex: "type", render: (value: string) => <Tag color={value === "NORMAL" ? "blue" : value === "PEAK" ? "red" : "green"}>{value}</Tag> }, { title: "Tên hiển thị", dataIndex: "name" }, { title: "Đơn giá", dataIndex: "price", align: "right", render: (value: number) => <b>{fmtMoney.format(value)} VNĐ/kWh</b> }, { title: "Khung giờ / Mô tả", dataIndex: "description" }, { title: "Hiệu lực", dataIndex: "effectiveFrom", render: (value: string) => dayjs(value).format("DD/MM/YYYY") }, { title: "Ghi chú", dataIndex: "note" }, { title: "Thao tác", render: (_: unknown, record: ElectricityPrice) => canManageCatalog ? <Button icon={<EditOutlined />} onClick={() => openPrice(record)}>Cập nhật</Button> : null }]} /></Card><TariffScheduleCard /><Modal title={editing ? "Cập nhật đơn giá" : "Thêm đơn giá"} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}><Form form={form} layout="vertical" onFinish={savePrice}><Form.Item name="type" label="Loại giá" rules={[{ required: true }]}><Select disabled={!!editing} options={priceTypeOptions} onChange={(value) => form.setFieldsValue({ name: priceTypeName[value] })} /></Form.Item><Form.Item name="name" label="Tên hiển thị" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="price" label="Đơn giá VNĐ/kWh" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item name="description" label="Khung giờ / Mô tả"><Input placeholder="Vd: 04:00-09:30, 11:30-17:00, 20:00-22:00" /></Form.Item><Form.Item name="effectiveFrom" label="Ngày hiệu lực"><DatePicker style={{ width: "100%" }} /></Form.Item><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item></Form></Modal></>;
}

export function ElectricReportsClient() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        "/api/electric/reports?startDate=" + range[0].format("YYYY-MM-DD") +
        "&endDate=" + range[1].format("YYYY-MM-DD") +
        "&groupBy=" + groupBy;
      setReport(await fetchJson<ReportData>(url));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không tải được báo cáo điện năng");
    } finally {
      setLoading(false);
    }
  }, [range, groupBy]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const trend = report?.summary.trendPercent;
  const topMeters = (report?.byMeter || []).slice(0, 8).map((m) => ({ label: m.meterCode + " - " + m.meterName, value: m.consTotal, sub: m.factoryName }));
  const topFactories = (report?.byFactory || []).slice(0, 8).map((f) => ({ label: f.factoryName, value: f.consTotal }));
  const topConsumerShare = report && report.summary.totalConsumption > 0 && report.byMeter[0]
    ? (report.byMeter[0].consTotal / report.summary.totalConsumption) * 100
    : 0;

  return (
    <>
      <PageTitle title="Báo cáo điện năng" subtitle="Tổng hợp chỉ số chốt mỗi 8h sáng (tiêu thụ ngày hôm trước) theo nhà máy, trạm, đồng hồ và nhóm đồng hồ." />
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker value={range} onChange={(value) => value && setRange(value as [Dayjs, Dayjs])} />
        <Segmented options={[{ label: "Theo ngày", value: "day" }, { label: "Theo tháng", value: "month" }]} value={groupBy} onChange={(value) => setGroupBy(value as "day" | "month")} />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="Tổng tiêu thụ" value={report?.summary.totalConsumption || 0} precision={2} suffix="kWh" prefix={<ThunderboltOutlined />} />
            {trend != null ? (
              <Text type={trend >= 0 ? "danger" : "success"} style={{ fontSize: 12 }}>
                {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(trend).toFixed(1)}% so với kỳ trước
              </Text>
            ) : <Text type="secondary" style={{ fontSize: 12 }}>Chưa có dữ liệu kỳ trước để so sánh</Text>}
          </Card>
        </Col>
        <Col xs={24} md={6}><Card><Statistic title="Chi phí điện" value={report?.summary.totalCost || 0} precision={0} suffix="VNĐ" prefix={<DollarOutlined />} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Trung bình/ngày" value={report?.summary.avgPerDay || 0} precision={2} suffix="kWh" prefix={<ApiOutlined />} /></Card></Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="Đồng hồ tốn điện nhất" value={topConsumerShare} precision={1} suffix="% tổng tiêu thụ" prefix={<FireOutlined style={{ color: "#fa541c" }} />} />
            <Text type="secondary" style={{ fontSize: 12 }}>{report?.byMeter[0] ? report.byMeter[0].meterCode + " - " + report.byMeter[0].meterName : "---"}</Text>
          </Card>
        </Col>
      </Row>

      <Card title="Xu hướng tiêu thụ điện" style={{ marginBottom: 16 }} loading={loading}>
        <TrendLineChart data={(report?.byDate || []).map((d) => ({ label: groupBy === "month" ? d.date : dayjs(d.date).format("DD/MM"), consTotal: d.consTotal, costTotal: d.costTotal }))} />
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Top đồng hồ tiêu thụ nhiều nhất" loading={loading}>
            <RankedBarChart data={topMeters} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Tỷ trọng theo khung giờ Bình thường/Cao điểm/Thấp điểm" loading={loading}>
            <DonutChart
              data={[
                { label: "Bình thường", value: report?.summary.totalNormal || 0, color: "#1677ff" },
                { label: "Cao điểm", value: report?.summary.totalPeak || 0, color: "#f5222d" },
                { label: "Thấp điểm", value: report?.summary.totalOffPeak || 0, color: "#52c41a" },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {topFactories.length > 1 ? (
        <Card title="So sánh tiêu thụ theo nhà máy" style={{ marginBottom: 16 }} loading={loading}>
          <RankedBarChart data={topFactories} />
        </Card>
      ) : null}

      <Card title="Tổng hợp theo nhà máy" style={{ marginBottom: 16 }}>
        <Table rowKey={(record) => record.factoryId || record.factoryCode} loading={loading} dataSource={report?.byFactory || []} pagination={false} columns={[{ title: "Nhà máy", dataIndex: "factoryName" }, { title: "Tiêu thụ", dataIndex: "consTotal", align: "right", render: (value: number) => fmtNumber.format(value) + " kWh" }, { title: "Chi phí", dataIndex: "costTotal", align: "right", render: (value: number) => fmtMoney.format(value) + " VNĐ" }]} />
      </Card>
      <Card title="Chi tiết theo đồng hồ">
        <Table rowKey="meterId" loading={loading} dataSource={report?.byMeter || []} columns={[{ title: "Mã ĐH", dataIndex: "meterCode", render: (value: string) => <Tag color="blue">{value}</Tag> }, { title: "Tên đồng hồ", dataIndex: "meterName" }, { title: "Nhà máy", dataIndex: "factoryName" }, { title: "Trạm", dataIndex: "substationName" }, { title: "Máy biến áp", dataIndex: "transformerUnitName" }, { title: "Nhóm", dataIndex: "groupName" }, { title: "Tiêu thụ", dataIndex: "consTotal", align: "right", render: (value: number) => fmtNumber.format(value) + " kWh" }, { title: "Chi phí", dataIndex: "costTotal", align: "right", render: (value: number) => fmtMoney.format(value) + " VNĐ" }]} />
      </Card>
    </>
  );
}

export function ElectricOverviewClient() {
  const [report, setReport] = useState<ReportData | null>(null); const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  useEffect(() => { const startDate = dayjs().startOf("month").format("YYYY-MM-DD"); const endDate = dayjs().format("YYYY-MM-DD"); fetchJson<ReportData>("/api/electric/reports?startDate=" + startDate + "&endDate=" + endDate).then(setReport).catch(() => undefined); fetchJson<Telemetry[]>("/api/energy/telemetry?take=8").then(setTelemetry).catch(() => undefined); }, []);
  return <><PageTitle title="Tổng quan điện năng" subtitle="Ảnh nhanh tiêu thụ tháng hiện tại và telemetry gần nhất." /><Row gutter={[12,12]} style={{ marginBottom: 16 }}><Col xs={24} md={8}><Card><Statistic title="Tiêu thụ tháng" value={report?.summary.totalConsumption || 0} precision={2} suffix="kWh" prefix={<ThunderboltOutlined />} /></Card></Col><Col xs={24} md={8}><Card><Statistic title="Chi phí tháng" value={report?.summary.totalCost || 0} precision={0} suffix="VNĐ" prefix={<DollarOutlined />} /></Card></Col><Col xs={24} md={8}><Card><Statistic title="Ngày có dữ liệu" value={report?.summary.daysWithData || 0} suffix="ngày" prefix={<SaveOutlined />} /></Card></Col></Row><Card title="Telemetry AUTO gần nhất"><Table rowKey="id" dataSource={telemetry} pagination={false} columns={[{ title: "Thời điểm", dataIndex: "timestamp", render: (value: string) => dayjs(value).format("DD/MM/YYYY HH:mm:ss") }, { title: "Đồng hồ", render: (_: unknown, record: Telemetry) => (record.meter?.code || "") + " - " + (record.meter?.name || "") }, { title: "Tổng kWh", dataIndex: "totalEnergy", align: "right", render: (value: number) => fmtNumber.format(value) }]} /></Card></>;
}
