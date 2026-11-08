export type StrategicMeasurementConfig = {
  initialSituation: string;
  expectedResult: string;
  indicator: string;
  weight: number | null;
  baseline: number | null;
  goal: number | null;
  unit: string;
  deadline: string;
};
export type StrategicMeasurement = {
  id: number;
  objectiveId: number;
  measurementDate: string;
  value: number;
  observation: string;
  evidence: string;
  percent: number;
};
export type StrategicMeasuredObjective = {
  id: number;
  name: string;
  objective: string;
  description: string;
  target: string;
  responsible: string;
  deadline: string;
  orderIndex: number;
  measurementConfig: StrategicMeasurementConfig | null;
  measurementStatus: "pending_configuration" | "unmeasured" | "measured";
  percent: number | null;
  latestMeasurement: StrategicMeasurement | null;
};
export type StrategicMeasurementOverview = {
  objectives: StrategicMeasuredObjective[];
  globalPercent: number | null;
  totalWeight: number;
  configuredCount: number;
  measuredCount: number;
  totalCount: number;
  status: "no_objectives" | "pending_configuration" | "invalid_weights" | "incomplete_measurements" | "complete";
};
export type StrategicMeasurementDetail = {
  objective: StrategicMeasuredObjective;
  measurements: StrategicMeasurement[];
};
export const emptyStrategicMeasurementConfig = (): StrategicMeasurementConfig => ({
  initialSituation: "", expectedResult: "", indicator: "", weight: null,
  baseline: null, goal: null, unit: "", deadline: "",
});
export function isStrategicMeasurementDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function isStrategicMeasurementConfigured(config: StrategicMeasurementConfig | null | undefined): boolean {
  return !!config && !!config.indicator.trim() && !!config.unit.trim() && isStrategicMeasurementDate(config.deadline)
    && config.weight !== null && Number.isFinite(config.weight) && config.weight > 0 && config.weight <= 100
    && config.baseline !== null && Number.isFinite(config.baseline)
    && config.goal !== null && Number.isFinite(config.goal) && config.goal !== config.baseline;
}
export function calculateStrategicObjectiveProgress(config: StrategicMeasurementConfig | null | undefined, value: number | null | undefined): number | null {
  if (!isStrategicMeasurementConfigured(config) || value === null || value === undefined || !Number.isFinite(value)) return null;
  const ratio = ((value - config!.baseline!) / (config!.goal! - config!.baseline!)) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio * 100) / 100));
}
export function summarizeStrategicObjectiveMeasurements(objectives: StrategicMeasuredObjective[]): StrategicMeasurementOverview {
  const totalWeight = Math.round(objectives.reduce((sum, obj) => sum + (obj.measurementConfig?.weight ?? 0), 0) * 100) / 100;
  const configuredCount = objectives.filter(obj => isStrategicMeasurementConfigured(obj.measurementConfig)).length;
  const measuredCount = objectives.filter(obj => obj.percent !== null && Number.isFinite(obj.percent)).length;
  const status: StrategicMeasurementOverview["status"] = objectives.length === 0 ? "no_objectives"
    : configuredCount !== objectives.length ? "pending_configuration"
    : Math.abs(totalWeight - 100) > 0.001 ? "invalid_weights"
    : measuredCount !== objectives.length ? "incomplete_measurements" : "complete";
  const globalPercent = status === "complete"
    ? Math.round(objectives.reduce((sum, obj) => sum + obj.percent! * obj.measurementConfig!.weight! / 100, 0) * 100) / 100
    : null;
  return { objectives, globalPercent, totalWeight, configuredCount, measuredCount, totalCount: objectives.length, status };
}
