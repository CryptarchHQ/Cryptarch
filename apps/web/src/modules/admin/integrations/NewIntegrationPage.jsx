import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../shared/apiClient";
import { Toast } from "../../../shared/primitives";
import { normalizeList } from "../adminHelpers";
import { ActionStep, toRequestConfig } from "./ActionStep";
import {
  FieldsStep,
  buildInputSchema,
  hasDuplicateTechnicalNames,
} from "./FieldsStep";
import { IntegrationServiceForm } from "./IntegrationServiceForm";
import { WizardShell } from "./WizardShell";

const WIZARD_STEPS = [
  { id: "service", label: "Servicio" },
  { id: "action", label: "Acción" },
  { id: "fields", label: "Campos" },
];

const EMPTY_DRAFT = {
  service: {
    name: "",
    description: "",
    base_url: "",
    auth_config: null,
  },
  action: {},
  fields: { items: [], tagIds: [] },
};

function normalizePath(path) {
  const raw = String(path ?? "").trim();
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function isHttpOrHttpsUrl(raw) {
  const trimmed = String(raw ?? "").trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

export function isStepValid(stepIndex, draft) {
  if (stepIndex === 0) {
    const name = String(draft?.service?.name ?? "").trim();
    const baseUrl = String(draft?.service?.base_url ?? "").trim();
    return Boolean(name) && isHttpOrHttpsUrl(baseUrl);
  }
  if (stepIndex === 1) {
    const name = String(draft?.action?.name ?? "").trim();
    const path = String(draft?.action?.path ?? "").trim();
    return Boolean(name) && Boolean(path);
  }
  if (stepIndex === 2) {
    return !hasDuplicateTechnicalNames(draft?.fields?.items);
  }
  return true;
}

/**
 * Alta de integración: conector (si hace falta) + acción.
 * Exportada para tests unitarios con apiClient mock.
 */
export async function createIntegration({
  draft,
  connectorId,
  apiClient = api,
}) {
  const service = draft?.service ?? {};
  const action = draft?.action ?? {};
  const fields = draft?.fields ?? {};
  const items = Array.isArray(fields.items) ? fields.items : [];
  const tagIds = Array.isArray(fields.tagIds) ? fields.tagIds : [];

  let resolvedConnectorId = connectorId || null;

  if (!resolvedConnectorId) {
    const connector = await apiClient.post("/admin/connectors", {
      name: service.name,
      base_url: service.base_url,
      description: service.description || null,
      auth_config: service.auth_config ?? null,
    });
    resolvedConnectorId = connector?.id;
  }

  await apiClient.post("/admin/actions", {
    connector_id: resolvedConnectorId,
    name: action.name,
    method: action.method || "POST",
    path: normalizePath(action.path),
    request_config: toRequestConfig(action),
    input_schema_json: buildInputSchema(items),
    input_schema_version: "1",
    tag_ids: tagIds,
  });

  return { connectorId: resolvedConnectorId };
}

function resolveInitialStep(connectorId, stepParam) {
  if (stepParam != null && String(stepParam).trim() !== "") {
    const human = Number(stepParam);
    if (Number.isFinite(human) && human >= 1) {
      return Math.max(0, Math.min(WIZARD_STEPS.length - 1, human - 1));
    }
  }
  return connectorId ? 1 : 0;
}

export function NewIntegrationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const connectorId = searchParams.get("connectorId") || null;
  const stepParam = searchParams.get("step");
  const initialStep = useMemo(
    () => resolveInitialStep(connectorId, stepParam),
    [connectorId, stepParam],
  );

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [tagOptions, setTagOptions] = useState([]);
  const [loadingConnector, setLoadingConnector] = useState(
    Boolean(connectorId),
  );
  const [loadError, setLoadError] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await api.get("/admin/tags");
        if (!cancelled) setTagOptions(normalizeList(payload));
      } catch {
        if (!cancelled) setTagOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connectorId) {
      setLoadingConnector(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingConnector(true);
    setLoadError(null);
    (async () => {
      try {
        const connector = await api.get(`/admin/connectors/${connectorId}`);
        if (cancelled) return;
        setDraft((prev) => ({
          ...prev,
          service: {
            name: connector?.name ?? "",
            description: connector?.description ?? "",
            base_url: connector?.base_url ?? "",
            auth_config:
              connector?.auth_config === undefined
                ? null
                : connector.auth_config,
          },
        }));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || "No se pudo cargar el conector");
        }
      } finally {
        if (!cancelled) setLoadingConnector(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectorId]);

  const handleCreateTag = useCallback(async (name) => {
    const payload = await api.post("/admin/tags", { name });
    const created = payload || { id: name, name };
    setTagOptions((prev) => [created, ...prev]);
    return created;
  }, []);

  const handleComplete = useCallback(
    async (finalDraft) => {
      if (submitting) return;
      setSubmitting(true);
      setCreateError(null);
      try {
        const result = await createIntegration({
          draft: finalDraft,
          connectorId,
          apiClient: api,
        });
        const href = `/admin/integrations/${result.connectorId}`;
        setToast({
          message: "Integración creada",
          href,
          linkLabel: "Ver integración",
        });
        navigate(href);
      } catch (err) {
        setCreateError(err?.message || "Error al crear la integración");
      } finally {
        setSubmitting(false);
      }
    },
    [connectorId, navigate, submitting],
  );

  if (loadingConnector) {
    return (
      <div className="new-integration-page">
        <p>Cargando conector…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="new-integration-page">
        <p role="alert">{loadError}</p>
        <button type="button" onClick={() => navigate("/admin/integrations")}>
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="new-integration-page">
      {toast ? (
        <Toast
          message={toast.message}
          href={toast.href}
          linkLabel={toast.linkLabel}
          onDismiss={() => setToast(null)}
        />
      ) : null}
      <WizardShell
        steps={WIZARD_STEPS}
        initialStep={initialStep}
        draft={draft}
        onDraftChange={setDraft}
        isStepValid={isStepValid}
        onCancel={() => navigate("/admin/integrations")}
        onComplete={handleComplete}
        renderStep={(stepIndex, { draft: stepDraft, setSlice }) => {
          if (stepIndex === 0) {
            const form = (
              <IntegrationServiceForm
                value={stepDraft.service}
                onChange={(service) => setSlice("service", service)}
              />
            );
            if (connectorId) {
              return <fieldset disabled>{form}</fieldset>;
            }
            return form;
          }
          if (stepIndex === 1) {
            return (
              <ActionStep
                draft={stepDraft}
                onDraftChange={(next) => setSlice("action", next.action)}
              />
            );
          }
          return (
            <FieldsStep
              value={stepDraft.fields}
              onChange={(fields) => setSlice("fields", fields)}
              tagOptions={tagOptions}
              onCreateTag={handleCreateTag}
              createError={createError}
            />
          );
        }}
      />
    </div>
  );
}
