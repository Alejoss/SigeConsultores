import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Loader2, Target, BarChart2, Settings, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { getAxisBackPathForRole } from "@/lib/sessionScope";

type SubModule = "strategic" | "management" | "systems" | null;

function PercentBadge({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-green-100 text-green-700 border-green-300"
    : value >= 50 ? "bg-yellow-100 text-yellow-700 border-yellow-300"
    : "bg-red-100 text-red-700 border-red-300";
  return (
    <span className={`inline-block px-3 py-1 rounded-full border text-sm font-bold ${color}`}>
      {value}%
    </span>
  );
}

function IndicatorMini({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? "text-green-700"
    : value >= 50 ? "text-yellow-600"
    : "text-red-600";
  return (
    <div className="bg-slate-50 rounded p-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`font-bold text-base ${color}`}>{value}%</p>
    </div>
  );
}

function StrategicObjectivesModule({ companyId }: { companyId: number }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: macroIndicators = [], isLoading } = trpc.macroIndicators.getMacroIndicators.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const avgOTE = useMemo(() => {
    if (!macroIndicators.length) return 0;
    const total = macroIndicators.reduce((sum: number, p: any) => sum + (p.objectivesPerformance || 0), 0);
    return Math.round(total / macroIndicators.length);
  }, [macroIndicators]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6 text-blue-500" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-700">Objetivos Estratégicos (OTE)</h3>
        <div className="text-center bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <p className="text-xs text-blue-600 font-semibold">% Promedio OTE</p>
          <p className={`text-2xl font-bold ${avgOTE >= 80 ? "text-green-600" : avgOTE >= 50 ? "text-yellow-600" : "text-red-600"}`}>
            {avgOTE}%
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {macroIndicators.map((process: any) => (
          <Card key={process.processId} className="border border-slate-200">
            <CardContent className="pt-3 pb-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === process.processId ? null : process.processId)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-700">{process.processName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <PercentBadge value={process.objectivesPerformance || 0} />
                  {expandedId === process.processId
                    ? <ChevronUp size={16} className="text-slate-400" />
                    : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </div>
              {expandedId === process.processId && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    % OTE del área: <strong>{process.objectivesPerformance || 0}%</strong>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Total objetivos tácticos: {process.totalObjectives || 0}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {macroIndicators.length === 0 && (
          <p className="text-center text-slate-400 py-4">No hay datos de OTE disponibles.</p>
        )}
      </div>
    </div>
  );
}

function ManagementByAreaModule({ companyId }: { companyId: number }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: macroIndicators = [], isLoading } = trpc.macroIndicators.getMacroIndicators.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const avgGeneral = useMemo(() => {
    if (!macroIndicators.length) return 0;
    const total = macroIndicators.reduce((sum: number, p: any) => {
      const otg = p.fodaPercentage || 0;
      const ote = p.objectivesPerformance || 0;
      const pi = p.stakeholderPercentage || 0;
      return sum + Math.round((otg + ote + pi) / 3);
    }, 0);
    return Math.round(total / macroIndicators.length);
  }, [macroIndicators]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6 text-blue-500" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-700">Gestión por Área</h3>
        <div className="text-center bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <p className="text-xs text-blue-600 font-semibold">% Promedio General</p>
          <p className={`text-2xl font-bold ${avgGeneral >= 80 ? "text-green-600" : avgGeneral >= 50 ? "text-yellow-600" : "text-red-600"}`}>
            {avgGeneral}%
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {macroIndicators.map((process: any) => (
          <Card key={process.processId} className="border border-slate-200">
            <CardContent className="pt-3 pb-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === process.processId ? null : process.processId)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-700">{process.processName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <PercentBadge value={process.compliancePercentage || 0} />
                  {expandedId === process.processId
                    ? <ChevronUp size={16} className="text-slate-400" />
                    : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </div>
              {expandedId === process.processId && (
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-sm">
                  <IndicatorMini label="% OTG (FODA)" value={process.fodaPercentage || 0} />
                  <IndicatorMini label="% OTE" value={process.objectivesPerformance || 0} />
                  <IndicatorMini label="% Partes Interesadas" value={process.stakeholderPercentage || 0} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {macroIndicators.length === 0 && (
          <p className="text-center text-slate-400 py-4">No hay datos disponibles.</p>
        )}
      </div>
    </div>
  );
}

function ManagementSystemsModule({ companyId }: { companyId: number }) {
  const { data: macroIndicators = [], isLoading: indicatorsLoading } = trpc.macroIndicators.getMacroIndicators.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const { data: programs = [], isLoading: programsLoading } = trpc.managementPrograms.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const { data: audits = [], isLoading: auditsLoading } = trpc.auditsInspections.listAudits.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const { data: inspections = [], isLoading: inspectionsLoading } = trpc.auditsInspections.listInspections.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  // % Programas: promedio de (completedActions / plannedActions) por programa
  const programsCompliance = useMemo(() => {
    if (!programs.length) return 0;
    const total = programs.reduce((sum: number, p: any) => {
      return sum + (p.plannedActions > 0 ? Math.min(100, Math.round((p.completedActions / p.plannedActions) * 100)) : 0);
    }, 0);
    return Math.round(total / programs.length);
  }, [programs]);

  // % Auditorías: promedio de (totalCierres / totalHallazgos) por auditoría
  const auditsCompliance = useMemo(() => {
    if (!audits.length) return 0;
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

  // % Inspecciones: promedio de (closures / findings) por inspección
  const inspectionsCompliance = useMemo(() => {
    if (!inspections.length) return 0;
    let count = 0;
    const total = (inspections as any[]).reduce((sum: number, i: any) => {
      if (!i.findings || i.findings === 0) return sum;
      count++;
      return sum + Math.min(100, Math.round(((i.closures || 0) / i.findings) * 100));
    }, 0);
    return count > 0 ? Math.round(total / count) : 0;
  }, [inspections]);

  // % Cumplimientos y % Capacitaciones: promedio de todos los procesos
  const avgCompliances = useMemo(() => {
    if (!macroIndicators.length) return 0;
    const total = macroIndicators.reduce((sum: number, p: any) => sum + (p.compliancesPercentage || 0), 0);
    return Math.round(total / macroIndicators.length);
  }, [macroIndicators]);

  const avgTrainings = useMemo(() => {
    if (!macroIndicators.length) return 0;
    const total = macroIndicators.reduce((sum: number, p: any) => sum + (p.trainingsPercentage || 0), 0);
    return Math.round(total / macroIndicators.length);
  }, [macroIndicators]);

  const metrics = [
    { label: "Programas", value: programsCompliance, icon: "📋", count: programs.length },
    { label: "Cumplimientos", value: avgCompliances, icon: "✅", count: null },
    { label: "Auditorías", value: auditsCompliance, icon: "🔍", count: (audits as any[]).length },
    { label: "Inspecciones", value: inspectionsCompliance, icon: "🔎", count: (inspections as any[]).length },
    { label: "Capacitaciones", value: avgTrainings, icon: "🎓", count: null },
  ];

  const isLoading = programsLoading || indicatorsLoading || auditsLoading || inspectionsLoading;
  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6 text-blue-500" /></div>;

  return (
    <div>
      <h3 className="text-lg font-bold text-slate-700 mb-4">Sistemas de Gestión</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="border border-slate-200">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl mb-1">{m.icon}</p>
              <p className="text-sm text-slate-500 font-medium">{m.label}</p>
              <p className={`text-3xl font-bold mt-2 ${m.value >= 80 ? "text-green-600" : m.value >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                {m.value}%
              </p>
              {m.count !== null && (
                <p className="text-xs text-slate-400 mt-1">{m.count} registros</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Performance() {
  const [, setLocation] = useLocation();
  const { isManagerLogin, managerCompanyId } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const [activeModule, setActiveModule] = useState<SubModule>(null);

  const companyId = useMemo<number>(() => {
    if (isManagerLogin && managerCompanyId) return managerCompanyId;
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    return getCompanyIdFromLocationOrStorage() || 0;
  }, [isManagerLogin, managerCompanyId, processLeaderSession]);

  const subModules = [
    {
      key: "strategic" as SubModule,
      icon: <Target size={40} className="text-blue-500" />,
      title: "Objetivos Estratégicos",
      description: "% promedio de cumplimiento de OTE por cada área de la empresa.",
    },
    {
      key: "management" as SubModule,
      icon: <BarChart2 size={40} className="text-blue-500" />,
      title: "Gestión por Área",
      description: "% OTG, % OTE y % de gestión con partes interesadas por área.",
    },
    {
      key: "systems" as SubModule,
      icon: <Settings size={40} className="text-blue-500" />,
      title: "Sistemas de Gestión",
      description: "% cumplimiento de Programas, Auditorías, Inspecciones, Capacitaciones y Cumplimientos.",
    },
  ];

  const handleGoToTrends = () => setLocation(companyId > 0 ? `/strategic-trends?companyId=${companyId}` : "/strategic-trends");

  // Botón Volver: si hay submódulo activo, vuelve a la selección; si no, al dashboard del rol
  const handleBack = () => {
    if (activeModule) {
      setActiveModule(null);
    } else {
      // Limpiar axisOrigin para evitar bucles al volver al dashboard
      localStorage.removeItem("axisOrigin");
      // Usar el dashboard guardado por AxisDesempeno, o detectar por rol como fallback
      const savedDashboard = localStorage.getItem("axisBackDashboard");
      localStorage.removeItem("axisBackDashboard");
      setLocation(savedDashboard || getAxisBackPathForRole());
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="flex items-center gap-2"
          >
            ← Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Desempeño</h1>
            {!activeModule && (
              <p className="text-slate-500 text-sm mt-0.5">
                Indicadores consolidados de desempeño de la empresa
              </p>
            )}
          </div>
        </div>

        {/* Sub-module selection */}
        {!activeModule && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subModules.map((mod) => (
              <Card
                key={mod.key}
                className="border-2 border-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                onClick={() => setActiveModule(mod.key)}
              >
                <CardContent className="pt-6 pb-6 flex flex-col items-start gap-4">
                  <div>{mod.icon}</div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{mod.title}</h2>
                    <p className="text-sm text-slate-500 mt-1">{mod.description}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={(e) => { e.stopPropagation(); setActiveModule(mod.key); }}
                  >
                    Ver
                  </Button>
                </CardContent>
              </Card>
            ))}
            {/* Card especial: Tendencias Estratégicas — ancho completo */}
            <Card
              className="border-2 border-emerald-100 hover:border-emerald-300 transition-colors cursor-pointer col-span-1 md:col-span-3"
              onClick={handleGoToTrends}
            >
              <CardContent className="pt-6 pb-6 flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="shrink-0">
                  <TrendingUp size={40} className="text-emerald-500" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-800">Tendencias Estratégicas</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Evolución mensual del % de cumplimiento de OTE, OTG y Gestión con Partes Interesadas.
                    Visualiza cómo crece tu empresa mes a mes frente a las metas establecidas.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={(e) => { e.stopPropagation(); handleGoToTrends(); }}
                >
                  Ver tendencias
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Active sub-module content */}
        {activeModule === "strategic" && <StrategicObjectivesModule companyId={companyId} />}
        {activeModule === "management" && <ManagementByAreaModule companyId={companyId} />}
        {activeModule === "systems" && <ManagementSystemsModule companyId={companyId} />}
      </div>
    </DashboardLayout>
  );
}
