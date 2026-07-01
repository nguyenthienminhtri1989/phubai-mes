"use client";

import {
  HomeFilled,
  ThunderboltFilled,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, ConfigProvider, Dropdown, theme } from "antd";
import type { MenuProps } from "antd";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

const COLORS = {
  bg: "#0a0e17",
  headerBg: "rgba(13,18,32,0.97)",
  accent: "#00d0ff",
  accentGlow: "rgba(0,208,255,0.25)",
  accentDim: "rgba(0,208,255,0.12)",
  siderBorder: "rgba(0,208,255,0.08)",
  text: "#e2e8f0",
  textMuted: "#64748b",
  success: "#10b981",
  danger: "#ef4444",
  gold: "#f5a623",
};

export default function MobileLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();

  const userMenuItems: MenuProps["items"] = [
    {
      key: "info",
      label: (
        <div style={{ padding: "4px 0" }}>
          <div style={{ fontWeight: 600, color: COLORS.text }}>{session?.user?.name}</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>{session?.user?.email}</div>
        </div>
      ),
      disabled: true,
    },
    { type: "divider" },
    { key: "desktop", label: "Giao diện Desktop" },
    { type: "divider" },
    { key: "logout", label: <span style={{ color: COLORS.danger }}>Đăng xuất</span> },
  ];

  const onUserMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "desktop") router.push("/electric/overview");
    if (key === "logout") void signOut({ callbackUrl: "/login" });
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgBase: COLORS.bg,
          colorBgContainer: "#111827",
          colorBgElevated: "#1a2235",
          colorBgLayout: COLORS.bg,
          colorBorder: "rgba(0,208,255,0.12)",
          colorBorderSecondary: "rgba(0,208,255,0.07)",
          colorText: COLORS.text,
          colorTextSecondary: "#94a3b8",
          colorTextTertiary: "#64748b",
          colorPrimary: COLORS.accent,
          colorLink: COLORS.accent,
          colorSuccess: COLORS.success,
          colorError: COLORS.danger,
          colorWarning: COLORS.gold,
          borderRadius: 8,
          fontFamily: "var(--font-geist-sans), -apple-system, sans-serif",
        },
        components: {
          Card: { colorBgContainer: "#111827", colorBorderSecondary: "rgba(0,208,255,0.1)" },
          Select: { colorBgContainer: "#1a2235", colorBgElevated: "#1a2235" },
          DatePicker: { colorBgContainer: "#1a2235", colorBgElevated: "#1a2235" },
          Input: { colorBgContainer: "#1a2235" },
          InputNumber: { colorBgContainer: "#1a2235" },
          Segmented: { trackBg: "#0d1220", itemSelectedBg: "#1a2235", itemColor: "#94a3b8", itemSelectedColor: COLORS.accent },
          Alert: {
            colorInfoBg: "rgba(0,208,255,0.08)",
            colorInfoBorder: "rgba(0,208,255,0.2)",
            colorWarningBg: "rgba(245,166,35,0.1)",
            colorWarningBorder: "rgba(245,166,35,0.3)",
          },
        },
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: COLORS.bg, overflow: "hidden" }}>
        {/* Header mobile */}
        <header
          style={{
            height: 56,
            background: COLORS.headerBg,
            borderBottom: `1px solid ${COLORS.siderBorder}`,
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: 10,
            flexShrink: 0,
            zIndex: 50,
          }}
        >
          {/* Home button */}
          <button
            onClick={() => router.push("/electric/overview")}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: COLORS.accentDim,
              border: `1px solid ${COLORS.siderBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: COLORS.accent,
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            <HomeFilled />
          </button>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${COLORS.accent}, #0066ff)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: `0 0 12px ${COLORS.accentGlow}`,
              }}
            >
              <ThunderboltFilled style={{ color: "#fff", fontSize: 16 }} />
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#fff", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                <span style={{ color: COLORS.danger }}>POWER </span>
                <span style={{ color: COLORS.accent }}>VIEW</span>
              </div>
              <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Mobile</div>
            </div>
          </div>

          {/* User avatar */}
          {session?.user && (
            <Dropdown menu={{ items: userMenuItems, onClick: onUserMenuClick }} trigger={["click"]}>
              <Avatar
                size={34}
                style={{
                  background: `linear-gradient(135deg, ${COLORS.accent}, #0066ff)`,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                icon={<UserOutlined />}
              >
                {session.user.name?.charAt(0).toUpperCase()}
              </Avatar>
            </Dropdown>
          )}
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflow: "auto", padding: "12px 8px", background: COLORS.bg }}>
          {children}
        </main>
      </div>
    </ConfigProvider>
  );
}
