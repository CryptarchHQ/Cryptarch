import { SESSION_STORAGE_KEY, SHARED_PACKAGE_VERSION } from "@cryptarch/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../app/AuthProvider";
import { appRoutes } from "../app/router";

function fakeJwt(claims) {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.sig`;
}

function renderWithRoute(route) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [route] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function mockJsonResponse(status, payload) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload ? JSON.stringify(payload) : ""),
  });
}

function mockByPath(map) {
  fetch.mockImplementation((url, options = {}) => {
    const path = String(url).replace("http://localhost:8000", "");
    const method = String(options.method || "GET").toUpperCase();
    const key = `${method} ${path}`;
    const payload = map[key];
    if (payload === undefined)
      return mockJsonResponse(500, { detail: `Mock no definido: ${key}` });
    return mockJsonResponse(200, payload);
  });
}

describe("@cryptarch/shared", () => {
  it("resuelve el paquete monorepo", () => {
    expect(SHARED_PACKAGE_VERSION).toBe("0.1.0");
  });
});

describe("smoke routes", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  it("redirige admin sin sesión a login y permite login hacia admin", async () => {
    fetch
      .mockImplementationOnce(() =>
        mockJsonResponse(200, {
          access_token: fakeJwt({ tenant_id: "t1", role: "admin" }),
          token_type: "bearer",
        }),
      )
      .mockImplementationOnce(() =>
        mockJsonResponse(200, {
          email: "admin@test",
          tenant_name: "Acme",
          role: "admin",
          sub: "uuid-no-visible",
        }),
      )
      .mockImplementationOnce(() => mockJsonResponse(200, []))
      .mockImplementationOnce(() => mockJsonResponse(200, []))
      .mockImplementationOnce(() => mockJsonResponse(200, []));

    renderWithRoute("/admin/users");
    expect(
      await screen.findByRole("heading", { name: "Acceso" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tenant ID"), {
      target: { value: "t1" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Usuarios" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("uuid-no-visible")).not.toBeInTheDocument();
  });

  it("renderiza chat para usuario autenticado", async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "token-user",
        user: {
          email: "user@test",
          tenant_name: "Acme",
          sub: "user@test",
          tenant_id: "t1",
          role: "user",
        },
      }),
    );
    fetch.mockImplementation((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      const method = String(options.method || "GET").toUpperCase();
      if (method === "GET" && path === "/me/preferences") {
        return mockJsonResponse(200, { theme: "system", metadata: {} });
      }
      if (method === "GET" && path === "/actions") {
        return mockJsonResponse(200, [
          {
            id: "a1",
            name: "Demo",
            method: "GET",
            path: "/v1/demo",
            connector_id: "c1",
            input_schema_json: { type: "object", properties: {} },
            input_schema_version: 1,
            tag_ids: [],
          },
        ]);
      }
      return mockJsonResponse(500, {
        detail: `Mock no definido: ${method} ${path}`,
      });
    });

    renderWithRoute("/chat");
    expect(
      await screen.findByRole("heading", { name: "Asistente" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Preferencias" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("action_id")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cargar schema/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Demo")).toBeInTheDocument();
  });

  it("renderiza workspace de conectores sin pedir connector_id manual", async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "token-admin",
        user: {
          email: "admin@test",
          tenant_name: "Acme",
          sub: "admin@test",
          tenant_id: "t1",
          role: "admin",
        },
      }),
    );
    mockByPath({
      "GET /admin/connectors": [
        {
          id: "c1",
          name: "CRM",
          base_url: "https://crm.api",
          auth_config: {},
        },
      ],
      "GET /admin/actions": [
        {
          id: "a1",
          connector_id: "c1",
          name: "Buscar cliente",
          method: "GET",
          path: "/v1/customers",
        },
      ],
      "GET /admin/tags": [],
    });

    renderWithRoute("/admin/connectors");
    expect(
      await screen.findByRole("heading", { name: "Integraciones" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Connector id")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Nueva integración" }),
    ).toBeInTheDocument();
  });

  it("permite crear tags inline desde users workspace", async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "token-admin",
        user: {
          email: "admin@test",
          tenant_name: "Acme",
          sub: "admin@test",
          tenant_id: "t1",
          role: "admin",
        },
      }),
    );
    fetch.mockImplementation((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      const method = String(options.method || "GET").toUpperCase();
      if (method === "GET" && path === "/admin/users")
        return mockJsonResponse(200, []);
      if (method === "GET" && path === "/admin/tags")
        return mockJsonResponse(200, []);
      if (method === "GET" && path === "/admin/filters")
        return mockJsonResponse(200, []);
      if (method === "POST" && path === "/admin/tags")
        return mockJsonResponse(200, { id: "t-new", name: "vip" });
      return mockJsonResponse(500, { detail: `${method} ${path}` });
    });

    renderWithRoute("/admin/users");
    expect(
      await screen.findByRole("heading", { name: "Usuarios" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getAllByPlaceholderText("Nueva tag")[0], {
      target: { value: "vip" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Crear tag" })[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:8000/admin/tags",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
