import { FieldRow } from "../../../shared/primitives";
import { pairsToRecord } from "../adminHelpers";
import { KeyValueListEditor } from "../KeyValueListEditor";
import { UrlPreview } from "./UrlPreview";
import "./actionStep.css";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);
const TIMEOUT_ERROR = "El tiempo de espera es de al menos 1 segundo";

const DEFAULT_ACTION = {
  name: "",
  method: "POST",
  path: "",
  useConnectorAuth: true,
  contentType: "application/json",
  timeout: "",
  headers: [{ key: "", value: "" }],
  query: [{ key: "", value: "" }],
  body: [{ key: "", value: "" }],
  advancedOpen: false,
};

function normalizeAction(action) {
  return {
    ...DEFAULT_ACTION,
    ...(action && typeof action === "object" ? action : {}),
    headers:
      Array.isArray(action?.headers) && action.headers.length > 0
        ? action.headers
        : DEFAULT_ACTION.headers,
    query:
      Array.isArray(action?.query) && action.query.length > 0
        ? action.query
        : DEFAULT_ACTION.query,
    body:
      Array.isArray(action?.body) && action.body.length > 0
        ? action.body
        : DEFAULT_ACTION.body,
  };
}

function methodAllowsBody(method) {
  return METHODS_WITH_BODY.has(String(method || "").toUpperCase());
}

function parseTimeout(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { empty: true, valid: false, value: undefined, showError: false };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { empty: false, valid: false, value: undefined, showError: false };
  }
  if (n < 1) {
    return { empty: false, valid: false, value: undefined, showError: true };
  }
  return { empty: false, valid: true, value: n, showError: false };
}

/**
 * Objeto canónico de request_config a partir del draft de acción.
 * Claves: headers, query, body?, auth, content_type?, timeout?
 * Nunca emite query_params ni body_params.
 */
export function toRequestConfig(action) {
  const current = normalizeAction(action);
  const method = String(current.method || "POST").toUpperCase();
  const allowsBody = methodAllowsBody(method);

  const config = {
    headers: pairsToRecord(current.headers),
    query: pairsToRecord(current.query),
    auth: {
      mode: current.useConnectorAuth ? "connector" : "none",
    },
  };

  if (allowsBody) {
    config.body = pairsToRecord(current.body);
    const contentType = String(current.contentType || "").trim();
    if (contentType) {
      config.content_type = contentType;
    }
  }

  const timeout = parseTimeout(current.timeout);
  if (timeout.valid) {
    config.timeout = timeout.value;
  }

  return config;
}

export function ActionStep({ draft, onDraftChange }) {
  const action = normalizeAction(draft?.action);
  const method = String(action.method || "POST").toUpperCase();
  const allowsBody = methodAllowsBody(method);
  const timeoutState = parseTimeout(action.timeout);
  const showTimeoutError = timeoutState.showError;

  function patchAction(patch) {
    onDraftChange({
      ...draft,
      action: {
        ...action,
        ...patch,
      },
    });
  }

  const authLabel = action.useConnectorAuth
    ? "Auth: la del servicio"
    : "Auth: ninguna";

  return (
    <div className="action-step">
      <UrlPreview
        method={method}
        baseUrl={draft?.service?.base_url ?? ""}
        path={action.path}
        authLabel={authLabel}
        contentType={allowsBody ? action.contentType : undefined}
      />

      <div className="action-step__fields">
        <FieldRow label="Nombre" htmlFor="action-step-name">
          <input
            id="action-step-name"
            value={action.name}
            onChange={(event) => patchAction({ name: event.target.value })}
            placeholder="Buscar cliente en CRM"
          />
        </FieldRow>

        <FieldRow label="Método" htmlFor="action-step-method">
          <select
            id="action-step-method"
            value={method}
            onChange={(event) =>
              patchAction({ method: event.target.value.toUpperCase() })
            }
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Path" htmlFor="action-step-path">
          <input
            id="action-step-path"
            value={action.path}
            onChange={(event) => patchAction({ path: event.target.value })}
            placeholder="/v1/customers/{id}"
          />
        </FieldRow>

        <label className="action-step__check">
          <input
            type="checkbox"
            checked={Boolean(action.useConnectorAuth)}
            onChange={(event) =>
              patchAction({ useConnectorAuth: event.target.checked })
            }
          />
          Usar la autenticación del servicio
        </label>

        <details
          className="action-step__advanced"
          open={Boolean(action.advancedOpen)}
          onToggle={(event) => {
            patchAction({ advancedOpen: event.currentTarget.open });
          }}
        >
          <summary>Opciones avanzadas</summary>
          <div className="action-step__advanced-body">
            <KeyValueListEditor
              label="Headers"
              helperText="Cabeceras adicionales enviadas en la petición."
              rows={action.headers}
              onChange={(next) => patchAction({ headers: next })}
            />
            <KeyValueListEditor
              label="Query"
              helperText="Parámetros en la URL (?clave=valor)."
              rows={action.query}
              onChange={(next) => patchAction({ query: next })}
              valueLabel="Valor"
            />
            {allowsBody ? (
              <>
                <KeyValueListEditor
                  label="Body"
                  helperText="Campos del cuerpo; solo con POST, PUT o PATCH."
                  rows={action.body}
                  onChange={(next) => patchAction({ body: next })}
                />
                <FieldRow
                  label="Content-Type"
                  htmlFor="action-step-content-type"
                >
                  <input
                    id="action-step-content-type"
                    value={action.contentType}
                    onChange={(event) =>
                      patchAction({ contentType: event.target.value })
                    }
                    placeholder="application/json"
                  />
                </FieldRow>
              </>
            ) : null}

            <FieldRow
              label="Timeout (segundos)"
              htmlFor="action-step-timeout"
              error={showTimeoutError ? TIMEOUT_ERROR : undefined}
            >
              <input
                id="action-step-timeout"
                type="number"
                min={1}
                step="any"
                value={action.timeout}
                placeholder="Opcional"
                onChange={(event) =>
                  patchAction({ timeout: event.target.value })
                }
              />
            </FieldRow>
          </div>
        </details>
      </div>
    </div>
  );
}
