import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FieldsStep,
  buildInputSchema,
  deriveTechnicalName,
  hasDuplicateTechnicalNames,
} from "./FieldsStep";

vi.mock("../../chat/DynamicActionForm", () => ({
  DynamicActionForm: ({ onSubmit }) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <button type="submit">Ejecutar</button>
    </form>
  ),
}));

vi.mock("../TagPicker", () => ({
  TagPicker: () => <div data-testid="tag-picker" />,
}));

function StatefulFields({ initial = { items: [], tagIds: [] } }) {
  const [value, setValue] = useState(initial);
  return <FieldsStep value={value} onChange={setValue} tagOptions={[]} />;
}

describe("buildInputSchema", () => {
  it("deriva name de la etiqueta, description = label, type number y required", () => {
    const label = "Buscar cliente";
    const name = deriveTechnicalName(label);
    expect(name).toBe("buscar_cliente");

    const schema = buildInputSchema([
      { label, name, type: "number", required: true },
    ]);

    expect(schema).toEqual({
      type: "object",
      properties: {
        buscar_cliente: { type: "number", description: "Buscar cliente" },
      },
      required: ["buscar_cliente"],
    });
  });

  it("ignora filas sin etiqueta", () => {
    const schema = buildInputSchema([
      { label: "", name: "x", type: "string", required: true },
      { label: "OK", name: "ok", type: "string", required: false },
    ]);
    expect(Object.keys(schema.properties)).toEqual(["ok"]);
    expect(schema.required).toEqual([]);
  });

  it("si name vacío deriva del label", () => {
    const schema = buildInputSchema([
      { label: "Buscar cliente", type: "number", required: true },
    ]);
    expect(schema.properties.buscar_cliente).toEqual({
      type: "number",
      description: "Buscar cliente",
    });
    expect(schema.required).toEqual(["buscar_cliente"]);
  });
});

describe("hasDuplicateTechnicalNames", () => {
  it("detecta nombres técnicos duplicados", () => {
    expect(
      hasDuplicateTechnicalNames([
        { label: "A", name: "mismo", type: "string" },
        { label: "B", name: "mismo", type: "string" },
      ]),
    ).toBe(true);
    expect(
      hasDuplicateTechnicalNames([
        { label: "A", name: "uno", type: "string" },
        { label: "B", name: "dos", type: "string" },
      ]),
    ).toBe(false);
  });
});

describe("FieldsStep", () => {
  it("dos filas con el mismo nombre técnico muestran el error", () => {
    render(
      <StatefulFields
        initial={{
          items: [
            {
              label: "Uno",
              name: "duplicado",
              type: "string",
              required: false,
            },
            {
              label: "Dos",
              name: "duplicado",
              type: "string",
              required: false,
            },
          ],
          tagIds: [],
        }}
      />,
    );

    const errors = screen.getAllByText("Nombre técnico duplicado");
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("sin campos muestra «Esta acción no pedirá datos»", () => {
    render(<StatefulFields />);
    expect(screen.getByText("Esta acción no pedirá datos")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ejecutar" }),
    ).toBeInTheDocument();
  });

  it("al escribir etiqueta deriva el nombre técnico", () => {
    const { container } = render(<StatefulFields />);
    fireEvent.click(screen.getByRole("button", { name: "Añadir campo" }));
    fireEvent.change(screen.getByLabelText("Etiqueta"), {
      target: { value: "Buscar cliente" },
    });
    const details = container.querySelector(".fields-step__tech");
    expect(details).toBeTruthy();
    details.open = true;
    fireEvent(details, new Event("toggle", { bubbles: true }));
    expect(container.querySelector("#fields-step-name-0")).toHaveValue(
      "buscar_cliente",
    );
  });
});
