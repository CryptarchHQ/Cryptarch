import { useMemo, useState } from "react";
import { FieldRow } from "../../../shared/primitives";
import { TagPicker } from "../TagPicker";
import { DynamicActionForm } from "../../chat/DynamicActionForm";
import "./fieldsStep.css";

const TYPE_OPTIONS = [
  { value: "string", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "integer", label: "Número entero" },
  { value: "boolean", label: "Sí/No" },
];

const DUPLICATE_NAME_ERROR = "Nombre técnico duplicado";

function emptyItem() {
  return { label: "", name: "", type: "string", required: false };
}

function normalizeFields(value) {
  return {
    items: Array.isArray(value?.items) ? value.items : [],
    tagIds: Array.isArray(value?.tagIds) ? value.tagIds : [],
  };
}

/** Deriva un nombre técnico a partir de la etiqueta visible. */
export function deriveTechnicalName(label) {
  return String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Schema JSON Schema enviado como input_schema_json.
 * Ignora filas sin etiqueta. Si name está vacío, lo deriva del label.
 */
export function buildInputSchema(items) {
  const properties = {};
  const required = [];
  for (const item of items || []) {
    const label = String(item?.label ?? "").trim();
    if (!label) continue;
    const name = String(item?.name ?? "").trim() || deriveTechnicalName(label);
    if (!name) continue;
    const type = item?.type || "string";
    properties[name] = { type, description: label };
    if (item?.required) required.push(name);
  }
  return { type: "object", properties, required };
}

/** Nombres técnicos no vacíos que aparecen más de una vez. */
export function duplicateTechnicalNames(items) {
  const counts = new Map();
  for (const item of items || []) {
    const name = String(item?.name ?? "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const dupes = new Set();
  for (const [name, count] of counts) {
    if (count > 1) dupes.add(name);
  }
  return dupes;
}

export function hasDuplicateTechnicalNames(items) {
  return duplicateTechnicalNames(items).size > 0;
}

export function FieldsStep({
  value,
  onChange,
  tagOptions = [],
  onCreateTag,
  createError,
}) {
  const fields = normalizeFields(value);
  const { items, tagIds } = fields;
  const duplicates = useMemo(() => duplicateTechnicalNames(items), [items]);
  const schemaJson = useMemo(() => buildInputSchema(items), [items]);
  const [previewPayload, setPreviewPayload] = useState({});

  function emit(partial) {
    onChange?.({
      ...fields,
      ...partial,
    });
  }

  function patchItem(index, patch) {
    const next = items.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    emit({ items: next });
  }

  function handleLabelChange(index, label) {
    const current = items[index] || emptyItem();
    const previousDerived = deriveTechnicalName(current.label);
    const nameWasAuto =
      !String(current.name || "").trim() || current.name === previousDerived;
    const nextName = nameWasAuto ? deriveTechnicalName(label) : current.name;
    patchItem(index, { label, name: nextName });
  }

  function handleNameChange(index, name) {
    const sanitized = String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    patchItem(index, { name: sanitized });
  }

  function addItem() {
    emit({ items: [...items, emptyItem()] });
  }

  function removeItem(index) {
    emit({ items: items.filter((_, i) => i !== index) });
  }

  const hasLabeledFields = items.some(
    (item) => String(item?.label ?? "").trim() !== "",
  );

  return (
    <div className="fields-step">
      <div className="fields-step__list">
        {items.map((item, index) => {
          const name = String(item.name || "").trim();
          const isDuplicate = name && duplicates.has(name);
          return (
            <div key={index} className="fields-step__row">
              <div className="fields-step__row-main">
                <FieldRow
                  label="Etiqueta"
                  htmlFor={`fields-step-label-${index}`}
                >
                  <input
                    id={`fields-step-label-${index}`}
                    value={item.label ?? ""}
                    onChange={(event) =>
                      handleLabelChange(index, event.target.value)
                    }
                    placeholder="Buscar cliente"
                    autoComplete="off"
                  />
                </FieldRow>

                <FieldRow label="Tipo" htmlFor={`fields-step-type-${index}`}>
                  <select
                    id={`fields-step-type-${index}`}
                    value={item.type || "string"}
                    onChange={(event) =>
                      patchItem(index, { type: event.target.value })
                    }
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FieldRow>

                <label className="fields-step__check">
                  <input
                    type="checkbox"
                    checked={Boolean(item.required)}
                    onChange={(event) =>
                      patchItem(index, { required: event.target.checked })
                    }
                  />
                  Obligatorio
                </label>

                <button
                  type="button"
                  className="fields-step__remove"
                  onClick={() => removeItem(index)}
                  aria-label={`Eliminar campo ${index + 1}`}
                >
                  Eliminar
                </button>
              </div>

              <details className="fields-step__tech">
                <summary>Nombre técnico</summary>
                <div className="fields-step__tech-body">
                  <FieldRow
                    label="Nombre técnico"
                    htmlFor={`fields-step-name-${index}`}
                    error={isDuplicate ? DUPLICATE_NAME_ERROR : undefined}
                  >
                    <input
                      id={`fields-step-name-${index}`}
                      value={item.name ?? ""}
                      onChange={(event) =>
                        handleNameChange(index, event.target.value)
                      }
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={isDuplicate ? "true" : undefined}
                    />
                  </FieldRow>
                </div>
              </details>

              {isDuplicate ? (
                <p className="fields-step__error" role="alert">
                  {DUPLICATE_NAME_ERROR}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="fields-step__actions">
        <button type="button" onClick={addItem}>
          Añadir campo
        </button>
      </div>

      <div className="fields-step__tags">
        <span className="fields-step__tags-label">Etiquetas</span>
        <TagPicker
          options={tagOptions}
          value={tagIds}
          onChange={(next) => emit({ tagIds: next })}
          onCreateTag={onCreateTag}
        />
      </div>

      <section
        className="fields-step__preview"
        aria-label="Vista previa del formulario"
      >
        <h3 className="fields-step__preview-title">Vista previa</h3>
        {!hasLabeledFields ? (
          <p className="fields-step__empty">Esta acción no pedirá datos</p>
        ) : null}
        <DynamicActionForm
          schemaJson={schemaJson}
          payload={previewPayload}
          onPayloadChange={setPreviewPayload}
          onSubmit={() => {}}
        />
      </section>

      {createError ? (
        <p className="fields-step__create-error" role="alert">
          {createError}
        </p>
      ) : null}
    </div>
  );
}
