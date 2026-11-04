import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessLinkDialog } from "./ProcessLinkDialog";

const hooks = vi.hoisted(() => ({
  compliance: vi.fn(),
  finding: vi.fn(),
  map: vi.fn(),
  progress: vi.fn(),
  createLinks: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    linkedCommitments: {
      listAssignableComplianceProcesses: { useQuery: hooks.compliance },
      listAssignableFindingProcesses: { useQuery: hooks.finding },
      listSourceProgress: { useQuery: hooks.progress },
      createLinks: { useMutation: hooks.createLinks },
    },
    processMap: { list: { useQuery: hooks.map } },
  },
}));

type SourceType = React.ComponentProps<typeof ProcessLinkDialog>["sourceType"];
const companyId = 99001;
const sourceId = 99002;
const corporateProcesses = [
  { id: 101, name: "Proceso corporativo A", processType: "strategic" },
  { id: 102, name: "Proceso corporativo B", processType: "support" },
];
const findingProcesses = [
  {
    id: 103,
    name: "Proceso del directorio de hallazgos",
    processType: "operational",
  },
];

function ready(data: typeof corporateProcesses) {
  return { data, isLoading: false, error: null };
}

function renderDialog(sourceType: SourceType) {
  return renderToStaticMarkup(
    React.createElement(ProcessLinkDialog, {
      companyId,
      sourceId,
      sourceType,
      title: "Compromiso sintético",
      onClose: vi.fn(),
      onLinked: vi.fn(),
    })
  );
}

function expectQueries(sourceType: SourceType) {
  const isCompliance = sourceType === "company_compliance";
  const isFinding =
    sourceType === "audit_finding" || sourceType === "inspection_finding";
  expect(hooks.compliance).toHaveBeenLastCalledWith(
    { companyId, sourceId },
    { enabled: isCompliance }
  );
  expect(hooks.finding).toHaveBeenLastCalledWith(
    {
      companyId,
      sourceId,
      sourceType: isFinding ? sourceType : "audit_finding",
    },
    { enabled: isFinding }
  );
  expect(hooks.map).toHaveBeenLastCalledWith(
    { companyId },
    { enabled: !isCompliance && !isFinding }
  );
}

describe("ProcessLinkDialog target directory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The unit project uses classic JSX without the React Vite plugin.
    vi.stubGlobal("React", React);
    hooks.compliance.mockReturnValue(ready(corporateProcesses));
    hooks.finding.mockReturnValue(ready(findingProcesses));
    // Simulate a permission-filtered map containing only one corporate process.
    hooks.map.mockReturnValue(ready([corporateProcesses[0]]));
    hooks.progress.mockReturnValue({
      data: { processIds: [], total: 0, fulfilled: 0 },
      isLoading: false,
      error: null,
    });
    hooks.createLinks.mockReturnValue({
      mutate: hooks.mutate,
      isPending: false,
    });
  });

  afterEach(() => {
    expect(hooks.mutate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("enables the corporate compliance query, disables the map, and renders both company processes", () => {
    const html = renderDialog("company_compliance");

    expectQueries("company_compliance");
    expect(html).toContain("Procesos de la empresa");
    for (const process of corporateProcesses) {
      expect(html).toContain(process.name);
    }
    expect(html).not.toContain(findingProcesses[0].name);
    expect(hooks.progress).toHaveBeenCalledWith({
      companyId,
      sourceType: "company_compliance",
      sourceId,
    });
  });

  it("keeps audit and inspection findings on their finding directory", () => {
    for (const sourceType of ["audit_finding", "inspection_finding"] as const) {
      const html = renderDialog(sourceType);

      expectQueries(sourceType);
      expect(html).toContain(findingProcesses[0].name);
      for (const process of corporateProcesses) {
        expect(html).not.toContain(process.name);
      }
    }
  });

  it("keeps program and both checklist sources on the map despite inactive directory errors", () => {
    const inactiveDirectory = {
      data: undefined,
      isLoading: true,
      error: new Error("Directorio inactivo"),
    };
    hooks.compliance.mockReturnValue(inactiveDirectory);
    hooks.finding.mockReturnValue(inactiveDirectory);

    for (const sourceType of [
      "program_action",
      "checklist_action",
      "checklist_vigency",
    ] as const) {
      const html = renderDialog(sourceType);

      expectQueries(sourceType);
      expect(html).toContain("Procesos del Mapa");
      expect(html).toContain(corporateProcesses[0].name);
      expect(html).not.toContain(corporateProcesses[1].name);
      expect(html).not.toContain(findingProcesses[0].name);
      expect(html).not.toContain("Cargando procesos...");
      expect(html).not.toContain("Directorio inactivo");
    }
  });

  it("uses corporate directory loading instead of displaying cached map processes", () => {
    hooks.compliance.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const html = renderDialog("company_compliance");

    expectQueries("company_compliance");
    expect(html).toContain("Cargando procesos...");
    for (const process of corporateProcesses) {
      expect(html).not.toContain(process.name);
    }
    expect(html).not.toContain("Primero registre procesos");
  });

  it("shows directory errors without falling back to the map or stale directory data", () => {
    const error = new Error("Directorio sintético no disponible");
    hooks.compliance.mockReturnValue({ ...ready(corporateProcesses), error });
    hooks.finding.mockReturnValue({ ...ready(findingProcesses), error });

    for (const sourceType of [
      "company_compliance",
      "audit_finding",
      "inspection_finding",
    ] as const) {
      const html = renderDialog(sourceType);

      expectQueries(sourceType);
      expect(html).toContain('role="alert"');
      expect(html).toContain("No se pudieron cargar los procesos disponibles.");
      expect(html).toContain(error.message);
      for (const process of [...corporateProcesses, ...findingProcesses]) {
        expect(html).not.toContain(process.name);
      }
      expect(html).not.toContain("Primero registre procesos");
      expect(html).not.toContain("Cargando procesos...");
    }
  });
});
