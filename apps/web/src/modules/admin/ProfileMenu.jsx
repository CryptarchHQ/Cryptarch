import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { PreferencesPanel } from "../preferences/PreferencesPanel";

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const email = user?.email || "Cuenta";
  const tenantName = user?.tenant_name || "Organización";
  const initial = (user?.email || "C").slice(0, 1).toUpperCase();

  return (
    <details className="profile-menu">
      <summary>
        <span className="profile-avatar">{initial}</span>
        <span>
          <strong>{email}</strong>
          <small>{tenantName}</small>
        </span>
      </summary>
      <div className="profile-popover">
        <PreferencesPanel />
        <button
          type="button"
          className="profile-logout"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
        >
          Cerrar sesion
        </button>
      </div>
    </details>
  );
}
