import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeyValueListEditor } from "./KeyValueListEditor";
import { TagPicker } from "./TagPicker";

describe("TagPicker", () => {
  const options = [
    { id: "t1", name: "Alpha" },
    { id: "t2", name: "Beta" },
    { id: "t3", name: "Gamma" },
  ];

  it("quitar una tag seleccionada llama onChange sin ese id", () => {
    const onChange = vi.fn();
    render(
      <TagPicker options={options} value={["t1", "t2"]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Quitar Alpha" }));
    expect(onChange).toHaveBeenCalledWith(["t2"]);
  });

  it("pulsar una tag disponible la añade vía onChange", () => {
    const onChange = vi.fn();
    render(<TagPicker options={options} value={["t1"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Añadir Beta" }));
    expect(onChange).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("Enter crea un tag nuevo y llama onChange con el id creado", async () => {
    const onChange = vi.fn();
    const onCreateTag = vi.fn().mockResolvedValue({ id: "t4", name: "Delta" });
    render(
      <TagPicker
        options={options}
        value={["t1"]}
        onChange={onChange}
        onCreateTag={onCreateTag}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Nueva etiqueta" });
    fireEvent.change(input, { target: { value: "Delta" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onCreateTag).toHaveBeenCalledWith("Delta");
      expect(onChange).toHaveBeenCalledWith(["t1", "t4"]);
    });
  });
});

describe("KeyValueListEditor", () => {
  it("cambiar la clave de una fila llama onChange con el valor nuevo", () => {
    const onChange = vi.fn();
    render(
      <KeyValueListEditor
        label="Headers"
        rows={[{ key: "Authorization", value: "Bearer" }]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Clave"), {
      target: { value: "X-Api-Key" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { key: "X-Api-Key", value: "Bearer" },
    ]);
  });

  it('"Añadir fila" añade una fila vacía', () => {
    const onChange = vi.fn();
    render(
      <KeyValueListEditor
        label="Headers"
        rows={[{ key: "a", value: "1" }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Añadir fila" }));
    expect(onChange).toHaveBeenCalledWith([
      { key: "a", value: "1" },
      { key: "", value: "" },
    ]);
  });
});
