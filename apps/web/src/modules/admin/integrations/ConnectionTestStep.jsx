import { useState } from "react";
import { api } from "../../../shared/apiClient";
import "./connectionTestStep.css";

function connectorBodyFromService(service) {
  return {
    name: service?.name,
    base_url: service?.base_url,
    description: service?.description || null,
    auth_config: service?.auth_config ?? null,
  };
}

/**
 * Paso de prueba de conexión OAuth2.
 * Crea el conector una sola vez si hace falta, luego POST …/test.
 */
export function ConnectionTestStep({
  service,
  connectorId = null,
  onConnectorCreated,
  onTestResult,
  apiClient = api,
}) {
  const [busy, setBusy] = useState(false);
  const [networkError, setNetworkError] = useState(null);
  const [createdConnectorId, setCreatedConnectorId] = useState(null);

  const result = service?.connectionTest;
  const hasResult = result != null && typeof result.ok === "boolean";
  const resolvedConnectorId = connectorId || createdConnectorId;

  async function ensureConnectorId() {
    if (resolvedConnectorId) return resolvedConnectorId;
    const created = await apiClient.post(
      "/admin/connectors",
      connectorBodyFromService(service),
    );
    const id = created?.id;
    if (!id) {
      throw new Error("No se pudo crear el conector");
    }
    setCreatedConnectorId(id);
    onConnectorCreated?.(id);
    return id;
  }

  async function handleTest() {
    if (busy) return;
    setBusy(true);
    setNetworkError(null);
    try {
      const id = await ensureConnectorId();
      const response = await apiClient.post(`/admin/connectors/${id}/test`);
      const next = {
        ok: Boolean(response?.ok),
        detail: response?.detail ?? null,
      };
      onTestResult?.(next);
    } catch (err) {
      setNetworkError(err?.message || "Error de red al probar la conexión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connection-test-step">
      <p className="connection-test-step__intro">
        Comprueba que el servicio responde con las credenciales OAuth2
        configuradas. No se muestran secretos ni tokens.
      </p>

      <button
        type="button"
        className="connection-test-step__btn"
        disabled={busy}
        onClick={handleTest}
      >
        {busy ? "Probando…" : "Probar conexión"}
      </button>

      {networkError ? (
        <p className="connection-test-step__error" role="alert">
          {networkError}
        </p>
      ) : null}

      {hasResult ? (
        <div
          className={
            result.ok
              ? "connection-test-step__result connection-test-step__result--ok"
              : "connection-test-step__result connection-test-step__result--fail"
          }
          role="status"
        >
          <p className="connection-test-step__result-title">
            {result.ok ? "Conexión correcta" : "No se pudo conectar"}
          </p>
          {result.detail != null && String(result.detail).trim() !== "" ? (
            <p className="connection-test-step__result-detail">
              {String(result.detail)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
