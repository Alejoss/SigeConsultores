// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessPlanningCycles from "../ProcessPlanningCycles";

// Fixtures exclusively for this DOM suite. No router, database or execution writes.
type ItemType = "linked_commitment" | "output_release";
type DecisionValue = "pending" | "migrate" | "close" | "review";
type CycleStatus = "not_started" | "in_review" | "ready" | "active" | "closed" | "skipped";
type FixtureCycle = {
  id: number;
  status: CycleStatus;
  managerApprovalStatus: "pending" | "approved" | "returned";
  managerReviewNote: string | null;
};
type FixtureDecision = {
  id: number;
  itemType: ItemType;
  sourceItemKey: string;
  title: string;
  description: string | null;
  completionPercent: string;
  decision: DecisionValue;
  sourcePayloadJson: string;
};
type FixtureOverview = {
  sourceYear: number;
  cycle: FixtureCycle | null;
  decisions: FixtureDecision[];
  snapshots: Array<{
    id: number;
    itemType: ItemType;
    title: string;
    description: string | null;
    completionPercent: string;
    migrationDecision: Exclude<DecisionValue, "pending">;
  }>;
  operationalItems: Array<{
    id: number;
    itemType: ItemType;
    title: string;
    description: string | null;
    plannedDate: string | null;
    sourceCompletionPercent: string;
  }>;
  pendingCount: number;
  ready: boolean;
};
type MutationOptions = { onError: (error: Error) => void };

const mocks = vi.hoisted(() => ({
  overview: null as FixtureOverview | null,
  manager: false,
  preparePending: false,
  decisionPending: false,
  approvedProcessCount: 0,
  navigate: vi.fn(),
  overviewQuery: vi.fn(),
  managerQuery: vi.fn(),
  prepare: vi.fn(),
  decision: vi.fn(),
  ready: vi.fn(),
  deadline: vi.fn(),
  managerReview: vi.fn(),
  activate: vi.fn(),
  invalidateOverview: vi.fn(),
  invalidateManager: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
  decisionOnError: null as ((error: Error) => void) | null,
  prepareOnSuccess: null as ((result: { created: boolean; itemCount?: number }) => Promise<void>) | null,
}));

vi.mock("wouter", () => ({ useLocation: () => ["/process-planning-cycles", mocks.navigate] }));
vi.mock("@/_core/hooks/useManagerAuth", () => ({ useManagerAuth: () => ({ isManagerLogin: mocks.manager }) }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("sonner", () => ({ toast: { success: mocks.successToast, error: mocks.errorToast } }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ planningCycles: {
    overview: { invalidate: mocks.invalidateOverview },
    managerOverview: { invalidate: mocks.invalidateManager },
  } }),
  planningCycles: {
    overview: { useQuery: (...args: unknown[]) => {
      mocks.overviewQuery(...args);
      return { data: mocks.overview, isLoading: false };
    } },
    managerOverview: { useQuery: (...args: unknown[]) => {
      mocks.managerQuery(...args);
      return { data: {
        activation: { status: "draft", deadline: null },
        processes: Array.from({ length: mocks.approvedProcessCount }, (_, index) => ({
          id: 900 + index,
          name: `Proceso DOM ${index + 1}`,
          macroProcess: null,
          cycle: { status: "ready", managerApprovalStatus: "approved" },
        })),
      } };
    } },
    prepareDraft: { useMutation: (options: { onSuccess: typeof mocks.prepareOnSuccess }) => {
      mocks.prepareOnSuccess = options.onSuccess;
      return { mutate: mocks.prepare, isPending: mocks.preparePending };
    } },
    updateDecision: { useMutation: (options: MutationOptions) => {
      mocks.decisionOnError = options.onError;
      return { mutate: mocks.decision, isPending: mocks.decisionPending };
    } },
    markReady: { useMutation: () => ({ mutate: mocks.ready, isPending: false }) },
    setDeadline: { useMutation: () => ({ mutate: mocks.deadline, isPending: false }) },
    reviewByManager: { useMutation: () => ({ mutate: mocks.managerReview, isPending: false }) },
    activateCompanyCycle: { useMutation: () => ({ mutate: mocks.activate, isPending: false }) },
  },
} }));

const activities = [
  { itemType: "linked_commitment" as const, id: 7311, sourceItemKey: "schedule:linked_commitment_401", title: "Compromiso DOM de referencia", label: "Compromisos vinculados", color: "teal", completion: "100.00" },
  { itemType: "output_release" as const, id: 8422, sourceItemKey: "schedule:output_release_502", title: "Salida DOM de referencia", label: "Control y liberación de salidas", color: "orange", completion: "50.00" },
];

function overviewFixture(): FixtureOverview {
  return {
    sourceYear: 2026,
    cycle: { id: 6101, status: "in_review", managerApprovalStatus: "pending", managerReviewNote: null },
    decisions: activities.map(activity => ({
      id: activity.id,
      itemType: activity.itemType,
      sourceItemKey: activity.sourceItemKey,
      title: activity.title,
      description: "Referencia DOM 2026 · Año de origen abierto",
      completionPercent: activity.completion,
      decision: "pending",
      sourcePayloadJson: JSON.stringify({ source: "consolidated_schedule", activity: {
        id: activity.sourceItemKey.slice("schedule:".length),
        type: activity.itemType,
        completionPercentage: Number(activity.completion),
        status: activity.itemType === "linked_commitment" ? "completed" : "released",
        completedAt: "2026-10-10T12:00:00.000Z",
        evidence: ["evidencia-dom-2026"],
      } }),
    })),
    snapshots: [],
    operationalItems: [],
    pendingCount: 2,
    ready: false,
  };
}

function decisionCard(title: string): HTMLElement {
  const card = screen.getByRole("heading", { name: title }).closest<HTMLElement>(".rounded-xl");
  expect(card).not.toBeNull();
  return card!;
}

function expectNoMutations() {
  for (const mutate of [mocks.prepare, mocks.decision, mocks.ready, mocks.deadline, mocks.managerReview, mocks.activate]) {
    expect(mutate).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/process-planning-cycles?companyId=7&processId=31&targetYear=2027");
  mocks.overview = overviewFixture();
  mocks.manager = false;
  mocks.preparePending = false;
  mocks.decisionPending = false;
  mocks.approvedProcessCount = 0;
  mocks.decisionOnError = null;
  mocks.prepareOnSuccess = null;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("Ciclos: compromisos vinculados y control y liberación de salidas", () => {
  it("presenta ambas categorías antes de preparar y no prepara automáticamente", () => {
    mocks.overview!.cycle = null;
    mocks.overview!.decisions = [];
    render(<ProcessPlanningCycles />);
    expect(screen.getByText(/Acciones con partes interesadas, cumplimientos renovables, compromisos vinculados y control y liberación de salidas/)).toBeInTheDocument();
    expectNoMutations();
    fireEvent.click(screen.getByRole("button", { name: "Preparar borrador del nuevo ciclo" }));
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.prepare).toHaveBeenCalledWith({ companyId: 7, processId: 31, targetYear: 2027 });
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it.each([
    { status: "in_review", approval: "pending" },
    { status: "ready", approval: "pending" },
    { status: "ready", approval: "approved" },
  ] as const)("permite Actualizar preparación explícita de $status/$approval sin modificar decisiones localmente", state => {
    mocks.overview!.cycle!.status = state.status;
    mocks.overview!.cycle!.managerApprovalStatus = state.approval;
    mocks.overview!.decisions[0].decision = "close";
    mocks.overview!.decisions[1].decision = "review";
    const sourceBefore = JSON.stringify(mocks.overview);
    render(<ProcessPlanningCycles />);
    expect(screen.getByText(/sin reemplazar decisiones previas/)).toBeInTheDocument();
    expectNoMutations();
    const button = screen.getByRole("button", { name: "Actualizar preparación" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.prepare).toHaveBeenCalledWith({ companyId: 7, processId: 31, targetYear: 2027 });
    expect(JSON.stringify(mocks.overview)).toBe(sourceBefore);
    expect(mocks.decision).not.toHaveBeenCalled();
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.managerReview).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("bloquea Actualizar preparación mientras prepareDraft está pendiente", () => {
    mocks.preparePending = true;
    mocks.overview!.cycle!.status = "ready";
    mocks.overview!.cycle!.managerApprovalStatus = "approved";
    render(<ProcessPlanningCycles />);
    const button = screen.getByRole("button", { name: "Actualizar preparación" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expectNoMutations();
  });

  it.each(["active", "closed", "skipped", "not_started"] as const)("no permite actualizar preparación en un ciclo %s", status => {
    mocks.overview!.cycle!.status = status;
    render(<ProcessPlanningCycles />);
    expect(screen.queryByRole("button", { name: "Actualizar preparación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preparar borrador del nuevo ciclo" })).not.toBeInTheDocument();
    expectNoMutations();
  });

  it("tras prepareDraft exitoso refresca las consultas reales sin fabricar decisiones ni aprobación", async () => {
    render(<ProcessPlanningCycles />);
    const sourceBefore = JSON.stringify(mocks.overview);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar preparación" }));
    expect(mocks.prepareOnSuccess).not.toBeNull();
    await mocks.prepareOnSuccess!({ created: false });
    expect(mocks.successToast).toHaveBeenCalledWith("Preparación revisada. Consulte los elementos pendientes del proceso.");
    expect(mocks.invalidateOverview).toHaveBeenCalledWith({ companyId: 7, processId: 31, targetYear: 2027 });
    expect(mocks.invalidateManager).toHaveBeenCalledWith({ companyId: 7, targetYear: 2027 });
    expect(JSON.stringify(mocks.overview)).toBe(sourceBefore);
    expect(mocks.decision).not.toHaveBeenCalled();
    expect(mocks.managerReview).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it.each(activities)("muestra título, cumplimiento de referencia y color para $itemType", activity => {
    render(<ProcessPlanningCycles />);
    const card = within(decisionCard(activity.title));
    expect(card.getByText(activity.label)).toHaveClass(`border-${activity.color}-300`, `bg-${activity.color}-50`, `text-${activity.color}-800`);
    expect(card.getByText(`Cumplimiento de referencia: ${Number(activity.completion)}%`)).toBeInTheDocument();
    expect(card.getByText("Referencia DOM 2026 · Año de origen abierto")).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Migrar", exact: true })).toBeEnabled();
    expect(card.getByRole("button", { name: "No migrar", exact: true })).toBeEnabled();
    expect(card.getByRole("button", { name: "Revisar", exact: true })).toBeEnabled();
    expect(screen.queryByText(/Cumplimiento al cierre/i)).not.toBeInTheDocument();
    expectNoMutations();
  });

  for (const activity of activities) {
    it.each([
      { label: "Migrar", decision: "migrate" },
      { label: "No migrar", decision: "close" },
      { label: "Revisar", decision: "review" },
    ] as const)(`${activity.itemType}: $label envía el decisionId exacto, no el ID de fuente`, action => {
      render(<ProcessPlanningCycles />);
      fireEvent.click(within(decisionCard(activity.title)).getByRole("button", { name: action.label, exact: true }));
      expect(mocks.decision).toHaveBeenCalledTimes(1);
      expect(mocks.decision).toHaveBeenCalledWith({ companyId: 7, decisionId: activity.id, decision: action.decision });
      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.ready).not.toHaveBeenCalled();
      expect(mocks.managerReview).not.toHaveBeenCalled();
      expect(mocks.activate).not.toHaveBeenCalled();
    });
  }

  it.each(activities)("no convierte cumplimiento 2026 completed/released en migración o ejecución automática: $itemType", activity => {
    const fixture = mocks.overview!;
    fixture.decisions = fixture.decisions.filter(item => item.itemType === activity.itemType);
    fixture.decisions[0].completionPercent = "100.00";
    fixture.pendingCount = 1;
    const sourceBefore = JSON.stringify(fixture);
    const rendered = render(<ProcessPlanningCycles />);
    const card = within(decisionCard(activity.title));
    expect(card.getByText("Cumplimiento de referencia: 100%")).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Migrar", exact: true })).toHaveClass("border-emerald-300");
    expect(screen.getByRole("button", { name: "Marcar proceso como listo" })).toBeDisabled();
    expect(screen.getByText(/no se copia como ejecución del año nuevo/i)).toBeInTheDocument();
    expect(screen.queryByText("Plan operativo 2027")).not.toBeInTheDocument();
    expect(screen.queryByText("evidencia-dom-2026")).not.toBeInTheDocument();
    rendered.rerender(<ProcessPlanningCycles />);
    expect(JSON.stringify(fixture)).toBe(sourceBefore);
    expectNoMutations();
  });

  it.each(["not_started", "ready", "active", "closed", "skipped"] as const)("conserva decisiones de solo lectura fuera de in_review: %s", status => {
    mocks.overview!.cycle!.status = status;
    mocks.overview!.ready = true;
    render(<ProcessPlanningCycles />);
    for (const activity of activities) {
      const buttons = within(decisionCard(activity.title)).getAllByRole("button");
      expect(buttons).toHaveLength(3);
      for (const button of buttons) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
    }
    expectNoMutations();
  });

  it("conserva el bloqueo mientras se guarda una decisión, sin autosave adicional", () => {
    mocks.decisionPending = true;
    render(<ProcessPlanningCycles />);
    for (const activity of activities) {
      for (const button of within(decisionCard(activity.title)).getAllByRole("button")) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
    }
    expectNoMutations();
  });

  it("mantiene un proceso aprobado de solo lectura, sin aprobación ni incorporación al montar", () => {
    mocks.manager = true;
    mocks.overview!.cycle!.status = "ready";
    mocks.overview!.cycle!.managerApprovalStatus = "approved";
    mocks.overview!.decisions.forEach(item => { item.decision = "migrate"; });
    mocks.overview!.pendingCount = 0;
    mocks.overview!.ready = true;
    render(<ProcessPlanningCycles />);
    expect(screen.getByText("Proceso aprobado por Gerencia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprobado por Gerencia" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Aprobar proceso" })).not.toBeInTheDocument();
    for (const activity of activities) {
      expect(within(decisionCard(activity.title)).getByRole("button", { name: "Migrar", exact: true })).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Incorporar procesos aprobados a 2027" })).toBeDisabled();
    expectNoMutations();
  });

  it("la aprobación solo solicita revisar el proceso y no incorpora ni cierra el año fuente", () => {
    mocks.manager = true;
    mocks.overview!.cycle!.status = "ready";
    mocks.overview!.decisions.forEach(item => { item.decision = "review"; });
    mocks.overview!.pendingCount = 0;
    mocks.overview!.ready = true;
    render(<ProcessPlanningCycles />);
    expect(screen.getByText(/Aprobar o incorporar procesos no cierra el año anterior/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar proceso" }));
    expect(mocks.managerReview).toHaveBeenCalledTimes(1);
    expect(mocks.managerReview).toHaveBeenCalledWith({ companyId: 7, cycleId: 6101, decision: "approved", note: undefined });
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.decision).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /cerrar/i })).not.toBeInTheDocument();
  });

  it("la incorporación exige confirmación explícita y solo envía empresa y año de destino", () => {
    mocks.manager = true;
    mocks.approvedProcessCount = 1;
    mocks.overview!.cycle!.status = "ready";
    mocks.overview!.cycle!.managerApprovalStatus = "approved";
    render(<ProcessPlanningCycles />);
    fireEvent.click(screen.getByRole("button", { name: "Incorporar procesos aprobados a 2027" }));
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(screen.getByText(/Esta acción no cierra el año anterior/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.activate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Incorporar procesos aprobados a 2027" }));
    fireEvent.click(screen.getByRole("button", { name: "Incorporar aprobados", exact: true }));
    expect(mocks.activate).toHaveBeenCalledTimes(1);
    expect(mocks.activate).toHaveBeenCalledWith({ companyId: 7, targetYear: 2027 });
    expect(mocks.managerReview).not.toHaveBeenCalled();
    expect(mocks.decision).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /cerrar/i })).not.toBeInTheDocument();
  });

  it("usa las mismas etiquetas en históricos y no describe No migrar como cierre del año", () => {
    mocks.overview!.snapshots = activities.map(activity => ({
      id: activity.id + 10000,
      itemType: activity.itemType,
      title: `Histórico ${activity.title}`,
      description: "Referencia histórica DOM 2026",
      completionPercent: activity.completion,
      migrationDecision: "close",
    }));
    render(<ProcessPlanningCycles />);
    fireEvent.click(screen.getByRole("button", { name: "Ciclos anteriores" }));
    for (const activity of activities) {
      expect(screen.getByText(activity.label)).toHaveClass(`bg-${activity.color}-50`);
      expect(screen.getByRole("heading", { name: `Histórico ${activity.title}` })).toBeInTheDocument();
    }
    expect(screen.getAllByText("No migrado al ciclo siguiente")).toHaveLength(2);
    expect(screen.queryByText("Cerrado en este ciclo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Migrar", exact: true })).not.toBeInTheDocument();
    expectNoMutations();
  });

  it("muestra las categorías del plan operativo recibido sin usar cumplimiento de origen como ejecución nueva", () => {
    mocks.overview!.cycle!.status = "active";
    mocks.overview!.cycle!.managerApprovalStatus = "approved";
    mocks.overview!.operationalItems = activities.map(activity => ({
      id: activity.id + 20000,
      itemType: activity.itemType,
      title: `Plan DOM 2027 ${activity.itemType}`,
      description: "Definición de planificación DOM",
      plannedDate: null,
      sourceCompletionPercent: "100.00",
    }));
    render(<ProcessPlanningCycles />);
    const operationalCard = screen.getByText("Plan operativo 2027").closest<HTMLElement>('[data-slot="card"]')!;
    for (const activity of activities) {
      expect(within(operationalCard).getByText(activity.label)).toHaveClass(`bg-${activity.color}-50`);
      expect(within(operationalCard).getByText(`Plan DOM 2027 ${activity.itemType}`)).toBeInTheDocument();
    }
    expect(within(operationalCard).getAllByText("Pendiente de calendarizar")).toHaveLength(2);
    expect(within(operationalCard).queryByText(/100%/)).not.toBeInTheDocument();
    expect(screen.getByText(/sin cerrar automáticamente el año anterior/)).toBeInTheDocument();
    expectNoMutations();
  });

  it("conserva el error real de la decisión sin fingir éxito ni cambiar la referencia", () => {
    render(<ProcessPlanningCycles />);
    fireEvent.click(within(decisionCard(activities[0].title)).getByRole("button", { name: "Migrar", exact: true }));
    expect(mocks.decisionOnError).not.toBeNull();
    mocks.decisionOnError!(new Error("Decisión no disponible: error DOM de servidor"));
    expect(mocks.errorToast).toHaveBeenCalledTimes(1);
    expect(mocks.errorToast).toHaveBeenCalledWith("Decisión no disponible: error DOM de servidor");
    expect(mocks.successToast).not.toHaveBeenCalled();
    expect(mocks.invalidateOverview).not.toHaveBeenCalled();
    expect(mocks.overview!.decisions[0].decision).toBe("pending");
    expect(within(decisionCard(activities[0].title)).getByRole("button", { name: "Migrar", exact: true })).toHaveClass("border-emerald-300");
  });
});
