export function AuthMethodCard({
  title,
  when,
  where,
  selected,
  onSelect,
  children,
}) {
  return (
    <div
      className={
        selected
          ? "auth-method-card auth-method-card--selected"
          : "auth-method-card"
      }
      data-selected={selected ? "true" : "false"}
    >
      <button
        type="button"
        className="auth-method-card__select"
        aria-pressed={selected}
        onClick={onSelect}
      >
        {title}
      </button>
      <dl className="auth-method-card__meta">
        <div>
          <dt>Cuándo usarlo</dt>
          <dd>{when}</dd>
        </div>
        <div>
          <dt>Dónde lo encuentro</dt>
          <dd>{where}</dd>
        </div>
      </dl>
      <p className="auth-method-card__secret-hint">
        El secreto es el nombre de una variable de entorno del servidor, nunca
        el valor.
      </p>
      {selected && children ? (
        <div className="auth-method-card__fields">{children}</div>
      ) : null}
    </div>
  );
}
