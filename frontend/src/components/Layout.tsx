import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PERM } from "../auth/permissions";

interface NavEntry { to: string; label: string; icon: string; perm?: string; roles?: string[]; }
interface NavSection { label: string; items: NavEntry[]; }

const sections: NavSection[] = [
  { label: "Overview", items: [{ to: "/", label: "Dashboard", icon: "▦" }] },
  {
    label: "Certificate Management",
    items: [
      { to: "/register", label: "Register Certificate", icon: "✎", perm: PERM.CERT_REGISTER },
      { to: "/registry", label: "Certificate Registry", icon: "☰", perm: PERM.CERT_VIEW },
      { to: "/verify", label: "Verify Certificate", icon: "✓", perm: PERM.CERT_VERIFY },
      { to: "/my-certificates", label: "My Certificates", icon: "◆", perm: PERM.CERT_VIEW_OWN },
      { to: "/issuers", label: "Issuers", icon: "⬡", perm: PERM.CERT_VIEW },
    ],
  },
  {
    label: "Cryptography Labs",
    items: [
      { to: "/lab/hash", label: "SHA-256 Hashing", icon: "#", perm: PERM.PRIVACY_USE },
      { to: "/lab/signature", label: "Digital Signatures", icon: "⚿", perm: PERM.PRIVACY_USE },
    ],
  },
  {
    label: "Privacy & Information Protection",
    items: [
      { to: "/privacy/encryption", label: "Encryption Lab", icon: "⌁", perm: PERM.PRIVACY_USE },
      { to: "/privacy/pii", label: "PII Detection", icon: "◎", perm: PERM.PRIVACY_USE },
      { to: "/privacy/masking", label: "Data Masking", icon: "▧", perm: PERM.PRIVACY_USE },
      { to: "/privacy/pseudonymization", label: "Pseudonymization", icon: "⇄", perm: PERM.PRIVACY_USE },
      { to: "/privacy/minimization", label: "Data Minimization", icon: "⊟", perm: PERM.PRIVACY_USE },
      { to: "/privacy/visual-cryptography", label: "Visual Cryptography", icon: "◫", perm: PERM.PRIVACY_USE },
      { to: "/privacy/steganography", label: "Steganography", icon: "⬚", perm: PERM.PRIVACY_USE },
    ],
  },
  {
    label: "Identity & Access",
    items: [
      { to: "/users", label: "User Management", icon: "⚇", perm: PERM.USER_VIEW },
      { to: "/roles", label: "Roles & Permissions", icon: "⚐", perm: PERM.USER_VIEW },
      { to: "/account", label: "Account Security", icon: "⛉" },
    ],
  },
  {
    label: "Security Operations",
    items: [
      { to: "/security", label: "Security Overview", icon: "◈", perm: PERM.SECURITY_VIEW },
      { to: "/security/events", label: "Security Events", icon: "≋", perm: PERM.SECURITY_VIEW },
      { to: "/security/risk", label: "Risk Monitoring", icon: "⚠", perm: PERM.SECURITY_VIEW },
      { to: "/security/incidents", label: "Incidents", icon: "⛨", perm: PERM.INCIDENT_VIEW },
      { to: "/security/simulations", label: "Security Simulations", icon: "⟳", perm: PERM.SECURITY_CONFIGURE },
    ],
  },
  {
    label: "Audit & Compliance",
    items: [
      { to: "/audit", label: "Audit Logs", icon: "❒", perm: PERM.AUDIT_VIEW },
      { to: "/audit/integrity", label: "Audit Integrity", icon: "⛓", perm: PERM.AUDIT_VIEW },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/platform-health", label: "Platform Health", icon: "♥", perm: PERM.SECURITY_VIEW },
      { to: "/settings", label: "Settings", icon: "⚙" },
      { to: "/profile", label: "Profile", icon: "☺" },
    ],
  },
];

function BrandMark() {
  return (
    <span className="brand-mark">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.4-3 8.2-7 9-4-0.8-7-4.6-7-9V6l7-3z" />
        <path d="M8.5 12l2.5 2.5 4.5-4.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const ROLE_LABEL: Record<string, string> = {
  institution_issuer: "Institution Issuer",
  company_verifier: "Company Verifier",
  student: "Student",
  security_administrator: "Security Administrator",
};

function titleFromPath(path: string): string {
  const map: Record<string, string> = {
    "": "Dashboard", register: "Register Certificate", registry: "Certificate Registry",
    verify: "Verify Certificate", issuers: "Issuers", "my-certificates": "My Certificates",
    privacy: "Privacy & Information Protection", users: "User Management", roles: "Roles & Permissions",
    account: "Account Security", security: "Security Operations", audit: "Audit & Compliance",
    "platform-health": "Platform Health", settings: "Settings", profile: "Profile", certificates: "Certificate Details",
  };
  const seg = path.split("/").filter(Boolean)[0] ?? "";
  return map[seg] ?? "CertiGuard";
}

export function Layout() {
  const { user, permissions, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const can = (perm?: string) => !perm || permissions.includes(perm);
  const crumbs = location.pathname.split("/").filter(Boolean);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const initials = (user?.displayName ?? "U").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <div className="aurora" />
      <aside className="sidebar" style={{ transform: sidebarOpen ? "translateX(0)" : undefined }}>
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Certi<span>Guard</span></span>
        </div>
        {sections.map((section) => {
          const visible = section.items.filter((i) => can(i.perm));
          if (!visible.length) return null;
          return (
            <div className="nav-group" key={section.label}>
              <div className="nav-group-label">{section.label}</div>
              {visible.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <span className="ico">{item.icon}</span>{item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div className="sidebar-footer">
          Privacy-Preserving Digital Certificate Verification &amp; Tamper Detection
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="btn btn-ghost btn-sm menu-toggle" onClick={() => setSidebarOpen((v) => !v)}>☰</button>
          <nav className="breadcrumbs">
            <Link to="/">{titleFromPath("")}</Link>
            {crumbs.map((c, i) => (
              <span key={i} className="flex" style={{ gap: 8 }}>
                <span className="sep">/</span>
                <span className={i === crumbs.length - 1 ? "crumb-current" : ""}>{c}</span>
              </span>
            ))}
          </nav>
          <div className="topbar-right">
            <div style={{ position: "relative" }}>
              <div className="user-chip" onClick={() => setMenuOpen((v) => !v)}>
                <span className="avatar">{initials}</span>
                <div>
                  <div className="u-name">{user?.displayName}</div>
                  <div className="u-role">{ROLE_LABEL[user?.role ?? ""] ?? user?.role}</div>
                </div>
              </div>
              {menuOpen && (
                <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
                  <Link to="/profile" onClick={() => setMenuOpen(false)}>Profile</Link>
                  <Link to="/account" onClick={() => setMenuOpen(false)}>Account Security</Link>
                  <div className="menu-sep" />
                  <button onClick={handleSignOut}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
