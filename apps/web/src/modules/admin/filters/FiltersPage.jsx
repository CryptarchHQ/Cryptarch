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
import { TagPicker } from "../TagPicker";
import "./filtersPage.css";

const TARGET_TYPE_LABELS = {
  user: "Usuario",
  action: "Acción",
  document: "Documento",
};

function emptyForm() {
  return { name: "", target_type: "user", tag_ids: [] };
}

function tagsById(tags) {
  const index = new Map();
  for (const tag of tags) {
    if (tag?.id != null) index.set(String(tag.id), tag.name || "sin nombre");
  }
  return index;
}

function formatCriterion(tagIds, tagIndex) {
  const ids = Array.isArray(tagIds) ? tagIds : [];
  const names = ids.map((id) => tagIndex.get(String(id))).filter(Boolean);
  if (names.length === 0) return "tiene TODAS: —";
  return `tiene TODAS: ${names.join(", ")}`;
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function groupsReferencingFilter(groups, filterId) {
  const id = String(filterId);
  return (groups || []).filter((group) => {
    const bags = [
      group.user_filter_ids,
      group.action_filter_ids,
      group.document_filter_ids,
    ];
    return bags.some((list) =>
      (Array.isArray(list) ? list : []).some((fid) => String(fid) === id),
    );
  });
}

export function FiltersPage() {
  const [filters, setFilters] = useState([]);
  const [tags, setTags] = useState([]);
  const [groups, setGroups] = useState([]);
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
      const [filtersResult, tagsResult, groupsResult] = await Promise.all([
        api.get("/admin/filters"),
        api.get("/admin/tags"),
        api.get("/admin/groups"),
      ]);
      setFilters(normalizeList(filtersResult));
      setTags(normalizeList(tagsResult));
      setGroups(normalizeList(groupsResult));
    } catch (nextError) {
      setError(nextError);
      setFilters([]);
      setTags([]);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tagIndex = useMemo(() => tagsById(tags), [tags]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return filters;
    return filters.filter((row) => {
      const name = String(row.name || "").toLowerCase();
      const typeLabel = (
        TARGET_TYPE_LABELS[row.target_type] ||
        row.target_type ||
        ""
      ).toLowerCase();
      const criterion = formatCriterion(row.tag_ids, tagIndex).toLowerCase();
      return (
        name.includes(term) ||
        typeLabel.includes(term) ||
        criterion.includes(term)
      );
    });
  }, [filters, search, tagIndex]);

  const hasActiveFilters = search.trim() !== "";

  const listStatus = loading
    ? "loading"
    : error
      ? "error"
      : filters.length === 0
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
      target_type: row.target_type || "user",
      tag_ids: Array.isArray(row.tag_ids) ? row.tag_ids : [],
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

  async function onCreateTag(name) {
    const payload = await api.post("/admin/tags", { name });
    const created = payload || { id: name, name };
    setTags((prev) => [created, ...prev]);
    return created;
  }

  async function onSaveFilter(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await api.patch(`/admin/filters/${editingId}`, {
          name: form.name,
          tag_ids: Array.isArray(form.tag_ids) ? form.tag_ids : [],
        });
      } else {
        await api.post("/admin/filters", {
          name: form.name,
          target_type: form.target_type,
          tag_ids: Array.isArray(form.tag_ids) ? form.tag_ids : [],
        });
      }
      closeDrawer();
      setToast({ message: "Filtro guardado" });
      await load();
    } catch (nextError) {
      setFormError(nextError?.message || "No se pudo guardar el filtro");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteFilter() {
    if (!deleteTarget) return;
    try {
      setError(null);
      await api.delete(`/admin/filters/${deleteTarget.id}`);
      setDeleteTarget(null);
      setToast({ message: "Filtro eliminado" });
      await load();
    } catch (nextError) {
      setDeleteTarget(null);
      setError(nextError);
    }
  }

  const dirty = drawerOpen && !formsEqual(form, formInitial);

  const referencingGroups = deleteTarget
    ? groupsReferencingFilter(groups, deleteTarget.id)
    : [];

  const deleteConsequence = deleteTarget
    ? [
        `Se eliminará «${deleteTarget.name || "filtro"}». Esta acción no se puede deshacer.`,
        referencingGroups.length > 0
          ? `Grupos que lo usan: ${referencingGroups
              .map((g) => g.name || "grupo")
              .join(", ")}.`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <div className="filters-page">
      <ListPage
        title="Filtros"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar filtros"
        headerActions={
          <button
            type="button"
            className="filters-page__primary-btn"
            onClick={openCreateDrawer}
          >
            Nuevo filtro
          </button>
        }
        status={listStatus}
        errorMessage={error?.message || "No se pudieron cargar los filtros"}
        emptyTitle="Sin filtros"
        emptyDescription="Crea el primer filtro para empezar."
      >
        {filteredRows.length === 0 && hasActiveFilters ? (
          <div className="filters-page__no-match">
            <p>Ningún filtro coincide con la búsqueda</p>
            <button type="button" onClick={clearSearch}>
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <div className="filters-page__table-wrap">
            <table className="filters-page__table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Criterio</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const typeLabel =
                    TARGET_TYPE_LABELS[row.target_type] || row.target_type;
                  const criterion = formatCriterion(row.tag_ids, tagIndex);
                  return (
                    <tr key={row.id || row.name}>
                      <td>{row.name}</td>
                      <td>{typeLabel}</td>
                      <td>{criterion}</td>
                      <td>
                        <div className="filters-page__row-actions">
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
        <p className="filters-page__error" role="alert">
          {error.message || "Ha ocurrido un error"}
        </p>
      ) : null}

      <Drawer
        open={drawerOpen}
        title={editingId ? "Editar filtro" : "Nuevo filtro"}
        dirty={dirty}
        onClose={closeDrawer}
      >
        <form className="filters-page__drawer-form" onSubmit={onSaveFilter}>
          <FieldRow label="Nombre" htmlFor="filters-page-name">
            <input
              id="filters-page-name"
              required
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </FieldRow>
          {!editingId ? (
            <FieldRow label="Tipo" htmlFor="filters-page-target-type">
              <select
                id="filters-page-target-type"
                value={form.target_type}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    target_type: event.target.value,
                  }))
                }
              >
                <option value="user">Usuario</option>
                <option value="action">Acción</option>
                <option value="document">Documento</option>
              </select>
            </FieldRow>
          ) : null}
          <div className="filters-page__drawer-tags">
            <span className="filters-page__field-label">Tags (TODAS)</span>
            <TagPicker
              options={tags}
              value={form.tag_ids}
              onChange={(next) =>
                setForm((prev) => ({ ...prev, tag_ids: next }))
              }
              onCreateTag={onCreateTag}
            />
          </div>
          {formError ? (
            <p className="filters-page__error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="filters-page__drawer-footer">
            <button
              type="submit"
              className="filters-page__primary-btn"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar filtro"
        consequence={deleteConsequence}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeleteFilter}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast ? (
        <div className="filters-page__toast">
          <Toast message={toast.message} onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
