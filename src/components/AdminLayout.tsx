"use client";

import {
  BarChartOutlined,
  BulbOutlined,
  CloseOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FormOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Badge,
  ConfigProvider,
  Dropdown,
  Menu,
  Tooltip,
  theme,
} from "antd";
import type { MenuProps } from "antd";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ChangePasswordModal } from "./electric/ChangePasswordModal";


// ─── Theme tokens ────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0a0e17",
  siderBg: "#0d1220",
  siderBorder: "rgba(0,208,255,0.08)",
  headerBg: "rgba(13,18,32,0.95)",
  accent: "#00d0ff",
  accentGlow: "rgba(0,208,255,0.25)",
  accentDim: "rgba(0,208,255,0.12)",
  gold: "#f5a623",
  goldGlow: "rgba(245,166,35,0.3)",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#334155",
  success: "#10b981",
  danger: "#ef4444",
  menuHover: "rgba(0,208,255,0.07)",
  menuSelected: "rgba(0,208,255,0.14)",
  menuSelectedBorder: "#00d0ff",
  groupLabel: "rgba(100,116,139,0.6)",
};

// ─── Role helpers ─────────────────────────────────────────────────────────────
const roleLabel: Record<string, string> = {
  ADMIN: "Quản trị",
  MANAGER: "Trưởng phòng",
  EDITOR: "Biên tập",
  VIEWER: "Chỉ xem",
};
const roleColor: Record<string, string> = {
  ADMIN: "#ef4444",
  MANAGER: "#a855f7",
  EDITOR: COLORS.accent,
  VIEWER: COLORS.textMuted,
};

// ─── Page title map ───────────────────────────────────────────────────────────
const pageTitle: Record<string, { label: string; icon: ReactNode }> = {
  "/electric/overview": {
    label: "Tổng quan điện năng",
    icon: <DashboardOutlined />,
  },
  "/electric/daily-input": {
    label: "Nhập chỉ số điện",
    icon: <FormOutlined />,
  },
  "/electric/live": {
    label: "Realtime điện năng",
    icon: <ThunderboltOutlined />,
  },
  "/electric/reports": {
    label: "Báo cáo điện năng",
    icon: <BarChartOutlined />,
  },
  "/electric/prices": { label: "Đơn giá điện", icon: <DollarOutlined /> },
  "/electric/catalog": {
    label: "Danh mục điện năng",
    icon: <DatabaseOutlined />,
  },
  "/electric/users": { label: "Quản lý người dùng", icon: <TeamOutlined /> },
};

// ─── Sidebar menu items ───────────────────────────────────────────────────────
function buildMenuItems(role?: string): MenuProps["items"] {
  return [
    {
      key: "group-electric",
      label: "GIÁM SÁT ĐIỆN NĂNG",
      type: "group",
      children: [
        {
          key: "/electric/overview",
          icon: <DashboardOutlined />,
          label: "Tổng quan",
        },
        {
          key: "/electric/live",
          icon: <ThunderboltOutlined />,
          label: (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Realtime
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: COLORS.success,
                  boxShadow: "0 0 6px #10b981",
                  animation: "pulse-dot 1.5s ease-in-out infinite",
                }}
              />
            </span>
          ),
        },
        {
          key: "/electric/reports",
          icon: <BarChartOutlined />,
          label: "Báo cáo điện năng",
        },
        {
          key: "/electric/daily-input",
          icon: <FormOutlined />,
          label: "Nhập chỉ số điện",
        },
      ],
    },
    {
      key: "group-config",
      label: "CẤU HÌNH",
      type: "group",
      children: [
        {
          key: "/electric/prices",
          icon: <DollarOutlined />,
          label: "Đơn giá điện",
        },
        {
          key: "/electric/catalog",
          icon: <DatabaseOutlined />,
          label: "Danh mục điện năng",
        },
      ],
    },
    ...(role === "ADMIN"
      ? [
          {
            key: "group-admin",
            label: "QUẢN TRỊ HỆ THỐNG",
            type: "group" as const,
            children: [
              {
                key: "/electric/users",
                icon: <TeamOutlined />,
                label: "Người dùng",
              },
            ],
          },
        ]
      : []),
  ];
}

// ─── Animated ticker clock ───────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
      setDate(
        now.toLocaleDateString("vi-VN", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ textAlign: "right", lineHeight: 1.3 }}>
      <div
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 17,
          fontWeight: 700,
          color: COLORS.accent,
          letterSpacing: 2,
          textShadow: `0 0 12px ${COLORS.accentGlow}`,
        }}
      >
        {time}
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted }}>{date}</div>
    </div>
  );
}

// ─── Notification bell ────────────────────────────────────────────────────────
function AlertBell() {
  return (
    <Tooltip title="Cảnh báo hệ thống" placement="bottom">
      <Badge count={0} size="small">
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: COLORS.accentDim,
            border: `1px solid ${COLORS.siderBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s",
            color: COLORS.accent,
            fontSize: 16,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              COLORS.menuSelected;
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              `0 0 12px ${COLORS.accentGlow}`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              COLORS.accentDim;
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
          }}
        >
          <BulbOutlined />
        </button>
      </Badge>
    </Tooltip>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const currentPage = pageTitle[pathname];
  const menuItems = buildMenuItems(role);

  const userDropdownItems: MenuProps["items"] = [
    {
      key: "info",
      label: (
        <div style={{ padding: "4px 0" }}>
          <div style={{ fontWeight: 600, color: COLORS.text }}>
            {session?.user?.name}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>
            {session?.user?.email}
          </div>
        </div>
      ),
      disabled: true,
    },
    { type: "divider" },
    {
      key: "change-password",
      icon: <KeyOutlined style={{ color: COLORS.accent }} />,
      label: "Đổi mật khẩu",
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined style={{ color: COLORS.danger }} />,
      label: <span style={{ color: COLORS.danger }}>Đăng xuất</span>,
    },
  ];

  const onUserMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "change-password") setPasswordModalOpen(true);
    if (key === "logout") void signOut({ callbackUrl: "/login" });
  };

  // Close mobile drawer when route changes
  useEffect(() => {
    const timer = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const siderContent = (
    <>
      {/* Logo */}
      <Link
        href="/electric/overview"
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 12,
          padding: collapsed ? "0 16px" : "0 20px",
          height: 72,
          textDecoration: "none",
          overflow: "hidden",
          borderBottom: `1px solid ${COLORS.siderBorder}`,
          background: "rgba(0,208,255,0.04)",
          transition: "padding 0.2s",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: `linear-gradient(135deg, ${COLORS.accent}, #0066ff)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 0 20px ${COLORS.accentGlow}`,
          }}
        >
          <ThunderboltFilled style={{ color: "#fff", fontSize: 20 }} />
        </div>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 14,
                color: "#fff",
                letterSpacing: 0.5,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: COLORS.danger }}>POWER </span>
              <span style={{ color: COLORS.accent }}> VIEW</span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: COLORS.textMuted,
                letterSpacing: 2,
                textTransform: "uppercase",
                marginTop: 1,
              }}
            >
              Power Monitor
            </div>
          </div>
        )}
      </Link>

      {/* Menu */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "12px 0",
        }}
      >
        <ConfigProvider
          theme={{
            components: {
              Menu: {
                darkItemBg: "transparent",
                darkSubMenuItemBg: "transparent",
                itemBg: "transparent",
                itemSelectedBg: COLORS.menuSelected,
                itemHoverBg: COLORS.menuHover,
                itemSelectedColor: COLORS.accent,
                itemColor: COLORS.text,
                groupTitleColor: COLORS.textMuted,
                groupTitleFontSize: 10,
                itemHeight: 42,
                iconSize: 15,
              },
            },
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[pathname]}
            items={menuItems}
            inlineCollapsed={collapsed}
            onClick={({ key }) => router.push(key)}
            style={
              {
                background: "transparent",
                borderInlineEnd: 0,
                "--menu-selected-border": COLORS.menuSelectedBorder,
              } as React.CSSProperties
            }
          />
        </ConfigProvider>
      </div>

      {/* Copyright footer */}
      {!collapsed ? (
        <div
          style={{
            margin: "0 12px 10px",
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(0,208,255,0.04)",
            border: `1px solid ${COLORS.siderBorder}`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: COLORS.textMuted,
              letterSpacing: 0.5,
              lineHeight: 1.5,
            }}
          >
            © {new Date().getFullYear()} Bản quyền thuộc về
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: COLORS.accent,
              letterSpacing: 1,
              textShadow: `0 0 8px ${COLORS.accentGlow}`,
            }}
          >
            Mr. Tri
          </div>
          <div
            style={{
              fontSize: 10,
              color: COLORS.textDim,
              marginTop: 1,
            }}
          >
            PHUBAI POWER VIEW
          </div>
        </div>
      ) : (
        <div
          style={{
            margin: "0 auto 10px",
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "rgba(0,208,255,0.04)",
            border: `1px solid ${COLORS.siderBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 800,
            color: COLORS.accent,
            letterSpacing: 0,
          }}
          title="© Mr. Tri – PHUBAI POWER VIEW"
        >
          ©
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: 44,
          margin: "0 12px 12px",
          borderRadius: 10,
          background: COLORS.accentDim,
          border: `1px solid ${COLORS.siderBorder}`,
          cursor: "pointer",
          color: COLORS.textMuted,
          fontSize: 13,
          transition: "all 0.2s",
          width: "calc(100% - 24px)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.accent;
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            COLORS.accent;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.textMuted;
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            COLORS.siderBorder;
        }}
      >
        {collapsed ? (
          <MenuUnfoldOutlined style={{ fontSize: 15 }} />
        ) : (
          <MenuFoldOutlined style={{ fontSize: 15 }} />
        )}
        {!collapsed && <span style={{ fontSize: 12 }}>Thu gọn</span>}
      </button>
    </>
  );

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
          Card: {
            colorBgContainer: "#111827",
            colorBorderSecondary: "rgba(0,208,255,0.1)",
          },
          Table: {
            colorBgContainer: "#111827",
            headerBg: "#0d1220",
            rowHoverBg: "rgba(0,208,255,0.04)",
            borderColor: "rgba(0,208,255,0.08)",
          },
          Modal: {
            contentBg: "#111827",
            headerBg: "#0d1220",
          },
          Tabs: {
            colorBgContainer: "transparent",
          },
          Select: {
            colorBgContainer: "#1a2235",
            colorBgElevated: "#1a2235",
          },
          DatePicker: {
            colorBgContainer: "#1a2235",
            colorBgElevated: "#1a2235",
          },
          Input: {
            colorBgContainer: "#1a2235",
          },
          InputNumber: {
            colorBgContainer: "#1a2235",
          },
          Segmented: {
            trackBg: "#0d1220",
            itemSelectedBg: "#1a2235",
            itemColor: "#94a3b8",
            itemSelectedColor: COLORS.accent,
          },
          Dropdown: {
            colorBgElevated: "#1a2235",
          },
          Tooltip: {
            colorBgSpotlight: "#1a2235",
          },
          Statistic: {
            colorTextDescription: "#94a3b8",
          },
          Alert: {
            colorInfoBg: "rgba(0,208,255,0.08)",
            colorInfoBorder: "rgba(0,208,255,0.2)",
            colorWarningBg: "rgba(245,166,35,0.1)",
            colorWarningBorder: "rgba(245,166,35,0.3)",
          },
        },
      }}
    >
      {/* Global styles */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${COLORS.bg}; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.textDim}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${COLORS.textMuted}; }
        .ant-menu-item-group-title {
          font-size: 10px !important;
          letter-spacing: 1.5px !important;
          font-weight: 700 !important;
          padding: 12px 20px 4px !important;
        }
        .ant-menu-item.ant-menu-item-selected::before {
          content: '';
          position: absolute;
          left: 0;
          top: 6px;
          bottom: 6px;
          width: 3px;
          background: ${COLORS.accent};
          border-radius: 0 3px 3px 0;
          box-shadow: 0 0 8px ${COLORS.accentGlow};
        }
        .ant-menu-item {
          position: relative !important;
          border-radius: 8px !important;
          margin: 2px 8px !important;
          width: calc(100% - 16px) !important;
        }
        .ant-layout-sider-collapsed .ant-menu-item {
          margin: 2px 4px !important;
          width: calc(100% - 8px) !important;
          padding: 0 !important;
          justify-content: center !important;
        }
      `}</style>

      <div
        style={{
          display: "flex",
          height: "100vh",
          background: COLORS.bg,
          overflow: "hidden",
        }}
      >
        {/* ── Sidebar (desktop) ── */}
        <div
          style={{
            width: collapsed ? 68 : 240,
            minWidth: collapsed ? 68 : 240,
            height: "100vh",
            background: COLORS.siderBg,
            borderRight: `1px solid ${COLORS.siderBorder}`,
            display: "flex",
            flexDirection: "column",
            transition:
              "width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)",
            overflow: "hidden",
            flexShrink: 0,
            zIndex: 100,
          }}
        >
          {siderContent}
        </div>

        {/* ── Mobile drawer overlay ── */}
        {mobileOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              display: "flex",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(4px)",
              }}
              onClick={() => setMobileOpen(false)}
            />
            <div
              style={{
                width: 240,
                height: "100%",
                background: COLORS.siderBg,
                borderRight: `1px solid ${COLORS.siderBorder}`,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                zIndex: 1,
              }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 12,
                  background: "transparent",
                  border: "none",
                  color: COLORS.textMuted,
                  fontSize: 16,
                  cursor: "pointer",
                  zIndex: 2,
                }}
              >
                <CloseOutlined />
              </button>
              {siderContent}
            </div>
          </div>
        )}

        {/* ── Main area ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {/* Header */}
          <header
            style={{
              height: 64,
              background: COLORS.headerBg,
              borderBottom: `1px solid ${COLORS.siderBorder}`,
              backdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              padding: "0 24px",
              gap: 16,
              flexShrink: 0,
              zIndex: 50,
            }}
          >
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              style={{
                display: "none",
                width: 36,
                height: 36,
                background: COLORS.accentDim,
                border: `1px solid ${COLORS.siderBorder}`,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: COLORS.accent,
                fontSize: 16,
                flexShrink: 0,
              }}
              className="mobile-menu-btn"
            >
              <MenuUnfoldOutlined />
            </button>

            {/* Page title */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: 1,
                minWidth: 0,
              }}
            >
              {currentPage && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: COLORS.accentDim,
                    color: COLORS.accent,
                    fontSize: 15,
                    flexShrink: 0,
                  }}
                >
                  {currentPage.icon}
                </span>
              )}
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: COLORS.text,
                  letterSpacing: 0.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentPage?.label ?? "Module điện năng"}
              </span>
            </div>

            {/* Right controls */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexShrink: 0,
              }}
            >
              <LiveClock />
              <div
                style={{ width: 1, height: 28, background: COLORS.siderBorder }}
              />
              <AlertBell />
              <div
                style={{ width: 1, height: 28, background: COLORS.siderBorder }}
              />

              {/* User menu */}
              {session?.user ? (
                <Dropdown
                  menu={{ items: userDropdownItems, onClick: onUserMenuClick }}
                  trigger={["click"]}
                  overlayStyle={{ minWidth: 200 }}
                >
                  <button
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: COLORS.accentDim,
                      border: `1px solid ${COLORS.siderBorder}`,
                      borderRadius: 10,
                      padding: "4px 12px 4px 6px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        COLORS.accent;
                      (e.currentTarget as HTMLButtonElement).style.boxShadow =
                        `0 0 12px ${COLORS.accentGlow}`;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        COLORS.siderBorder;
                      (e.currentTarget as HTMLButtonElement).style.boxShadow =
                        "none";
                    }}
                  >
                    <Avatar
                      size={30}
                      style={{
                        background: `linear-gradient(135deg, ${COLORS.accent}, #0066ff)`,
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                      icon={<UserOutlined />}
                    >
                      {session.user.name?.charAt(0).toUpperCase()}
                    </Avatar>
                    <div style={{ textAlign: "left", lineHeight: 1.2 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: COLORS.text,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {session.user.name}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: roleColor[role || "VIEWER"],
                          fontWeight: 600,
                          letterSpacing: 0.5,
                        }}
                      >
                        {roleLabel[role || "VIEWER"]}
                      </div>
                    </div>
                  </button>
                </Dropdown>
              ) : null}
            </div>
          </header>

          {/* Content */}
          <main
            ref={contentRef}
            style={{
              flex: 1,
              overflow: "auto",
              padding: 24,
              background: COLORS.bg,
            }}
          >
            {/* Subtle grid background */}
            <div
              aria-hidden
              style={{
                position: "fixed",
                inset: 0,
                pointerEvents: "none",
                zIndex: 0,
                backgroundImage: `
                  linear-gradient(rgba(0,208,255,0.025) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(0,208,255,0.025) 1px, transparent 1px)
                `,
                backgroundSize: "40px 40px",
              }}
            />
            <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
          </main>
        </div>
      </div>

      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </ConfigProvider>
  );
}
