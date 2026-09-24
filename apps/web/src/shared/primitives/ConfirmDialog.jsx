export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="ca-confirm-dialog__backdrop">
      <div
        className="ca-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ca-confirm-dialog-title"
      >
        <h2 id="ca-confirm-dialog-title" className="ca-confirm-dialog__title">
          {title}
        </h2>
        <p className="ca-confirm-dialog__consequence">{consequence}</p>
        <div className="ca-confirm-dialog__actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
