import type jsPDF from "jspdf";

export type ObjectiveNarratives = {
  situacionInicial?: string;
  resultadoEsperado?: string;
  indicador?: string;
};

type NarrativeDocument = Pick<
  jsPDF,
  | "setFontSize"
  | "setFont"
  | "setTextColor"
  | "splitTextToSize"
  | "text"
  | "addPage"
>;

/** Adds only supplied descriptions. Legacy exports stay unchanged when absent. */
export function exportObjectiveNarratives(
  doc: NarrativeDocument,
  values: ObjectiveNarratives,
  layout: {
    x: number;
    y: number;
    width: number;
    bottom: number;
    pageTop: number;
  }
): number {
  let y = layout.y;
  const fields = [
    ["situacionInicial", "Situación inicial"],
    ["resultadoEsperado", "Resultado esperado"],
    ["indicador", "Indicador"],
  ] as const;
  const nextLine = () => {
    if (y > layout.bottom) {
      doc.addPage();
      y = layout.pageTop;
    }
  };

  for (const [key, label] of fields) {
    const value = values[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (y + 5 > layout.bottom) {
      doc.addPage();
      y = layout.pageTop;
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(`${label}:`, layout.x, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(value, layout.width - 3) as string[];
    for (const line of lines) {
      nextLine();
      doc.text(line, layout.x + 3, y);
      y += 4.5;
    }
    y += 3;
  }
  return y;
}
