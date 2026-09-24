export function FieldRow({ label, htmlFor, hint, error, children }) {
  return (
    <div className="ca-field-row">
      <label className="ca-field-row__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="ca-field-row__control">{children}</div>
      {hint ? <p className="ca-field-row__hint">{hint}</p> : null}
      {error ? (
        <p className="ca-field-row__error" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}
