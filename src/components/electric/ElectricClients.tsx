"use client";

import {
  ApiOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  InfoCircleOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  WarningOutlined,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DonutChart, RankedBarChart, TrendLineChart } from "./Charts";
import { MeterFace } from "./MeterFace";

function useRole() {
  const { data: session } = useSession();
  const sessionUser = session?.user as
    | { role?: string; factoryIds?: string[] }
    | undefined;
  const role = sessionUser?.role;
  const userFactoryIds = Array.isArray(sessionUser?.factoryIds)
    ? sessionUser.factoryIds
    : [];
  return {
    role,
    userFactoryIds,
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

function getMeterFactoryId(meter: ElectricMeter) {
  return (
    meter.factoryId ||
    meter.factory?.id ||
    meter.transformer?.factoryId ||
    meter.transformer?.factory?.id ||
    meter.transformerUnit?.transformer?.factoryId ||
    meter.transformerUnit?.transformer?.factory?.id ||
    null
  );
}

function canInputMeterByFactory(
  meter: ElectricMeter,
  role?: string,
  userFactoryIds: string[] = [],
) {
  if (role === "ADMIN" || userFactoryIds.length === 0) return true;
  const meterFactoryId = getMeterFactoryId(meter);
  return !!meterFactoryId && userFactoryIds.includes(meterFactoryId);
}

type ElectricMeter = {
  id: string;
  code: string;
  name: string;
  meterNo?: string | null;
  factoryId?: string | null;
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
  isNonProduction?: boolean;
  note?: string | null;
  factory?: Factory | null;
  group?: MeterGroup | null;
  transformer?: Transformer | null;
  transformerUnit?: TransformerUnit | null;
  todayRecord?: PowerRecord | null;
  lastRecord?: PowerRecord | null;
  previousConsTotal?: number | null;
  avgConsumption7d?: number | null;
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

/**
 * Báo cáo điện năng chia làm 2 lớp và KHÔNG cộng vào nhau:
 *  - billed* : số liệu công tơ Trung thế (EVN) — tiền THẬT, tính đúng 3 khung giá.
 *  - internal*: tổng đồng hồ Hạ thế — điện đi đâu trong nhà máy. Chi phí của từng đồng hồ
 *    hạ thế (`costTotal`) là chi phí ĐÃ PHÂN BỔ NGƯỢC từ hóa đơn EVN theo tỷ trọng kWh,
 *    nên tổng lại luôn khớp hóa đơn. `costRaw` là con số cũ do đồng hồ tự tính (chỉ để đối chiếu).
 */
type ReportData = {
  summary: {
    billedConsumption: number;
    billedCost: number;
    totalConsumption: number; // alias của billedConsumption
    totalCost: number; // alias của billedCost
    totalNormal: number;
    totalPeak: number;
    totalOffPeak: number;
    internalConsumption: number;
    productionCost: number;
    productionCons: number;
    nonProductionCost: number;
    nonProductionCons: number;
    lossConsumption: number;
    lossPercent: number;
    hasNegativeLoss: boolean;
    avgUnitPrice: number;
    avgPerDay: number;
    daysWithData: number;
    mvMeterCount: number;
    lvMeterCount: number;
    prevPeriodConsumption: number;
    trendPercent: number | null;
    warnings: string[];
  };
  byDate: Array<{
    date: string;
    consTotal: number;
    costTotal: number;
    internalCons: number;
  }>;
  byMeter: Array<{
    meterId: string;
    meterCode: string;
    meterName: string;
    meterType: number;
    isAuto: boolean;
    isNonProduction?: boolean;
    factoryName?: string;
    groupName: string;
    substationName: string;
    transformerUnitName: string;
    consTotal: number;
    costTotal: number;
    costRaw: number;
  }>;
  byMvMeter?: Array<{
    meterId: string;
    meterCode: string;
    meterName: string;
    factoryName: string;
    consTotal: number;
    consNormal: number;
    consPeak: number;
    consOffPeak: number;
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
    hasMv: boolean;
    consTotal: number;
    costTotal: number;
    billedCons: number;
    billedCost: number;
    internalCons: number;
    lossCons: number;
    lossPercent: number;
    avgUnitPrice: number;
  }>;
};

const fmtNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
// Dùng RIÊNG cho trang nhập liệu: KHÔNG ngăn cách hàng nghìn (để tránh nhầm lẫn
// giữa dấu chấm và dấu phẩy giữa các máy khác nhau), chỉ giữ dấu thập phân.
const fmtInput = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, useGrouping: false });

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || data?.message || "HTTP " + response.status);
  }

  return data as T;
}

function postBody(
  method: "POST" | "PUT" | "DELETE",
  body: object,
): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Chưa đủ dữ liệu để vẽ biểu đồ"
      />
    );
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
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#faad14"
        strokeWidth={2}
      />
      {points.map((point, index) => {
        const [x, y] = point.split(",");
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={index === points.length - 1 ? 3.5 : 2}
            fill="#faad14"
          />
        );
      })}
    </svg>
  );
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Title level={3} style={{ margin: 0 }}>
        {title}
      </Title>
      <Text type="secondary">{subtitle}</Text>
    </div>
  );
}

export function ElectricCatalogClient() {
  const { canManageCatalog } = useRole();
  const [loading, setLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [transformerUnits, setTransformerUnits] = useState<TransformerUnit[]>(
    [],
  );
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [groups, setGroups] = useState<MeterGroup[]>([]);
  const [energyTypes, setEnergyTypes] = useState<EnergyType[]>([]);
  const [factoryModalOpen, setFactoryModalOpen] = useState(false);
  const [transformerModalOpen, setTransformerModalOpen] = useState(false);
  const [transformerUnitModalOpen, setTransformerUnitModalOpen] =
    useState(false);
  const [meterModalOpen, setMeterModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [energyTypeModalOpen, setEnergyTypeModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);
  const [editingTransformer, setEditingTransformer] =
    useState<Transformer | null>(null);
  const [editingTransformerUnit, setEditingTransformerUnit] =
    useState<TransformerUnit | null>(null);
  const [editingMeter, setEditingMeter] = useState<ElectricMeter | null>(null);
  const [editingGroup, setEditingGroup] = useState<MeterGroup | null>(null);
  const [editingEnergyType, setEditingEnergyType] = useState<EnergyType | null>(
    null,
  );
  const [meterFilterFactory, setMeterFilterFactory] = useState<string>();
  const [meterFilterTransformer, setMeterFilterTransformer] =
    useState<string>();
  const [meterFilterTransformerUnit, setMeterFilterTransformerUnit] =
    useState<number>();
  const [formFactory] = Form.useForm();
  const [formTransformer] = Form.useForm();
  const [formTransformerUnit] = Form.useForm();
  const [formMeter] = Form.useForm();
  const [formGroup] = Form.useForm();
  const [formEnergyType] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        nextFactories,
        nextTransformers,
        nextTransformerUnits,
        nextMeters,
        nextGroups,
        nextEnergyTypes,
      ] = await Promise.all([
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
      message.error(
        error instanceof Error
          ? error.message
          : "Không tải được danh mục điện năng",
      );
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
    formTransformerUnit.setFieldsValue(
      record || { isActive: true, ratedCapacityUnit: "kVA" },
    );
    setTransformerUnitModalOpen(true);
  };

  const openMeter = (record?: ElectricMeter) => {
    setEditingMeter(record || null);
    formMeter.resetFields();
    formMeter.setFieldsValue(
      record
        ? { ...record, factoryId: record.factoryId || record.factory?.id }
        : {
            isActive: true,
            type: 1,
            isAuto: false,
            gatewayPort: 502,
            registerAddr: 0,
            tu: 1,
            ti: 1,
          },
    );
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
    await fetchJson<Factory>(
      "/api/electric/factories",
      postBody(editingFactory ? "PUT" : "POST", {
        ...values,
        id: editingFactory?.id,
      }),
    );
    message.success("Đã lưu nhà máy");
    setFactoryModalOpen(false);
    await load();
  };

  const saveTransformer = async (values: Record<string, unknown>) => {
    await fetchJson<Transformer>(
      "/api/electric/substations",
      postBody(editingTransformer ? "PUT" : "POST", {
        ...values,
        id: editingTransformer?.id,
      }),
    );
    message.success("Đã lưu trạm biến áp");
    setTransformerModalOpen(false);
    await load();
  };

  const saveTransformerUnit = async (values: Record<string, unknown>) => {
    await fetchJson<TransformerUnit>(
      "/api/electric/transformer-units",
      postBody(editingTransformerUnit ? "PUT" : "POST", {
        ...values,
        id: editingTransformerUnit?.id,
      }),
    );
    message.success("Da luu may bien ap");
    setTransformerUnitModalOpen(false);
    await load();
  };

  const saveMeter = async (values: Record<string, unknown>) => {
    await fetchJson<ElectricMeter>(
      "/api/electric/meters",
      postBody(editingMeter ? "PUT" : "POST", {
        ...values,
        id: editingMeter?.id,
      }),
    );
    message.success("Đã lưu đồng hồ điện");
    setMeterModalOpen(false);
    await load();
  };

  const saveGroup = async (values: Record<string, unknown>) => {
    await fetchJson<MeterGroup>(
      "/api/electric/meter-groups",
      postBody(editingGroup ? "PUT" : "POST", {
        ...values,
        id: editingGroup?.id,
      }),
    );
    message.success("Đã lưu nhóm đồng hồ");
    setGroupModalOpen(false);
    await load();
  };

  const saveEnergyType = async (values: Record<string, unknown>) => {
    await fetchJson<EnergyType>(
      "/api/electric/energy-types",
      postBody(editingEnergyType ? "PUT" : "POST", {
        ...values,
        id: editingEnergyType?.id,
      }),
    );
    message.success("Đã lưu loại điện năng");
    setEnergyTypeModalOpen(false);
    await load();
  };

  const filteredTransformers = useMemo(
    () =>
      transformers.filter(
        (item) => !meterFilterFactory || item.factoryId === meterFilterFactory,
      ),
    [transformers, meterFilterFactory],
  );

  const filteredTransformerUnits = useMemo(
    () =>
      transformerUnits.filter((item) => {
        if (
          meterFilterTransformer &&
          item.transformerId !== meterFilterTransformer
        )
          return false;
        return (
          !meterFilterFactory ||
          item.transformer?.factoryId === meterFilterFactory
        );
      }),
    [transformerUnits, meterFilterFactory, meterFilterTransformer],
  );

  const filteredMeters = useMemo(
    () =>
      meters.filter((meter) => {
        if (meter.type === 2) return false; // Trung thế hiện ở tab riêng
        if (
          meterFilterTransformer &&
          meter.transformerId !== meterFilterTransformer
        )
          return false;
        if (
          meterFilterTransformerUnit &&
          meter.transformerUnitId !== meterFilterTransformerUnit
        )
          return false;
        return (
          !meterFilterFactory ||
          meter.transformer?.factoryId === meterFilterFactory
        );
      }),
    [
      meters,
      meterFilterFactory,
      meterFilterTransformer,
      meterFilterTransformerUnit,
    ],
  );

  const mvMeters = useMemo(
    () => meters.filter((meter) => meter.type === 2),
    [meters],
  );

  const meterColumns: ColumnsType<ElectricMeter> = [
    {
      title: "Mã",
      dataIndex: "code",
      width: 110,
      render: (value: string) => <b>{value}</b>,
    },
    { title: "Tên đồng hồ", dataIndex: "name" },
    {
      title: "Mô tả",
      dataIndex: "note",
      render: (value?: string | null) =>
        value || <Text type="secondary">---</Text>,
    },

    {
      title: "Chế độ",
      dataIndex: "isAuto",
      render: (isAuto: boolean, record) =>
        isAuto ? (
          <div>
            <Tag color="green">AUTO</Tag>
            <Text type="secondary">
              {record.gatewayIp}:{record.gatewayPort} / ID {record.modbusId}
            </Text>
          </div>
        ) : (
          <Tag color="gold">MANUAL</Tag>
        ),
    },
    {
      title: "TU/TI",
      render: (_, record) => String(record.tu) + " / " + String(record.ti),
    },
    {
      title: "Nhà máy",
      render: (_, record) => record.transformer?.factory?.name || "---",
    },
    { title: "Trạm", render: (_, record) => record.transformer?.name || "---" },
    {
      title: "Máy biến áp",
      render: (_, record) => record.transformerUnit?.name || "---",
    },
    { title: "Nhóm", render: (_, record) => record.group?.name || "---" },
    {
      title: "Thao tác",
      width: 110,
      render: (_, record) =>
        canManageCatalog ? (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openMeter(record)}
            />
            <Popconfirm
              title="Xóa hoặc ngưng dùng đồng hồ này?"
              onConfirm={() => deleteRecord("/api/electric/meters", record.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <>
      <PageTitle
        title="Danh mục điện năng"
        subtitle="Quản lý nhà máy, trạm biến áp, đồng hồ, nhóm đồng hồ và loại điện năng."
      />
      <Card>
        <Tabs
          items={[
            {
              key: "factories",
              label: "Nhà máy",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openFactory()}
                    >
                      Thêm nhà máy
                    </Button>
                  )}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={factories}
                    pagination={false}
                    columns={[
                      {
                        title: "Mã",
                        dataIndex: "code",
                        render: (value: string) => <b>{value}</b>,
                      },
                      { title: "Tên nhà máy", dataIndex: "name" },
                      { title: "Vị trí", dataIndex: "location" },
                      {
                        title: "Số trạm",
                        render: (_: unknown, record: Factory) =>
                          record._count?.transformers ?? 0,
                      },
                      {
                        title: "Trạng thái",
                        dataIndex: "isActive",
                        render: (value: boolean) => (
                          <Tag color={value ? "green" : "default"}>
                            {value ? "Đang dùng" : "Ngưng"}
                          </Tag>
                        ),
                      },
                      {
                        title: "Thao tác",
                        render: (_: unknown, record: Factory) =>
                          canManageCatalog ? (
                            <Space>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openFactory(record)}
                              />
                              <Popconfirm
                                title="Xóa hoặc ngưng dùng nhà máy này?"
                                onConfirm={() =>
                                  deleteRecord(
                                    "/api/electric/factories",
                                    record.id,
                                  )
                                }
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
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
                  {canManageCatalog && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openTransformer()}
                    >
                      Thêm trạm biến áp
                    </Button>
                  )}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={transformers}
                    columns={[
                      {
                        title: "Mã trạm",
                        dataIndex: "code",
                        render: (value: string) => <b>{value}</b>,
                      },
                      { title: "Tên trạm", dataIndex: "name" },
                      {
                        title: "Nhà máy",
                        render: (_: unknown, record: Transformer) =>
                          record.factory?.name || "---",
                      },
                      { title: "Vị trí", dataIndex: "location" },
                      { title: "kVA", dataIndex: "capacityKva" },
                      {
                        title: "Thao tác",
                        render: (_: unknown, record: Transformer) =>
                          canManageCatalog ? (
                            <Space>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openTransformer(record)}
                              />
                              <Popconfirm
                                title="Xóa hoặc ngưng dùng trạm này?"
                                onConfirm={() =>
                                  deleteRecord(
                                    "/api/electric/substations",
                                    record.id,
                                  )
                                }
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
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
                  {canManageCatalog && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openTransformerUnit()}
                    >
                      Thêm máy biến áp
                    </Button>
                  )}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={transformerUnits}
                    columns={[
                      {
                        title: "Mã máy",
                        dataIndex: "code",
                        render: (value: string) => <b>{value}</b>,
                      },
                      { title: "Tên máy biến áp", dataIndex: "name" },
                      {
                        title: "Trạm",
                        render: (_: unknown, record: TransformerUnit) =>
                          record.transformer?.name || "---",
                      },
                      {
                        title: "Nhà máy",
                        render: (_: unknown, record: TransformerUnit) =>
                          record.transformer?.factory?.name || "---",
                      },
                      { title: "Hãng", dataIndex: "manufacturer" },
                      {
                        title: "Năm SX",
                        dataIndex: "manufacturingYear",
                        width: 90,
                      },
                      { title: "Serial", dataIndex: "serialNumber" },
                      {
                        title: "Công suất",
                        render: (_: unknown, record: TransformerUnit) =>
                          record.ratedCapacity
                            ? fmtNumber.format(record.ratedCapacity) +
                              " " +
                              (record.ratedCapacityUnit || "kVA")
                            : "---",
                      },
                      { title: "Cấp điện áp", dataIndex: "voltageLevel" },
                      { title: "Dòng định mức", dataIndex: "ratedCurrent" },
                      {
                        title: "Số đồng hồ",
                        render: (_: unknown, record: TransformerUnit) =>
                          record._count?.meters ?? 0,
                      },
                      {
                        title: "Thao tác",
                        render: (_: unknown, record: TransformerUnit) =>
                          canManageCatalog ? (
                            <Space>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openTransformerUnit(record)}
                              />
                              <Popconfirm
                                title="Xóa hoặc ngưng dùng máy biến áp này?"
                                onConfirm={() =>
                                  deleteRecord(
                                    "/api/electric/transformer-units",
                                    String(record.id),
                                  )
                                }
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
                              </Popconfirm>
                            </Space>
                          ) : null,
                      },
                    ]}
                    scroll={{ x: 1180 }}
                  />
                </Space>
              ),
            },
            {
              key: "meters",
              label: "ĐH Hạ thế",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Row gutter={[8, 8]} justify="space-between">
                    <Col>
                      <Space wrap>
                        <Select
                          allowClear
                          placeholder="Lọc theo nhà máy"
                          style={{ width: 190 }}
                          value={meterFilterFactory}
                          onChange={(value) => {
                            setMeterFilterFactory(value);
                            setMeterFilterTransformer(undefined);
                            setMeterFilterTransformerUnit(undefined);
                          }}
                          options={factories.map((factory) => ({
                            label: factory.name,
                            value: factory.id,
                          }))}
                        />
                        <Select
                          allowClear
                          placeholder="Lọc theo trạm biến áp"
                          style={{ width: 220 }}
                          value={meterFilterTransformer}
                          onChange={(value) => {
                            setMeterFilterTransformer(value);
                            setMeterFilterTransformerUnit(undefined);
                          }}
                          disabled={!meterFilterFactory}
                          options={filteredTransformers.map((transformer) => ({
                            label: transformer.name,
                            value: transformer.id,
                          }))}
                        />
                        <Select
                          allowClear
                          placeholder="Lọc theo máy biến áp"
                          style={{ width: 220 }}
                          value={meterFilterTransformerUnit}
                          onChange={setMeterFilterTransformerUnit}
                          disabled={!meterFilterTransformer}
                          options={filteredTransformerUnits.map((unit) => ({
                            label: unit.name,
                            value: unit.id,
                          }))}
                        />
                      </Space>
                    </Col>
                    <Col>
                      {canManageCatalog && (
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => openMeter()}
                        >
                          Thêm đồng hồ
                        </Button>
                      )}
                    </Col>
                  </Row>
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={filteredMeters}
                    columns={meterColumns}
                    scroll={{ x: 980 }}
                  />
                </Space>
              ),
            },
            {
              key: "mv-meters",
              label: "ĐH Trung thế",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        formMeter.resetFields();
                        formMeter.setFieldsValue({
                          isActive: true,
                          type: 2,
                          isAuto: false,
                          gatewayPort: 502,
                          registerAddr: 0,
                          tu: 1,
                          ti: 1,
                        });
                        setEditingMeter(null);
                        setMeterModalOpen(true);
                      }}
                    >
                      Thêm ĐH trung thế
                    </Button>
                  )}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={mvMeters}
                    columns={[
                      {
                        title: "Mã",
                        dataIndex: "code",
                        width: 110,
                        render: (value: string) => <b>{value}</b>,
                      },
                      { title: "Tên đồng hồ", dataIndex: "name" },
                      {
                        title: "Nhà máy",
                        render: (_: unknown, record: ElectricMeter) =>
                          record.factory?.name || "---",
                      },
                      { title: "Serial", dataIndex: "meterNo" },
                      {
                        title: "Hệ số nhân",
                        width: 130,
                        align: "right",
                        render: (_: unknown, record: ElectricMeter) => {
                          const factor =
                            (record.tu || 1) * (record.ti || 1);
                          return factor > 1 ? (
                            <Tag color="gold">
                              ×{factor} (TU {record.tu} / TI {record.ti})
                            </Tag>
                          ) : (
                            <Tag color="red">Chưa đặt (×1)</Tag>
                          );
                        },
                      },
                      {
                        title: "Mô tả",
                        dataIndex: "note",
                        render: (value?: string | null) =>
                          value || <Text type="secondary">---</Text>,
                      },
                      {
                        title: "Trạng thái",
                        dataIndex: "isActive",
                        render: (value: boolean) => (
                          <Tag color={value ? "green" : "default"}>
                            {value ? "Đang dùng" : "Ngưng"}
                          </Tag>
                        ),
                      },
                      {
                        title: "Thao tác",
                        width: 110,
                        render: (_: unknown, record: ElectricMeter) =>
                          canManageCatalog ? (
                            <Space>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openMeter(record)}
                              />
                              <Popconfirm
                                title="Xóa hoặc ngưng dùng đồng hồ này?"
                                onConfirm={() =>
                                  deleteRecord(
                                    "/api/electric/meters",
                                    record.id,
                                  )
                                }
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
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
              key: "groups",
              label: "Nhóm đồng hồ",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openGroup()}
                    >
                      Thêm nhóm đồng hồ
                    </Button>
                  )}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={groups}
                    columns={[
                      {
                        title: "Mã nhóm",
                        dataIndex: "code",
                        render: (value: string) => <b>{value}</b>,
                      },
                      { title: "Tên nhóm", dataIndex: "name" },
                      { title: "Mô tả", dataIndex: "description" },
                      { title: "Thứ tự", dataIndex: "sortOrder", width: 100 },
                      {
                        title: "Thao tác",
                        render: (_: unknown, record: MeterGroup) =>
                          canManageCatalog ? (
                            <Space>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openGroup(record)}
                              />
                              <Popconfirm
                                title="Xóa hoặc ngưng dùng nhóm này?"
                                onConfirm={() =>
                                  deleteRecord(
                                    "/api/electric/meter-groups",
                                    record.id,
                                  )
                                }
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
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
              key: "energyTypes",
              label: "Loại điện năng",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {canManageCatalog && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openEnergyType()}
                    >
                      Thêm loại điện năng
                    </Button>
                  )}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={energyTypes}
                    pagination={false}
                    columns={[
                      {
                        title: "Mã",
                        dataIndex: "code",
                        render: (value: string) => <b>{value}</b>,
                      },
                      { title: "Tên loại", dataIndex: "name" },
                      { title: "Ghi chú", dataIndex: "note" },
                      {
                        title: "Trạng thái",
                        dataIndex: "isActive",
                        render: (value: boolean) => (
                          <Tag color={value ? "green" : "default"}>
                            {value ? "Đang dùng" : "Ngưng"}
                          </Tag>
                        ),
                      },
                      {
                        title: "Thao tác",
                        render: (_: unknown, record: EnergyType) =>
                          canManageCatalog ? (
                            <Space>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openEnergyType(record)}
                              />
                              <Popconfirm
                                title="Xóa loại điện năng này?"
                                onConfirm={() =>
                                  deleteRecord(
                                    "/api/electric/energy-types",
                                    record.id,
                                  )
                                }
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
                              </Popconfirm>
                            </Space>
                          ) : null,
                      },
                    ]}
                  />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editingFactory ? "Sửa nhà máy" : "Thêm nhà máy"}
        open={factoryModalOpen}
        onCancel={() => setFactoryModalOpen(false)}
        onOk={() => formFactory.submit()}
      >
        <Form form={formFactory} layout="vertical" onFinish={saveFactory}>
          <Form.Item
            name="code"
            label="Mã nhà máy"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="name"
            label="Tên nhà máy"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="location" label="Vị trí">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingTransformer ? "Sửa trạm biến áp" : "Thêm trạm biến áp"}
        open={transformerModalOpen}
        onCancel={() => setTransformerModalOpen(false)}
        onOk={() => formTransformer.submit()}
      >
        <Form
          form={formTransformer}
          layout="vertical"
          onFinish={saveTransformer}
        >
          <Form.Item
            name="factoryId"
            label="Nhà máy"
            rules={[{ required: true }]}
          >
            <Select
              options={factories.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="code" label="Mã trạm" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Tên trạm" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="capacityKva" label="Công suất kVA">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="location" label="Vị trí">
            <Input />
          </Form.Item>
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingTransformerUnit ? "Sửa máy biến áp" : "Thêm máy biến áp"}
        open={transformerUnitModalOpen}
        width={760}
        onCancel={() => setTransformerUnitModalOpen(false)}
        onOk={() => formTransformerUnit.submit()}
      >
        <Form
          form={formTransformerUnit}
          layout="vertical"
          onFinish={saveTransformerUnit}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="transformerId"
                label="Trạm biến áp"
                rules={[{ required: true }]}
              >
                <Select
                  options={transformers.map((item) => ({
                    label: item.factory
                      ? item.factory.name + " - " + item.name
                      : item.name,
                    value: item.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="code"
                label="Mã máy biến áp"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="name"
                label="Tên máy biến áp"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="manufacturer" label="Hãng sản xuất">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="manufacturingYear" label="Năm sản xuất">
                <InputNumber min={1900} max={2100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="serialNumber" label="Số Seri">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="ratedCapacity" label="Công suất định mức">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="ratedCapacityUnit" label="Đơn vị công suất">
                <Select
                  options={[
                    { label: "kVA", value: "kVA" },
                    { label: "MVA", value: "MVA" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="voltageLevel" label="Cấp điện áp">
                <Input placeholder="22/0.4 kV" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="ratedCurrent" label="Dòng điện định mức">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingGroup ? "Sửa nhóm đồng hồ" : "Thêm nhóm đồng hồ"}
        open={groupModalOpen}
        onCancel={() => setGroupModalOpen(false)}
        onOk={() => formGroup.submit()}
      >
        <Form form={formGroup} layout="vertical" onFinish={saveGroup}>
          <Form.Item name="code" label="Mã nhóm" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Tên nhóm" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sortOrder" label="Thứ tự">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingEnergyType ? "Sửa loại điện năng" : "Thêm loại điện năng"}
        open={energyTypeModalOpen}
        onCancel={() => setEnergyTypeModalOpen(false)}
        onOk={() => formEnergyType.submit()}
      >
        <Form form={formEnergyType} layout="vertical" onFinish={saveEnergyType}>
          <Form.Item
            name="code"
            label="Mã loại điện"
            rules={[{ required: true }]}
          >
            <Input disabled={!!editingEnergyType} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Tên loại điện"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingMeter ? "Sửa đồng hồ điện" : "Thêm đồng hồ điện"}
        open={meterModalOpen}
        width={760}
        onCancel={() => setMeterModalOpen(false)}
        onOk={() => formMeter.submit()}
      >
        <Form form={formMeter} layout="vertical" onFinish={saveMeter}>
          <Form.Item name="type" hidden>
            <InputNumber />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item
                name="code"
                label="Mã đồng hồ"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item
                name="name"
                label="Tên đồng hồ"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Form.Item
              noStyle
              shouldUpdate={(prev, next) => prev.type !== next.type}
            >
              {({ getFieldValue }) =>
                getFieldValue("type") === 2 ? (
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="factoryId"
                      label="Nhà máy"
                      rules={[{ required: true }]}
                    >
                      <Select
                        options={factories.map((item) => ({
                          label: item.name,
                          value: item.id,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                ) : (
                  <>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="transformerId"
                        label="Trạm biến áp"
                        rules={[{ required: true }]}
                      >
                        <Select
                          allowClear
                          options={transformers.map((item) => ({
                            label: item.factory
                              ? item.factory.name + " - " + item.name
                              : item.name,
                            value: item.id,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        noStyle
                        shouldUpdate={(prev, next) =>
                          prev.transformerId !== next.transformerId
                        }
                      >
                        {({ getFieldValue: gfv }) => (
                          <Form.Item
                            name="transformerUnitId"
                            label="Máy biến áp"
                          >
                            <Select
                              allowClear
                              options={transformerUnits
                                .filter(
                                  (unit) =>
                                    !gfv("transformerId") ||
                                    unit.transformerId === gfv("transformerId"),
                                )
                                .map((unit) => ({
                                  label: unit.name,
                                  value: unit.id,
                                }))}
                            />
                          </Form.Item>
                        )}
                      </Form.Item>
                    </Col>
                  </>
                )
              }
            </Form.Item>
            <Col xs={24} md={12}>
              <Form.Item name="groupId" label="Nhóm đồng hồ">
                <Select
                  allowClear
                  options={groups.map((item) => ({
                    label: item.name,
                    value: item.id,
                  }))}
                />
              </Form.Item>
            </Col>
            {/* Hệ số nhân (TU × TI) ÁP DỤNG CHO MỌI LOẠI ĐỒNG HỒ.
                Trước đây khối này bị ẩn khi type === 2 (trung thế), khiến công tơ EVN
                luôn giữ tu = ti = 1 -> sản lượng chỉ bằng hiệu số thô, THIẾU hệ số nhân.
                Công thức đúng: (chỉ số sau − chỉ số trước) × TU × TI, áp cho cả 3 khung giờ. */}
            <Col xs={24} md={8}>
              <Form.Item
                name="tu"
                label="TU (hệ số biến áp đo lường)"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="ti"
                label="TI (hệ số biến dòng đo lường)"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, next) =>
                  prev.tu !== next.tu || prev.ti !== next.ti
                }
              >
                {({ getFieldValue }) => {
                  const factor =
                    (Number(getFieldValue("tu")) || 1) *
                    (Number(getFieldValue("ti")) || 1);
                  return (
                    <Form.Item label="Hệ số nhân (TU × TI)">
                      <Input
                        readOnly
                        value={String(factor)}
                        style={{ fontWeight: 600 }}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Sản lượng = (chỉ số sau − chỉ số trước) × {factor}
                      </Text>
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="meterNo" label="Số serial">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.type !== next.type}
          >
            {({ getFieldValue }) =>
              getFieldValue("type") === 2 ? null : (
                <Card
                  size="small"
                  title="Cấu hình thu thập tự động qua Gateway"
                  style={{ marginBottom: 16 }}
                >
                  <Form.Item
                    name="isAuto"
                    label="Chế độ lấy số"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="AUTO" unCheckedChildren="MANUAL" />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, next) => prev.isAuto !== next.isAuto}
                  >
                    {({ getFieldValue: gfv }) =>
                      gfv("isAuto") ? (
                        <Row gutter={12}>
                          <Col xs={24} md={10}>
                            <Form.Item
                              name="gatewayIp"
                              label="Gateway IP"
                              rules={[{ required: true }]}
                            >
                              <Input placeholder="192.168.1.253" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={7}>
                            <Form.Item
                              name="gatewayPort"
                              label="Gateway Port"
                              rules={[{ required: true }]}
                            >
                              <InputNumber min={1} style={{ width: "100%" }} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={7}>
                            <Form.Item
                              name="modbusId"
                              label="Slave ID"
                              rules={[{ required: true }]}
                            >
                              <InputNumber
                                min={1}
                                max={255}
                                style={{ width: "100%" }}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={7}>
                            <Form.Item
                              name="registerAddr"
                              label="Register Active Energy"
                            >
                              <InputNumber min={0} style={{ width: "100%" }} />
                            </Form.Item>
                          </Col>
                        </Row>
                      ) : null
                    }
                  </Form.Item>
                </Card>
              )
            }
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.type !== next.type}
          >
            {({ getFieldValue }) =>
              getFieldValue("type") === 2 ? null : (
                <Form.Item
                  name="isNonProduction"
                  label="Ngoài sản xuất"
                  valuePropName="checked"
                  tooltip="Đồng hồ phục vụ văn phòng, bơm chữa cháy... Vẫn tính trong hóa đơn EVN của nhà máy nhưng được tách riêng khi báo cáo chi phí."
                >
                  <Switch
                    checkedChildren="Ngoài SX"
                    unCheckedChildren="Sản xuất"
                  />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="note" label="Mô tả / khu vực đo">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

type DailyDraft = {
  currTotal: string;
  isReset: boolean;
  unitPrice: string;
  note: string;
};

type DraftEvaluation = {
  status: "empty" | "error" | "warn" | "high" | "low" | "ok";
  delta: number;
  cons: number;
  message: string;
};

const DRAFT_ROW_STYLE: Record<DraftEvaluation["status"], React.CSSProperties> =
  {
    empty: {},
    error: { background: "#fff1f0" },
    warn: { background: "#fffbe6" },
    high: { background: "#fff7e6" },
    low: { background: "#e6f4ff" },
    ok: { background: "#f6ffed" },
  };

function evaluateDraft(
  meter: ElectricMeter,
  draft?: DailyDraft,
): DraftEvaluation {
  if (!draft || draft.currTotal === "" || draft.currTotal === undefined) {
    return { status: "empty", delta: 0, cons: 0, message: "Chưa nhập chỉ số" };
  }
  const curr = Number(draft.currTotal);
  if (Number.isNaN(curr)) {
    return {
      status: "empty",
      delta: 0,
      cons: 0,
      message: "Giá trị không hợp lệ",
    };
  }
  // Chưa có kỳ trước (lần đầu tuyệt đối): bản ghi MỐC GỐC, chưa tính tiêu thụ (khớp backend).
  if (!meter.lastRecord) {
    return {
      status: "warn",
      delta: 0,
      cons: 0,
      message: "Chỉ số đầu kỳ (mốc gốc) — chưa tính tiêu thụ.",
    };
  }
  const prev = Number(meter.lastRecord.currTotal ?? 0);

  // Tụt số / reset: backend không tính tiêu thụ, chờ kiểm tra & nhập tay.
  if (draft.isReset || curr < prev) {
    if (!draft.isReset) {
      return {
        status: "error",
        delta: 0,
        cons: 0,
        message: "Chỉ số mới nhỏ hơn kỳ trước. Bật Reset nếu đã thay đồng hồ.",
      };
    }
    return {
      status: "warn",
      delta: 0,
      cons: 0,
      message: "Reset/thay đồng hồ — chưa tính tiêu thụ, cần kiểm tra.",
    };
  }

  const delta = Math.max(0, curr - prev);
  const cons = delta * (meter.tu || 1) * (meter.ti || 1);
  const avg = Number(meter.avgConsumption7d ?? 0);
  if (cons === 0) {
    return {
      status: "warn",
      delta,
      cons,
      message: "Không có tiêu thụ so với kỳ trước.",
    };
  }
  if (avg > 0 && cons > avg * 3) {
    return {
      status: "high",
      delta,
      cons,
      message:
        "Cao bất thường so với TB 7 ngày (" + fmtInput.format(avg) + " kWh).",
    };
  }
  if (avg > 0 && cons < avg * 0.25) {
    return {
      status: "low",
      delta,
      cons,
      message:
        "Thấp bất thường so với TB 7 ngày (" + fmtInput.format(avg) + " kWh).",
    };
  }
  return { status: "ok", delta, cons, message: "Chênh lệch hợp lệ." };
}

function getCurrentConsumption(meter: ElectricMeter, draft?: DailyDraft) {
  if (meter.todayRecord) return Number(meter.todayRecord.consTotal || 0);
  if (meter.type === 2) return null;
  const evaluation = evaluateDraft(meter, draft);
  if (evaluation.status === "empty" || evaluation.status === "error") return null;
  return evaluation.cons;
}

function ConsumptionTrend({
  current,
  previous,
}: {
  current: number | null;
  previous: number | null;
}) {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.005) {
    return (
      <Tag color="default" style={{ margin: 0 }}>
        Ngang hôm trước
      </Tag>
    );
  }
  const color = diff > 0 ? "red" : "green";
  const Icon = diff > 0 ? ArrowUpOutlined : ArrowDownOutlined;
  return (
    <Tag color={color} icon={<Icon />} style={{ margin: 0 }}>
      {diff > 0 ? "Cao hơn" : "Thấp hơn"} {fmtInput.format(Math.abs(diff))}
    </Tag>
  );
}

function DraftStatusChip({ evaluation }: { evaluation: DraftEvaluation }) {
  if (evaluation.status === "empty") {
    return <Text type="secondary">---</Text>;
  }
  const config: Record<
    DraftEvaluation["status"],
    { color: string; icon: React.ReactNode }
  > = {
    empty: { color: "default", icon: null },
    error: { color: "red", icon: <ExclamationCircleOutlined /> },
    warn: { color: "gold", icon: <WarningOutlined /> },
    high: { color: "orange", icon: <WarningOutlined /> },
    low: { color: "blue", icon: <InfoCircleOutlined /> },
    ok: { color: "green", icon: <CheckCircleOutlined /> },
  };
  const { color, icon } = config[evaluation.status];
  return (
    <Space direction="vertical" size={0} style={{ lineHeight: 1.2 }}>
      <Text strong style={{ fontSize: 15 }}>
        {fmtInput.format(evaluation.cons)} kWh
      </Text>
      <Tag color={color} style={{ margin: 0 }} icon={icon}>
        {evaluation.message}
      </Tag>
    </Space>
  );
}

export function ElectricDailyInputClient() {
  const { role, userFactoryIds, canEditDaily } = useRole();
  const [selectedDate, setSelectedDate] = useState<Dayjs>(
    dayjs().subtract(1, "day"),
  );
  const [factories, setFactories] = useState<Factory[]>([]);
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [transformerUnits, setTransformerUnits] = useState<TransformerUnit[]>(
    [],
  );
  const [groups, setGroups] = useState<MeterGroup[]>([]);
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<string>();
  const [selectedTransformer, setSelectedTransformer] = useState<string>();
  const [selectedTransformerUnit, setSelectedTransformerUnit] =
    useState<number>();
  const [selectedGroup, setSelectedGroup] = useState<string>();
  const [modeFilter, setModeFilter] = useState<"all" | "manual" | "auto">(
    "all",
  );
  // Ref: giữ DOM input theo meterId để Enter có thể focus sang đồng hồ kế tiếp.
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [keyword, setKeyword] = useState("");
  const [currentMeter, setCurrentMeter] = useState<ElectricMeter | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DailyDraft>>({});
  const [form] = Form.useForm();
  const watchedValues = Form.useWatch([], form) as
    | Record<string, number | boolean | string | undefined>
    | undefined;
  const currentLastRecord = currentMeter?.lastRecord ?? null;
  const canInputMeter = useCallback(
    (meter: ElectricMeter) =>
      canEditDaily && canInputMeterByFactory(meter, role, userFactoryIds),
    [canEditDaily, role, userFactoryIds],
  );

  useEffect(() => {
    Promise.all([
      fetchJson<Factory[]>("/api/electric/factories"),
      fetchJson<Transformer[]>("/api/electric/substations"),
      fetchJson<TransformerUnit[]>("/api/electric/transformer-units"),
      fetchJson<MeterGroup[]>("/api/electric/meter-groups"),
    ])
      .then(
        ([
          nextFactories,
          nextTransformers,
          nextTransformerUnits,
          nextGroups,
        ]) => {
          const activeFactories = nextFactories.filter((item) => item.isActive);
          setFactories(activeFactories);
          setTransformers(nextTransformers.filter((item) => item.isActive));
          setTransformerUnits(
            nextTransformerUnits.filter((item) => item.isActive),
          );
          setGroups(nextGroups.filter((item) => item.isActive));
          // Mặc định chọn sẵn một nhà máy để không bao giờ hiển thị trạng thái "không chọn":
          // ưu tiên nhà máy đầu tiên trong quyền của user (nếu có giới hạn),
          // nếu ADMIN hoặc không giới hạn thì lấy nhà máy đầu danh sách.
          setSelectedFactory((prev) => {
            if (prev) return prev; // user đã chọn rồi thì không đổi
            if (userFactoryIds.length > 0) {
              const own = activeFactories.find((f) => userFactoryIds.includes(f.id));
              if (own) return own.id;
            }
            return activeFactories[0]?.id;
          });
        },
      )
      .catch(() => message.error("Không tải được danh mục điện năng"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTransformers = useMemo(
    () =>
      transformers.filter(
        (item) => !selectedFactory || item.factoryId === selectedFactory,
      ),
    [transformers, selectedFactory],
  );

  const filteredDailyTransformerUnits = useMemo(
    () =>
      transformerUnits.filter((item) => {
        if (selectedTransformer && item.transformerId !== selectedTransformer)
          return false;
        return (
          !selectedFactory || item.transformer?.factoryId === selectedFactory
        );
      }),
    [transformerUnits, selectedFactory, selectedTransformer],
  );

  const loadMeters = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date: selectedDate.format("YYYY-MM-DD"),
      });
      if (selectedTransformer) params.set("substationId", selectedTransformer);
      if (selectedTransformerUnit)
        params.set("transformerUnitId", String(selectedTransformerUnit));
      if (!selectedTransformer && selectedFactory)
        params.set("factoryId", selectedFactory);
      const nextMeters = await fetchJson<ElectricMeter[]>(
        "/api/electric/daily-status?" + params.toString(),
      );
      setMeters(nextMeters);
      const nextDrafts: Record<string, DailyDraft> = {};
      for (const meter of nextMeters) {
        if (meter.type === 2) continue;
        const record = meter.todayRecord;
        nextDrafts[meter.id] = {
          currTotal:
            record?.currTotal !== undefined && record?.currTotal !== null
              ? String(record.currTotal)
              : "",
          isReset: record?.isReset ?? false,
          unitPrice:
            record?.unitPrice !== undefined && record?.unitPrice !== null
              ? String(record.unitPrice)
              : "",
          note: record?.note ?? "",
        };
      }
      setDrafts(nextDrafts);
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không tải được trạng thái chốt số",
      );
    } finally {
      setLoading(false);
    }
  }, [
    selectedDate,
    selectedFactory,
    selectedTransformer,
    selectedTransformerUnit,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMeters(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMeters]);

  const updateDraft = (meterId: string, patch: Partial<DailyDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [meterId]: {
        ...(prev[meterId] || {
          currTotal: "",
          isReset: false,
          unitPrice: "",
          note: "",
        }),
        ...patch,
      },
    }));
  };

  const displayedMeters = useMemo(
    () =>
      meters.filter((meter) => {
        if (meter.type === 2) return false; // Trung thế nhập ở trang riêng
        const normalizedKeyword = keyword.trim().toLowerCase();
        if (selectedGroup && meter.groupId !== selectedGroup) return false;
        if (modeFilter === "manual" && meter.isAuto) return false;
        if (modeFilter === "auto" && !meter.isAuto) return false;
        if (!normalizedKeyword) return true;
        return [meter.code, meter.name, meter.meterNo || ""].some((value) =>
          value.toLowerCase().includes(normalizedKeyword),
        );
      }),
    [meters, selectedGroup, modeFilter, keyword],
  );

  const totalMeters = meters.length;
  const doneMeters = meters.filter((meter) => meter.todayRecord).length;
  const pendingMeters = totalMeters - doneMeters;
  const manualPending = meters.filter(
    (meter) => !meter.isAuto && !meter.todayRecord,
  ).length;
  const autoFallbackPending = meters.filter(
    (meter) => meter.isAuto && !meter.todayRecord,
  ).length;

  const readyToSaveCount = useMemo(() => {
    let count = 0;
    for (const meter of meters) {
      if (meter.type === 2) continue;
      if (meter.todayRecord) continue;
      if (!canInputMeter(meter)) continue;
      const evaluation = evaluateDraft(meter, drafts[meter.id]);
      if (evaluation.status !== "empty" && evaluation.status !== "error")
        count += 1;
    }
    return count;
  }, [meters, drafts, canInputMeter]);

  const errorCount = useMemo(() => {
    let count = 0;
    for (const meter of meters) {
      if (meter.type === 2) continue;
      const evaluation = evaluateDraft(meter, drafts[meter.id]);
      if (evaluation.status === "error") count += 1;
    }
    return count;
  }, [meters, drafts]);

  const persistDraft = useCallback(
    async (meter: ElectricMeter, draft: DailyDraft) => {
      await fetchJson(
        "/api/electric/daily-input",
        postBody("POST", {
          meterId: meter.id,
          recordDate: selectedDate.format("YYYY-MM-DD"),
          prevTotal: Number(meter.lastRecord?.currTotal ?? 0),
          currTotal: Number(draft.currTotal),
          isReset: draft.isReset,
          unitPrice:
            draft.unitPrice === "" ? undefined : Number(draft.unitPrice),
          note: draft.note || null,
        }),
      );
    },
    [selectedDate],
  );

  const saveInline = async (meter: ElectricMeter) => {
    if (!canInputMeter(meter)) {
      message.warning("Chi duoc nhap lieu cho dong ho thuoc nha may cua user");
      return;
    }
    const draft = drafts[meter.id];
    const evaluation = evaluateDraft(meter, draft);
    if (evaluation.status === "empty") {
      message.warning("Chưa nhập chỉ số cho " + meter.code);
      return;
    }
    if (evaluation.status === "error") {
      message.error(evaluation.message);
      return;
    }
    setSavingId(meter.id);
    try {
      await persistDraft(meter, draft);
      message.success("Đã lưu " + meter.code);
      await loadMeters();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không lưu được");
    } finally {
      setSavingId(null);
    }
  };

  const saveAll = async () => {
    const jobs: Array<{ meter: ElectricMeter; draft: DailyDraft }> = [];
    for (const meter of meters) {
      if (meter.type === 2) continue;
      if (meter.todayRecord) continue;
      if (!canInputMeter(meter)) continue;
      const draft = drafts[meter.id];
      const evaluation = evaluateDraft(meter, draft);
      if (evaluation.status === "empty" || evaluation.status === "error")
        continue;
      jobs.push({ meter, draft });
    }
    if (!jobs.length) {
      message.warning("Không có đồng hồ nào sẵn sàng lưu");
      return;
    }
    setSavingAll(true);
    let ok = 0;
    let fail = 0;
    for (const job of jobs) {
      try {
        await persistDraft(job.meter, job.draft);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setSavingAll(false);
    if (fail) {
      message.warning("Đã lưu " + ok + "/" + jobs.length + ", lỗi " + fail);
    } else {
      message.success("Đã lưu " + ok + " đồng hồ");
    }
    await loadMeters();
  };

  const openRecord = (meter: ElectricMeter) => {
    setCurrentMeter(meter);
    form.resetFields();
    const lastRecord = meter.lastRecord;
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

  // Xóa bản ghi đã nhập (khi người dùng lỡ tay chọn sai ngày). Backend sẽ chặn
  // nếu đồng hồ đã có bản ghi ngày sau (bảo vệ chuỗi delta).
  const deleteInlineRecord = async (meter: ElectricMeter) => {
    if (!canInputMeter(meter) || !meter.todayRecord) return;
    try {
      const res = await fetch(
        "/api/electric/daily-input?id=" +
          encodeURIComponent(meter.todayRecord.id),
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409 && err?.error === "BLOCKED_BY_LATER_RECORDS") {
          const dates = Array.isArray(err.laterDates)
            ? err.laterDates.slice(0, 3).join(", ")
            : "";
          message.error(
            "Không xóa được: đồng hồ đã có bản ghi ngày sau (" +
              dates +
              "...). Hãy xóa từ ngày mới nhất về cũ.",
          );
          return;
        }
        message.error(err?.message || err?.error || "Không xóa được bản ghi");
        return;
      }
      message.success(
        "Đã xóa bản ghi của " +
          meter.code +
          ". Nhớ chọn đúng ngày và nhập lại.",
      );
      await loadMeters();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không xóa được");
    }
  };

  const saveRecord = async () => {
    if (currentMeter && !canInputMeter(currentMeter)) {
      message.warning("Chi duoc nhap lieu cho dong ho thuoc nha may cua user");
      return;
    }
    const values = await form.validateFields();
    if (
      currentMeter?.type !== 2 &&
      !values.isReset &&
      Number(values.currTotal || 0) < Number(values.prevTotal || 0)
    ) {
      message.error(
        "Chỉ số sau nhỏ hơn chỉ số trước. Bật reset nếu đã thay đồng hồ.",
      );
      return;
    }
    await fetchJson(
      "/api/electric/daily-input",
      postBody("POST", {
        ...values,
        recordDate: selectedDate.format("YYYY-MM-DD"),
      }),
    );
    message.success("Đã chốt chỉ số MANUAL");
    setModalOpen(false);
    await loadMeters();
  };

  const lvBaseline =
    currentMeter?.type !== 2 &&
    !currentLastRecord &&
    !(Number(watchedValues?.prevTotal || 0) > 0);
  const lowVoltageDelta =
    currentMeter?.type !== 2
      ? lvBaseline || watchedValues?.isReset
        ? 0
        : Math.max(
            0,
            Number(watchedValues?.currTotal || 0) -
              Number(watchedValues?.prevTotal || 0),
          ) *
          (currentMeter?.tu || 1) *
          (currentMeter?.ti || 1)
      : 0;
  const mediumVoltageDelta =
    currentMeter?.type === 2
      ? [
          Math.max(
            0,
            Number(watchedValues?.currNormal || 0) -
              Number(currentLastRecord?.currNormal || 0),
          ),
          Math.max(
            0,
            Number(watchedValues?.currPeak || 0) -
              Number(currentLastRecord?.currPeak || 0),
          ),
          Math.max(
            0,
            Number(watchedValues?.currOffPeak || 0) -
              Number(currentLastRecord?.currOffPeak || 0),
          ),
        ].reduce((sum, value) => sum + value, 0) *
        (currentMeter?.tu || 1) *
        (currentMeter?.ti || 1)
      : 0;

  return (
    <>
      {/* Tắt hover cho dòng đã chốt ở bảng nhập liệu: hover mặc định Ant Design là xám nhạt
           gần trắng, đè lên nền xanh khiến người dùng tưởng chưa nhập. Giữ nền xanh khi hover. */}
      <style jsx global>{`
        /* Nền xanh cho cả cell bình thường LẪN cell fixed (fix-left/fix-right).
           Ant Design tách cell fixed thành lớp riêng để có nền trắng khi cuộn ngang,
           nên nếu không đè tường minh, cột "Đồng hồ" và "Thao tác" sẽ vẫn trắng. */
        .ant-table-tbody > tr.row-done > td,
        .ant-table-tbody > tr.row-done > td.ant-table-cell-fix-left,
        .ant-table-tbody > tr.row-done > td.ant-table-cell-fix-right {
          background: #d9f7be !important;
        }
        /* Giữ nền xanh khi hover để tránh nhìn "hụt màu" (hover mặc định là xám nhạt). */
        .ant-table-tbody > tr.row-done:hover > td,
        .ant-table-tbody > tr.row-done > td.ant-table-cell-row-hover {
          background: #d9f7be !important;
        }

        /* Segmented (chip lọc): tăng tương phản giữa chip đang chọn và chip không chọn.
           Mặc định Ant Design là trắng vs xám-trắng, nhìn thoáng qua khó phân biệt
           - nhất là khi nền trang đã chuyển sang xám nhạt. */
        .ant-segmented {
          background: #e5ecf5;
          padding: 3px;
        }
        .ant-segmented .ant-segmented-item {
          color: #475569; /* chữ xám đậm cho chip không chọn - rõ hơn đen nhạt mặc định */
          transition: color 0.2s, background 0.2s;
        }
        .ant-segmented .ant-segmented-item:hover:not(.ant-segmented-item-selected) {
          color: #1677ff;
          background: rgba(22, 119, 255, 0.08);
        }
        .ant-segmented .ant-segmented-item-selected {
          background: #1677ff; /* nền xanh đậm cho chip đang chọn */
          color: #ffffff;
          font-weight: 600;
          box-shadow: 0 2px 6px rgba(22, 119, 255, 0.35);
        }
        .ant-segmented .ant-segmented-item-selected .ant-segmented-item-label {
          color: #ffffff;
        }
      `}</style>
      <PageTitle
        title="Nhập chỉ số điện"
        subtitle="Lọc theo nhà máy / trạm / máy biến áp và nhập trực tiếp trên bảng. Hệ thống tự tính kWh, cảnh báo nếu nhập sai."
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6}>
            <DatePicker
              value={selectedDate}
              onChange={(value) => value && setSelectedDate(value)}
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
              // Chỉ cho chọn từ hôm qua trở về quá khứ: ngày hôm nay và tương lai chưa kết thúc,
              // chưa có đủ dữ liệu để chốt số.
              disabledDate={(d) => !!d && !d.isBefore(dayjs().startOf("day"))}
            />
          </Col>
          <Col xs={24} md={13}>
            {/* Chọn nhà máy dạng chip - luôn có 1 nhà máy được chọn, không có trạng thái "tất cả"
                vì mỗi lượt nhập liệu chỉ tập trung 1 nhà máy. */}
            <Segmented
              block
              value={selectedFactory ?? ""}
              onChange={(value) => {
                setSelectedFactory(String(value));
                setSelectedTransformer(undefined);
                setSelectedTransformerUnit(undefined);
              }}
              options={factories.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Col>
          <Col xs={24} md={5}>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadMeters}
              loading={loading}
              block
            >
              Tải lại
            </Button>
          </Col>
        </Row>

        {/* Hàng 2 - Lọc theo vị trí (trạm + máy biến áp) - chỉ hiện khi có trạm trong nhà máy đã chọn. */}
        {filteredTransformers.length > 0 && (
          <Row gutter={[12, 12]} align="middle" style={{ marginTop: 12 }}>
            <Col xs={24} md={16}>
              {/* Chọn trạm dạng chip Segmented: với tối đa 2 trạm/nhà máy hiện tại (+ "Tất cả") là 3 chip,
                  bấm 1 lần nhanh hơn dropdown. */}
              <Segmented
                block
                value={selectedTransformer ?? ""}
                onChange={(value) => {
                  setSelectedTransformer(value === "" ? undefined : String(value));
                  setSelectedTransformerUnit(undefined);
                }}
                options={[
                  { label: "Tất cả trạm", value: "" },
                  ...filteredTransformers.map((item) => ({ label: item.name, value: item.id })),
                ]}
              />
            </Col>
            <Col xs={24} md={8}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Máy biến áp"
                value={selectedTransformerUnit}
                onChange={setSelectedTransformerUnit}
                options={filteredDailyTransformerUnits.map((item) => ({
                  label: item.name,
                  value: item.id,
                }))}
                style={{ width: "100%" }}
              />
            </Col>
          </Row>
        )}

        {/* Hàng 3 - Lọc mềm (nhóm + chế độ + tìm kiếm). */}
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} md={8}>
            <Select
              allowClear
              placeholder="Nhóm đồng hồ"
              value={selectedGroup}
              onChange={setSelectedGroup}
              options={groups.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={10}>
            <Segmented
              block
              options={[
                { label: "Tất cả", value: "all" },
                { label: "MANUAL", value: "manual" },
                { label: "AUTO", value: "auto" },
              ]}
              value={modeFilter}
              onChange={(value) =>
                setModeFilter(value as "all" | "manual" | "auto")
              }
            />
          </Col>
          <Col xs={24} md={6}>
            <Input.Search
              allowClear
              placeholder="Tìm mã, tên, serial"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Tổng đồng hồ"
              value={totalMeters}
              suffix="đồng hồ"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Đã chốt"
              value={doneMeters}
              suffix={"/ " + totalMeters}
              valueStyle={{ color: "#389e0d" }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Chưa chốt"
              value={pendingMeters}
              suffix={"/ " + manualPending + " MANUAL"}
              valueStyle={{ color: pendingMeters ? "#cf1322" : "#389e0d" }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="AUTO cần dự phòng"
              value={autoFallbackPending}
              suffix="đồng hồ"
              valueStyle={{
                color: autoFallbackPending ? "#d46b08" : undefined,
              }}
            />
          </Card>
        </Col>
      </Row>

      {errorCount > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            "Có " +
            errorCount +
            " đồng hồ nhập sai (chỉ số mới nhỏ hơn kỳ trước). Vui lòng kiểm tra hoặc bật Reset trước khi lưu."
          }
        />
      )}
      {autoFallbackPending > 0 && errorCount === 0 && selectedDate.isBefore(dayjs().startOf("day")) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Có đồng hồ AUTO chưa chốt cho ngày này. Nếu Gateway hoặc mạng lỗi, có thể nhập MANUAL tạm thời."
        />
      )}

      {canEditDaily && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Row justify="space-between" align="middle" gutter={[12, 12]}>
            <Col>
              <Space wrap>
                <Text type="secondary">Hướng dẫn:</Text>
                <Text>
                  Nhập chỉ số vào ô, hệ thống tự tính chênh lệch kWh và cảnh báo
                  bằng màu.
                </Text>
                <Tag color="green">Hợp lệ</Tag>
                <Tag color="gold">Không tiêu thụ</Tag>
                <Tag color="orange">Bất thường</Tag>
                <Tag color="red">Sai</Tag>
              </Space>
            </Col>
            <Col>
              <Popconfirm
                title={"Lưu " + readyToSaveCount + " đồng hồ hợp lệ?"}
                description="Chỉ lưu những dòng đã nhập chỉ số và không có lỗi. Các dòng đã chốt sẽ bị bỏ qua."
                okText="Lưu tất cả"
                cancelText="Huỷ"
                disabled={!readyToSaveCount}
                onConfirm={() => void saveAll()}
              >
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={savingAll}
                  disabled={!readyToSaveCount}
                >
                  Lưu tất cả ({readyToSaveCount})
                </Button>
              </Popconfirm>
            </Col>
          </Row>
        </Card>
      )}

      <Table
        rowKey="id"
        loading={loading}
        dataSource={displayedMeters}
        pagination={{
          pageSize: 15,
          showSizeChanger: true,
          pageSizeOptions: [10, 15, 25, 50],
        }}
        scroll={{ x: 1460 }}
        rowClassName={(record) => (record.todayRecord ? "row-done" : "")}
        onRow={(record) => {
          // Đã chốt: nền xanh đậm hơn + viền trái đậm để dễ liếc. Hover được tắt
          // qua class `row-done` ở CSS bên dưới để tránh nhìn "hụt màu" khi di chuột qua.
          if (record.todayRecord)
            return {
              style: { background: "#d9f7be", borderLeft: "3px solid #52c41a" },
            };
          if (record.type === 2) return {};
          const evaluation = evaluateDraft(record, drafts[record.id]);
          return { style: DRAFT_ROW_STYLE[evaluation.status] };
        }}
        columns={[
          {
            title: "Đồng hồ",
            width: 220,
            fixed: "left" as const,
            render: (_: unknown, record: ElectricMeter) => (
              <Space direction="vertical" size={0}>
                <b>{record.code}</b>
                <Text>{record.name}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Serial: {record.meterNo || "---"}
                </Text>
              </Space>
            ),
          },
          {
            title: "Vị trí",
            width: 170,
            render: (_: unknown, record: ElectricMeter) => (
              <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
                <Text style={{ fontSize: 13 }}>
                  {record.transformer?.factory?.name || "---"}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Trạm: {record.transformer?.name || "---"}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Máy: {record.transformerUnit?.name || "---"}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Nhóm: {record.group?.name || "---"}
                </Text>
              </Space>
            ),
          },
          {
            title: "Loại",
            width: 100,
            render: (_: unknown, record: ElectricMeter) => (
              <Space direction="vertical" size={4}>
                <Tag
                  color={record.type === 2 ? "purple" : "blue"}
                  style={{ margin: 0 }}
                >
                  {record.type === 2 ? "Trung thế" : "Hạ thế"}
                </Tag>
                <Tag
                  color={record.isAuto ? "green" : "gold"}
                  style={{ margin: 0 }}
                >
                  {record.isAuto ? "AUTO" : "MANUAL"}
                </Tag>
                {(record.tu > 1 || record.ti > 1) && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    TU/TI: {record.tu}/{record.ti}
                  </Text>
                )}
              </Space>
            ),
          },
          {
            title: "Chỉ số cũ",
            width: 150,
            render: (_: unknown, record: ElectricMeter) => {
              const last = record.lastRecord;
              const avg = record.avgConsumption7d;
              return (
                <Space direction="vertical" size={0}>
                  <Text strong style={{ fontSize: 15 }}>
                    {last ? fmtInput.format(Number(last.currTotal)) : "---"}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {last
                      ? dayjs(last.recordDate).format("DD/MM/YYYY")
                      : "Chưa có"}
                  </Text>
                  {avg && avg > 0 ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      TB 7 ngày: {fmtInput.format(avg)} kWh
                    </Text>
                  ) : null}
                </Space>
              );
            },
          },
          {
            title: "Chỉ số hôm nay",
            width: 220,
            render: (_: unknown, record: ElectricMeter) => {
              if (record.todayRecord) {
                return (
                  <Space direction="vertical" size={0}>
                    <Text strong style={{ fontSize: 15, color: "#389e0d" }}>
                      {record.type === 2
                        ? fmtInput.format(Number(record.todayRecord.currTotal))
                        : fmtInput.format(
                            Number(record.todayRecord.currTotal),
                          )}
                    </Text>
                    <Tag
                      color={
                        record.todayRecord.dataSource === "AUTO"
                          ? "green"
                          : "orange"
                      }
                      style={{ margin: 0 }}
                    >
                      Đã chốt · {record.todayRecord.dataSource}
                    </Tag>
                  </Space>
                );
              }
              if (record.type === 2) {
                return (
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => openRecord(record)}
                    disabled={!canInputMeter(record)}
                  >
                    Nhập 3 chỉ số
                  </Button>
                );
              }
              const draft = drafts[record.id];
              return (
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  <InputNumber
                    min={0}
                    placeholder="Nhập chỉ số mới"
                    style={{ width: "100%" }}
                    value={
                      draft?.currTotal === "" || draft?.currTotal === undefined
                        ? null
                        : Number(draft.currTotal)
                    }
                    onChange={(value) =>
                      updateDraft(record.id, {
                        currTotal:
                          value === null || value === undefined
                            ? ""
                            : String(value),
                      })
                    }
                    onPressEnter={async () => {
                      await saveInline(record);
                      // Sau khi lưu xong, nhảy sang Ổ input của đồng hồ MANUAL kế tiếp CHƯA chốt
                      // trong danh sách đang hiển thị (bỏ qua trung thế và những dòng đã chốt).
                      setTimeout(() => {
                        const list = displayedMeters;
                        const idx = list.findIndex((m) => m.id === record.id);
                        for (let i = idx + 1; i < list.length; i += 1) {
                          const next = list[i];
                          if (next.type === 2) continue;
                          if (next.todayRecord) continue;
                          const el = inputRefs.current[next.id];
                          if (el) {
                            el.focus();
                            el.select?.();
                            break;
                          }
                        }
                      }, 0);
                    }}
                    disabled={!canInputMeter(record)}
                    controls={false}
                    ref={(el: unknown) => {
                      // InputNumber của antd expose HTMLInputElement qua ref.input
                      const anyEl = el as { input?: HTMLInputElement } | null;
                      inputRefs.current[record.id] = anyEl?.input ?? null;
                    }}
                  />
                  <Space size={6}>
                    <Switch
                      size="small"
                      checked={draft?.isReset ?? false}
                      onChange={(checked) =>
                        updateDraft(record.id, { isReset: checked })
                      }
                      disabled={!canInputMeter(record)}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Reset / thay đồng hồ
                    </Text>
                  </Space>
                </Space>
              );
            },
          },
          {
            title: "Số chữ hôm trước",
            width: 180,
            render: (_: unknown, record: ElectricMeter) => {
              const previous =
                record.previousConsTotal === undefined ||
                record.previousConsTotal === null
                  ? null
                  : Number(record.previousConsTotal);
              const current = getCurrentConsumption(record, drafts[record.id]);
              return (
                <Space direction="vertical" size={4}>
                  <Text strong style={{ fontSize: 15 }}>
                    {previous === null ? "---" : fmtInput.format(previous)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.lastRecord
                      ? dayjs(record.lastRecord.recordDate).format(
                          "DD/MM/YYYY",
                        )
                      : "Chưa có"}
                  </Text>
                  <ConsumptionTrend current={current} previous={previous} />
                </Space>
              );
            },
          },
          {
            title: "Số chữ điện (kWh)",
            width: 200,
            render: (_: unknown, record: ElectricMeter) => {
              if (record.todayRecord) {
                return (
                  <Space direction="vertical" size={0}>
                    <Text strong style={{ fontSize: 15, color: "#389e0d" }}>
                      {fmtInput.format(Number(record.todayRecord.consTotal))}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Đã tính
                    </Text>
                  </Space>
                );
              }
              if (record.type === 2) {
                return <Text type="secondary">---</Text>;
              }
              return (
                <DraftStatusChip
                  evaluation={evaluateDraft(record, drafts[record.id])}
                />
              );
            },
          },
          {
            title: "Thao tác",
            width: 140,
            fixed: "right" as const,
            render: (_: unknown, record: ElectricMeter) => {
              if (!canEditDaily) return null;
              if (!canInputMeter(record))
                return <Tag color="default">Chi xem</Tag>;
              if (record.todayRecord) {
                return (
                  <Space size={4}>
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => openRecord(record)}
                      size="small"
                    >
                      Sửa
                    </Button>
                    <Popconfirm
                      title={
                        "Xóa bản ghi " +
                        dayjs(record.todayRecord.recordDate).format(
                          "DD/MM/YYYY",
                        ) +
                        "?"
                      }
                      description="Dùng khi lỡ chọn sai ngày. Sau khi xóa, chọn đúng ngày và nhập lại."
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void deleteInlineRecord(record)}
                    >
                      <Button icon={<DeleteOutlined />} size="small" danger />
                    </Popconfirm>
                  </Space>
                );
              }
              if (record.type === 2) {
                return null;
              }
              const evaluation = evaluateDraft(record, drafts[record.id]);
              return (
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    size="small"
                    block
                    loading={savingId === record.id}
                    disabled={
                      !canInputMeter(record) ||
                      evaluation.status === "empty" ||
                      evaluation.status === "error"
                    }
                    onClick={() => void saveInline(record)}
                  >
                    Lưu
                  </Button>
                  <Button
                    size="small"
                    block
                    icon={<EditOutlined />}
                    onClick={() => openRecord(record)}
                  >
                    Chi tiết
                  </Button>
                </Space>
              );
            },
          },
        ]}
      />

      <Modal
        title={
          (currentMeter?.todayRecord ? "Sửa chỉ số: " : "Nhập chỉ số: ") +
          (currentMeter?.code || "")
        }
        open={modalOpen}
        width={820}
        onCancel={() => setModalOpen(false)}
        onOk={saveRecord}
        okText="Lưu MANUAL"
        okButtonProps={{
          disabled: currentMeter ? !canInputMeter(currentMeter) : true,
        }}
      >
        <Form form={form} layout="vertical">
          {currentMeter?.isAuto ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Đồng hồ AUTO chỉ nên nhập tay khi mạng, cáp hoặc Gateway gặp sự cố."
            />
          ) : null}
          <Form.Item name="meterId" hidden>
            <Input />
          </Form.Item>
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic
                  title="Kỳ trước"
                  value={
                    currentMeter?.type === 2
                      ? currentLastRecord?.recordDate
                        ? dayjs(currentLastRecord.recordDate).format(
                            "DD/MM/YYYY",
                          )
                        : "---"
                      : Number(currentLastRecord?.currTotal ?? 0)
                  }
                  suffix={currentMeter?.type === 2 ? undefined : "kWh"}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic
                  title="TU/TI"
                  value={
                    (currentMeter?.tu || 1) + " / " + (currentMeter?.ti || 1)
                  }
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic
                  title="Ước tính"
                  value={
                    currentMeter?.type === 2
                      ? mediumVoltageDelta
                      : lowVoltageDelta
                  }
                  precision={2}
                  suffix="kWh"
                />
              </Card>
            </Col>
          </Row>
          {currentMeter?.type === 2 ? (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="Đồng hồ trung thế: nhập 3 chỉ số hiển thị trên mặt đồng hồ. Hệ thống sẽ tính lại theo đơn giá từng khung giờ."
              />
              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="currNormal"
                    label="Chỉ số Bình thường"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                  <Text type="secondary">
                    Trước:{" "}
                    {fmtInput.format(
                      Number(currentLastRecord?.currNormal || 0),
                    )}
                  </Text>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="currPeak"
                    label="Chỉ số Cao điểm"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                  <Text type="secondary">
                    Trước:{" "}
                    {fmtInput.format(Number(currentLastRecord?.currPeak || 0))}
                  </Text>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="currOffPeak"
                    label="Chỉ số Thấp điểm"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                  <Text type="secondary">
                    Trước:{" "}
                    {fmtInput.format(
                      Number(currentLastRecord?.currOffPeak || 0),
                    )}
                  </Text>
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Form.Item
                name="isReset"
                label="Reset / thay đồng hồ"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item name="prevTotal" label="Chỉ số trước">
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="currTotal"
                    label="Chỉ số sau"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="unitPrice" label="Đơn giá">
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}
          <Form.Item name="note" label="Ghi chú sự cố / lý do nhập tay">
            <Input.TextArea
              rows={2}
              placeholder="Vd: Gateway mất kết nối, đứt cáp mạng, thay đồng hồ..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ElectricLiveClient() {
  const { canEditDaily } = useRole();
  const [factories, setFactories] = useState<Factory[]>([]);
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [transformerUnits, setTransformerUnits] = useState<TransformerUnit[]>(
    [],
  );
  const [groups, setGroups] = useState<MeterGroup[]>([]);
  const [meters, setMeters] = useState<ElectricMeter[]>([]);
  const [filterFactoryId, setFilterFactoryId] = useState<string>();
  const [filterTransformerId, setFilterTransformerId] = useState<string>();
  const [filterTransformerUnitId, setFilterTransformerUnitId] =
    useState<number>();
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
      .then(
        ([
          nextFactories,
          nextTransformers,
          nextTransformerUnits,
          nextGroups,
          nextMeters,
        ]) => {
          setFactories(nextFactories.filter((item) => item.isActive));
          setTransformers(nextTransformers.filter((item) => item.isActive));
          setTransformerUnits(
            nextTransformerUnits.filter((item) => item.isActive),
          );
          setGroups(nextGroups.filter((item) => item.isActive));
          setMeters(
            nextMeters.filter((meter) => meter.isActive && meter.isAuto),
          );
        },
      )
      .catch(() => message.error("Không tải được dữ liệu realtime điện năng"));
  }, []);

  const filteredTransformers = useMemo(
    () =>
      transformers.filter(
        (item) => !filterFactoryId || item.factoryId === filterFactoryId,
      ),
    [transformers, filterFactoryId],
  );

  const filteredLiveTransformerUnits = useMemo(
    () =>
      transformerUnits.filter((item) => {
        if (filterTransformerId && item.transformerId !== filterTransformerId)
          return false;
        return (
          !filterFactoryId || item.transformer?.factoryId === filterFactoryId
        );
      }),
    [transformerUnits, filterFactoryId, filterTransformerId],
  );

  const filteredMeters = useMemo(
    () =>
      meters.filter((meter) => {
        if (filterFactoryId && meter.transformer?.factoryId !== filterFactoryId)
          return false;
        if (filterTransformerId && meter.transformerId !== filterTransformerId)
          return false;
        if (
          filterTransformerUnitId &&
          meter.transformerUnitId !== filterTransformerUnitId
        )
          return false;
        if (filterGroupId && meter.groupId !== filterGroupId) return false;
        return true;
      }),
    [
      meters,
      filterFactoryId,
      filterTransformerId,
      filterTransformerUnitId,
      filterGroupId,
    ],
  );

  const meter = meters.find((item) => item.id === selectedMeterId);

  const loadHistory = useCallback(async (meterId: string) => {
    setHistoryLoading(true);
    try {
      const data = await fetchJson<Telemetry[]>(
        "/api/energy/telemetry?meterId=" + meterId + "&take=20",
      );
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
    if (!selectedMeterId) {
      message.warning("Chọn một đồng hồ AUTO cần đọc");
      return;
    }
    setLoading(true);
    try {
      const data = await fetchJson<LiveData>(
        "/api/electric/live?meterId=" + encodeURIComponent(selectedMeterId),
      );
      setLiveData(data);
      message.success("Đã đọc realtime và lưu telemetry");
      void loadHistory(selectedMeterId);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không đọc được realtime",
      );
    } finally {
      setLoading(false);
    }
  };

  const displayValue =
    liveData?.totalEnergy ?? history[history.length - 1]?.totalEnergy ?? 0;

  return (
    <>
      <PageTitle
        title="Realtime điện năng"
        subtitle="Lọc nhanh và đọc trực tiếp từng đồng hồ AUTO qua Modbus Gateway."
      />
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8} lg={5}>
            <Select
              allowClear
              placeholder="Nhà máy"
              style={{ width: "100%" }}
              value={filterFactoryId}
              onChange={(value) => {
                setFilterFactoryId(value);
                setFilterTransformerId(undefined);
                setFilterTransformerUnitId(undefined);
                selectMeter(undefined);
              }}
              options={factories.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
            />
          </Col>
          <Col xs={24} md={8} lg={6}>
            <Select
              allowClear
              placeholder="Trạm biến áp"
              style={{ width: "100%" }}
              value={filterTransformerId}
              onChange={(value) => {
                setFilterTransformerId(value);
                setFilterTransformerUnitId(undefined);
                selectMeter(undefined);
              }}
              options={filteredTransformers.map((item) => ({
                label: item.factory
                  ? item.factory.name + " - " + item.name
                  : item.name,
                value: item.id,
              }))}
            />
          </Col>
          <Col xs={24} md={8} lg={5}>
            <Select
              allowClear
              placeholder="Nhóm đồng hồ"
              style={{ width: "100%" }}
              value={filterGroupId}
              onChange={(value) => {
                setFilterGroupId(value);
                selectMeter(undefined);
              }}
              options={groups.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
            />
          </Col>
          <Col xs={24} md={8} lg={5}>
            <Select
              allowClear
              placeholder="Máy biến áp"
              style={{ width: "100%" }}
              value={filterTransformerUnitId}
              onChange={(value) => {
                setFilterTransformerUnitId(value);
                selectMeter(undefined);
              }}
              options={filteredLiveTransformerUnits.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
            />
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
                options={filteredMeters.map((item) => ({
                  label: item.code + " - " + item.name,
                  value: item.id,
                }))}
              />
              {canEditDaily && (
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={loading}
                  onClick={readLive}
                  disabled={!selectedMeterId}
                >
                  Đọc realtime
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {!selectedMeterId ? (
        <Card>
          <Empty description="Chọn một đồng hồ AUTO để xem realtime" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card
              style={{ background: "#f8fafc", borderColor: "#dbe5f0" }}
              styles={{ body: { padding: 20 } }}
            >
              <MeterFace
                value={displayValue}
                online={!!liveData}
                label={(meter?.code || "") + " - " + (meter?.name || "")}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Card>
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="Tổng kWh hiện tại"
                      value={displayValue}
                      precision={2}
                      suffix="kWh"
                      valueStyle={{ color: "#389e0d" }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Lần đọc gần nhất"
                      value={
                        liveData
                          ? dayjs(liveData.timestamp).format("HH:mm:ss")
                          : history[history.length - 1]
                            ? dayjs(
                                history[history.length - 1].timestamp,
                              ).format("HH:mm:ss")
                            : "---"
                      }
                    />
                  </Col>
                </Row>
                {liveData ? (
                  <Text type="secondary">
                    Đã đọc lúc{" "}
                    {dayjs(liveData.timestamp).format("DD/MM/YYYY HH:mm:ss")} -
                    dữ liệu chỉ dùng realtime/biểu đồ, không dùng trực tiếp để
                    tính tiền điện.
                  </Text>
                ) : (
                  <Text type="secondary">
                    Bấm &quot;Đọc realtime&quot; để lấy chỉ số mới nhất qua
                    Gateway. Mỗi lần chỉ đọc một đồng hồ để tránh quá tải
                    Gateway.
                  </Text>
                )}
              </Card>
              <Card title="Xu hướng kWh gần đây" loading={historyLoading}>
                <Sparkline values={history.map((item) => item.totalEnergy)} />
              </Card>
              <Card size="small" title="Thông tin đồng hồ">
                <Space direction="vertical" size={4}>
                  <Text>
                    Gateway:{" "}
                    <b>
                      {meter?.gatewayIp}:{meter?.gatewayPort}
                    </b>{" "}
                    - Slave ID <b>{meter?.modbusId}</b>
                  </Text>
                  <Text>
                    Nhà máy: {meter?.transformer?.factory?.name || "---"} -
                    Trạm: {meter?.transformer?.name || "---"}
                  </Text>
                  <Text>
                    Nhóm: {meter?.group?.name || "---"} - TU/TI: {meter?.tu} /{" "}
                    {meter?.ti}
                  </Text>
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

const tariffPriceTypeName: Record<string, string> = {
  NORMAL: "Bình thường",
  PEAK: "Cao điểm",
  OFF_PEAK: "Thấp điểm",
};
const tariffPriceTypeColor: Record<string, string> = {
  NORMAL: "blue",
  PEAK: "red",
  OFF_PEAK: "green",
};
const tariffDayTypeName: Record<string, string> = {
  WEEKDAY: "Thứ 2 - Thứ 7",
  SUNDAY: "Chủ Nhật",
};

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
      setVersions(
        await fetchJson<TariffScheduleVersion[]>(
          "/api/electric/tariff-schedule",
        ),
      );
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không tải được biểu khung giờ",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const activate = async (id: string) => {
    try {
      await fetchJson(
        `/api/electric/tariff-schedule/${id}/activate`,
        postBody("POST", {}),
      );
      message.success("Đã kích hoạt phiên bản khung giờ này");
      await load();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không kích hoạt được",
      );
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
          range: [
            dayjs().startOf("day").add(r.startMinute, "minute"),
            dayjs().startOf("day").add(r.endMinute, "minute"),
          ],
        })),
    });
    setModalOpen(true);
  };

  const saveRanges = async (values: {
    ranges: Array<{
      dayType: string;
      priceType: string;
      range: [Dayjs, Dayjs];
    }>;
  }) => {
    if (!editing) return;
    setSaving(true);
    try {
      const ranges = values.ranges.map((r) => ({
        dayType: r.dayType,
        priceType: r.priceType,
        startMinute: r.range[0].hour() * 60 + r.range[0].minute(),
        endMinute: r.range[1].hour() * 60 + r.range[1].minute() || 1440,
      }));
      await fetchJson(
        "/api/electric/tariff-schedule",
        postBody("PUT", { id: editing.id, ranges }),
      );
      message.success("Đã lưu biểu khung giờ");
      setModalOpen(false);
      await load();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không lưu được biểu khung giờ",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Biểu khung giờ áp dụng tính tiền điện"
      style={{ marginTop: 16 }}
      loading={loading}
    >
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Dùng để tự động tách tiêu thụ của đồng hồ Hạ thế đọc AUTO (theo giờ)
        thành 3 khung giá Bình thường/Cao điểm/Thấp điểm, dựa trên dữ liệu
        telemetry hàng giờ. Đồng hồ Trung thế không phụ thuộc bảng này vì phần
        cứng đã tự tách sẵn 3 chỉ số.
      </Text>
      {versions.map((version) => (
        <Card
          key={version.id}
          type="inner"
          style={{ marginBottom: 12 }}
          title={
            <Space>
              {version.name}
              <Tag color={version.isActive ? "green" : "default"}>
                {version.isActive ? "Đang áp dụng" : "Chưa áp dụng"}
              </Tag>
            </Space>
          }
          extra={
            canManageCatalog ? (
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(version)}
                >
                  Sửa khoảng giờ
                </Button>
                {!version.isActive ? (
                  <Popconfirm
                    title="Kích hoạt phiên bản khung giờ này để tính tiền điện?"
                    onConfirm={() => activate(version.id)}
                  >
                    <Button size="small">Kích hoạt</Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ) : null
          }
        >
          {version.note ? (
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 8 }}
            >
              {version.note}
            </Text>
          ) : null}
          {(["WEEKDAY", "SUNDAY"] as const).map((dayType) => (
            <div key={dayType} style={{ marginBottom: 8 }}>
              <Text strong>{tariffDayTypeName[dayType]}: </Text>
              <Space wrap style={{ marginTop: 4 }}>
                {version.ranges
                  .filter((r) => r.dayType === dayType)
                  .sort((a, b) => a.startMinute - b.startMinute)
                  .map((r) => (
                    <Tag key={r.id} color={tariffPriceTypeColor[r.priceType]}>
                      {minuteToHHMM(r.startMinute)} -{" "}
                      {minuteToHHMM(r.endMinute)} (
                      {tariffPriceTypeName[r.priceType]})
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
                  <Space
                    key={field.key}
                    align="baseline"
                    style={{ display: "flex", marginBottom: 8 }}
                    wrap
                  >
                    <Form.Item
                      name={[field.name, "dayType"]}
                      rules={[{ required: true, message: "Chọn ngày" }]}
                      style={{ width: 140, marginBottom: 0 }}
                    >
                      <Select
                        placeholder="Loại ngày"
                        options={tariffDayTypeOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "priceType"]}
                      rules={[{ required: true, message: "Chọn khung giá" }]}
                      style={{ width: 140, marginBottom: 0 }}
                    >
                      <Select
                        placeholder="Khung giá"
                        options={tariffPriceTypeOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "range"]}
                      rules={[{ required: true, message: "Chọn giờ" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <TimePicker.RangePicker format="HH:mm" minuteStep={30} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add()}
                  block
                >
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
  const [prices, setPrices] = useState<ElectricityPrice[]>([]);
  const [editing, setEditing] = useState<ElectricityPrice | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPrices(await fetchJson<ElectricityPrice[]>("/api/electric/prices"));
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không tải được đơn giá điện",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const priceTypeOptions = [
    { label: "Bình thường (NORMAL)", value: "NORMAL" },
    { label: "Cao điểm (PEAK)", value: "PEAK" },
    { label: "Thấp điểm (OFF_PEAK)", value: "OFF_PEAK" },
  ];
  const priceTypeName: Record<string, string> = {
    NORMAL: "Bình thường",
    PEAK: "Cao điểm",
    OFF_PEAK: "Thấp điểm",
  };
  const openPrice = (record?: ElectricityPrice) => {
    setEditing(record || null);
    form.resetFields();
    form.setFieldsValue(
      record
        ? { ...record, effectiveFrom: dayjs(record.effectiveFrom) }
        : {
            type: "NORMAL",
            name: priceTypeName.NORMAL,
            effectiveFrom: dayjs(),
          },
    );
    setModalOpen(true);
  };
  const savePrice = async (values: {
    type: string;
    name: string;
    price: number;
    description?: string;
    effectiveFrom?: Dayjs;
    note?: string;
  }) => {
    await fetchJson(
      "/api/electric/prices",
      postBody(editing ? "PUT" : "POST", {
        ...values,
        effectiveFrom: values.effectiveFrom?.toISOString(),
      }),
    );
    message.success("Đã lưu đơn giá điện");
    setModalOpen(false);
    await load();
  };
  return (
    <>
      <PageTitle
        title="Đơn giá điện"
        subtitle="Quản lý 3 khung giá Bình thường/Cao điểm/Thấp điểm dùng khi chốt PowerRecord."
      />
      <Card
        extra={
          canManageCatalog && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openPrice()}
            >
              Thêm/Cập nhật giá
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={prices}
          columns={[
            {
              title: "Loại giá",
              dataIndex: "type",
              render: (value: string) => (
                <Tag
                  color={
                    value === "NORMAL"
                      ? "blue"
                      : value === "PEAK"
                        ? "red"
                        : "green"
                  }
                >
                  {value}
                </Tag>
              ),
            },
            { title: "Tên hiển thị", dataIndex: "name" },
            {
              title: "Đơn giá",
              dataIndex: "price",
              align: "right",
              render: (value: number) => (
                <b>{fmtMoney.format(value)} VNĐ/kWh</b>
              ),
            },
            { title: "Khung giờ / Mô tả", dataIndex: "description" },
            {
              title: "Hiệu lực",
              dataIndex: "effectiveFrom",
              render: (value: string) => dayjs(value).format("DD/MM/YYYY"),
            },
            { title: "Ghi chú", dataIndex: "note" },
            {
              title: "Thao tác",
              render: (_: unknown, record: ElectricityPrice) =>
                canManageCatalog ? (
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => openPrice(record)}
                  >
                    Cập nhật
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>
      <TariffScheduleCard />
      <Modal
        title={editing ? "Cập nhật đơn giá" : "Thêm đơn giá"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={savePrice}>
          <Form.Item name="type" label="Loại giá" rules={[{ required: true }]}>
            <Select
              disabled={!!editing}
              options={priceTypeOptions}
              onChange={(value) =>
                form.setFieldsValue({ name: priceTypeName[value] })
              }
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="Tên hiển thị"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="price"
            label="Đơn giá VNĐ/kWh"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="description" label="Khung giờ / Mô tả">
            <Input placeholder="Vd: 04:00-09:30, 11:30-17:00, 20:00-22:00" />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Ngày hiệu lực">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ElectricReportsClient() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string>();

  // Tải danh sách nhà máy đang dùng để đổ vào dropdown lọc.
  useEffect(() => {
    fetchJson<Factory[]>("/api/electric/factories")
      .then((items) => setFactories(items.filter((item) => item.isActive)))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: range[0].format("YYYY-MM-DD"),
        endDate: range[1].format("YYYY-MM-DD"),
        groupBy,
      });
      if (selectedFactoryId) params.set("factoryId", selectedFactoryId);
      setReport(
        await fetchJson<ReportData>(
          "/api/electric/reports?" + params.toString(),
        ),
      );
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không tải được báo cáo điện năng",
      );
    } finally {
      setLoading(false);
    }
  }, [range, groupBy, selectedFactoryId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const summary = report?.summary;
  const trend = summary?.trendPercent;
  const warnings = summary?.warnings || [];
  // byMeter chỉ còn đồng hồ hạ thế (nội bộ); công tơ EVN nằm riêng ở byMvMeter.
  const topMeters = (report?.byMeter || []).slice(0, 8).map((m) => ({
    label: m.meterCode + " - " + m.meterName,
    value: m.consTotal,
    sub: m.factoryName,
  }));
  const topFactories = (report?.byFactory || [])
    .slice(0, 8)
    .map((f) => ({ label: f.factoryName, value: f.billedCons }));
  // Tỷ trọng nhánh tốn nhiều nhất so với sản lượng đầu nguồn EVN.
  const topConsumerShare =
    summary && summary.billedConsumption > 0 && report?.byMeter[0]
      ? (report.byMeter[0].consTotal / summary.billedConsumption) * 100
      : 0;
  const hasNegativeLoss = summary?.hasNegativeLoss ?? false;

  return (
    <>
      <PageTitle
        title="Báo cáo điện năng"
        subtitle="Chi phí lấy từ công tơ trung thế EVN (3 khung giá). Đồng hồ hạ thế dùng để phân bổ chi phí nội bộ theo tỷ trọng kWh."
      />
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker
          value={range}
          onChange={(value) => value && setRange(value as [Dayjs, Dayjs])}
        />
        <Select
          allowClear
          placeholder="Tất cả nhà máy"
          style={{ minWidth: 200 }}
          value={selectedFactoryId}
          onChange={setSelectedFactoryId}
          options={factories.map((item) => ({
            label: item.name,
            value: item.id,
          }))}
        />
        <Segmented
          options={[
            { label: "Theo ngày", value: "day" },
            { label: "Theo tháng", value: "month" },
          ]}
          value={groupBy}
          onChange={(value) => setGroupBy(value as "day" | "month")}
        />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Làm mới
        </Button>
      </Space>

      {warnings.length > 0 ? (
        <Alert
          type={hasNegativeLoss ? "error" : "warning"}
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message="Dữ liệu cần kiểm tra"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          }
        />
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <Card>
            <Statistic
              title="Sản lượng EVN (đầu nguồn)"
              value={summary?.billedConsumption || 0}
              precision={2}
              suffix="kWh"
              prefix={<ThunderboltOutlined />}
            />
            {trend != null ? (
              <Text
                type={trend >= 0 ? "danger" : "success"}
                style={{ fontSize: 12 }}
              >
                {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{" "}
                {Math.abs(trend).toFixed(1)}% so với kỳ trước
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Chưa có dữ liệu kỳ trước để so sánh
              </Text>
            )}
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic
              title="Chi phí điện (hóa đơn EVN)"
              value={summary?.billedCost || 0}
              precision={0}
              suffix="VNĐ"
              prefix={<DollarOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Đơn giá bình quân thực tế{" "}
              {fmtMoney.format(Math.round(summary?.avgUnitPrice || 0))} đ/kWh
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic
              title="Tổn thất & chưa đo được"
              value={summary?.lossConsumption || 0}
              precision={2}
              suffix="kWh"
              valueStyle={hasNegativeLoss ? { color: "#cf1322" } : undefined}
              prefix={
                hasNegativeLoss ? (
                  <WarningOutlined style={{ color: "#cf1322" }} />
                ) : (
                  <ApiOutlined />
                )
              }
            />
            <Text
              type={hasNegativeLoss ? "danger" : "secondary"}
              style={{ fontSize: 12 }}
            >
              {hasNegativeLoss
                ? "Hạ thế VƯỢT đầu nguồn — kiểm tra TU/TI hoặc số EVN"
                : (summary?.lossPercent || 0).toFixed(1) +
                  "% — nội bộ đo được " +
                  fmtNumber.format(summary?.internalConsumption || 0) +
                  " kWh"}
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic
              title="Nhánh hạ thế tốn điện nhất"
              value={topConsumerShare}
              precision={1}
              suffix="% sản lượng EVN"
              prefix={<FireOutlined style={{ color: "#fa541c" }} />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {report?.byMeter[0]
                ? report.byMeter[0].meterCode +
                  " - " +
                  report.byMeter[0].meterName
                : "---"}
            </Text>
          </Card>
        </Col>
      </Row>

      <Card
        title="Xu hướng tiêu thụ điện"
        style={{ marginBottom: 16 }}
        loading={loading}
      >
        <TrendLineChart
          data={(report?.byDate || []).map((d) => ({
            label: groupBy === "month" ? d.date : dayjs(d.date).format("DD/MM"),
            consTotal: d.consTotal,
            costTotal: d.costTotal,
          }))}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Top nhánh hạ thế tiêu thụ nhiều nhất" loading={loading}>
            <RankedBarChart data={topMeters} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="Tỷ trọng khung giờ theo công tơ EVN (Bình thường/Cao điểm/Thấp điểm)"
            loading={loading}
          >
            <DonutChart
              data={[
                {
                  label: "Bình thường",
                  value: report?.summary.totalNormal || 0,
                  color: "#1677ff",
                },
                {
                  label: "Cao điểm",
                  value: report?.summary.totalPeak || 0,
                  color: "#f5222d",
                },
                {
                  label: "Thấp điểm",
                  value: report?.summary.totalOffPeak || 0,
                  color: "#52c41a",
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {topFactories.length > 1 ? (
        <Card
          title="So sánh tiêu thụ theo nhà máy"
          style={{ marginBottom: 16 }}
          loading={loading}
        >
          <RankedBarChart data={topFactories} />
        </Card>
      ) : null}

      <Card
        title="Đối chiếu theo nhà máy: hóa đơn EVN vs đo đếm nội bộ"
        style={{ marginBottom: 16 }}
      >
        <Table
          rowKey={(record) => record.factoryId || record.factoryCode}
          loading={loading}
          dataSource={report?.byFactory || []}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            { title: "Nhà máy", dataIndex: "factoryName" },
            {
              title: "Sản lượng EVN",
              dataIndex: "billedCons",
              align: "right",
              render: (value: number) => fmtNumber.format(value) + " kWh",
            },
            {
              title: "Chi phí EVN",
              dataIndex: "billedCost",
              align: "right",
              render: (value: number) => fmtMoney.format(value) + " VNĐ",
            },
            {
              title: "Hạ thế đo được",
              dataIndex: "internalCons",
              align: "right",
              render: (value: number) => fmtNumber.format(value) + " kWh",
            },
            {
              title: "Tổn thất",
              dataIndex: "lossCons",
              align: "right",
              render: (
                value: number,
                record: NonNullable<ReportData["byFactory"]>[number],
              ) => (
                <Text type={value < 0 ? "danger" : undefined}>
                  {fmtNumber.format(value)} kWh ({record.lossPercent.toFixed(1)}
                  %)
                </Text>
              ),
            },
            {
              title: "Đơn giá BQ",
              dataIndex: "avgUnitPrice",
              align: "right",
              render: (value: number) =>
                fmtMoney.format(Math.round(value)) + " đ/kWh",
            },
          ]}
        />
      </Card>

      <Card
        title="Công tơ trung thế (hóa đơn EVN — 3 khung giá)"
        style={{ marginBottom: 16 }}
      >
        <Table
          rowKey="meterId"
          loading={loading}
          dataSource={report?.byMvMeter || []}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            {
              title: "Mã ĐH",
              dataIndex: "meterCode",
              render: (value: string) => <Tag color="volcano">{value}</Tag>,
            },
            { title: "Tên công tơ", dataIndex: "meterName" },
            { title: "Nhà máy", dataIndex: "factoryName" },
            {
              title: "Bình thường",
              dataIndex: "consNormal",
              align: "right",
              render: (value: number) => fmtNumber.format(value) + " kWh",
            },
            {
              title: "Cao điểm",
              dataIndex: "consPeak",
              align: "right",
              render: (value: number) => fmtNumber.format(value) + " kWh",
            },
            {
              title: "Thấp điểm",
              dataIndex: "consOffPeak",
              align: "right",
              render: (value: number) => fmtNumber.format(value) + " kWh",
            },
            {
              title: "Tổng",
              dataIndex: "consTotal",
              align: "right",
              render: (value: number) => fmtNumber.format(value) + " kWh",
            },
            {
              title: "Thành tiền",
              dataIndex: "costTotal",
              align: "right",
              render: (value: number) => (
                <Text strong>{fmtMoney.format(value)} VNĐ</Text>
              ),
            },
          ]}
        />
      </Card>

      {summary && (summary.nonProductionCost > 0 || summary.nonProductionCons > 0) ? (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            <Card>
              <Statistic
                title="Chi phí sản xuất (đã phân bổ)"
                value={summary.productionCost}
                precision={0}
                suffix="VNĐ"
                prefix={<ThunderboltOutlined />}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {fmtNumber.format(summary.productionCons)} kWh
              </Text>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card>
              <Statistic
                title="Chi phí ngoài sản xuất (văn phòng, chữa cháy...)"
                value={summary.nonProductionCost}
                precision={0}
                suffix="VNĐ"
                prefix={<ApiOutlined style={{ color: "#fa8c16" }} />}
                valueStyle={{ color: "#fa8c16" }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {fmtNumber.format(summary.nonProductionCons)} kWh — vẫn nằm trong
                hóa đơn EVN, chỉ tách để hạch toán riêng
              </Text>
            </Card>
          </Col>
        </Row>
      ) : null}

      <Card title="Phân bổ nội bộ theo đồng hồ hạ thế">
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          style={{ marginBottom: 12 }}
          message="Chi phí dưới đây được PHÂN BỔ từ hóa đơn EVN theo tỷ trọng kWh của từng đồng hồ, nên tổng lại luôn khớp hóa đơn. Cột “Tự tính” là số do chính đồng hồ tính ra — chỉ để đối chiếu, KHÔNG dùng để cộng tổng."
        />
        <Table
          rowKey="meterId"
          loading={loading}
          dataSource={report?.byMeter || []}
          scroll={{ x: true }}
          columns={[
            {
              title: "Mã ĐH",
              dataIndex: "meterCode",
              render: (
                value: string,
                record: ReportData["byMeter"][number],
              ) => (
                <Space size={4}>
                  <Tag color="blue">{value}</Tag>
                  {record.isAuto ? <Tag color="green">AUTO</Tag> : null}
                  {record.isNonProduction ? (
                    <Tag color="orange">Ngoài SX</Tag>
                  ) : null}
                </Space>
              ),
            },
            { title: "Tên đồng hồ", dataIndex: "meterName" },
            { title: "Nhà máy", dataIndex: "factoryName" },
            { title: "Trạm", dataIndex: "substationName" },
            { title: "Máy biến áp", dataIndex: "transformerUnitName" },
            { title: "Nhóm", dataIndex: "groupName" },
            {
              title: "Tiêu thụ",
              dataIndex: "consTotal",
              align: "right",
              render: (value: number) => fmtNumber.format(value) + " kWh",
            },
            {
              title: "Chi phí phân bổ",
              dataIndex: "costTotal",
              align: "right",
              render: (value: number) => (
                <Text strong>{fmtMoney.format(value)} VNĐ</Text>
              ),
            },
            {
              title: "Tự tính (đối chiếu)",
              dataIndex: "costRaw",
              align: "right",
              render: (value: number) => (
                <Text type="secondary">{fmtMoney.format(value)} VNĐ</Text>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}

export function ElectricOverviewClient() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  useEffect(() => {
    const startDate = dayjs().startOf("month").format("YYYY-MM-DD");
    const endDate = dayjs().format("YYYY-MM-DD");
    fetchJson<ReportData>(
      "/api/electric/reports?startDate=" + startDate + "&endDate=" + endDate,
    )
      .then(setReport)
      .catch(() => undefined);
    fetchJson<Telemetry[]>("/api/energy/telemetry?take=8")
      .then(setTelemetry)
      .catch(() => undefined);
  }, []);
  return (
    <>
      <PageTitle
        title="Tổng quan điện năng"
        subtitle="Ảnh nhanh tiêu thụ tháng hiện tại và telemetry gần nhất."
      />
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="Tiêu thụ tháng"
              value={report?.summary.totalConsumption || 0}
              precision={2}
              suffix="kWh"
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="Chi phí tháng"
              value={report?.summary.totalCost || 0}
              precision={0}
              suffix="VNĐ"
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="Ngày có dữ liệu"
              value={report?.summary.daysWithData || 0}
              suffix="ngày"
              prefix={<SaveOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Card title="Telemetry AUTO gần nhất">
        <Table
          rowKey="id"
          dataSource={telemetry}
          pagination={false}
          columns={[
            {
              title: "Thời điểm",
              dataIndex: "timestamp",
              render: (value: string) =>
                dayjs(value).format("DD/MM/YYYY HH:mm:ss"),
            },
            {
              title: "Đồng hồ",
              render: (_: unknown, record: Telemetry) =>
                (record.meter?.code || "") + " - " + (record.meter?.name || ""),
            },
            {
              title: "Tổng kWh",
              dataIndex: "totalEnergy",
              align: "right",
              render: (value: number) => fmtNumber.format(value),
            },
          ]}
        />
      </Card>
    </>
  );
}
