import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft } from 'lucide-react';
import { ActivePlanningCycleBadge } from "@/components/ActivePlanningCycleBadge";

export default function ObjectivesTactical() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    if (stored) {
      setProcessId(parseInt(stored));
    }
  }, []);

  const handleDefinition = () => {
    setLocation('/tactical-definition');
  };

  const handlePlanning = () => {
    setLocation('/tactical-planning');
  };

  const handleBack = () => {
    setLocation('/process-characterization');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-4xl font-bold text-blue-900 mb-2">OBJETIVOS TÁCTICOS</h1><ActivePlanningCycleBadge companyId={Number(localStorage.getItem("selectedCompanyId"))} /></div>
            <p className="text-gray-600">Proceso: <span className="font-semibold">{localStorage.getItem("selectedProcessName") || "Proceso"}</span></p>
          </div>
          <Button
            onClick={handleBack}
            variant="outline"
            className="flex items-center gap-2"
          >
            <ArrowLeft size={20} />
            VOLVER
          </Button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Definición Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-blue-200"
            onClick={handleDefinition}
          >
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-900">Definición de Objetivos Tácticos</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-gray-700 mb-4">
                Define los objetivos tácticos confrontando subprocesos con objetivos estratégicos. 
                Especifica el enunciado, explicación y responsable de cada objetivo.
              </p>
              <Button 
                onClick={handleDefinition}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Ir a Definición
              </Button>
            </CardContent>
          </Card>

          {/* Planificación Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-green-200"
            onClick={handlePlanning}
          >
            <CardHeader className="bg-green-50">
              <CardTitle className="text-green-900">Planificación de Objetivos Tácticos</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-gray-700 mb-4">
                Planifica la implementación de los objetivos tácticos. Define categorías, metas, 
                responsables y resultados clave con seguimiento de fechas y cumplimiento.
              </p>
              <Button 
                onClick={handlePlanning}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                Ir a Planificación
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
