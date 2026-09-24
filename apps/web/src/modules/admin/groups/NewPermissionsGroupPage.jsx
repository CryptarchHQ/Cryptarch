import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../shared/apiClient";
import { FieldRow, Toast } from "../../../shared/primitives";
import { normalizeList } from "../adminHelpers";
import { TagPicker } from "../TagPicker";
import { WizardShell } from "../integrations/WizardShell";
import { PermissionMatchPreview } from "./PermissionMatchPreview";
import "./newPermissionsGroupPage.css";

export const PERMISSIONS_WIZARD_STEPS = [
  { id: "who", label: "Quién entra" },
  { id: "actions", label: "Qué puede hacer" },
  { id: "documents", label: "Qué documentos ve" },
];

const EMPTY_DRAFT = {
  service: { name: "", userTagIds: [] },
  action: { actionTagIds: [] },
  fields: {},
};

export function isStepValid(stepIndex, draft) {
  if (stepIndex === 0) {
    return Boolean(String(draft?.service?.name ?? "").trim());
  }
  return true;
}

function filterNameFor(groupName, kind) {
  const suffix =
    kind === "user"
      ? "usuarios"
      : kind === "action"
        ? "acciones"
        : "documentos";
  return `${groupName} · ${suffix}`;
}

/**
 * Alta: filtros solo para pasos con etiquetas, luego el grupo.
 * Exportada para tests con apiClient mock.
 */
export async function createPermissionsGroup({ draft, apiClient = api }) {
  const name = String(draft?.service?.name ?? "").trim();
  const userTagIds = Array.isArray(draft?.service?.userTagIds)
    ? draft.service.userTagIds
    : [];
  const actionTagIds = Array.isArray(draft?.action?.actionTagIds)
    ? draft.action.actionTagIds
    : [];
  const documentTagIds = Array.isArray(draft?.fields?.documentTagIds)
    ? draft.fields.documentTagIds
    : [];

  const user_filter_ids = [];
  const action_filter_ids = [];
  const document_filter_ids = [];

  if (userTagIds.length > 0) {
    const created = await apiClient.post("/admin/filters", {
      name: filterNameFor(name, "user"),
      target_type: "user",
      tag_ids: userTagIds,
    });
    if (created?.id) user_filter_ids.push(created.id);
  }

  if (actionTagIds.length > 0) {
    const created = await apiClient.post("/admin/filters", {
      name: filterNameFor(name, "action"),
      target_type: "action",
      tag_ids: actionTagIds,
    });
    if (created?.id) action_filter_ids.push(created.id);
  }

  if (documentTagIds.length > 0) {
    const created = await apiClient.post("/admin/filters", {
      name: filterNameFor(name, "document"),
      target_type: "document",
      tag_ids: documentTagIds,
    });
    if (created?.id) document_filter_ids.push(created.id);
  }

  await apiClient.post("/admin/groups", {
    name,
    user_filter_ids,
    action_filter_ids,
    document_filter_ids,
  });
}

export function NewPermissionsGroupPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [tagOptions, setTagOptions] = useState([]);
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
        await createPermissionsGroup({ draft: finalDraft, apiClient: api });
        setToast({ message: "Grupo creado" });
        navigate("/admin/groups");
      } catch (err) {
        setCreateError(err?.message || "Error al crear el grupo");
      } finally {
        setSubmitting(false);
      }
    },
    [navigate, submitting],
  );

  return (
    <div className="new-permissions-group-page">
      {toast ? (
        <Toast message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}
      {createError ? (
        <p className="new-permissions-group-page__error" role="alert">
          {createError}
        </p>
      ) : null}
      <WizardShell
        steps={PERMISSIONS_WIZARD_STEPS}
        draft={draft}
        onDraftChange={setDraft}
        isStepValid={isStepValid}
        onCancel={() => navigate("/admin/groups")}
        onComplete={handleComplete}
        renderStep={(stepIndex, { draft: stepDraft, setSlice }) => {
          if (stepIndex === 0) {
            return (
              <div className="new-permissions-group-page__step">
                <FieldRow label="Nombre del grupo" htmlFor="perm-group-name">
                  <input
                    id="perm-group-name"
                    type="text"
                    value={stepDraft.service?.name ?? ""}
                    onChange={(event) =>
                      setSlice("service", { name: event.target.value })
                    }
                    placeholder="Ej. Equipo soporte"
                    autoComplete="off"
                  />
                </FieldRow>
                <FieldRow label="Etiquetas de usuario">
                  <TagPicker
                    options={tagOptions}
                    value={stepDraft.service?.userTagIds ?? []}
                    onChange={(ids) => setSlice("service", { userTagIds: ids })}
                    onCreateTag={handleCreateTag}
                  />
                </FieldRow>
                <PermissionMatchPreview
                  targetType="user"
                  tagIds={stepDraft.service?.userTagIds ?? []}
                />
              </div>
            );
          }

          if (stepIndex === 1) {
            return (
              <div className="new-permissions-group-page__step">
                <FieldRow label="Etiquetas de acción">
                  <TagPicker
                    options={tagOptions}
                    value={stepDraft.action?.actionTagIds ?? []}
                    onChange={(ids) =>
                      setSlice("action", { actionTagIds: ids })
                    }
                    onCreateTag={handleCreateTag}
                  />
                </FieldRow>
                <PermissionMatchPreview
                  targetType="action"
                  tagIds={stepDraft.action?.actionTagIds ?? []}
                />
              </div>
            );
          }

          return (
            <div className="new-permissions-group-page__step">
              <FieldRow label="Etiquetas de documento">
                <TagPicker
                  options={tagOptions}
                  value={stepDraft.fields?.documentTagIds ?? []}
                  onChange={(ids) => {
                    if (ids.length === 0) {
                      setDraft((prev) => ({ ...prev, fields: {} }));
                      return;
                    }
                    setSlice("fields", { documentTagIds: ids });
                  }}
                  onCreateTag={handleCreateTag}
                />
              </FieldRow>
              <PermissionMatchPreview
                targetType="document"
                tagIds={stepDraft.fields?.documentTagIds ?? []}
              />
            </div>
          );
        }}
      />
    </div>
  );
}
