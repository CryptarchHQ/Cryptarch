import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../app/AuthProvider";
import { appRoutes } from "../app/router";

const SUB_UUID = "00000000-0000-4000-8000-000000000099";
const TENANT_UUID = "00000000-0000-4000-8000-000000000001";

function mockJsonResponse(status, payload) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload ? JSON.stringify(payload) : ""),
  });
}

describe("profile identity", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      const method = String(options.method || "GET").toUpperCase();
      if (method === "GET" && path === "/admin/users")
        return mockJsonResponse(200, []);
      if (method === "GET" && path === "/admin/tags")
        return mockJsonResponse(200, []);
      if (method === "GET" && path === "/admin/filters")
        return mockJsonResponse(200, []);
      if (method === "GET" && path === "/me/preferences") {
        return mockJsonResponse(200, { theme: "system", metadata: {} });
      }
      return mockJsonResponse(500, { detail: `${method} ${path}` });
    });
  });

  it("muestra email y tenant_name, nunca sub ni tenant_id", async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "token-admin",
        user: {
          email: "ana@acme.test",
          tenant_name: "Acme",
          role: "admin",
          sub: SUB_UUID,
          tenant_id: TENANT_UUID,
        },
      }),
    );

    const router = createMemoryRouter(appRoutes, {
      initialEntries: ["/admin/users"],
    });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Usuarios" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("ana@acme.test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Acme").length).toBeGreaterThan(0);
    expect(screen.queryByText(SUB_UUID)).not.toBeInTheDocument();
    expect(screen.queryByText(TENANT_UUID)).not.toBeInTheDocument();
  });
});
