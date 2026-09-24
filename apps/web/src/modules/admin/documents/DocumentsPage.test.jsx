import { SESSION_STORAGE_KEY } from "@cryptarch/shared";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../app/AuthProvider";
import { DocumentsPage } from "./DocumentsPage";

const DOC_ID = "doc-uuid-abc-123";

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

function renderDocumentsPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("DocumentsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession();
    global.fetch = vi.fn();
  });

  it("muestra el basename y Listo, no el id del documento indexed", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/documents") {
        return mockJsonResponse(200, [
          {
            id: DOC_ID,
            tenant_id: "t1",
            status: "indexed",
            file_path: "/storage/tenant/informe.pdf",
            tag_ids: [],
          },
        ]);
      }
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderDocumentsPage();

    expect(await screen.findByText("informe.pdf")).toBeInTheDocument();
    const row = screen.getByText("informe.pdf").closest("tr");
    expect(row).toBeTruthy();
    expect(within(row).getByText("Listo")).toBeInTheDocument();
    expect(screen.queryByText(DOC_ID)).not.toBeInTheDocument();
  });

  it("status error muestra Error y Reintentar al expandir", async () => {
    fetch.mockImplementation((url) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/documents") {
        return mockJsonResponse(200, [
          {
            id: DOC_ID,
            tenant_id: "t1",
            status: "error",
            file_path: "/storage/tenant/roto.csv",
            tag_ids: [],
          },
        ]);
      }
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      return mockJsonResponse(500, { detail: path });
    });

    renderDocumentsPage();

    const fileButton = await screen.findByRole("button", { name: "roto.csv" });
    const row = fileButton.closest("tr");
    expect(row).toBeTruthy();
    expect(within(row).getByText("Error")).toBeInTheDocument();

    fireEvent.click(fileButton);
    expect(
      await screen.findByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("El worker no ha dejado un motivo"),
    ).toBeInTheDocument();
  });

  it("confirmar subida llama upload con FormData, no POST JSON /admin/documents", async () => {
    fetch.mockImplementation((url, options = {}) => {
      const path = String(url).replace("http://localhost:8000", "");
      if (path === "/admin/documents") {
        return mockJsonResponse(200, []);
      }
      if (path === "/admin/tags") return mockJsonResponse(200, []);
      if (path === "/admin/documents/upload" && options.method === "POST") {
        return mockJsonResponse(201, {
          id: DOC_ID,
          tenant_id: "t1",
          status: "queued",
          file_path: "/storage/tenant/nuevo.pdf",
          tag_ids: [],
        });
      }
      return mockJsonResponse(500, { detail: path });
    });

    renderDocumentsPage();

    expect(
      await screen.findByRole("heading", { name: "Documentos" }),
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole("button", { name: "Añadir documento" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Elegir fichero" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Añadir documento" }));

    const fileInputs = screen.getAllByLabelText("Seleccionar fichero");
    expect(fileInputs).toHaveLength(1);
    const file = new File(["contenido"], "nuevo.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInputs[0], { target: { files: [file] } });

    expect(await screen.findByDisplayValue("nuevo.pdf")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Elegir fichero" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Atrás" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      const uploadCall = fetch.mock.calls.find((call) =>
        String(call[0]).includes("/admin/documents/upload"),
      );
      expect(uploadCall).toBeTruthy();
      expect(uploadCall[1]?.body).toBeInstanceOf(FormData);
      expect(uploadCall[1]?.body.get("file")).toBeTruthy();
    });

    const jsonCreateCalls = fetch.mock.calls.filter((call) => {
      const path = String(call[0]).replace("http://localhost:8000", "");
      const body = call[1]?.body;
      return (
        path === "/admin/documents" &&
        call[1]?.method === "POST" &&
        typeof body === "string"
      );
    });
    expect(jsonCreateCalls).toHaveLength(0);

    expect(await screen.findByText("Documento en cola")).toBeInTheDocument();
  });
});
