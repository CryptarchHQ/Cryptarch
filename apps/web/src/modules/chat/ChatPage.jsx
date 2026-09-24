import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { api } from "../../shared/apiClient";
import { ApiErrorBanner, LoadingBlock } from "../../shared/ui";
import { ProfileMenu } from "../admin/ProfileMenu";
import { ActionExecutionResult } from "./ActionExecutionResult";
import { AllowedActionsList } from "./AllowedActionsList";
import {
  buildInitialPayload,
  buildExecutePayload,
  DynamicActionForm,
} from "./DynamicActionForm";
import "./chatPage.css";

const SLOW_LOAD_MS = 8000;
const EMPTY_ACTIONS_MESSAGE =
  "Tu espacio aún no tiene acciones disponibles. Habla con tu administrador.";
const SLOW_LOAD_MESSAGE = "Esto está tardando más de lo normal";

export function ChatPage() {
  const [actions, setActions] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);
  const [payload, setPayload] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const loadActions = useCallback(async () => {
    setLoadingList(true);
    setSlowLoad(false);
    setError(null);
    try {
      const data = await api.get("/actions");
      setActions(Array.isArray(data) ? data : []);
    } catch (nextError) {
      setError(nextError);
      setActions([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  useEffect(() => {
    if (!loadingList) {
      setSlowLoad(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setSlowLoad(true);
    }, SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [loadingList]);

  function selectAction(action) {
    setSelectedAction(action);
    setResult(null);
    setError(null);
    const { defaults } = buildInitialPayload(action?.input_schema_json);
    setPayload(defaults);
  }

  async function executeAction() {
    if (!selectedAction?.id) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const payloadObject = buildExecutePayload(
        selectedAction.input_schema_json,
        payload,
      );
      const execution = await api.post(
        `/actions/${selectedAction.id}/execute`,
        { payload: payloadObject },
      );
      setResult(execution);
    } catch (nextError) {
      const st = nextError?.status;
      if (st === 404 || st === 501) {
        setError({
          status: st,
          message:
            "La ejecución de acciones aún no está disponible. Disponible próximamente (task-08g-bis).",
        });
      } else {
        setError(nextError);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const showEmpty = !loadingList && !error && actions.length === 0;
  const showList = !loadingList && !error && actions.length > 0;

  return (
    <div className="content chat-page">
      <section className="chat-page__panel">
        <div className="chat-page__header">
          <div>
            <h1 className="chat-page__title">Asistente</h1>
            <p className="chat-page__lead">
              Elige una acción para rellenar el formulario y ejecutarla.
            </p>
          </div>
          <div className="chat-page__header-actions">
            {isAdmin ? (
              <button
                type="button"
                className="chat-page__admin-link"
                onClick={() => navigate("/admin/users")}
              >
                Ir a admin
              </button>
            ) : null}
            <ProfileMenu />
          </div>
        </div>
        <ApiErrorBanner error={error} />
      </section>

      {loadingList ? (
        <section className="chat-page__panel">
          {slowLoad ? (
            <div className="chat-page__slow">
              <p className="chat-page__empty">{SLOW_LOAD_MESSAGE}</p>
              <button
                type="button"
                className="chat-page__retry"
                onClick={() => loadActions()}
              >
                Reintentar
              </button>
            </div>
          ) : (
            <LoadingBlock label="Cargando acciones…" />
          )}
        </section>
      ) : null}

      {showEmpty ? (
        <section className="chat-page__panel">
          <p className="chat-page__empty">{EMPTY_ACTIONS_MESSAGE}</p>
        </section>
      ) : null}

      {showList ? (
        <div className="chat-page__workspace">
          <section className="chat-page__panel">
            <h2 className="chat-page__panel-title">Acciones</h2>
            <AllowedActionsList
              actions={actions}
              selectedId={selectedAction?.id}
              onSelect={selectAction}
            />
          </section>

          <section className="chat-page__panel">
            {selectedAction ? (
              <>
                <h2 className="chat-page__panel-title">
                  {selectedAction.name?.trim() || "Acción sin nombre"}
                </h2>
                <DynamicActionForm
                  schemaJson={selectedAction.input_schema_json}
                  schemaVersion={selectedAction.input_schema_version}
                  payload={payload}
                  onPayloadChange={setPayload}
                  onSubmit={executeAction}
                  submitting={submitting}
                  submitLabel="Ejecutar"
                />
                <ActionExecutionResult result={result} />
              </>
            ) : (
              <p className="chat-page__empty">
                Pulsa una acción para ver el formulario y ejecutarla.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
