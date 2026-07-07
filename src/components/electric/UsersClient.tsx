"use client";

import { EditOutlined, LockOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

const { Title, Text } = Typography;

type Factory = { id: string; code: string; name: string; isActive: boolean };

type AppUser = {
  id: string;
  username: string;
  fullName: string;
  role: "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER";
  factoryId?: string | null;
  factory?: Factory | null;
  isActive: boolean;
  createdAt: string;
};

const roleOptions = [
  { label: "ADMIN - toàn quyền, quản lý user", value: "ADMIN" },
  { label: "MANAGER - quản lý danh mục + giá điện", value: "MANAGER" },
  { label: "EDITOR - xem + nhập chỉ số", value: "EDITOR" },
  { label: "VIEWER - chỉ xem", value: "VIEWER" },
];

const roleColor: Record<string, string> = { ADMIN: "red", MANAGER: "purple", EDITOR: "blue", VIEWER: "default" };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || "HTTP " + response.status);
  return data as T;
}

export function UsersClient() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const [users, setUsers] = useState<AppUser[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextFactories] = await Promise.all([
        fetchJson<AppUser[]>("/api/admin/users"),
        fetchJson<Factory[]>("/api/electric/factories"),
      ]);
      setUsers(nextUsers);
      setFactories(nextFactories.filter((factory) => factory.isActive));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không tải được danh sách user");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === "ADMIN") {
      const timer = window.setTimeout(() => void load(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [load, role]);

  if (status === "loading") return null;

  if (role !== "ADMIN") {
    return (
      <Alert
        type="warning"
        showIcon
        message="Không có quyền truy cập"
        description="Chỉ tài khoản ADMIN mới được quản lý người dùng."
      />
    );
  }

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: "VIEWER", factoryId: undefined, isActive: true });
    setModalOpen(true);
  };

  const openEdit = (record: AppUser) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({ ...record, password: undefined });
    setModalOpen(true);
  };

  const save = async (values: Record<string, unknown>) => {
    try {
      if (editing) {
        await fetchJson(`/api/admin/users/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
      } else {
        await fetchJson("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
      }
      message.success("Đã lưu user");
      setModalOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không lưu được user");
    }
  };

  const lockUser = async (record: AppUser) => {
    try {
      await fetchJson(`/api/admin/users/${record.id}`, { method: "DELETE" });
      message.success("Đã khóa tài khoản");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không khóa được tài khoản");
    }
  };

  const columns: ColumnsType<AppUser> = [
    { title: "Tài khoản", dataIndex: "username", render: (value: string) => <b>{value}</b> },
    { title: "Họ tên", dataIndex: "fullName" },
    { title: "Quyền", dataIndex: "role", render: (value: string) => <Tag color={roleColor[value]}>{value}</Tag> },
    { title: "Nhà máy", render: (_: unknown, record: AppUser) => record.factory?.name || "Tất cả" },
    { title: "Trạng thái", dataIndex: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "Đang dùng" : "Đã khóa"}</Tag> },
    {
      title: "Thao tác",
      width: 120,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Khóa tài khoản này?" onConfirm={() => lockUser(record)}>
            <Button size="small" danger icon={<LockOutlined />} disabled={!record.isActive} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Quản lý người dùng</Title>
        <Text type="secondary">Tạo và phân quyền tài khoản truy cập PHUBAI-MES (ADMIN / MANAGER / EDITOR / VIEWER).</Text>
      </div>
      <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm user</Button>}>
        <Table rowKey="id" loading={loading} dataSource={users} columns={columns} />
      </Card>
      <Modal title={editing ? "Sửa user" : "Thêm user"} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="username" label="Tài khoản" rules={[{ required: true }]}>
            <Input disabled={!!editing} placeholder="vd: nguyenvana" />
          </Form.Item>
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={editing ? "Đổi mật khẩu (để trống nếu không đổi)" : "Mật khẩu"} rules={editing ? [] : [{ required: true, min: 6, message: "Ít nhất 6 ký tự" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Quyền" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item name="factoryId" label="Nhà máy được nhập liệu">
            <Select allowClear placeholder="Không giới hạn" options={factories.map((factory) => ({ label: factory.name, value: factory.id }))} />
          </Form.Item>
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
