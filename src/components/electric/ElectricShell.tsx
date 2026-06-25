"use client";

import {
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FormOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Typography } from "antd";
import type { MenuProps } from "antd";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

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
];

export function ElectricShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

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
          defaultOpenKeys={["electric"]}
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
          <Text type="secondary">MES độc lập - namespace /electric</Text>
        </Header>
        <Content style={{ background: "#f5f7fb", padding: 20 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
