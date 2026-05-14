import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MatrixEvaluator } from "@/components/MatrixEvaluator";
import { useLocation } from "wouter";

interface RiskItem {
  id: number;
  name: string;
  probability: number;
  impact: number;
}

export default function RiskMatrix() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);
  const [items, setItems] = useState<RiskItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    if (stored) {
      setProcessId(parseInt(stored));
    }
  }, []);

  const handleAddItem = (name: string) => {
    setItems([...items, { id: Date.now(), name, probability: 1, impact: 1 }]);
  };

  const handleDeleteItem = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleUpdateScore = (id: number, probability: number, impact: number) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, probability, impact } : item
      )
    );
  };

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Matriz de Riesgos</h1>
          <p className="text-slate-600 mt-2">
            Evaluación de riesgos del proceso
          </p>
        </div>

        {/* Risk Matrix */}
        <MatrixEvaluator
          title="Evaluación de Riesgos"
          description="Evalúa la probabilidad e impacto de cada riesgo identificado"
          items={items}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
          onUpdateScore={handleUpdateScore}
          type="riesgos"
        />

        {/* Risk Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribución de Riesgos</CardTitle>
            <CardDescription>
              Clasificación de riesgos por nivel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Bajo",
                  color: "bg-green-100",
                  count: items.filter(
                    (i) => i.probability * i.impact <= 2
                  ).length,
                },
                {
                  label: "Medio",
                  color: "bg-yellow-100",
                  count: items.filter(
                    (i) => i.probability * i.impact > 2 && i.probability * i.impact <= 4
                  ).length,
                },
                {
                  label: "Alto",
                  color: "bg-orange-100",
                  count: items.filter(
                    (i) => i.probability * i.impact > 4 && i.probability * i.impact <= 7
                  ).length,
                },
                {
                  label: "Crítico",
                  color: "bg-red-100",
                  count: items.filter(
                    (i) => i.probability * i.impact > 7
                  ).length,
                },
              ].map((risk) => (
                <div
                  key={risk.label}
                  className={`${risk.color} p-4 rounded-lg text-center`}
                >
                  <p className="text-sm text-slate-600">{risk.label}</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {risk.count}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Risk Matrix Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Matriz de Riesgos Visual</CardTitle>
            <CardDescription>
              Visualización gráfica de la distribución de riesgos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="grid grid-cols-6 gap-1 bg-slate-100 p-4 rounded min-w-max">
                {/* Header */}
                <div></div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={`header-${i}`} className="text-center text-xs font-semibold">
                    {i}
                  </div>
                ))}

                {/* Rows */}
                {[5, 4, 3, 2, 1].map((row) => (
                  <div key={`row-${row}`}>
                    <div className="text-xs font-semibold text-center">{row}</div>
                    {[1, 2, 3, 4, 5].map((col) => {
                      const itemsInCell = items.filter(
                        (item) =>
                          item.probability === col && item.impact === row
                      );

                      let bgColor = "bg-green-100";
                      if (row * col >= 8) bgColor = "bg-red-100";
                      else if (row * col >= 5) bgColor = "bg-orange-100";
                      else if (row * col >= 3) bgColor = "bg-yellow-100";

                      return (
                        <div
                          key={`cell-${row}-${col}`}
                          className={`${bgColor} border border-slate-300 w-12 h-12 flex items-center justify-center text-xs font-semibold`}
                        >
                          {itemsInCell.length > 0 && (
                            <span className="text-slate-900">
                              {itemsInCell.length}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-600">
              <p>Eje X: Probabilidad (1-5) | Eje Y: Impacto (1-5)</p>
            </div>
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

