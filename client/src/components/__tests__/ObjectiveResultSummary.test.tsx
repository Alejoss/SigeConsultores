import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ObjectiveResultSummary } from "../ObjectiveResultSummary";
import { calculateObjectiveResultMetrics as calc } from "@shared/objectiveResultMetrics";
afterEach(cleanup);
describe("Panel común de resultados",()=>{
  it("presenta los cinco datos con etiquetas inequívocas",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:140,currentValue:160,goal:180})} unit="tallos por hora/hombre" />);
    for(const text of ["Punto de partida","Resultado actual","Meta","Variación respecto al inicio","Avance hacia la meta"])expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText("160 tallos por hora/hombre")).toBeTruthy();expect(screen.getByText("+14,29 %")).toBeTruthy();expect(screen.getByText("50 %")).toBeTruthy();
  });
  it("expone la meta superada aunque la barra no pueda superar su ancho",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:6.8,currentValue:16,goal:13})} unit="%" />);
    expect(screen.getByText("148,39 %")).toBeTruthy();expect(screen.getByText(/Meta superada/)).toBeTruthy();expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toContain("148,39");
  });
  it("no oculta el retroceso ni las pérdidas",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:6.8,currentValue:-2,goal:13})} unit="%" variant="dark" />);
    expect(screen.getByText("-2 %")).toBeTruthy();expect(screen.getByText("-141,94 %")).toBeTruthy();expect(screen.getByText(/Por debajo del inicio/)).toBeTruthy();
  });
  it("no califica una reducción favorable como retroceso",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:20,currentValue:16,goal:4})} />);expect(screen.getByText("-20 %")).toBeTruthy();expect(screen.getByText("Mejora")).toBeTruthy();
  });
  it("expresa en puntos porcentuales la mejora desde un margen negativo",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:-5,currentValue:-2,goal:5})} unit="%" />);expect(screen.getByText("+3 puntos porcentuales")).toBeTruthy();expect(screen.getByText("Variación relativa: No calculable")).toBeTruthy();expect(screen.getByText(/inicio negativo/)).toBeTruthy();
  });
  it("inicio cero no aparece como variación0%",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:0,currentValue:30,goal:75})} unit="personas" />);expect(screen.getByText("No calculable")).toBeTruthy();expect(screen.getByText(/inicio igual a cero/)).toBeTruthy();expect(screen.getByText("40 %")).toBeTruthy();
  });
  it("una medición ausente no es un avance cero",()=>{
    render(<ObjectiveResultSummary metrics={calc({baseline:10,currentValue:null,goal:20})} compact />);expect(screen.getByText("Sin medición registrada.")).toBeTruthy();expect(screen.getByRole("progressbar").hasAttribute("aria-valuenow")).toBe(false);
  });
});
