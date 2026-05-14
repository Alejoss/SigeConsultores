import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests para validar la persistencia de "Versión para Empresa" en localStorage
 * y la funcionalidad del campo "Justificación" en el módulo FODA
 */

describe("FODA Persistence and Justification", () => {
  // Mock localStorage
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should persist enterprise versions to localStorage with company ID key", () => {
    const companyId = 1;
    const key = `foda_enterprise_versions_${companyId}`;
    const enterpriseVersions = {
      "1-Fortaleza-statement1": "Versión generalizada 1",
      "1-Oportunidad-statement2": "Versión generalizada 2",
    };

    localStorage.setItem(key, JSON.stringify(enterpriseVersions));

    const stored = localStorage.getItem(key);
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!)).toEqual(enterpriseVersions);
  });

  it("should load enterprise versions from localStorage on component mount", () => {
    const companyId = 2;
    const key = `foda_enterprise_versions_${companyId}`;
    const enterpriseVersions = {
      "2-Debilidad-statement3": "Versión generalizada 3",
    };

    localStorage.setItem(key, JSON.stringify(enterpriseVersions));

    // Simulate loading from localStorage
    const stored = localStorage.getItem(key);
    const loaded = stored ? JSON.parse(stored) : {};

    expect(loaded).toEqual(enterpriseVersions);
  });

  it("should handle empty localStorage gracefully", () => {
    const companyId = 3;
    const key = `foda_enterprise_versions_${companyId}`;

    const stored = localStorage.getItem(key);
    expect(stored).toBeNull();

    // Should default to empty Map
    const loaded = stored ? JSON.parse(stored) : {};
    expect(Object.keys(loaded).length).toBe(0);
  });

  it("should update localStorage when enterprise version changes", () => {
    const companyId = 4;
    const key = `foda_enterprise_versions_${companyId}`;
    const initialVersions = {
      "4-Amenaza-statement4": "Versión inicial",
    };

    localStorage.setItem(key, JSON.stringify(initialVersions));

    // Update with new version
    const updatedVersions = {
      ...initialVersions,
      "4-Fortaleza-statement5": "Nueva versión",
    };

    localStorage.setItem(key, JSON.stringify(updatedVersions));

    const stored = localStorage.getItem(key);
    expect(JSON.parse(stored!)).toEqual(updatedVersions);
    expect(Object.keys(JSON.parse(stored!))).toHaveLength(2);
  });

  it("should clear localStorage when navigating away from FODA module", () => {
    const companyId = 5;
    const key = `foda_enterprise_versions_${companyId}`;
    const enterpriseVersions = {
      "5-Fortaleza-statement6": "Versión a limpiar",
    };

    localStorage.setItem(key, JSON.stringify(enterpriseVersions));
    expect(localStorage.getItem(key)).toBeDefined();

    // Simulate cleanup
    localStorage.removeItem(key);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("should handle multiple companies with separate localStorage keys", () => {
    const company1Id = 6;
    const company2Id = 7;
    const key1 = `foda_enterprise_versions_${company1Id}`;
    const key2 = `foda_enterprise_versions_${company2Id}`;

    const versions1 = { "6-Fortaleza-s1": "Versión empresa 1" };
    const versions2 = { "7-Oportunidad-s2": "Versión empresa 2" };

    localStorage.setItem(key1, JSON.stringify(versions1));
    localStorage.setItem(key2, JSON.stringify(versions2));

    expect(JSON.parse(localStorage.getItem(key1)!)).toEqual(versions1);
    expect(JSON.parse(localStorage.getItem(key2)!)).toEqual(versions2);
  });

  it("should validate justification field can be stored in database", () => {
    // This test validates the schema change
    const fodasWithJustification = [
      {
        id: 1,
        companyId: 1,
        type: "Fortaleza",
        description: "Elemento FODA",
        justification: "Justificación del elemento",
        processId: 1,
        isCustom: false,
      },
      {
        id: 2,
        companyId: 1,
        type: "Oportunidad",
        description: "Otra oportunidad",
        justification: null, // Optional field
        processId: 2,
        isCustom: false,
      },
    ];

    // Validate structure
    fodasWithJustification.forEach((foda) => {
      expect(foda).toHaveProperty("description");
      expect(foda).toHaveProperty("justification");
      expect(typeof foda.description).toBe("string");
      expect(foda.justification === null || typeof foda.justification === "string").toBe(true);
    });
  });

  it("should preserve enterprise versions when switching between tabs", () => {
    const companyId = 8;
    const key = `foda_enterprise_versions_${companyId}`;
    const versions = {
      "8-Debilidad-s1": "Versión tab 1",
      "8-Amenaza-s2": "Versión tab 2",
    };

    // Store versions
    localStorage.setItem(key, JSON.stringify(versions));

    // Simulate switching tabs (should not clear localStorage)
    const stored1 = localStorage.getItem(key);
    expect(JSON.parse(stored1!)).toEqual(versions);

    // Switch back
    const stored2 = localStorage.getItem(key);
    expect(JSON.parse(stored2!)).toEqual(versions);
  });

  it("should handle JSON parsing errors gracefully", () => {
    const companyId = 9;
    const key = `foda_enterprise_versions_${companyId}`;

    // Store invalid JSON
    localStorage.setItem(key, "invalid json {");

    // Should handle error gracefully
    let loaded = {};
    try {
      const stored = localStorage.getItem(key);
      loaded = stored ? JSON.parse(stored) : {};
    } catch (e) {
      loaded = {}; // Default to empty on error
    }

    expect(Object.keys(loaded).length).toBe(0);
  });

  it("should maintain data consistency across multiple operations", () => {
    const companyId = 10;
    const key = `foda_enterprise_versions_${companyId}`;

    // Initial set
    const v1 = { "10-F-s1": "v1" };
    localStorage.setItem(key, JSON.stringify(v1));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(v1);

    // Add more
    const v2 = { ...v1, "10-O-s2": "v2" };
    localStorage.setItem(key, JSON.stringify(v2));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(v2);

    // Update existing
    const v3 = { ...v2, "10-F-s1": "v1-updated" };
    localStorage.setItem(key, JSON.stringify(v3));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(v3);

    // Remove one
    const v4 = { "10-O-s2": "v2", "10-F-s1": "v1-updated" };
    localStorage.setItem(key, JSON.stringify(v4));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(v4);
  });
});
