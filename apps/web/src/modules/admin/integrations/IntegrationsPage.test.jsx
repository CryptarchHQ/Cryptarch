import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsPage } from "./IntegrationsPage";

const CONNECTOR = {
  id: "c1",
  name: "CRM",
  description: "Clientes",
  base_url: "https://crm.api",
  auth_config: { type: "bearer", token_env: "CRM_TOKEN" },
};

const ACTION = {
  id: "a1",
  connector_id: "c1",
  name: "Buscar cliente",
  method: "GET",
  path: "/v1/customers",
  request_config: { headers: {}, query: {}, body: null },
  input_schema_json: { type: "object", properties: {} },
  input_schema_version: "1",
  tag_ids: [],
};

function mockJsonResponse(status, payload) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload ? JSON.stringify(payload) : ""),
  });
}

function renderPage(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/integrations" element={<IntegrationsPage />} />
        <Route path="/admin/integrations/:id" element={<IntegrationsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("IntegrationsPage", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("sin conectores, se ve «Conecta tu primer servicio»", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/connectors") return mockJsonResponse(200, []);
      if (path === "/admin/actions") return mockJsonResponse(200, []);
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderPage("/admin/integrations");

    expect(
      await screen.findByRole("heading", {
        name: "Conecta tu primer servicio",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Integraciones" }),
    ).toBeInTheDocument();
  });

  it("con un conector y cero acciones, al abrir el detalle se ve el vacío de acciones", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/connectors")
        return mockJsonResponse(200, [CONNECTOR]);
      if (path === "/admin/actions") return mockJsonResponse(200, []);
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderPage("/admin/integrations/c1");

    expect(
      await screen.findByText("Esta integración aún no hace nada"),
    ).toBeInTheDocument();
  });

  it("«Nueva acción» tiene href con connectorId y step=2", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/connectors")
        return mockJsonResponse(200, [CONNECTOR]);
      if (path === "/admin/actions") return mockJsonResponse(200, []);
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderPage("/admin/integrations/c1");

    const link = await screen.findByRole("link", { name: "Nueva acción" });
    expect(link).toHaveAttribute(
      "href",
      "/admin/integrations/new?connectorId=c1&step=2",
    );
  });

  it("DELETE 409 no elimina la fila y muestra el nombre de la acción", async () => {
    fetch.mockImplementation((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      const method = String(options.method || "GET").toUpperCase();
      if (method === "GET" && path === "/admin/connectors") {
        return mockJsonResponse(200, [CONNECTOR]);
      }
      if (method === "GET" && path === "/admin/actions") {
        return mockJsonResponse(200, [ACTION]);
      }
      if (method === "GET" && path === "/admin/tags") {
        return mockJsonResponse(200, []);
      }
      if (method === "DELETE" && path === "/admin/connectors/c1") {
        return mockJsonResponse(409, {
          detail: "Connector has associated actions",
        });
      }
      return mockJsonResponse(500, { detail: `${method} ${path}` });
    });

    renderPage("/admin/integrations/c1");

    expect(await screen.findByText("Buscar cliente")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar integración" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => {
      expect(
        screen.getByText(/tiene acciones asociadas \(Buscar cliente\)/i),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "CRM" })).toBeInTheDocument();
    expect(screen.getByText("Buscar cliente")).toBeInTheDocument();
  });
});
