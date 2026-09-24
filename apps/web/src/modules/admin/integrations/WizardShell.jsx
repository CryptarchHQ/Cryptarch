import { useCallback, useEffect, useRef, useState } from "react";
import "./wizardShell.css";

function normalizeDraft(draft) {
  return {
    service: draft?.service ?? {},
    action: draft?.action ?? {},
    fields: draft?.fields ?? {},
  };
}

export function WizardShell({
  steps,
  initialStep = 0,
  draft: draftProp,
  onDraftChange,
  isStepValid,
  onCancel,
  onComplete,
  renderStep,
}) {
  const draft = normalizeDraft(draftProp);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [maxReached, setMaxReached] = useState(initialStep);
  const [reducedMotion, setReducedMotion] = useState(null);
  const headingRef = useRef(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    return undefined;
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  const setSlice = useCallback(
    (sliceName, partial) => {
      const next = {
        ...draft,
        [sliceName]: { ...draft[sliceName], ...partial },
      };
      onDraftChange?.(next);
    },
    [draft, onDraftChange],
  );

  const stepValid =
    typeof isStepValid === "function" ? isStepValid(currentStep, draft) : true;
  const isLast = currentStep >= steps.length - 1;
  const currentLabel = steps[currentStep]?.label ?? "";

  const serviceName = draft.service?.name;
  const actionName = draft.action?.name;
  const fieldKeyCount = Object.keys(draft.fields).length;
  const hasSummary = Boolean(serviceName || actionName || fieldKeyCount > 0);

  function goTo(index) {
    if (index < 0 || index > maxReached) return;
    setCurrentStep(index);
  }

  function handleContinue() {
    if (!stepValid) return;
    if (isLast) {
      onComplete?.(draft);
      return;
    }
    const next = currentStep + 1;
    setCurrentStep(next);
    setMaxReached((prev) => Math.max(prev, next));
  }

  function handleBack() {
    if (currentStep === 0) return;
    setCurrentStep(currentStep - 1);
  }

  const rootProps = { className: "wizard-shell" };
  if (reducedMotion === true) {
    rootProps["data-reduced-motion"] = "true";
  }

  return (
    <div {...rootProps}>
      <nav className="wizard-shell__rail" aria-label="Pasos">
        <ol className="wizard-shell__rail-list">
          {steps.map((step, index) => {
            const isCurrent = index === currentStep;
            const reachable = index <= maxReached;
            return (
              <li key={step.id} className="wizard-shell__rail-item">
                <button
                  type="button"
                  className={`wizard-shell__rail-btn${isCurrent ? " is-current" : ""}`}
                  aria-current={isCurrent ? "step" : undefined}
                  disabled={!reachable}
                  onClick={() => goTo(index)}
                >
                  {step.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="wizard-shell__body">
        <div className="wizard-shell__panel">
          <h2 ref={headingRef} tabIndex={-1} className="wizard-shell__heading">
            {currentLabel}
          </h2>
          <div className="wizard-shell__step">
            {renderStep?.(currentStep, { draft, setSlice })}
          </div>
        </div>

        <aside className="wizard-shell__summary" aria-label="Resumen">
          <h3 className="wizard-shell__summary-title">Resumen</h3>
          {hasSummary ? (
            <ul className="wizard-shell__summary-list">
              {serviceName ? (
                <li>
                  Servicio: <strong>{serviceName}</strong>
                </li>
              ) : null}
              {actionName ? (
                <li>
                  Acción: <strong>{actionName}</strong>
                </li>
              ) : null}
              {fieldKeyCount > 0 ? (
                <li>
                  Campos: <strong>{fieldKeyCount}</strong>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="wizard-shell__summary-empty">Aún no hay resumen</p>
          )}
        </aside>
      </div>

      <footer className="wizard-shell__footer">
        <button
          type="button"
          className="wizard-shell__btn wizard-shell__btn--ghost"
          onClick={() => onCancel?.()}
        >
          Cancelar
        </button>
        <div className="wizard-shell__footer-nav">
          <button
            type="button"
            className="wizard-shell__btn wizard-shell__btn--ghost"
            disabled={currentStep === 0}
            onClick={handleBack}
          >
            Atrás
          </button>
          <button
            type="button"
            className="wizard-shell__btn wizard-shell__btn--primary"
            disabled={!stepValid}
            onClick={handleContinue}
          >
            Continuar
          </button>
        </div>
      </footer>
    </div>
  );
}
