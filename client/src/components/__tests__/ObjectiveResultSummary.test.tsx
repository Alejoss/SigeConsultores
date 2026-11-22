import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ObjectiveResultSummary } from "../ObjectiveResultSummary";
import { calculateObjectiveResultMetrics as calc } from "@shared/objectiveResultMetrics";
import { calculateTolerableObjectiveResult } from "@shared/tolerableMargin";
afterEach(cleanup);
describe("Panel común de resultados",()=>{
  it("presenta los cinco datos con etiquetas inequívocas",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:140,currentValue:160,goal:180})} unit="tallos por hora/hombre" />);
    for(const text of ["Punto de partida","Resultado actual","Meta","Variación relativa","Avance hacia la meta"])expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText("160 tallos por hora/hombre")).toBeTruthy();expect(screen.getByText("+14,29 %")).toBeTruthy();expect(screen.getByText("50,00 %")).toBeTruthy();
  });
  it("expone la meta superada aunque la barra no pueda superar su ancho",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:6.8,currentValue:16,goal:13})} unit="%" />);
    expect(screen.getByText("148,39 %")).toBeTruthy();expect(screen.getByText(/Meta superada/)).toBeTruthy();expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toContain("148,39");
  });
  it("no oculta el retroceso ni las pérdidas",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:6.8,currentValue:-2,goal:13})} unit="%" variant="dark" />);
    expect(screen.getByText("-2,00 %")).toBeTruthy();expect(screen.getByText("-141,94 %")).toBeTruthy();expect(screen.getByText(/Por debajo del inicio/)).toBeTruthy();
  });
  it("no califica una reducción favorable como retroceso",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:20,currentValue:16,goal:4})} />);expect(screen.getByText("-20,00 %")).toBeTruthy();expect(screen.getByText("Mejora")).toBeTruthy();
  });
  it("expresa en puntos porcentuales la mejora desde un margen negativo",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:-5,currentValue:-2,goal:5})} unit="%" />);expect(screen.getByText("+3,00 puntos porcentuales")).toBeTruthy();expect(screen.getByText("No calculable")).toBeTruthy();expect(screen.getByText(/inicio negativo/)).toBeTruthy();
  });
  it("inicio cero no aparece como variación0,00 %",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:0,currentValue:30,goal:75})} unit="personas" />);expect(screen.getByText("No calculable")).toBeTruthy();expect(screen.getByText(/inicio igual a cero/)).toBeTruthy();expect(screen.getByText("40,00 %")).toBeTruthy();
  });
  it("una medición ausente no es un avance cero",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:10,currentValue:null,goal:20})} compact />);expect(screen.getByText("Sin medición registrada.")).toBeTruthy();expect(screen.getByRole("progressbar").hasAttribute("aria-valuenow")).toBe(false);
  });
  it.each([
    [25, 14, "44,00 %", "Mejora"],
    [-25, -14, "44,00 %", "Mejora"],
    [25, -14, "44,00 %", "Mejora"],
    [25, 35, "-40,00 %", "Retroceso"],
  ])("destaca el cambio de distancia al ideal desde %s hasta %s", (baseline, currentValue, expected, trend) => {
    const metrics = calculateTolerableObjectiveResult(baseline as number, { lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: currentValue as number });
    render(<ObjectiveResultSummary metrics={metrics} unit="%" variant="dark" />);
    const improvement = screen.getByText("Reducción de la desviación respecto al ideal").parentElement!.querySelector("dd")!;
    expect(improvement.textContent).toBe(expected);
    expect(improvement.className).toContain("text-white");
    expect(improvement.className).toContain("font-semibold");
    expect(screen.getByText("Tendencia").parentElement!.querySelector("dd")!.textContent).toBe(trend);
    const secondary = screen.getByRole("group", { name: "Lectura secundaria: variación del valor" });
    expect(within(secondary).getByText("Variación relativa")).toBeTruthy();
    expect(secondary.querySelector("dd")!.className).toContain("font-normal");
    expect(within(secondary).getByText("El signo indica aumento o disminución del valor; no mejora o retroceso.")).toBeTruthy();
    if (baseline === 25 && currentValue === 14) expect(within(secondary).getByText("-44,00 %")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("inicio ya ideal no fabrica un porcentaje de mejora", () => {
    render(<ObjectiveResultSummary metrics={calculateTolerableObjectiveResult(0, { lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 14 })} />);
    expect(screen.getByText("Reducción de la desviación respecto al ideal").parentElement!.querySelector("dd")!.textContent).toBe("—");
    expect(screen.getByText("Tendencia").parentElement!.querySelector("dd")!.textContent).toBe("Retroceso");
    expect(screen.getByText(/El punto de partida ya coincide con el ideal/)).toBeTruthy();
  });
});
