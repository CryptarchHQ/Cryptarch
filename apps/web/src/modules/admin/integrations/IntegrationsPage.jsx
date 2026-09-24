import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../shared/apiClient";
import {
  ConfirmDialog,
  Drawer,
  ListPage,
  Toast,
} from "../../../shared/primitives";
import { normalizeList, summarizeConnectorAuth } from "../adminHelpers";
import { IntegrationServiceForm } from "./IntegrationServiceForm";
import "./integrationsPage.css";

function serviceFormFromConnector(connector) {
  return {
    name: connector?.name ?? "",
    description: connector?.description ?? "",
    base_url: connector?.base_url ?? "",
    auth_config:
      connector?.auth_config === undefined ? null : connector.auth_config,
  };
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function tagLabel(tagIds, tagById) {
  if (!Array.isArray(tagIds) || tagIds.length === 0) return [];
  return tagIds.map((id) => tagById.get(String(id)) || String(id));
}

function schemaVersionForDuplicate(value) {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

export function IntegrationsPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  const [connectors, setConnectors] = useState([]);
  const [actions, setActions] = useState([]);
  const [tagById, setTagById] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchValue, setSearchValue] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editInitial, setEditInitial] = useState(null);
  const [editValue, setEditValue] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteAction, setDeleteAction] = useState(null);
  const [deleteConnectorOpen, setDeleteConnectorOpen] = useState(false);
  const [connectorBlockMessage, setConnectorBlockMessage] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [connectorsResult, actionsResult] = await Promise.all([
        api.get("/admin/connectors"),
        api.get("/admin/actions"),
      ]);
      setConnectors(normalizeList(connectorsResult));
      setActions(normalizeList(actionsResult));
    } catch (nextError) {
      setError(nextError);
      setConnectors([]);
      setActions([]);
    }

    try {
      const tagsResult = await api.get("/admin/tags");
      const map = new Map();
      for (const tag of normalizeList(tagsResult)) {
        if (tag?.id != null)
          map.set(String(tag.id), tag.name || String(tag.id));
      }
      setTagById(map);
    } catch {
      setTagById(new Map());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const actionCountByConnector = useMemo(() => {
    const counts = new Map();
    for (const action of actions) {
      const key = String(action.connector_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [actions]);

  const filteredConnectors = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return connectors;
    return connectors.filter((connector) => {
      const name = String(connector.name || "").toLowerCase();
      const url = String(connector.base_url || "").toLowerCase();
      return name.includes(q) || url.includes(q);
    });
  }, [connectors, searchValue]);

  const selectedConnector = useMemo(
    () =>
      routeId
        ? connectors.find((item) => String(item.id) === String(routeId)) || null
        : null,
    [connectors, routeId],
  );

  const connectorActions = useMemo(
    () =>
      routeId
        ? actions.filter(
            (action) => String(action.connector_id) === String(routeId),
          )
        : [],
    [actions, routeId],
  );

  const listStatus = loading
    ? "loading"
    : error
      ? "error"
      : connectors.length === 0
        ? "empty"
        : "ready";

  function openEditDrawer(connector) {
    const form = serviceFormFromConnector(connector);
    setEditInitial(form);
    setEditValue(form);
    setEditOpen(true);
  }

  function closeEditDrawer() {
    setEditOpen(false);
    setEditInitial(null);
    setEditValue(null);
  }

  async function saveEdit() {
    if (!selectedConnector || !editValue || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.patch(`/admin/connectors/${selectedConnector.id}`, {
        name: editValue.name,
        description: editValue.description,
        base_url: editValue.base_url,
        auth_config: editValue.auth_config,
      });
      closeEditDrawer();
      setToast({ message: "Integración actualizada" });
      await load();
    } catch (nextError) {
      setToast({
        message: nextError?.message || "No se pudo guardar la integración",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function duplicateAction(action) {
    try {
      const version = schemaVersionForDuplicate(action.input_schema_version);
      const body = {
        connector_id: action.connector_id,
        method: action.method,
        path: action.path,
        name: `${action.name || "Acción"} (copia)`,
        request_config: action.request_config ?? null,
        input_schema_json: action.input_schema_json ?? null,
        tag_ids: Array.isArray(action.tag_ids) ? action.tag_ids : [],
      };
      if (version !== undefined) body.input_schema_version = version;
      await api.post("/admin/actions", body);
      setToast({ message: "Acción duplicada" });
      await load();
    } catch (nextError) {
      setToast({
        message: nextError?.message || "No se pudo duplicar la acción",
      });
    }
  }

  async function confirmDeleteAction() {
    if (!deleteAction) return;
    const actionId = deleteAction.id;
    try {
      await api.delete(`/admin/actions/${actionId}`);
      setDeleteAction(null);
      setToast({ message: "Acción eliminada" });
      await load();
    } catch (nextError) {
      setDeleteAction(null);
      setToast({
        message: nextError?.message || "No se pudo eliminar la acción",
      });
    }
  }

  async function confirmDeleteConnector() {
    if (!selectedConnector) return;
    setConnectorBlockMessage("");
    try {
      await api.delete(`/admin/connectors/${selectedConnector.id}`);
      setDeleteConnectorOpen(false);
      setToast({ message: "Integración eliminada" });
      navigate("/admin/integrations");
      await load();
    } catch (nextError) {
      if (nextError?.status === 409) {
        const names = connectorActions
          .map((action) => action.name || "Acción sin nombre")
          .join(", ");
        setConnectorBlockMessage(
          names
            ? `No se puede eliminar: tiene acciones asociadas (${names}).`
            : "No se puede eliminar: tiene acciones asociadas.",
        );
        return;
      }
      setDeleteConnectorOpen(false);
      setToast({
        message: nextError?.message || "No se pudo eliminar la integración",
      });
    }
  }

  const editDirty =
    editOpen && editInitial && editValue
      ? !formsEqual(editInitial, editValue)
      : false;

  if (routeId) {
    return (
      <div className="integrations-page">
        <div className="integrations-page__detail">
          <header className="integrations-page__detail-header">
            <div>
              <Link
                to="/admin/integrations"
                className="integrations-page__back"
              >
                ← Integraciones
              </Link>
              {loading ? (
                <p className="integrations-page__muted">Cargando...</p>
              ) : null}
              {!loading && !selectedConnector ? (
                <p className="integrations-page__error" role="alert">
                  No se encontró esta integración.
                </p>
              ) : null}
              {selectedConnector ? (
                <>
                  <h1 className="integrations-page__title">
                    {selectedConnector.name || "Integración"}
                  </h1>
                  {selectedConnector.description ? (
                    <p className="integrations-page__muted">
                      {selectedConnector.description}
                    </p>
                  ) : null}
                  <p className="integrations-page__meta">
                    <span>{selectedConnector.base_url}</span>
                    <span className="integrations-page__auth">
                      {summarizeConnectorAuth(selectedConnector.auth_config)}
                    </span>
                  </p>
                </>
              ) : null}
            </div>
            {selectedConnector ? (
              <div className="integrations-page__detail-actions">
                <button
                  type="button"
                  onClick={() => openEditDrawer(selectedConnector)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="danger"
                  aria-label="Eliminar integración"
                  onClick={() => {
                    setConnectorBlockMessage("");
                    setDeleteConnectorOpen(true);
                  }}
                >
                  Eliminar
                </button>
              </div>
            ) : null}
          </header>

          {selectedConnector ? (
            <section
              className="integrations-page__actions-section"
              aria-label="Acciones"
            >
              <div className="integrations-page__actions-heading">
                <h2>Acciones</h2>
                <Link
                  to={`/admin/integrations/new?connectorId=${encodeURIComponent(selectedConnector.id)}&step=2`}
                  className="integrations-page__primary-link"
                >
                  Nueva acción
                </Link>
              </div>

              {connectorActions.length === 0 ? (
                <p className="integrations-page__empty-actions">
                  Esta integración aún no hace nada
                </p>
              ) : (
                <ul className="integrations-page__action-list">
                  {connectorActions.map((action) => {
                    const labels = tagLabel(action.tag_ids, tagById);
                    return (
                      <li
                        key={action.id}
                        className="integrations-page__action-row"
                      >
                        <div className="integrations-page__action-main">
                          <strong>{action.name || "Acción sin nombre"}</strong>
                          <span className="integrations-page__method-path">
                            {String(action.method || "").toUpperCase()}{" "}
                            {action.path}
                          </span>
                          {labels.length > 0 ? (
                            <ul className="integrations-page__tags">
                              {labels.map((label) => (
                                <li key={label}>{label}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="integrations-page__action-buttons">
                          <button
                            type="button"
                            onClick={() => openEditDrawer(selectedConnector)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateAction(action)}
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            className="danger"
                            aria-label={`Eliminar acción ${action.name || ""}`.trim()}
                            onClick={() => setDeleteAction(action)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        <Drawer
          open={editOpen}
          title="Editar integración"
          dirty={editDirty}
          onClose={closeEditDrawer}
        >
          {editValue ? (
            <div className="integrations-page__drawer-body">
              <IntegrationServiceForm
                value={editValue}
                onChange={setEditValue}
              />
              <div className="integrations-page__drawer-footer">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit || !editDirty}
                >
                  {savingEdit ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          ) : null}
        </Drawer>

        <ConfirmDialog
          open={Boolean(deleteAction)}
          title="Eliminar acción"
          consequence={
            deleteAction
              ? `Se eliminará «${deleteAction.name || "Acción sin nombre"}». Esta acción no se puede deshacer.`
              : ""
          }
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          onConfirm={confirmDeleteAction}
          onCancel={() => setDeleteAction(null)}
        />

        <ConfirmDialog
          open={deleteConnectorOpen}
          title="Eliminar integración"
          consequence={
            connectorBlockMessage ||
            "Se eliminará esta integración. Si tiene acciones asociadas, no se podrá borrar."
          }
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          onConfirm={confirmDeleteConnector}
          onCancel={() => {
            setDeleteConnectorOpen(false);
            setConnectorBlockMessage("");
          }}
        />

        {toast ? (
          <div className="integrations-page__toast">
            <Toast
              message={toast.message}
              href={toast.href}
              linkLabel={toast.linkLabel}
              onDismiss={() => setToast(null)}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <ListPage
        title="Integraciones"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Buscar por nombre o URL"
        headerActions={
          <Link
            to="/admin/integrations/new"
            className="integrations-page__primary-link"
          >
            Nueva integración
          </Link>
        }
        status={listStatus}
        errorMessage={
          error?.message || "No se pudieron cargar las integraciones"
        }
        emptyTitle="Conecta tu primer servicio"
        emptyDescription="Crea una integración para conectar un servicio externo y definir acciones."
      >
        <ul className="integrations-page__list">
          {filteredConnectors.map((connector) => {
            const count = actionCountByConnector.get(String(connector.id)) || 0;
            return (
              <li key={connector.id} className="integrations-page__row">
                <div className="integrations-page__row-main">
                  <strong className="integrations-page__row-name">
                    {connector.name || "Sin nombre"}
                  </strong>
                  <span className="integrations-page__row-url">
                    {connector.base_url}
                  </span>
                  <span className="integrations-page__auth">
                    {summarizeConnectorAuth(connector.auth_config)}
                  </span>
                  <span className="integrations-page__row-count">
                    {count === 1 ? "1 acción" : `${count} acciones`}
                  </span>
                </div>
                <Link
                  to={`/admin/integrations/${encodeURIComponent(connector.id)}`}
                  className="integrations-page__row-open"
                >
                  Abrir
                </Link>
              </li>
            );
          })}
        </ul>
        {connectors.length > 0 && filteredConnectors.length === 0 ? (
          <p className="integrations-page__muted">
            Ninguna integración coincide con la búsqueda.
          </p>
        ) : null}
      </ListPage>

      {toast ? (
        <div className="integrations-page__toast">
          <Toast
            message={toast.message}
            href={toast.href}
            linkLabel={toast.linkLabel}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
