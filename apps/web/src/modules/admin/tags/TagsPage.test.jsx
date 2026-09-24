import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../app/AuthProvider";
import { TagsPage } from "./TagsPage";

const TAG_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

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

function renderTagsPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <TagsPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("TagsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession();
    global.fetch = vi.fn();
  });

  it("lista un tag por nombre sin mostrar el id", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/tags") {
        return mockJsonResponse(200, [{ id: TAG_ID, name: "Admin" }]);
      }
      return mockJsonResponse(500, { detail: path });
    });

    renderTagsPage();

    expect(await screen.findByText("Admin")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Etiquetas" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(TAG_ID)).not.toBeInTheDocument();
    expect(screen.queryByText("Name")).not.toBeInTheDocument();
    expect(screen.queryByText("Listado")).not.toBeInTheDocument();
  });

  it("abre «Nueva etiqueta» sin mostrar «Name» ni «Listado»", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderTagsPage();

    expect(
      await screen.findByRole("button", { name: "Nueva etiqueta" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nueva etiqueta" }));

    expect(
      await screen.findByRole("heading", { name: "Nueva etiqueta" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.queryByText("Name")).not.toBeInTheDocument();
    expect(screen.queryByText("Listado")).not.toBeInTheDocument();
  });
});
