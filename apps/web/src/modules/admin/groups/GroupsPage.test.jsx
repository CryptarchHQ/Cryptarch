import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../app/AuthProvider";
import { GroupsPage } from "./GroupsPage";

const GROUP_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const FILTER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const FILTER_CRM_ID = "cccccccc-dddd-eeee-ffff-111111111111";
const TAG_ADMIN_ID = "11111111-2222-3333-4444-555555555555";
const TAG_CRM_ID = "22222222-3333-4444-5555-666666666666";

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
        "Usuarios: tiene Admin. Acciones: ninguna. Documentos: ninguna.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(GROUP_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(FILTER_ID)).not.toBeInTheDocument();
  });

  it("al editar no hay select multiple; se ve el nombre del filtro y se pueden guardar ids", async () => {
    let patchedBody = null;

    fetch.mockImplementation((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/groups" && (!options.method || options.method === "GET")) {
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
      if (path === `/admin/groups/${GROUP_ID}` && options.method === "PATCH") {
        patchedBody = options.body ? JSON.parse(options.body) : null;
        return mockJsonResponse(200, {
          id: GROUP_ID,
          name: "Admins",
          ...patchedBody,
        });
      }
      if (path === "/admin/filters") {
        return mockJsonResponse(200, [
          {
            id: FILTER_ID,
            name: "Filtro admin",
            target_type: "user",
            tag_ids: [TAG_ADMIN_ID],
          },
          {
            id: FILTER_CRM_ID,
            name: "Filtro CRM",
            target_type: "user",
            tag_ids: [TAG_CRM_ID],
          },
        ]);
      }
      if (path === "/admin/tags") {
        return mockJsonResponse(200, [
          { id: TAG_ADMIN_ID, name: "Admin" },
          { id: TAG_CRM_ID, name: "CRM" },
        ]);
      }
      return mockJsonResponse(500, { detail: path });
    });

    renderGroupsPage();

    expect(await screen.findByText("Admins")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(
      await screen.findByRole("heading", { name: "Editar grupo" }),
    ).toBeInTheDocument();
    expect(document.querySelector("select[multiple]")).toBeNull();
    expect(
      screen.getByRole("checkbox", {
        name: "Filtro admin · tiene Admin",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Filtro CRM · tiene CRM",
      }),
    ).not.toBeChecked();
    expect(screen.queryByText(FILTER_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(FILTER_CRM_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(GROUP_ID)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Filtro CRM · tiene CRM" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(patchedBody).toEqual({
        name: "Admins",
        user_filter_ids: [FILTER_ID, FILTER_CRM_ID],
        action_filter_ids: [],
        document_filter_ids: [],
      });
    });
  });

  it("muestra estado vacío cuando no hay filtros de un tipo", async () => {
    mockEmptyLists();
    renderGroupsPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Nuevo grupo" }),
    );

    expect(
      await screen.findByText(
        "No hay filtros de usuarios. Créalos en Filtros.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No hay filtros de acciones. Créalos en Filtros."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No hay filtros de documentos. Créalos en Filtros."),
    ).toBeInTheDocument();
  });
});
