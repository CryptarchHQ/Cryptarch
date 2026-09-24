import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, Drawer, FieldRow, ListPage, Toast } from "./index";

describe("primitives", () => {
  it("FieldRow muestra el error en un elemento aria-live polite", () => {
    render(
      <FieldRow label="Nombre" htmlFor="nombre" error="Campo obligatorio">
        <input id="nombre" />
      </FieldRow>,
    );

    const live = screen.getByText("Campo obligatorio");
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("Drawer con dirty=false: Escape llama onClose", () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Editar" onClose={onClose} dirty={false}>
        Contenido
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Drawer con dirty=true: Escape no cierra hasta confirmar", () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Editar" onClose={onClose} dirty>
        Contenido
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText("Si cierras, se pierden los cambios sin guardar."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ListPage refleja loading, empty, error y ready", () => {
    const { rerender } = render(
      <ListPage
        title="Items"
        searchValue=""
        onSearchChange={() => {}}
        status="loading"
      />,
    );
    expect(screen.getByText("Cargando...")).toBeInTheDocument();

    rerender(
      <ListPage
        title="Items"
        searchValue=""
        onSearchChange={() => {}}
        status="empty"
        emptyTitle="Sin resultados"
        emptyDescription="Prueba otra búsqueda"
      />,
    );
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();

    rerender(
      <ListPage
        title="Items"
        searchValue=""
        onSearchChange={() => {}}
        status="error"
        errorMessage="No se pudo cargar"
      />,
    );
    expect(screen.getByText("No se pudo cargar")).toBeInTheDocument();

    rerender(
      <ListPage
        title="Items"
        searchValue=""
        onSearchChange={() => {}}
        status="ready"
      >
        <table>
          <tbody>
            <tr>
              <td>fila-ok</td>
            </tr>
          </tbody>
        </table>
      </ListPage>,
    );
    expect(screen.getByText("fila-ok")).toBeInTheDocument();
  });

  it("Toast muestra el mensaje y un enlace con el href", () => {
    render(
      <Toast
        message="Creado correctamente"
        href="/admin/items/1"
        linkLabel="Ver"
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("Creado correctamente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver" })).toHaveAttribute(
      "href",
      "/admin/items/1",
    );
  });

  it("ConfirmDialog muestra consequence y confirma con onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Eliminar elemento"
        consequence="Esta acción no se puede deshacer."
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    expect(
      screen.getByText("Esta acción no se puede deshacer."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
