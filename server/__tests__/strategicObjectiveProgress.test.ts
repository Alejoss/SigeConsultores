import { describe, expect, it } from "vitest";
import {
  calculateStrategicObjectiveProgress, isStrategicMeasurementConfigured,
  summarizeStrategicObjectiveMeasurements,
  type StrategicMeasuredObjective, type StrategicMeasurementConfig,
} from "../../shared/strategicObjectiveMeasurement";
const config = (extra: Partial<StrategicMeasurementConfig> = {}): StrategicMeasurementConfig => ({
  initialSituation:"",expectedResult:"",indicator:"Indicador sintético",weight:50,baseline:0,goal:100,unit:"%",deadline:"2027-12-31",...extra,
});
const objective = (id:number, percent:number|null, c:StrategicMeasurementConfig|null=config()):StrategicMeasuredObjective => ({
  id,name:`OE ${id}`,objective:`OE ${id}`,description:"Texto anterior",target:"Meta anterior",responsible:"Gerencia",deadline:"2027-12-31",orderIndex:id,
  measurementConfig:c,measurementStatus:!c?"pending_configuration":percent===null?"unmeasured":"measured",percent,latestMeasurement:null,
});
describe("Resultado estratégico independiente del cumplimiento de OTE", () => {
  it.each([[0,0],[25,25],[100,100],[125,100],[-10,0]])("avance con base cero: valor %s → %s",(value,want)=>{
    expect(calculateStrategicObjectiveProgress(config(),value)).toBe(want);
  });
  it("mide el recorrido desde una línea base distinta de cero, no valor/meta",()=>{
    expect(calculateStrategicObjectiveProgress(config({baseline:20,goal:60}),40)).toBe(50);
  });
  it.each([[20,0],[15,50],[10,100],[5,100],[25,0]])("reducción: valor %s → %s",(value,want)=>{
    expect(calculateStrategicObjectiveProgress(config({baseline:20,goal:10}),value)).toBe(want);
  });
  it("cero real no se trata como falta de medición",()=>{
    expect(calculateStrategicObjectiveProgress(config({baseline:10,goal:0}),0)).toBe(100);
  });
  it("admite metas y mediciones negativas",()=>{
    expect(calculateStrategicObjectiveProgress(config({baseline:-20,goal:0}),-10)).toBe(50);
  });
  it("conserva dos decimales en el resultado",()=>{
    expect(calculateStrategicObjectiveProgress(config({baseline:0,goal:3}),1)).toBe(33.33);
  });
  it.each([null,undefined,NaN,Infinity,-Infinity])("falta o valor inválido %s no representa cero",value=>{
    expect(calculateStrategicObjectiveProgress(config(),value)).toBeNull();
  });
  it.each([
    {baseline:null},{goal:null},{baseline:100,goal:100},{indicator:" "},{unit:""},{deadline:""},{weight:null},{weight:0},{weight:101},
  ])("configuración incompleta no produce porcentaje: %j",extra=>{
    expect(isStrategicMeasurementConfigured(config(extra))).toBe(false);
    expect(calculateStrategicObjectiveProgress(config(extra),50)).toBeNull();
  });
  it("total usa pesos de OE y no promedio simple ni número de OTE",()=>{
    const summary=summarizeStrategicObjectiveMeasurements([objective(1,100,config({weight:80})),objective(2,0,config({weight:20}))]);
    expect(summary.status).toBe("complete");expect(summary.globalPercent).toBe(80);
  });
  it("no repondera en secreto cuando el total no suma 100",()=>{
    const result=summarizeStrategicObjectiveMeasurements([objective(1,100,config({weight:20})),objective(2,100,config({weight:20}))]);
    expect(result.status).toBe("invalid_weights");expect(result.globalPercent).toBeNull();expect(result.totalWeight).toBe(40);
  });
  it("una medición pendiente impide declarar el total definitivo",()=>{
    const result=summarizeStrategicObjectiveMeasurements([objective(1,100),objective(2,null)]);
    expect(result.status).toBe("incomplete_measurements");expect(result.globalPercent).toBeNull();expect(result.measuredCount).toBe(1);
  });
  it("los OE anteriores sin configuración permanecen pendientes, sin cero inventado",()=>{
    const old=objective(1,null,null); const snapshot=JSON.stringify(old);
    const result=summarizeStrategicObjectiveMeasurements([old]);
    expect(result.status).toBe("pending_configuration");expect(result.globalPercent).toBeNull();expect(JSON.stringify(old)).toBe(snapshot);
  });
  it("todos medidos con valor cero producen cero válido",()=>{
    const result=summarizeStrategicObjectiveMeasurements([objective(1,0),objective(2,0)]);
    expect(result.status).toBe("complete");expect(result.globalPercent).toBe(0);
  });
  it("sin objetivos no inventa un indicador",()=>{
    const result=summarizeStrategicObjectiveMeasurements([]);
    expect(result.status).toBe("no_objectives");expect(result.globalPercent).toBeNull();
  });
});
