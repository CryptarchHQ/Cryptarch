import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../app/AuthProvider";
import { FiltersPage } from "./FiltersPage";

const FILTER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TAG_ADMIN_ID = "11111111-2222-3333-4444-555555555555";
const TAG_CRM_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const GROUP_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";

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

function renderFiltersPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <FiltersPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("FiltersPage", () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession();
    global.fetch = vi.fn();
  });

  it("muestra un filtro con tags como «tiene TODAS: Admin, CRM» sin el id del filtro", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/filters") {
        return mockJsonResponse(200, [
          {
            id: FILTER_ID,
            name: "Admins CRM",
            target_type: "user",
            tag_ids: [TAG_ADMIN_ID, TAG_CRM_ID],
          },
        ]);
      }
      if (path === "/admin/tags") {
        return mockJsonResponse(200, [
          { id: TAG_ADMIN_ID, name: "Admin" },
          { id: TAG_CRM_ID, name: "CRM" },
        ]);
      }
      if (path === "/admin/groups") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderFiltersPage();

    expect(await screen.findByText("Admins CRM")).toBeInTheDocument();
    expect(screen.getByText("Usuario")).toBeInTheDocument();
    expect(screen.getByText("tiene TODAS: Admin, CRM")).toBeInTheDocument();
    expect(screen.queryByText(FILTER_ID)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Filtros" }),
    ).toBeInTheDocument();
  });

  it("al borrar un filtro usado por un grupo muestra el nombre del grupo en el diálogo", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
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
      if (path === "/admin/groups") {
        return mockJsonResponse(200, [
          {
            id: GROUP_ID,
            name: "Equipo ventas",
            user_filter_ids: [FILTER_ID],
            action_filter_ids: [],
            document_filter_ids: [],
          },
        ]);
      }
      return mockJsonResponse(500, { detail: path });
    });

    renderFiltersPage();

    expect(await screen.findByText("Filtro admin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(
      await screen.findByRole("heading", { name: "Eliminar filtro" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Equipo ventas/)).toBeInTheDocument();
    expect(screen.queryByText(GROUP_ID)).not.toBeInTheDocument();
  });
});
