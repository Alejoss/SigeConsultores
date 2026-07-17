import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Download, TrendingUp, AlertCircle, BarChart2 } from "lucide-react";
import * as XLSX from "xlsx";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import ExecutiveDashboard from "@/components/ExecutiveDashboard";

interface IndicatorElement {
  id: string;
  name: string;
  indicators: {
    id: string;
    name: string;
    value: number;
  }[];
}

interface ConsolidatedIndicator {
  id: string;
  name: string;
  indicator: string;
  value: number;
  performance: number;
}

export default function ProcessIndicators() {
  const [, navigate] = useLocation();
  const selectedProcessId = localStorage.getItem("selectedProcessId");
  const processId = selectedProcessId ? parseInt(selectedProcessId) : 0;
  
  const [showExecutive, setShowExecutive] = useState(false);

  const [elements, setElements] = useState<IndicatorElement[]>([
    {
      id: "criticidad",
      name: "Gestión con Partes Interesadas",
      indicators: [
        { id: "cumplimiento", name: "Porcentaje de cumplimiento", value: 0 }
      ]
    },
    {
      id: "matriz",
      name: "OTG",
      indicators: [
        { id: "total_alcanzado", name: "Total alcanzado", value: 0 },
        { id: "comunicado", name: "%Comunicado", value: 0 }
      ]
    },
    {
      id: "objetivos",
      name: "OTE",
      indicators: [
        { id: "alcanzado", name: "% Meta alcanzada por Objetivos Tácticos", value: 0 }
      ]
    },
    {
      id: "cumplimientos",
      name: "Cumplimientos",
      indicators: [
        { id: "promedio_cumplimiento", name: "%Cumplidos", value: 0 }
      ]
    }
  ]);

  // Fetch consolidated indicators data from database
  const { data: indicatorsData, isLoading } = trpc.consolidatedIndicators.getConsolidatedIndicators.useQuery(
    { processId },
    { enabled: processId > 0 }
  );

  useEffect(() => {
    if (indicatorsData && Array.isArray(indicatorsData) && indicatorsData.length > 0) {
      // Match by id field from server response
      const updatedElements = elements.map(element => {
        const updatedIndicators = element.indicators.map(indicator => {
          const dbIndicator = indicatorsData.find((ind: any) => ind.id === indicator.id);
          return {
            ...indicator,
            value: dbIndicator?.value ?? indicator.value
          };
        });
        return { ...element, indicators: updatedIndicators };
      });
      setElements(updatedElements);
    }
  }, [indicatorsData]);

  // Calculate total average
  const calculateTotalAverage = (): number => {
    const allValues = elements.flatMap(el => el.indicators.map(ind => ind.value));
    if (allValues.length === 0) return 0;
    return Math.round(allValues.reduce((sum, val) => sum + val, 0) / allValues.length);
  };

  const totalAverage = calculateTotalAverage();

  // Handle indicator value change
  const handleIndicatorChange = (elementId: string, indicatorId: string, value: number) => {
    const updatedElements = elements.map(el => {
      if (el.id === elementId) {
        return {
          ...el,
          indicators: el.indicators.map(ind => 
            ind.id === indicatorId ? { ...ind, value } : ind
          )
        };
      }
      return el;
    });
    setElements(updatedElements);
  };

  const getPerformanceColor = (value: number): string => {
    if (value >= 80) return "bg-green-100 text-green-700 border-green-300";
    if (value >= 60) return "bg-yellow-100 text-yellow-700 border-yellow-300";
    return "bg-red-100 text-red-700 border-red-300";
  };

  const getPerformanceLabel = (value: number): string => {
    if (value >= 80) return "En Meta";
    if (value >= 60) return "Alerta";
    return "Crítico";
  };

  const exportToExcel = () => {
    const data: any[] = [];
    
    elements.forEach(element => {
      data.push({
        "Elemento": element.name,
        "Indicador": "",
        "Valor (%)": "",
        "Estado": ""
      });
      
      element.indicators.forEach(indicator => {
        data.push({
          "Elemento": "",
          "Indicador": indicator.name,
          "Valor (%)": indicator.value,
          "Estado": getPerformanceLabel(indicator.value)
        });
      });
    });

    data.push({
      "Elemento": "AVANCE TOTAL",
      "Indicador": "",
      "Valor (%)": totalAverage,
      "Estado": getPerformanceLabel(totalAverage)
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Indicadores");
    XLSX.writeFile(workbook, "indicadores_proceso.xlsx");
    toast.success("Archivo exportado exitosamente");
  };

  if (!processId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-slate-600">
                Por favor, selecciona un proceso primero
              </p>
              <Button
                className="w-full mt-4"
                onClick={() => navigate("/process-characterization")}
              >
                Volver a Caracterización
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-bold text-gray-900">Indicadores del Proceso</h1>
            <Button 
              variant="outline"
              onClick={() => navigate("/process-characterization")}
            >
              ← Volver
            </Button>
          </div>
        </div>

        {/* Avance Total Card */}
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white mb-8 border-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90">Avance Total</p>
                <p className="text-5xl font-bold mt-2">{totalAverage}%</p>
                <p className={`text-sm mt-2 font-medium ${
                  totalAverage >= 80 ? "text-green-200" :
                  totalAverage >= 60 ? "text-yellow-200" :
                  "text-red-200"
                }`}>
                  {getPerformanceLabel(totalAverage)}
                </p>
              </div>
              <TrendingUp size={48} className="opacity-30" />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="mb-6 flex justify-end gap-3">
          <Button
            onClick={() => setShowExecutive(true)}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <BarChart2 size={16} />
            Vista Ejecutiva
          </Button>
          <Button
            onClick={exportToExcel}
            variant="outline"
            className="gap-2"
          >
            <Download size={16} />
            Exportar a Excel
          </Button>
        </div>

        {/* Indicators Elements */}
        <div className="space-y-6">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-slate-600">Cargando indicadores...</p>
              </CardContent>
            </Card>
          ) : (
            elements.map(element => (
              <Card key={element.id} className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <CardTitle translate="no" className="text-lg text-gray-800">{element.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {element.indicators.map(indicator => (
                      <div key={indicator.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <span translate="no" className="text-sm font-medium text-gray-700">{indicator.name}</span>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={indicator.value}
                            onChange={(e) => handleIndicatorChange(element.id, indicator.id, parseInt(e.target.value) || 0)}
                            className="w-20 text-center"
                          />
                          <span className="text-sm font-semibold text-gray-600">%</span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPerformanceColor(indicator.value)}`}>
                            {getPerformanceLabel(indicator.value)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Executive Dashboard Modal */}
        {showExecutive && (
          <ExecutiveDashboard
            elements={elements}
            totalAverage={totalAverage}
            onClose={() => setShowExecutive(false)}
          />
        )}

        {/* Info Box */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="text-blue-600 flex-shrink-0" size={20} />
              <div className="text-sm text-gray-700">
                <p className="font-semibold mb-1">Información:</p>
                <p>El "Avance Total" se calcula como el promedio de todos los indicadores. Ingresa los valores porcentuales (0-100) para cada indicador y el sistema calculará automáticamente el avance total.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
