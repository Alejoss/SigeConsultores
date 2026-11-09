// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategicMeasuredObjective, StrategicMeasurementDetail, StrategicMeasurementOverview as Overview } from "@shared/strategicObjectiveMeasurement";
import { StrategicObjectiveDetail } from "./StrategicObjectiveDetail";
import { StrategicGlobalMeasurement, StrategicMeasurementOverview } from "./StrategicMeasurementOverview";
import { StrategicMeasurementTimeline } from "./StrategicMeasurementTimeline";
import { StrategicObjectiveCreate } from "./StrategicObjectiveCreate";

const mocks = vi.hoisted(() => ({
  detail: null as StrategicMeasurementDetail | null,
  overview: null as Overview | null,
  detailQuery: vi.fn(), overviewQuery: vi.fn(),
  update: vi.fn(), config: vi.fn(), measurement: vi.fn(), create: vi.fn(), invalidate: vi.fn(), canManage: true,
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  strategicObjectives: {
    getMeasurementDetail: { useQuery: (input: unknown) => { mocks.detailQuery(input); return { data: mocks.detail, isLoading: false, refetch: vi.fn() }; } },
    getMeasurementOverview: { useQuery: (input: unknown) => { mocks.overviewQuery(input); return { data: mocks.overview, isLoading: false, refetch: vi.fn() }; } },
    update: { useMutation: () => ({ mutateAsync: mocks.update }) },
    saveMeasurementConfig: { useMutation: () => ({ mutateAsync: mocks.config }) },
    saveMeasurement: { useMutation: () => ({ mutateAsync: mocks.measurement }) },
    create: { useMutation: () => ({ mutateAsync: mocks.create, isPending: false }) },
  },
  useUtils: () => ({ strategicObjectives: { getMeasurementDetail: { invalidate: mocks.invalidate }, getMeasurementOverview: { invalidate: mocks.invalidate }, list: { invalidate: mocks.invalidate } } }),
} }));
vi.mock("@/hooks/useCompanyManagementPermission", () => ({ useCompanyManagementPermission: () => ({ canManageCompany: mocks.canManage }), CompanyReadOnlyNotice: () => <p>Modo de consulta</p> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ data }: { data: unknown }) => <div data-testid="real-timeline">{JSON.stringify(data)}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, ReferenceLine: () => null,
}));
const objective = (): StrategicMeasuredObjective => ({ id: 12, name: "OE original", objective: "OE original", description: "Justificación original", target: "Meta textual intacta", responsible: "Ana", deadline: "2026-12-31", orderIndex: 0,
  measurementConfig: { initialSituation: "Inicial", expectedResult: "Esperado", indicator: "Ventas", weight: 100, baseline: 10, goal: 20, unit: "USD", deadline: "2026-12-31" }, measurementStatus: "unmeasured", percent: null, latestMeasurement: null });
const overview = (oe = objective()): Overview => ({ objectives: [oe], globalPercent: null, totalWeight: 100, configuredCount: 1, measuredCount: 0, totalCount: 1, status: "incomplete_measurements" });
function measuredObjective(baseline: number, goal: number, value: number, registeredPercent = 50): StrategicMeasuredObjective {
  const oe = objective();
  return { ...oe, measurementConfig: { ...oe.measurementConfig!, baseline, goal }, measurementStatus: "measured", percent: registeredPercent,
    latestMeasurement: { id: 1, objectiveId: oe.id, measurementDate: "2026-11-07", value, percent: registeredPercent, observation: "Medición sintética", evidence: "Informe sintético" } };
}
async function tick(ms = 900) { await act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve(); }); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-08T12:00:00Z")); vi.clearAllMocks();
  mocks.detail = { objective: objective(), measurements: [] }; mocks.overview = overview(); mocks.canManage = true;
  for (const fn of [mocks.update, mocks.config, mocks.measurement, mocks.create, mocks.invalidate]) fn.mockResolvedValue({ success: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Strategic measurement UI", () => {
  it("reads definition without writing, preserves legacy texts and hides measurements/results", async () => {
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="definition" />); await tick();
    expect(mocks.detailQuery).toHaveBeenCalledWith({ companyId: 1, objectiveId: 12 });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.measurement).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Meta (texto)") as HTMLInputElement).value).toBe("Meta textual intacta");
    expect(screen.queryByText("Sin medición")).toBeNull();
    expect(screen.queryByRole("table", { name: "Doble lectura del indicador" })).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });
  it("autosaves only edited definition fields and keeps draft/focus across remote refetch", async () => {
    const view = render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="definition" />);
    const name = screen.getByLabelText("Nombre del objetivo *") as HTMLInputElement;
    name.focus(); fireEvent.change(name, { target: { value: "Nombre en edición" } });
    mocks.detail = { objective: { ...objective(), name: "Nombre remoto antiguo" }, measurements: [] };
    view.rerender(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="definition" />);
    expect(name.value).toBe("Nombre en edición"); expect(document.activeElement).toBe(name);
    await tick(); expect(mocks.update).toHaveBeenCalledTimes(1); expect(mocks.update).toHaveBeenCalledWith({ id: 12, name: "Nombre en edición" });
    expect((screen.getByLabelText("Meta (texto)") as HTMLInputElement).value).toBe("Meta textual intacta");
  });
  it("saves incomplete config with null numbers and never overwrites an active draft on refetch", async () => {
    const view = render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="definition" />);
    const indicator = screen.getByLabelText("Indicador *") as HTMLInputElement;
    fireEvent.change(indicator, { target: { value: "Nuevo indicador" } });
    fireEvent.change(screen.getByLabelText("Punto de partida *"), { target: { value: "" } });
    mocks.detail = { objective: objective(), measurements: [] }; view.rerender(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="definition" />);
    expect(indicator.value).toBe("Nuevo indicador"); await tick();
    expect(mocks.config).toHaveBeenCalledTimes(1);
    expect(mocks.config.mock.calls[0][0].config).toMatchObject({ indicator: "Nuevo indicador", baseline: null });
    expect(screen.getByText(/Pendiente de configuración\. Puedes/)).toBeTruthy();
  });
  it("does not write a measurement without complete date and a finite value, accepts true zero", async () => {
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="measurement" />);
    fireEvent.change(screen.getByLabelText("Valor actual del indicador * (USD)"), { target: { value: "0" } }); await tick(); expect(mocks.measurement).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Fecha de medición *"), { target: { value: "2026-11-09" } }); await tick(); expect(mocks.measurement).not.toHaveBeenCalled();
    expect(screen.getByText("La fecha de medición no puede ser futura.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Fecha de medición *"), { target: { value: "2026-11-07" } });
    fireEvent.change(screen.getByLabelText("Observación"), { target: { value: "Valor real comprobado" } });
    fireEvent.change(screen.getByLabelText("Evidencia / Referencia"), { target: { value: "Informe 12" } }); await tick();
    expect(mocks.measurement).toHaveBeenCalledTimes(1); expect(mocks.measurement).toHaveBeenCalledWith({ companyId: 1, objectiveId: 12, measurementDate: "2026-11-07", value: 0, observation: "Valor real comprobado", evidence: "Informe 12" });
  });
  it("cancels a queued date when cleared instead of saving under an incomplete date", async () => {
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="measurement" />);
    fireEvent.change(screen.getByLabelText("Valor actual del indicador * (USD)"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Fecha de medición *"), { target: { value: "2026-11-07" } }); await tick(400);
    fireEvent.change(screen.getByLabelText("Fecha de medición *"), { target: { value: "" } }); await tick();
    expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it("loads existing evidence on date selection without writing, then preserves it when only value changes", async () => {
    mocks.detail!.measurements = [{ id: 1, objectiveId: 12, measurementDate: "2026-11-07", value: 15, percent: 50, observation: "Observación previa", evidence: "Informe previo" }];
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="measurement" />);
    fireEvent.change(screen.getByLabelText("Fecha de medición *"), { target: { value: "2026-11-07" } });
    await tick();
    expect(mocks.measurement).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Observación") as HTMLTextAreaElement).value).toBe("Observación previa");
    expect((screen.getByLabelText("Evidencia / Referencia") as HTMLTextAreaElement).value).toBe("Informe previo");
    fireEvent.change(screen.getByLabelText("Valor actual del indicador * (USD)"), { target: { value: "16" } });
    await tick();
    expect(mocks.measurement).toHaveBeenCalledWith({ companyId: 1, objectiveId: 12, measurementDate: "2026-11-07", value: 16, observation: "Observación previa", evidence: "Informe previo" });
  });
  it("provides an explicit retry after save failure without losing the draft", async () => {
    mocks.update.mockRejectedValueOnce(new Error("Sin conexión"));
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="definition" />);
    fireEvent.change(screen.getByLabelText("Nombre del objetivo *"), { target: { value: "Mi borrador" } }); await tick();
    expect(screen.getByText("Error al guardar: Sin conexión")).toBeTruthy();
    expect((screen.getByLabelText("Nombre del objetivo *") as HTMLInputElement).value).toBe("Mi borrador");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); await tick(0);
    expect(mocks.update).toHaveBeenCalledTimes(2); expect(screen.getByText("Guardado")).toBeTruthy();
  });
  it("waits for queued textarea changes before closing", async () => {
    let resolve!: () => void;
    mocks.update.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const onClose = vi.fn();
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="definition" onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Justificación / Descripción"), { target: { value: "Texto aún no guardado" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(mocks.update).toHaveBeenCalledWith({ id: 12, description: "Texto aún no guardado" });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("keeps the detail open on closing error and allows retry without losing the textarea", async () => {
    mocks.update.mockRejectedValueOnce(new Error("Error de cierre"));
    const onClose = vi.fn();
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="definition" onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Justificación / Descripción"), { target: { value: "Mi explicación extensa" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" })); await tick(0);
    expect(onClose).not.toHaveBeenCalled(); expect(screen.getByText("Error al guardar: Error de cierre")).toBeTruthy();
    expect((screen.getByLabelText("Justificación / Descripción") as HTMLTextAreaElement).value).toBe("Mi explicación extensa");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); await tick(0);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" })); await tick(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it.each(["definition", "measurement"] as const)("ordinary chiefs can read but cannot edit or capture in %s mode", async mode => {
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage={false} mode={mode} />); await tick();
    expect((screen.getByLabelText("Nombre del objetivo *") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Indicador *") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByText("Registrar valor real")).toBeNull(); expect(screen.queryByText("Reintentar")).toBeNull();
    expect(screen.queryByLabelText("Fecha de medición *")).toBeNull();
    expect(Boolean(screen.queryByText("Historial de mediciones reales"))).toBe(mode === "measurement");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it.each([true, false])("definition mode excludes capture and history when canManage is %s", async canManage => {
    mocks.detail = { objective: measuredObjective(10, 20, 15), measurements: [{ id: 1, objectiveId: 12, measurementDate: "2026-11-07", value: 15, percent: 50, observation: "Solo en historial", evidence: "Evidencia histórica" }] };
    const { container } = render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage={canManage} mode="definition" />);
    await tick();
    expect(screen.getByText("Definición del objetivo")).toBeTruthy();
    expect(screen.getByText("Indicador propio del OE")).toBeTruthy();
    for (const field of container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
      expect(field.matches(":disabled")).toBe(!canManage);
    }
    expect(screen.queryByText("Registrar valor real")).toBeNull();
    for (const label of ["Fecha de medición *", "Valor actual del indicador * (USD)", "Observación", "Evidencia / Referencia"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    expect(screen.queryByText("Historial de mediciones reales")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Solo en historial")).toBeNull();
    expect(screen.queryByText("Resultado del indicador del OE")).toBeNull();
    expect(screen.queryByText(/Última medición/)).toBeNull();
    expect(screen.queryByText("50%")).toBeNull();
    expect(screen.queryByText("50 %")).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it("measurement mode disables every definition/config field even for a manager and enables only capture", async () => {
    mocks.detail!.measurements = [{ id: 1, objectiveId: 12, measurementDate: "2026-11-07", value: 15, percent: 50, observation: "Valor histórico", evidence: "Informe histórico" }];
    const { container } = render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="measurement" />);
    const readOnlyLabels = ["Nombre del objetivo *", "Justificación / Descripción", "Meta (texto)", "Responsable", "Situación inicial", "Resultado esperado", "Indicador *", "Ponderación (%) *", "Punto de partida *", "Meta numérica *", "Unidad *", "Fecha límite del objetivo *"];
    for (const label of readOnlyLabels) {
      expect((screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).disabled).toBe(true);
    }
    expect((screen.getByLabelText("Nombre del objetivo *") as HTMLInputElement).value).toBe("OE original");
    expect((screen.getByLabelText("Meta (texto)") as HTMLInputElement).value).toBe("Meta textual intacta");
    const captureFields = ["Fecha de medición *", "Valor actual del indicador * (USD)", "Observación", "Evidencia / Referencia"].map(label => screen.getByLabelText(label));
    expect(Array.from(container.querySelectorAll("input, textarea")).filter(field => !field.matches(":disabled"))).toEqual(captureFields);
    expect(screen.getByText("Historial de mediciones reales")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Historial de mediciones reales" }).textContent).toContain("2026-11-07");
    expect(screen.getByRole("table", { name: "Historial de mediciones reales" }).textContent).toContain("15 USD");
    expect(screen.getByRole("table", { name: "Historial de mediciones reales" }).textContent).toContain("Valor histórico");
    expect(screen.getByRole("table", { name: "Historial de mediciones reales" }).textContent).toContain("Informe histórico");
    await tick();
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it("measurement mode saves only capture data and never definition/config, including on close", async () => {
    const onClose = vi.fn();
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="measurement" onClose={onClose} />);
    // Synthetic changes must not bypass the read-only autosave permission.
    fireEvent.change(screen.getByLabelText("Nombre del objetivo *"), { target: { value: "Cambio no autorizado" } });
    fireEvent.change(screen.getByLabelText("Indicador *"), { target: { value: "Indicador no autorizado" } });
    fireEvent.change(screen.getByLabelText("Fecha de medición *"), { target: { value: "2026-11-07" } });
    fireEvent.change(screen.getByLabelText("Valor actual del indicador * (USD)"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("Observación"), { target: { value: "Captura autorizada" } });
    fireEvent.change(screen.getByLabelText("Evidencia / Referencia"), { target: { value: "Informe de medición" } });
    await tick();
    expect(mocks.measurement).toHaveBeenCalledTimes(1);
    expect(mocks.measurement).toHaveBeenCalledWith({ companyId: 1, objectiveId: 12, measurementDate: "2026-11-07", value: 16, observation: "Captura autorizada", evidence: "Informe de medición" });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" })); await tick(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled();
  });
  it("invalid weights and missing measurements show unavailable global and explicit counts", () => {
    const view = render(<StrategicGlobalMeasurement data={{ ...overview(), totalWeight: 60, status: "invalid_weights" }} />);
    expect(screen.getByText("No disponible")).toBeTruthy(); expect(screen.getByText(/deben sumar exactamente 100%/)).toBeTruthy();
    expect(screen.getByText("Configurados: 1/1")).toBeTruthy(); expect(screen.getByText("Medidos: 0/1")).toBeTruthy();
    view.rerender(<StrategicGlobalMeasurement data={overview()} />);
    expect(screen.getByText(/faltan mediciones reales/)).toBeTruthy(); expect(screen.queryByText("0%")).toBeNull();
  });
  it("overview uses the new real measurement endpoint and expands full detail", () => {
    render(<StrategicMeasurementOverview companyId={1} />);
    expect(mocks.overviewQuery).toHaveBeenCalledWith({ companyId: 1 });
    const bar = screen.getByRole("button", { name: /OE 1.*OE original/ });
    expect(bar.getAttribute("aria-expanded")).toBe("false"); expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(bar); expect(bar.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Indicador propio del OE")).toBeTruthy();
  });
  it("overview gives current result prominence and distinguishes variation from progress while retaining metadata", () => {
    const oe = measuredObjective(100, 150, 125);
    mocks.overview = { ...overview(oe), globalPercent: 50, measuredCount: 1, status: "complete" };
    render(<StrategicMeasurementOverview companyId={1} />);
    const card = screen.getByRole("button", { name: /OE 1.*OE original/ });
    const summary = within(card).getByRole("group", { name: "Resultado de OE original" });
    expect(within(summary).getByText("125 USD").tagName).toBe("STRONG");
    expect(summary.textContent).toContain("Variación respecto al inicio: +25 %");
    expect(summary.textContent).toContain("Avance hacia la meta: 50 %");
    expect(card.textContent).toContain("Ponderación: 100 %");
    expect(card.textContent).toContain("Última medición: 2026-11-07");
    expect(card.textContent).toContain("Fecha límite: 2026-12-31");
    expect(screen.getByRole("region", { name: "Avance global ponderado hacia las metas de OE" }).textContent).toContain("No se promedian las variaciones");
  });
  it("percentage indicators show point change before relative variation in both overview and detail", () => {
    const oe = measuredObjective(5, 15, 10, 50);
    oe.measurementConfig = { ...oe.measurementConfig!, unit: "%" };
    mocks.overview = { ...overview(oe), globalPercent: 50, measuredCount: 1, status: "complete" };
    mocks.detail = { objective: oe, measurements: [] };
    const view = render(<StrategicMeasurementOverview companyId={1} />);
    const summary = within(screen.getByRole("button", { name: /OE 1.*OE original/ })).getByRole("group");
    expect(within(summary).getByText("+5 puntos porcentuales")).toBeTruthy();
    expect(within(summary).getByText("Variación relativa: +100 %")).toBeTruthy();
    expect(summary.textContent!.indexOf("+5 puntos porcentuales")).toBeLessThan(summary.textContent!.indexOf("Variación relativa:"));
    view.unmount();
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage={false} mode="measurement" />);
    const table = screen.getByRole("table", { name: "Doble lectura del indicador" });
    const change = within(table).getByRole("row", { name: /Cambio respecto al inicio/ });
    expect(within(change).getByText("+5 puntos porcentuales")).toBeTruthy();
    expect(within(change).getByText("Variación relativa: +100 %")).toBeTruthy();
    expect(within(table).getByRole("row", { name: "Avance hacia la meta 50 %" })).toBeTruthy();
    expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it.each([
    { baseline: 10, goal: 20, value: 25, legacy: 100, variation: "+150 %", progress: "150 %", status: "Meta superada", bounded: "100" },
    { baseline: 10, goal: 20, value: 5, legacy: 0, variation: "-50 %", progress: "-50 %", status: "Por debajo del inicio", bounded: "0" },
    { baseline: 20, goal: 10, value: 8, legacy: 100, variation: "-60 %", progress: "120 %", status: "Meta superada", bounded: "100" },
  ])("overview preserves individual percentages beyond the goal span: $progress", ({ baseline, goal, value, legacy, variation, progress, status, bounded }) => {
    const oe = measuredObjective(baseline, goal, value, legacy);
    mocks.overview = { ...overview(oe), globalPercent: legacy, measuredCount: 1, status: "complete" };
    render(<StrategicMeasurementOverview companyId={1} />);
    const summary = within(screen.getByRole("button", { name: /OE 1.*OE original/ })).getByRole("group");
    expect(summary.textContent).toContain(`Variación respecto al inicio: ${variation}`);
    expect(summary.textContent).toContain(`Avance hacia la meta: ${progress}`);
    expect(summary.textContent).toContain(status);
    const bar = within(summary).getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe(bounded);
    expect(bar.getAttribute("aria-valuetext")).toContain(progress);
    const global = screen.getByRole("region", { name: "Avance global ponderado hacia las metas de OE" });
    expect(within(global).getByText(`${legacy} %`)).toBeTruthy();
  });
  it("detail shows five persisted-result fields with Ecuadorian decimal formatting", () => {
    mocks.detail = { objective: measuredObjective(100, 200, 125.5, 25.5), measurements: [] };
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="measurement" />);
    const table = screen.getByRole("table", { name: "Doble lectura del indicador" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByRole("row", { name: "Punto de partida 100 USD" })).toBeTruthy();
    expect(within(table).getByRole("row", { name: "Resultado actual 125,5 USD" })).toBeTruthy();
    expect(within(table).getByRole("row", { name: "Meta 200 USD" })).toBeTruthy();
    expect(within(table).getByRole("row", { name: "Variación respecto al inicio +25,5 %" })).toBeTruthy();
    expect(within(table).getByRole("row", { name: "Avance hacia la meta 25,5 %" })).toBeTruthy();
  });
  it.each([
    { baseline: 0, goal: 20, current: 5, explanation: "No calculable: inicio igual a cero.", absolute: "Cambio absoluto: +5 USD", progress: "25 %" },
    { baseline: -10, goal: 10, current: 0, explanation: "No se expresa en porcentaje con un inicio negativo; consulta el cambio absoluto.", absolute: "Cambio absoluto: +10 USD", progress: "50 %" },
  ])("zero/negative baseline $baseline explains unavailable variation without hiding the actual result", ({ baseline, goal, current, explanation, absolute, progress }) => {
    const oe = measuredObjective(baseline, goal, current);
    mocks.detail = { objective: oe, measurements: [] }; mocks.overview = overview(oe);
    const view = render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage={false} mode="measurement" />);
    const table = screen.getByRole("table", { name: "Doble lectura del indicador" });
    expect(within(table).getByRole("row", { name: `Resultado actual ${current} USD` })).toBeTruthy();
    expect(within(table).getByRole("row", { name: "Variación respecto al inicio No calculable" })).toBeTruthy();
    expect(within(table).getByRole("row", { name: `Avance hacia la meta ${progress}` })).toBeTruthy();
    expect(screen.getByText(explanation)).toBeTruthy(); expect(screen.getByText(absolute)).toBeTruthy();
    expect(screen.queryByLabelText("Valor actual del indicador * (USD)")).toBeNull();
    view.unmount(); render(<StrategicMeasurementOverview companyId={1} />);
    const summary = within(screen.getByRole("button", { name: /OE 1.*OE original/ })).getByRole("group");
    expect(within(summary).getByText(explanation)).toBeTruthy();
    expect(summary.textContent).toContain(absolute);
    expect(summary.textContent).toContain(`Avance hacia la meta: ${progress}`);
    expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it.each(["pending_configuration", "unmeasured"] as const)("missing current value in %s remains missing, not a fictitious zero", measurementStatus => {
    const oe = { ...objective(), measurementStatus, measurementConfig: measurementStatus === "pending_configuration" ? null : objective().measurementConfig };
    mocks.overview = overview(oe); mocks.detail = { objective: oe, measurements: [] };
    const view = render(<StrategicMeasurementOverview companyId={1} />);
    const card = screen.getByRole("button", { name: /OE 1.*OE original/ });
    expect(card.textContent).toContain("Resultado actual: —");
    expect(card.textContent).toContain("Variación respecto al inicio: —");
    expect(card.textContent).toContain("Avance hacia la meta: —");
    expect(within(card).queryByRole("progressbar")).toBeNull();
    view.unmount(); render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage={false} mode="measurement" />);
    const table = screen.getByRole("table", { name: "Doble lectura del indicador" });
    expect(within(table).getByRole("row", { name: "Resultado actual —" })).toBeTruthy();
    expect(within(table).getByRole("row", { name: "Avance hacia la meta —" })).toBeTruthy();
    expect(within(table).queryByText("0 %")).toBeNull(); expect(within(table).queryByText("0 USD")).toBeNull();
  });
  it("detail keeps raw current progress distinct from the unchanged registered historical percentages", () => {
    const oe = measuredObjective(10, 20, 25, 100);
    mocks.detail = { objective: oe, measurements: [oe.latestMeasurement!, { id: 2, objectiveId: 12, measurementDate: "2026-11-06", value: 5, percent: 0, observation: "Legado sin recálculo", evidence: "Documento previo" }] };
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage={false} mode="measurement" />);
    const current = screen.getByRole("table", { name: "Doble lectura del indicador" });
    expect(within(current).getByRole("row", { name: "Avance hacia la meta 150 %" })).toBeTruthy();
    const history = screen.getByRole("table", { name: "Historial de mediciones reales" });
    expect(within(history).getByRole("columnheader", { name: "Avance registrado" })).toBeTruthy();
    expect(within(history).getByText("100 %")).toBeTruthy(); expect(within(history).getByText("0 %")).toBeTruthy();
    expect(within(history).queryByText("150 %")).toBeNull(); expect(within(history).queryByText("-50 %")).toBeNull();
    expect(screen.getByText(/No se recalcula con la definición actual/)).toBeTruthy();
    expect(within(history).getByText("Documento previo")).toBeTruthy();
    expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it("result refetch updates the persisted panel without replacing an active capture draft, cursor or evidence", async () => {
    mocks.detail = { objective: measuredObjective(10, 20, 15), measurements: [] };
    const view = render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="measurement" />);
    fireEvent.change(screen.getByLabelText("Fecha de medición *"), { target: { value: "2026-11-07" } });
    fireEvent.change(screen.getByLabelText("Valor actual del indicador * (USD)"), { target: { value: "17" } });
    fireEvent.change(screen.getByLabelText("Evidencia / Referencia"), { target: { value: "Evidencia en edición" } });
    const observation = screen.getByLabelText("Observación") as HTMLTextAreaElement;
    fireEvent.change(observation, { target: { value: "Observación activa" } });
    observation.focus(); observation.setSelectionRange(5, 5);
    mocks.detail = { objective: measuredObjective(10, 20, 16), measurements: [] };
    view.rerender(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage mode="measurement" />);
    expect(within(screen.getByRole("table", { name: "Doble lectura del indicador" })).getByRole("row", { name: "Resultado actual 16 USD" })).toBeTruthy();
    expect((screen.getByLabelText("Valor actual del indicador * (USD)") as HTMLInputElement).value).toBe("17");
    expect((screen.getByLabelText("Evidencia / Referencia") as HTMLTextAreaElement).value).toBe("Evidencia en edición");
    expect(observation.value).toBe("Observación activa");
    expect(document.activeElement).toBe(observation); expect(observation.selectionStart).toBe(5);
    await tick();
    expect(mocks.measurement).toHaveBeenCalledWith({ companyId: 1, objectiveId: 12, measurementDate: "2026-11-07", value: 17, observation: "Observación activa", evidence: "Evidencia en edición" });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled();
  });
  it.each(["definition", "measurement"] as const)("read-only synthetic edits never acquire write permissions in %s", async mode => {
    render(<StrategicObjectiveDetail companyId={1} objectiveId={12} canManage={false} mode={mode} />);
    fireEvent.change(screen.getByLabelText("Nombre del objetivo *"), { target: { value: "Cambio sintético prohibido" } });
    fireEvent.change(screen.getByLabelText("Indicador *"), { target: { value: "Indicador prohibido" } });
    await tick();
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.measurement).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Fecha de medición *")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });
  it("overview honours consultation permissions when expanding results", async () => {
    mocks.canManage = false;
    const oe = measuredObjective(100, 150, 125);
    mocks.overview = overview(oe); mocks.detail = { objective: oe, measurements: [] };
    render(<StrategicMeasurementOverview companyId={1} />);
    expect(screen.getByText("Modo de consulta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /OE 1.*OE original/ })); await tick();
    expect(screen.getByRole("table", { name: "Doble lectura del indicador" })).toBeTruthy();
    expect(screen.queryByLabelText("Valor actual del indicador * (USD)")).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it("timeline selects actual measurements by objective ID, not names or OTE snapshots", async () => {
    mocks.detail!.measurements = [
      { id: 1, objectiveId: 12, measurementDate: "2026-11-01", value: 15, percent: 50, observation: "Medición propia", evidence: "Informe" },
      { id: 2, objectiveId: 999, measurementDate: "2026-11-02", value: 999, percent: 99, observation: "Otro objetivo", evidence: "" },
    ];
    render(<StrategicMeasurementTimeline companyId={1} />); await tick();
    expect(mocks.detailQuery).toHaveBeenCalledWith({ companyId: 1, objectiveId: 12 });
    expect(screen.getByTestId("real-timeline").textContent).toContain('"percent":50');
    expect(screen.getByTestId("real-timeline").textContent).not.toContain('"value":999');
    expect(screen.queryByText("Otro objetivo")).toBeNull(); expect(mocks.measurement).not.toHaveBeenCalled();
  });
  it("new objectives require complete config and retain the explicit create button", async () => {
    render(<StrategicObjectiveCreate companyId={1} orderIndex={0} onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nombre del objetivo *"), { target: { value: "Nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar objetivo" })); await tick();
    expect(mocks.create).not.toHaveBeenCalled(); expect(screen.getByRole("alert").textContent).toContain("Completa indicador");
    const values = { "Indicador *": "Ventas", "Ponderación (%) *": "100", "Punto de partida *": "10", "Meta numérica *": "20", "Unidad *": "USD", "Fecha límite del objetivo *": "2026-12-31" };
    for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar objetivo" })); await tick(0);
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.create.mock.calls[0][0].measurementConfig).toMatchObject({ baseline: 10, goal: 20, weight: 100 });
    expect(mocks.create.mock.calls[0][0].deadline).toBe("2026-12-31");
  });
});
