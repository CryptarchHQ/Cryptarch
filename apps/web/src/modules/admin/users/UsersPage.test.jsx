import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../app/AuthProvider";
import { UsersPage } from "./UsersPage";

const SELF_ID = "user-self";
const OTHER_ID = "user-other";

function mockJsonResponse(status, payload) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload ? JSON.stringify(payload) : ""),
  });
}

function seedSession(sub = SELF_ID) {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      token: "token-admin",
      user: {
        email: "admin@test",
        tenant_name: "Acme",
        sub,
        tenant_id: "t1",
        role: "admin",
      },
    }),
  );
}

function renderUsersPage(props = {}) {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <UsersPage {...props} />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("UsersPage", () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession();
    global.fetch = vi.fn();
  });

  it("lista un usuario por email sin mostrar su id", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/users") {
        return mockJsonResponse(200, [
          {
            id: OTHER_ID,
            email: "ana@acme.test",
            role: "user",
            tag_ids: [],
          },
        ]);
      }
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderUsersPage();

    expect(await screen.findByText("ana@acme.test")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Usuarios" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(OTHER_ID)).not.toBeInTheDocument();
  });

  it("filtro que no coincide muestra «Nadie coincide con estos criterios»", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/users") {
        return mockJsonResponse(200, [
          {
            id: OTHER_ID,
            email: "ana@acme.test",
            role: "user",
            tag_ids: [],
          },
        ]);
      }
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderUsersPage();

    expect(await screen.findByText("ana@acme.test")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar por email" }),
      { target: { value: "nadie@existe.test" } },
    );

    expect(
      await screen.findByText("Nadie coincide con estos criterios"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Limpiar filtros" }),
    ).toBeInTheDocument();
  });

  it("el usuario cuyo id es el sub de la sesión no tiene botón Eliminar", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/users") {
        return mockJsonResponse(200, [
          {
            id: SELF_ID,
            email: "yo@acme.test",
            role: "admin",
            tag_ids: [],
          },
          {
            id: OTHER_ID,
            email: "otro@acme.test",
            role: "user",
            tag_ids: [],
          },
        ]);
      }
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderUsersPage({ currentUserId: SELF_ID });

    expect(await screen.findByText("yo@acme.test")).toBeInTheDocument();
    expect(screen.getByText("otro@acme.test")).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", { name: "Eliminar" });
    expect(deleteButtons).toHaveLength(1);

    const selfRow = screen.getByText("yo@acme.test").closest("tr");
    expect(selfRow).toBeTruthy();
    expect(selfRow.textContent).not.toMatch(/Eliminar/);
  });

  it("muestra chips de etiquetas y no el botón Guardar como filtro", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/users") {
        return mockJsonResponse(200, [
          {
            id: OTHER_ID,
            email: "ana@acme.test",
            role: "user",
            tag_ids: ["tag-vip"],
          },
        ]);
      }
      if (path === "/admin/tags") {
        return mockJsonResponse(200, [{ id: "tag-vip", name: "VIP" }]);
      }
      return mockJsonResponse(500, { detail: path });
    });

    renderUsersPage();

    expect(await screen.findByText("ana@acme.test")).toBeInTheDocument();

    const tagChip = screen.getByRole("button", { name: "VIP" });
    expect(tagChip).toBeInTheDocument();
    expect(tagChip).toHaveAttribute("aria-pressed", "false");

    expect(
      screen.queryByRole("button", { name: "Guardar como filtro" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Nombre del filtro"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Filtros guardados" }),
    ).not.toBeInTheDocument();
  });
});
