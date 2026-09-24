import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../app/AuthProvider";
import { ChatPage } from "./ChatPage";

function mockJsonResponse(status, payload) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload ? JSON.stringify(payload) : ""),
  });
}

function seedSession(role = "user") {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      token: role === "admin" ? "token-admin" : "token-user",
      user: {
        email: role === "admin" ? "admin@test" : "user@test",
        tenant_name: "Acme",
        sub: role === "admin" ? "admin@test" : "user@test",
        tenant_id: "t1",
        role,
      },
    }),
  );
}

function mockEmptyActionsFetch() {
  fetch.mockImplementation((url) => {
    const path = String(url).replace("http://localhost:8000", "");
    if (path === "/me/preferences") {
      return mockJsonResponse(200, { theme: "system", metadata: {} });
    }
    if (path === "/actions") return mockJsonResponse(200, []);
    return mockJsonResponse(500, { detail: path });
  });
}

function renderChatPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("ChatPage", () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lista vacía (usuario) muestra Habla con tu administrador", async () => {
    mockEmptyActionsFetch();
    renderChatPage();

    expect(
      await screen.findByText(
        "Tu espacio aún no tiene acciones disponibles. Habla con tu administrador.",
      ),
    ).toBeInTheDocument();
  });

  it("lista vacía (admin) explica grupos y no pide hablar con el administrador", async () => {
    seedSession("admin");
    mockEmptyActionsFetch();
    renderChatPage();

    expect(
      await screen.findByText(
        "Tu espacio aún no tiene acciones disponibles. Tu usuario no coincide con ningún grupo; puedes revisarlo en Etiquetas y Grupos.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Habla con tu administrador.", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("una acción Demo se ve como tarjeta y al pulsarla aparece el formulario", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/me/preferences") {
        return mockJsonResponse(200, { theme: "system", metadata: {} });
      }
      if (path === "/actions") {
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
      return mockJsonResponse(500, { detail: path });
    });

    renderChatPage();

    const card = await screen.findByRole("button", { name: /Demo/i });
    expect(card).toBeInTheDocument();
    expect(screen.queryByText("a1")).not.toBeInTheDocument();

    fireEvent.click(card);

    expect(
      await screen.findByRole("button", { name: "Ejecutar" }),
    ).toBeInTheDocument();
  });

  it("tras 8s sin respuesta de /actions muestra aviso de demora", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/me/preferences") {
        return mockJsonResponse(200, { theme: "system", metadata: {} });
      }
      if (path === "/actions") {
        return new Promise(() => {});
      }
      return mockJsonResponse(500, { detail: path });
    });

    renderChatPage();

    expect(
      screen.queryByText("Esto está tardando más de lo normal"),
    ).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    expect(
      screen.getByText("Esto está tardando más de lo normal"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
  });
});
