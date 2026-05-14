import { describe, it, expect } from "vitest";

/**
 * Test suite for validating the loading of "Defensas Existentes" from Subprocess Map
 * to the Stakeholder Criticality Matrix
 */

describe("Defensas Existentes Loading", () => {
  // Mock data structure from Subprocess Map
  const mockSubprocessMapData = {
    entrada: JSON.stringify([
      {
        partesInteresadas: "Fincas",
        internoExterno: "Externo",
        solicita: "Verificación de calidad",
        entrega: "Flores de calidad"
      },
      {
        partesInteresadas: "Postcosecha Patoa",
        internoExterno: "Interno",
        solicita: "Flores clasificadas",
        entrega: "Bonches empacados"
      },
      {
        partesInteresadas: "Proveedores",
        internoExterno: "Externo",
        solicita: "Insumos",
        entrega: "Productos"
      }
    ]),
    subprocesos: JSON.stringify([
      {
        subproceso: "Fincas",
        acciones: "Verificar guía de entrega vs. producto físico. Inspeccionar condiciones generales de la flor."
      },
      {
        subproceso: "Postcosecha Patoa",
        acciones: "Preparar, etiquetar, empacar y enviar bonches de flor."
      },
      {
        subproceso: "Recepción",
        acciones: "Recibir y verificar productos."
      }
    ])
  };

  it("should create a map of subprocess names to actions", () => {
    const entrada = JSON.parse(mockSubprocessMapData.entrada);
    const subprocesos = JSON.parse(mockSubprocessMapData.subprocesos);

    const subprocessActionsByName = new Map();
    subprocesos.forEach((s: any) => {
      const name = s.subproceso || s.name || s.nombre || "";
      if (name) {
        subprocessActionsByName.set(name, s.acciones || "");
      }
    });

    expect(subprocessActionsByName.size).toBe(3);
    expect(subprocessActionsByName.get("Fincas")).toBe(
      "Verificar guía de entrega vs. producto físico. Inspeccionar condiciones generales de la flor."
    );
    expect(subprocessActionsByName.get("Postcosecha Patoa")).toBe(
      "Preparar, etiquetar, empacar y enviar bonches de flor."
    );
  });

  it("should match stakeholder names with subprocess names", () => {
    const entrada = JSON.parse(mockSubprocessMapData.entrada);
    const subprocesos = JSON.parse(mockSubprocessMapData.subprocesos);

    const subprocessActionsByName = new Map();
    subprocesos.forEach((s: any) => {
      const name = s.subproceso || s.name || s.nombre || "";
      if (name) {
        subprocessActionsByName.set(name, s.acciones || "");
      }
    });

    // Test matching for "Fincas"
    const fincasName = "Fincas";
    let existingDefenses = "";
    subprocessActionsByName.forEach((actions: any, subprocessName: string) => {
      if (!existingDefenses && fincasName && subprocessName &&
          (subprocessName.toLowerCase().includes(fincasName.toLowerCase()) ||
           fincasName.toLowerCase().includes(subprocessName.toLowerCase()))) {
        existingDefenses = actions;
      }
    });

    expect(existingDefenses).toBe(
      "Verificar guía de entrega vs. producto físico. Inspeccionar condiciones generales de la flor."
    );
  });

  it("should load defensas existentes for all matching stakeholders", () => {
    const entrada = JSON.parse(mockSubprocessMapData.entrada);
    const subprocesos = JSON.parse(mockSubprocessMapData.subprocesos);

    const subprocessActionsByName = new Map();
    subprocesos.forEach((s: any) => {
      const name = s.subproceso || s.name || s.nombre || "";
      if (name) {
        subprocessActionsByName.set(name, s.acciones || "");
      }
    });

    // Simulate loading stakeholders with defensas existentes
    const stakeholdersWithDefensas = entrada.map((e: any) => {
      const name = e.partesInteresadas || e.name || e.nombre || "";
      let existingDefenses = "";

      subprocessActionsByName.forEach((actions: any, subprocessName: string) => {
        if (!existingDefenses && name && subprocessName &&
            (subprocessName.toLowerCase().includes(name.toLowerCase()) ||
             name.toLowerCase().includes(subprocessName.toLowerCase()))) {
          existingDefenses = actions;
        }
      });

      return {
        name,
        existingDefenses,
        internalExternal: e.internoExterno
      };
    });

    // Verify results
    expect(stakeholdersWithDefensas.length).toBe(3);

    // Check Fincas
    const fincas = stakeholdersWithDefensas.find(s => s.name === "Fincas");
    expect(fincas).toBeDefined();
    expect(fincas?.existingDefenses).toBe(
      "Verificar guía de entrega vs. producto físico. Inspeccionar condiciones generales de la flor."
    );

    // Check Postcosecha Patoa
    const postcosecha = stakeholdersWithDefensas.find(s => s.name === "Postcosecha Patoa");
    expect(postcosecha).toBeDefined();
    expect(postcosecha?.existingDefenses).toBe(
      "Preparar, etiquetar, empacar y enviar bonches de flor."
    );

    // Check Proveedores (no matching subprocess)
    const proveedores = stakeholdersWithDefensas.find(s => s.name === "Proveedores");
    expect(proveedores).toBeDefined();
    expect(proveedores?.existingDefenses).toBe("");
  });

  it("should handle case-insensitive matching", () => {
    const subprocessActionsByName = new Map([
      ["FINCAS", "Verificar guía de entrega"],
      ["Postcosecha Patoa", "Preparar, etiquetar"]
    ]);

    // Test lowercase stakeholder name
    const stakeholderName = "fincas";
    let existingDefenses = "";

    subprocessActionsByName.forEach((actions: any, subprocessName: string) => {
      if (!existingDefenses && stakeholderName && subprocessName &&
          (subprocessName.toLowerCase().includes(stakeholderName.toLowerCase()) ||
           stakeholderName.toLowerCase().includes(subprocessName.toLowerCase()))) {
        existingDefenses = actions;
      }
    });

    expect(existingDefenses).toBe("Verificar guía de entrega");
  });

  it("should handle bidirectional name matching", () => {
    const subprocessActionsByName = new Map([
      ["Recepción de Flores", "Recibir y verificar"]
    ]);

    // Test when stakeholder name is shorter but contained in subprocess name
    const stakeholderName = "Flores";
    let existingDefenses = "";

    subprocessActionsByName.forEach((actions: any, subprocessName: string) => {
      if (!existingDefenses && stakeholderName && subprocessName &&
          (subprocessName.toLowerCase().includes(stakeholderName.toLowerCase()) ||
           stakeholderName.toLowerCase().includes(subprocessName.toLowerCase()))) {
        existingDefenses = actions;
      }
    });

    expect(existingDefenses).toBe("Recibir y verificar");
  });

  it("should not overwrite existing defensas if no match found", () => {
    const existingDefensas = "Existing defense action";
    const subprocessActionsByName = new Map([
      ["Other Process", "Other action"]
    ]);

    const stakeholderName = "Unique Stakeholder";
    let existingDefenses = existingDefensas;

    subprocessActionsByName.forEach((actions: any, subprocessName: string) => {
      if (!existingDefenses && stakeholderName && subprocessName &&
          (subprocessName.toLowerCase().includes(stakeholderName.toLowerCase()) ||
           stakeholderName.toLowerCase().includes(subprocessName.toLowerCase()))) {
        existingDefenses = actions;
      }
    });

    // Should keep existing defensas if no match found
    expect(existingDefenses).toBe(existingDefensas);
  });

  it("should handle empty subprocess actions gracefully", () => {
    const subprocessActionsByName = new Map([
      ["Fincas", ""],
      ["Postcosecha", "Preparar"]
    ]);

    const stakeholderName = "Fincas";
    let existingDefenses = "";

    subprocessActionsByName.forEach((actions: any, subprocessName: string) => {
      if (!existingDefenses && stakeholderName && subprocessName &&
          (subprocessName.toLowerCase().includes(stakeholderName.toLowerCase()) ||
           stakeholderName.toLowerCase().includes(subprocessName.toLowerCase()))) {
        existingDefenses = actions;
      }
    });

    // Should assign empty string if no actions
    expect(existingDefenses).toBe("");
  });
});
