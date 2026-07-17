"use client";

import { ReloadOutlined, RiseOutlined, FallOutlined, MinusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MultiTrendChart } from "./Charts";

const { RangePicker } = DatePicker;
const { Text } = Typography;

const LV_TYPE = 1; // Hạ thế

type FactoryRef = { id: string; name: string };

interface MeterItem {
  id: string;
  code: string;
  name: string;
  type: number;
  isActive: boolean;
  sortOrder: number;
  factory: FactoryRef | null;
  transformer: { id: string; name: string; factory: FactoryRef | null } | null;
}

interface SeriesItem {
  meterId: string;
  meterCode: string;
  meterName: string;
  points: (number | null)[];
}

interface TrendResponse {
  dates: string[];
  series: SeriesItem[];
}

function resolveFactory(m: MeterItem): FactoryRef | null {
  return m.transformer?.factory || m.factory || null;
}

/** Chiều hướng: so điểm có dữ liệu ĐẦU và CUỐI của chuỗi. */
function direction(points: (number | null)[]): "up" | "down" | "flat" | "none" {
  const vals = points.filter((v): v is number => v != null);
  if (vals.length < 2) return "none";
  const first = vals[0];
  const last = vals[vals.length - 1];
  const diff = last - first;
  const base = Math.abs(first) || 1;
  if (Math.abs(diff) / base < 0.03) return "flat";
  return diff > 0 ? "up" : "down";
}

export function MeterTrendClient() {
  const [meters, setMeters] = useState<MeterItem[]>([]);
  const [loadingMeters, setLoadingMeters] = useState(false);

  const [factoryId, setFactoryId] = useState<string>();
  const [transformerId, setTransformerId] = useState<string>();
  const [meterIds, setMeterIds] = useState<string[]>([]);

  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [kind, setKind] = useState<"line" | "column">("line");

  const [data, setData] = useState<TrendResponse>({ dates: [], series: [] });
  const [loading, setLoading] = useState(false);

  // Tải danh sách đồng hồ 1 lần, chỉ giữ Hạ thế (type = 1) đang hoạt động.
  useEffect(() => {
    setLoadingMeters(true);
    fetch("/api/electric/meters")
      .then((r) => r.json())
      .then((rows: MeterItem[]) => {
        const lv = (rows || []).filter((m) => m.type === LV_TYPE && m.isActive);
        setMeters(lv);
      })
      .catch(() => setMeters([]))
      .finally(() => setLoadingMeters(false));
  }, []);

  // Bộ lọc phân cấp
  const factoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of meters) {
      const f = resolveFactory(m);
      if (f) map.set(f.id, f.name);
    }
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [meters]);

  const transformerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of meters) {
      if (!m.transformer) continue;
      if (factoryId && resolveFactory(m)?.id !== factoryId) continue;
      map.set(m.transformer.id, m.transformer.name);
    }
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [meters, factoryId]);

  const meterOptions = useMemo(() => {
    return meters
      .filter((m) => {
        if (factoryId && resolveFactory(m)?.id !== factoryId) return false;
        if (transformerId && m.transformer?.id !== transformerId) return false;
        return true;
      })
      .map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }));
  }, [meters, factoryId, transformerId]);

  const onFactoryChange = (value?: string) => {
    setFactoryId(value);
    setTransformerId(undefined);
    setMeterIds([]);
  };
  const onTransformerChange = (value?: string) => {
    setTransformerId(value);
    setMeterIds([]);
  };

  const load = useCallback(() => {
    if (meterIds.length === 0) {
      setData({ dates: [], series: [] });
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      meterIds: meterIds.join(","),
      from: range[0].format("YYYY-MM-DD"),
      to: range[1].format("YYYY-MM-DD"),
      groupBy,
    });
    fetch(`/api/electric/meter-trend?${params.toString()}`)
      .then((r) => r.json())
      .then((res: TrendResponse) => setData(res))
      .catch(() => setData({ dates: [], series: [] }))
      .finally(() => setLoading(false));
  }, [meterIds, range, groupBy]);

  // Tự tải khi đổi đồng hồ / khoảng ngày / ngày-tháng.
  useEffect(() => {
    load();
  }, [load]);

  const dirTag = (points: (number | null)[]) => {
    const d = direction(points);
    if (d === "up")
      return (
        <Tag color="red" icon={<RiseOutlined />}>
          đang tăng
        </Tag>
      );
    if (d === "down")
      return (
        <Tag color="green" icon={<FallOutlined />}>
          đang giảm
        </Tag>
      );
    if (d === "flat")
      return (
        <Tag icon={<MinusOutlined />}>ổn định</Tag>
      );
    return <Tag>—</Tag>;
  };

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }} size="middle">
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Nhà máy
          </Text>
          <Select
            allowClear
            placeholder="Tất cả nhà máy"
            style={{ width: 180 }}
            value={factoryId}
            onChange={onFactoryChange}
            options={factoryOptions}
            loading={loadingMeters}
          />
        </Space>

        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Trạm
          </Text>
          <Select
            allowClear
            placeholder="Tất cả trạm"
            style={{ width: 180 }}
            value={transformerId}
            onChange={onTransformerChange}
            options={transformerOptions}
          />
        </Space>

        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Đồng hồ (chọn 1 hoặc nhiều)
          </Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="Chọn đồng hồ hạ thế..."
            style={{ minWidth: 280, maxWidth: 460 }}
            value={meterIds}
            onChange={setMeterIds}
            options={meterOptions}
            maxTagCount="responsive"
            optionFilterProp="label"
          />
        </Space>

        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Khoảng ngày
          </Text>
          <RangePicker
            value={range}
            onChange={(v) => {
              if (v && v[0] && v[1]) setRange([v[0], v[1]]);
            }}
            allowClear={false}
            format="DD/MM/YYYY"
          />
        </Space>

        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            &nbsp;
          </Text>
          <Space>
            <Segmented
              value={groupBy}
              onChange={(v) => setGroupBy(v as "day" | "month")}
              options={[
                { label: "Ngày", value: "day" },
                { label: "Tháng", value: "month" },
              ]}
            />
            <Segmented
              value={kind}
              onChange={(v) => setKind(v as "line" | "column")}
              options={[
                { label: "Đường", value: "line" },
                { label: "Cột", value: "column" },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
              Xem
            </Button>
          </Space>
        </Space>
      </Space>

      {meterIds.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message="Chọn ít nhất một đồng hồ hạ thế để xem xu hướng tiêu thụ hàng ngày. Có thể chọn nhiều đồng hồ (ví dụ các đồng hồ của cụm điều hoà hoặc khí nén) để so sánh cùng lúc."
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card
        title={
          groupBy === "month"
            ? "Tiêu thụ theo tháng (kWh)"
            : "Tiêu thụ theo ngày (kWh)"
        }
        loading={loading}
        extra={
          data.series.length > 0 ? (
            <Space size={[4, 4]} wrap>
              {data.series.map((s) => (
                <span key={s.meterId} style={{ whiteSpace: "nowrap" }}>
                  <Text style={{ fontSize: 12 }}>{s.meterCode}</Text>{" "}
                  {dirTag(s.points)}
                </span>
              ))}
            </Space>
          ) : null
        }
      >
        <MultiTrendChart dates={data.dates} series={data.series} kind={kind} />
      </Card>
    </>
  );
}
