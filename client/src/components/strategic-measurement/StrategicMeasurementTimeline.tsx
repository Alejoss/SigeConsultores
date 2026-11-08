import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { StrategicMeasuredObjective } from "@shared/strategicObjectiveMeasurement";
import { StrategicMeasurementHistory, strategicMeasurementLabel } from "./StrategicObjectiveDetail";

function ObjectiveTimeline({ companyId, objective, index }: { companyId: number; objective: StrategicMeasuredObjective; index: number }) {
  const query = trpc.strategicObjectives.getMeasurementDetail.useQuery({ companyId, objectiveId: objective.id });
  if (query.isLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (query.error || !query.data) return <p role="alert">No se pudo cargar el historial de {objective.name}. <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></p>;
  const measurements = query.data.measurements.filter(measurement => measurement.objectiveId === objective.id).sort((a, b) => a.measurementDate.localeCompare(b.measurementDate) || a.id - b.id);
  const chartData = measurements.map(measurement => ({ date: measurement.measurementDate, percent: measurement.percent, value: measurement.value }));
  return <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-slate-700">OE {index + 1} · {query.data.objective.name}</h3><span className="text-sm text-slate-500">{strategicMeasurementLabel(query.data.objective)}</span></div>
    <p className="text-xs text-slate-500">{query.data.objective.measurementConfig?.indicator || "Indicador pendiente"} · {measurements.length} mediciones reales por fecha</p>
    {measurements.length > 0 && <div className="h-48"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value: number) => [`${value}%`, "Avance real"]} />
        <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 2" />
        <Line type="linear" dataKey="percent" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name="Avance real" />
      </LineChart>
    </ResponsiveContainer></div>}
    <StrategicMeasurementHistory measurements={measurements} unit={query.data.objective.measurementConfig?.unit ?? ""} />
  </section>;
}
export function StrategicMeasurementTimeline({ companyId }: { companyId: number }) {
  const query = trpc.strategicObjectives.getMeasurementOverview.useQuery({ companyId }, { enabled: companyId > 0 });
  if (query.isLoading) return <div className="py-12 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (query.error || !query.data) return <p role="alert">No se pudieron cargar los objetivos. <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></p>;
  return <div className="space-y-5">
    <p className="text-sm text-slate-500">Evolución de las mediciones reales de cada OE. No usa snapshots históricos de OTE, no empareja por nombre y no genera registros al consultar.</p>
    {query.data.objectives.length === 0 ? <p className="py-10 text-center text-slate-500">No hay Objetivos Estratégicos registrados.</p> : query.data.objectives.map((objective, index) => <ObjectiveTimeline key={objective.id} companyId={companyId} objective={objective} index={index} />)}
  </div>;
}
