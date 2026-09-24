import "./oauthReviewStep.css";

function ReviewRow({ label, value }) {
  if (value == null || String(value).trim() === "") return null;
  return (
    <div className="oauth-review-step__row">
      <dt className="oauth-review-step__label">{label}</dt>
      <dd className="oauth-review-step__value">{value}</dd>
    </div>
  );
}

/**
 * Paso de solo lectura: resume la configuración OAuth2 sin secretos.
 */
export function OAuthReviewStep({ authConfig }) {
  const auth =
    authConfig && typeof authConfig === "object" && !Array.isArray(authConfig)
      ? authConfig
      : {};

  const clientId = auth.client_id != null ? String(auth.client_id) : "";
  const secretEnv =
    auth.client_secret_env != null ? String(auth.client_secret_env) : "";
  const tokenUrl = auth.token_url != null ? String(auth.token_url) : "";
  const scope = auth.scope != null ? String(auth.scope) : "";

  return (
    <div className="oauth-review-step">
      <p className="oauth-review-step__intro">
        Revisa los datos de acceso OAuth2 antes de probar la conexión. El
        secreto no se muestra: solo el nombre de la variable donde está
        guardado.
      </p>
      <dl className="oauth-review-step__list">
        <ReviewRow label="Client ID" value={clientId} />
        <ReviewRow
          label="Secreto"
          value={
            secretEnv.trim()
              ? `Secreto guardado en la variable ${secretEnv.trim()}`
              : ""
          }
        />
        <ReviewRow label="Token URL" value={tokenUrl} />
        <ReviewRow label="Scope" value={scope} />
      </dl>
    </div>
  );
}
