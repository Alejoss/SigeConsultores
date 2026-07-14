import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, X } from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type TrendPoint = {
  year: number;
  month: number;
  label: string;
  otePercent: number;
  otgPercent: number;
  stakeholderPercent: number;
  oteMeta: number;
  otgMeta: number;
  stakeholderMeta: number;
};

type OteObjective = {
  id: number;
  name: string;
  strategicObjective: string;
  percent: number;
  ponderacion: number;
};

type OteProcess = {
  processId: number;
  processName: string;
  objectives: OteObjective[];
};

// ─── Tooltip personalizado ────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-bold text-slate-700 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold" style={{ color: entry.color }}>
            {typeof entry.value === "number" ? `${entry.value.toFixed(1)}%` : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Dot personalizado que muestra el valor ───────────────────────────────────
function LabelDot(props: any) {
  const { cx, cy, value, fill } = props;
  if (value === undefined || value === null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={fill} stroke="white" strokeWidth={2} />
      <text
        x={cx}
        y={cy - 10}
        textAnchor="middle"
        fill={fill}
        fontSize={11}
        fontWeight="600"
      >
        {value.toFixed(1)}
      </text>
    </g>
  );
}

// ─── Tarjeta de KPI ───────────────────────────────────────────────────────────
function KpiCard({
  title,
  current,
  meta,
  color,
  badge,
}: {
  title: string;
  current: number;
  meta: number;
  color: string;
  badge: string;
}) {
  const diff = current - meta;
  const isAbove = diff >= 0;
  const isClose = Math.abs(diff) < 5;

  return (
    <Card className="border-2" style={{ borderColor: color + "40" }}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" translate="no">
              {badge}
            </p>
            <p className="text-sm font-medium text-slate-700">{title}</p>
          </div>
          <div
            className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
            style={{
              backgroundColor: isAbove ? "#dcfce7" : isClose ? "#fef9c3" : "#fee2e2",
              color: isAbove ? "#16a34a" : isClose ? "#ca8a04" : "#dc2626",
            }}
          >
            {isAbove ? <TrendingUp size={12} /> : isClose ? <Minus size={12} /> : <TrendingDown size={12} />}
            {isAbove ? "En meta" : isClose ? "Cerca" : "Bajo meta"}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold" style={{ color }}>
            {current.toFixed(1)}%
          </span>
          <span className="text-slate-400 text-sm mb-1">/ {meta}% meta</span>
        </div>
        <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, current)}%`, backgroundColor: color }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Desglose OTE colapsable ──────────────────────────────────────────────────
function OteBreakdown({ companyId }: { companyId: number }) {
  const [expandedProcess, setExpandedProcess] = useState<number | null>(null);
  const { data: breakdown = [], isLoading } = trpc.strategicTrends.getOteBreakdown.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  return (
    <div className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin w-5 h-5 text-blue-400" />
            </div>
          ) : breakdown.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">
              No hay objetivos tácticos registrados.
            </p>
          ) : (
            (breakdown as OteProcess[]).map((proc) => {
              const isExpanded = expandedProcess === proc.processId;
              // % promedio del proceso
              const avgPercent = proc.objectives.length > 0
                ? Math.round(proc.objectives.reduce((s, o) => s + o.percent, 0) / proc.objectives.length)
                : 0;
              const barColor =
                avgPercent >= 80 ? "#16a34a" : avgPercent >= 50 ? "#ca8a04" : "#dc2626";

              return (
                <Card key={proc.processId} className="border border-slate-200">
                  <CardContent className="pt-3 pb-3">
                    {/* Cabecera del proceso */}
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedProcess(isExpanded ? null : proc.processId)}
                    >
                      <span className="font-semibold text-slate-700 text-sm">{proc.processName}</span>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-sm font-bold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: barColor + "20",
                            color: barColor,
                          }}
                        >
                          {avgPercent}%
                        </span>
                        {isExpanded
                          ? <ChevronUp size={14} className="text-slate-400" />
                          : <ChevronDown size={14} className="text-slate-400" />}
                      </div>
                    </div>

                    {/* Objetivos del proceso */}
                    {isExpanded && (
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        {proc.objectives.map((obj) => {
                          const objColor =
                            obj.percent >= 80 ? "#16a34a"
                            : obj.percent >= 50 ? "#ca8a04"
                            : "#dc2626";
                          return (
                            <div key={obj.id} className="bg-slate-50 rounded-lg p-3">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex-1">
                                  {obj.strategicObjective && obj.strategicObjective !== "Sin clasificar" && (
                                    <p className="text-xs text-slate-400 mb-0.5 font-medium uppercase tracking-wide">
                                      {obj.strategicObjective}
                                    </p>
                                  )}
                                  <p className="text-sm text-slate-700 leading-snug">{obj.name}</p>
                                </div>
                                <span
                                  className="shrink-0 text-sm font-bold px-2 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: objColor + "20",
                                    color: objColor,
                                  }}
                                >
                                  {obj.percent}%
                                </span>
                              </div>
                              {/* Mini barra de progreso */}
                              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(100, obj.percent)}%`,
                                    backgroundColor: objColor,
                                  }}
                                />
                              </div>
                              {obj.ponderacion > 0 && (
                                <p className="text-xs text-slate-400 mt-1">
                                  Ponderación: {obj.ponderacion}%
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
            </div>
  );
}
// ─── Gráfico individual ───────────────────────────────────────────────────────
function TrendChart({
  title,
  badge,
  data,
  realKey,
  metaKey,
  realLabel,
  metaLabel,
  realColor,
  metaColor,
  yearFilter,
}: {
  title: string;
  badge: string;
  data: TrendPoint[];
  realKey: keyof TrendPoint;
  metaKey: keyof TrendPoint;
  realLabel: string;
  metaLabel: string;
  realColor: string;
  metaColor: string;
  yearFilter: number | "all";
}) {
  const filtered = useMemo(() => {
    if (yearFilter === "all") return data;
    return data.filter((d) => d.year === yearFilter);
  }, [data, yearFilter]);

  const currentValue = filtered.length > 0
    ? (filtered[filtered.length - 1][realKey] as number)
    : 0;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-bold px-2 py-1 rounded-md"
              style={{ backgroundColor: realColor + "20", color: realColor }}
              translate="no"
            >
              {badge}
            </span>
            <CardTitle className="text-base font-semibold text-slate-700">
              {title}
            </CardTitle>
          </div>
          <span className="text-sm font-bold" style={{ color: realColor }}>
            {currentValue.toFixed(1)}% actual
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
            Sin datos para el período seleccionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={filtered}
              margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              {/* Línea de meta */}
              <Line
                type="monotone"
                dataKey={metaKey as string}
                name={metaLabel}
                stroke={metaColor}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                activeDot={{ r: 4 }}
              />
              {/* Línea real */}
              <Line
                type="monotone"
                dataKey={realKey as string}
                name={realLabel}
                stroke={realColor}
                strokeWidth={2.5}
                dot={<LabelDot fill={realColor} />}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

      </CardContent>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function StrategicTrends() {
  const [, setLocation] = useLocation();
  const { isManagerLogin, managerCompanyId } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [showOteModal, setShowOteModal] = useState(false);

  const companyId = useMemo<number>(() => {
    if (isManagerLogin && managerCompanyId) return managerCompanyId;
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    return getCompanyIdFromLocationOrStorage() || 0;
  }, [isManagerLogin, managerCompanyId, processLeaderSession]);

  const { data: trendsResult, isLoading } = trpc.strategicTrends.getTrends.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const data: TrendPoint[] = trendsResult?.data ?? [];

  const availableYears = useMemo(() => {
    const years = [...new Set(data.map((d) => d.year))].sort();
    return years;
  }, [data]);

  const latest = data.length > 0 ? data[data.length - 1] : null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/performance")}
            className="flex items-center gap-2"
          >
            ← Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Tendencias Estratégicas</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Evolución mensual del % de cumplimiento de OTE, OTG y Gestión con Partes Interesadas
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin w-8 h-8 text-blue-500" />
          </div>
        ) : data.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-slate-400 text-lg">No hay datos de tendencias disponibles.</p>
            <p className="text-slate-400 text-sm mt-2">
              Los datos se registran automáticamente al cierre de cada mes.
            </p>
          </Card>
        ) : (
          <>
            {/* KPI Cards */}
            {latest && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <KpiCard
                  title="Objetivos Tácticos Estratégicos"
                  badge="OTE"
                  current={latest.otePercent}
                  meta={latest.oteMeta}
                  color="#3b82f6"
                />
                <KpiCard
                  title="Objetivos Tácticos de Gestión"
                  badge="OTG"
                  current={latest.otgPercent}
                  meta={latest.otgMeta}
                  color="#8b5cf6"
                />
                <KpiCard
                  title="Gestión con Partes Interesadas"
                  badge="GPI"
                  current={latest.stakeholderPercent}
                  meta={latest.stakeholderMeta}
                  color="#10b981"
                />
              </div>
            )}

            {/* Filtro por año */}
            <div className="flex items-center gap-2 mb-6">
              <span className="text-sm text-slate-500 font-medium">Ver:</span>
              <button
                onClick={() => setYearFilter("all")}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  yearFilter === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Todos los años
              </button>
              {availableYears.map((year) => (
                <button
                  key={year}
                  onClick={() => setYearFilter(year)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    yearFilter === year
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>

            {/* Gráficos */}
            <div className="flex flex-col gap-6">
              {/* OTE — con botón de desglose que abre modal */}
              <div className="relative">
                <TrendChart
                  title="Objetivos Tácticos Estratégicos"
                  badge="OTE"
                  data={data}
                  realKey="otePercent"
                  metaKey="oteMeta"
                  realLabel="OTE — Avance real"
                  metaLabel="Meta OTE"
                  realColor="#3b82f6"
                  metaColor="#ef4444"
                  yearFilter={yearFilter}
                />
                <div className="px-4 pb-3">
                  <button
                    onClick={() => setShowOteModal(true)}
                    className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <ChevronDown size={16} />
                    Desplegar OTE
                  </button>
                </div>
              </div>
              {/* OTG — sin desglose */}
              <TrendChart
                title="Objetivos Tácticos de Gestión"
                badge="OTG"
                data={data}
                realKey="otgPercent"
                metaKey="otgMeta"
                realLabel="OTG — Avance real"
                metaLabel="Meta OTG"
                realColor="#8b5cf6"
                metaColor="#ef4444"
                yearFilter={yearFilter}
              />
              {/* GPI — sin desglose */}
              <TrendChart
                title="Gestión con Partes Interesadas"
                badge="GPI"
                data={data}
                realKey="stakeholderPercent"
                metaKey="stakeholderMeta"
                realLabel="GPI — Avance real"
                metaLabel="Meta GPI"
                realColor="#10b981"
                metaColor="#ef4444"
                yearFilter={yearFilter}
              />
            </div>

            {trendsResult?.hasSavedData === false && (
              <p className="text-xs text-slate-400 text-center mt-6">
                Mostrando datos calculados en tiempo real. Los snapshots históricos se registran al cierre de cada mes.
              </p>
            )}
          </>
        )}
      </div>
      {/* Modal de desglose OTE — renderizado via portal fuera del árbol de Recharts */}
      {showOteModal && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowOteModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-xl">
              <h2 className="text-lg font-bold text-slate-800">Desglose de Objetivos Tácticos Estratégicos</h2>
              <button
                onClick={() => setShowOteModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <OteBreakdown companyId={companyId} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}
