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
  bg: "#f5f7fb",
  headerBg: "rgba(255,255,255,0.97)",
  accent: "#006dcb",
  accentGlow: "rgba(0,109,203,0.16)",
  accentDim: "#e8f3ff",
  siderBorder: "#dbe5f0",
  text: "#172033",
  textMuted: "#526174",
  success: "#10b981",
  danger: "#d92d20",
  gold: "#b7791f",
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
        algorithm: theme.defaultAlgorithm,
        token: {
          colorBgBase: COLORS.bg,
          colorBgContainer: "#ffffff",
          colorBgElevated: "#ffffff",
          colorBgLayout: COLORS.bg,
          colorBorder: COLORS.siderBorder,
          colorBorderSecondary: "#e6edf5",
          colorText: COLORS.text,
          colorTextSecondary: COLORS.textMuted,
          colorTextTertiary: "#7b8794",
          colorPrimary: COLORS.accent,
          colorLink: COLORS.accent,
          colorSuccess: COLORS.success,
          colorError: COLORS.danger,
          colorWarning: COLORS.gold,
          borderRadius: 8,
          fontFamily: "var(--font-geist-sans), -apple-system, sans-serif",
        },
        components: {
          Card: { colorBgContainer: "#ffffff", colorBorderSecondary: "#e6edf5" },
          Select: { colorBgContainer: "#ffffff", colorBgElevated: "#ffffff" },
          DatePicker: { colorBgContainer: "#ffffff", colorBgElevated: "#ffffff" },
          Input: { colorBgContainer: "#ffffff" },
          InputNumber: { colorBgContainer: "#ffffff" },
          Segmented: { trackBg: "#e8eef6", itemSelectedBg: "#ffffff", itemColor: COLORS.textMuted, itemSelectedColor: COLORS.accent },
          Alert: {
            colorInfoBg: "#e8f3ff",
            colorInfoBorder: "#b6dcff",
            colorWarningBg: "#fff7e6",
            colorWarningBorder: "#ffe0a3",
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
              <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.text, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
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
