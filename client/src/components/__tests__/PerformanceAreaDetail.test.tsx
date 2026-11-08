// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceAreaDetail } from "../PerformanceAreaDetail";

type QueryResult = {
  data: any;
  isLoading: boolean;
  error: Error | null;
  isPlaceholderData?: boolean;
};
const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  commitments: vi.fn(),
  characterization: vi.fn(),
  dashboard: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    processMap: { get: { useQuery: mocks.process } },
    linkedCommitments: { listByProcess: { useQuery: mocks.commitments } },
    processCharacterization: {
      getByProcessId: { useQuery: mocks.characterization },
    },
    processParticipants: {
      performanceDashboard: { useQuery: mocks.dashboard },
    },
  },
}));

function result(data: any, overrides: Partial<QueryResult> = {}): QueryResult {
  return { data, isLoading: false, error: null, ...overrides };
}
function commitment(
  sourceType: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 1,
    companyId: 12,
    processId: 34,
    sourceType,
    kind: "action",
    title: `Responsabilidad ${sourceType}`,
    description: `Descripción ${sourceType}`,
    dueDate: "2026-11-09",
    status: "pending",
    notes: null,
    sourceProgress: { fulfilled: 0, total: 1 },
    ...overrides,
  };
}
function worker(overrides: Record<string, unknown> = {}) {
  return {
    assignment: { id: 301, processParticipantId: 21, payrollEmployeeId: 501 },
    employee: {
      id: 501,
      companyId: 12,
      currentProcessParticipantId: 21,
      fullName: "Ana Proceso",
      position: "Analista",
      area: "Calidad",
    },
    performance: 79.4,
    kpis: [
      {
        id: 701,
        name: "Entregas verificadas",
        monthlyTarget: "10",
        percentage: 120,
        values: [{ month: 1, actualValue: "12" }],
      },
    ],
    ...overrides,
  };
}
function dashboard(overrides: Record<string, unknown> = {}) {
  return {
    totalPositions: 1,
    totalAssignedWorkers: 1,
    pendingEvaluations: 0,
    totalPerformance: 79.4,
    participants: [
      {
        participant: {
          id: 21,
          processCharacterizationId: 200,
          position: "Puesto Calidad",
        },
        workerCount: 1,
        managementPercentage: 83.7,
        workers: [worker()],
        availableWorkers: [{ fullName: "Candidato de otra área" }],
      },
    ],
    ...overrides,
  };
}
function mount(
  props: Partial<React.ComponentProps<typeof PerformanceAreaDetail>> = {}
) {
  return render(
    <PerformanceAreaDetail
      view="sgi"
      companyId={12}
      processId={34}
      onBack={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  // Este archivo se ejecuta en unit sin cambiar la configuración global ni añadir plugins.
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  mocks.process
    .mockReset()
    .mockReturnValue(result({ id: 34, companyId: 12, name: "Área Calidad" }));
  mocks.commitments.mockReset().mockReturnValue(result([]));
  mocks.characterization
    .mockReset()
    .mockReturnValue(result({ id: 200, processId: 34 }));
  mocks.dashboard.mockReset().mockReturnValue(result(dashboard()));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PerformanceAreaDetail: autorización y selección", () => {
  it("consulta el proceso autorizado usando solo props, no selección almacenada", () => {
    localStorage.setItem("selectedProcessId", "999");
    localStorage.setItem("selectedProcessName", "Nombre ajeno");
    try {
      mount();
      expect(mocks.process).toHaveBeenCalledWith(
        { processId: 34 },
        expect.objectContaining({ enabled: true, retry: false })
      );
      expect(mocks.commitments).toHaveBeenCalledWith(
        { companyId: 12, processId: 34 },
        expect.objectContaining({ retry: false })
      );
      expect(screen.getByText("Área Calidad")).toBeTruthy();
      expect(screen.queryByText("Nombre ajeno")).toBeNull();
    } finally {
      localStorage.clear();
    }
  });

  it.each(["sgi", "staff"] as const)(
    "no monta consultas de detalle mientras valida acceso para %s",
    view => {
      mocks.process.mockReturnValue(result(undefined, { isLoading: true }));
      mount({ view });
      expect(screen.getByRole("status").textContent).toContain(
        "Verificando acceso"
      );
      expect(mocks.commitments).not.toHaveBeenCalled();
      expect(mocks.characterization).not.toHaveBeenCalled();
      expect(mocks.dashboard).not.toHaveBeenCalled();
    }
  );

  it.each([
    result(
      { id: 34, companyId: 12, name: "Datos retenidos" },
      { error: new Error("Forbidden") }
    ),
    result({ id: 34, companyId: 99, name: "Otra empresa" }),
    result({ id: 99, companyId: 12, name: "Otro proceso" }),
    result(null),
    result(
      { id: 34, companyId: 12, name: "Placeholder" },
      { isPlaceholderData: true }
    ),
  ])(
    "bloquea error, empresa ajena, id distinto, proceso inexistente y placeholder (%#)",
    processResult => {
      mocks.process.mockReturnValue(processResult);
      mount({ view: "staff" });
      expect(screen.getByRole("alert").textContent).toContain(
        "No se pudo verificar el acceso"
      );
      expect(screen.queryByText("Ana Proceso")).toBeNull();
      expect(mocks.commitments).not.toHaveBeenCalled();
      expect(mocks.characterization).not.toHaveBeenCalled();
      expect(mocks.dashboard).not.toHaveBeenCalled();
    }
  );

  it("desactiva consulta y muestra error cuando no hay proceso válido", () => {
    mount({ processId: 0 });
    expect(mocks.process).toHaveBeenCalledWith(
      { processId: 0 },
      expect.objectContaining({ enabled: false })
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(mocks.commitments).not.toHaveBeenCalled();
  });

  it("oculta el detalle anterior al cambiar proceso y consulta exclusivamente el nuevo", () => {
    mocks.commitments.mockImplementation(({ processId }) =>
      result([
        commitment("program_action", {
          processId,
          title: `Programa del proceso ${processId}`,
        }),
      ])
    );
    const view = mount();
    expect(screen.getByText("Programa del proceso 34")).toBeTruthy();
    view.rerender(
      <PerformanceAreaDetail
        view="sgi"
        companyId={12}
        processId={35}
        onBack={vi.fn()}
      />
    );
    expect(screen.queryByText("Programa del proceso 34")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(mocks.commitments).toHaveBeenCalledTimes(1);
    mocks.process.mockReturnValue(
      result({ id: 35, companyId: 12, name: "Área Producción" })
    );
    view.rerender(
      <PerformanceAreaDetail
        view="sgi"
        companyId={12}
        processId={35}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText("Programa del proceso 35")).toBeTruthy();
    expect(mocks.commitments).toHaveBeenLastCalledWith(
      { companyId: 12, processId: 35 },
      expect.anything()
    );
  });

  it.each([
    ["sgi", "Volver a Sistemas de Gestión"],
    ["staff", "Volver a Desempeño de Personal"],
  ] as const)(
    "el botón %s ejecuta onBack sin editar ni navegar por su cuenta",
    (view, label) => {
      const onBack = vi.fn();
      mount({ view, onBack });
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(onBack).toHaveBeenCalledTimes(1);
    }
  );
});

describe("PerformanceAreaDetail: responsabilidades SIG", () => {
  it("incluye únicamente fuentes SIG del proceso/empresa y excluye propias, reuniones, cambios y OTG", () => {
    const sources = [
      "checklist_action",
      "checklist_vigency",
      "program_action",
      "audit_finding",
      "inspection_finding",
      "company_compliance",
    ];
    const excluded = ["own", "meeting_agreement", "change_action", "otg"];
    mocks.commitments.mockReturnValue(
      result([
        ...sources.map((source, index) =>
          commitment(source, { id: index + 1 })
        ),
        ...excluded.map((source, index) =>
          commitment(source, { id: 10 + index })
        ),
        commitment("program_action", {
          id: 20,
          companyId: 99,
          title: "Programa otra empresa",
        }),
        commitment("audit_finding", {
          id: 21,
          processId: 99,
          title: "Hallazgo otro proceso",
        }),
      ])
    );
    const view = mount();
    sources.forEach(source =>
      expect(screen.getByText(`Responsabilidad ${source}`)).toBeTruthy()
    );
    excluded.forEach(source =>
      expect(screen.queryByText(`Responsabilidad ${source}`)).toBeNull()
    );
    expect(screen.queryByText("Programa otra empresa")).toBeNull();
    expect(screen.queryByText("Hallazgo otro proceso")).toBeNull();
    expect(screen.getByText("Capacitaciones")).toBeTruthy();
    expect(
      screen.getByText(/no dispone de vinculación por proceso/)
    ).toBeTruthy();
    expect(
      view.container.querySelectorAll("input, textarea, select, form")
    ).toHaveLength(0);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("presenta descripción, fecha, estado y avance existentes sin inventar un promedio", () => {
    mocks.commitments.mockReturnValue(
      result([
        commitment("program_action", {
          description: "Plan vigente",
          notes: "Revisión en curso",
          dueDate: new Date("2026-11-15T00:00:00Z"),
          sourceProgress: { fulfilled: 1, total: 2 },
        }),
        commitment("checklist_vigency", {
          id: 2,
          kind: "vigency",
          status: "completed",
          dueDate: null,
          sourceProgress: null,
        }),
      ])
    );
    mount();
    expect(screen.getByText("Plan vigente")).toBeTruthy();
    expect(screen.getByText("Notas: Revisión en curso")).toBeTruthy();
    expect(screen.getByText("2026-11-15")).toBeTruthy();
    expect(screen.getByText("Pendiente")).toBeTruthy();
    expect(screen.getByText("Vigencia renovada")).toBeTruthy();
    expect(screen.getByText("1 de 2 responsabilidades cumplidas")).toBeTruthy();
    expect(screen.getByText("Sin avance registrado")).toBeTruthy();
    expect(screen.getByText("Sin fecha")).toBeTruthy();
    expect(screen.queryByText("50%")).toBeNull();
    expect(screen.getByText(/no se calcula un KPI global nuevo/)).toBeTruthy();
  });

  it("explicita el vacío cuando solo existen compromisos fuera de SIG", () => {
    mocks.commitments.mockReturnValue(
      result([commitment("own"), commitment("meeting_agreement", { id: 2 })])
    );
    mount();
    expect(
      screen.getByText(
        "No hay responsabilidades SIG vinculadas a este proceso."
      )
    ).toBeTruthy();
    expect(
      screen.getAllByText("Sin registros vinculados a este proceso.")
    ).toHaveLength(5);
  });

  it("muestra carga de responsabilidades y oculta datos si ocurre un error", () => {
    mocks.commitments.mockReturnValue(result(undefined, { isLoading: true }));
    const view = mount();
    expect(screen.getByRole("status").textContent).toContain(
      "Cargando responsabilidades SIG"
    );
    mocks.commitments.mockReturnValue(
      result([commitment("program_action")], { error: new Error("Forbidden") })
    );
    view.rerender(
      <PerformanceAreaDetail
        view="sgi"
        companyId={12}
        processId={34}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "No se pudieron cargar"
    );
    expect(screen.queryByText("Responsabilidad program_action")).toBeNull();
  });

  it("contiene tablas anchas en regiones desplazables y botón adaptable para pantallas estrechas", () => {
    mocks.commitments.mockReturnValue(result([commitment("program_action")]));
    const view = mount();
    const region = screen.getByRole("region", {
      name: "Programas: responsabilidades vinculadas",
    });
    expect(region.classList.contains("overflow-x-auto")).toBe(true);
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(within(region).getByRole("table")).toBeTruthy();
    expect(
      view.container.firstElementChild?.classList.contains("min-w-0")
    ).toBe(true);
    expect(
      screen.getByRole("button").classList.contains("whitespace-normal")
    ).toBe(true);
  });
});

describe("PerformanceAreaDetail: Personal", () => {
  it("resuelve caracterización por proceso y conserva resumen/por trabajador del año actual sin recalcular", () => {
    const view = mount({ view: "staff" });
    expect(mocks.characterization).toHaveBeenCalledWith(
      { processId: 34 },
      expect.anything()
    );
    expect(mocks.dashboard).toHaveBeenCalledWith(
      {
        companyId: 12,
        processCharacterizationId: 200,
        year: new Date().getFullYear(),
      },
      expect.anything()
    );
    expect(mocks.commitments).not.toHaveBeenCalled();
    expect(screen.getByText("79.4%")).toBeTruthy();
    expect(screen.getByText(/Gestión del puesto: 83.7%/)).toBeTruthy();
    expect(screen.getByText("Desempeño: 79.4%")).toBeTruthy();
    expect(screen.getByText("Ana Proceso")).toBeTruthy();
    expect(screen.getByText("Entregas verificadas")).toBeTruthy();
    expect(screen.getByText(/Resultado: 120.0%/)).toBeTruthy();
    expect(screen.getByText("Resultados mensuales: 01: 12")).toBeTruthy();
    expect(screen.queryByText("Candidato de otra área")).toBeNull();
    expect(
      view.container.querySelectorAll("input, textarea, select, form")
    ).toHaveLength(0);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("conserva Sin evaluación para nulos y no inventa 0% ni KPI", () => {
    const data = dashboard({ totalPerformance: null, pendingEvaluations: 1 });
    data.participants[0].managementPercentage = null;
    data.participants[0].workers = [worker({ performance: null, kpis: [] })];
    mocks.dashboard.mockReturnValue(result(data));
    mount({ view: "staff" });
    expect(screen.getByText("Sin evaluación")).toBeTruthy();
    expect(screen.getByText("Desempeño: Sin evaluación")).toBeTruthy();
    expect(
      screen.getByText(
        `Sin KPI registrados para ${new Date().getFullYear()}. Sin evaluación.`
      )
    ).toBeTruthy();
    expect(screen.queryByText(/0\.0%/)).toBeNull();
    expect(
      screen.getByText("Pendientes de evaluación").nextElementSibling
        ?.textContent
    ).toBe("1");
  });

  it("preserva una evaluación real de cero y valores mensuales cero", () => {
    const data = dashboard({ totalPerformance: 0 });
    data.participants[0].workers = [
      worker({
        performance: 0,
        kpis: [
          {
            id: 2,
            name: "KPI real",
            monthlyTarget: "10",
            percentage: 0,
            values: [{ month: 2, actualValue: 0 }],
          },
        ],
      }),
    ];
    mocks.dashboard.mockReturnValue(result(data));
    mount({ view: "staff" });
    expect(screen.getByText("0.0%")).toBeTruthy();
    expect(screen.getByText("Desempeño: 0.0%")).toBeTruthy();
    expect(screen.getByText("Resultados mensuales: 02: 0")).toBeTruthy();
  });

  it("no consulta un id ambiguo de proceso cuando aún no tiene caracterización", () => {
    mocks.characterization.mockReturnValue(result(null));
    mount({ view: "staff" });
    expect(screen.getByText(/Aún no dispone de caracterización/)).toBeTruthy();
    expect(screen.getByText(/Sin evaluación/)).toBeTruthy();
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });

  it("informa procesos sin puestos y puestos sin trabajadores", () => {
    mocks.dashboard.mockReturnValue(
      result(
        dashboard({
          participants: [],
          totalPositions: 0,
          totalAssignedWorkers: 0,
          totalPerformance: null,
        })
      )
    );
    const view = mount({ view: "staff" });
    expect(
      screen.getByText("No hay Puestos de Trabajo registrados en este proceso.")
    ).toBeTruthy();
    const data = dashboard({ totalAssignedWorkers: 0, totalPerformance: null });
    data.participants[0].workers = [];
    data.participants[0].workerCount = 0;
    data.participants[0].managementPercentage = null;
    mocks.dashboard.mockReturnValue(result(data));
    view.rerender(
      <PerformanceAreaDetail
        view="staff"
        companyId={12}
        processId={34}
        onBack={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        "No hay trabajadores vinculados a este Puesto de Trabajo."
      )
    ).toBeTruthy();
    expect(screen.getByText(/Gestión del puesto: Sin evaluación/)).toBeTruthy();
  });

  it("admite puestos históricos guardados con el id del proceso autorizado", () => {
    const data = dashboard();
    data.participants[0].participant.processCharacterizationId = 34;
    mocks.dashboard.mockReturnValue(result(data));
    mount({ view: "staff" });
    expect(screen.getByText("Ana Proceso")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("bloquea una caracterización de otro proceso", () => {
    mocks.characterization.mockReturnValue(result({ id: 999, processId: 999 }));
    mount({ view: "staff" });
    expect(screen.getByRole("alert").textContent).toContain(
      "No se pudo verificar la caracterización"
    );
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });

  it.each(["puesto", "empresa", "asignación"])(
    "oculta todo el resumen si devuelve un alcance inválido: %s",
    mismatch => {
      const data = dashboard();
      if (mismatch === "puesto")
        data.participants[0].participant.processCharacterizationId = 999;
      if (mismatch === "empresa")
        data.participants[0].workers[0].employee.companyId = 999;
      if (mismatch === "asignación")
        data.participants[0].workers[0].assignment.processParticipantId = 999;
      mocks.dashboard.mockReturnValue(result(data));
      mount({ view: "staff" });
      expect(screen.getByRole("alert").textContent).toContain(
        "alcance del desempeño"
      );
      expect(screen.queryByText("Ana Proceso")).toBeNull();
      expect(screen.queryByText("Desempeño total del proceso")).toBeNull();
    }
  );

  it("muestra carga/error de caracterización antes de consultar resultados", () => {
    mocks.characterization.mockReturnValue(
      result(undefined, { isLoading: true })
    );
    const view = mount({ view: "staff" });
    expect(screen.getByRole("status").textContent).toContain(
      "Cargando caracterización"
    );
    expect(mocks.dashboard).not.toHaveBeenCalled();
    mocks.characterization.mockReturnValue(
      result({ id: 200, processId: 34 }, { error: new Error("Forbidden") })
    );
    view.rerender(
      <PerformanceAreaDetail
        view="staff"
        companyId={12}
        processId={34}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });

  it("muestra carga/error de desempeño sin reutilizar métricas retenidas en error", () => {
    mocks.dashboard.mockReturnValue(result(undefined, { isLoading: true }));
    const view = mount({ view: "staff" });
    expect(screen.getByRole("status").textContent).toContain(
      "Cargando desempeño"
    );
    mocks.dashboard.mockReturnValue(
      result(dashboard(), { error: new Error("Forbidden") })
    );
    view.rerender(
      <PerformanceAreaDetail
        view="staff"
        companyId={12}
        processId={34}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "No se pudo cargar el desempeño"
    );
    expect(screen.queryByText("Ana Proceso")).toBeNull();
    expect(screen.queryByText("79.4%")).toBeNull();
  });
});
