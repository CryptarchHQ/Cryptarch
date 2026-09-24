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
import "./tagsPage.css";

function emptyForm() {
  return { name: "" };
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function TagsPage() {
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
      const tagsResult = await api.get("/admin/tags");
      setTags(normalizeList(tagsResult));
    } catch (nextError) {
      setError(nextError);
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tags;
    return tags.filter((row) =>
      String(row.name || "")
        .toLowerCase()
        .includes(term),
    );
  }, [search, tags]);

  const hasActiveSearch = search.trim() !== "";

  const listStatus = loading
    ? "loading"
    : error
      ? "error"
      : tags.length === 0
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
    const next = { name: row.name || "" };
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

  async function onSaveTag(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = { name: form.name };
      if (editingId) await api.patch(`/admin/tags/${editingId}`, payload);
      else await api.post("/admin/tags", payload);
      closeDrawer();
      setToast({ message: "Etiqueta guardada" });
      await load();
    } catch (nextError) {
      setFormError(nextError?.message || "No se pudo guardar la etiqueta");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteTag() {
    if (!deleteTarget) return;
    try {
      setError(null);
      await api.delete(`/admin/tags/${deleteTarget.id}`);
      setDeleteTarget(null);
      setToast({ message: "Etiqueta eliminada" });
      await load();
    } catch (nextError) {
      setDeleteTarget(null);
      setError(nextError);
    }
  }

  const dirty = drawerOpen && !formsEqual(form, formInitial);

  return (
    <div className="tags-page">
      <ListPage
        title="Etiquetas"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar etiquetas"
        headerActions={
          <button
            type="button"
            className="tags-page__primary-btn"
            onClick={openCreateDrawer}
          >
            Nueva etiqueta
          </button>
        }
        status={listStatus}
        errorMessage={error?.message || "No se pudieron cargar las etiquetas"}
        emptyTitle="Aún no hay etiquetas"
        emptyDescription="Crea la primera etiqueta para empezar."
      >
        {filteredRows.length === 0 && hasActiveSearch ? (
          <div className="tags-page__no-match">
            <p>Ninguna etiqueta coincide con la búsqueda</p>
            <button type="button" onClick={clearSearch}>
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <div className="tags-page__table-wrap">
            <table className="tags-page__table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id || row.name}>
                    <td>{row.name}</td>
                    <td>
                      <div className="tags-page__row-actions">
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListPage>

      {error && listStatus === "ready" ? (
        <p className="tags-page__error" role="alert">
          {error.message || "Ha ocurrido un error"}
        </p>
      ) : null}

      <Drawer
        open={drawerOpen}
        title={editingId ? "Editar etiqueta" : "Nueva etiqueta"}
        dirty={dirty}
        onClose={closeDrawer}
      >
        <form className="tags-page__drawer-form" onSubmit={onSaveTag}>
          <FieldRow label="Nombre" htmlFor="tags-page-name">
            <input
              id="tags-page-name"
              required
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </FieldRow>
          {formError ? (
            <p className="tags-page__error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="tags-page__drawer-footer">
            <button
              type="submit"
              className="tags-page__primary-btn"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar etiqueta"
        consequence={
          deleteTarget
            ? `Se eliminará «${deleteTarget.name || "etiqueta"}». Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeleteTag}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast ? (
        <div className="tags-page__toast">
          <Toast message={toast.message} onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
