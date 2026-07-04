"use client";

import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  InputNumber,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

const { Text, Title } = Typography;

const fmtNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

type Factory = { id: string; code: string; name: string; isActive: boolean };
type Transformer = { id: string; code: string; name: string; factoryId?: string | null; factory?: Factory | null; isActive: boolean };
type TransformerUnit = { id: number; code: string; name: string; transformerId?: string | null; transformer?: Transformer | null; isActive: boolean };
type MeterGroup = { id: string; code: string; name: string; isActive: boolean };

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
  type: number;
  isAuto: boolean;
  tu: number;
  ti: number;
  note?: string | null;
  group?: MeterGroup | null;
  transformer?: Transformer | null;
  transformerUnit?: TransformerUnit | null;
  todayRecord?: PowerRecord | null;
  lastRecord?: PowerRecord | null;
  avgConsumption7d?: number | null;
};

type DailyDraft = { currTotal: string; isReset: boolean };
type DraftStatus = "empty" | "error" | "warn" | "high" | "low" | "ok";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || data?.message || "HTTP " + res.status);
  return data as T;
}

function postBody(method: "POST" | "PUT" | "DELETE", body: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function evaluate(meter: ElectricMeter, draft?: DailyDraft): { status: DraftStatus; cons: number; msg: string } {
  if (!draft || draft.currTotal === "") return { status: "empty", cons: 0, msg: "" };
  const curr = Number(draft.currTotal);
  if (Number.isNaN(curr)) return { status: "empty", cons: 0, msg: "" };
  const prev = Number(meter.lastRecord?.currTotal ?? 0);
  const delta = draft.isReset ? curr : Math.max(0, curr - prev);
  const cons = delta * (meter.tu || 1) * (meter.ti || 1);
  const avg = Number(meter.avgConsumption7d ?? 0);
  if (!draft.isReset && curr < prev) return { status: "error", cons, msg: "Nhỏ hơn kỳ trước!" };
  if (cons === 0) return { status: "warn", cons, msg: "Không tiêu thụ" };
  if (avg > 0 && cons > avg * 3) return { status: "high", cons, msg: "Cao bất thường" };
  if (avg > 0 && cons < avg * 0.25) return { status: "low", cons, msg: "Thấp bất thường" };
  return { status: "ok", cons, msg: "Hợp lệ" };
}

const STATUS_BORDER: Record<DraftStatus, string> = {
  empty: "#b6dcff",
  error: "#ef4444",
  warn: "#f5a623",
  high: "#f97316",
  low: "#3b82f6",
  ok: "#10b981",
};

const STATUS_ICON: Record<DraftStatus, React.ReactNode> = {
  empty: null,
  error: <ExclamationCircleOutlined style={{ color: "#ef4444" }} />,
  warn: <WarningOutlined style={{ color: "#f5a623" }} />,
  high: <WarningOutlined style={{ color: "#f97316" }} />,
  low: <InfoCircleOutlined style={{ color: "#3b82f6" }} />,
  ok: <CheckCircleOutlined style={{ color: "#10b981" }} />,
};

const STATUS_TAG_COLOR: Record<DraftStatus, string> = {
  empty: "default",
  error: "red",
  warn: "gold",
  high: "orange",
  low: "blue",
  ok: "green",
};

export function MobileDailyInputClient() {
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
  const [statusFilter, setStatusFilter] = useState<"needsInput" | "all" | "done">("needsInput");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DailyDraft>>({});
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchJson<Factory[]>("/api/electric/factories"),
      fetchJson<Transformer[]>("/api/electric/substations"),
      fetchJson<TransformerUnit[]>("/api/electric/transformer-units"),
      fetchJson<MeterGroup[]>("/api/electric/meter-groups"),
    ])
      .then(([f, t, tu, g]) => {
        setFactories(f.filter((i) => i.isActive));
        setTransformers(t.filter((i) => i.isActive));
        setTransformerUnits(tu.filter((i) => i.isActive));
        setGroups(g.filter((i) => i.isActive));
      })
      .catch(() => message.error("Không tải được danh mục"));
  }, []);

  const filteredTransformers = useMemo(
    () => transformers.filter((i) => !selectedFactory || i.factoryId === selectedFactory),
    [transformers, selectedFactory],
  );
  const filteredUnits = useMemo(
    () => transformerUnits.filter((i) => {
      if (selectedTransformer && i.transformerId !== selectedTransformer) return false;
      return !selectedFactory || i.transformer?.factoryId === selectedFactory;
    }),
    [transformerUnits, selectedFactory, selectedTransformer],
  );

  const loadMeters = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ date: selectedDate.format("YYYY-MM-DD") });
      if (selectedTransformer) p.set("substationId", selectedTransformer);
      if (selectedTransformerUnit) p.set("transformerUnitId", String(selectedTransformerUnit));
      if (!selectedTransformer && selectedFactory) p.set("factoryId", selectedFactory);
      const next = await fetchJson<ElectricMeter[]>("/api/electric/daily-status?" + p.toString());
      setMeters(next);
      const nd: Record<string, DailyDraft> = {};
      for (const m of next) {
        if (m.type === 2) continue;
        const rec = m.todayRecord;
        nd[m.id] = {
          currTotal: rec?.currTotal !== undefined && rec?.currTotal !== null ? String(rec.currTotal) : "",
          isReset: rec?.isReset ?? false,
        };
      }
      setDrafts(nd);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedFactory, selectedTransformer, selectedTransformerUnit]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadMeters(), 0);
    return () => window.clearTimeout(t);
  }, [loadMeters]);

  const updateDraft = (id: string, patch: Partial<DailyDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || { currTotal: "", isReset: false }), ...patch } }));
  };

  const displayed = useMemo(() => meters.filter((m) => {
    if (m.type === 2) return false;
    if (selectedGroup && m.groupId !== selectedGroup) return false;
    if (statusFilter === "needsInput" && m.todayRecord) return false;
    if (statusFilter === "done" && !m.todayRecord) return false;
    return true;
  }), [meters, selectedGroup, statusFilter]);

  const totalMeters = meters.filter((m) => m.type !== 2).length;
  const doneCount = meters.filter((m) => m.type !== 2 && m.todayRecord).length;
  const pendingCount = totalMeters - doneCount;

  const readyToSave = useMemo(() => {
    let c = 0;
    for (const m of meters) {
      if (m.type === 2 || m.todayRecord) continue;
      const ev = evaluate(m, drafts[m.id]);
      if (ev.status !== "empty" && ev.status !== "error") c++;
    }
    return c;
  }, [meters, drafts]);

  const persistOne = useCallback(async (meter: ElectricMeter, draft: DailyDraft) => {
    await fetchJson("/api/electric/daily-input", postBody("POST", {
      meterId: meter.id,
      recordDate: selectedDate.format("YYYY-MM-DD"),
      prevTotal: Number(meter.lastRecord?.currTotal ?? 0),
      currTotal: Number(draft.currTotal),
      isReset: draft.isReset,
    }));
  }, [selectedDate]);

  const saveOne = async (meter: ElectricMeter) => {
    const draft = drafts[meter.id];
    const ev = evaluate(meter, draft);
    if (ev.status === "empty") { message.warning("Chưa nhập chỉ số"); return; }
    if (ev.status === "error") { message.error(ev.msg); return; }
    setSavingId(meter.id);
    try {
      await persistOne(meter, draft);
      message.success("Đã lưu " + meter.code);
      await loadMeters();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Lỗi lưu");
    } finally {
      setSavingId(null);
    }
  };

  const saveAll = async () => {
    const jobs: Array<{ meter: ElectricMeter; draft: DailyDraft }> = [];
    for (const m of meters) {
      if (m.type === 2 || m.todayRecord) continue;
      const draft = drafts[m.id];
      const ev = evaluate(m, draft);
      if (ev.status !== "empty" && ev.status !== "error") jobs.push({ meter: m, draft });
    }
    if (!jobs.length) { message.warning("Không có đồng hồ sẵn sàng lưu"); return; }
    setSavingAll(true);
    let ok = 0;
    let fail = 0;
    for (const j of jobs) {
      try { await persistOne(j.meter, j.draft); ok++; } catch { fail++; }
    }
    setSavingAll(false);
    if (fail) message.warning("Lưu " + ok + "/" + jobs.length + ", lỗi " + fail);
    else message.success("Đã lưu " + ok + " đồng hồ");
    await loadMeters();
  };

  const activeFilterCount = [selectedFactory, selectedTransformer, selectedTransformerUnit, selectedGroup].filter(Boolean).length;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      {/* Title */}
      <div style={{ marginBottom: 10 }}>
        <Title level={4} style={{ margin: 0, color: "#172033", fontSize: 18 }}>Nhập chỉ số điện</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>Giao diện tối ưu cho điện thoại</Text>
      </div>

      {/* Date + Filter toggle */}
      <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: "8px 12px" } }}>
        <Row gutter={8} align="middle">
          <Col flex="1">
            <DatePicker
              value={selectedDate}
              onChange={(v) => v && setSelectedDate(v)}
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
              size="large"
            />
          </Col>
          <Col>
            <Badge count={activeFilterCount} size="small" offset={[-4, 4]}>
              <Button
                icon={<FilterOutlined />}
                onClick={() => setShowFilters(!showFilters)}
                type={showFilters ? "primary" : "default"}
                size="large"
              />
            </Badge>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={loadMeters} loading={loading} size="large" />
          </Col>
        </Row>

        {/* Collapsible filters */}
        {showFilters && (
          <div style={{ marginTop: 8 }}>
            <Divider style={{ margin: "4px 0 8px" }} />
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Select
                allowClear
                placeholder="Nhà máy"
                value={selectedFactory}
                onChange={(v) => { setSelectedFactory(v); setSelectedTransformer(undefined); setSelectedTransformerUnit(undefined); }}
                options={factories.map((i) => ({ label: i.name, value: i.id }))}
                style={{ width: "100%" }}
                size="large"
              />
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Trạm biến áp"
                value={selectedTransformer}
                onChange={(v) => { setSelectedTransformer(v); setSelectedTransformerUnit(undefined); }}
                options={filteredTransformers.map((i) => ({ label: i.factory ? i.factory.name + " - " + i.name : i.name, value: i.id }))}
                style={{ width: "100%" }}
                size="large"
              />
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Máy biến áp"
                value={selectedTransformerUnit}
                onChange={setSelectedTransformerUnit}
                options={filteredUnits.map((i) => ({ label: i.name, value: i.id }))}
                style={{ width: "100%" }}
                size="large"
              />
              <Select
                allowClear
                placeholder="Nhóm đồng hồ"
                value={selectedGroup}
                onChange={setSelectedGroup}
                options={groups.map((i) => ({ label: i.name, value: i.id }))}
                style={{ width: "100%" }}
                size="large"
              />
            </Space>
          </div>
        )}
      </Card>

      {/* Progress bar */}
      <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: "8px 12px" } }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Text style={{ fontSize: 13 }}>
              <Text strong style={{ color: "#10b981" }}>{doneCount}</Text>
              <Text type="secondary"> / {totalMeters} đã chốt</Text>
            </Text>
          </Col>
          <Col>
            {pendingCount > 0 && (
              <Tag color="red" style={{ margin: 0 }}>{pendingCount} chờ nhập</Tag>
            )}
          </Col>
        </Row>
        <div style={{ height: 6, background: "#e8eef6", borderRadius: 3, marginTop: 6 }}>
          <div
            style={{
              height: "100%",
              width: totalMeters ? (doneCount / totalMeters * 100) + "%" : "0%",
              background: "linear-gradient(90deg, #10b981, #006dcb)",
              borderRadius: 3,
              transition: "width 0.3s",
            }}
          />
        </div>
      </Card>

      {/* Status filter */}
      <Segmented
        block
        size="large"
        options={[
          { label: "Chờ nhập (" + pendingCount + ")", value: "needsInput" },
          { label: "Tất cả", value: "all" },
          { label: "Đã chốt", value: "done" },
        ]}
        value={statusFilter}
        onChange={(v) => setStatusFilter(v as "needsInput" | "all" | "done")}
        style={{ marginBottom: 8 }}
      />

      {/* Save all button */}
      {readyToSave > 0 && (
        <Popconfirm
          title={"Lưu " + readyToSave + " đồng hồ hợp lệ?"}
          okText="Lưu tất cả"
          cancelText="Huỷ"
          onConfirm={() => void saveAll()}
        >
          <Button
            type="primary"
            icon={<SaveOutlined />}
            block
            size="large"
            loading={savingAll}
            style={{ marginBottom: 8, height: 48, fontSize: 16, fontWeight: 600 }}
          >
            Lưu tất cả ({readyToSave})
          </Button>
        </Popconfirm>
      )}

      {/* Meter cards */}
      {displayed.length === 0 && !loading && (
        <Card style={{ textAlign: "center", padding: 24 }}>
          <Text type="secondary">{statusFilter === "done" ? "Chưa có đồng hồ nào được chốt" : "Tất cả đồng hồ đã được chốt!"}</Text>
        </Card>
      )}

      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {displayed.map((meter) => {
          const draft = drafts[meter.id];
          const ev = evaluate(meter, draft);
          const prev = Number(meter.lastRecord?.currTotal ?? 0);
          const avg = meter.avgConsumption7d;
          const isDone = !!meter.todayRecord;

          return (
            <Card
              key={meter.id}
              size="small"
              style={{
                borderLeft: `4px solid ${isDone ? "#10b981" : STATUS_BORDER[ev.status]}`,
                opacity: isDone ? 0.75 : 1,
              }}
              styles={{ body: { padding: "10px 12px" } }}
            >
              {/* Header */}
              <Row justify="space-between" align="top" style={{ marginBottom: 6 }}>
                <Col>
                  <Text strong style={{ fontSize: 15 }}>{meter.code}</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>{meter.name}</Text>
                </Col>
                <Col style={{ textAlign: "right" }}>
                  <Tag color={meter.isAuto ? "green" : "gold"} style={{ margin: 0 }}>
                    {meter.isAuto ? "AUTO" : "MANUAL"}
                  </Tag>
                  {(meter.tu > 1 || meter.ti > 1) && (
                    <div style={{ fontSize: 11, color: "#526174", marginTop: 2 }}>
                      TU/TI: {meter.tu}/{meter.ti}
                    </div>
                  )}
                </Col>
              </Row>

              {/* Location info */}
              <div style={{ fontSize: 12, color: "#526174", marginBottom: 8, lineHeight: 1.4 }}>
                {meter.transformer?.factory?.name || "---"} / {meter.transformer?.name || "---"}
                {meter.transformerUnit ? " / " + meter.transformerUnit.name : ""}
              </div>

              {isDone ? (
                /* Already done */
                <Alert
                  type="success"
                  showIcon
                  style={{ borderRadius: 8 }}
                  message={
                    <Space>
                      <span>Đã chốt: <b>{fmtNumber.format(Number(meter.todayRecord!.currTotal))}</b></span>
                      <Tag color={meter.todayRecord!.dataSource === "AUTO" ? "green" : "orange"} style={{ margin: 0 }}>
                        {meter.todayRecord!.dataSource}
                      </Tag>
                      <span style={{ color: "#10b981" }}>{fmtNumber.format(Number(meter.todayRecord!.consTotal))} kWh</span>
                    </Space>
                  }
                />
              ) : (
                /* Input area */
                <>
                  {/* Previous reading info */}
                  <div
                    style={{
                      background: "#e8f3ff",
                      borderRadius: 8,
                      padding: "6px 10px",
                      marginBottom: 8,
                    }}
                  >
                    <Row justify="space-between">
                      <Col>
                        <Text type="secondary" style={{ fontSize: 12 }}>Kỳ trước</Text>
                        <div>
                          <Text strong style={{ fontSize: 16 }}>{meter.lastRecord ? fmtNumber.format(prev) : "---"}</Text>
                          {meter.lastRecord && (
                            <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                              ({dayjs(meter.lastRecord.recordDate).format("DD/MM")})
                            </Text>
                          )}
                        </div>
                      </Col>
                      <Col style={{ textAlign: "right" }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>TB 7 ngày</Text>
                        <div>
                          <Text style={{ fontSize: 14 }}>
                            {avg && avg > 0 ? fmtNumber.format(avg) + " kWh" : "---"}
                          </Text>
                        </div>
                      </Col>
                    </Row>
                  </div>

                  {/* Input */}
                  <InputNumber
                    size="large"
                    min={0}
                    placeholder="Nhập chỉ số mới"
                    style={{ width: "100%", marginBottom: 6 }}
                    styles={{ input: { fontSize: 18, height: 48, fontWeight: 600 } }}
                    value={draft?.currTotal === "" || draft?.currTotal === undefined ? null : Number(draft.currTotal)}
                    onChange={(v) => updateDraft(meter.id, { currTotal: v === null || v === undefined ? "" : String(v) })}
                    controls={false}
                  />

                  {/* Reset toggle */}
                  <Row justify="space-between" align="middle" style={{ marginBottom: 6 }}>
                    <Col>
                      <Space size={6}>
                        <Switch
                          size="small"
                          checked={draft?.isReset ?? false}
                          onChange={(c) => updateDraft(meter.id, { isReset: c })}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>Reset / thay đồng hồ</Text>
                      </Space>
                    </Col>
                    <Col>
                      {ev.status !== "empty" && (
                        <Space size={4}>
                          {STATUS_ICON[ev.status]}
                          <Tag color={STATUS_TAG_COLOR[ev.status]} style={{ margin: 0 }}>
                            {fmtNumber.format(ev.cons)} kWh
                          </Tag>
                        </Space>
                      )}
                    </Col>
                  </Row>

                  {/* Warning message */}
                  {ev.status === "error" && (
                    <Alert type="error" showIcon message={ev.msg} style={{ marginBottom: 6, borderRadius: 8 }} />
                  )}
                  {ev.status === "warn" && (
                    <Alert type="warning" showIcon message={ev.msg} style={{ marginBottom: 6, borderRadius: 8 }} />
                  )}
                  {(ev.status === "high" || ev.status === "low") && (
                    <Alert type="info" showIcon message={ev.msg} style={{ marginBottom: 6, borderRadius: 8 }} />
                  )}

                  {/* Save button */}
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    block
                    size="large"
                    loading={savingId === meter.id}
                    disabled={ev.status === "empty" || ev.status === "error"}
                    onClick={() => void saveOne(meter)}
                    style={{ height: 44, fontSize: 15, fontWeight: 600 }}
                  >
                    Lưu chỉ số
                  </Button>
                </>
              )}
            </Card>
          );
        })}
      </Space>

      {/* Bottom spacing */}
      <div style={{ height: 60 }} />
    </div>
  );
}
