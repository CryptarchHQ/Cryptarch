import { useCallback, useMemo, useRef, useState } from "react";

export function TagPicker({ options, value, onChange, onCreateTag }) {
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const selected = useMemo(() => new Set(value || []), [value]);
  const normalizedOptions = useMemo(() => options || [], [options]);

  const handleAddExisting = useCallback(
    (tagId) => {
      if (selected.has(tagId)) return;
      onChange([...(value || []), tagId]);
    },
    [value, onChange, selected],
  );

  const handleCreate = useCallback(async () => {
    const nextName = draftName.trim();
    if (!nextName || !onCreateTag) return;
    const existing = normalizedOptions.find(
      (t) =>
        String(t.name || t.id || "").toLowerCase() === nextName.toLowerCase(),
    );
    if (existing) {
      handleAddExisting(existing.id ?? existing.name);
      setDraftName("");
      return;
    }
    setCreating(true);
    try {
      const created = await onCreateTag(nextName);
      const nextId = created?.id ?? created?.name ?? nextName;
      if (!selected.has(nextId)) onChange([...(value || []), nextId]);
      setDraftName("");
    } finally {
      setCreating(false);
    }
  }, [
    draftName,
    onCreateTag,
    normalizedOptions,
    handleAddExisting,
    selected,
    value,
    onChange,
  ]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && draftName.trim()) {
      event.preventDefault();
      handleCreate();
    }
  };

  const availableTags = normalizedOptions.filter((tag) => {
    const tagValue = tag.id ?? tag.name;
    return !selected.has(tagValue);
  });

  const selectedTags = normalizedOptions.filter((tag) =>
    selected.has(tag.id ?? tag.name),
  );

  const hasAnyChips = selectedTags.length > 0 || availableTags.length > 0;

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const handlePickerClick = (event) => {
    if (event.target.closest(".badge, .badge-remove, .tag-picker-input")) {
      return;
    }
    focusInput();
  };

  return (
    <div
      className={`tag-picker${focused ? " focused" : ""}`}
      role="group"
      aria-label="Seleccionar o crear tags"
      onClick={handlePickerClick}
    >
      <div className="tag-picker-chips">
        {selectedTags.map((tag) => {
          const tagValue = tag.id ?? tag.name;
          return (
            <span key={tagValue} className="badge badge-selected">
              {tag.name || tagValue}
              <button
                type="button"
                className="badge-remove"
                onClick={() =>
                  onChange((value || []).filter((id) => id !== tagValue))
                }
                aria-label={`Quitar ${tag.name || tagValue}`}
              >
                ×
              </button>
            </span>
          );
        })}
        {availableTags.slice(0, 12).map((tag) => {
          const tagValue = tag.id ?? tag.name;
          return (
            <button
              key={tagValue}
              type="button"
              className="badge badge-available"
              onClick={() => handleAddExisting(tagValue)}
              aria-label={`Añadir ${tag.name || tagValue}`}
            >
              + {tag.name || tagValue}
            </button>
          );
        })}
        {onCreateTag ? (
          <input
            ref={inputRef}
            className="tag-picker-input"
            value={draftName}
            placeholder={hasAnyChips ? "" : "Nueva etiqueta"}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={creating}
            aria-label="Nueva etiqueta"
          />
        ) : null}
      </div>
    </div>
  );
}
