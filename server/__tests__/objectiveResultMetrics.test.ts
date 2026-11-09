import { describe, expect, it } from "vitest";
import { boundedObjectiveProgress, calculateObjectiveResultMetrics as calc, formatObjectivePercent, formatObjectiveValue, objectiveGoalStatusLabel, objectiveTrendLabel, objectiveVariationExplanation } from "../../shared/objectiveResultMetrics";

describe("Lectura dual del resultado de OE y OTE", () => {
  it("distingue crecimiento de la producción y avance hacia la meta", () => {
    const m=calc({baseline:150,currentValue:190,goal:250});
    expect(m.variationPercent).toBe(26.67);expect(m.goalProgress).toBe(40);expect(m.absoluteChange).toBe(40);expect(m.trend).toBe("improving");
  });
  it("reproduce el ejemplo de 140 a 160 con meta180",()=>{
    const m=calc({baseline:140,currentValue:160,goal:180});expect(m.variationPercent).toBe(14.29);expect(m.goalProgress).toBe(50);
  });
  it("no recorta pérdidas o retrocesos más allá de -100",()=>{
    const m=calc({baseline:6.8,currentValue:-2,goal:13});expect(m.goalProgress).toBe(-141.94);expect(m.variationPercent).toBe(-129.41);expect(m.goalStatus).toBe("below_baseline");expect(objectiveTrendLabel(m)).toBe("Retroceso");
  });
  it("no recorta la superación de una meta",()=>{
    const m=calc({baseline:6.8,currentValue:16,goal:13});expect(m.goalProgress).toBe(148.39);expect(m.variationPercent).toBe(135.29);expect(objectiveGoalStatusLabel(m)).toBe("Meta superada");
  });
  it("una variación negativa puede ser una mejora cuando la meta es reducir",()=>{
    const m=calc({baseline:20,currentValue:16,goal:4});expect(m.variationPercent).toBe(-20);expect(m.goalProgress).toBe(25);expect(m.trend).toBe("improving");
  });
  it("el incremento del valor representa retroceso si se busca reducir",()=>{
    const m=calc({baseline:20,currentValue:25,goal:10});expect(m.variationPercent).toBe(25);expect(m.goalProgress).toBe(-50);expect(m.trend).toBe("worsening");
  });
  it("inicio cero admite avance y cambio absoluto, no crecimiento porcentual ficticio",()=>{
    const m=calc({baseline:0,currentValue:30,goal:75});expect(m.goalProgress).toBe(40);expect(m.variationPercent).toBeNull();expect(m.absoluteChange).toBe(30);expect(m.variationUnavailable).toBe("zero_baseline");expect(objectiveVariationExplanation(m)).toContain("cero");
  });
  it("inicio negativo muestra mejora sin invertir el signo de un crecimiento porcentual",()=>{
    const m=calc({baseline:-5,currentValue:-2,goal:5});expect(m.goalProgress).toBe(30);expect(m.absoluteChange).toBe(3);expect(m.variationPercent).toBeNull();expect(m.variationUnavailable).toBe("negative_baseline");expect(m.trend).toBe("improving");
  });
  it("cero actual es una medición válida",()=>{
    const m=calc({baseline:10,currentValue:0,goal:0});expect(m.goalProgress).toBe(100);expect(m.variationPercent).toBe(-100);expect(m.currentValue).toBe(0);
  });
  it.each([null,undefined,NaN,Infinity,-Infinity])("no inventa un resultado con una medición %s",currentValue=>{
    const m=calc({baseline:10,currentValue,goal:20});expect(m.currentValue).toBeNull();expect(m.goalProgress).toBeNull();expect(m.variationPercent).toBeNull();expect(m.goalStatus).toBe("pending");
  });
  it("una meta igual al inicio no produce división por cero",()=>{
    const m=calc({baseline:10,currentValue:12,goal:10});expect(m.goalProgress).toBeNull();expect(m.variationPercent).toBe(20);
  });
  it("checklist conserva su avance propio y no se presenta como crecimiento del indicador",()=>{
    const m=calc({baseline:0,currentValue:6,goal:12,numericComparison:false,goalProgressOverride:50});expect(m.goalProgress).toBe(50);expect(m.variationUnavailable).toBe("not_numeric");expect(m.variationPercent).toBeNull();
  });
  it("solo el dibujo queda acotado entre0y100; el número real permanece íntegro",()=>{
    const m=calc({baseline:10,currentValue:25,goal:20});expect(m.goalProgress).toBe(150);expect(boundedObjectiveProgress(m.goalProgress)).toBe(100);expect(boundedObjectiveProgress(-250)).toBe(0);
  });
  it("formatea cifras y signos explícitos sin confundir cantidades con porcentajes",()=>{
    expect(formatObjectivePercent(26.67,true)).toBe("+26,67 %");expect(formatObjectivePercent(-141.94)).toBe("-141,94 %");expect(formatObjectiveValue(0.0458)).toBe("0,0458");expect(formatObjectivePercent(null)).toBe("—");
  });
  it("no modifica ninguno de los valores fuente",()=>{
    const input={baseline:140,currentValue:160,goal:180};const original=JSON.stringify(input);calc(input);expect(JSON.stringify(input)).toBe(original);
  });
});
