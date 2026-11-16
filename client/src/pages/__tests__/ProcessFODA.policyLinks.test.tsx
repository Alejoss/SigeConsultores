import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessFODA from "../ProcessFODA";

const mocks = vi.hoisted(() => ({ data: null as any, isFetching: false, objectives: [] as any[], get: vi.fn(), list: vi.fn(),
  save: vi.fn(), navigate: vi.fn(), error: vi.fn(),
  cache: { processFODA: { get: { invalidate: vi.fn() } } },
  subprocessMap: { subprocesos: JSON.stringify([{ subproceso: "Finanzas" }]) } }));
vi.mock("wouter", () => ({ useLocation: () => ["/process-foda", mocks.navigate] }));
vi.mock("@/lib/sessionScope", () => ({ getProcessIdFromSession: () => 21 }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => mocks.cache,
  processFODA: {
    get: { useQuery: (...args: any[]) => {
      mocks.get(...args);
      return { data: mocks.data, isLoading: mocks.data === undefined, isFetching: mocks.isFetching };
    } },
    listPolicyObjectives: { useQuery: (...args: any[]) => { mocks.list(...args); return { data: mocks.objectives }; } },
    upsert: { useMutation: () => ({ mutateAsync: mocks.save }) },
  },
  subprocessMap: { get: { useQuery: () => ({ data: mocks.subprocessMap }) } },
} }));
vi.mock("@/components/ActivePlanningCycleBadge", () => ({ ActivePlanningCycleBadge: () => null }));
vi.mock("@/lib/exportFODAToPDF", () => ({ exportFODAToPDF: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));

const historic = { id: 1, fodaElementId: "historical", policyObjectiveId: 999,
  policyObjective: "Objetivo anterior", selectedObjectiveContent: "Objetivo anterior\n\nDescripción original",
  policyObjectiveDescription: "Descripción original", statement: "Hallazgo original", description: "Conservar", subprocess: "Finanzas" };
const remoteFinding = { ...historic, id: 2, fodaElementId: "remote-finding", statement: "Hallazgo remoto B", description: "Conservar también B" };
function seed(rows = [historic]) { mocks.data = { strengths: JSON.stringify(rows), opportunities: "[]", weaknesses: "[]", threats: "[]" }; }
async function debounce() { await act(async () => { await vi.advanceTimersByTimeAsync(1600); }); }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); localStorage.clear();
  localStorage.setItem("selectedPolicyId", "87654"); localStorage.setItem("selectedProcessName", "Finanzas");
  mocks.objectives = [{ id: 100, objective: "Objetivo vigente", description: "Nueva descripción" }];
  mocks.isFetching = false;
  mocks.cache.processFODA.get.invalidate.mockReset().mockResolvedValue(undefined);
  mocks.save.mockResolvedValue({ success: true }); seed();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("FODA: política del proceso y autoguardado seguro", () => {
  it("usa proceso autorizado aunque haya una política antigua recordada", () => {
    render(<ProcessFODA />);
    expect(mocks.list).toHaveBeenCalledWith({ processId: 21 }, expect.objectContaining({ refetchOnWindowFocus: "always" }));
    expect(screen.getByRole("option", { name: "Objetivo vigente" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Guardar Análisis/ })).toBeNull();
  });
  it("consulta y conserva el histórico sin ninguna escritura", async () => {
    render(<ProcessFODA />); await debounce();
    expect(screen.getByRole("combobox", { name: "Objetivo de la Política" }).getAttribute("value") ?? (screen.getByRole("combobox", { name: "Objetivo de la Política" }) as HTMLSelectElement).value).toBe("999");
    expect(screen.getByText(/Objetivo histórico; selecciona/)).toBeTruthy();
    expect((screen.getByLabelText("Objetivo Seleccionado") as HTMLTextAreaElement).value).toBe(historic.selectedObjectiveContent);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("una carga tardía no guarda borradores iniciales ni elimina datos", async () => {
    mocks.data = undefined; const view = render(<ProcessFODA />); await debounce();
    expect(mocks.save).not.toHaveBeenCalled();
    seed(); view.rerender(<ProcessFODA />); await debounce();
    expect(screen.getByLabelText("Enunciado")).toBeTruthy(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("espera la respuesta fresca al abrir con caché A y conserva A+B sin escribir", async () => {
    mocks.isFetching = true;
    const view = render(<ProcessFODA />); await debounce();
    expect(mocks.get).toHaveBeenCalledWith({ processId: 21 }, expect.objectContaining({
      enabled: true, staleTime: 0, refetchOnMount: "always",
    }));
    expect(screen.queryByLabelText("Enunciado")).toBeNull();
    expect(screen.queryByRole("button", { name: "Agregar Fortaleza" })).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();

    seed([historic, remoteFinding]); mocks.isFetching = false;
    view.rerender(<ProcessFODA />); await debounce();
    expect(screen.getAllByLabelText("Enunciado").map(field => (field as HTMLTextAreaElement).value))
      .toEqual([historic.statement, remoteFinding.statement]);
    expect(screen.getAllByLabelText("Descripción (Justificación)").map(field => (field as HTMLTextAreaElement).value))
      .toEqual([historic.description, remoteFinding.description]);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.cache.processFODA.get.invalidate).not.toHaveBeenCalled();
  });
  it("incorpora A+B en un refetch limpio y conserva B al guardar una edición de A", async () => {
    const view = render(<ProcessFODA />); await debounce();
    mocks.isFetching = true; view.rerender(<ProcessFODA />);
    seed([historic, remoteFinding]); mocks.isFetching = false;
    view.rerender(<ProcessFODA />); await debounce();
    const statements = screen.getAllByLabelText("Enunciado");
    expect(statements.map(field => (field as HTMLTextAreaElement).value))
      .toEqual([historic.statement, remoteFinding.statement]);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.cache.processFODA.get.invalidate).not.toHaveBeenCalled();

    fireEvent.change(statements[0], { target: { value: "A editado sin perder B" } }); await debounce();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.save.mock.calls[0][0].strengths)).toMatchObject([
      { ...historic, type: "Fortaleza", statement: "A editado sin perder B" },
      { ...remoteFinding, type: "Fortaleza" },
    ]);
    expect(screen.getAllByLabelText("Enunciado").map(field => (field as HTMLTextAreaElement).value))
      .toEqual(["A editado sin perder B", remoteFinding.statement]);
  });
  it("guarda el objetivo vigente con contenido correcto y conserva el hallazgo", async () => {
    render(<ProcessFODA />);
    fireEvent.change(screen.getByLabelText("Objetivo de la Política"), { target: { value: "100" } });
    expect(mocks.save).not.toHaveBeenCalled(); await debounce();
    expect(JSON.parse(mocks.save.mock.calls[0][0].strengths)[0]).toMatchObject({ ...historic,
      type: "Fortaleza", policyObjectiveId: 100, policyObjective: "Objetivo vigente", policyObjectiveDescription: "Nueva descripción",
      selectedObjectiveContent: "Objetivo vigente\n\nNueva descripción" });
  });
  it("un refetch no reemplaza una edición pendiente", async () => {
    const view = render(<ProcessFODA />);
    fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "Mi edición" } });
    mocks.isFetching = true; view.rerender(<ProcessFODA />);
    mocks.data = { ...mocks.data, strengths: JSON.stringify([{ ...historic, statement: "Refetch remoto" }]) };
    mocks.isFetching = false;
    view.rerender(<ProcessFODA />); await debounce();
    expect((screen.getByLabelText("Enunciado") as HTMLTextAreaElement).value).toBe("Mi edición");
    expect(JSON.parse(mocks.save.mock.calls[0][0].strengths)[0].statement).toBe("Mi edición");
  });
  it("invalida la caché del proceso sólo después de un guardado exitoso", async () => {
    let resolve!: (value: any) => void;
    mocks.save.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<ProcessFODA />);
    fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "Actualizar caché" } }); await debounce();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.cache.processFODA.get.invalidate).not.toHaveBeenCalled();

    await act(async () => { resolve({ success: true }); });
    expect(mocks.cache.processFODA.get.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.cache.processFODA.get.invalidate).toHaveBeenCalledWith({ processId: 21 });
    expect(screen.getByRole("status").textContent).toContain("Guardado a las");
  });
  it("espera a guardar el último cambio al volver", async () => {
    let resolve!: (value: any) => void;
    mocks.save.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<ProcessFODA />);
    fireEvent.change(screen.getByLabelText("Descripción (Justificación)"), { target: { value: "Último cambio" } });
    fireEvent.click(screen.getByRole("button", { name: "VOLVER" }));
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => { resolve({ success: true }); });
    expect(mocks.navigate).toHaveBeenCalledWith("/process-characterization");
  });
  it("conserva borrador y no sale si falla el guardado", async () => {
    mocks.save.mockRejectedValue(new Error("Error de prueba")); render(<ProcessFODA />);
    fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "No perder" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "VOLVER" })); });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("los cambios siguen");
    expect((screen.getByLabelText("Enunciado") as HTMLTextAreaElement).value).toBe("No perder");
    expect(mocks.cache.processFODA.get.invalidate).not.toHaveBeenCalled();
  });
  it("cancela el temporizador si se desmonta sin escribir", async () => {
    const view = render(<ProcessFODA />);
    fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "Cambio pendiente" } });
    view.unmount(); await debounce(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("serializa y envía la edición más reciente tras una escritura en curso", async () => {
    let resolve!: (value: any) => void;
    mocks.save.mockImplementationOnce(() => new Promise(r => { resolve = r; })); render(<ProcessFODA />);
    fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "Primera" } }); await debounce();
    fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "Última" } });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ success: true }); });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.save.mock.calls[1][0].strengths)[0].statement).toBe("Última");
  });
});
