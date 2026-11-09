import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CompanyReadOnlyNotice, useCompanyManagementPermission } from "@/hooks/useCompanyManagementPermission";
import type { StrategicMeasurementOverview as Overview } from "@shared/strategicObjectiveMeasurement";
import { calculateObjectiveResultMetrics, formatObjectivePercent, formatObjectiveValue, objectiveChangePresentation } from "@shared/objectiveResultMetrics";
import { ObjectiveResultSummary } from "@/components/ObjectiveResultSummary";
import { StrategicObjectiveDetail, strategicMeasurementLabel, type StrategicObjectiveDetailHandle } from "./StrategicObjectiveDetail";

const overviewMessages: Record<Overview["status"], string> = {
  no_objectives: "No hay objetivos estratégicos registrados.",
  pending_configuration: "Avance global no disponible: falta completar la configuración de uno o más OE.",
  invalid_weights: "Avance global no disponible: las ponderaciones deben sumar exactamente 100%.",
  incomplete_measurements: "Avance global no disponible: faltan mediciones reales en uno o más OE.",
  complete: "Promedio ponderado del avance hacia las metas de los OE. Independiente de los OTE.",
};
export function StrategicGlobalMeasurement({ data }: { data: Overview }) {
  return <section className="rounded-xl border-2 border-blue-100 bg-blue-50 p-5 space-y-2" aria-label="Avance global ponderado hacia las metas de OE">
    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Avance global ponderado hacia las metas de OE</p>
    <p className="text-3xl font-bold text-slate-800">{data.globalPercent === null ? "No disponible" : formatObjectivePercent(data.globalPercent)}</p>
    <p className="text-sm text-slate-600">{overviewMessages[data.status]}</p>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
      <span>Configurados: {data.configuredCount}/{data.totalCount}</span><span>Medidos: {data.measuredCount}/{data.totalCount}</span><span>Ponderación total: {formatObjectivePercent(data.totalWeight)} / 100 %</span>
    </div>
    <p className="text-xs text-slate-500">Global = suma de (avance hacia la meta de cada OE × ponderación / 100). Solo en el consolidado, el aporte individual se acota entre 0 % y 100 %. No se promedian las variaciones ni se sustituyen datos faltantes por cero.</p>
  </section>;
}
export function StrategicMeasurementOverview({ companyId, overviewRef }: { companyId: number; overviewRef?: Ref<StrategicObjectiveDetailHandle> }) {
  const query = trpc.strategicObjectives.getMeasurementOverview.useQuery({ companyId }, { enabled: companyId > 0 });
  const { canManageCompany } = useCompanyManagementPermission(companyId);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const detailRef = useRef<StrategicObjectiveDetailHandle>(null);
  const switching = useRef(false);
  useImperativeHandle(overviewRef, () => ({ flush: () => detailRef.current?.flush() ?? Promise.resolve(true) }), []);
  async function selectObjective(next: number | null) {
    if (switching.current) return;
    switching.current = true;
    const saved = !detailRef.current || await detailRef.current.flush();
    switching.current = false;
    if (saved) setExpandedId(next);
  }
  if (query.isLoading) return <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;
  if (query.error || !query.data) return <div role="alert" className="p-4 text-red-700">No se pudo cargar el avance de los OE. <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div>;
  const data = query.data;
  return <div className="space-y-4">
    {!canManageCompany && <CompanyReadOnlyNotice />}
    <StrategicGlobalMeasurement data={data} />
    <p className="text-sm text-slate-500">Selecciona un OE para consultar su definición, indicador y mediciones reales{canManageCompany ? " o registrar valores" : ""}.</p>
    {data.objectives.length === 0 ? <p className="text-center py-10 text-slate-500">No hay Objetivos Estratégicos registrados.</p> : data.objectives.map((objective, index) => {
      const metrics = calculateObjectiveResultMetrics({
        baseline: objective.measurementConfig?.baseline,
        goal: objective.measurementConfig?.goal,
        currentValue: objective.latestMeasurement?.value,
        ...(objective.measurementStatus !== "measured" ? { goalProgressOverride: null } : {}),
      });
      const expanded = expandedId === objective.id;
      return <div key={objective.id} className="space-y-3">
        <button type="button" className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 focus-visible:outline focus-visible:outline-blue-500" aria-expanded={expanded} aria-controls={`oe-detail-${objective.id}`} onClick={() => void selectObjective(expanded ? null : objective.id)}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-sm font-semibold text-slate-700">OE {index + 1} · {objective.name}</span>
            <span className="flex items-center gap-3 text-sm text-slate-500">{objective.measurementStatus !== "measured" && strategicMeasurementLabel(objective)}{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
          </div>
          {objective.latestMeasurement ? <ObjectiveResultSummary metrics={metrics} unit={objective.measurementConfig?.unit} title={`Resultado de ${objective.name}`} compact /> : <div className="space-y-2">
            <p className="text-sm text-slate-700">Resultado actual: <strong className="text-2xl">—</strong></p>
            <p className="text-xs text-slate-500">Punto de partida: {formatObjectiveValue(metrics.baseline)} · Meta: {formatObjectiveValue(metrics.goal)}{objective.measurementConfig?.unit ? ` ${objective.measurementConfig.unit}` : ""}</p>
            <p className="text-xs text-slate-500">{objectiveChangePresentation(metrics, objective.measurementConfig?.unit).label}: — · Avance hacia la meta: —</p>
            <p className="text-xs text-slate-500">Sin medición registrada. No se asigna cero por falta de datos.</p>
          </div>}
          <p className="mt-2 text-xs text-slate-500">Ponderación: {objective.measurementConfig?.weight === null || !objective.measurementConfig ? "Sin definir" : formatObjectivePercent(objective.measurementConfig.weight)}{objective.latestMeasurement ? ` · Última medición: ${objective.latestMeasurement.measurementDate}` : " · Sin valores reales registrados"}{objective.measurementConfig?.deadline ? ` · Fecha límite: ${objective.measurementConfig.deadline}` : ""}</p>
        </button>
        {expanded && <div id={`oe-detail-${objective.id}`}><StrategicObjectiveDetail mode="measurement" detailRef={detailRef} key={`${companyId}-${objective.id}`} companyId={companyId} objectiveId={objective.id} canManage={canManageCompany} onClose={() => setExpandedId(null)} /></div>}
      </div>;
    })}
  </div>;
}
