import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionStep, toRequestConfig } from "./ActionStep";

const BODY_ROWS = [
  { key: "name", value: "{{name}}" },
  { key: "", value: "ignored" },
];

function baseDraft(actionOverrides = {}) {
  return {
    service: { base_url: "https://api.example.com" },
    action: {
      name: "Crear cliente",
      method: "POST",
      path: "/v1/customers",
      useConnectorAuth: true,
      contentType: "application/json",
      timeout: "",
      headers: [{ key: "X-Trace", value: "1" }],
      query: [{ key: "limit", value: "10" }],
      body: BODY_ROWS,
      advancedOpen: false,
      ...actionOverrides,
    },
    fields: {},
  };
}

function StatefulStep({ initialDraft = baseDraft(), onDraftChange }) {
  const [draft, setDraft] = useState(initialDraft);
  return (
    <ActionStep
      draft={draft}
      onDraftChange={(next) => {
        setDraft(next);
        onDraftChange?.(next);
      }}
    />
  );
}

describe("toRequestConfig", () => {
  it("POST emite claves canónicas headers/query/body y no query_params/body_params", () => {
    const config = toRequestConfig(baseDraft().action);

    expect(config).toEqual({
      headers: { "X-Trace": "1" },
      query: { limit: "10" },
      body: { name: "{{name}}" },
      auth: { mode: "connector" },
      content_type: "application/json",
    });
    expect(config).not.toHaveProperty("query_params");
    expect(config).not.toHaveProperty("body_params");
  });

  it("GET no incluye body ni content_type", () => {
    const config = toRequestConfig(
      baseDraft({ method: "GET", body: BODY_ROWS }).action,
    );
    expect(config).not.toHaveProperty("body");
    expect(config).not.toHaveProperty("content_type");
    expect(config.query).toEqual({ limit: "10" });
  });

  it("auth off → mode none", () => {
    const config = toRequestConfig(
      baseDraft({ useConnectorAuth: false }).action,
    );
    expect(config.auth.mode).toBe("none");
  });

  it("timeout 0 no entra; timeout 5 sí", () => {
    expect(
      toRequestConfig(baseDraft({ timeout: "0" }).action),
    ).not.toHaveProperty("timeout");
    expect(toRequestConfig(baseDraft({ timeout: "5" }).action).timeout).toBe(5);
  });
});

describe("ActionStep", () => {
  it("GET oculta el editor de cuerpo pero conserva body en el draft", () => {
    const onDraftChange = vi.fn();
    render(
      <StatefulStep
        initialDraft={baseDraft({
          method: "POST",
          body: BODY_ROWS,
          advancedOpen: true,
        })}
        onDraftChange={onDraftChange}
      />,
    );

    expect(screen.getByText("Body")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Método"), {
      target: { value: "GET" },
    });

    expect(screen.queryByText("Body")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Content-Type")).not.toBeInTheDocument();

    const last = onDraftChange.mock.calls.at(-1)[0];
    expect(last.action.method).toBe("GET");
    expect(last.action.body).toEqual(BODY_ROWS);
    expect(last.action.contentType).toBe("application/json");
    expect(toRequestConfig(last.action)).not.toHaveProperty("body");
  });

  it("path sin barra se ve normalizado en la preview unido a la base", () => {
    render(<StatefulStep initialDraft={baseDraft({ path: "v1/customers" })} />);

    expect(
      screen.getByText("https://api.example.com/v1/customers"),
    ).toBeInTheDocument();
  });

  it("toggle auth off → toRequestConfig.auth.mode === none", () => {
    const onDraftChange = vi.fn();
    render(<StatefulStep onDraftChange={onDraftChange} />);

    fireEvent.click(
      screen.getByLabelText("Usar la autenticación del servicio"),
    );

    const last = onDraftChange.mock.calls.at(-1)[0];
    expect(toRequestConfig(last.action).auth.mode).toBe("none");
    expect(screen.getByText("Auth: ninguna")).toBeInTheDocument();
  });

  it("timeout 0 muestra error y no entra en el payload; 5 sí", () => {
    const onDraftChange = vi.fn();
    render(
      <StatefulStep
        initialDraft={baseDraft({ advancedOpen: true })}
        onDraftChange={onDraftChange}
      />,
    );

    const timeoutInput = screen.getByLabelText("Timeout (segundos)");
    fireEvent.change(timeoutInput, { target: { value: "0" } });

    expect(
      screen.getByText("El tiempo de espera es de al menos 1 segundo"),
    ).toBeInTheDocument();
    let last = onDraftChange.mock.calls.at(-1)[0];
    expect(toRequestConfig(last.action)).not.toHaveProperty("timeout");

    fireEvent.change(timeoutInput, { target: { value: "5" } });
    expect(
      screen.queryByText("El tiempo de espera es de al menos 1 segundo"),
    ).not.toBeInTheDocument();
    last = onDraftChange.mock.calls.at(-1)[0];
    expect(toRequestConfig(last.action).timeout).toBe(5);
  });

  it("advancedOpen pasa a true al abrir el details", () => {
    const onDraftChange = vi.fn();
    render(<StatefulStep onDraftChange={onDraftChange} />);

    const details = screen.getByText("Opciones avanzadas").closest("details");
    expect(details).toBeTruthy();
    details.open = true;
    fireEvent(details, new Event("toggle", { bubbles: true }));

    const last = onDraftChange.mock.calls.at(-1)[0];
    expect(last.action.advancedOpen).toBe(true);
  });
});
