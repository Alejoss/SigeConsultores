import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Clock } from "lucide-react";

interface ScheduleActivity {
  id: string;
  type: "stakeholder" | "foda" | "objective" | "compliance" | "training";
  element: string;
  action: string;
  dueDate: Date | string;
  completed: "SI" | "NO";
  completionField: string;
  badge: string;
  badgeColor: string;
  daysRemaining?: number;
  completionPercentage?: number;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function ConsolidatedSchedule() {
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  
  // Resolve processId from query params, ProcessLeader context, or localStorage
  let resolvedProcessId = 0;
  
  // 1. Check query params (?processId=123)
  const queryParams = new URLSearchParams(searchParams);
  const queryProcessId = queryParams.get("processId");
  if (queryProcessId) {
    resolvedProcessId = parseInt(queryProcessId);
  }
  // 2. Check ProcessLeader context
  else if (processLeaderSession?.processId) {
    resolvedProcessId = processLeaderSession.processId;
  }
  // 3. Check localStorage
  else {
    const selectedProcessId = localStorage.getItem("selectedProcessId");
    resolvedProcessId = selectedProcessId ? parseInt(selectedProcessId) : 0;
  }
  
  const processId = resolvedProcessId;

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activities, setActivities] = useState<ScheduleActivity[]>([]);

  const { data: consolidatedData, isLoading } = trpc.consolidatedSchedule.getConsolidatedSchedule.useQuery(
    { processId },
    { enabled: processId > 0 }
  );

  useEffect(() => {
    if (consolidatedData) {
      setActivities(consolidatedData as ScheduleActivity[]);
    }
  }, [consolidatedData]);

  // Filter activities by current month and year.
  // Use UTC methods to avoid timezone-shift bugs: dates stored as "YYYY-MM-DD" are
  // parsed as UTC midnight by JS, so comparing with local getMonth() shifts them
  // one day back in UTC-N timezones (e.g. Ecuador UTC-5).
  const monthActivities = activities.filter(activity => {
    const activityDate = new Date(activity.dueDate);
    return activityDate.getUTCMonth() === currentMonth && activityDate.getUTCFullYear() === currentYear;
  });

  // Calculate statistics
  const totalActivities = activities.length;
  const completedActivities = activities.filter(a => a.completed === "SI").length;
  const percentageCompleted = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;

  const monthCompletedActivities = monthActivities.filter(a => a.completed === "SI").length;
  const monthPercentageCompleted = monthActivities.length > 0
    ? Math.round((monthCompletedActivities / monthActivities.length) * 100)
    : 0;

  const handlePreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const getDaysStatus = (dueDate: Date | string): { days: number; status: "upcoming" | "overdue" | "today" } => {
    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { days: 0, status: "today" };
    if (diffDays > 0) return { days: diffDays, status: "upcoming" };
    return { days: Math.abs(diffDays), status: "overdue" };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-bold text-gray-900">Cronograma Consolidado</h1>
            <Button
              variant="outline"
              onClick={() => navigate("/process-characterization")}
            >
              ← Volver
            </Button>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <Card className="bg-white border-l-4 border-l-slate-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">Total de Actividades</div>
                <div className="text-3xl font-bold text-slate-600">{totalActivities}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-l-4 border-l-green-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">Completadas</div>
                <div className="text-3xl font-bold text-green-600">{completedActivities}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-l-4 border-l-orange-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">Pendientes</div>
                <div className="text-3xl font-bold text-orange-600">{totalActivities - completedActivities}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">% Cumplimiento General</div>
                <div className="text-3xl font-bold text-blue-600">{percentageCompleted}%</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Schedule by Month */}
        <Card className="bg-white">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePreviousMonth}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle className="text-2xl min-w-[200px]">
                  {MONTHS[currentMonth]} {currentYear}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNextMonth}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-sm text-gray-600">
                {monthActivities.length} actividades | {monthPercentageCompleted}% cumplidas
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Cargando actividades...</div>
            ) : monthActivities.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No hay actividades planificadas para {MONTHS[currentMonth].toLowerCase()} de {currentYear}
              </div>
            ) : (
              <div className="space-y-4">
                {monthActivities.map((activity) => {
                  const { days, status } = getDaysStatus(activity.dueDate);
                  const isOverdue = activity.completed === "NO" && status === "overdue";
                  const isToday = activity.completed === "NO" && status === "today";
                  const isUpcoming = activity.completed === "NO" && days <= 7 && status === "upcoming";

                  let statusBadge = "";
                  let statusColor = "bg-gray-100 text-gray-700";
                  let statusIcon = null;

                  if (activity.completed === "SI") {
                    statusBadge = "Completada";
                    statusColor = "bg-green-100 text-green-700";
                    statusIcon = <CheckCircle2 className="w-4 h-4" />;
                  } else if (isOverdue) {
                    statusBadge = `Vencida hace ${days} días`;
                    statusColor = "bg-red-100 text-red-700";
                    statusIcon = <AlertCircle className="w-4 h-4" />;
                  } else if (isToday) {
                    statusBadge = "Vence hoy";
                    statusColor = "bg-yellow-100 text-yellow-700";
                    statusIcon = <Clock className="w-4 h-4" />;
                  } else if (isUpcoming) {
                    statusBadge = `Faltan ${days} días`;
                    statusColor = "bg-yellow-100 text-yellow-700";
                    statusIcon = <Clock className="w-4 h-4" />;
                  } else {
                    statusBadge = `Faltan ${days} días`;
                    statusColor = "bg-blue-100 text-blue-700";
                  }

                  return (
                    <div
                      key={activity.id}
                      className={`p-4 border rounded-lg transition-colors ${
                        isOverdue
                          ? "border-red-300 bg-red-50"
                          : isToday || isUpcoming
                          ? "border-yellow-300 bg-yellow-50"
                          : activity.completed === "SI"
                          ? "border-green-300 bg-green-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          {/* Module Badge - Prominently displayed */}
                          <div className="mb-3 flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${activity.badgeColor}`}>
                              {activity.badge}
                            </span>
                            {activity.completionPercentage !== undefined && activity.type === "objective" && (
                              <span className="text-xs font-semibold text-gray-600">
                                {activity.completionPercentage}% completado
                              </span>
                            )}
                            {activity.completionPercentage !== undefined && activity.type === "compliance" && (
                              <span className="text-xs font-semibold text-gray-600">
                                {activity.completionPercentage}% completado
                              </span>
                            )}
                          </div>

                          {/* Element/Category */}
                          {activity.element && (
                            <div className="text-xs text-gray-500 mb-1">
                              {activity.element}
                            </div>
                          )}

                          {/* Action Description */}
                          <h3 className="font-semibold text-gray-900 mb-3">{activity.action}</h3>

                          {/* Details Grid */}
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 text-xs">Fecha límite:</span>
                              <p className="text-gray-900 font-medium">
                                {new Date(activity.dueDate).toLocaleDateString("es-ES")}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs">Campo de seguimiento:</span>
                              <p className="text-gray-900 font-medium">{activity.completionField}</p>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs">Estado:</span>
                              <p className={`font-medium flex items-center gap-1 mt-1 ${
                                activity.completed === "SI" ? "text-green-700" : "text-orange-700"
                              }`}>
                                {statusIcon && statusIcon}
                                {activity.completed === "SI" ? "Completada" : "Pendiente"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Days Status Badge */}
                        <div className={`px-4 py-2 rounded font-semibold text-sm text-center whitespace-nowrap ${statusColor}`}>
                          {statusBadge}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="bg-white mt-6">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b">
            <CardTitle className="text-lg">Elementos Consolidados</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="px-3 py-2 rounded border text-sm font-semibold text-center bg-blue-100 text-blue-700 border-blue-300">
                Gestión con Partes Interesadas
              </div>
              <div className="px-3 py-2 rounded border text-sm font-semibold text-center bg-green-100 text-green-700 border-green-300">
                Fortaleza
              </div>
              <div className="px-3 py-2 rounded border text-sm font-semibold text-center bg-orange-100 text-orange-700 border-orange-300">
                Oportunidad
              </div>
              <div className="px-3 py-2 rounded border text-sm font-semibold text-center bg-red-100 text-red-700 border-red-300">
                Debilidad
              </div>
              <div className="px-3 py-2 rounded border text-sm font-semibold text-center bg-purple-100 text-purple-700 border-purple-300">
                Amenaza
              </div>
              <div className="px-3 py-2 rounded border text-sm font-semibold text-center bg-yellow-100 text-yellow-700 border-yellow-300">
                OTE
              </div>
              <div className="px-3 py-2 rounded border text-sm font-semibold text-center bg-pink-100 text-pink-700 border-pink-300">
                Cumplimientos
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Box */}
        <Card className="bg-blue-50 border-blue-200 mt-6">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900">
              <strong>Nota:</strong> Este cronograma es una vista consolidada de todas tus planificaciones. 
              Los badges de color identifican el módulo de origen de cada actividad. 
              Para completar o actualizar la información de cada actividad, dirígete al módulo específico 
              (Gestión de Partes Interesadas, Matriz FODA, Objetivos Tácticos de Gestión, Objetivos Tácticos Estratégicos o Cumplimientos).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
