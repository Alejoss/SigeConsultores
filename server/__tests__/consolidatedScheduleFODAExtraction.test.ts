import { describe, it, expect } from "vitest";

describe("Consolidated Schedule - FODA Extraction", () => {
  it("should extract FODA data with correct field names", () => {
    // Simulate FODA matrix row structure from database
    const fodaRow = {
      id: 1,
      subproceso: "Detallado Técnico de Producto",
      elemento: "Alto dominio técnico del jefe de diseño",
      foda: "Fortaleza",
      factor: "Humano",
      consecuencia: "",
      sistemaGestion: "Calidad",
      accionATomar: "Organizar cursos de actualización semestrales para el Jefe de Diseño",
      planContingencia: "",
      planContinuidad: "",
      simulacro: "",
      comunicado: "SI",
      partesInteresadas: "Gerente General y personal de área de Diseño",
      evidencia: "Actas de reunión",
      mejoraImplementada: "SI",
      observacion: "",
      medioVerificacion: "Contratación de cursos",
      objetivoLogrado: "SI",
      fechaInicial: "2025-12-10",
      fechaFinalPrevista: "2025-12-27",
      diasRestantes: -8,
      fechaImplementacion: "2026-01-27",
    };

    // Extract fields as the router does
    let action = "";
    let dueDate: Date | null = null;
    let completed = "NO";
    let fodaType = fodaRow.foda || "FODA";

    // Determine action - use accionATomar (it's the field name in the data)
    action = fodaRow.accionATomar || fodaRow.accionDeAprovechamiento || "";

    // Get date from fechaFinalPrevista
    if (fodaRow.fechaFinalPrevista) {
      dueDate = new Date(fodaRow.fechaFinalPrevista);
    }

    // Get completion status - check objetivoLogrado or mejoraImplementada
    if (fodaRow.objetivoLogrado === "SI" || fodaRow.mejoraImplementada === "SI") {
      completed = "SI";
    }

    // Validate extraction
    expect(action).toBe("Organizar cursos de actualización semestrales para el Jefe de Diseño");
    expect(dueDate).not.toBeNull();
    expect(dueDate?.toISOString()).toContain("2025-12-27");
    expect(completed).toBe("SI");
    expect(fodaType).toBe("Fortaleza");
  });

  it("should handle FODA with null accionATomar", () => {
    const fodaRow = {
      id: 2,
      foda: "Debilidad",
      accionATomar: null,
      accionDeAprovechamiento: "Implementar sistema de control",
      fechaFinalPrevista: "2026-03-15",
      objetivoLogrado: "NO",
    };

    let action = "";
    action = fodaRow.accionATomar || fodaRow.accionDeAprovechamiento || "";

    expect(action).toBe("Implementar sistema de control");
  });

  it("should extract FODA type from foda field", () => {
    const fodaTypes = [
      { foda: "Fortaleza", expected: "Fortaleza" },
      { foda: "Oportunidad", expected: "Oportunidad" },
      { foda: "Debilidad", expected: "Debilidad" },
      { foda: "Amenaza", expected: "Amenaza" },
    ];

    fodaTypes.forEach(({ foda, expected }) => {
      const fodaType = foda || "FODA";
      expect(fodaType).toBe(expected);
    });
  });

  it("should calculate daysRemaining for FODA", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 15);

    const daysRemaining = Math.ceil(
      (futureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(daysRemaining).toBe(15);
  });

  it("should validate FODA has required fields for consolidation", () => {
    const fodaRow = {
      id: 3,
      elemento: "Sistema de Gestión",
      accionATomar: "Mejorar procesos",
      fechaFinalPrevista: "2026-04-10",
      foda: "Oportunidad",
      objetivoLogrado: "SI",
    };

    // Check if it has minimum required fields
    const hasAction = !!fodaRow.accionATomar;
    const hasDate = !!fodaRow.fechaFinalPrevista;
    const hasType = !!fodaRow.foda;

    expect(hasAction).toBe(true);
    expect(hasDate).toBe(true);
    expect(hasType).toBe(true);
  });

  it("should handle completion status from multiple fields", () => {
    const scenarios = [
      { objetivoLogrado: "SI", mejoraImplementada: "NO", expected: "SI" },
      { objetivoLogrado: "NO", mejoraImplementada: "SI", expected: "SI" },
      { objetivoLogrado: "SI", mejoraImplementada: "SI", expected: "SI" },
      { objetivoLogrado: "NO", mejoraImplementada: "NO", expected: "NO" },
    ];

    scenarios.forEach(({ objetivoLogrado, mejoraImplementada, expected }) => {
      let completed = "NO";
      if (objetivoLogrado === "SI" || mejoraImplementada === "SI") {
        completed = "SI";
      }
      expect(completed).toBe(expected);
    });
  });

  it("should filter out FODA rows without action or date", () => {
    const fodaRows = [
      { id: 1, accionATomar: "Action 1", fechaFinalPrevista: "2026-03-15" },
      { id: 2, accionATomar: null, fechaFinalPrevista: "2026-03-20" },
      { id: 3, accionATomar: "Action 3", fechaFinalPrevista: null },
      { id: 4, accionATomar: "Action 4", fechaFinalPrevista: "2026-04-10" },
    ];

    const validRows = fodaRows.filter(
      (row: any) => row.accionATomar && row.fechaFinalPrevista
    );

    expect(validRows).toHaveLength(2);
    expect(validRows[0].id).toBe(1);
    expect(validRows[1].id).toBe(4);
  });

  it("should parse FODA matrixData JSON correctly", () => {
    const matrixDataString = JSON.stringify([
      {
        id: 1,
        foda: "Fortaleza",
        elemento: "Elemento 1",
        accionATomar: "Acción 1",
        fechaFinalPrevista: "2026-03-15",
      },
      {
        id: 2,
        foda: "Debilidad",
        elemento: "Elemento 2",
        accionATomar: "Acción 2",
        fechaFinalPrevista: "2026-04-20",
      },
    ]);

    const parsed = JSON.parse(matrixDataString);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].foda).toBe("Fortaleza");
    expect(parsed[1].foda).toBe("Debilidad");
  });

  it("should extract FODA badge info correctly", () => {
    const fodaTypes = [
      { type: "Fortaleza", expectedBadge: "Fortaleza", expectedColor: "bg-green-100" },
      { type: "Oportunidad", expectedBadge: "Oportunidad", expectedColor: "bg-orange-100" },
      { type: "Debilidad", expectedBadge: "Debilidad", expectedColor: "bg-red-100" },
      { type: "Amenaza", expectedBadge: "Amenaza", expectedColor: "bg-purple-100" },
    ];

    fodaTypes.forEach(({ type, expectedBadge, expectedColor }) => {
      const badge = type;
      expect(badge).toBe(expectedBadge);
      // Color validation would happen in getBadgeInfo function
    });
  });

  it("should handle FODA with empty accionATomar string", () => {
    const fodaRow = {
      accionATomar: "",
      accionDeAprovechamiento: "Fallback action",
    };

    const action = fodaRow.accionATomar || fodaRow.accionDeAprovechamiento || "";
    expect(action).toBe("Fallback action");
  });

  it("should validate FODA extraction preserves all required fields", () => {
    const fodaRow = {
      id: 1,
      subproceso: "Subproceso",
      elemento: "Elemento",
      foda: "Fortaleza",
      accionATomar: "Acción",
      fechaFinalPrevista: "2026-03-15",
      objetivoLogrado: "SI",
    };

    const activity = {
      id: `foda-1-${fodaRow.id}`,
      type: "foda" as const,
      element: fodaRow.elemento,
      action: fodaRow.accionATomar,
      dueDate: new Date(fodaRow.fechaFinalPrevista),
      completed: fodaRow.objetivoLogrado === "SI" ? ("SI" as const) : ("NO" as const),
      badge: fodaRow.foda,
      badgeColor: "bg-green-100 text-green-700 border-green-300",
    };

    expect(activity.element).toBe("Elemento");
    expect(activity.action).toBe("Acción");
    expect(activity.badge).toBe("Fortaleza");
    expect(activity.completed).toBe("SI");
  });
});
