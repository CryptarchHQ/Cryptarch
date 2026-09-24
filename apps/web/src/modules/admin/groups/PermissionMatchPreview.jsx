import { useEffect, useState } from "react";
import { api } from "../../../shared/apiClient";

const COUNT_LABELS = {
  user: (n) => `Coincide con ${n} usuarios`,
  action: (n) => `Coincide con ${n} acciones`,
  document: (n) => `Coincide con ${n} documentos`,
};

const EMPTY_MESSAGE = "Sin etiquetas no se concede nada en este paso";

/**
 * Conteo en vivo vía POST /admin/filters/preview.
 * Sin etiquetas no llama al API (un filtro vacío en el API cuenta todo el tenant;
 * en un grupo, no poner filtro no concede ese tipo).
 */
export function PermissionMatchPreview({
  targetType,
  tagIds,
  apiClient = api,
}) {
  const ids = Array.isArray(tagIds) ? tagIds : [];
  const idsKey = ids.join("|");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const requestIds = idsKey ? idsKey.split("|") : [];
    if (requestIds.length === 0) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await apiClient.post("/admin/filters/preview", {
          target_type: targetType,
          tag_ids: requestIds,
        });
        if (!cancelled) {
          setPreview(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(err?.message || "No se pudo obtener el conteo");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiClient, targetType, idsKey]);

  if (ids.length === 0) {
    return (
      <p className="permission-match-preview permission-match-preview--empty">
        {EMPTY_MESSAGE}
      </p>
    );
  }

  if (loading && !preview) {
    return (
      <p className="permission-match-preview permission-match-preview--loading">
        Calculando coincidencias…
      </p>
    );
  }

  if (error) {
    return (
      <p
        className="permission-match-preview permission-match-preview--error"
        role="alert"
      >
        {error}
      </p>
    );
  }

  if (!preview) return null;

  const countLabel = (COUNT_LABELS[targetType] || COUNT_LABELS.user)(
    preview.count ?? 0,
  );
  const sample = Array.isArray(preview.sample)
    ? preview.sample.slice(0, 5)
    : [];

  return (
    <div className="permission-match-preview">
      <p className="permission-match-preview__count">{countLabel}</p>
      {sample.length > 0 ? (
        <ul className="permission-match-preview__sample">
          {sample.map((item, index) => (
            <li key={`sample-${index}-${item?.label ?? ""}`}>
              {item?.label ?? ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
