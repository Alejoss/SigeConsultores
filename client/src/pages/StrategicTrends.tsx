import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis as RadarAngleAxis,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, X, Settings, Download, Target, BarChart2, Users, Shield } from "lucide-react";

// ─── Utilidades ───────────────────────────────────────────────────────────────
function getColor(pct: number) {
  return pct >= 80 ? "#16a34a" : pct >= 60 ? "#ca8a04" : "#dc2626";
}
function getStatus(pct: number) {
  return pct >= 80 ? "En meta" : pct >= 60 ? "Alerta" : "Crítico";
}
function getCompanyId(isManagerLogin: boolean, managerCompanyId: number | null, processLeaderSession: any) {
  if (isManagerLogin && managerCompanyId) return managerCompanyId;
  if (processLeaderSession?.companyId) return processLeaderSession.companyId;
  return getCompanyIdFromLocationOrStorage() || 0;
}

// ─── Gráfico circular pequeño ─────────────────────────────────────────────────
function DonutKpi({ value, size = 80 }: { value: number; size?: number }) {
  const color = getColor(value);
  const data = [{ value, fill: color }];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <RadialBarChart
        width={size} height={size}
        cx={size / 2} cy={size / 2}
        innerRadius={size * 0.32} outerRadius={size * 0.46}
        barSize={size * 0.1}
        data={data} startAngle={90} endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar background={{ fill: "#f1f5f9" }} dataKey="value" angleAxisId={0} cornerRadius={4} />
      </RadialBarChart>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold" style={{ fontSize: size * 0.18, color }}>{value}%</span>
      </div>
    </div>
  );
}

// ─── Exportar como imagen ─────────────────────────────────────────────────────
async function exportAsImage(ref: React.RefObject<HTMLDivElement | null>, filename: string, setSaving: (v: boolean) => void) {
  if (!ref.current) return;
  setSaving(true);
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(ref.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } finally {
    setSaving(false);
  }
}

// ─── Botón de exportar ────────────────────────────────────────────────────────
function ExportBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-800 border border-emerald-300 rounded-lg px-3 py-1.5 hover:bg-emerald-50 transition-colors disabled:opacity-60"
    >
      <Download size={13} />
      {loading ? "Exportando…" : "Exportar imagen"}
    </button>
  );
}

// ─── Ventana de acceso principal ──────────────────────────────────────────────
function AccessCard({
  icon,
  title,
  description,
  color,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-6 rounded-2xl border-2 hover:shadow-lg transition-all duration-200 bg-white group"
      style={{ borderColor: color + "30" }}
    >
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl flex-shrink-0" style={{ backgroundColor: color + "15" }}>
          <div style={{ color }}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          {badge && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-md mb-1 inline-block" style={{ backgroundColor: color + "20", color }}>
              {badge}
            </span>
          )}
          <h3 className="text-base font-bold text-slate-800 group-hover:text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{description}</p>
        </div>
        <ChevronDown size={18} className="text-slate-400 group-hover:text-slate-600 flex-shrink-0 mt-1 rotate-[-90deg]" />
      </div>
    </button>
  );
}

// ─── Header de sub-vista ──────────────────────────────────────────────────────
function SubViewHeader({
  title,
  onBack,
  onExport,
  exporting,
}: {
  title: string;
  onBack: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="flex items-center gap-2">
          ← Volver
        </Button>
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      </div>
      <ExportBtn onClick={onExport} loading={exporting} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA 1: OBJETIVOS ESTRATÉGICOS
// ═══════════════════════════════════════════════════════════════════════════════
function OEView({ companyId, onBack }: { companyId: number; onBack: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [activeSubView, setActiveSubView] = useState<"overview" | "timeline" | "heatmap">("overview");

  const { data: oeData, isLoading } = trpc.strategicTrends.getStrategicObjectivesBreakdown.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const { data: trendsResult, refetch: refetchTrends } = trpc.strategicTrends.getTrends.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const snapshotMutation = trpc.strategicTrends.snapshotCurrentMonth.useMutation({
    onSuccess: () => { refetchTrends(); },
  });

  const trendData = trendsResult?.data ?? [];
  const snapshotRequestRef = useRef<string | null>(null);
  const now = new Date();
  const currentSnapshotKey = `${companyId}-${now.getFullYear()}-${now.getMonth() + 1}`;
  const hasCurrentMonthSnapshot = trendData.some((snapshot: any) =>
    snapshot.year === now.getFullYear() && snapshot.month === now.getMonth() + 1
  );

  // Al entrar a la vista, el mes vigente queda registrado automáticamente si todavía no existe.
  // Así los datos de los meses anteriores nunca se reemplazan ni se pierden.
  useEffect(() => {
    if (activeSubView !== "timeline" || companyId <= 0 || !trendsResult || hasCurrentMonthSnapshot || snapshotRequestRef.current === currentSnapshotKey) return;
    snapshotRequestRef.current = currentSnapshotKey;
    snapshotMutation.mutate({ companyId }, {
      onSettled: () => { snapshotRequestRef.current = null; },
    });
  }, [activeSubView, companyId, currentSnapshotKey, hasCurrentMonthSnapshot, trendsResult, snapshotMutation]);

  const objectives = oeData?.objectives ?? [];
  const globalPercent = oeData?.globalPercent ?? 0;

  // Recopilar todos los procesos únicos para el heatmap
  const allProcesses = useMemo(() => {
    const map = new Map<number, string>();
    for (const oe of objectives) {
      for (const c of oe.contributions) {
        map.set(c.processId, c.processName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [objectives]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-blue-500" /></div>;

  return (
    <div>
      <SubViewHeader
        title="Objetivos Estratégicos"
        onBack={onBack}
        onExport={() => exportAsImage(ref, "objetivos-estrategicos.png", setExporting)}
        exporting={exporting}
      />

      {/* Sub-navegación */}
      <div className="flex gap-2 mb-6">
        {(["overview", "heatmap", "timeline"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setActiveSubView(v)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeSubView === v ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {v === "overview" ? "Avance por OE" : v === "heatmap" ? "Contribución por Área" : "Línea de Tiempo"}
          </button>
        ))}
      </div>

      <div ref={ref}>
        {activeSubView === "overview" && (
          <div className="space-y-4">
            {/* KPI global */}
            <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-blue-100 bg-blue-50">
              <DonutKpi value={globalPercent} size={72} />
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Avance Total en Objetivos Estratégicos</p>
                <p className="text-3xl font-bold text-slate-800">{globalPercent}%</p>
                <p className="text-sm text-slate-500">{oeData?.totalOTE ?? 0} OTE en {objectives.length} Objetivos Estratégicos</p>
              </div>
            </div>

            {/* Barras por OE */}
            {objectives.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay Objetivos Estratégicos registrados</div>
            ) : (
              <div className="space-y-3">
                {objectives.map((oe, idx) => {
                  const color = getColor(oe.percent);
                  return (
                    <div key={oe.id} className="p-4 rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: color + "20", color }}>
                            OE {idx + 1}
                          </span>
                          <span className="text-sm font-semibold text-slate-700 truncate">{oe.name}</span>
                        </div>
                        <span className="text-lg font-bold flex-shrink-0 ml-3" style={{ color }}>{oe.percent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        <div
                          className="h-3 rounded-full transition-all duration-500"
                          style={{ width: `${oe.percent}%`, backgroundColor: color }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{oe.oteCount} OTE · {getStatus(oe.percent)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeSubView === "heatmap" && (
          <div>
            <p className="text-sm text-slate-500 mb-4">
              Cada celda muestra el % de cumplimiento promedio de los OTE de ese proceso que apuntan al Objetivo Estratégico correspondiente.
            </p>
            {objectives.length === 0 || allProcesses.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay datos suficientes para mostrar la matriz</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200 min-w-[140px]">Proceso / Área</th>
                      {objectives.map((oe: any, idx: number) => (
                        <th
                          key={oe.id}
                          className="p-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200 min-w-[80px] text-center relative group cursor-help"
                          title={oe.name}
                        >
                          OE {idx + 1}
                          {/* Tooltip con enunciado completo */}
                          <div className="absolute z-50 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-800 text-white text-xs rounded-lg p-2 shadow-xl pointer-events-none">
                            <span className="font-bold text-slate-300">OE {idx + 1}:</span> {oe.name}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allProcesses.map((proc: any) => (
                      <tr key={proc.id}>
                        <td className="p-2 font-medium text-slate-700 border border-slate-200 bg-white">{proc.name}</td>
                        {objectives.map((oe: any) => {
                          const contrib = oe.contributions.find((c: any) => c.processId === proc.id);
                          if (!contrib) {
                            return <td key={oe.id} className="p-2 border border-slate-200 bg-slate-50 text-center text-slate-300">—</td>;
                          }
                          const bg = contrib.percent >= 80 ? "#dcfce7" : contrib.percent >= 60 ? "#fef9c3" : "#fee2e2";
                          const fg = getColor(contrib.percent);
                          return (
                            <td key={oe.id} className="p-2 border border-slate-200 text-center font-bold" style={{ backgroundColor: bg, color: fg }}>
                              {contrib.percent}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeSubView === "timeline" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-500">
                Evolución mensual del % de cumplimiento de los Objetivos Estratégicos. Un gráfico por cada OE.
              </p>
              <span className="text-xs text-slate-400 ml-4 flex-shrink-0">
                {snapshotMutation.isPending ? "Guardando mes actual…" : "Registro mensual automático"}
              </span>
            </div>
            {objectives.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
                <p>No hay Objetivos Estratégicos registrados.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {objectives.map((oe: any, idx: number) => {
                  const color = getColor(oe.percent);

                  // Construir datos históricos usando trendData.
                  // Cada snapshot puede tener oePercents[oeName] con el % de ese OE en ese mes.
                  // Si no hay datos históricos, usar solo el punto actual.
                  let chartData: { label: string; avance: number; meta: number }[];

                  if (trendData.length > 0) {
                    chartData = trendData.map((snap: any) => {
                      // Buscar el % de este OE en el snapshot por nombre exacto o parcial
                      let avance = snap.otePercent; // fallback: % global
                      if (snap.oePercents && typeof snap.oePercents === "object") {
                        const oeKey = Object.keys(snap.oePercents).find((k: string) => {
                          const kl = k.toLowerCase().trim();
                          const nl = (oe.name || "").toLowerCase().trim();
                          return kl === nl || kl.includes(nl.slice(0, 20)) || nl.includes(kl.slice(0, 20));
                        });
                        if (oeKey !== undefined) avance = snap.oePercents[oeKey];
                      }
                      return { label: snap.label, avance, meta: 100 };
                    });
                    // Agregar el punto actual si el último snapshot no es del mes en curso
                    const now = new Date();
                    const currentLabel = now.toLocaleDateString("es-EC", { month: "short", year: "numeric" });
                    const lastSnap = trendData[trendData.length - 1];
                    const isCurrentMonthSaved = lastSnap && lastSnap.year === now.getFullYear() && lastSnap.month === (now.getMonth() + 1);
                    if (!isCurrentMonthSaved) {
                      chartData.push({ label: currentLabel, avance: oe.percent, meta: 100 });
                    }
                  } else {
                    chartData = [
                      { label: new Date().toLocaleDateString("es-EC", { month: "short", year: "numeric" }), avance: oe.percent, meta: 100 },
                    ];
                  }

                  return (
                    <div key={oe.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      {/* Cabecera del OE */}
                      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: color + "12" }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: color + "25", color }}>
                            OE {idx + 1}
                          </span>
                          <span className="text-sm font-semibold text-slate-700">{oe.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold" style={{ color }}>{oe.percent}%</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: color + "20", color }}>
                            {getStatus(oe.percent)}
                          </span>
                        </div>
                      </div>
                      {/* Gráfico de línea */}
                      <div className="px-4 pt-3 pb-2">
                        <p className="text-xs text-slate-400 mb-2">{oe.oteCount} OTE contribuyen a este objetivo · {chartData.length} punto{chartData.length !== 1 ? "s" : ""} histórico{chartData.length !== 1 ? "s" : ""}</p>
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={36} />
                            <Tooltip formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name === "meta" ? "Meta" : "Avance actual"]} />
                            <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: "Meta 100%", position: "right", fontSize: 9, fill: "#94a3b8" }} />
                            <Line type="monotone" dataKey="meta" name="Meta" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                            <Line type="monotone" dataKey="avance" name="Avance" stroke={color} strokeWidth={2.5} dot={{ r: 5, fill: color, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 7 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA 2: OBJETIVOS DE GESTIÓN (OTG)
// ═══════════════════════════════════════════════════════════════════════════════
function OTGView({ companyId, onBack }: { companyId: number; onBack: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data: otgData = [], isLoading } = trpc.strategicTrends.getOtgByArea.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-purple-500" /></div>;

  const totalOTG = otgData.reduce((s: number, p: any) => s + p.totalOTG, 0);
  const totalLogrados = otgData.reduce((s: number, p: any) => s + p.logrados, 0);
  const globalPct = totalOTG > 0 ? Math.round((totalLogrados / totalOTG) * 100) : 0;
  const avgPct = otgData.length > 0
    ? Math.round(otgData.reduce((s: number, p: any) => s + p.percent, 0) / otgData.length)
    : 0;

  return (
    <div>
      <SubViewHeader
        title="Objetivos Tácticos de Gestión"
        onBack={onBack}
        onExport={() => exportAsImage(ref, "objetivos-gestion.png", setExporting)}
        exporting={exporting}
      />
      <div ref={ref}>
        {/* KPI global */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-purple-50 border border-purple-100 text-center">
            <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide">Total OTG</p>
            <p className="text-3xl font-bold text-slate-800">{totalOTG}</p>
          </div>
          <div className="p-4 rounded-xl bg-green-50 border border-green-100 text-center">
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">OTG Logrados</p>
            <p className="text-3xl font-bold text-green-700">{totalLogrados}</p>
          </div>
          <div className="p-4 rounded-xl border-2 text-center" style={{ borderColor: getColor(globalPct) + "40", backgroundColor: getColor(globalPct) + "10" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: getColor(globalPct) }}>% Logrado</p>
            <p className="text-3xl font-bold" style={{ color: getColor(globalPct) }}>{globalPct}%</p>
          </div>
        </div>

        {otgData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No hay OTG registrados en ningún proceso</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(otgData as any[]).map((proc: any) => (
              <div key={proc.processId} className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col items-center gap-3">
                <DonutKpi value={proc.percent} size={88} />
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-800 leading-tight">{proc.processName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{proc.logrados}/{proc.totalOTG} OTG logrados</p>
                  <p className="text-xs text-slate-400">{proc.comunicados} comunicados</p>
                </div>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: getColor(proc.percent) + "20", color: getColor(proc.percent) }}
                >
                  {getStatus(proc.percent)}
                </span>
              </div>
            ))}
          </div>
        )}

        {otgData.length > 0 && (
          <div className="mt-6">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-3">Comparativa por área</p>
            <ResponsiveContainer width="100%" height={Math.max(160, otgData.length * 36)}>
              <BarChart
                data={(otgData as any[]).map((p: any) => ({ name: p.processName.length > 18 ? p.processName.slice(0, 16) + "…" : p.processName, value: p.percent }))}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={110} />
                <Tooltip formatter={(v: any) => [`${v}%`, "% Avance OTG"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                  {(otgData as any[]).map((p: any, i: number) => (
                    <Cell key={i} fill={getColor(p.percent)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA 3: GESTIÓN CON PARTES INTERESADAS
// ═══════════════════════════════════════════════════════════════════════════════
function GPIView({ companyId, onBack }: { companyId: number; onBack: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data: gpiData = [], isLoading } = trpc.strategicTrends.getStakeholdersByArea.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-teal-500" /></div>;

  const totalSt = (gpiData as any[]).reduce((s: number, p: any) => s + p.totalStakeholders, 0);
  const totalImpl = (gpiData as any[]).reduce((s: number, p: any) => s + p.implemented, 0);
  const globalPct = totalSt > 0 ? Math.round((totalImpl / totalSt) * 100) : 0;
  const totalInternal = (gpiData as any[]).reduce((s: number, p: any) => s + p.internalCount, 0);
  const totalExternal = (gpiData as any[]).reduce((s: number, p: any) => s + p.externalCount, 0);

  // Datos para el radar global
  const radarData = [
    { subject: "Identificación", value: totalSt > 0 ? 100 : 0 },
    { subject: "Implementación", value: globalPct },
    { subject: "Internas", value: totalSt > 0 ? Math.round((totalInternal / totalSt) * 100) : 0 },
    { subject: "Externas", value: totalSt > 0 ? Math.round((totalExternal / totalSt) * 100) : 0 },
    { subject: "Cobertura", value: (gpiData as any[]).length > 0 ? Math.round(((gpiData as any[]).filter((p: any) => p.totalStakeholders > 0).length / (gpiData as any[]).length) * 100) : 0 },
  ];

  return (
    <div>
      <SubViewHeader
        title="Gestión con Partes Interesadas"
        onBack={onBack}
        onExport={() => exportAsImage(ref, "partes-interesadas.png", setExporting)}
        exporting={exporting}
      />
      <div ref={ref}>
        {/* KPI global */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-teal-50 border border-teal-100 text-center">
            <p className="text-xs text-teal-600 font-semibold uppercase tracking-wide">Total PI</p>
            <p className="text-3xl font-bold text-slate-800">{totalSt}</p>
          </div>
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-center">
            <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Internas</p>
            <p className="text-3xl font-bold text-blue-700">{totalInternal}</p>
          </div>
          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-center">
            <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide">Externas</p>
            <p className="text-3xl font-bold text-indigo-700">{totalExternal}</p>
          </div>
          <div className="p-4 rounded-xl border-2 text-center" style={{ borderColor: getColor(globalPct) + "40", backgroundColor: getColor(globalPct) + "10" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: getColor(globalPct) }}>% Implementado</p>
            <p className="text-3xl font-bold" style={{ color: getColor(globalPct) }}>{globalPct}%</p>
          </div>
        </div>

        {gpiData.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Aún no hay partes interesadas registradas</p>
            <p className="text-sm mt-2">Registra las partes interesadas en cada proceso para ver los indicadores aquí.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Radar global */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <p className="text-sm font-semibold text-slate-700 mb-3">Radar de Gestión Global</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <RadarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Radar name="GPI" dataKey="value" stroke="#0d9488" fill="#0d9488" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(v: any) => [`${v}%`]} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Cards por área */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {(gpiData as any[]).map((proc: any) => (
                <div key={proc.processId} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                  <DonutKpi value={proc.percentImplemented} size={56} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{proc.processName}</p>
                    <p className="text-xs text-slate-500">{proc.totalStakeholders} PI · {proc.implemented} implementadas</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs text-blue-600">{proc.internalCount} int.</span>
                      <span className="text-xs text-indigo-600">{proc.externalCount} ext.</span>
                    </div>
                  </div>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getColor(proc.percentImplemented) + "20", color: getColor(proc.percentImplemented) }}
                  >
                    {getStatus(proc.percentImplemented)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Barra comparativa */}
        {(gpiData as any[]).length > 0 && (
          <div className="mt-6">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-3">% Implementación por área</p>
            <ResponsiveContainer width="100%" height={Math.max(140, (gpiData as any[]).length * 32)}>
              <BarChart
                data={(gpiData as any[]).map((p: any) => ({ name: p.processName.length > 18 ? p.processName.slice(0, 16) + "…" : p.processName, value: p.percentImplemented }))}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={110} />
                <Tooltip formatter={(v: any) => [`${v}%`, "% Implementado"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                  {(gpiData as any[]).map((p: any, i: number) => (
                    <Cell key={i} fill={getColor(p.percentImplemented)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA 4: SISTEMAS DE GESTIÓN (sin cambios, reutiliza la lógica existente)
// ═══════════════════════════════════════════════════════════════════════════════
function SGIView({ companyId, onBack }: { companyId: number; onBack: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data: programs = [] } = trpc.managementPrograms.list.useQuery({ companyId }, { enabled: companyId > 0 });
  const { data: audits = [] } = trpc.auditsInspections.listAudits.useQuery({ companyId }, { enabled: companyId > 0 });
  const { data: inspections = [] } = trpc.auditsInspections.listInspections.useQuery({ companyId }, { enabled: companyId > 0 });
  const { data: macroIndicators = [] } = trpc.macroIndicators.getMacroIndicators.useQuery({ companyId }, { enabled: companyId > 0 });
  const { data: companyTrainingsList = [] } = trpc.companyTrainings.list.useQuery({ companyId }, { enabled: companyId > 0 });

  const programsCompliance = useMemo(() => {
    if (!(programs as any[]).length) return 0;
    const total = (programs as any[]).reduce((sum: number, p: any) => sum + (p.plannedActions > 0 ? Math.min(100, Math.round((p.completedActions / p.plannedActions) * 100)) : 0), 0);
    return Math.round(total / (programs as any[]).length);
  }, [programs]);

  const auditsCompliance = useMemo(() => {
    if (!(audits as any[]).length) return 0;
    let count = 0;
    const total = (audits as any[]).reduce((sum: number, a: any) => {
      const findings = (a.findingsMajorNC || 0) + (a.findingsMinorNC || 0) + (a.findingsObservations || 0) + (a.findingsOM || 0);
      if (findings === 0) return sum;
      const closures = (a.closuresMajorNC || 0) + (a.closuresMinorNC || 0) + (a.closuresObservations || 0) + (a.closuresOM || 0);
      count++;
      return sum + Math.min(100, Math.round((closures / findings) * 100));
    }, 0);
    return count > 0 ? Math.round(total / count) : 0;
  }, [audits]);

  const inspectionsCompliance = useMemo(() => {
    if (!(inspections as any[]).length) return 0;
    let count = 0;
    const total = (inspections as any[]).reduce((sum: number, i: any) => {
      if (!i.findings || i.findings === 0) return sum;
      count++;
      return sum + Math.min(100, Math.round(((i.closures || 0) / i.findings) * 100));
    }, 0);
    return count > 0 ? Math.round(total / count) : 0;
  }, [inspections]);

  const avgCompliances = useMemo(() => {
    if (!(macroIndicators as any[]).length) return 0;
    const total = (macroIndicators as any[]).reduce((sum: number, p: any) => sum + (p.compliancesPercentage || 0), 0);
    return Math.round(total / (macroIndicators as any[]).length);
  }, [macroIndicators]);

  const avgTrainings = useMemo(() => {
    const list = companyTrainingsList as any[];
    if (!list.length) return 0;
    const conducted = list.filter((t: any) => t.completed === "SI").length;
    return Math.round((conducted / list.length) * 100);
  }, [companyTrainingsList]);

  const metrics = [
    { label: "Programas", value: programsCompliance, count: (programs as any[]).length, color: "#3b82f6" },
    { label: "Cumplimientos", value: avgCompliances, count: null, color: "#10b981" },
    { label: "Auditorías", value: auditsCompliance, count: (audits as any[]).length, color: "#8b5cf6" },
    { label: "Inspecciones", value: inspectionsCompliance, count: (inspections as any[]).length, color: "#f59e0b" },
    { label: "Capacitaciones", value: avgTrainings, count: null, color: "#ec4899" },
  ];

  const avgTotal = Math.round(metrics.reduce((s, m) => s + m.value, 0) / metrics.length);

  return (
    <div>
      <SubViewHeader
        title="Sistemas de Gestión"
        onBack={onBack}
        onExport={() => exportAsImage(ref, "sistemas-gestion.png", setExporting)}
        exporting={exporting}
      />
      <div ref={ref}>
        {/* KPI global */}
        <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-sky-100 bg-sky-50 mb-6">
          <DonutKpi value={avgTotal} size={72} />
          <div>
            <p className="text-xs font-semibold text-sky-600 uppercase tracking-wide">Promedio General Sistemas de Gestión</p>
            <p className="text-3xl font-bold text-slate-800">{avgTotal}%</p>
          </div>
        </div>

        {/* Grid de 5 indicadores */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <DonutKpi value={m.value} size={80} />
              <span className="text-sm font-semibold text-slate-700">{m.label}</span>
              {m.count !== null && <span className="text-xs text-slate-400">{m.count} registros</span>}
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: getColor(m.value) + "20", color: getColor(m.value) }}>
                {getStatus(m.value)}
              </span>
            </div>
          ))}
        </div>

        {/* Barra comparativa */}
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={metrics.map((m) => ({ name: m.label, value: m.value }))} margin={{ top: 8, right: 8, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={35} />
            <Tooltip formatter={(v: any) => [`${v}%`, "Cumplimiento"]} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
              {metrics.map((m, i) => <Cell key={i} fill={getColor(m.value)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
type ActiveView = null | "oe" | "otg" | "gpi" | "sgi";

export default function StrategicTrends() {
  const [, setLocation] = useLocation();
  const { isManagerLogin, managerCompanyId } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const [activeView, setActiveView] = useState<ActiveView>(null);

  const companyId = useMemo<number>(
    () => getCompanyId(isManagerLogin, managerCompanyId, processLeaderSession),
    [isManagerLogin, managerCompanyId, processLeaderSession]
  );

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeView) {
                setActiveView(null);
              } else {
                // Volver al dashboard del rol
                const savedDashboard = localStorage.getItem("axisBackDashboard");
                localStorage.removeItem("axisBackDashboard");
                localStorage.removeItem("axisOrigin");
                const plSession = (() => {
                  try {
                    const raw = localStorage.getItem("processLeaderSession") || sessionStorage.getItem("processLeaderSession");
                    return raw ? JSON.parse(raw) : null;
                  } catch { return null; }
                })();
                const backPath = savedDashboard || (plSession ? "/process-leader-dashboard" : localStorage.getItem("managerCompanyId") ? "/manager-dashboard" : "/dashboard");
                setLocation(backPath);
              }
            }}
            className="flex items-center gap-2"
          >
            ← Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Desempeño</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {activeView
                ? activeView === "oe" ? "Objetivos Estratégicos"
                  : activeView === "otg" ? "Objetivos Tácticos de Gestión"
                  : activeView === "gpi" ? "Gestión con Partes Interesadas"
                  : "Sistemas de Gestión"
                : "Indicadores consolidados de desempeño de la empresa"}
            </p>
          </div>
        </div>

        {/* Contenido */}
        {activeView === null && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AccessCard
              icon={<Target size={24} />}
              title="Objetivos Estratégicos"
              description="% avance total, por OE individual, contribución por área (heatmap) y línea de desarrollo en el tiempo."
              color="#3b82f6"
              badge="OE"
              onClick={() => setActiveView("oe")}
            />
            <AccessCard
              icon={<BarChart2 size={24} />}
              title="Objetivos de Gestión"
              description="Resumen del avance general de OTG por área, con gráfico circular de cumplimiento por proceso."
              color="#8b5cf6"
              badge="OTG"
              onClick={() => setActiveView("otg")}
            />
            <AccessCard
              icon={<Users size={24} />}
              title="Gestión con Partes Interesadas"
              description="Panel de comunicación, radar de gestión y resumen de implementación por proceso."
              color="#0d9488"
              badge="GPI"
              onClick={() => setActiveView("gpi")}
            />
            <AccessCard
              icon={<Shield size={24} />}
              title="Sistemas de Gestión"
              description="% cumplimiento de Programas, Auditorías, Inspecciones y Cumplimientos."
              color="#0ea5e9"
              badge="SGI"
              onClick={() => setActiveView("sgi")}
            />
          </div>
        )}

        {activeView === "oe" && <OEView companyId={companyId} onBack={() => setActiveView(null)} />}
        {activeView === "otg" && <OTGView companyId={companyId} onBack={() => setActiveView(null)} />}
        {activeView === "gpi" && <GPIView companyId={companyId} onBack={() => setActiveView(null)} />}
        {activeView === "sgi" && <SGIView companyId={companyId} onBack={() => setActiveView(null)} />}
      </div>
    </DashboardLayout>
  );
}
