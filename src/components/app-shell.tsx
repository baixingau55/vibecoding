"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Cloud,
  Download,
  LayoutList,
  LineChart,
  Menu,
  SunMedium,
  User,
  Bell
} from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { href: "/tasks", label: "巡检任务", icon: LayoutList },
  { href: "/analytics", label: "巡检数据", icon: LineChart },
  { href: "/messages", label: "消息中心", icon: Bell }
];

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar =
    pathname === "/tasks/select" ||
    pathname === "/tasks" ||
    pathname === "/analytics" ||
    pathname === "/messages";
  const isShellFree = pathname === "/tasks/select" || pathname === "/tasks/new" || pathname.startsWith("/tasks/");
  const isHome = pathname === "/";

  return (
    <div className="tplink-app">
      <header className="tplink-topbar">
        <div className="tplink-topbar-left">
          <Link href="/" className="tplink-brand" aria-label="TP-LINK 商用云平台">
            <span className="tplink-brand-mark">TP-LINK</span>
            <span className="tplink-brand-divider" />
            <span className="tplink-brand-sub">商用云平台</span>
          </Link>

          <Link href="/" className="tplink-pill tplink-pill-ghost">
            <ChevronLeft size={14} strokeWidth={1.8} />
            <span>返回首页</span>
          </Link>

          <button type="button" className="tplink-pill tplink-pill-project">
            <span>普联技术有限公司</span>
            <span className="tplink-project-separator">|</span>
            <span>项目名称</span>
            <ChevronDown size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="tplink-topbar-right">
          <a className="tplink-topbar-link" href="https://www.tp-link.com.cn" target="_blank" rel="noreferrer">
            <Cloud size={14} strokeWidth={1.8} />
            <span>商云官网</span>
          </a>
          <button type="button" className="tplink-topbar-link">
            <Menu size={14} strokeWidth={1.8} />
            <span>服务及价格</span>
          </button>
          <button type="button" className="tplink-topbar-link">
            <CircleHelp size={14} strokeWidth={1.8} />
            <span>咨询与帮助</span>
            <ChevronDown size={12} strokeWidth={1.8} />
          </button>
          <button type="button" className="tplink-topbar-link">
            <Download size={14} strokeWidth={1.8} />
            <span>下载中心</span>
          </button>
          <button type="button" className="tplink-topbar-link">
            <SunMedium size={14} strokeWidth={1.8} />
            <span>浅色模式</span>
          </button>
          <button type="button" className="tplink-topbar-user">
            <User size={14} strokeWidth={1.8} />
            <span>admin</span>
            <ChevronDown size={12} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {showSidebar ? (
        <div className="tplink-shell">
          <aside className="tplink-sidebar">
            <Link href="/tasks/select" className="tplink-sidebar-logo" aria-label="进入算法展示界面">
              <div className="tplink-sidebar-ai">AI</div>
              <div className="tplink-sidebar-copy">AI算法巡检</div>
            </Link>

            <nav className="tplink-sidebar-nav" aria-label="AI巡检导航">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = matches(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} className={cn("tplink-sidebar-item", active && "tplink-sidebar-item-active")}>
                    <span className="tplink-sidebar-icon">
                      <Icon size={22} strokeWidth={1.8} />
                    </span>
                    <span className="tplink-sidebar-label">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="tplink-page">{children}</main>
        </div>
      ) : (
        <main className={cn("tplink-main", isShellFree && "tplink-main-wide", isHome && "tplink-main-home")}>{children}</main>
      )}
    </div>
  );
}
