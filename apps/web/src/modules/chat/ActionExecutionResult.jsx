import { toJsonText } from "../admin/adminHelpers";

function isStructuredResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    Object.prototype.hasOwnProperty.call(value, "status") ||
    Object.prototype.hasOwnProperty.call(value, "message") ||
    Object.prototype.hasOwnProperty.call(value, "data")
  );
}

export function ActionExecutionResult({ result }) {
  if (result === null || result === undefined) return null;

  const structured = isStructuredResult(result);
  const jsonText = toJsonText(result);

  return (
    <div className="chat-result">
      <h3 className="chat-result__title">Resultado</h3>

      {structured ? (
        <>
          {Object.prototype.hasOwnProperty.call(result, "status") ? (
            <div className="chat-result__row">
              <span className="chat-result__label">Estado</span>
              <span className="chat-result__value">
                {String(result.status)}
              </span>
            </div>
          ) : null}
          {Object.prototype.hasOwnProperty.call(result, "message") ? (
            <div className="chat-result__row">
              <span className="chat-result__label">Mensaje</span>
              <span className="chat-result__value">
                {String(result.message)}
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="chat-result__row">
          <span className="chat-result__label">Mensaje</span>
          <span className="chat-result__value">
            {typeof result === "string" ? result : "Ejecución completada"}
          </span>
        </div>
      )}

      <details className="chat-result__details">
        <summary className="chat-result__summary">Ver detalle técnico</summary>
        <pre className="chat-result__json">{jsonText}</pre>
      </details>
    </div>
  );
}
