import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProcessMapFileActions from "../ProcessMapFileActions";

const newFile = () => new File(["mapa sintético"], "mapa-nuevo.pdf", { type: "application/pdf" });
const props = () => ({
  mapUrl: "/mapa-actual.png", fileName: "mapa-actual.png", readOnly: false,
  loading: false, loadError: false, pending: false, visible: false,
  onView: vi.fn(), onUpload: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined), onRetry: vi.fn(),
});
const select = (file = newFile()) => fireEvent.change(screen.getByLabelText("Seleccionar archivo del mapa"), { target: { files: [file] } });

beforeEach(cleanup);
describe("Acciones protegidas del documento del mapa", () => {
  it("sitúa consultas antes de las acciones de modificación", () => {
    render(<ProcessMapFileActions {...props()} />);
    const view = screen.getByRole("button", { name: "Ver Mapa" });
    const replace = screen.getByRole("button", { name: "Reemplazar Mapa" });
    expect(view.compareDocumentPosition(replace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(replace.closest('[aria-label="Modificar archivo del mapa"]')?.className).toContain("ml-auto");
  });
  it("seleccionar un nuevo archivo no realiza el reemplazo", () => {
    const p = props(); render(<ProcessMapFileActions {...p} />); select();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/mapa-nuevo.pdf/)).toBeTruthy();
    expect(p.onUpload).not.toHaveBeenCalled();
    expect(p.onDelete).not.toHaveBeenCalled();
  });
  it("cancelar no sube ni elimina y permite volver a seleccionar", async () => {
    const p = props(); render(<ProcessMapFileActions {...p} />); select();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(p.onUpload).not.toHaveBeenCalled(); expect(p.onDelete).not.toHaveBeenCalled();
    select(); expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
  it("confirmar reemplaza exactamente el archivo elegido sin pedir eliminación separada", async () => {
    const p = props(); const file = newFile(); render(<ProcessMapFileActions {...p} />); select(file);
    fireEvent.click(screen.getByRole("button", { name: "Sí, reemplazar" }));
    await waitFor(() => expect(p.onUpload).toHaveBeenCalledOnce());
    expect(p.onUpload).toHaveBeenCalledWith(file);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(p.onDelete).not.toHaveBeenCalled();
  });
  it("si falla el reemplazo conserva mapa actual y confirmación para reintentar", async () => {
    const p = props(); p.onUpload.mockRejectedValue(new Error("Subida fallida"));
    render(<ProcessMapFileActions {...p} />); select();
    fireEvent.click(screen.getByRole("button", { name: "Sí, reemplazar" }));
    await waitFor(() => expect(p.onUpload).toHaveBeenCalledOnce());
    expect(screen.getByText("Mapa cargado")).toBeTruthy(); expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(p.onDelete).not.toHaveBeenCalled();
  });
  it("eliminar exige confirmación y cancelar conserva el documento", async () => {
    const p = props(); render(<ProcessMapFileActions {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Mapa" }));
    expect(p.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(p.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Mapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar mapa" }));
    await waitFor(() => expect(p.onDelete).toHaveBeenCalledOnce());
  });
  it("la primera subida no exige reemplazar un mapa inexistente", async () => {
    const p = props(); const file = newFile(); render(<ProcessMapFileActions {...p} mapUrl={null} fileName={null} />);
    expect(screen.getByRole("button", { name: "Subir Mapa" })).toBeTruthy(); select(file);
    await waitFor(() => expect(p.onUpload).toHaveBeenCalledOnce());
    expect(p.onUpload).toHaveBeenCalledWith(file);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("un jefe de proceso solo tiene acciones de consulta", () => {
    render(<ProcessMapFileActions {...props()} readOnly />);
    expect(screen.getByRole("button", { name: "Ver Mapa" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reemplazar Mapa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar Mapa" })).toBeNull();
    expect(screen.queryByLabelText("Seleccionar archivo del mapa")).toBeNull();
  });
  it("error de consulta se informa, permite reintentar y bloquea cambios", () => {
    const p = props(); render(<ProcessMapFileActions {...p} loadError />);
    expect(screen.getByRole("alert").textContent).toContain("no significa que haya sido eliminado");
    expect((screen.getByRole("button", { name: "Reemplazar Mapa" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Eliminar Mapa" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); expect(p.onRetry).toHaveBeenCalledOnce();
  });
  it("bloquea modificaciones durante la carga inicial", () => {
    render(<ProcessMapFileActions {...props()} loading />);
    expect((screen.getByRole("button", { name: "Reemplazar Mapa" }) as HTMLButtonElement).disabled).toBe(true);
    select(); expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("impide envíos duplicados y cancelar mientras la subida está en curso", async () => {
    const p = props(); let finish!: () => void;
    p.onUpload.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<ProcessMapFileActions {...p} />); select();
    const confirm = screen.getByRole("button", { name: "Sí, reemplazar" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(p.onUpload).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
