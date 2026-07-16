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
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  TooltipProps,
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

// ─── Tarjeta de KPI con indicador interanual ──────────────────────────────────
function KpiCard({
  title,
  current,
  meta,
  color,
  badge,
  prevYearClose,
  prevYear,
}: {
  title: string;
  current: number;
  meta: number;
  color: string;
  badge: string;
  prevYearClose?: number;
  prevYear?: number;
}) {
  const diff = current - meta;
  const isAbove = diff >= 0;
  const isClose = Math.abs(diff) < 5;

  // Diferencia vs cierre del año anterior
  const yoyDiff = prevYearClose !== undefined ? current - prevYearClose : null;

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
        {/* Indicador interanual */}
        {yoyDiff !== null && prevYear !== undefined && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">vs. cierre {prevYear}:</span>
            <span
              className="font-bold flex items-center gap-0.5"
              style={{ color: yoyDiff >= 0 ? "#16a34a" : "#dc2626" }}
            >
              {yoyDiff >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {yoyDiff >= 0 ? "+" : ""}{yoyDiff.toFixed(1)}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tooltip para mini gráfica de OTE ────────────────────────────────────────
function OteChartTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs max-w-xs">
      <p className="font-bold text-slate-700 mb-1 leading-snug">{d.fullDescription || d.label}</p>
      {d.responsible && <p className="text-slate-400 mb-1">Responsable: {d.responsible}</p>}
      {d.endDate && <p className="text-slate-400 mb-1">Fecha: {d.endDate}</p>}
      <div className="flex gap-3 mt-1">
        <span className="text-blue-600 font-semibold">Avance: {d.avance}%</span>
        <span className="text-red-400 font-semibold">Meta: {d.meta}%</span>
      </div>
      {d.ponderacion > 0 && <p className="text-slate-400 mt-1">Ponderación: {d.ponderacion}%</p>}
    </div>
  );
}

// ─── Mini gráfica de un OTE individual ───────────────────────────────────────
function OteDetailChart({ objectiveId, companyId }: { objectiveId: number; companyId: number }) {
  const { data, isLoading } = trpc.strategicTrends.getOteDetail.useQuery(
    { objectiveId, companyId },
    { enabled: objectiveId > 0 && companyId > 0 }
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Loader2 className="animate-spin w-4 h-4 text-blue-400" />
      </div>
    );
  }
  if (!data || !data.chartPoints || data.chartPoints.length === 0) {
    return (
      <p className="text-slate-400 text-xs text-center py-4">Sin resultados clave registrados.</p>
    );
  }

  const globalColor = data.globalPercent >= data.globalMeta ? "#16a34a"
    : data.globalPercent >= data.globalMeta * 0.7 ? "#ca8a04"
    : "#dc2626";

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {/* Resumen global del OTE */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 font-medium">Avance global del objetivo</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Meta: {data.globalMeta}%</span>
          <span
            className="text-sm font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: globalColor + "20", color: globalColor }}
          >
            {data.globalPercent}%
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, data.globalPercent)}%`, backgroundColor: globalColor }}
        />
      </div>

      {/* Gráfica de barras por resultado clave */}
      <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wide">
        Resultados clave ({data.chartPoints.length})
      </p>
      <ResponsiveContainer width="100%" height={data.chartPoints.length > 4 ? 220 : 160}>
        <BarChart
          data={data.chartPoints}
          margin={{ top: 8, right: 8, left: 0, bottom: 5 }}
          layout="vertical"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip content={<OteChartTooltip />} />
          {/* Barra de meta (fondo) */}
          <Bar dataKey="meta" name="Meta" fill="#fca5a5" radius={[0, 3, 3, 0]} barSize={10}>
            {data.chartPoints.map((_: any, i: number) => (
              <Cell key={`meta-${i}`} fill="#fca5a5" />
            ))}
          </Bar>
          {/* Barra de avance (encima) */}
          <Bar dataKey="avance" name="Avance" radius={[0, 3, 3, 0]} barSize={10}>
            {data.chartPoints.map((pt: any, i: number) => {
              const c = pt.avance >= pt.meta ? "#16a34a"
                : pt.avance >= pt.meta * 0.7 ? "#ca8a04"
                : "#3b82f6";
              return <Cell key={`avance-${i}`} fill={c} />;
            })}
          </Bar>
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            iconType="circle"
            iconSize={7}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Desglose OTE colapsable con mini gráficas ───────────────────────────────
function OteBreakdown({ companyId }: { companyId: number }) {
  const [expandedProcess, setExpandedProcess] = useState<number | null>(null);
  const [expandedObj, setExpandedObj] = useState<number | null>(null);
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
              const avgPercent = proc.objectives.length > 0
                ? Math.round(proc.objectives.reduce((s, o) => s + o.percent, 0) / proc.objectives.length)
                : 0;
              const barColor =
                avgPercent >= 80 ? "#16a34a" : avgPercent >= 50 ? "#ca8a04" : "#dc2626";

              return (
                <Card key={proc.processId} className="border border-slate-200">
                  <CardContent className="pt-3 pb-3">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedProcess(isExpanded ? null : proc.processId)}
                    >
                      <span className="font-semibold text-slate-700 text-sm">{proc.processName}</span>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-sm font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: barColor + "20", color: barColor }}
                        >
                          {avgPercent}%
                        </span>
                        {isExpanded
                          ? <ChevronUp size={14} className="text-slate-400" />
                          : <ChevronDown size={14} className="text-slate-400" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        {proc.objectives.map((obj) => {
                          const objColor =
                            obj.percent >= 80 ? "#16a34a"
                            : obj.percent >= 50 ? "#ca8a04"
                            : "#dc2626";
                          const isObjExpanded = expandedObj === obj.id;
                          return (
                            <div key={obj.id} className="bg-slate-50 rounded-lg p-3">
                              <div
                                className="flex items-start justify-between gap-3 mb-2 cursor-pointer"
                                onClick={() => setExpandedObj(isObjExpanded ? null : obj.id)}
                              >
                                <div className="flex-1">
                                  {obj.strategicObjective && obj.strategicObjective !== "Sin clasificar" && (
                                    <p className="text-xs text-slate-400 mb-0.5 font-medium uppercase tracking-wide">
                                      {obj.strategicObjective}
                                    </p>
                                  )}
                                  <p className="text-sm text-slate-700 leading-snug">{obj.name}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className="text-sm font-bold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: objColor + "20", color: objColor }}
                                  >
                                    {obj.percent}%
                                  </span>
                                  {isObjExpanded
                                    ? <ChevronUp size={13} className="text-slate-400" />
                                    : <ChevronDown size={13} className="text-slate-400" />}
                                </div>
                              </div>
                              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(100, obj.percent)}%`, backgroundColor: objColor }}
                                />
                              </div>
                              {obj.ponderacion > 0 && (
                                <p className="text-xs text-slate-400 mt-1">
                                  Ponderación: {obj.ponderacion}%
                                </p>
                              )}
                              {/* Mini gráfica desplegable */}
                              {isObjExpanded && (
                                <OteDetailChart objectiveId={obj.id} companyId={companyId} />
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
  allData,
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
  allData: TrendPoint[];
  realKey: keyof TrendPoint;
  metaKey: keyof TrendPoint;
  realLabel: string;
  metaLabel: string;
  realColor: string;
  metaColor: string;
  yearFilter: number | "all" | "annual";
}) {
  // Vista "Cierre Anual": solo diciembre de cada año (o el último mes disponible del año)
  const filtered = useMemo(() => {
    if (yearFilter === "all") return data;
    if (yearFilter === "annual") {
      // Agrupar por año y tomar el último mes disponible
      const byYear = new Map<number, TrendPoint>();
      for (const d of allData) {
        const existing = byYear.get(d.year);
        if (!existing || d.month > existing.month) {
          byYear.set(d.year, d);
        }
      }
      return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
    }
    return data.filter((d) => d.year === yearFilter);
  }, [data, allData, yearFilter]);

  // Detectar cambios de año para líneas de referencia verticales
  const yearChanges = useMemo(() => {
    if (yearFilter !== "all") return [];
    const changes: string[] = [];
    for (let i = 1; i < filtered.length; i++) {
      if (filtered[i].year !== filtered[i - 1].year) {
        changes.push(filtered[i].label);
      }
    }
    return changes;
  }, [filtered, yearFilter]);

  const currentValue = filtered.length > 0
    ? (filtered[filtered.length - 1][realKey] as number)
    : 0;

  // Etiqueta del eje X para vista anual: solo el año
  const xTickFormatter = yearFilter === "annual"
    ? (label: string) => label.split(" ")[1] || label
    : undefined;

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
            {currentValue.toFixed(1)}% {yearFilter === "annual" ? "último cierre" : "actual"}
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
                tickFormatter={xTickFormatter}
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
              {/* Líneas verticales de cambio de año */}
              {yearChanges.map((label) => (
                <ReferenceLine
                  key={label}
                  x={label}
                  stroke="#cbd5e1"
                  strokeDasharray="4 2"
                  label={{ value: label.split(" ")[1], position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
                />
              ))}
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
  const [yearFilter, setYearFilter] = useState<number | "all" | "annual">("all");
  const [showOteModal, setShowOteModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const companyId = useMemo<number>(() => {
    if (isManagerLogin && managerCompanyId) return managerCompanyId;
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    return getCompanyIdFromLocationOrStorage() || 0;
  }, [isManagerLogin, managerCompanyId, processLeaderSession]);

  const publicApiUrl = companyId > 0
    ? `${window.location.origin}/api/public/strategic-trends/${companyId}`
    : "";

  const handleCopyUrl = () => {
    if (!publicApiUrl) return;
    navigator.clipboard.writeText(publicApiUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2500);
    });
  };

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

  // Cierre del año anterior (diciembre o último mes disponible del año previo)
  const prevYearData = useMemo(() => {
    if (!latest) return null;
    const prevYear = latest.year - 1;
    const prevYearPoints = data.filter((d) => d.year === prevYear);
    if (prevYearPoints.length === 0) return null;
    return prevYearPoints.reduce((max, d) => d.month > max.month ? d : max, prevYearPoints[0]);
  }, [data, latest]);

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
            {/* KPI Cards con indicador interanual */}
            {latest && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <KpiCard
                  title="Objetivos Tácticos Estratégicos"
                  badge="OTE"
                  current={latest.otePercent}
                  meta={latest.oteMeta}
                  color="#3b82f6"
                  prevYearClose={prevYearData?.otePercent}
                  prevYear={prevYearData?.year}
                />
                <KpiCard
                  title="Objetivos Tácticos de Gestión"
                  badge="OTG"
                  current={latest.otgPercent}
                  meta={latest.otgMeta}
                  color="#8b5cf6"
                  prevYearClose={prevYearData?.otgPercent}
                  prevYear={prevYearData?.year}
                />
                <KpiCard
                  title="Gestión con Partes Interesadas"
                  badge="GPI"
                  current={latest.stakeholderPercent}
                  meta={latest.stakeholderMeta}
                  color="#10b981"
                  prevYearClose={prevYearData?.stakeholderPercent}
                  prevYear={prevYearData?.year}
                />
              </div>
            )}

            {/* Filtro por año + vista de cierre anual */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
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
              {/* Vista de cierre anual — solo si hay más de un año */}
              {availableYears.length > 1 && (
                <button
                  onClick={() => setYearFilter("annual")}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                    yearFilter === "annual"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-amber-600 border-amber-300 hover:bg-amber-50"
                  }`}
                >
                  Cierre anual
                </button>
              )}
              {/* Botón Transferir URL para Power BI */}
              {companyId > 0 && (
                <button
                  onClick={() => setShowTransferModal(true)}
                  className="px-3 py-1 rounded-full text-sm font-medium transition-colors border bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50 flex items-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  Transferir URL
                </button>
              )}
            </div>

            {/* Nota explicativa para vista de cierre anual */}
            {yearFilter === "annual" && (
              <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                Mostrando el último valor registrado de cada año. Esta vista permite comparar el desempeño de la empresa año a año.
              </div>
            )}

            {/* Gráficos */}
            <div className="flex flex-col gap-6">
              {/* OTE — con botón de desglose que abre modal */}
              <div className="relative">
                <TrendChart
                  title="Objetivos Tácticos Estratégicos"
                  badge="OTE"
                  data={data}
                  allData={data}
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
              {/* OTG */}
              <TrendChart
                title="Objetivos Tácticos de Gestión"
                badge="OTG"
                data={data}
                allData={data}
                realKey="otgPercent"
                metaKey="otgMeta"
                realLabel="OTG — Avance real"
                metaLabel="Meta OTG"
                realColor="#8b5cf6"
                metaColor="#ef4444"
                yearFilter={yearFilter}
              />
              {/* GPI */}
              <TrendChart
                title="Gestión con Partes Interesadas"
                badge="GPI"
                data={data}
                allData={data}
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
      {/* Modal de desglose OTE */}
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
      {/* Modal Transferir URL para Power BI */}
      {showTransferModal && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTransferModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </div>
                <h2 className="text-base font-bold text-slate-800">Transferir URL — Power BI</h2>
              </div>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                Usa esta URL para conectar los datos de Tendencias Estratégicas directamente en <strong>Power BI</strong>, Excel u otras herramientas de análisis. Los datos se actualizan automáticamente cada vez que se consulta la URL.
              </p>

              {/* URL copiable */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">URL del endpoint JSON</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-indigo-700 break-all font-mono">{publicApiUrl}</code>
                  <button
                    onClick={handleCopyUrl}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      urlCopied
                        ? "bg-green-100 text-green-700 border border-green-200"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {urlCopied ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>
              </div>

              {/* Estructura del JSON */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Estructura de los datos devueltos:</p>
                <div className="bg-slate-900 rounded-lg p-3 text-xs font-mono text-green-300 overflow-x-auto">
                  <pre>{`{
  "empresa_id": ${companyId},
  "total_registros": N,
  "datos": [
    {
      "a\u00f1o": 2026,
      "mes": 7,
      "periodo": "Jul 2026",
      "ote_avance": 78.0,
      "ote_meta": 82.0,
      "otg_avance": 74.0,
      "otg_meta": 100.0,
      "gpi_avance": 80.0,
      "gpi_meta": 100.0
    }
  ]
}`}</pre>
                </div>
              </div>

              {/* Instrucciones Power BI */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">Cómo conectar en Power BI:</p>
                <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside">
                  <li>Abre Power BI Desktop → <strong>Obtener datos</strong> → <strong>Web</strong></li>
                  <li>Pega la URL copiada y haz clic en <strong>Aceptar</strong></li>
                  <li>En el navegador de datos, selecciona <strong>datos</strong> (lista de registros)</li>
                  <li>Haz clic en <strong>Transformar datos</strong> para expandir las columnas</li>
                  <li>Cierra y aplica — los datos quedarán disponibles para tus gráficas</li>
                </ol>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}
