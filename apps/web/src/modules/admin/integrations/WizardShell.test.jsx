import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WizardShell } from "./WizardShell";

const STEPS = [
  { id: "service", label: "Servicio" },
  { id: "action", label: "Acción" },
  { id: "fields", label: "Campos" },
];

function renderWizard(overrides = {}) {
  const props = {
    steps: STEPS,
    draft: { service: {}, action: {}, fields: {} },
    onDraftChange: vi.fn(),
    onCancel: vi.fn(),
    onComplete: vi.fn(),
    isStepValid: () => true,
    renderStep: (stepIndex) => <div>Paso {stepIndex}</div>,
    ...overrides,
  };
  return { ...render(<WizardShell {...props} />), props };
}

describe("WizardShell", () => {
  it("Continuar desde el paso 0 avanza al paso 1 y el rail lo marca", () => {
    renderWizard();

    expect(screen.getByRole("button", { name: "Servicio" })).toHaveAttribute(
      "aria-current",
      "step",
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByRole("button", { name: "Acción" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.getByRole("button", { name: "Servicio" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("Atrás vuelve al paso anterior", () => {
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("button", { name: "Acción" })).toHaveAttribute(
      "aria-current",
      "step",
    );

    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(screen.getByRole("button", { name: "Servicio" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("Continuar disabled si isStepValid es false y no cambia de paso", () => {
    renderWizard({ isStepValid: () => false });

    const continueBtn = screen.getByRole("button", { name: "Continuar" });
    expect(continueBtn).toBeDisabled();

    fireEvent.click(continueBtn);

    expect(screen.getByRole("button", { name: "Servicio" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("con matchMedia matches true la raíz tiene data-reduced-motion", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = renderWizard();
    const root = container.querySelector(".wizard-shell");
    expect(root).toHaveAttribute("data-reduced-motion", "true");

    window.matchMedia = original;
  });

  it("setSlice fusiona el corte y conserva el resto del draft", () => {
    const onDraftChange = vi.fn();
    const draft = {
      service: { kind: "http" },
      action: { name: "Create" },
      fields: { email: "a@b.c" },
    };

    renderWizard({
      draft,
      onDraftChange,
      renderStep: (_stepIndex, { setSlice }) => (
        <button
          type="button"
          onClick={() => setSlice("service", { name: "HubSpot" })}
        >
          Set service
        </button>
      ),
    });

    fireEvent.click(screen.getByRole("button", { name: "Set service" }));

    expect(onDraftChange).toHaveBeenCalledTimes(1);
    const next = onDraftChange.mock.calls[0][0];
    expect(next.service.name).toBe("HubSpot");
    expect(next.service.kind).toBe("http");
    expect(next.action).toEqual({ name: "Create" });
    expect(next.fields).toEqual({ email: "a@b.c" });
  });
});
