import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';

interface Compliance {
  id: number;
  obligationName: string;
  month: number;
  year: number;
  planned: boolean;
  completed: boolean;
}

export default function Compliances() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);
  const [compliances, setCompliances] = useState<Compliance[]>([]);
  const [newComplianceName, setNewComplianceName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    if (stored) {
      setProcessId(parseInt(stored));
    }
  }, []);

  const handleAddCompliance = () => {
    if (!newComplianceName.trim()) return;
    setCompliances([
      ...compliances,
      {
        id: Date.now(),
        obligationName: newComplianceName,
        month: selectedMonth,
        year: selectedYear,
        planned: false,
        completed: false,
      },
    ]);
    setNewComplianceName("");
  };

  const handleToggleCompliance = (id: number) => {
    setCompliances(
      compliances.map((c) =>
        c.id === id ? { ...c, completed: !c.completed } : c
      )
    );
  };

  const handleTogglePlanned = (id: number) => {
    setCompliances(
      compliances.map((c) =>
        c.id === id ? { ...c, planned: !c.planned } : c
      )
    );
  };

  const handleDeleteCompliance = (id: number) => {
    setCompliances(compliances.filter((c) => c.id !== id));
  };

  const completionPercentage = compliances.length > 0
    ? Math.round((compliances.filter((c) => c.completed).length / compliances.length) * 100)
    : 0;

  const plannedCount = compliances.filter((c) => c.planned).length;
  const completedCount = compliances.filter((c) => c.completed).length;

  if (!processId) {
    return (
      <DashboardLayout>
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
      </DashboardLayout>
    );
  }

  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  // Obtener companyId para el botón Volver
  const companyId = new URLSearchParams(window.location.search).get('companyId') || localStorage.getItem('selectedCompanyId') || '';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Cumplimientos</h1>
            <Button
              variant="outline"
              onClick={() => setLocation(`/audits-inspections${companyId ? '?companyId=' + companyId : ''}`)}
              className="flex items-center gap-2"
            >
              ← Volver
            </Button>
          </div>
          <p className="text-slate-600 mt-2">
            Gestiona las obligaciones regulatorias del proceso
          </p>
        </div>

        {/* Add New Compliance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agregar Nuevo Cumplimiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nombre de la obligación..."
                value={newComplianceName}
                onChange={(e) => setNewComplianceName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") handleAddCompliance();
                }}
              />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 border rounded"
              >
                {months.map((month, idx) => (
                  <option key={idx} value={idx + 1}>
                    {month}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 border rounded"
              >
                {[2024, 2025, 2026, 2027].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleAddCompliance}
                disabled={!newComplianceName.trim()}
              >
                <Plus size={20} />
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Compliance Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Total Cumplimientos</p>
              <p className="text-3xl font-bold text-slate-900">{compliances.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Planificados</p>
              <p className="text-3xl font-bold text-blue-900">{plannedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Completados</p>
              <p className="text-3xl font-bold text-green-900">{completedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Porcentaje</p>
              <p className="text-3xl font-bold text-orange-900">{completionPercentage}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Compliance Progress Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Progreso General</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Cumplimientos Completados</span>
                <span className="font-semibold">{completionPercentage}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-4">
                <div
                  className="bg-green-600 h-4 rounded-full transition-all"
                  style={{ width: `${completionPercentage}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compliance List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lista de Cumplimientos</CardTitle>
            <CardDescription>
              {selectedMonth > 0 && `${months[selectedMonth - 1]} de ${selectedYear}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {compliances.length === 0 ? (
              <p className="text-center text-slate-600 py-6">
                No hay cumplimientos agregados aún
              </p>
            ) : (
              <div className="space-y-2">
                {compliances.map((compliance) => (
                  <div
                    key={compliance.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded border hover:bg-slate-100 transition"
                  >
                    <button
                      onClick={() => handleToggleCompliance(compliance.id)}
                      className="flex-shrink-0"
                    >
                      {compliance.completed ? (
                        <CheckCircle2 size={24} className="text-green-600" />
                      ) : (
                        <Circle size={24} className="text-slate-400" />
                      )}
                    </button>
                    <div className="flex-1">
                      <p className={`font-medium ${compliance.completed ? "line-through text-slate-500" : "text-slate-900"}`}>
                        {compliance.obligationName}
                      </p>
                      <p className="text-xs text-slate-600">
                        {months[compliance.month - 1]} {compliance.year}
                      </p>
                    </div>
                    <button
                      onClick={() => handleTogglePlanned(compliance.id)}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        compliance.planned
                          ? "bg-blue-100 text-blue-900"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {compliance.planned ? "Planificado" : "No Planificado"}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCompliance(compliance.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => setLocation("/process-characterization")}
            className="flex-1"
          >
            Volver a Caracterización
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

