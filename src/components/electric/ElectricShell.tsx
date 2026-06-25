"use client";

import {
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FormOutlined,
  LogoutOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const roleLabel: Record<string, string> = { ADMIN: "Quản trị", EDITOR: "Biên tập", VIEWER: "Chỉ xem" };
const roleColor: Record<string, string> = { ADMIN: "red", EDITOR: "blue", VIEWER: "default" };

export function ElectricShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const items: MenuProps["items"] = [
    {
      key: "electric",
      label: "ĐIỆN NĂNG",
      type: "group",
      children: [
        { key: "/electric/overview", icon: <DashboardOutlined />, label: "Tổng quan" },
        { key: "/electric/daily-input", icon: <FormOutlined />, label: "Nhập chỉ số điện" },
        { key: "/electric/live", icon: <ThunderboltOutlined />, label: "Realtime" },
        { key: "/electric/reports", icon: <BarChartOutlined />, label: "Báo cáo điện năng" },
        { key: "/electric/prices", icon: <DollarOutlined />, label: "Đơn giá điện" },
        { key: "/electric/catalog", icon: <DatabaseOutlined />, label: "Danh mục điện năng" },
      ],
    },
    ...(role === "ADMIN"
      ? [
          {
            key: "admin",
            label: "QUẢN TRỊ",
            type: "group" as const,
            children: [{ key: "/electric/users", icon: <TeamOutlined />, label: "Người dùng" }],
          },
        ]
      : []),
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={260} theme="light" breakpoint="lg" collapsedWidth={0}>
        <div style={{ height: 64, display: "flex", alignItems: "center", padding: "0 18px", gap: 10 }}>
          <ThunderboltOutlined style={{ color: "#faad14", fontSize: 24 }} />
          <div>
            <div style={{ fontWeight: 700, lineHeight: 1.1 }}>PHUBAI-MES</div>
            <Text type="secondary" style={{ fontSize: 12 }}>Electric module</Text>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={["electric", "admin"]}
          items={items}
          onClick={(event) => router.push(event.key)}
          style={{ borderInlineEnd: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            height: 56,
            background: "#fff",
            borderBottom: "1px solid #f0f0f0",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text strong>Module điện năng</Text>
          <Space size={16}>
            {session?.user ? (
              <Space size={8}>
                <Text>{session.user.name}</Text>
                <Tag color={roleColor[role || "VIEWER"]}>{roleLabel[role || "VIEWER"]}</Tag>
              </Space>
            ) : null}
            <a onClick={() => signOut({ callbackUrl: "/login" })} style={{ cursor: "pointer" }}>
              <LogoutOutlined /> Đăng xuất
            </a>
          </Space>
        </Header>
        <Content style={{ background: "#f5f7fb", padding: 20 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
