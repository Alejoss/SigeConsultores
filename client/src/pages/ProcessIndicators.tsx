import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { TrendingUp, Target, Settings, Users, CheckSquare, ArrowLeft, Camera, ChevronLeft } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis as RadarAngleAxis, Tooltip } from "recharts";

// ─── Mapa de etiquetas para tipo de seguimiento ───────────────────────────────
const TRACKING_LABELS: Record<string, string> = {
  puntual: "Puntual (valor directo)",
  mensual_sumatoria: "Mensual Sumatoria (12 meses)",
  mensual_promedio: "Mensual Promedio (12 meses)",
  mensual_checklist: "Mensual Check List",
};

// ─── Gráfico circular de cumplimiento ────────────────────────────────────────
function CircularProgress({ value, size = 80 }: { value: number; size?: number }) {
  const color = value >= 80 ? "#22c55e" : value >= 60 ? "#f59e0b" : "#ef4444";
  const innerR = Math.round(size * 0.27);
  const outerR = Math.round(size * 0.38);
  const data = [
    { value: Math.max(0, Math.min(100, value)) },
    { value: Math.max(0, 100 - Math.min(100, value)) },
  ];
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerR}
            outerRadius={outerR}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="rgba(255,255,255,0.15)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold text-white" style={{ fontSize: size * 0.18 }}>{value}%</span>
      </div>
    </div>
  );
}

// ─── Paleta de colores (inspirada en el PowerPoint de Agrogana) ───────────────
const C = {
  darkGreen: "#14532D",
  medGreen: "#1B7A3D",
  lightGreenText: "#8FD3A6",
  lightGreenBg: "#D6EADD",
  veryLightGreen: "#EAF3EC",
  grayGreen: "#E7EDE9",
  textSecondary: "#5A6B62",
  amber: "#B4881A",
  amberBg: "#F3E7CE",
  red: "#C0504D",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pctColor(v: number | null): string {
  if (v === null) return "text-gray-400";
  if (v >= 80) return "text-green-600";
  if (v >= 60) return "text-yellow-600";
  return "text-red-600";
}
function pctBadge(v: number | null): string {
  if (v === null) return "bg-gray-100 text-gray-500";
  if (v >= 80) return "bg-green-100 text-green-700";
  if (v >= 60) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}
function pctLabel(v: number | null): string {
  if (v === null) return "Sin datos";
  if (v >= 80) return "En Meta";
  if (v >= 60) return "Alerta";
  return "Crítico";
}

// ─── Componente: Barra de progreso ────────────────────────────────────────────
function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = value >= 80 ? "#22c55e" : value >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Meses para seguimiento mensual ─────────────────────────────────────────
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// ─── Componente: Card de OTE individual ──────────────────────────────────────
function OTECard({ ote, index }: { ote: any; index: number }) {
  const [expanded, setExpanded] = useState(false);

  // Datos de seguimiento según el método
  const renderTrackingData = () => {
    if (!ote.trackingType || ote.trackingType === "puntual") return null;

    if (ote.trackingType === "mensual_sumatoria" || ote.trackingType === "mensual_promedio") {
      const mv = ote.monthlyValues || {};
      return (
        <div className="mt-3 pt-2 border-t" style={{ borderColor: "#1B7A3D" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: C.lightGreenText }}>Valores mensuales</p>
          <div className="grid grid-cols-4 gap-1">
            {MESES.map((mes, i) => {
              const key = String(i + 1);
              const val = mv[key] ?? mv[mes] ?? mv[mes.toLowerCase()] ?? null;
              return (
                <div key={mes} className="text-center">
                  <p className="text-xs" style={{ color: C.lightGreenText }}>{mes}</p>
                  <p className="text-xs font-bold text-white">
                    {val !== null && val !== undefined && val !== "" ? Number(val).toLocaleString() : <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (ote.trackingType === "mensual_checklist") {
      const cv = ote.checklistValues || {};
      return (
        <div className="mt-3 pt-2 border-t" style={{ borderColor: "#1B7A3D" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: C.lightGreenText }}>Check mensual</p>
          <div className="grid grid-cols-4 gap-1">
            {MESES.map((mes, i) => {
              const key = String(i + 1);
              const val = cv[key] ?? cv[mes] ?? cv[mes.toLowerCase()] ?? null;
              const checked = val === true || val === 1 || val === "1" || val === "true";
              return (
                <div key={mes} className="text-center">
                  <p className="text-xs" style={{ color: C.lightGreenText }}>{mes}</p>
                  <p className="text-xs font-bold" style={{ color: checked ? "#22c55e" : "rgba(255,255,255,0.3)" }}>
                    {checked ? "✓" : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-xl border overflow-hidden shadow-sm mb-4" style={{ borderColor: "#D6EADD" }}>
      {/* Cabecera: Objetivo Estratégico + Ponderación */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: C.veryLightGreen }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.medGreen }}>
            Objetivo Estratégico
          </span>
          {ote.strategicObjective && (
            <span className="text-xs font-semibold" style={{ color: C.darkGreen }}>
              · {ote.strategicObjective}
            </span>
          )}
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: C.lightGreenBg, color: C.darkGreen }}>
          Pond. {ote.ponderacion || 0}%
        </span>
      </div>

      {/* Enunciado del OTE con número */}
      <div className="px-4 py-3 bg-white">
        <p className="text-xs font-bold mb-0.5" style={{ color: C.medGreen }}>OTE {index + 1}</p>
        <p className="font-semibold text-gray-800 text-sm leading-snug">{ote.name}</p>
        {ote.strategicObjectiveDescription && (
          <p className="text-xs mt-1" style={{ color: C.textSecondary }}>{ote.strategicObjectiveDescription}</p>
        )}
      </div>

      {/* Panel principal: % cumplimiento + OO */}
      <div className="grid grid-cols-5 gap-0">
        {/* Columna izquierda: indicadores */}
        <div className="col-span-2 p-4 text-white" style={{ backgroundColor: C.darkGreen }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.lightGreenText }}>
            % Meta Alcanzada (OTE)
          </p>
          {/* % grande */}
          <p className="text-6xl font-extrabold mb-1 leading-none">{ote.porcentajeMetaAlcanzado}%</p>
          <p className="text-xs mb-2" style={{ color: C.lightGreenBg }}>
            Punto partida: {ote.puntoPartida} → Meta: {ote.metaLlegada} {ote.unidadMedida}
          </p>

          {/* Gráfico circular más grande */}
          <div className="my-2 flex justify-center">
            <CircularProgress value={ote.porcentajeMetaAlcanzado} size={96} />
          </div>

          <div className="border-t pt-3 space-y-2" style={{ borderColor: "#1B7A3D" }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: C.lightGreenText }}>Avance Obj. Operativos</p>
              <p className="text-2xl font-bold">{ote.hasOO ? `${ote.pctOO}%` : <span className="text-sm text-gray-300">Sin OO</span>}</p>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: C.lightGreenText }}>Avance Tareas</p>
              {ote.tasksGlobalAvg !== null
                ? <p className="text-2xl font-bold">{ote.tasksGlobalAvg}%</p>
                : <p className="text-sm" style={{ color: C.grayGreen }}>Sin tareas</p>
              }
            </div>
            {/* Método de medición + datos de seguimiento */}
            {ote.trackingType && (
              <div className="pt-2 border-t" style={{ borderColor: "#1B7A3D" }}>
                <p className="text-xs font-semibold" style={{ color: C.lightGreenText }}>Método de medición</p>
                <p className="text-xs mt-0.5" style={{ color: C.lightGreenBg }}>
                  {TRACKING_LABELS[ote.trackingType] || ote.trackingType}
                </p>
                {renderTrackingData()}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: Objetivos Operativos */}
        <div className="col-span-3 p-4 bg-white">
          {!ote.hasOO ? (
            <p className="text-sm text-gray-400 italic">No hay Objetivos Operativos definidos</p>
          ) : (
            <>
              <p className="text-xs font-bold uppercase mb-2" style={{ color: C.darkGreen }}>Objetivos Operativos</p>
              <div className="space-y-2">
                {ote.objetivosOperativos.slice(0, expanded ? undefined : 3).map((oo: any) => (
                  <div key={oo.id} className="rounded-lg p-2" style={{ backgroundColor: C.veryLightGreen }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-gray-700 flex-1 leading-snug">{oo.description}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${pctBadge(oo.porcentajeAlcanzado)}`}>
                        {oo.porcentajeAlcanzado}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: C.textSecondary }}>Pond. {oo.ponderacion}%</span>
                      {oo.hasTasks ? (
                        <span className="text-xs" style={{ color: C.textSecondary }}>
                          Tareas: {oo.tasksAverage !== null ? `${Math.round(oo.tasksAverage)}%` : "Sin tareas"}
                        </span>
                      ) : (
                        <span className="text-xs italic text-gray-400">Sin tareas</span>
                      )}
                    </div>
                    <ProgressBar value={oo.porcentajeAlcanzado} />

                    {/* Tareas del OO */}
                    {oo.hasTasks && oo.tasks.length > 0 && (
                      <div className="mt-2 space-y-1 pl-2 border-l-2" style={{ borderColor: C.lightGreenBg }}>
                        {oo.tasks.map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between gap-2">
                            <p className="text-xs text-gray-600 flex-1 leading-snug">{t.description}</p>
                            <span className={`text-xs font-semibold shrink-0 ${pctColor(t.percentageCompleted)}`}>
                              {t.percentageCompleted}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {ote.objetivosOperativos.length > 3 && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs font-semibold mt-1"
                    style={{ color: C.medGreen }}
                  >
                    {expanded ? "▲ Ver menos" : `▼ Ver ${ote.objetivosOperativos.length - 3} más`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente: Card de OTG individual ──────────────────────────────────────
function OTGCard({ otg, index }: { otg: any; index: number }) {
  return (
    <div className="rounded-xl border overflow-hidden shadow-sm mb-4" style={{ borderColor: "#D6EADD" }}>
      {/* Cabecera */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: C.veryLightGreen }}>
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.medGreen }}>
          Objetivo Táctico de Gestión · OTG {index + 1}
        </span>
        <div className="flex gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${otg.comunicado ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {otg.comunicado ? "Comunicado" : "No comunicado"}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${otg.objetivoLogrado ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {otg.objetivoLogrado ? "Logrado" : "En proceso"}
          </span>
        </div>
      </div>

      {/* Enunciado */}
      <div className="px-4 py-3 bg-white">
        <p className="text-xs font-bold mb-0.5" style={{ color: C.medGreen }}>OTG {index + 1}</p>
        <p className="font-semibold text-gray-800 text-sm leading-snug">{otg.name}</p>
      </div>

      {/* Panel: % + tareas */}
      <div className="grid grid-cols-5 gap-0">
        <div className="col-span-2 p-4 text-white" style={{ backgroundColor: C.darkGreen }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.lightGreenText }}>
            % Cumplimiento OTG
          </p>
          <p className="text-4xl font-bold">{otg.pctOTG}%</p>
          <ProgressBar value={otg.pctOTG} />
          <p className="text-xs mt-2" style={{ color: C.lightGreenBg }}>
            {otg.tareas.length > 0 ? `${otg.tareas.length} tarea(s)` : "Sin tareas"}
          </p>
        </div>

        <div className="col-span-3 p-4 bg-white">
          {otg.tareas.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No hay tareas definidas</p>
          ) : (
            <>
              <p className="text-xs font-bold uppercase mb-2" style={{ color: C.darkGreen }}>Tareas</p>
              <div className="space-y-2">
                {otg.tareas.map((t: any) => (
                  <div key={t.id} className="rounded-lg p-2" style={{ backgroundColor: C.veryLightGreen }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-gray-700 flex-1 leading-snug">{t.description}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${pctBadge(t.porcentajeAlcanzado)}`}>
                        {t.porcentajeAlcanzado}%
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>Pond. {t.ponderacion}%</p>
                    <ProgressBar value={t.porcentajeAlcanzado} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tipos de ventana ─────────────────────────────────────────────────────────

// ─── Componente: Panel de Partes Interesadas enriquecido ────────────────────────
function StakeholdersPanel({ processId, partesValue }: { processId: number; partesValue: number }) {
  const { data: critData = [], isLoading } = trpc.criticalityMatrix.getWithStakeholders.useQuery(
    { processId },
    { enabled: processId > 0 }
  );
  const stats = useMemo(() => {
    const total = (critData as any[]).length;
    const implemented = (critData as any[]).filter((c: any) => c.implementationStatus === true || c.implementationStatus === 1).length;
    const pending = total - implemented;
    const internal = (critData as any[]).filter((c: any) => c.stakeholderIsInternal === true || c.stakeholderIsInternal === 1).length;
    const external = total - internal;
    const highCrit = (critData as any[]).filter((c: any) => (c.criticality || "").toUpperCase() === "A").length;
    const medCrit = (critData as any[]).filter((c: any) => (c.criticality || "").toUpperCase() === "B").length;
    const lowCrit = (critData as any[]).filter((c: any) => (c.criticality || "").toUpperCase() === "C").length;
    const pctImpl = total > 0 ? Math.round((implemented / total) * 100) : 0;
    return { total, implemented, pending, internal, external, highCrit, medCrit, lowCrit, pctImpl };
  }, [critData]);
  const radarData = [
    { subject: "Identificadas", value: stats.total > 0 ? 100 : 0 },
    { subject: "Implementadas", value: stats.pctImpl },
    { subject: "Internas", value: stats.total > 0 ? Math.round((stats.internal / stats.total) * 100) : 0 },
    { subject: "Externas", value: stats.total > 0 ? Math.round((stats.external / stats.total) * 100) : 0 },
    { subject: "Criticidad Alta", value: stats.total > 0 ? Math.round((stats.highCrit / stats.total) * 100) : 0 },
  ];
  if (isLoading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>;
  if (stats.total === 0) return (
    <div className="text-center py-12">
      <Users size={48} className="mx-auto mb-4 opacity-30 text-gray-400" />
      <p className="text-lg font-semibold text-gray-600 mb-2">Sin partes interesadas registradas</p>
      <p className="text-sm text-gray-400">Registra las partes interesadas en la Matriz de Criticidad para ver los indicadores aquí.</p>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: C.veryLightGreen }}>
          <p className="text-xs font-semibold mb-1" style={{ color: C.textSecondary }}>Total PI</p>
          <p className="text-3xl font-bold" style={{ color: C.darkGreen }}>{stats.total}</p>
        </div>
        <div className="rounded-xl p-3 text-center bg-green-50 border border-green-100">
          <p className="text-xs font-semibold mb-1 text-green-600">Implementadas</p>
          <p className="text-3xl font-bold text-green-700">{stats.implemented}</p>
        </div>
        <div className="rounded-xl p-3 text-center bg-amber-50 border border-amber-100">
          <p className="text-xs font-semibold mb-1 text-amber-600">Pendientes</p>
          <p className="text-3xl font-bold text-amber-700">{stats.pending}</p>
        </div>
        <div className="rounded-xl p-3 text-center border-2" style={{ borderColor: (partesValue >= 80 ? "#22c55e" : partesValue >= 60 ? "#f59e0b" : "#ef4444") + "40", backgroundColor: (partesValue >= 80 ? "#22c55e" : partesValue >= 60 ? "#f59e0b" : "#ef4444") + "10" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: partesValue >= 80 ? "#16a34a" : partesValue >= 60 ? "#ca8a04" : "#dc2626" }}>% Implementado</p>
          <p className="text-3xl font-bold" style={{ color: partesValue >= 80 ? "#16a34a" : partesValue >= 60 ? "#ca8a04" : "#dc2626" }}>{partesValue}%</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4 bg-white" style={{ borderColor: C.lightGreenBg }}>
          <p className="text-sm font-semibold mb-3" style={{ color: C.darkGreen }}>Radar de Gestión</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <RadarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#64748b" }} />
              <Radar name="PI" dataKey="value" stroke={C.medGreen} fill={C.medGreen} fillOpacity={0.25} strokeWidth={2} />
              <Tooltip formatter={(v: any) => [`${v}%`]} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border p-4 bg-white space-y-3" style={{ borderColor: C.lightGreenBg }}>
          <p className="text-sm font-semibold" style={{ color: C.darkGreen }}>Distribución</p>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-600">Internas</span>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-slate-100 rounded-full h-2"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${stats.total > 0 ? Math.round((stats.internal / stats.total) * 100) : 0}%` }} /></div>
              <span className="text-xs font-bold text-blue-600 w-8 text-right">{stats.internal}</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-600">Externas</span>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-slate-100 rounded-full h-2"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${stats.total > 0 ? Math.round((stats.external / stats.total) * 100) : 0}%` }} /></div>
              <span className="text-xs font-bold text-indigo-600 w-8 text-right">{stats.external}</span>
            </div>
          </div>
          <div className="pt-2 border-t" style={{ borderColor: C.lightGreenBg }}>
            <p className="text-xs font-semibold mb-2" style={{ color: C.textSecondary }}>Por criticidad</p>
            <div className="flex gap-2">
              <span className="flex-1 text-center text-xs py-1 rounded-lg bg-red-50 border border-red-200"><span className="font-bold text-red-600">{stats.highCrit}</span><br /><span className="text-red-400">Alta</span></span>
              <span className="flex-1 text-center text-xs py-1 rounded-lg bg-amber-50 border border-amber-200"><span className="font-bold text-amber-600">{stats.medCrit}</span><br /><span className="text-amber-400">Media</span></span>
              <span className="flex-1 text-center text-xs py-1 rounded-lg bg-green-50 border border-green-200"><span className="font-bold text-green-600">{stats.lowCrit}</span><br /><span className="text-green-400">Baja</span></span>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.lightGreenBg }}>
        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ backgroundColor: C.veryLightGreen, color: C.textSecondary }}>Detalle de Partes Interesadas</div>
        <div className="divide-y" style={{ borderColor: C.lightGreenBg }}>
          {(critData as any[]).map((c: any) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
              <div className="flex-shrink-0">{c.implementationStatus ? <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">✓</span> : <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">!</span>}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{c.stakeholderName || "Sin nombre"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-400">{c.stakeholderIsInternal ? "Interna" : "Externa"}</span>
                  <span className="text-xs text-slate-300">·</span>
                  <span className="text-xs text-slate-400">{c.stakeholderType === "cliente" ? "Cliente" : "Proveedor"}</span>
                  {c.endDate && (<><span className="text-xs text-slate-300">·</span><span className="text-xs text-slate-400">Fecha: {new Date(c.endDate).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })}</span></>)}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: (c.criticality || "").toUpperCase() === "A" ? "#fee2e2" : (c.criticality || "").toUpperCase() === "B" ? "#fef9c3" : "#dcfce7", color: (c.criticality || "").toUpperCase() === "A" ? "#dc2626" : (c.criticality || "").toUpperCase() === "B" ? "#ca8a04" : "#16a34a" }}>Crit. {c.criticality || "—"}</span>
                {c.completionPercentage !== null && c.completionPercentage !== undefined && (<span className={`text-xs font-bold ${pctColor(c.completionPercentage)}`}>{c.completionPercentage}%</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type PanelType = "ote" | "otg" | "partes" | "cumplimientos" | null;

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ProcessIndicators() {
  const [, navigate] = useLocation();
  const selectedProcessId = localStorage.getItem("selectedProcessId");
  const processId = selectedProcessId ? parseInt(selectedProcessId) : 0;
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const { data: indicatorsData, isLoading } = trpc.consolidatedIndicators.getConsolidatedIndicators.useQuery(
    { processId },
    { enabled: processId > 0 }
  );

  // Extraer datos del backend
  const oteData = indicatorsData?.find((d: any) => d.id === "alcanzado");
  const otgData = indicatorsData?.find((d: any) => d.id === "total_alcanzado");
  const partesData = indicatorsData?.find((d: any) => d.id === "cumplimiento");
  const cumplimientosData = indicatorsData?.find((d: any) => d.id === "promedio_cumplimiento");

  const oteValue = oteData?.value ?? 0;
  const otgValue = otgData ? Math.round((otgData.value / Math.max(otgData.otgRows?.length || 1, 1)) * 100) : 0;
  const partesValue = partesData?.value ?? 0;
  const cumplimientosValue = cumplimientosData?.value ?? 0;

  const totalAverage = Math.round((oteValue + otgValue + partesValue + cumplimientosValue) / 4);

  // Exportar como imagen usando html2canvas
  const handleExportImage = async () => {
    if (!exportRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `indicadores_${activePanel || "proceso"}_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Imagen exportada correctamente");
    } catch (e) {
      toast.error("Error al exportar la imagen");
    }
  };

  if (!processId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50 p-6 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 shadow text-center">
          <p className="text-gray-600 mb-4">Por favor, selecciona un proceso primero</p>
          <Button onClick={() => navigate("/process-characterization")}>Volver a Caracterización</Button>
        </div>
      </div>
    );
  }

  // ── Vista de detalle de un panel ──────────────────────────────────────────
  if (activePanel) {
    const panelTitle: Record<PanelType & string, string> = {
      ote: "Objetivos Tácticos Estratégicos (OTE)",
      otg: "Objetivos Tácticos de Gestión (OTG)",
      partes: "Gestión con Partes Interesadas",
      cumplimientos: "Cumplimientos",
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50 p-4">
        <div className="max-w-5xl mx-auto">
          {/* Barra superior */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setActivePanel(null)}
              className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              <ChevronLeft size={16} /> Volver
            </button>
            <h2 className="text-xl font-bold text-gray-800">{panelTitle[activePanel]}</h2>
            <Button
              onClick={handleExportImage}
              className="flex items-center gap-2 text-sm"
              style={{ backgroundColor: C.darkGreen }}
            >
              <Camera size={15} /> Exportar imagen
            </Button>
          </div>

          {/* Contenido exportable */}
          <div ref={exportRef} className="bg-white rounded-2xl p-6 shadow-sm">
            {/* Título del panel */}
            <div className="mb-5 pb-3 border-b" style={{ borderColor: C.lightGreenBg }}>
              <h3 className="text-lg font-bold" style={{ color: C.darkGreen }}>{panelTitle[activePanel]}</h3>
              <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>
                Indicadores del proceso · {new Date().toLocaleDateString("es-EC", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>

            {isLoading && (
              <p className="text-center text-gray-400 py-8">Cargando indicadores...</p>
            )}

            {/* OTE */}
            {activePanel === "ote" && !isLoading && (
              <>
                {/* Resumen global */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="rounded-xl p-4 text-center" style={{ backgroundColor: C.veryLightGreen }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: C.textSecondary }}>% Meta Alcanzada OTE</p>
                    <p className={`text-3xl font-bold ${pctColor(oteValue)}`}>{oteValue}%</p>
                    <p className={`text-xs mt-1 font-semibold ${pctBadge(oteValue).split(" ")[1]}`}>{pctLabel(oteValue)}</p>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ backgroundColor: C.veryLightGreen }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: C.textSecondary }}>Objetivos Tácticos</p>
                    <p className="text-3xl font-bold" style={{ color: C.darkGreen }}>{oteData?.oteRows?.length ?? 0}</p>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ backgroundColor: C.veryLightGreen }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: C.textSecondary }}>Estado</p>
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${pctBadge(oteValue)}`}>{pctLabel(oteValue)}</span>
                  </div>
                </div>

                {/* Cards por OTE */}
                {!oteData?.oteRows || oteData.oteRows.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Target size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay Objetivos Tácticos Estratégicos definidos para este proceso</p>
                  </div>
                ) : (
                  oteData.oteRows.map((ote: any, idx: number) => <OTECard key={ote.id} ote={ote} index={idx} />)
                )}
              </>
            )}

            {/* OTG */}
            {activePanel === "otg" && !isLoading && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="rounded-xl p-4 text-center" style={{ backgroundColor: C.veryLightGreen }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: C.textSecondary }}>OTG Logrados</p>
                    <p className="text-3xl font-bold" style={{ color: C.darkGreen }}>{otgData?.value ?? 0}</p>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ backgroundColor: C.veryLightGreen }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: C.textSecondary }}>% Comunicados</p>
                    <p className={`text-3xl font-bold ${pctColor(indicatorsData?.find((d: any) => d.id === "comunicado")?.value ?? 0)}`}>
                      {indicatorsData?.find((d: any) => d.id === "comunicado")?.value ?? 0}%
                    </p>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ backgroundColor: C.veryLightGreen }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: C.textSecondary }}>Total OTG</p>
                    <p className="text-3xl font-bold" style={{ color: C.darkGreen }}>{otgData?.otgRows?.length ?? 0}</p>
                  </div>
                </div>

                {!otgData?.otgRows || otgData.otgRows.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Settings size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay Objetivos Tácticos de Gestión definidos para este proceso</p>
                  </div>
                ) : (
                  otgData.otgRows.map((otg: any, idx: number) => <OTGCard key={otg.id} otg={otg} index={idx} />)
                )}
              </>
            )}

            {/* Partes Interesadas */}
            {activePanel === "partes" && !isLoading && (
              <StakeholdersPanel processId={processId} partesValue={partesValue} />
            )}

            {/* Cumplimientos */}
            {activePanel === "cumplimientos" && !isLoading && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-4" style={{ backgroundColor: C.veryLightGreen }}>
                  <p className={`text-3xl font-bold ${pctColor(cumplimientosValue)}`}>{cumplimientosValue}%</p>
                </div>
                <p className="text-lg font-semibold text-gray-700 mb-2">% Cumplimientos completados</p>
                <span className={`text-sm font-bold px-4 py-2 rounded-full ${pctBadge(cumplimientosValue)}`}>{pctLabel(cumplimientosValue)}</span>
                <p className="text-sm mt-4" style={{ color: C.textSecondary }}>
                  Porcentaje de requisitos legales, reglamentarios y de sistema de gestión marcados como completados.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Vista principal: 4 ventanas ───────────────────────────────────────────
  const panels = [
    {
      id: "ote" as PanelType,
      title: "OTE",
      subtitle: "Objetivos Tácticos Estratégicos",
      description: "% de meta alcanzada por objetivos tácticos y operativos",
      icon: <Target size={32} style={{ color: C.medGreen }} />,
      value: oteValue,
      extra: `${oteData?.oteRows?.length ?? 0} objetivo(s)`,
    },
    {
      id: "otg" as PanelType,
      title: "OTG",
      subtitle: "Objetivos Tácticos de Gestión",
      description: "% cumplimiento de objetivos de gestión y sus tareas",
      icon: <Settings size={32} style={{ color: C.medGreen }} />,
      value: otgValue,
      extra: `${otgData?.otgRows?.length ?? 0} objetivo(s)`,
    },
    {
      id: "partes" as PanelType,
      title: "Partes Interesadas",
      subtitle: "Gestión con Partes Interesadas",
      description: "% de acciones implementadas en la matriz de criticidad",
      icon: <Users size={32} style={{ color: C.medGreen }} />,
      value: partesValue,
      extra: "",
    },
    {
      id: "cumplimientos" as PanelType,
      title: "Cumplimientos",
      subtitle: "Requisitos y Cumplimientos",
      description: "% de requisitos legales y de sistema completados",
      icon: <CheckSquare size={32} style={{ color: C.medGreen }} />,
      value: cumplimientosValue,
      extra: "",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Indicadores del Proceso</h1>
            <p className="text-sm mt-1" style={{ color: C.textSecondary }}>Selecciona una categoría para ver el detalle</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/process-characterization")} className="flex items-center gap-2">
            <ArrowLeft size={16} /> Volver
          </Button>
        </div>

        {/* Avance Total */}
        <div className="rounded-2xl p-6 mb-6 text-white flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${C.darkGreen}, ${C.medGreen})` }}>
          <div>
            <p className="text-sm font-medium opacity-80">Avance Total del Proceso</p>
            <p className="text-5xl font-bold mt-1">{totalAverage}%</p>
            <span className={`text-sm font-semibold mt-2 inline-block px-3 py-1 rounded-full ${
              totalAverage >= 80 ? "bg-green-200 text-green-800" : totalAverage >= 60 ? "bg-yellow-200 text-yellow-800" : "bg-red-200 text-red-800"
            }`}>
              {pctLabel(totalAverage)}
            </span>
          </div>
          <TrendingUp size={56} className="opacity-20" />
        </div>

        {/* 4 Ventanas */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Cargando indicadores...</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {panels.map((panel) => (
              <button
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className="rounded-2xl p-6 bg-white shadow-sm border text-left hover:shadow-md transition-all hover:-translate-y-0.5 group"
                style={{ borderColor: C.lightGreenBg }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: C.veryLightGreen }}>
                    {panel.icon}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${pctBadge(panel.value)}`}>
                    {pctLabel(panel.value)}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-0.5">{panel.title}</h3>
                <p className="text-xs font-semibold mb-2" style={{ color: C.medGreen }}>{panel.subtitle}</p>
                <p className="text-xs text-gray-500 mb-4 leading-snug">{panel.description}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className={`text-3xl font-bold ${pctColor(panel.value)}`}>{panel.value}%</p>
                    {panel.extra && <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>{panel.extra}</p>}
                  </div>
                  <span className="text-xs font-semibold group-hover:underline" style={{ color: C.medGreen }}>
                    Ver detalle →
                  </span>
                </div>
                <ProgressBar value={panel.value} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
