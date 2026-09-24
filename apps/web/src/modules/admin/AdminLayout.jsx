import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { ProfileMenu } from "./ProfileMenu";

const NAV_GROUPS = [
  {
    id: "workspace",
    label: "Trabajo",
    items: [
      { path: "users", label: "Usuarios", icon: "👥" },
      { path: "integrations", label: "Integraciones", icon: "🔌" },
      { path: "documents", label: "Documentos", icon: "📚" },
    ],
  },
  {
    id: "config",
    label: "Config",
    items: [
      { path: "tags", label: "Tags", icon: "🏷️" },
      { path: "filters", label: "Filtros", icon: "🔍" },
      { path: "groups", label: "Grupos", icon: "👤" },
    ],
  },
];

export function AdminLayout() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const tenantLabel = user?.tenant_name || "Organización";

  return (
    <div
      className={`app-shell admin-shell admin-shell-compact${collapsed ? " sidebar-collapsed" : ""}`}
    >
      <aside className="sidebar sidebar-compact sidebar-hierarchical sidebar-minimal">
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? "▶" : "◀"}
          </button>
          <div className="sidebar-brand">
            <h2>Cryptarch</h2>
            <small className="muted">{tenantLabel}</small>
          </div>
        </div>
        {NAV_GROUPS.map((group) => (
          <nav key={group.id} className="nav-section nav-hierarchical">
            <span className="nav-section-label">{group.label}</span>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={`/admin/${item.path}`}
                className={({ isActive }) =>
                  `nav-link nav-link-compact${isActive ? " active" : ""}`
                }
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        ))}
        <nav className="nav-section nav-section-bottom">
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              `nav-link nav-link-compact nav-link-chat${isActive ? " active" : ""}`
            }
          >
            <span className="nav-icon">💬</span>
            <span className="nav-text">Chat</span>
          </NavLink>
        </nav>
      </aside>
      <main className="content content-compact">
        <header className="admin-topbar admin-topbar-compact">
          <div className="topbar-title">
            <strong>Admin</strong>
            <small className="muted">{tenantLabel}</small>
          </div>
          <ProfileMenu />
        </header>
        <Outlet />
      </main>
    </div>
  );
}
