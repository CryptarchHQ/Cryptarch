import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../app/AuthProvider";
import { GroupsPage } from "./GroupsPage";

const GROUP_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const FILTER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TAG_ADMIN_ID = "11111111-2222-3333-4444-555555555555";

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

function mockEmptyLists() {
  fetch.mockImplementation((url) => {
    const path = String(url).replace("http://localhost:8000", "");
    if (path === "/admin/groups") return mockJsonResponse(200, []);
    if (path === "/admin/filters") return mockJsonResponse(200, []);
    if (path === "/admin/tags") return mockJsonResponse(200, []);
    return mockJsonResponse(500, { detail: path });
  });
}

function renderGroupsPage(props = {}) {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <GroupsPage {...props} />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("GroupsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession();
    global.fetch = vi.fn();
  });

  it("sin headerActions no renderiza un botón de wizard", async () => {
    mockEmptyLists();
    renderGroupsPage();

    expect(
      await screen.findByRole("heading", { name: "Grupos" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Permisos" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/wizard/i)).not.toBeInTheDocument();
  });

  it("con headerActions muestra el botón pasado (hueco para issue #48)", async () => {
    mockEmptyLists();
    renderGroupsPage({
      headerActions: <button type="button">Permisos</button>,
    });

    expect(
      await screen.findByRole("button", { name: "Permisos" }),
    ).toBeInTheDocument();
  });

  it("lista un grupo con resumen en lenguaje llano sin ids", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/groups") {
        return mockJsonResponse(200, [
          {
            id: GROUP_ID,
            name: "Admins",
            user_filter_ids: [FILTER_ID],
            action_filter_ids: [],
            document_filter_ids: [],
          },
        ]);
      }
      if (path === "/admin/filters") {
        return mockJsonResponse(200, [
          {
            id: FILTER_ID,
            name: "Filtro admin",
            target_type: "user",
            tag_ids: [TAG_ADMIN_ID],
          },
        ]);
      }
      if (path === "/admin/tags") {
        return mockJsonResponse(200, [{ id: TAG_ADMIN_ID, name: "Admin" }]);
      }
      return mockJsonResponse(500, { detail: path });
    });

    renderGroupsPage();

    expect(await screen.findByText("Admins")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Usuarios: tiene TODAS: Admin. Acciones: ninguna. Documentos: ninguna.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(GROUP_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(FILTER_ID)).not.toBeInTheDocument();
  });
});
