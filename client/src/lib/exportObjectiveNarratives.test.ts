import { describe, expect, it, vi } from "vitest";
import { exportObjectiveNarratives } from "./exportObjectiveNarratives";

function documentMock(lines?: string[]) {
  return {
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    splitTextToSize: vi.fn((value: string) => lines || [value]),
    text: vi.fn(),
    addPage: vi.fn(),
  };
}
const layout = { x: 10, y: 20, width: 180, bottom: 270, pageTop: 15 };

describe("optional objective narrative export", () => {
  it("leaves legacy exports unchanged without narrative fields", () => {
    const doc = documentMock();
    expect(exportObjectiveNarratives(doc as any, {}, layout)).toBe(20);
    expect(doc.text).not.toHaveBeenCalled();
    expect(doc.addPage).not.toHaveBeenCalled();
  });
  it("omits empty fields without inventing descriptions", () => {
    const doc = documentMock();
    expect(
      exportObjectiveNarratives(
        doc as any,
        { situacionInicial: "", resultadoEsperado: "   " },
        layout
      )
    ).toBe(20);
    expect(doc.text).not.toHaveBeenCalled();
  });
  it("exports the three supplied fields in the same order as the form", () => {
    const doc = documentMock();
    exportObjectiveNarratives(
      doc as any,
      {
        situacionInicial: "Conocimiento sin documentar",
        resultadoEsperado: "Documentación validada",
        indicador: "% de procesos documentados",
      },
      layout
    );
    expect(doc.text.mock.calls.map(call => call[0])).toEqual([
      "Situación inicial:",
      "Conocimiento sin documentar",
      "Resultado esperado:",
      "Documentación validada",
      "Indicador:",
      "% de procesos documentados",
    ]);
  });
  it("paginates long text and keeps every line within the printable area", () => {
    const doc = documentMock(Array(180).fill("Una línea de la descripción"));
    exportObjectiveNarratives(
      doc as any,
      { resultadoEsperado: "Descripción larga" },
      { ...layout, y: 268 }
    );
    expect(doc.addPage.mock.calls.length).toBeGreaterThan(1);
    for (const [, , y] of doc.text.mock.calls) {
      expect(y).toBeGreaterThanOrEqual(15);
      expect(y).toBeLessThanOrEqual(270);
    }
  });
});
