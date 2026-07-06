"use client";

import {
  CheckCircleOutlined,
  EditOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  InputNumber,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

const { Text, Title } = Typography;
const fmtNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function useRole() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  return {
    canEditDaily: role === "ADMIN" || role === "MANAGER" || role === "EDITOR",
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || data?.message || "HTTP " + response.status);
  return data as T;
}

function postBody(body: object): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

type Factory = { id: string; code: string; name: string };

type PowerRecord = {
  id: string;
  recordDate: string;
  dataSource: "AUTO" | "MANUAL";
  prevNormal?: number | null;
  currNormal?: number | null;
  consNormal?: number | null;
  prevPeak?: number | null;
  currPeak?: number | null;
  consPeak?: number | null;
  prevOffPeak?: number | null;
  currOffPeak?: number | null;
  consOffPeak?: number | null;
  consTotal: number;
  costTotal: number;
  isReset: boolean;
  note?: string | null;
};

type MvMeter = {
  id: string;
  code: string;
  name: string;
  tu: number;
  ti: number;
  note?: string | null;
  factory?: Factory | null;
  todayRecord?: PowerRecord | null;
  lastRecord?: PowerRecord | null;
};

export function MvDailyInputClient() {
  const { canEditDaily } = useRole();
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs().subtract(1, "day"));
  const [factories, setFactories] = useState<Factory[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<string>();
  const [meters, setMeters] = useState<MvMeter[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Load danh sách nhà máy
  useEffect(() => {
    fetchJson<Factory[]>("/api/electric/factories")
      .then((data) => setFactories(data.filter((f: Factory & { isActive?: boolean }) => (f as { isActive?: boolean }).isActive !== false)))
      .catch(() => message.error("Không tải được danh sách nhà máy"));
  }, []);

  // Load đồng hồ trung thế theo nhà máy + ngày
  const loadMeters = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate.format("YYYY-MM-DD"), type: "2" });
      if (selectedFactory) params.set("factoryId", selectedFactory);
      const data = await fetchJson<MvMeter[]>("/api/electric/daily-status?" + params.toString());
      setMeters(data);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedFactory]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMeters(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMeters]);

  const saveRecord = async (meter: MvMeter, values: { currNormal: number; currPeak: number; currOffPeak: number; note?: string }) => {
    setSaving(meter.id);
    try {
      await fetchJson("/api/electric/daily-input", postBody({
        meterId: meter.id,
        recordDate: selectedDate.format("YYYY-MM-DD"),
        currNormal: values.currNormal,
        currPeak: values.currPeak,
        currOffPeak: values.currOffPeak,
        note: values.note || null,
      }));
      message.success("Đã chốt " + meter.code);
      await loadMeters();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không lưu được");
    } finally {
      setSaving(null);
    }
  };

  const doneCount = meters.filter((m) => m.todayRecord).length;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Nhập chỉ số điện trung thế</Title>
        <Text type="secondary">Mỗi đồng hồ trung thế nhập 3 chỉ số: Bình thường, Cao điểm, Thấp điểm.</Text>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6}>
            <DatePicker value={selectedDate} onChange={(v) => v && setSelectedDate(v)} style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Col>
          <Col xs={24} md={8}>
            <Select allowClear placeholder="Tất cả nhà máy" value={selectedFactory} onChange={setSelectedFactory} options={factories.map((f) => ({ label: f.name, value: f.id }))} style={{ width: "100%" }} />
          </Col>
          <Col xs={24} md={4}>
            <Button icon={<ReloadOutlined />} onClick={loadMeters} loading={loading} block>Tải lại</Button>
          </Col>
          <Col xs={24} md={6}>
            <Statistic title="Đã chốt" value={doneCount} suffix={"/ " + meters.length + " đồng hồ"} valueStyle={{ color: doneCount === meters.length && meters.length > 0 ? "#389e0d" : undefined }} />
          </Col>
        </Row>
      </Card>

      {meters.length === 0 && !loading && (
        <Card><Empty description="Không có đồng hồ trung thế nào. Hãy thêm trong Danh mục → ĐH Trung thế." /></Card>
      )}

      <Row gutter={[16, 16]}>
        {meters.map((meter) => (
          <Col xs={24} lg={12} key={meter.id}>
            <MvMeterCard meter={meter} date={selectedDate} canEdit={canEditDaily} saving={saving === meter.id} onSave={(values) => saveRecord(meter, values)} />
          </Col>
        ))}
      </Row>
    </>
  );
}

function MvMeterCard({ meter, date, canEdit, saving, onSave }: {
  meter: MvMeter;
  date: Dayjs;
  canEdit: boolean;
  saving: boolean;
  onSave: (values: { currNormal: number; currPeak: number; currOffPeak: number; note?: string }) => void;
}) {
  const [editing, setEditing] = useState(!meter.todayRecord);
  const [form] = Form.useForm();

  const last = meter.lastRecord;
  const today = meter.todayRecord;

  const prevNormal = last?.currNormal ?? 0;
  const prevPeak = last?.currPeak ?? 0;
  const prevOffPeak = last?.currOffPeak ?? 0;

  useEffect(() => {
    if (today) {
      form.setFieldsValue({
        currNormal: today.currNormal,
        currPeak: today.currPeak,
        currOffPeak: today.currOffPeak,
        note: today.note,
      });
    } else {
      form.resetFields();
    }
  }, [today, form]);

  const handleFinish = (values: { currNormal: number; currPeak: number; currOffPeak: number; note?: string }) => {
    onSave(values);
    setEditing(false);
  };

  return (
    <Card
      title={
        <Space>
          <Tag color="purple">{meter.code}</Tag>
          <Text strong>{meter.name}</Text>
          {today && <Tag color="green" icon={<CheckCircleOutlined />}>Đã chốt</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary">Nhà máy: {meter.factory?.name || "---"}</Text>
          <Text type="secondary">TU/TI: {meter.tu}/{meter.ti}</Text>
        </Space>
      }
    >
      {/* Chỉ số kỳ trước */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Statistic title="BT kỳ trước" value={prevNormal} precision={2} valueStyle={{ fontSize: 16 }} />
        </Col>
        <Col span={8}>
          <Statistic title="CĐ kỳ trước" value={prevPeak} precision={2} valueStyle={{ fontSize: 16 }} />
        </Col>
        <Col span={8}>
          <Statistic title="TĐ kỳ trước" value={prevOffPeak} precision={2} valueStyle={{ fontSize: 16 }} />
        </Col>
      </Row>

      {/* Form nhập / hiển thị */}
      {today && !editing ? (
        <>
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={8}>
              <Card size="small" style={{ background: "#f0f5ff" }}>
                <Statistic title="Bình thường" value={today.consNormal ?? 0} precision={2} suffix="kWh" valueStyle={{ fontSize: 15, color: "#1677ff" }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ background: "#fff1f0" }}>
                <Statistic title="Cao điểm" value={today.consPeak ?? 0} precision={2} suffix="kWh" valueStyle={{ fontSize: 15, color: "#f5222d" }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ background: "#f6ffed" }}>
                <Statistic title="Thấp điểm" value={today.consOffPeak ?? 0} precision={2} suffix="kWh" valueStyle={{ fontSize: 15, color: "#52c41a" }} />
              </Card>
            </Col>
          </Row>
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={12}>
              <Statistic title="Tổng tiêu thụ" value={today.consTotal} precision={2} suffix="kWh" />
            </Col>
            <Col span={12}>
              <Statistic title="Tổng tiền" value={today.costTotal} precision={0} suffix="VNĐ" />
            </Col>
          </Row>
          {today.note && <Text type="secondary">Ghi chú: {today.note}</Text>}
          {canEdit && (
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)} style={{ marginTop: 8 }} block>Sửa chỉ số</Button>
          )}
        </>
      ) : (
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="currNormal" label="Chỉ số BT" rules={[{ required: true, message: "Nhập chỉ số" }]}>
                <InputNumber min={0} style={{ width: "100%" }} placeholder={String(prevNormal)} controls={false} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="currPeak" label="Chỉ số CĐ" rules={[{ required: true, message: "Nhập chỉ số" }]}>
                <InputNumber min={0} style={{ width: "100%" }} placeholder={String(prevPeak)} controls={false} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="currOffPeak" label="Chỉ số TĐ" rules={[{ required: true, message: "Nhập chỉ số" }]}>
                <InputNumber min={0} style={{ width: "100%" }} placeholder={String(prevOffPeak)} controls={false} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={1} placeholder="Ghi chú nếu có..." />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} disabled={!canEdit}>
              {today ? "Cập nhật" : "Chốt số"}
            </Button>
            {today && <Button onClick={() => setEditing(false)}>Hủy</Button>}
          </Space>
        </Form>
      )}
    </Card>
  );
}
