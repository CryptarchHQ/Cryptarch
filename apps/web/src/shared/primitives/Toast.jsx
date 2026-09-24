export function Toast({ message, href, linkLabel = "Ver", onDismiss }) {
  return (
    <div className="ca-toast" role="status">
      <span className="ca-toast__message">{message}</span>
      {href ? (
        <a className="ca-toast__link" href={href}>
          {linkLabel}
        </a>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="ca-toast__dismiss"
          aria-label="Cerrar"
          onClick={onDismiss}
        >
          Cerrar
        </button>
      ) : null}
    </div>
  );
}
