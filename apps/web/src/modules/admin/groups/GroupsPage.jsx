import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../shared/apiClient";
import {
  ConfirmDialog,
  Drawer,
  FieldRow,
  ListPage,
  Toast,
} from "../../../shared/primitives";
import { normalizeList } from "../adminHelpers";
import "./groupsPage.css";

function emptyForm() {
  return {
    name: "",
    user_filter_ids: [],
    action_filter_ids: [],
    document_filter_ids: [],
  };
}

function tagsById(tags) {
  const index = new Map();
  for (const tag of tags) {
    if (tag?.id != null) index.set(String(tag.id), tag.name || "sin nombre");
  }
  return index;
}

function filtersById(filters) {
  const index = new Map();
  for (const filter of filters) {
    if (filter?.id != null) index.set(String(filter.id), filter);
  }
  return index;
}

function joinTagNames(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function formatCriterion(tagIds, tagIndex) {
  const ids = Array.isArray(tagIds) ? tagIds : [];
  const names = ids.map((id) => tagIndex.get(String(id))).filter(Boolean);
  if (names.length === 0) return "sin etiquetas";
  return `tiene ${joinTagNames(names)}`;
}

function filterDisplayLabel(filter, tagIndex) {
  const name = filter?.name || "filtro";
  return `${name} · ${formatCriterion(filter?.tag_ids, tagIndex)}`;
}

function summarizeFilterIds(filterIds, filterIndex, tagIndex) {
  const ids = Array.isArray(filterIds) ? filterIds : [];
  if (ids.length === 0) return "ninguna";
  return ids
    .map((id) => {
      const filter = filterIndex.get(String(id));
      if (!filter) return null;
      return formatCriterion(filter.tag_ids, tagIndex);
    })
    .filter(Boolean)
    .join("; ");
}

function groupSummary(group, filterIndex, tagIndex) {
  const users = summarizeFilterIds(
    group.user_filter_ids,
    filterIndex,
    tagIndex,
  );
  const actions = summarizeFilterIds(
    group.action_filter_ids,
    filterIndex,
    tagIndex,
  );
  const documents = summarizeFilterIds(
    group.document_filter_ids,
    filterIndex,
    tagIndex,
  );
  return `Usuarios: ${users}. Acciones: ${actions}. Documentos: ${documents}.`;
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const FILTER_SIDE_HINT =
  "Varios son alternativas (OR). Si no marcas ninguno, este lado no concede nada.";

function FilterIdPicker({
  id,
  label,
  filters,
  selectedIds,
  tagIndex,
  emptyMessage,
  onToggle,
}) {
  const selected = new Set((selectedIds || []).map(String));

  return (
    <FieldRow label={label} htmlFor={id} hint={FILTER_SIDE_HINT}>
      {filters.length === 0 ? (
        <p id={id} className="groups-page__filter-empty">
          {emptyMessage}
        </p>
      ) : (
        <ul
          id={id}
          className="groups-page__filter-list"
          role="group"
          aria-label={label}
        >
          {filters.map((filter) => {
            const fid = String(filter.id);
            const checked = selected.has(fid);
            const inputId = `${id}-${fid}`;
            return (
              <li key={fid} className="groups-page__filter-item">
                <label
                  htmlFor={inputId}
                  className="groups-page__filter-option"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(filter.id)}
                  />
                  <span>{filterDisplayLabel(filter, tagIndex)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </FieldRow>
  );
}

export function GroupsPage({ headerActions = null } = {}) {
  const [groups, setGroups] = useState([]);
  const [filters, setFilters] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const [search, setSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formInitial, setFormInitial] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupsResult, filtersResult, tagsResult] = await Promise.all([
        api.get("/admin/groups"),
        api.get("/admin/filters"),
        api.get("/admin/tags"),
      ]);
      setGroups(normalizeList(groupsResult));
      setFilters(normalizeList(filtersResult));
      setTags(normalizeList(tagsResult));
    } catch (nextError) {
      setError(nextError);
      setGroups([]);
      setFilters([]);
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tagIndex = useMemo(() => tagsById(tags), [tags]);
  const filterIndex = useMemo(() => filtersById(filters), [filters]);

  const filtersByType = useMemo(
    () => ({
      user: filters.filter((item) => item.target_type === "user"),
      action: filters.filter((item) => item.target_type === "action"),
      document: filters.filter((item) => item.target_type === "document"),
    }),
    [filters],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((row) => {
      const name = String(row.name || "").toLowerCase();
      const summary = groupSummary(row, filterIndex, tagIndex).toLowerCase();
      return name.includes(term) || summary.includes(term);
    });
  }, [filterIndex, groups, search, tagIndex]);

  const hasActiveFilters = search.trim() !== "";

  const listStatus = loading
    ? "loading"
    : error
      ? "error"
      : groups.length === 0
        ? "empty"
        : "ready";

  function clearSearch() {
    setSearch("");
  }

  function openCreateDrawer() {
    const next = emptyForm();
    setEditingId(null);
    setForm(next);
    setFormInitial(next);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(row) {
    const next = {
      name: row.name || "",
      user_filter_ids: Array.isArray(row.user_filter_ids)
        ? row.user_filter_ids
        : [],
      action_filter_ids: Array.isArray(row.action_filter_ids)
        ? row.action_filter_ids
        : [],
      document_filter_ids: Array.isArray(row.document_filter_ids)
        ? row.document_filter_ids
        : [],
    };
    setEditingId(row.id);
    setForm(next);
    setFormInitial(next);
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormInitial(emptyForm());
    setFormError(null);
  }

  function toggleFilterId(fieldName, filterId) {
    const sid = String(filterId);
    setForm((prev) => {
      const current = Array.isArray(prev[fieldName]) ? prev[fieldName] : [];
      const has = current.some((id) => String(id) === sid);
      const next = has
        ? current.filter((id) => String(id) !== sid)
        : [...current, filterId];
      return { ...prev, [fieldName]: next };
    });
  }

  async function onSaveGroup(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name,
        user_filter_ids: form.user_filter_ids,
        action_filter_ids: form.action_filter_ids,
        document_filter_ids: form.document_filter_ids,
      };
      if (editingId) await api.patch(`/admin/groups/${editingId}`, payload);
      else await api.post("/admin/groups", payload);
      closeDrawer();
      setToast({ message: "Grupo guardado" });
      await load();
    } catch (nextError) {
      setFormError(nextError?.message || "No se pudo guardar el grupo");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteGroup() {
    if (!deleteTarget) return;
    try {
      setError(null);
      await api.delete(`/admin/groups/${deleteTarget.id}`);
      setDeleteTarget(null);
      setToast({ message: "Grupo eliminado" });
      await load();
    } catch (nextError) {
      setDeleteTarget(null);
      setError(nextError);
    }
  }

  const dirty = drawerOpen && !formsEqual(form, formInitial);

  const listHeaderActions = (
    <>
      {headerActions}
      <button
        type="button"
        className="groups-page__primary-btn"
        onClick={openCreateDrawer}
      >
        Nuevo grupo
      </button>
    </>
  );

  return (
    <div className="groups-page">
      <ListPage
        title="Grupos"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar grupos"
        headerActions={listHeaderActions}
        status={listStatus}
        errorMessage={error?.message || "No se pudieron cargar los grupos"}
        emptyTitle="Sin grupos"
        emptyDescription="Crea el primer grupo para empezar."
      >
        {filteredRows.length === 0 && hasActiveFilters ? (
          <div className="groups-page__no-match">
            <p>Ningún grupo coincide con la búsqueda</p>
            <button type="button" onClick={clearSearch}>
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <div className="groups-page__table-wrap">
            <table className="groups-page__table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Resumen</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const summary = groupSummary(row, filterIndex, tagIndex);
                  return (
                    <tr key={row.id || row.name}>
                      <td>{row.name}</td>
                      <td>{summary}</td>
                      <td>
                        <div className="groups-page__row-actions">
                          <button
                            type="button"
                            onClick={() => openEditDrawer(row)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => setDeleteTarget(row)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ListPage>

      {error && listStatus === "ready" ? (
        <p className="groups-page__error" role="alert">
          {error.message || "Ha ocurrido un error"}
        </p>
      ) : null}

      <Drawer
        open={drawerOpen}
        title={editingId ? "Editar grupo" : "Nuevo grupo"}
        dirty={dirty}
        onClose={closeDrawer}
      >
        <form className="groups-page__drawer-form" onSubmit={onSaveGroup}>
          <FieldRow label="Nombre" htmlFor="groups-page-name">
            <input
              id="groups-page-name"
              required
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </FieldRow>

          <FilterIdPicker
            id="groups-page-user-filters"
            label="Filtros de usuarios"
            filters={filtersByType.user}
            selectedIds={form.user_filter_ids}
            tagIndex={tagIndex}
            emptyMessage="No hay filtros de usuarios. Créalos en Filtros."
            onToggle={(filterId) => toggleFilterId("user_filter_ids", filterId)}
          />

          <FilterIdPicker
            id="groups-page-action-filters"
            label="Filtros de acciones"
            filters={filtersByType.action}
            selectedIds={form.action_filter_ids}
            tagIndex={tagIndex}
            emptyMessage="No hay filtros de acciones. Créalos en Filtros."
            onToggle={(filterId) =>
              toggleFilterId("action_filter_ids", filterId)
            }
          />

          <FilterIdPicker
            id="groups-page-document-filters"
            label="Filtros de documentos"
            filters={filtersByType.document}
            selectedIds={form.document_filter_ids}
            tagIndex={tagIndex}
            emptyMessage="No hay filtros de documentos. Créalos en Filtros."
            onToggle={(filterId) =>
              toggleFilterId("document_filter_ids", filterId)
            }
          />

          {formError ? (
            <p className="groups-page__error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="groups-page__drawer-footer">
            <button
              type="submit"
              className="groups-page__primary-btn"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar grupo"
        consequence={
          deleteTarget
            ? `Se eliminará «${deleteTarget.name || "grupo"}». Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeleteGroup}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast ? (
        <div className="groups-page__toast">
          <Toast message={toast.message} onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
