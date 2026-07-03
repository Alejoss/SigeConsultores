import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useMemo, useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { ChevronDown, ChevronUp, Loader2, AlertCircle } from "lucide-react";
import { getAxisBackPathForRole } from "@/lib/sessionScope";
import DashboardLayout from "@/components/DashboardLayout";

interface MacroIndicator {
  processId: number;
  processName: string;
  compliancePercentage: number;
  objectivesPerformance: number;
  totalActivities: number;
  completedActivities: number;
  totalObjectives: number;
}

interface ProcessIndicators {
  processId: number;
  indicators: {
    stakeholderCriticality: {
      name: string;
      value: number;
      total: number;
      unit: string;
    };
    foda: {
      name: string;
      value: number;
      total: number;
      unit: string;
    };
    tacticalObjectives: {
      name: string;
      value: number;
      total: number;
      completed: number;
      unit: string;
    };
    compliances: {
      name: string;
      value: number;
      total: number;
      completed: number;
      unit: string;
    };
    trainings: {
      name: string;
      value: number;
      total: number;
      conducted: number;
      unit: string;
    };
  };
}

export default function Indicators() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  
  // Check if this is being accessed by a manager
  const urlParams = new URLSearchParams(search);
  const isManagerAccess = urlParams.get('isManager') === 'true';
  
  // Back button handler
  const handleBack = () => {
    navigate(getAxisBackPathForRole());
  };
  
  const [expandedProcessId, setExpandedProcessId] = useState<number | null>(null);
  
  // Resolve companyId from query params, ProcessLeader context, or location/storage
  let resolvedCompanyId = 0;
  
  // 1. Check query params (?companyId=123)
  const queryParams = new URLSearchParams(search);
  const queryCompanyId = queryParams.get("companyId");
  if (queryCompanyId) {
    resolvedCompanyId = parseInt(queryCompanyId);
  }
  // 2. Check ProcessLeader context
  else if (isProcessLeader && processLeaderSession?.companyId) {
    resolvedCompanyId = processLeaderSession.companyId;
  }
  // 3. Fall back to location/storage
  else {
    resolvedCompanyId = getCompanyIdFromLocationOrStorage() || 0;
  }
  
  const companyId = resolvedCompanyId;

  const { data: macroIndicators, isLoading } = trpc.macroIndicators.getMacroIndicators.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const { data: processIndicators } = trpc.macroIndicators.getProcessIndicators.useQuery(
    { processId: expandedProcessId || 0 },
    { enabled: expandedProcessId !== null && expandedProcessId > 0 }
  );

  const totalCompliance = useMemo(() => {
    if (!macroIndicators || macroIndicators.length === 0) return 0;
    const total = macroIndicators.reduce((sum, indicator) => sum + indicator.compliancePercentage, 0);
    return Math.round(total / macroIndicators.length);
  }, [macroIndicators]);

  const totalObjectivesPerformance = useMemo(() => {
    if (!macroIndicators || macroIndicators.length === 0) return 0;
    const total = macroIndicators.reduce((sum, indicator) => sum + indicator.objectivesPerformance, 0);
    return Math.round(total / macroIndicators.length);
  }, [macroIndicators]);

  const getComplianceColor = (percentage: number) => {
    if (percentage >= 80) return "bg-green-100 border-green-300";
    if (percentage >= 60) return "bg-yellow-100 border-yellow-300";
    if (percentage >= 40) return "bg-orange-100 border-orange-300";
    return "bg-red-100 border-red-300";
  };

  const getComplianceTextColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-700";
    if (percentage >= 60) return "text-yellow-700";
    if (percentage >= 40) return "text-orange-700";
    return "text-red-700";
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 60) return "bg-yellow-500";
    if (percentage >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  const getIndicatorColor = (value: number) => {
    if (value >= 80) return "border-l-4 border-l-green-500";
    if (value >= 60) return "border-l-4 border-l-yellow-500";
    if (value >= 40) return "border-l-4 border-l-orange-500";
    return "border-l-4 border-l-red-500";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-bold text-gray-900">Indicadores de Desempeño</h1>
            <Button
              variant="outline"
              onClick={handleBack}
            >
              ← Volver
            </Button>
          </div>
          <p className="text-gray-600">
            Resumen ejecutivo de desempeño de la empresa y detalle de indicadores por área
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !macroIndicators || macroIndicators.length === 0 ? (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">
                No hay procesos registrados aún. Crea procesos en el Mapa de Procesos para ver los indicadores.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Top KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Avance Total */}
              <Card className={`border-2 ${getComplianceColor(totalCompliance)}`}>
                <CardHeader>
                  <CardTitle className="text-lg">Avance Total</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`text-5xl font-bold ${getComplianceTextColor(totalCompliance)}`}>
                      {totalCompliance}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-full ${getProgressBarColor(totalCompliance)} transition-all duration-300`}
                      style={{ width: `${totalCompliance}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600">
                    Promedio de cumplimiento de {macroIndicators.length} procesos
                  </p>
                </CardContent>
              </Card>

              {/* Objetivos Estratégicos */}
              <Card className={`border-2 ${getComplianceColor(totalObjectivesPerformance)}`}>
                <CardHeader>
                  <CardTitle className="text-lg">Objetivos Estratégicos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`text-5xl font-bold ${getComplianceTextColor(totalObjectivesPerformance)}`}>
                      {totalObjectivesPerformance}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-full ${getProgressBarColor(totalObjectivesPerformance)} transition-all duration-300`}
                      style={{ width: `${totalObjectivesPerformance}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600">
                    Desempeño promedio de objetivos estratégicos
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Areas/Processes Accordion */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Indicadores por Área</h2>
              <div className="space-y-3">
                {macroIndicators.map((indicator) => (
                  <div key={indicator.processId}>
                    {/* Accordion Header */}
                    <button
                      onClick={() => setExpandedProcessId(
                        expandedProcessId === indicator.processId ? null : indicator.processId
                      )}
                      className={`w-full ${getComplianceColor(indicator.compliancePercentage)} border-2 rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow`}
                    >
                      <div className="flex items-center gap-4 flex-1 text-left">
                        <div>
                          <h3 className="font-semibold text-gray-900">{indicator.processName}</h3>

                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${getComplianceTextColor(indicator.compliancePercentage)}`}>
                            {indicator.compliancePercentage}%
                          </p>
                        </div>
                        {expandedProcessId === indicator.processId ? (
                          <ChevronUp className="w-6 h-6 text-gray-600" />
                        ) : (
                          <ChevronDown className="w-6 h-6 text-gray-600" />
                        )}
                      </div>
                    </button>

                    {/* Accordion Content - 5 Indicators */}
                    {expandedProcessId === indicator.processId && processIndicators && (
                      <div className="mt-3 bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                        {/* Indicator 1: Criticidad de Partes Interesadas */}
                        <div className={`p-4 rounded-lg bg-gray-50 ${getIndicatorColor(processIndicators.indicators.stakeholderCriticality.value)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">
                              {processIndicators.indicators.stakeholderCriticality.name}
                            </h4>
                            <span className={`text-lg font-bold ${getComplianceTextColor(processIndicators.indicators.stakeholderCriticality.value)}`}>
                              {processIndicators.indicators.stakeholderCriticality.value}{processIndicators.indicators.stakeholderCriticality.unit}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {processIndicators.indicators.stakeholderCriticality.total} partes interesadas evaluadas
                          </p>
                        </div>

                        {/* Indicator 2: Matriz FODA */}
                        <div className={`p-4 rounded-lg bg-gray-50 ${getIndicatorColor(processIndicators.indicators.foda.value)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">
                              {processIndicators.indicators.foda.name}
                            </h4>
                            <span className={`text-lg font-bold ${getComplianceTextColor(processIndicators.indicators.foda.value)}`}>
                              {processIndicators.indicators.foda.value}{processIndicators.indicators.foda.unit}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            Análisis de fortalezas, oportunidades, debilidades y amenazas
                          </p>
                        </div>

                        {/* Indicator 3: Objetivos Tácticos */}
                        <div className={`p-4 rounded-lg bg-gray-50 ${getIndicatorColor(processIndicators.indicators.tacticalObjectives.value)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">
                              {processIndicators.indicators.tacticalObjectives.name}
                            </h4>
                            <span className={`text-lg font-bold ${getComplianceTextColor(processIndicators.indicators.tacticalObjectives.value)}`}>
                              {processIndicators.indicators.tacticalObjectives.value}{processIndicators.indicators.tacticalObjectives.unit}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {processIndicators.indicators.tacticalObjectives.completed}/{processIndicators.indicators.tacticalObjectives.total} objetivos completados
                          </p>
                        </div>

                        {/* Indicator 4: Cumplimientos */}
                        <div className={`p-4 rounded-lg bg-gray-50 ${getIndicatorColor(processIndicators.indicators.compliances.value)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">
                              {processIndicators.indicators.compliances.name}
                            </h4>
                            <span className={`text-lg font-bold ${getComplianceTextColor(processIndicators.indicators.compliances.value)}`}>
                              {processIndicators.indicators.compliances.value}{processIndicators.indicators.compliances.unit}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {processIndicators.indicators.compliances.completed}/{processIndicators.indicators.compliances.total} obligaciones cumplidas
                          </p>
                        </div>

                        {/* Indicator 5: Capacitación */}
                        <div className={`p-4 rounded-lg bg-gray-50 ${getIndicatorColor(processIndicators.indicators.trainings.value)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">
                              {processIndicators.indicators.trainings.name}
                            </h4>
                            <span className={`text-lg font-bold ${getComplianceTextColor(processIndicators.indicators.trainings.value)}`}>
                              {processIndicators.indicators.trainings.value}{processIndicators.indicators.trainings.unit}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {processIndicators.indicators.trainings.conducted}/{processIndicators.indicators.trainings.total} entrenamientos realizados
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
