import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectionTestStep } from "./ConnectionTestStep";
import { wizardStepsFor } from "./NewIntegrationPage";

const SECRET_VALUE = "super-secret-value";

const OAUTH_AUTH = {
  type: "oauth2",
  client_id: "my-client",
  client_secret_env: "OAUTH_CLIENT_SECRET",
  token_url: "https://auth.example.com/token",
  scope: "read write",
  // El secreto de ejemplo no debe aparecer en la UI aunque esté en el draft
  client_secret: SECRET_VALUE,
};

describe("wizardStepsFor", () => {
  it("null y bearer tienen 3 pasos", () => {
    expect(wizardStepsFor(null)).toHaveLength(3);
    expect(wizardStepsFor({ type: "bearer", token_env: "T" })).toHaveLength(3);
    expect(wizardStepsFor(null).map((s) => s.id)).toEqual([
      "service",
      "action",
      "fields",
    ]);
  });

  it("oauth2 tiene 5 pasos con Revisar acceso y Probar conexión", () => {
    const steps = wizardStepsFor({ type: "oauth2" });
    expect(steps).toHaveLength(5);
    expect(steps[3]).toEqual({ id: "oauth-review", label: "Revisar acceso" });
    expect(steps[4]).toEqual({
      id: "connection-test",
      label: "Probar conexión",
    });
  });
});

describe("ConnectionTestStep", () => {
  it("llama POST …/test y muestra detail sin filtrar secretos ni JSON de auth", async () => {
    const apiClient = {
      post: vi.fn(async (path) => {
        if (path === "/admin/connectors/conn-existing/test") {
          return { ok: true, detail: "Token obtenido correctamente" };
        }
        throw new Error(`unexpected ${path}`);
      }),
    };
    const onTestResult = vi.fn();

    function Harness() {
      const [service, setService] = useState({
        name: "CRM",
        base_url: "https://api.example.com",
        description: "",
        auth_config: OAUTH_AUTH,
        connectionTest: null,
      });
      return (
        <ConnectionTestStep
          service={service}
          connectorId="conn-existing"
          onTestResult={(connectionTest) => {
            onTestResult(connectionTest);
            setService((prev) => ({ ...prev, connectionTest }));
          }}
          apiClient={apiClient}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Probar conexión" }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/admin/connectors/conn-existing/test",
      );
    });

    expect(await screen.findByText("Conexión correcta")).toBeInTheDocument();
    expect(
      screen.getByText("Token obtenido correctamente"),
    ).toBeInTheDocument();

    const text = document.body.textContent || "";
    expect(text).not.toContain(SECRET_VALUE);
    expect(text).not.toContain(JSON.stringify(OAUTH_AUTH));
    expect(text).not.toContain('"type":"oauth2"');
  });

  it("sin connectorId crea el conector una sola vez y luego prueba", async () => {
    const posts = [];
    const apiClient = {
      post: vi.fn(async (path, body) => {
        posts.push({ path, body });
        if (path === "/admin/connectors") {
          return { id: "conn-created" };
        }
        if (path === "/admin/connectors/conn-created/test") {
          return { ok: false, detail: "Credenciales inválidas" };
        }
        throw new Error(`unexpected ${path}`);
      }),
    };

    let createdId = null;

    function Harness() {
      const [service, setService] = useState({
        name: "CRM",
        base_url: "https://api.example.com",
        description: "Desc",
        auth_config: OAUTH_AUTH,
        connectionTest: null,
      });
      const [connectorId, setConnectorId] = useState(null);
      return (
        <ConnectionTestStep
          service={service}
          connectorId={connectorId}
          onConnectorCreated={(id) => {
            createdId = id;
            setConnectorId(id);
          }}
          onTestResult={(connectionTest) =>
            setService((prev) => ({ ...prev, connectionTest }))
          }
          apiClient={apiClient}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Probar conexión" }));

    await waitFor(() => {
      expect(screen.getByText("No se pudo conectar")).toBeInTheDocument();
    });

    expect(posts.filter((p) => p.path === "/admin/connectors")).toHaveLength(1);
    expect(posts[0].body).toEqual({
      name: "CRM",
      base_url: "https://api.example.com",
      description: "Desc",
      auth_config: OAUTH_AUTH,
    });
    expect(posts.some((p) => p.path.endsWith("/test"))).toBe(true);
    expect(createdId).toBe("conn-created");

    fireEvent.click(screen.getByRole("button", { name: "Probar conexión" }));

    await waitFor(() => {
      expect(posts.filter((p) => p.path === "/admin/connectors")).toHaveLength(
        1,
      );
    });

    const testCalls = posts.filter((p) => String(p.path).includes("/test"));
    expect(testCalls.length).toBeGreaterThanOrEqual(2);
  });
});
