import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntegrationServiceForm } from "./IntegrationServiceForm";

const EMPTY_VALUE = {
  name: "",
  description: "",
  base_url: "",
  auth_config: null,
};

function StatefulForm({ initialValue = EMPTY_VALUE, onChange, errors }) {
  const [value, setValue] = useState(initialValue);
  return (
    <IntegrationServiceForm
      value={value}
      errors={errors}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function lastAuth(onChange) {
  const calls = onChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0].auth_config;
}

describe("IntegrationServiceForm", () => {
  it("elegir Token y escribir token_env emite bearer", () => {
    const onChange = vi.fn();
    render(
      <StatefulForm
        initialValue={{
          name: "CRM",
          description: "",
          base_url: "https://api.example.com",
          auth_config: null,
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    fireEvent.change(screen.getByLabelText("Variable de entorno del token"), {
      target: { value: "CRM_TOKEN" },
    });

    expect(lastAuth(onChange)).toEqual({
      type: "bearer",
      token_env: "CRM_TOKEN",
    });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.name).toBe("CRM");
    expect(last.base_url).toBe("https://api.example.com");
  });

  it("API key sin tocar la cabecera incluye X-API-Key", () => {
    const onChange = vi.fn();
    render(<StatefulForm onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "API key" }));
    fireEvent.change(screen.getByLabelText("Variable de entorno de la clave"), {
      target: { value: "MY_KEY" },
    });

    expect(lastAuth(onChange)).toEqual({
      type: "api_key",
      header_name: "X-API-Key",
      key_env: "MY_KEY",
    });
  });

  it("Sin autenticación deja auth_config null", () => {
    const onChange = vi.fn();
    render(
      <StatefulForm
        initialValue={{
          ...EMPTY_VALUE,
          auth_config: { type: "bearer", token_env: "X" },
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sin autenticación" }));
    expect(lastAuth(onChange)).toBeNull();
  });

  it("OAuth2 emite client_id, client_secret_env, token_url y scope", () => {
    const onChange = vi.fn();
    render(<StatefulForm onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "OAuth2" }));
    fireEvent.change(screen.getByLabelText("Client ID"), {
      target: { value: "cid" },
    });
    fireEvent.change(
      screen.getByLabelText("Variable de entorno del client secret"),
      { target: { value: "SECRET_ENV" } },
    );
    fireEvent.change(screen.getByLabelText("Token URL"), {
      target: { value: "https://auth.example.com/token" },
    });
    fireEvent.change(screen.getByLabelText("Scope"), {
      target: { value: "read write" },
    });

    expect(lastAuth(onChange)).toEqual({
      type: "oauth2",
      client_id: "cid",
      client_secret_env: "SECRET_ENV",
      token_url: "https://auth.example.com/token",
      scope: "read write",
    });
  });

  it("Basic emite username y password_env", () => {
    const onChange = vi.fn();
    render(<StatefulForm onChange={onChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Usuario y contraseña" }),
    );
    fireEvent.change(screen.getByLabelText("Usuario"), {
      target: { value: "bot" },
    });
    fireEvent.change(
      screen.getByLabelText("Variable de entorno de la contraseña"),
      { target: { value: "PASS_ENV" } },
    );

    expect(lastAuth(onChange)).toEqual({
      type: "basic",
      username: "bot",
      password_env: "PASS_ENV",
    });
  });

  it("JSON inválido muestra error y no emite auth_config roto", () => {
    const onChange = vi.fn();
    render(<StatefulForm onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Avanzada" }));
    const callsAfterSelect = onChange.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Auth config (JSON)"), {
      target: { value: "{" },
    });

    expect(screen.getByText("El JSON no es válido")).toBeInTheDocument();
    expect(onChange.mock.calls.length).toBe(callsAfterSelect);

    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.auth_config).toEqual({});
  });

  it("blur de URL invalida y valida correctamente", () => {
    const onChange = vi.fn();
    render(<StatefulForm onChange={onChange} />);

    const urlInput = screen.getByLabelText("URL base");

    fireEvent.change(urlInput, { target: { value: "notaurl" } });
    fireEvent.blur(urlInput);
    expect(
      screen.getByText("Introduce una URL http o https"),
    ).toBeInTheDocument();

    fireEvent.change(urlInput, {
      target: { value: "https://api.example.com" },
    });
    fireEvent.blur(urlInput);
    expect(
      screen.queryByText("Introduce una URL http o https"),
    ).not.toBeInTheDocument();
  });
});
