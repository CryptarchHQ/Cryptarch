import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";
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
import "./usersPage.css";

function emptyForm() {
  return { email: "", role: "user", password: "", tag_ids: [] };
}

function tagsById(tags) {
  const index = new Map();
  for (const tag of tags) {
    if (tag?.id != null) index.set(String(tag.id), tag.name || String(tag.id));
  }
  return index;
}

function includesAll(source, expected) {
  const sourceSet = new Set(
    (Array.isArray(source) ? source : []).map((id) => String(id)),
  );
  return (expected || []).every((tagId) => sourceSet.has(String(tagId)));
}

function proposedFilterName(roleFilter, tagFilter) {
  if (Array.isArray(tagFilter) && tagFilter.length > 0) {
    return "Usuarios con estas tags";
  }
  if (roleFilter === "admin") return "Usuarios admin";
  if (roleFilter === "user") return "Usuarios user";
  return "Usuarios";
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function UsersPage({ currentUserId: currentUserIdProp } = {}) {
  const { user } = useAuth();
  const currentUserId = currentUserIdProp ?? user?.sub ?? null;

  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [filters, setFilters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState([]);
  const [newFilterName, setNewFilterName] = useState(() =>
    proposedFilterName("all", []),
  );
  const [savingFilter, setSavingFilter] = useState(false);

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
      const [usersResult, tagsResult, filtersResult] = await Promise.all([
        api.get("/admin/users"),
        api.get("/admin/tags"),
        api.get("/admin/filters"),
      ]);
      setUsers(normalizeList(usersResult));
      setTags(normalizeList(tagsResult));
      setFilters(
        normalizeList(filtersResult).filter(
          (item) => item.target_type === "user",
        ),
      );
    } catch (nextError) {
      setError(nextError);
      setUsers([]);
      setTags([]);
      setFilters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setNewFilterName(proposedFilterName(roleFilter, tagFilter));
  }, [roleFilter, tagFilter]);

  const tagIndex = useMemo(() => tagsById(tags), [tags]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((row) => {
      const userTags = Array.isArray(row.tag_ids) ? row.tag_ids : [];
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (
        term &&
        !String(row.email || "")
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      if (!includesAll(userTags, tagFilter)) return false;
      return true;
    });
  }, [roleFilter, search, tagFilter, users]);

  const hasActiveFilters =
    search.trim() !== "" || roleFilter !== "all" || tagFilter.length > 0;

  const listStatus = loading
    ? "loading"
    : error
      ? "error"
      : users.length === 0
        ? "empty"
        : "ready";

  function clearFilters() {
    setSearch("");
    setRoleFilter("all");
    setTagFilter([]);
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
      email: row.email || "",
      role: row.role || "user",
      password: "",
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

  async function onSaveUser(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        email: form.email,
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
        tag_ids: Array.isArray(form.tag_ids) ? form.tag_ids : [],
      };
      if (editingId) await api.patch(`/admin/users/${editingId}`, payload);
      else await api.post("/admin/users", payload);
      closeDrawer();
      setToast({ message: "Usuario guardado" });
      await load();
    } catch (nextError) {
      setFormError(nextError?.message || "No se pudo guardar el usuario");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    try {
      setError(null);
      await api.delete(`/admin/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      setToast({ message: "Usuario eliminado" });
      await load();
    } catch (nextError) {
      setDeleteTarget(null);
      setError(nextError);
    }
  }

  async function onSaveFilter() {
    if (!newFilterName.trim() || tagFilter.length === 0 || savingFilter) return;
    setSavingFilter(true);
    setError(null);
    try {
      await api.post("/admin/filters", {
        name: newFilterName.trim(),
        target_type: "user",
        tag_ids: tagFilter,
      });
      await load();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSavingFilter(false);
    }
  }

  function toggleTagFilter(tagId) {
    const id = String(tagId);
    setTagFilter((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  }

  const dirty = drawerOpen && !formsEqual(form, formInitial);

  const filtersSlot = (
    <div className="users-page__filters">
      <label className="users-page__filter-field">
        <span className="users-page__filter-label">Rol</span>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          aria-label="Filtrar por rol"
        >
          <option value="all">Todos</option>
          <option value="admin">admin</option>
          <option value="user">user</option>
        </select>
      </label>

      <div
        className="users-page__tag-filters"
        role="group"
        aria-label="Filtrar por tags"
      >
        {tags.map((tag) => {
          const id = String(tag.id ?? tag.name);
          const active = tagFilter.map(String).includes(id);
          return (
            <button
              key={id}
              type="button"
              className={
                active
                  ? "users-page__tag-chip users-page__tag-chip--active"
                  : "users-page__tag-chip"
              }
              aria-pressed={active}
              onClick={() => toggleTagFilter(id)}
            >
              {tag.name || id}
            </button>
          );
        })}
      </div>

      {filters.length > 0 ? (
        <div
          className="users-page__saved-filters"
          role="group"
          aria-label="Filtros guardados"
        >
          {filters.map((filter) => (
            <button
              key={filter.id || filter.name}
              type="button"
              className="users-page__saved-chip"
              onClick={() =>
                setTagFilter(
                  Array.isArray(filter.tag_ids) ? filter.tag_ids : [],
                )
              }
            >
              {filter.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="users-page__save-filter">
        <input
          type="text"
          value={newFilterName}
          onChange={(event) => setNewFilterName(event.target.value)}
          aria-label="Nombre del filtro"
          placeholder="Nombre del filtro"
        />
        <button
          type="button"
          className="users-page__secondary-btn"
          onClick={onSaveFilter}
          disabled={
            tagFilter.length === 0 || savingFilter || !newFilterName.trim()
          }
        >
          Guardar como filtro
        </button>
      </div>
    </div>
  );

  return (
    <div className="users-page">
      <ListPage
        title="Usuarios"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por email"
        filters={filtersSlot}
        headerActions={
          <button
            type="button"
            className="users-page__primary-btn"
            onClick={openCreateDrawer}
          >
            Nuevo usuario
          </button>
        }
        status={listStatus}
        errorMessage={error?.message || "No se pudieron cargar los usuarios"}
        emptyTitle="Sin usuarios"
        emptyDescription="Crea el primer usuario para empezar."
      >
        {filteredUsers.length === 0 && hasActiveFilters ? (
          <div className="users-page__no-match">
            <p>Nadie coincide con estos criterios</p>
            <button type="button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="users-page__table-wrap">
            <table className="users-page__table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Tags</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((row) => {
                  const isSelf =
                    currentUserId != null &&
                    String(row.id) === String(currentUserId);
                  const labels = (row.tag_ids || []).map(
                    (tagId) => tagIndex.get(String(tagId)) || String(tagId),
                  );
                  return (
                    <tr key={row.id || row.email}>
                      <td>{row.email}</td>
                      <td>{row.role}</td>
                      <td>
                        <ul className="users-page__tag-list">
                          {labels.map((label) => (
                            <li key={label}>{label}</li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <div className="users-page__row-actions">
                          <button
                            type="button"
                            onClick={() => openEditDrawer(row)}
                          >
                            Editar
                          </button>
                          {!isSelf ? (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => setDeleteTarget(row)}
                            >
                              Eliminar
                            </button>
                          ) : null}
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
        <p className="users-page__error" role="alert">
          {error.message || "Ha ocurrido un error"}
        </p>
      ) : null}

      <Drawer
        open={drawerOpen}
        title={editingId ? "Editar usuario" : "Nuevo usuario"}
        dirty={dirty}
        onClose={closeDrawer}
      >
        <form className="users-page__drawer-form" onSubmit={onSaveUser}>
          <FieldRow label="Email" htmlFor="users-page-email">
            <input
              id="users-page-email"
              required
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </FieldRow>
          <FieldRow label="Rol" htmlFor="users-page-role">
            <select
              id="users-page-role"
              value={form.role}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, role: event.target.value }))
              }
            >
              <option value="admin">admin</option>
              <option value="user">user</option>
            </select>
          </FieldRow>
          <FieldRow
            label={editingId ? "Password (opcional)" : "Password"}
            htmlFor="users-page-password"
            hint={
              editingId
                ? "Déjalo vacío para no cambiar la contraseña."
                : undefined
            }
          >
            <input
              id="users-page-password"
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              autoComplete="new-password"
            />
          </FieldRow>
          <div className="users-page__drawer-tags">
            <span className="users-page__filter-label">Tags</span>
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
            <p className="users-page__error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="users-page__drawer-footer">
            <button
              type="submit"
              className="users-page__primary-btn"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar usuario"
        consequence={
          deleteTarget
            ? `Se eliminará «${deleteTarget.email || "usuario"}». Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast ? (
        <div className="users-page__toast">
          <Toast message={toast.message} onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
