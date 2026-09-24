import { joinBaseUrlAndPath } from "../adminHelpers";

/**
 * Vista previa de la petición HTTP del paso de acción.
 * Normaliza el path con barra inicial solo en la preview (no muta el draft).
 */
export function UrlPreview({ method, baseUrl, path, authLabel, contentType }) {
  const composedUrl = joinBaseUrlAndPath(baseUrl, path);
  const methodLabel = String(method || "").toUpperCase() || "—";

  return (
    <aside className="url-preview" aria-label="Vista previa de la petición">
      <div className="url-preview__row">
        <span className="url-preview__method">{methodLabel}</span>
        <code className="url-preview__url">{composedUrl}</code>
      </div>
      {authLabel ? <p className="url-preview__meta">{authLabel}</p> : null}
      {contentType ? (
        <p className="url-preview__meta">Content-Type: {contentType}</p>
      ) : null}
    </aside>
  );
}
