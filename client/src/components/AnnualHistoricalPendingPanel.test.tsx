// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnualHistoricalPendingPanel } from "./AnnualHistoricalPendingPanel";
import {
  flushAnnualExitGuards,
  hasAnnualExitGuards,
} from "@/lib/annualNavigation";
import AnnualWorkspaces from "@/pages/AnnualWorkspaces";
import ManagementPrograms from "@/pages/ManagementPrograms";
import LinkedCommitments from "@/pages/LinkedCommitments";
import InspectionControl from "@/pages/InspectionControl";

type Item = {
  id: string;
  sourceYear: number;
  sourceWorkspaceId: number;
  kind: "program_action" | "inspection_finding";
  sourceTable: string;
  sourceId: number;
  processId: number | null;
  title: string;
  dueDate: string | null;
  status: "pending" | "completed";
  notes: string;
  resolvedYear: number | null;
};
const mocks = vi.hoisted(() => ({
  annual: { companyId: 7 as number | null, year: 2027, closed: false },
  data: { year: 2027, items: [] as Item[] },
  query: vi.fn(),
  resolve: vi.fn(),
  refetch: vi.fn(),
  error: null as Error | null,
  loading: false,
  manager: true,
  status: "open",
  create: vi.fn(),
  close: vi.fn(),
  incorporate: vi.fn(),
  invalidate: vi.fn(),
  leader: null as { companyId: number; processId: number } | null,
  inspectionRows: [] as unknown[],
}));
vi.mock("@/contexts/AnnualWorkspaceContext", () => ({
  useAnnualWorkspace: () => mocks.annual,
}));
vi.mock("@/_core/hooks/useManagerAuth", () => ({
  useManagerAuth: () => ({
    isManagerLogin: mocks.manager,
    managerCompanyId: 7,
    isLoading: false,
  }),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/contexts/ProcessLeaderAuthContext", () => ({
  useProcessLeaderAuth: () => ({ session: mocks.leader, isLoading: false }),
}));
vi.mock("@/hooks/useCompanyManagementPermission", () => ({
  useCompanyManagementPermission: () => ({ canManageCompany: true }),
  CompanyReadOnlyNotice: () => null,
}));
vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ProcessQuickNavigation", () => ({
  ProcessQuickNavigation: () => null,
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/annual-workspaces", vi.fn()],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    annualHistory: {
      list: {
        useQuery: (input: unknown, options: unknown) => {
          mocks.query(input, options);
          return {
            data: mocks.data,
            error: mocks.error,
            isLoading: mocks.loading,
            refetch: mocks.refetch,
          };
        },
      },
      resolve: { useMutation: () => ({ mutateAsync: mocks.resolve }) },
    },
    useUtils: () => ({ annualWorkspaces: { invalidate: mocks.invalidate } }),
    annualWorkspaces: {
      list: {
        useQuery: () => ({
          data: {
            workspaces: [
              { id: 1, year: 2027, status: "open" },
              { id: 2, year: 2028, status: "open" },
            ],
          },
          isLoading: false,
          error: null,
        }),
      },
      overview: {
        useQuery: () => ({
          data: {
            workspace: { status: mocks.status },
            incorporatedCount: 1,
            totalCount: 2,
            processes: [],
          },
          isLoading: false,
          error: null,
        }),
      },
      create: {
        useMutation: () => ({ mutateAsync: mocks.create, isPending: false }),
      },
      close: {
        useMutation: () => ({ mutateAsync: mocks.close, isPending: false }),
      },
      incorporateProcess: {
        useMutation: () => ({
          mutateAsync: mocks.incorporate,
          isPending: false,
        }),
      },
    },
    managementPrograms: {
      list: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          refetch: mocks.refetch,
        }),
      },
      listDocumentation: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          refetch: mocks.refetch,
        }),
      },
      create: { useMutation: () => ({ isPending: false }) },
      update: { useMutation: () => ({ isPending: false }) },
      delete: { useMutation: () => ({ isPending: false }) },
      uploadPlan: { useMutation: () => ({ isPending: false }) },
      deleteDocumentation: { useMutation: () => ({ isPending: false }) },
    },
    auditsInspections: {
      listInspections: { useQuery: () => ({ data: mocks.inspectionRows, isLoading: false, refetch: mocks.refetch }) },
      createInspection: { useMutation: () => ({ isPending: false }) },
      updateInspection: { useMutation: () => ({ isPending: false }) },
      deleteInspection: { useMutation: () => ({ isPending: false }) },
    },
    linkedCommitments: {
      listByProcess: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          refetch: mocks.refetch,
        }),
      },
      listEvidence: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          refetch: mocks.refetch,
        }),
      },
      createOwn: { useMutation: () => ({ isPending: false }) },
      deleteEvidence: { useMutation: () => ({ isPending: false }) },
    },
  },
}));

const source = (patch: Partial<Item> = {}): Item => ({
  id: "program_action:2026:11:raw",
  sourceYear: 2026,
  sourceWorkspaceId: 1,
  kind: "program_action",
  sourceTable: "managementProgramActions",
  sourceId: 11,
  processId: null,
  title: "Acción de origen 2026",
  dueDate: "2026-11-10",
  status: "pending",
  notes: "Nota original",
  resolvedYear: null,
  ...patch,
});
const openPanel = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Pendientes de años anteriores" })
  );
const notes = () =>
  screen.getByLabelText("Notas de resolución histórica") as HTMLTextAreaElement;
const checkbox = () =>
  screen.getByRole("checkbox", {
    name: "Marcar resolución histórica completada",
  }) as HTMLInputElement;
const deferred = () => {
  let complete!: (value: { success: true }) => void;
  let fail!: (reason: Error) => void;
  const promise = new Promise<{ success: true }>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  return { promise, complete, fail };
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  mocks.annual = { companyId: 7, year: 2027, closed: false };
  mocks.data = { year: 2027, items: [source()] };
  mocks.error = null;
  mocks.loading = false;
  mocks.manager = true;
  mocks.status = "open";
  mocks.leader = null;
  mocks.resolve.mockResolvedValue({ success: true });
  mocks.refetch.mockResolvedValue({});
  mocks.create.mockResolvedValue({ year: 2028 });
  mocks.close.mockResolvedValue({});
  mocks.invalidate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AnnualHistoricalPendingPanel · contrato anual histórico", () => {
  it("consulta sólo al desplegar, mantiene los orígenes separados y no ofrece links ni porcentajes", async () => {
    render(<AnnualHistoricalPendingPanel companyId={7} />);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    openPanel();
    await waitFor(() => expect(screen.getByText("Origen 2026")).toBeTruthy());
    expect(mocks.query).toHaveBeenLastCalledWith(
      { companyId: 7, year: 2027 },
      expect.objectContaining({ enabled: true, retry: false })
    );
    expect(
      screen.getByText(
        /No son acciones nuevas ni se incluyen en los indicadores de 2027/
      )
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText("Resuelto 2027")).toBeNull();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("filtra kind y proceso, omite el propio año y evita duplicar una identidad", async () => {
    const own = source({ processId: 13, id: "linked:13:11" });
    mocks.data.items = [
      own,
      own,
      source({
        id: "inspection:1",
        processId: 13,
        kind: "inspection_finding",
        title: "Hallazgo",
      }),
      source({ id: "other:4", processId: 4, title: "Otro proceso" }),
      source({
        id: "new:1",
        processId: 13,
        sourceYear: 2027,
        title: "Acción actual",
      }),
    ];
    render(
      <AnnualHistoricalPendingPanel
        companyId={7}
        processId={13}
        kind="program_action"
      />
    );
    openPanel();
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(mocks.query).toHaveBeenLastCalledWith(
      { companyId: 7, year: 2027, processId: 13 },
      expect.anything()
    );
    expect(screen.queryByText("Otro proceso")).toBeNull();
    expect(screen.queryByText("Acción actual")).toBeNull();
    expect(screen.queryByText("Hallazgo")).toBeNull();
  });

  it("permite el filtro de hallazgos sin convertirlos en acciones nuevas", async () => {
    mocks.data.items.push(
      source({
        id: "inspection:1",
        kind: "inspection_finding",
        title: "Hallazgo anterior",
      })
    );
    render(
      <AnnualHistoricalPendingPanel companyId={7} kind="inspection_finding" />
    );
    openPanel();
    await waitFor(() =>
      expect(screen.getByText("Hallazgo anterior")).toBeTruthy()
    );
    expect(screen.queryByText("Acción de origen 2026")).toBeNull();
    expect(screen.getByText("Inspección · Hallazgo histórico")).toBeTruthy();
  });

  it("guarda las notas sólo onBlur, sin alterar el cursor ante una consulta nueva", async () => {
    const view = render(<AnnualHistoricalPendingPanel companyId={7} />);
    openPanel();
    const editor = notes();
    editor.focus();
    fireEvent.change(editor, {
      target: { value: "Borrador largo en edición" },
    });
    editor.setSelectionRange(9, 9);
    mocks.data = {
      year: 2027,
      items: [
        source({
          notes: "Respuesta vieja",
          status: "completed",
          resolvedYear: 2027,
        }),
      ],
    };
    view.rerender(<AnnualHistoricalPendingPanel companyId={7} />);
    expect(editor.value).toBe("Borrador largo en edición");
    expect(editor.selectionStart).toBe(9);
    expect(checkbox().checked).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
    fireEvent.blur(editor);
    await waitFor(() =>
      expect(mocks.resolve).toHaveBeenCalledWith({
        companyId: 7,
        year: 2027,
        id: source().id,
        status: "pending",
        notes: "Borrador largo en edición",
      })
    );
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    expect(editor.value).toBe("Borrador largo en edición");
  });

  it("envía estados explícitos válidos y sólo confirma el badge después de éxito", async () => {
    const job = deferred();
    mocks.resolve.mockReturnValueOnce(job.promise);
    render(<AnnualHistoricalPendingPanel companyId={7} />);
    openPanel();
    fireEvent.click(checkbox());
    expect(mocks.resolve).toHaveBeenCalledWith({
      companyId: 7,
      year: 2027,
      id: source().id,
      status: "completed",
      notes: "Nota original",
    });
    expect(screen.queryByText("Resuelto 2027")).toBeNull();
    await act(async () => {
      job.complete({ success: true });
      await job.promise;
    });
    expect(screen.getByText("Resuelto 2027")).toBeTruthy();
    fireEvent.click(checkbox());
    await waitFor(() =>
      expect(mocks.resolve).toHaveBeenLastCalledWith({
        companyId: 7,
        year: 2027,
        id: source().id,
        status: "pending",
        notes: "Nota original",
      })
    );
    await waitFor(() => expect(screen.queryByText("Resuelto 2027")).toBeNull());
    expect(mocks.data.items[0].status).toBe("pending");
    expect(mocks.data.items[0].sourceYear).toBe(2026);
  });

  it("serializa blur+checkbox concurrentes y drena su última versión antes de salir del año", async () => {
    const first = deferred();
    const second = deferred();
    mocks.resolve
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<AnnualHistoricalPendingPanel companyId={7} />);
    openPanel();
    fireEvent.change(notes(), { target: { value: "Primer avance" } });
    fireEvent.blur(notes());
    fireEvent.change(notes(), { target: { value: "Avance final" } });
    fireEvent.click(checkbox());
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    let drained = false;
    const exit = flushAnnualExitGuards().then(result => {
      drained = result;
      return result;
    });
    await act(async () => {
      first.complete({ success: true });
      await first.promise;
    });
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(2));
    expect(drained).toBe(false);
    expect(mocks.resolve).toHaveBeenLastCalledWith({
      companyId: 7,
      year: 2027,
      id: source().id,
      status: "completed",
      notes: "Avance final",
    });
    await act(async () => {
      second.complete({ success: true });
      await second.promise;
      expect(await exit).toBe(true);
    });
    expect(notes().value).toBe("Avance final");
    expect(screen.getByText("Resuelto 2027")).toBeTruthy();
  });

  it("mantiene notas sin blur al colapsar y las drena con la guarda anual registrada", async () => {
    const view = render(<AnnualHistoricalPendingPanel companyId={7} />);
    openPanel();
    expect(hasAnnualExitGuards()).toBe(true);
    fireEvent.change(notes(), {
      target: { value: "No descartar al colapsar" },
    });
    openPanel();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    await act(async () => expect(await flushAnnualExitGuards()).toBe(true));
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "No descartar al colapsar", year: 2027 })
    );
    openPanel();
    expect(notes().value).toBe("No descartar al colapsar");
    view.unmount();
    expect(hasAnnualExitGuards()).toBe(false);
  });

  it("presenta errores de resolve, preserva borradores ante refetch y bloquea salida si falla", async () => {
    mocks.resolve.mockRejectedValue(
      new Error("No tiene permiso para resolver este histórico")
    );
    const view = render(<AnnualHistoricalPendingPanel companyId={7} />);
    openPanel();
    fireEvent.change(notes(), {
      target: { value: "Preservar mi explicación" },
    });
    fireEvent.click(checkbox());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "No tiene permiso"
      )
    );
    expect(screen.queryByText("Resuelto 2027")).toBeNull();
    mocks.data = {
      year: 2027,
      items: [source({ notes: "Servidor anterior" })],
    };
    view.rerender(<AnnualHistoricalPendingPanel companyId={7} />);
    expect(notes().value).toBe("Preservar mi explicación");
    expect(checkbox().checked).toBe(true);
    await act(async () => expect(await flushAnnualExitGuards()).toBe(false));
    mocks.resolve.mockResolvedValue({ success: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar resolución" })
    );
    await waitFor(() => expect(screen.getByText("Resuelto 2027")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mantiene el indicador publicado de Programas y separa los hallazgos históricos", async () => {
    mocks.data.items.push(
      source({
        id: "inspection:1",
        kind: "inspection_finding",
        title: "Hallazgo sólo de Inspecciones",
      })
    );
    render(<ManagementPrograms />);
    expect(screen.getByText("0%")).toBeTruthy();
    openPanel();
    expect(screen.getByText("Acción de origen 2026")).toBeTruthy();
    expect(screen.queryByText("Hallazgo sólo de Inspecciones")).toBeNull();
    fireEvent.click(checkbox());
    await waitFor(() => expect(screen.getByText("Resuelto 2027")).toBeTruthy());
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByText(/No hay programas registrados/)).toBeTruthy();
  });

  it("mantiene Inspecciones del año nuevo vacías y permite resolver solamente su pendiente histórico", async () => {
    localStorage.setItem("managerCompanyId", "7");
    mocks.data.items.push(source({ id: "inspection:1", kind: "inspection_finding", title: "Hallazgo de 2026" }));
    render(<InspectionControl />);
    openPanel();
    expect(screen.getByText("Hallazgo de 2026")).toBeTruthy();
    expect(screen.queryByText("Acción de origen 2026")).toBeNull();
    fireEvent.click(checkbox());
    await waitFor(() => expect(screen.getByText("Resuelto 2027")).toBeTruthy());
    expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ id: "inspection:1", year: 2027 }));
    localStorage.removeItem("managerCompanyId");
  });

  it("pasa el proceso de sesión del jefe y no suma su resolución a pendientes actuales", async () => {
    mocks.manager = false;
    mocks.leader = { companyId: 7, processId: 13 };
    mocks.data.items = [
      source({ id: "linked:13:11", processId: 13 }),
      source({ id: "linked:4:11", processId: 4, title: "Histórico ajeno" }),
      source({ id: "raw:12", title: "Sin vínculo" }),
    ];
    render(<LinkedCommitments />);
    openPanel();
    expect(mocks.query).toHaveBeenLastCalledWith(
      { companyId: 7, year: 2027, processId: 13 },
      expect.anything()
    );
    expect(screen.queryByText("Histórico ajeno")).toBeNull();
    expect(screen.queryByText("Sin vínculo")).toBeNull();
    expect(screen.getByText("0")).toBeTruthy();
    fireEvent.click(checkbox());
    await waitFor(() => expect(screen.getByText("Resuelto 2027")).toBeTruthy());
    expect(screen.getByText("0")).toBeTruthy();
    expect(
      screen.getByText(/Aún no hay responsabilidades vinculadas/)
    ).toBeTruthy();
    expect(
      screen.getByText(/No hay actividades propias planificadas/)
    ).toBeTruthy();
  });

  it("Gerencia puede consultar históricos sin vínculo y sin processId en Compromisos", () => {
    render(<LinkedCommitments />);
    openPanel();
    expect(mocks.query).toHaveBeenLastCalledWith(
      { companyId: 7, year: 2027 },
      expect.anything()
    );
    expect(screen.getByText("Acción de origen 2026")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("no finge éxito ante una respuesta sin confirmación", async () => {
    mocks.resolve.mockResolvedValue({ success: false });
    render(<AnnualHistoricalPendingPanel companyId={7} />);
    openPanel();
    fireEvent.click(checkbox());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("no confirmó")
    );
    expect(screen.queryByText("Resuelto 2027")).toBeNull();
  });

  it.each(["closed", "prop", "otherYear", "otherCompany"])(
    "bloquea escrituras en consulta (%s) pero permite desplegar",
    async mode => {
      if (mode === "closed") mocks.annual.closed = true;
      if (mode === "otherYear") mocks.data.year = 2028;
      render(
        <AnnualHistoricalPendingPanel
          companyId={mode === "otherCompany" ? 8 : 7}
          readOnly={mode === "prop"}
          year={mode === "otherYear" ? 2028 : undefined}
        />
      );
      openPanel();
      expect(notes().readOnly).toBe(true);
      expect(checkbox().disabled).toBe(true);
      expect(screen.getByText(/Solo consulta/)).toBeTruthy();
      fireEvent.change(notes(), { target: { value: "No escribir" } });
      fireEvent.blur(notes());
      await act(async () => expect(await flushAnnualExitGuards()).toBe(true));
      expect(mocks.resolve).not.toHaveBeenCalled();
    }
  );

  it("un cierre durante edición conserva el borrador y no lo drena como éxito", async () => {
    const view = render(<AnnualHistoricalPendingPanel companyId={7} />);
    openPanel();
    fireEvent.change(notes(), { target: { value: "Nota antes del cierre" } });
    mocks.annual = { ...mocks.annual, closed: true };
    view.rerender(<AnnualHistoricalPendingPanel companyId={7} />);
    await act(async () => expect(await flushAnnualExitGuards()).toBe(false));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(notes().value).toBe("Nota antes del cierre");
    expect(screen.getByRole("alert").textContent).toContain("año cerrado");
  });

  it("no presenta un error de consulta como lista vacía y permite reintentar", () => {
    mocks.error = new Error("Consulta rechazada");
    mocks.data = { year: 2027, items: [] };
    render(<AnnualHistoricalPendingPanel companyId={7} />);
    openPanel();
    expect(screen.getByRole("alert").textContent).toContain(
      "Consulta rechazada"
    );
    expect(screen.queryByText(/No hay pendientes/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar consulta" })
    );
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("consulta sin completar el otro detailYear en Gestionar años, sin alterar incorporación", async () => {
    render(<AnnualWorkspaces />);
    expect(screen.getByText(/1 de 2 procesos incorporados/)).toBeTruthy();
    mocks.data = { year: 2028, items: [source()] };
    fireEvent.click(screen.getByRole("button", { name: "2028 · Abierto" }));
    openPanel();
    expect(mocks.query).toHaveBeenLastCalledWith(
      { companyId: 7, year: 2028 },
      expect.objectContaining({ enabled: true })
    );
    expect(checkbox().disabled).toBe(true);
    expect(notes().readOnly).toBe(true);
    expect(screen.getByText(/1 de 2 procesos incorporados/)).toBeTruthy();
    await act(async () => expect(await flushAnnualExitGuards()).toBe(true));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("conserva un borrador del detailYear previo y nunca lo guarda en el nuevo año", async () => {
    const view = render(
      <AnnualHistoricalPendingPanel companyId={7} year={2027} />
    );
    openPanel();
    fireEvent.change(notes(), { target: { value: "Nota del detalle 2027" } });
    mocks.data = {
      year: 2028,
      items: [source({ notes: "Nota consulta 2028" })],
    };
    view.rerender(<AnnualHistoricalPendingPanel companyId={7} year={2028} />);
    expect(notes().value).toBe("Nota consulta 2028");
    expect(checkbox().disabled).toBe(true);
    await act(async () => expect(await flushAnnualExitGuards()).toBe(true));
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2027, notes: "Nota del detalle 2027" })
    );
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    mocks.data = {
      year: 2027,
      items: [source({ notes: "Nota del detalle 2027" })],
    };
    view.rerender(<AnnualHistoricalPendingPanel companyId={7} year={2027} />);
    expect(notes().value).toBe("Nota del detalle 2027");
  });
});
