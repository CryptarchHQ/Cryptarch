import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, apiRequest } from "../../../shared/apiClient";
import { Drawer, FieldRow, ListPage, Toast } from "../../../shared/primitives";
import { extractFileName, normalizeList } from "../adminHelpers";
import { TagPicker } from "../TagPicker";
import "./documentsPage.css";

const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "csv"]);

const STATUS_META = {
  queued: {
    label: "En cola",
    title: "esperando al worker",
    className: "documents-page__status documents-page__status--queued",
  },
  processing: {
    label: "Procesando",
    title: undefined,
    className: "documents-page__status documents-page__status--processing",
  },
  indexed: {
    label: "Listo",
    title: undefined,
    className: "documents-page__status documents-page__status--indexed",
  },
  error: {
    label: "Error",
    title: undefined,
    className: "documents-page__status documents-page__status--error",
  },
};

function emptyUploadForm() {
  return { file: null, title: "", tag_ids: [] };
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

function fileExtension(name) {
  const base = String(name || "").trim();
  const idx = base.lastIndexOf(".");
  if (idx < 0) return "";
  return base.slice(idx + 1).toLowerCase();
}

function isAllowedFile(file) {
  if (!file?.name) return false;
  return ALLOWED_EXTENSIONS.has(fileExtension(file.name));
}

function formsEqual(a, b) {
  return (
    a.file === b.file &&
    a.title === b.title &&
    JSON.stringify(a.tag_ids) === JSON.stringify(b.tag_ids)
  );
}

function DocumentStatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    label: String(status || "—"),
    title: undefined,
    className: "documents-page__status",
  };
  return (
    <span className={meta.className} title={meta.title}>
      {meta.label}
    </span>
  );
}

function DropZone({
  compact = false,
  onFileAccepted,
  onReject,
  inputRef,
  disabled = false,
}) {
  const [dragging, setDragging] = useState(false);

  function acceptFile(file) {
    if (!file) return;
    if (!isAllowedFile(file)) {
      onReject?.(
        "Solo se admiten ficheros PDF, TXT o CSV. Elige otro archivo.",
      );
      return;
    }
    onReject?.(null);
    onFileAccepted?.(file);
  }

  function onInputChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    acceptFile(file);
  }

  return (
    <div
      className={
        compact
          ? `documents-page__dropzone documents-page__dropzone--compact${dragging ? " documents-page__dropzone--dragging" : ""}`
          : `documents-page__dropzone${dragging ? " documents-page__dropzone--dragging" : ""}`
      }
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        acceptFile(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"
        className="documents-page__file-input"
        onChange={onInputChange}
        disabled={disabled}
        aria-label="Seleccionar fichero"
      />
      <p className="documents-page__dropzone-title">
        {compact
          ? "Suelta un fichero aquí o elige uno"
          : "Suelta aquí tu primer documento"}
      </p>
      <p className="documents-page__dropzone-hint">PDF, TXT o CSV</p>
      <button
        type="button"
        className="documents-page__secondary-btn"
        disabled={disabled}
        onClick={() => inputRef?.current?.click()}
      >
        Elegir fichero
      </button>
    </div>
  );
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [dropError, setDropError] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState(1);
  const [form, setForm] = useState(emptyUploadForm);
  const [formInitial, setFormInitial] = useState(emptyUploadForm);
  const [saving, setSaving] = useState(false);

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [retryingId, setRetryingId] = useState(null);
  const [toast, setToast] = useState(null);

  const dropInputRef = useRef(null);
  const drawerFileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [documentsResult, tagsResult] = await Promise.all([
        api.get("/admin/documents"),
        api.get("/admin/tags"),
      ]);
      setDocuments(normalizeList(documentsResult));
      setTags(normalizeList(tagsResult));
    } catch (nextError) {
      setError(nextError);
      setDocuments([]);
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tagIndex = useMemo(() => tagsById(tags), [tags]);

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents.filter((row) => {
      const rowTags = Array.isArray(row.tag_ids) ? row.tag_ids : [];
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (term) {
        const basename = extractFileName(row.file_path).toLowerCase();
        if (!basename.includes(term)) return false;
      }
      if (!includesAll(rowTags, tagFilter)) return false;
      return true;
    });
  }, [documents, search, statusFilter, tagFilter]);

  const hasActiveFilters =
    search.trim() !== "" || statusFilter !== "all" || tagFilter.length > 0;

  // ready siempre tras carga OK para poder mostrar la zona de drop en vacío.
  const listStatus = loading ? "loading" : error ? "error" : "ready";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setTagFilter([]);
  }

  function openCreateDrawer() {
    const next = emptyUploadForm();
    setForm(next);
    setFormInitial(next);
    setDrawerStep(1);
    setFormError(null);
    setDropError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerStep(1);
    setForm(emptyUploadForm());
    setFormInitial(emptyUploadForm());
    setFormError(null);
  }

  function beginWithFile(file) {
    const next = {
      file,
      title: extractFileName(file.name),
      tag_ids: [],
    };
    setForm(next);
    setFormInitial(emptyUploadForm());
    setDrawerStep(2);
    setFormError(null);
    setDropError(null);
    setDrawerOpen(true);
  }

  function onDrawerFileChosen(file) {
    if (!isAllowedFile(file)) {
      setFormError(
        "Solo se admiten ficheros PDF, TXT o CSV. Elige otro archivo.",
      );
      return;
    }
    setForm((prev) => ({
      ...prev,
      file,
      title: extractFileName(file.name),
    }));
    setFormError(null);
    setDrawerStep(2);
  }

  async function onCreateTag(name) {
    const payload = await api.post("/admin/tags", { name });
    const created = payload || { id: name, name };
    setTags((prev) => [created, ...prev]);
    return created;
  }

  async function onConfirmUpload(event) {
    event.preventDefault();
    if (saving || !form.file) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.append("file", form.file);
      const created = await apiRequest("/admin/documents/upload", {
        method: "POST",
        body,
      });
      const tagIds = Array.isArray(form.tag_ids) ? form.tag_ids : [];
      if (created?.id && tagIds.length > 0) {
        await api.patch(`/admin/documents/${created.id}`, { tag_ids: tagIds });
      }
      closeDrawer();
      setToast({ message: "Documento en cola" });
      await load();
    } catch (nextError) {
      setFormError(nextError?.message || "No se pudo subir el documento");
    } finally {
      setSaving(false);
    }
  }

  async function onRetry(documentId) {
    if (retryingId) return;
    setRetryingId(documentId);
    setError(null);
    try {
      await api.post(`/admin/documents/${documentId}/retry`);
      setToast({ message: "Documento en cola" });
      await load();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setRetryingId(null);
    }
  }

  function toggleExpanded(documentId) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(documentId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
  const hasDocuments = documents.length > 0;

  const filtersSlot = (
    <div className="documents-page__filters">
      <label className="documents-page__filter-field">
        <span className="documents-page__filter-label">Estado</span>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos</option>
          <option value="queued">En cola</option>
          <option value="processing">Procesando</option>
          <option value="indexed">Listo</option>
          <option value="error">Error</option>
        </select>
      </label>

      <div
        className="documents-page__tag-filters"
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
                  ? "documents-page__tag-chip documents-page__tag-chip--active"
                  : "documents-page__tag-chip"
              }
              aria-pressed={active}
              onClick={() => toggleTagFilter(id)}
            >
              {tag.name || id}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="documents-page">
      <ListPage
        title="Documentos"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nombre de fichero"
        filters={filtersSlot}
        headerActions={
          <button
            type="button"
            className="documents-page__primary-btn"
            onClick={openCreateDrawer}
          >
            Añadir documento
          </button>
        }
        status={listStatus}
        errorMessage={error?.message || "No se pudieron cargar los documentos"}
      >
        {dropError ? (
          <p className="documents-page__error" role="alert">
            {dropError}
          </p>
        ) : null}

        <DropZone
          compact={hasDocuments}
          inputRef={dropInputRef}
          onFileAccepted={beginWithFile}
          onReject={setDropError}
        />

        {!hasDocuments ? (
          <p className="documents-page__empty-hint">
            O usa «Añadir documento» para subir un PDF, TXT o CSV.
          </p>
        ) : null}

        {hasDocuments && filteredDocuments.length === 0 && hasActiveFilters ? (
          <div className="documents-page__no-match">
            <p>Nadie coincide con estos criterios</p>
            <button type="button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        ) : null}

        {filteredDocuments.length > 0 ? (
          <div className="documents-page__table-wrap">
            <table className="documents-page__table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Estado</th>
                  <th>Tags</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((row) => {
                  const basename = extractFileName(row.file_path);
                  const labels = (row.tag_ids || []).map(
                    (tagId) => tagIndex.get(String(tagId)) || String(tagId),
                  );
                  const isError = row.status === "error";
                  const rowKey = String(row.id ?? row.file_path);
                  const expanded = isError && expandedIds.has(rowKey);
                  return (
                    <FragmentRow
                      key={rowKey}
                      row={row}
                      basename={basename}
                      labels={labels}
                      isError={isError}
                      expanded={expanded}
                      retrying={retryingId === row.id}
                      onToggle={() => toggleExpanded(rowKey)}
                      onRetry={() => onRetry(row.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </ListPage>

      {error && listStatus === "ready" ? (
        <p className="documents-page__error" role="alert">
          {error.message || "Ha ocurrido un error"}
        </p>
      ) : null}

      <Drawer
        open={drawerOpen}
        title="Añadir documento"
        dirty={dirty}
        onClose={closeDrawer}
      >
        {drawerStep === 1 ? (
          <div className="documents-page__drawer-form">
            <p className="documents-page__drawer-copy">
              Elige un fichero PDF, TXT o CSV para encolarlo.
            </p>
            <input
              ref={drawerFileInputRef}
              type="file"
              accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"
              className="documents-page__file-input"
              aria-label="Fichero del documento"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onDrawerFileChosen(file);
              }}
            />
            <button
              type="button"
              className="documents-page__primary-btn"
              onClick={() => drawerFileInputRef.current?.click()}
            >
              Elegir fichero
            </button>
            {formError ? (
              <p className="documents-page__error" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        ) : (
          <form
            className="documents-page__drawer-form"
            onSubmit={onConfirmUpload}
          >
            <p className="documents-page__drawer-copy">
              Fichero: <strong>{form.file?.name || "—"}</strong>
            </p>
            <FieldRow label="Título" htmlFor="documents-page-title">
              <input
                id="documents-page-title"
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </FieldRow>
            <p className="documents-page__field-hint">
              Solo visual; el API no guarda título.
            </p>
            <div className="documents-page__drawer-tags">
              <span className="documents-page__filter-label">Tags</span>
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
              <p className="documents-page__error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="documents-page__drawer-footer">
              <button
                type="button"
                className="documents-page__secondary-btn"
                onClick={() => {
                  setDrawerStep(1);
                  setFormError(null);
                }}
              >
                Atrás
              </button>
              <button
                type="submit"
                className="documents-page__primary-btn"
                disabled={saving || !form.file}
              >
                {saving ? "Subiendo..." : "Confirmar"}
              </button>
            </div>
          </form>
        )}
      </Drawer>

      {toast ? (
        <div className="documents-page__toast">
          <Toast message={toast.message} onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}

function FragmentRow({
  row,
  basename,
  labels,
  isError,
  expanded,
  retrying,
  onToggle,
  onRetry,
}) {
  return (
    <>
      <tr
        className={
          isError
            ? "documents-page__row documents-page__row--error"
            : "documents-page__row"
        }
      >
        <td>
          {isError ? (
            <button
              type="button"
              className="documents-page__expand-btn"
              aria-expanded={expanded}
              onClick={onToggle}
            >
              {basename}
            </button>
          ) : (
            basename
          )}
        </td>
        <td>
          <DocumentStatusBadge status={row.status} />
        </td>
        <td>
          <ul className="documents-page__tag-list">
            {labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </td>
        <td>—</td>
      </tr>
      {isError && expanded ? (
        <tr className="documents-page__error-detail">
          <td colSpan={4}>
            <p className="documents-page__error-message">
              El worker no ha dejado un motivo
            </p>
            <button
              type="button"
              className="documents-page__secondary-btn"
              onClick={onRetry}
              disabled={retrying}
            >
              {retrying ? "Reintentando..." : "Reintentar"}
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}
