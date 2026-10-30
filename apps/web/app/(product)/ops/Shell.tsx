"use client";

// The ALYR console's frame (D-033): the navigation on a laptop, a tab bar on a phone, and
// the staff check. Every page inside talks to /api/admin, which refuses anyone who is
// not ALYR staff signed in within the last 12 hours.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { color } from "../../_tokens/tokens";
import { useEffect, useState } from "react";
import "../_workspace/shell.css";
import "./ops.css";
import { loginUrl } from "../login/next";
import { api } from "./api";

type NavItem = { href: string; label: string; icon: string };
const MAIN: NavItem[] = [
  { href: "/ops", label: "Today", icon: "today" },
  { href: "/ops/clients", label: "Clients", icon: "clients" },
  { href: "/ops/onboarding", label: "Onboarding", icon: "onboarding" },
  { href: "/ops/requests", label: "Requests", icon: "asks" },
];
const SETTINGS: NavItem[] = [
  { href: "/ops/usage", label: "Usage", icon: "usage" },
  { href: "/ops/prices", label: "Price list", icon: "price" },
  { href: "/ops/templates", label: "Templates", icon: "templates" },
  { href: "/ops/signup", label: "Sign-up", icon: "door" },
  { href: "/ops/terms", label: "Terms", icon: "audit" },
  { href: "/ops/staff", label: "Staff", icon: "staff" },
  { href: "/ops/audit", label: "Audit log", icon: "audit" },
];

const PATHS: Record<string, string> = {
  today: "M4 5h16v15H4z M4 10h16 M9 3v4 M15 3v4",
  clients: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M22 19v-1a4 4 0 0 0-3-3.9 M16 4.1a3 3 0 0 1 0 5.8",
  asks: "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.5 8.5 0 1 1 21 11.5Z",
  onboarding: "M4 12h4l3 7 4-14 3 7h2",
  usage: "M5 20v-8 M12 20V5 M19 20v-5 M3 20h18",
  price: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z M7.5 7.5h.01",
  templates: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M16.5 13v7 M13 16.5h7",
  door: "M14 3h5v18h-5 M10 17l5-5-5-5 M15 12H3",
  staff: "M12 3 4 6v5c0 5.2 3.4 8.4 8 10 4.6-1.6 8-4.8 8-10V6z",
  audit: "M9 4h10v16H5V8z M9 4v4H5 M9 13h6 M9 17h4",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  out: "M10 17l-5-5 5-5 M5 12h12 M14 4h5v16h-5",
};

export function OpsIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg className="sh-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

function Mark() {
  return (
    <svg className="sh-mark" viewBox="0 0 190 160" aria-hidden="true">
      <polygon fill="currentColor" points="50,0 180,0 130,62 0,62" />
      <polygon fill="currentColor" points="0,72 126,72 39,160" />
      <polygon fill={color.brand.volt} points="134,72 190,72 142,160 46,160" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState("");
  const [denied, setDenied] = useState("");
  const [more, setMore] = useState(false);

  useEffect(() => {
    const first = setTimeout(async () => {
      const answer = await api<{ me: string }>("/api/admin/staff");
      if (answer.ok) { setMe(answer.data.me); setDenied(""); return; }
      setDenied(answer.status === 403 ? "This console is for ALYR staff only." : answer.error || "Sign in as ALYR staff to use the console.");
    }, 0);
    return () => clearTimeout(first);
  }, []);

  const current = [...MAIN, ...SETTINGS].find((n) => (n.href === "/ops" ? path === "/ops" : path.startsWith(n.href)));
  const link = (n: NavItem) => (
    <Link key={n.href} href={n.href} className={`sh-link ${current?.href === n.href ? "on" : ""}`} aria-current={current?.href === n.href ? "page" : undefined}>
      <OpsIcon name={n.icon} />{n.label}
    </Link>
  );

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (denied) {
    return (
      <div className="sh-empty ops-denied">
        <h1>ALYR console</h1>
        <p>{denied}</p>
        <a className="btn primary" href={loginUrl(path)}>Sign in</a>
      </div>
    );
  }

  return (
    <div className="sh ops">
      <aside className="sh-side">
        <div className="sh-brand"><Mark /><span className="sh-brand-text"><b>ALYR console</b><small>Staff only</small></span></div>
        <nav aria-label="Console">
          {MAIN.map(link)}
          <span className="sh-group">Settings</span>
          {SETTINGS.map(link)}
        </nav>
        <div className="sh-foot">
          <span className="sh-avatar">{(me || "A").slice(0, 1).toUpperCase()}</span>
          <span className="sh-me"><b>{me ? me.split("@")[0] : "Local demo"}</b><small>{me || "not signed in"}</small></span>
          {me && <button className="sh-iconbtn" onClick={signOut} aria-label="Sign out" title="Sign out"><OpsIcon name="out" /></button>}
        </div>
      </aside>
      <div className="sh-sheet">
        <header className="sh-top">
          <div className="sh-crumbs"><b>ALYR</b><i>/</i><span>{current?.label ?? "Console"}</span></div>
          <span className="spacer" />
          <span className="sh-live on"><span className="sh-dot" />Staff only</span>
        </header>
        <header className="sh-mtop">
          <Mark />
          <span className="sh-brand-text"><b>ALYR console</b><small>{current?.label ?? "Console"}</small></span>
        </header>
        <div className="sh-scroll">
          <main className="sh-main sh-enter ops-main" key={path}>{children}</main>
        </div>
      </div>
      {more && (
        <div className="ops-more" role="dialog" aria-label="More">
          {SETTINGS.map((n) => <Link key={n.href} href={n.href} onClick={() => setMore(false)}><OpsIcon name={n.icon} />{n.label}</Link>)}
        </div>
      )}
      <nav className="sh-tabbar" aria-label="Console">
        {MAIN.map((n) => (
          <Link key={n.href} href={n.href} className={current?.href === n.href ? "on" : ""} onClick={() => setMore(false)}>
            <OpsIcon name={n.icon} /><span>{n.label}</span>
          </Link>
        ))}
        <button type="button" className={SETTINGS.some((n) => n.href === current?.href) || more ? "on" : ""} onClick={() => setMore(!more)} aria-expanded={more}>
          <OpsIcon name="more" /><span>More</span>
        </button>
      </nav>
    </div>
  );
}
