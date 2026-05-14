'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, ChevronLeft, ChevronRight } from 'lucide-react';

interface Activity {
  id: string;
  tacticalObjectiveId: string;
  tacticalObjectiveName: string;
  name: string;
  type: string;
  status: "Planificado" | "En Progreso" | "Completado";
  startDate: string;
  endDate: string;
  responsible: string;
  priority: "Baja" | "Media" | "Alta";
  progress: number;
}

interface ScheduleData {
  processId: string;
  activities: Activity[];
}

interface TacticalObjective {
  id: string;
  description: string;
}

export default function ProcessSchedule() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<string | null>(null);
  const [processName, setProcessName] = useState("");
  const [tacticalObjectives, setTacticalObjectives] = useState<TacticalObjective[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [data, setData] = useState<ScheduleData>({
    processId: "",
    activities: [],
  });

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    const storedCompanyId = localStorage.getItem("selectedCompanyId");

    if (stored && storedCompanyId) {
      setProcessId(stored);

      // Load process name
      const companyIdNum = parseInt(storedCompanyId);
      const key = `processes_${companyIdNum}`;
      const processData = localStorage.getItem(key);

      if (processData) {
        try {
          const parsed = JSON.parse(processData);
          const process = parsed.processes?.find((p: any) => p.id === stored);
          if (process) {
            setProcessName(process.name);
          }
        } catch (e) {
          console.error("Error loading process:", e);
        }
      }

      // Load schedule data
      const scheduleKey = `processSchedule_${stored}`;
      const scheduleData = localStorage.getItem(scheduleKey);
      if (scheduleData) {
        try {
          setData(JSON.parse(scheduleData));
        } catch (e) {
          console.error("Error loading schedule:", e);
        }
      } else {
        setData({
          processId: stored,
          activities: [],
        });
      }

      // Load tactical objectives
      loadTacticalObjectives(stored);
    }
  }, []);

  const loadTacticalObjectives = (processId: string) => {
    const key = `processTacticalObjectives_${processId}`;
    const data = localStorage.getItem(key);

    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.objectives && Array.isArray(parsed.objectives)) {
          setTacticalObjectives(
            parsed.objectives.map((obj: any) => ({
              id: obj.id,
              description: obj.description,
            }))
          );
        }
      } catch (e) {
        console.error("Error loading tactical objectives:", e);
      }
    }
  };

  const handleSave = () => {
    if (!processId) return;
    const scheduleKey = `processSchedule_${processId}`;
    localStorage.setItem(scheduleKey, JSON.stringify(data));
    alert("Cronograma guardado exitosamente");
  };

  const addActivity = () => {
    try {
      const newData = { ...data };
      const newId = Date.now().toString();
      newData.activities.push({
        id: newId,
        tacticalObjectiveId: "",
        tacticalObjectiveName: "",
        name: "",
        type: "",
        status: "Planificado",
        startDate: "",
        endDate: "",
        responsible: "",
        priority: "Media",
        progress: 0,
      });
      setData(newData);
    } catch (e) {
      console.error("Error adding activity:", e);
    }
  };

  const deleteActivity = (id: string) => {
    try {
      const newData = { ...data };
      newData.activities = newData.activities.filter(a => a.id !== id);
      setData(newData);
    } catch (e) {
      console.error("Error deleting activity:", e);
    }
  };

  const updateActivity = (id: string, field: string, value: any) => {
    try {
      const newData = { ...data };
      const activity = newData.activities.find(a => a.id === id);
      if (activity) {
        (activity as any)[field] = value;

        // Update tactical objective name if ID changed
        if (field === "tacticalObjectiveId") {
          const objective = tacticalObjectives.find(o => o.id === value);
          if (objective) {
            activity.tacticalObjectiveName = objective.description;
          }
        }
      }
      setData(newData);
    } catch (e) {
      console.error("Error updating activity:", e);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completado":
        return "bg-green-100 text-green-900";
      case "En Progreso":
        return "bg-yellow-100 text-yellow-900";
      case "Planificado":
        return "bg-blue-100 text-blue-900";
      default:
        return "bg-slate-100 text-slate-900";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Alta":
        return "bg-red-100 text-red-900";
      case "Media":
        return "bg-yellow-100 text-yellow-900";
      case "Baja":
        return "bg-green-100 text-green-900";
      default:
        return "bg-slate-100 text-slate-900";
    }
  };

  const getProgressColor = (progress: number): string => {
    if (progress >= 80) return "bg-green-500";
    if (progress >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const monthName = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const activitiesInMonth = data.activities.filter(a => {
    const start = new Date(a.startDate);
    const end = new Date(a.endDate);
    return (start <= currentMonth && end >= new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)) ||
           (start >= new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1) && start <= new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0));
  });

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  if (!processId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-slate-600">
            Por favor, selecciona un proceso desde el Mapa de Procesos
          </p>
          <Button
            className="w-full mt-4"
            onClick={() => setLocation("/process-map")}
          >
            Volver al Mapa de Procesos
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalActivities = data.activities.length;
  const completedActivities = data.activities.filter(a => a.status === "Completado").length;
  const inProgressActivities = data.activities.filter(a => a.status === "En Progreso").length;
  const averageProgress = totalActivities > 0
    ? Math.round(data.activities.reduce((sum, a) => sum + a.progress, 0) / totalActivities)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">CRONOGRAMA DEL PROCESO</h1>
            <p className="text-slate-600">Proceso: {processName}</p>
          </div>
          <Button
            onClick={() => setLocation('/process-characterization')}
            variant="outline"
            className="gap-2"
          >
            <ArrowLeft size={16} />
            VOLVER
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600 mb-2">TOTAL ACTIVIDADES</p>
                <div className="text-slate-900 px-4 py-2 rounded font-bold text-2xl">
                  {totalActivities}
                </div>
                <p className="text-xs text-slate-600">Registradas</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600 mb-2">COMPLETADAS</p>
                <div className="text-green-900 px-4 py-2 rounded font-bold text-2xl">
                  {completedActivities}
                </div>
                <p className="text-xs text-slate-600">Finalizadas</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600 mb-2">EN PROGRESO</p>
                <div className="text-yellow-900 px-4 py-2 rounded font-bold text-2xl">
                  {inProgressActivities}
                </div>
                <p className="text-xs text-slate-600">En ejecución</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600 mb-2">% PROMEDIO PROGRESO</p>
                <div className={`${getProgressColor(averageProgress)} text-white px-4 py-2 rounded font-bold text-2xl`}>
                  {averageProgress}%
                </div>
                <p className="text-xs text-slate-600">General</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Month Navigation */}
        <Card className="mb-6">
          <CardHeader className="bg-orange-50">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={previousMonth}
              >
                <ChevronLeft size={16} />
              </Button>
              <CardTitle className="text-lg capitalize">{monthName}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={nextMonth}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Activities Table */}
        <Card>
          <CardHeader className="bg-orange-50">
            <CardTitle className="text-lg">ACTIVIDADES DEL CRONOGRAMA</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-200">
                    <th className="border p-2 text-left">OBJETIVO TÁCTICO</th>
                    <th className="border p-2 text-left">ACTIVIDAD</th>
                    <th className="border p-2">TIPO</th>
                    <th className="border p-2">ESTADO</th>
                    <th className="border p-2">INICIO</th>
                    <th className="border p-2">FIN</th>
                    <th className="border p-2">RESPONSABLE</th>
                    <th className="border p-2">PRIORIDAD</th>
                    <th className="border p-2">% PROGRESO</th>
                    <th className="border p-2">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activities.map((activity) => (
                    <tr key={activity.id} className="hover:bg-slate-50">
                      <td className="border p-2">
                        <select
                          value={activity.tacticalObjectiveId}
                          onChange={(e) => updateActivity(activity.id, "tacticalObjectiveId", e.target.value)}
                          className="w-full border rounded p-1 text-xs"
                        >
                          <option value="">Seleccionar...</option>
                          {tacticalObjectives.map((obj) => (
                            <option key={obj.id} value={obj.id}>
                              {obj.description}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border p-2">
                        <Input
                          value={activity.name}
                          onChange={(e) => updateActivity(activity.id, "name", e.target.value)}
                          placeholder="Actividad"
                          className="text-xs"
                        />
                      </td>
                      <td className="border p-2">
                        <Input
                          value={activity.type}
                          onChange={(e) => updateActivity(activity.id, "type", e.target.value)}
                          placeholder="Tipo"
                          className="text-xs"
                        />
                      </td>
                      <td className="border p-2">
                        <select
                          value={activity.status}
                          onChange={(e) => updateActivity(activity.id, "status", e.target.value)}
                          className={`w-full p-1 rounded text-xs font-semibold border-0 ${getStatusColor(activity.status)}`}
                        >
                          <option value="Planificado">Planificado</option>
                          <option value="En Progreso">En Progreso</option>
                          <option value="Completado">Completado</option>
                        </select>
                      </td>
                      <td className="border p-2">
                        <Input
                          type="date"
                          value={activity.startDate}
                          onChange={(e) => updateActivity(activity.id, "startDate", e.target.value)}
                          className="text-xs"
                        />
                      </td>
                      <td className="border p-2">
                        <Input
                          type="date"
                          value={activity.endDate}
                          onChange={(e) => updateActivity(activity.id, "endDate", e.target.value)}
                          className="text-xs"
                        />
                      </td>
                      <td className="border p-2">
                        <Input
                          value={activity.responsible}
                          onChange={(e) => updateActivity(activity.id, "responsible", e.target.value)}
                          placeholder="Responsable"
                          className="text-xs"
                        />
                      </td>
                      <td className="border p-2">
                        <select
                          value={activity.priority}
                          onChange={(e) => updateActivity(activity.id, "priority", e.target.value)}
                          className={`w-full p-1 rounded text-xs font-semibold border-0 ${getPriorityColor(activity.priority)}`}
                        >
                          <option value="Baja">Baja</option>
                          <option value="Media">Media</option>
                          <option value="Alta">Alta</option>
                        </select>
                      </td>
                      <td className="border p-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={activity.progress}
                          onChange={(e) => updateActivity(activity.id, "progress", parseInt(e.target.value) || 0)}
                          className={`w-full border rounded p-1 text-xs text-center font-bold ${getProgressColor(activity.progress)} text-white`}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteActivity(activity.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.activities.length === 0 && (
              <div className="text-center py-8 text-slate-600">
                No hay actividades registradas. Haz clic en "Agregar Actividad" para comenzar.
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={addActivity}
                className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
              >
                <Plus size={16} />
                Agregar Actividad
              </Button>
              <Button
                onClick={handleSave}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                <Save size={16} />
                Guardar Cronograma
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

