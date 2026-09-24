import { useEffect, useState } from "react";
import { FieldRow } from "../../../shared/primitives";
import { AuthMethodCard } from "./AuthMethodCard";
import "./integrationServiceForm.css";

const NAME_REQUIRED = "El nombre es obligatorio";
const URL_INVALID = "Introduce una URL http o https";
const JSON_INVALID = "El JSON no es válido";
const DEFAULT_API_KEY_HEADER = "X-API-Key";

const AUTH_METHODS = [
  {
    id: "none",
    title: "Sin autenticación",
    when: "Cuando la API es pública o la autenticación se gestiona fuera del conector.",
    where: "No hace falta buscar credenciales en el panel del proveedor.",
  },
  {
    id: "bearer",
    title: "Token",
    when: "Cuando el proveedor usa un token Bearer en la cabecera Authorization.",
    where:
      "En la consola del proveedor, sección de API tokens o claves de acceso.",
  },
  {
    id: "api_key",
    title: "API key",
    when: "Cuando la clave va en una cabecera propia (por ejemplo X-API-Key).",
    where: "En la documentación o consola del proveedor, sección de API keys.",
  },
  {
    id: "basic",
    title: "Usuario y contraseña",
    when: "Cuando el proveedor usa autenticación HTTP Basic.",
    where:
      "Credenciales de integración o usuario de servicio en el panel del proveedor.",
  },
  {
    id: "oauth2",
    title: "OAuth2",
    when: "Cuando el proveedor usa OAuth2 con client credentials.",
    where:
      "En la aplicación OAuth del proveedor: client id, secret y token URL.",
  },
  {
    id: "custom",
    title: "Avanzada",
    when: "Cuando ninguno de los métodos guiados encaja con el esquema del proveedor.",
    where:
      "En la documentación técnica del proveedor (configuración libre en JSON).",
  },
];

function normalizeValue(value) {
  return {
    name: value?.name ?? "",
    description: value?.description ?? "",
    base_url: value?.base_url ?? "",
    auth_config: value?.auth_config === undefined ? null : value.auth_config,
  };
}

function authKindFromConfig(auth_config) {
  if (auth_config == null) return "none";
  if (typeof auth_config !== "object" || Array.isArray(auth_config)) {
    return "custom";
  }
  const type = auth_config.type;
  if (type === "bearer") return "bearer";
  if (type === "api_key") return "api_key";
  if (type === "basic") return "basic";
  if (type === "oauth2") return "oauth2";
  return "custom";
}

function isHttpOrHttpsUrl(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function stringifyAuthConfig(auth_config) {
  try {
    return JSON.stringify(auth_config ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function authConfigForKind(kind, previous) {
  const prev =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? previous
      : {};

  switch (kind) {
    case "none":
      return null;
    case "bearer":
      return {
        type: "bearer",
        token_env: String(prev.token_env ?? ""),
      };
    case "api_key":
      return {
        type: "api_key",
        header_name: String(prev.header_name || DEFAULT_API_KEY_HEADER),
        key_env: String(prev.key_env ?? ""),
      };
    case "basic":
      return {
        type: "basic",
        username: String(prev.username ?? ""),
        password_env: String(prev.password_env ?? ""),
      };
    case "oauth2":
      return {
        type: "oauth2",
        client_id: String(prev.client_id ?? ""),
        client_secret_env: String(prev.client_secret_env ?? ""),
        token_url: String(prev.token_url ?? ""),
        scope: String(prev.scope ?? ""),
      };
    case "custom": {
      if (authKindFromConfig(previous) === "custom" && previous != null) {
        return previous;
      }
      return {};
    }
    default:
      return null;
  }
}

export function IntegrationServiceForm({ value, onChange, errors }) {
  const current = normalizeValue(value);
  const selectedKind = authKindFromConfig(current.auth_config);

  const [localNameError, setLocalNameError] = useState("");
  const [localUrlError, setLocalUrlError] = useState("");
  const [customJsonText, setCustomJsonText] = useState(() =>
    selectedKind === "custom" ? stringifyAuthConfig(current.auth_config) : "{}",
  );
  const [customJsonError, setCustomJsonError] = useState("");

  useEffect(() => {
    if (selectedKind !== "custom") return;
    if (customJsonError) return;
    const nextText = stringifyAuthConfig(current.auth_config);
    setCustomJsonText((prev) => {
      try {
        const parsedPrev = JSON.parse(prev);
        if (
          typeof parsedPrev === "object" &&
          parsedPrev !== null &&
          !Array.isArray(parsedPrev) &&
          JSON.stringify(parsedPrev) === JSON.stringify(current.auth_config)
        ) {
          return prev;
        }
      } catch {
        /* draft inválido: no pisar mientras haya error */
      }
      return nextText;
    });
  }, [selectedKind, current.auth_config, customJsonError]);

  function emit(partial) {
    onChange?.({
      ...current,
      ...partial,
    });
  }

  function patchAuth(nextAuth) {
    emit({ auth_config: nextAuth });
  }

  function selectKind(kind) {
    setCustomJsonError("");
    const nextAuth = authConfigForKind(kind, current.auth_config);
    if (kind === "custom") {
      setCustomJsonText(stringifyAuthConfig(nextAuth));
    }
    patchAuth(nextAuth);
  }

  function handleNameChange(event) {
    const name = event.target.value;
    if (name.trim()) setLocalNameError("");
    emit({ name });
  }

  function handleNameBlur() {
    if (!current.name.trim()) {
      setLocalNameError(NAME_REQUIRED);
      emit({ name: current.name });
      return;
    }
    setLocalNameError("");
  }

  function handleUrlChange(event) {
    setLocalUrlError("");
    emit({ base_url: event.target.value });
  }

  function handleUrlBlur() {
    if (!isHttpOrHttpsUrl(current.base_url)) {
      setLocalUrlError(URL_INVALID);
      return;
    }
    setLocalUrlError("");
  }

  function handleCustomJsonChange(event) {
    const text = event.target.value;
    setCustomJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setCustomJsonError(JSON_INVALID);
        return;
      }
      setCustomJsonError("");
      patchAuth(parsed);
    } catch {
      setCustomJsonError(JSON_INVALID);
    }
  }

  const nameError = errors?.name || localNameError;
  const urlError = errors?.base_url || localUrlError;
  const auth = current.auth_config;

  return (
    <div className="integration-service-form">
      <FieldRow
        label="Nombre"
        htmlFor="integration-service-name"
        error={nameError || undefined}
      >
        <input
          id="integration-service-name"
          name="name"
          value={current.name}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          aria-invalid={nameError ? "true" : undefined}
          autoComplete="off"
        />
      </FieldRow>

      <FieldRow
        label="Descripción"
        htmlFor="integration-service-description"
        hint="Opcional"
        error={errors?.description || undefined}
      >
        <textarea
          id="integration-service-description"
          name="description"
          rows={3}
          value={current.description}
          onChange={(event) => emit({ description: event.target.value })}
        />
      </FieldRow>

      <FieldRow
        label="URL base"
        htmlFor="integration-service-base-url"
        error={urlError || undefined}
      >
        <input
          id="integration-service-base-url"
          name="base_url"
          value={current.base_url}
          onChange={handleUrlChange}
          onBlur={handleUrlBlur}
          placeholder="https://api.example.com"
          aria-invalid={urlError ? "true" : undefined}
          autoComplete="off"
        />
      </FieldRow>

      <section
        className="integration-service-form__auth"
        aria-label="Autenticación"
      >
        <h3 className="integration-service-form__auth-heading">
          Autenticación
        </h3>
        <div className="integration-service-form__auth-grid">
          {AUTH_METHODS.map((method) => (
            <AuthMethodCard
              key={method.id}
              title={method.title}
              when={method.when}
              where={method.where}
              selected={selectedKind === method.id}
              onSelect={() => selectKind(method.id)}
            >
              {method.id === "bearer" ? (
                <FieldRow
                  label="Variable de entorno del token"
                  htmlFor="auth-bearer-token-env"
                >
                  <input
                    id="auth-bearer-token-env"
                    value={String(auth?.token_env ?? "")}
                    onChange={(event) =>
                      patchAuth({
                        type: "bearer",
                        token_env: event.target.value,
                      })
                    }
                    placeholder="CRM_TOKEN"
                    autoComplete="off"
                  />
                </FieldRow>
              ) : null}

              {method.id === "api_key" ? (
                <>
                  <FieldRow
                    label="Nombre de la cabecera"
                    htmlFor="auth-api-key-header"
                  >
                    <input
                      id="auth-api-key-header"
                      value={String(
                        auth?.header_name || DEFAULT_API_KEY_HEADER,
                      )}
                      onChange={(event) =>
                        patchAuth({
                          type: "api_key",
                          header_name:
                            event.target.value || DEFAULT_API_KEY_HEADER,
                          key_env: String(auth?.key_env ?? ""),
                        })
                      }
                      placeholder={DEFAULT_API_KEY_HEADER}
                      autoComplete="off"
                    />
                  </FieldRow>
                  <FieldRow
                    label="Variable de entorno de la clave"
                    htmlFor="auth-api-key-env"
                  >
                    <input
                      id="auth-api-key-env"
                      value={String(auth?.key_env ?? "")}
                      onChange={(event) =>
                        patchAuth({
                          type: "api_key",
                          header_name: String(
                            auth?.header_name || DEFAULT_API_KEY_HEADER,
                          ),
                          key_env: event.target.value,
                        })
                      }
                      placeholder="MY_API_KEY"
                      autoComplete="off"
                    />
                  </FieldRow>
                </>
              ) : null}

              {method.id === "basic" ? (
                <>
                  <FieldRow label="Usuario" htmlFor="auth-basic-username">
                    <input
                      id="auth-basic-username"
                      value={String(auth?.username ?? "")}
                      onChange={(event) =>
                        patchAuth({
                          type: "basic",
                          username: event.target.value,
                          password_env: String(auth?.password_env ?? ""),
                        })
                      }
                      placeholder="integrations-bot"
                      autoComplete="off"
                    />
                  </FieldRow>
                  <FieldRow
                    label="Variable de entorno de la contraseña"
                    htmlFor="auth-basic-password-env"
                  >
                    <input
                      id="auth-basic-password-env"
                      value={String(auth?.password_env ?? "")}
                      onChange={(event) =>
                        patchAuth({
                          type: "basic",
                          username: String(auth?.username ?? ""),
                          password_env: event.target.value,
                        })
                      }
                      placeholder="CRM_BASIC_PASSWORD"
                      autoComplete="off"
                    />
                  </FieldRow>
                </>
              ) : null}

              {method.id === "oauth2" ? (
                <>
                  <FieldRow label="Client ID" htmlFor="auth-oauth2-client-id">
                    <input
                      id="auth-oauth2-client-id"
                      value={String(auth?.client_id ?? "")}
                      onChange={(event) =>
                        patchAuth({
                          type: "oauth2",
                          client_id: event.target.value,
                          client_secret_env: String(
                            auth?.client_secret_env ?? "",
                          ),
                          token_url: String(auth?.token_url ?? ""),
                          scope: String(auth?.scope ?? ""),
                        })
                      }
                      placeholder="crm-client-id"
                      autoComplete="off"
                    />
                  </FieldRow>
                  <FieldRow
                    label="Variable de entorno del client secret"
                    htmlFor="auth-oauth2-client-secret-env"
                  >
                    <input
                      id="auth-oauth2-client-secret-env"
                      value={String(auth?.client_secret_env ?? "")}
                      onChange={(event) =>
                        patchAuth({
                          type: "oauth2",
                          client_id: String(auth?.client_id ?? ""),
                          client_secret_env: event.target.value,
                          token_url: String(auth?.token_url ?? ""),
                          scope: String(auth?.scope ?? ""),
                        })
                      }
                      placeholder="CRM_CLIENT_SECRET"
                      autoComplete="off"
                    />
                  </FieldRow>
                  <FieldRow label="Token URL" htmlFor="auth-oauth2-token-url">
                    <input
                      id="auth-oauth2-token-url"
                      value={String(auth?.token_url ?? "")}
                      onChange={(event) =>
                        patchAuth({
                          type: "oauth2",
                          client_id: String(auth?.client_id ?? ""),
                          client_secret_env: String(
                            auth?.client_secret_env ?? "",
                          ),
                          token_url: event.target.value,
                          scope: String(auth?.scope ?? ""),
                        })
                      }
                      placeholder="https://auth.example.com/oauth/token"
                      autoComplete="off"
                    />
                  </FieldRow>
                  <FieldRow label="Scope" htmlFor="auth-oauth2-scope">
                    <input
                      id="auth-oauth2-scope"
                      value={String(auth?.scope ?? "")}
                      onChange={(event) =>
                        patchAuth({
                          type: "oauth2",
                          client_id: String(auth?.client_id ?? ""),
                          client_secret_env: String(
                            auth?.client_secret_env ?? "",
                          ),
                          token_url: String(auth?.token_url ?? ""),
                          scope: event.target.value,
                        })
                      }
                      placeholder="contacts.read contacts.write"
                      autoComplete="off"
                    />
                  </FieldRow>
                </>
              ) : null}

              {method.id === "custom" ? (
                <FieldRow
                  label="Auth config (JSON)"
                  htmlFor="auth-custom-json"
                  error={customJsonError || undefined}
                >
                  <textarea
                    id="auth-custom-json"
                    rows={6}
                    value={customJsonText}
                    onChange={handleCustomJsonChange}
                    spellCheck={false}
                  />
                </FieldRow>
              ) : null}
            </AuthMethodCard>
          ))}
        </div>
      </section>
    </div>
  );
}
