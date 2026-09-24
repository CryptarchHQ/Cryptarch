import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, apiRequest, setUnauthorizedHandler } from "../shared/apiClient";
import {
  clearSession,
  readSession,
  writeSession,
} from "../shared/sessionStore";

const AuthContext = createContext(null);

function decodeJwtClaims(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readSession());
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  async function login(credentials) {
    const authPayload = await apiRequest(
      "/auth/login",
      { method: "POST", body: JSON.stringify(credentials) },
      { skipAuth: true },
    );

    const token = authPayload?.access_token;
    if (!token) throw { status: 500, message: "Respuesta de login inválida" };

    const profile = await apiRequest(
      "/me",
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
      { skipAuth: true },
    );

    if (!profile?.sub || !profile?.role) {
      throw {
        status: 500,
        message: "No se pudo resolver el perfil de sesión.",
      };
    }

    const claims = decodeJwtClaims(token);
    const user = {
      ...profile,
      tenant_id: claims?.tenant_id,
    };

    const nextSession = { token, user };
    writeSession(nextSession);
    setSession(nextSession);
    return nextSession;
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // no-op: limpiamos sesión local incluso si backend falla.
    } finally {
      clearSession();
      setSession(null);
    }
  }

  const refreshMe = useCallback(async () => {
    if (!session?.token) return null;
    setIsBootstrapping(true);
    try {
      const profile = await api.get("/me");
      const nextSession = {
        ...session,
        user: {
          ...profile,
          tenant_id: session.user?.tenant_id,
        },
      };
      writeSession(nextSession);
      setSession(nextSession);
      return nextSession.user;
    } finally {
      setIsBootstrapping(false);
    }
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      isAuthenticated: Boolean(session?.token),
      isAdmin: session?.user?.role === "admin",
      user: session?.user ?? null,
      isBootstrapping,
      login,
      logout,
      refreshMe,
    }),
    [session, isBootstrapping, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
