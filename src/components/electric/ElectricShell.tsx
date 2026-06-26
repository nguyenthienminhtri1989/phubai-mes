"use client";

import {
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  DownOutlined,
  FormOutlined,
  KeyOutlined,
  LogoutOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Avatar, Dropdown, Layout, Menu, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { ChangePasswordModal } from "./ChangePasswordModal";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const roleLabel: Record<string, string> = { ADMIN: "Quản trị", MANAGER: "Trưởng phòng", EDITOR: "Biên tập", VIEWER: "Chỉ xem" };
const roleColor: Record<string, string> = { ADMIN: "red", MANAGER: "purple", EDITOR: "blue", VIEWER: "default" };

const pageTitle: Record<string, string> = {
  "/electric/overview": "Tổng quan điện năng",
  "/electric/daily-input": "Nhập chỉ số điện",
  "/electric/live": "Realtime điện năng",
  "/electric/reports": "Báo cáo điện năng",
  "/electric/prices": "Đơn giá điện",
  "/electric/catalog": "Danh mục điện năng",
  "/electric/users": "Quản lý người dùng",
};

export function ElectricShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const userMenuItems: MenuProps["items"] = [
    { key: "change-password", icon: <KeyOutlined />, label: "Đổi mật khẩu" },
    { type: "divider" },
    { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", danger: true },
  ];

  const onUserMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "change-password") setPasswordModalOpen(true);
    if (key === "logout") void signOut({ callbackUrl: "/login" });
  };

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
      <Sider width={264} theme="light" breakpoint="lg" collapsedWidth={0} style={{ boxShadow: "2px 0 12px rgba(15,23,42,0.06)" }}>
        <div
          style={{
            height: 72,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 12,
            background: "linear-gradient(135deg, #1f2733 0%, #11161f 100%)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg, #faad14, #d4380d)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ThunderboltOutlined style={{ color: "#fff", fontSize: 20 }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, lineHeight: 1.1, color: "#fff", letterSpacing: 0.3 }}>PHUBAI-MES</div>
            <Text style={{ fontSize: 12, color: "#9aa4b2" }}>Electric module</Text>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={["electric", "admin"]}
          items={items}
          onClick={(event) => router.push(event.key)}
          style={{ borderInlineEnd: 0, padding: "8px 0" }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            height: 64,
            background: "#fff",
            borderBottom: "1px solid #eef0f3",
            padding: "0 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text strong style={{ fontSize: 16 }}>{pageTitle[pathname] || "Module điện năng"}</Text>
          {session?.user ? (
            <Dropdown menu={{ items: userMenuItems, onClick: onUserMenuClick }} trigger={["click"]}>
              <Space size={10} style={{ cursor: "pointer" }}>
                <Avatar size={32} style={{ backgroundColor: "#faad14", color: "#1f2733", fontWeight: 700 }}>
                  {(session.user.name || "?").charAt(0).toUpperCase()}
                </Avatar>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 600 }}>{session.user.name}</div>
                  <Tag color={roleColor[role || "VIEWER"]} style={{ marginTop: 2 }}>{roleLabel[role || "VIEWER"]}</Tag>
                </div>
                <DownOutlined style={{ fontSize: 10, color: "#8c8c8c" }} />
              </Space>
            </Dropdown>
          ) : null}
        </Header>
        <Content style={{ background: "#f5f7fb", padding: 24 }}>{children}</Content>
      </Layout>
      <ChangePasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />
    </Layout>
  );
}
