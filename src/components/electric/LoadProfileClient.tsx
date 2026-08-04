"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { DayLoadCurve, LoadHeatmap, MonthlyPeakChart, slotLabel } from "./LoadProfileCharts";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const fmtKw = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const fmtKwh = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

type Interval = {
  at: string;
  date: string;
  slot: number;
  kw: number;
  kwh: number;
  meterCount: number;
  eligible: boolean;
};

type LoadProfileData = {
  intervals: Interval[];
  days: { date: string; kwh: number; peakKw: number; peakSlot: number; loadFactor: number }[];
  heatmap: { date: string; slot: number; kw: number; eligible: boolean }[];
  peak: {
    at: string;
    kw: number;
    meterCount: number;
    contributions: { code: string; name: string; kw: number }[];
  } | null;
  monthly: {
    label: string;
    factoryCode: string;
    peakKw: number;
    peakAt: string;
    totalKwh: number;
    loadFactor: number;
    isMonthClosed: boolean;
  }[];
  events: {
    at: string;
    code: string;
    name: string;
    kind: string;
    source: string;
    prevTotal: number | null;
    currTotal: number | null;
    impliedKw: number | null;
    note: string | null;
    acknowledged: boolean;
  }[];
  meterCountTotal: number;
  fullMeterCount: number;
};

type FactoryOpt = { id: string; code: string; name: string };
type GroupOpt = { id: string; code: string; name: string };

const EMPTY: LoadProfileData = {
  intervals: [],
  days: [],
  heatmap: [],
  peak: null,
  monthly: [],
  events: [],
  meterCountTotal: 0,
  fullMeterCount: 0,
};

/**
 * BÁO CÁO PHỤ TẢI & CÔNG SUẤT ĐỈNH.
 *
 * Trang RIÊNG (không nhét vào /electric/reports) vì ElectricClients.tsx đã gần 5000 dòng,
 * và bài toán ở đây khác hẳn: đơn vị là kW (công suất tức thời trung bình 30 phút) chứ không
 * phải kWh (sản lượng), trục thời gian là khoảng 30 phút chứ không phải ngày/tháng.
 *
 * MỤC ĐÍCH NGHIỆP VỤ: peak shaving — tìm khung giờ tải cao để dịch chuyển/cắt bớt phụ tải,
 * giảm tiền điện. Vì vậy trọng tâm giao diện là "KHI NÀO đỉnh" (heatmap) và "CẮT CÁI GÌ"
 * (bảng đóng góp tại đúng khoảnh khắc đỉnh), chứ không phải chỉ hiển thị con số đỉnh.
 */
export function LoadProfileClient() {
  const [factories, setFactories] = useState<FactoryOpt[]>([]);
  const [groups, setGroups] = useState<GroupOpt[]>([]);
  const [factoryId, setFactoryId] = useState<string>();
  const [groupId, setGroupId] = useState<string>();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, "day"), dayjs()]);
  const [data, setData] = useState<LoadProfileData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>();

  // Danh sách nhà máy & nhóm cho bộ lọc.
  useEffect(() => {
    fetch("/api/electric/factories")
      .then((r) => r.json())
      .then((res) => setFactories(Array.isArray(res) ? res : res.data || []))
      .catch(() => setFactories([]));
    fetch("/api/electric/meter-groups")
      .then((r) => r.json())
      .then((res) => setGroups(Array.isArray(res) ? res : res.data || []))
      .catch(() => setGroups([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: range[0].format("YYYY-MM-DD"),
      to: range[1].format("YYYY-MM-DD"),
    });
    if (factoryId) params.set("factoryId", factoryId);
    if (groupId) params.set("groupId", groupId);

    fetch(`/api/electric/load-profile?${params.toString()}`)
      .then((r) => r.json())
      .then((res: LoadProfileData) => setData(res?.intervals ? res : EMPTY))
      .catch(() => setData(EMPTY))
      .finally(() => setLoading(false));
  }, [range, factoryId, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const dates = useMemo(
    () => [...new Set(data.heatmap.map((c) => c.date))].sort(),
    [data.heatmap],
  );

  // Mặc định chọn ngày có đỉnh cao nhất — đó là ngày người dùng muốn xem trước tiên.
  const peakDate = data.peak ? data.peak.at.slice(0, 10) : undefined;
  const activeDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates[dates.length - 1];

  const dayPoints = useMemo(
    () =>
      data.intervals
        .filter((it) => it.date === activeDate)
        .map((it) => ({ slot: it.slot, kw: it.kw, eligible: it.eligible })),
    [data.intervals, activeDate],
  );

  const peakAtVN = data.peak
    ? new Date(data.peak.at).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "---";

  // Hệ số phụ tải cả kỳ: trung bình / đỉnh. Chỉ số ĐẮT GIÁ NHẤT cho peak shaving.
  const periodLf = useMemo(() => {
    const el = data.intervals.filter((it) => it.eligible);
    if (el.length === 0 || !data.peak || data.peak.kw <= 0) return 0;
    return el.reduce((s, it) => s + it.kw, 0) / el.length / data.peak.kw;
  }, [data.intervals, data.peak]);

  const totalKwh = useMemo(
    () => data.intervals.reduce((s, it) => s + it.kwh, 0),
    [data.intervals],
  );

  const monthlyForChart = useMemo(() => {
    // Khi xem "tất cả nhà máy" thì mỗi tháng có nhiều dòng (mỗi nhà máy một dòng).
    // Cộng đỉnh của các nhà máy lại là SAI (đỉnh của tổng != tổng các đỉnh), nên chỉ
    // hiện biểu đồ này khi đã chọn cụ thể một nhà máy.
    if (!factoryId) return [];
    return data.monthly;
  }, [data.monthly, factoryId]);

  const lfTone = (lf: number) => (lf >= 0.75 ? "green" : lf >= 0.55 ? "gold" : "red");
  const lfHint = (lf: number) =>
    lf >= 0.75
      ? "Phụ tải chạy đều, ít dư địa cắt đỉnh"
      : lf >= 0.55
        ? "Có dao động, xem xét dịch chuyển vài phụ tải"
        : "Nhiều cú nhô cao ngắn — đây là chỗ tiết kiệm được tiền";

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 4 }}>
        Biểu đồ phụ tải & công suất đỉnh
      </Title>
      <Text type="secondary">
        Công suất trung bình 30 phút, tổng hợp từ các nhánh hạ thế đọc tự động.
      </Text>

      <Space wrap style={{ margin: "16px 0" }} size="middle">
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Nhà máy
          </Text>
          <Select
            allowClear
            placeholder="Tất cả nhà máy"
            style={{ width: 200 }}
            value={factoryId}
            onChange={(v) => setFactoryId(v)}
            options={factories.map((f) => ({ value: f.id, label: `${f.code} — ${f.name}` }))}
          />
        </Space>
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Nhóm đồng hồ
          </Text>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Tất cả nhóm"
            style={{ width: 220 }}
            value={groupId}
            onChange={(v) => setGroupId(v)}
            options={groups.map((g) => ({ value: g.id, label: `${g.code} — ${g.name}` }))}
          />
        </Space>
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Khoảng thời gian
          </Text>
          <RangePicker
            value={range}
            onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
            format="DD/MM/YYYY"
            allowClear={false}
          />
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Số liệu này là tổng các nhánh hạ thế, không phải chỉ số công tơ EVN"
        description="Chênh lệch với hoá đơn EVN là bình thường (tổn hao trên đường dây, các nhánh chưa gắn đồng hồ). Dùng để tìm khung giờ cần cắt tải, không dùng để đối chiếu hoá đơn."
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="Công suất đỉnh trong kỳ"
              value={data.peak ? data.peak.kw : 0}
              suffix="kW"
              formatter={(v) => fmtKw.format(Number(v))}
              valueStyle={{ color: "#f5222d" }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic title="Thời điểm đỉnh" value={peakAtVN} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="Hệ số phụ tải"
              value={periodLf}
              precision={2}
              valueStyle={{ color: periodLf >= 0.75 ? "#52c41a" : periodLf >= 0.55 ? "#faad14" : "#f5222d" }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {lfHint(periodLf)}
            </Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="Tổng tiêu thụ"
              value={totalKwh}
              suffix="kWh"
              formatter={(v) => fmtKwh.format(Number(v))}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Bản đồ nhiệt phụ tải — ngày × khung giờ"
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            Bấm vào ngày để xem đường cong chi tiết · ô mờ = thiếu đồng hồ
          </Text>
        }
        style={{ marginBottom: 16 }}
        loading={loading}
      >
        <LoadHeatmap
          cells={data.heatmap}
          dates={dates}
          selectedDate={activeDate}
          onSelectDay={(d) => setSelectedDate(d)}
        />
        {peakDate ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Vệt đỏ đậm nhất nằm ở ngày {peakDate.slice(8)}/{peakDate.slice(5, 7)}. Nếu các vệt nóng
            lặp lại ở cùng khung giờ mỗi ngày, đó là phụ tải theo lịch — dịch chuyển được.
          </Text>
        ) : null}
      </Card>

      <Card
        title={`Đường cong phụ tải ngày ${activeDate ? activeDate.split("-").reverse().join("/") : ""}`}
        style={{ marginBottom: 16 }}
        loading={loading}
      >
        <DayLoadCurve points={dayPoints} peakLine={data.peak?.kw} />
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Đồng hồ nào tạo ra đỉnh" loading={loading}>
            {data.peak ? (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Công suất từng nhánh tại đúng khoảnh khắc {peakAtVN} — đây là danh sách ứng viên
                  để cắt hoặc dịch chuyển.
                </Text>
                <Table
                  rowKey="code"
                  size="small"
                  style={{ marginTop: 12 }}
                  dataSource={data.peak.contributions.slice(0, 12)}
                  pagination={false}
                  columns={[
                    { title: "Mã", dataIndex: "code", width: 110 },
                    { title: "Tên nhánh", dataIndex: "name", ellipsis: true },
                    {
                      title: "Công suất",
                      dataIndex: "kw",
                      align: "right" as const,
                      width: 110,
                      render: (v: number) => `${fmtKw.format(v)} kW`,
                    },
                    {
                      key: "share",
                      title: "Tỷ trọng",
                      dataIndex: "kw",
                      align: "right" as const,
                      width: 90,
                      render: (v: number) =>
                        data.peak && data.peak.kw > 0
                          ? `${((v / data.peak.kw) * 100).toFixed(1)}%`
                          : "---",
                    },
                  ]}
                />
              </>
            ) : (
              <Text type="secondary">Chưa đủ dữ liệu để xác định đỉnh.</Text>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Đỉnh theo từng ngày" loading={loading}>
            <Table
              rowKey="date"
              size="small"
              dataSource={[...data.days].sort((a, b) => b.peakKw - a.peakKw)}
              pagination={{ pageSize: 8, size: "small" }}
              onRow={(r) => ({
                onClick: () => setSelectedDate(r.date),
                style: { cursor: "pointer" },
              })}
              columns={[
                {
                  title: "Ngày",
                  dataIndex: "date",
                  render: (v: string) => v.split("-").reverse().join("/"),
                },
                {
                  title: "Đỉnh",
                  dataIndex: "peakKw",
                  align: "right" as const,
                  render: (v: number) => <b>{fmtKw.format(v)} kW</b>,
                },
                {
                  title: "Lúc",
                  dataIndex: "peakSlot",
                  align: "center" as const,
                  render: (v: number) => slotLabel(v),
                },
                {
                  title: "Tiêu thụ",
                  dataIndex: "kwh",
                  align: "right" as const,
                  render: (v: number) => `${fmtKwh.format(v)} kWh`,
                },
                {
                  title: "LF",
                  dataIndex: "loadFactor",
                  align: "right" as const,
                  render: (v: number) => <Tag color={lfTone(v)}>{v.toFixed(2)}</Tag>,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="So sánh công suất đỉnh các tháng" style={{ marginBottom: 16 }} loading={loading}>
        {factoryId ? (
          <>
            <MonthlyPeakChart data={monthlyForChart} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Cột = công suất đỉnh (kW). Đường xanh đứt nét = hệ số phụ tải (trục phải). Tháng có
              đỉnh cao nhưng hệ số phụ tải thấp là tháng có nhiều dư địa tiết kiệm nhất.
            </Text>
          </>
        ) : (
          <Alert
            type="warning"
            showIcon
            message="Chọn một nhà máy cụ thể để xem so sánh đỉnh các tháng"
            description="Không thể cộng đỉnh của nhiều nhà máy lại với nhau: mỗi nhà máy đạt đỉnh vào thời điểm khác nhau, nên tổng các đỉnh sẽ ra con số không tồn tại trong thực tế."
          />
        )}
      </Card>

      {data.events.length > 0 ? (
        <Card
          title={`Sự kiện đứt chuỗi đo (${data.events.length})`}
          loading={loading}
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              Giải thích các chỗ thủng trên đường cong
            </Text>
          }
        >
          <Table
            rowKey={(r) => `${r.code}-${r.at}-${r.kind}`}
            size="small"
            dataSource={data.events}
            pagination={{ pageSize: 6, size: "small" }}
            columns={[
              {
                title: "Thời điểm",
                dataIndex: "at",
                width: 150,
                render: (v: string) =>
                  new Date(v).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
              },
              { title: "Đồng hồ", dataIndex: "code", width: 110 },
              {
                title: "Loại",
                dataIndex: "kind",
                width: 130,
                render: (v: string) =>
                  v === "RESET_DOWN" ? (
                    <Tag color="orange">Tụt số / thay mới</Tag>
                  ) : v === "JUMP_UP" ? (
                    <Tag color="red">Nhảy vọt</Tag>
                  ) : (
                    <Tag>{v}</Tag>
                  ),
              },
              {
                title: "Chỉ số",
                key: "vals",
                render: (_: unknown, r) =>
                  r.prevTotal != null
                    ? `${fmtKwh.format(r.prevTotal)} → ${fmtKwh.format(r.currTotal ?? 0)}`
                    : r.impliedKw != null
                      ? `suy ra ${fmtKw.format(r.impliedKw)} kW`
                      : "---",
              },
              { title: "Ghi chú", dataIndex: "note", ellipsis: true },
            ]}
          />
        </Card>
      ) : null}
    </div>
  );
}
