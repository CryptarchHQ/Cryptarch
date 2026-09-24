import { useEffect, useId, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

const DIRTY_CONSEQUENCE = "Si cierras, se pierden los cambios sin guardar.";

export function Drawer({ open, title, children, onClose, dirty = false }) {
  const titleId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmOpen(false);
      setEntered(false);
      return undefined;
    }

    // Monta fuera (translateX 100%) y entra en el siguiente paint.
    setEntered(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (dirty) {
        setConfirmOpen(true);
        return;
      }
      onClose?.();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, dirty, onClose]);

  if (!open) return null;

  return (
    <div className="ca-drawer__backdrop">
      <aside
        className={`ca-drawer${entered ? " ca-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="ca-drawer__header">
          <h2 id={titleId} className="ca-drawer__title">
            {title}
          </h2>
          <button
            type="button"
            className="ca-drawer__close"
            aria-label="Cerrar"
            onClick={() => {
              if (dirty) {
                setConfirmOpen(true);
                return;
              }
              onClose?.();
            }}
          >
            Cerrar
          </button>
        </header>
        <div className="ca-drawer__body">{children}</div>
      </aside>
      <ConfirmDialog
        open={confirmOpen}
        title="Descartar cambios"
        consequence={DIRTY_CONSEQUENCE}
        confirmLabel="Descartar"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setConfirmOpen(false);
          onClose?.();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
