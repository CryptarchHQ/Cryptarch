import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../app/AuthProvider";
import {
  createPermissionsGroup,
  NewPermissionsGroupPage,
} from "./NewPermissionsGroupPage";
import { groupsRoutes } from "./routes";

const TAG_USER_ID = "11111111-2222-3333-4444-555555555555";
const TAG_ACTION_ID = "22222222-3333-4444-5555-666666666666";
const SAMPLE_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const FILTER_USER_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const GROUP_ID = "cccccccc-dddd-eeee-ffff-000000000000";

function mockJsonResponse(status, payload) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload ? JSON.stringify(payload) : ""),
  });
}

function seedSession() {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      token: "token-admin",
      user: {
        email: "admin@test",
        tenant_name: "Acme",
        sub: "user-self",
        tenant_id: "t1",
        role: "admin",
      },
    }),
  );
}

function renderWizard() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/admin/groups/permissions/new"]}>
        <Routes>
          <Route
            path="/admin/groups/permissions/new"
            element={<NewPermissionsGroupPage />}
          />
          <Route path="/admin/groups" element={<div>Lista grupos</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("NewPermissionsGroupPage", () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession();
    global.fetch = vi.fn();
  });

  it("con etiquetas de usuario llama preview y muestra conteo y label, no el id", async () => {
    fetch.mockImplementation((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      const method = (options.method || "GET").toUpperCase();

      if (method === "GET" && path === "/admin/tags") {
        return mockJsonResponse(200, [{ id: TAG_USER_ID, name: "Admin" }]);
      }
      if (method === "POST" && path === "/admin/filters/preview") {
        return mockJsonResponse(200, {
          count: 2,
          sample: [{ id: SAMPLE_USER_ID, label: "Ana Pérez" }],
        });
      }
      return mockJsonResponse(500, { detail: `${method} ${path}` });
    });

    renderWizard();

    expect(
      await screen.findByRole("heading", { name: "Quién entra" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Añadir Admin" }));

    expect(
      await screen.findByText("Coincide con 2 usuarios"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_USER_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(TAG_USER_ID)).not.toBeInTheDocument();

    await waitFor(() => {
      const previewCalls = fetch.mock.calls.filter(([url, options]) => {
        const path = String(url).replace("http://localhost:8000", "");
        const method = (options?.method || "GET").toUpperCase();
        return method === "POST" && path === "/admin/filters/preview";
      });
      expect(previewCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(previewCalls[0][1].body);
      expect(body).toEqual({
        target_type: "user",
        tag_ids: [TAG_USER_ID],
      });
    });
  });

  it("sin etiquetas muestra el mensaje vacío y no llama a preview", async () => {
    fetch.mockImplementation((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      const method = (options.method || "GET").toUpperCase();
      if (method === "GET" && path === "/admin/tags") {
        return mockJsonResponse(200, [{ id: TAG_USER_ID, name: "Admin" }]);
      }
      return mockJsonResponse(500, { detail: `${method} ${path}` });
    });

    renderWizard();

    expect(
      await screen.findByText("Sin etiquetas no se concede nada en este paso"),
    ).toBeInTheDocument();

    const previewCalls = fetch.mock.calls.filter(([url, options]) => {
      const path = String(url).replace("http://localhost:8000", "");
      const method = (options?.method || "GET").toUpperCase();
      return method === "POST" && path === "/admin/filters/preview";
    });
    expect(previewCalls).toHaveLength(0);
  });

  it("al completar crea filtros solo para pasos con tags y luego el grupo", async () => {
    fetch.mockImplementation((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      const method = (options.method || "GET").toUpperCase();

      if (method === "GET" && path === "/admin/tags") {
        return mockJsonResponse(200, [
          { id: TAG_USER_ID, name: "Admin" },
          { id: TAG_ACTION_ID, name: "Export" },
        ]);
      }
      if (method === "POST" && path === "/admin/filters/preview") {
        return mockJsonResponse(200, { count: 1, sample: [] });
      }
      if (method === "POST" && path === "/admin/filters") {
        const body = JSON.parse(options.body || "{}");
        return mockJsonResponse(200, {
          id: FILTER_USER_ID,
          ...body,
        });
      }
      if (method === "POST" && path === "/admin/groups") {
        return mockJsonResponse(200, { id: GROUP_ID, name: "Soporte" });
      }
      return mockJsonResponse(500, { detail: `${method} ${path}` });
    });

    renderWizard();

    await screen.findByRole("heading", { name: "Quién entra" });

    fireEvent.change(screen.getByLabelText("Nombre del grupo"), {
      target: { value: "Soporte" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir Admin" }));

    await screen.findByText(/Coincide con/);

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByRole("heading", { name: "Qué puede hacer" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByRole("heading", { name: "Qué documentos ve" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      const filterPosts = fetch.mock.calls.filter(([url, options]) => {
        const path = String(url).replace("http://localhost:8000", "");
        const method = (options?.method || "GET").toUpperCase();
        return method === "POST" && path === "/admin/filters";
      });
      expect(filterPosts).toHaveLength(1);
      expect(JSON.parse(filterPosts[0][1].body)).toEqual({
        name: "Soporte · usuarios",
        target_type: "user",
        tag_ids: [TAG_USER_ID],
      });

      const groupPosts = fetch.mock.calls.filter(([url, options]) => {
        const path = String(url).replace("http://localhost:8000", "");
        const method = (options?.method || "GET").toUpperCase();
        return method === "POST" && path === "/admin/groups";
      });
      expect(groupPosts).toHaveLength(1);
      expect(JSON.parse(groupPosts[0][1].body)).toEqual({
        name: "Soporte",
        user_filter_ids: [FILTER_USER_ID],
        action_filter_ids: [],
        document_filter_ids: [],
      });
    });

    expect(await screen.findByText("Lista grupos")).toBeInTheDocument();
  });

  it("createPermissionsGroup omite filtros de pasos sin tags", async () => {
    const posts = [];
    const apiClient = {
      post: vi.fn(async (path, body) => {
        posts.push({ path, body });
        if (path === "/admin/filters") {
          return { id: `filter-${body.target_type}` };
        }
        return { id: GROUP_ID };
      }),
    };

    await createPermissionsGroup({
      draft: {
        service: { name: "Ops", userTagIds: [TAG_USER_ID] },
        action: { actionTagIds: [] },
        fields: { documentTagIds: [TAG_ACTION_ID] },
      },
      apiClient,
    });

    expect(posts.map((p) => p.path)).toEqual([
      "/admin/filters",
      "/admin/filters",
      "/admin/groups",
    ]);
    expect(posts[0].body).toEqual({
      name: "Ops · usuarios",
      target_type: "user",
      tag_ids: [TAG_USER_ID],
    });
    expect(posts[1].body).toEqual({
      name: "Ops · documentos",
      target_type: "document",
      tag_ids: [TAG_ACTION_ID],
    });
    expect(posts[2].body).toEqual({
      name: "Ops",
      user_filter_ids: ["filter-user"],
      action_filter_ids: [],
      document_filter_ids: ["filter-document"],
    });
  });
});

describe("groupsRoutes", () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession();
    global.fetch = vi.fn((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/groups") return mockJsonResponse(200, []);
      if (path === "/admin/filters") return mockJsonResponse(200, []);
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });
  });

  it("el element de la ruta groups muestra Asistente de permisos", async () => {
    const groupsElement = groupsRoutes.find(
      (r) => r.path === "groups",
    )?.element;
    expect(groupsElement).toBeTruthy();

    render(
      <AuthProvider>
        <MemoryRouter>{groupsElement}</MemoryRouter>
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("link", { name: "Asistente de permisos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Asistente de permisos" }),
    ).toHaveAttribute("href", "/admin/groups/permissions/new");
  });
});
