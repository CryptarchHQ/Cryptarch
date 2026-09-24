function formatActionMeta(action) {
  const method =
    typeof action?.method === "string"
      ? action.method.trim().toUpperCase()
      : "";
  const pathStr = typeof action?.path === "string" ? action.path.trim() : "";
  if (!method && !pathStr) return null;
  return [method, pathStr].filter(Boolean).join(" ");
}

function schemaDescription(action) {
  const desc =
    typeof action?.input_schema_json?.description === "string"
      ? action.input_schema_json.description.trim()
      : "";
  return desc || null;
}

export function AllowedActionsList({ actions, selectedId, onSelect }) {
  return (
    <div className="chat-actions" role="list">
      {actions.map((action) => {
        const id = action.id;
        const selected = id === selectedId;
        const meta = formatActionMeta(action);
        const description = schemaDescription(action);
        const name = action.name?.trim() || "Acción sin nombre";
        return (
          <div key={id} role="listitem">
            <button
              type="button"
              className={`chat-actions__card${selected ? " chat-actions__card--selected" : ""}`}
              onClick={() => onSelect(action)}
              aria-pressed={selected}
              aria-label={name}
            >
              <span className="chat-actions__name">{name}</span>
              {meta ? <span className="chat-actions__meta">{meta}</span> : null}
              {description ? (
                <span className="chat-actions__desc">{description}</span>
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}
