import { useMemo } from "react";
import {
  castPayloadValue,
  chatFieldsFromInputSchemaJson,
  initialValueForField,
} from "../admin/adminHelpers";

function FieldControl({ field, value, onChange }) {
  const options = field.options || [];
  switch (field.type) {
    case "textarea":
      return (
        <textarea
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "select":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((opt) => (
            <option
              key={String(opt.value ?? opt)}
              value={String(opt.value ?? opt)}
            >
              {opt.label ?? opt.value ?? opt}
            </option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="chat-form__options">
          {options.map((opt) => {
            const optionValue = String(opt.value ?? opt);
            return (
              <label key={optionValue}>
                <input
                  type="radio"
                  name={field.name}
                  checked={String(value) === optionValue}
                  onChange={() => onChange(optionValue)}
                />
                {opt.label ?? opt.value ?? opt}
              </label>
            );
          })}
        </div>
      );
    case "date":
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function buildInitialPayload(schemaJson) {
  const fields = chatFieldsFromInputSchemaJson(schemaJson);
  const defaults = {};
  for (const field of fields) {
    defaults[field.name] = initialValueForField(field);
  }
  return { fields, defaults };
}

export function buildExecutePayload(schemaJson, payload) {
  const fields = chatFieldsFromInputSchemaJson(schemaJson);
  const payloadObject = {};
  for (const field of fields) {
    payloadObject[field.name] = castPayloadValue(field, payload[field.name]);
  }
  return payloadObject;
}

export function DynamicActionForm({
  schemaJson,
  schemaVersion,
  payload,
  onPayloadChange,
  onSubmit,
  submitting,
  submitLabel = "Ejecutar",
}) {
  const fields = useMemo(
    () => chatFieldsFromInputSchemaJson(schemaJson),
    [schemaJson],
  );

  return (
    <form
      className="chat-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {schemaVersion ? (
        <p className="chat-form__version">Esquema v{schemaVersion}</p>
      ) : null}
      {fields.length === 0 ? (
        <p className="chat-form__hint">
          Esta acción no define parámetros de entrada.
        </p>
      ) : null}
      {fields.map((field) => (
        <label key={field.name} className="chat-form__field">
          <span className="chat-form__label">
            {field.label || field.name}
            {field.required ? (
              <span className="chat-form__hint" aria-hidden>
                {" "}
                *
              </span>
            ) : null}
          </span>
          {field.description ? (
            <span className="chat-form__description">{field.description}</span>
          ) : null}
          <FieldControl
            field={field}
            value={payload[field.name] ?? ""}
            onChange={(next) =>
              onPayloadChange((prev) => ({ ...prev, [field.name]: next }))
            }
          />
        </label>
      ))}
      <div>
        <button
          className="chat-form__submit"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Ejecutando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
