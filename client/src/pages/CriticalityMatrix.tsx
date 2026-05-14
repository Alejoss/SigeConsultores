import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MatrixEvaluator } from "@/components/MatrixEvaluator";
import { useLocation } from "wouter";

interface CriticalityItem {
  id: number;
  name: string;
  incidence: number;
  risk: number;
}

export default function CriticalityMatrix() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);
  const [items, setItems] = useState<CriticalityItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    if (stored) {
      setProcessId(parseInt(stored));
    }
  }, []);

  const handleAddItem = (name: string) => {
    setItems([...items, { id: Date.now(), name, incidence: 1, risk: 1 }]);
  };

  const handleDeleteItem = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleUpdateScore = (id: number, incidence: number, risk: number) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, incidence, risk } : item
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
          <h1 className="text-3xl font-bold">Matriz de Criticidad</h1>
          <p className="text-slate-600 mt-2">
            Evalúa la criticidad de clientes y proveedores
          </p>
        </div>

        {/* Criticality Matrix */}
        <MatrixEvaluator
          title="Evaluación de Criticidad"
          description="Evalúa la incidencia y riesgo de cada cliente/proveedor"
          items={items}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
          onUpdateScore={handleUpdateScore}
          type="criticidad"
        />

        {/* Matrix Visualization */}
        <Card>
          <CardHeader>
            <CardTitle>Matriz de Criticidad Visual</CardTitle>
            <CardDescription>
              Visualización gráfica de la criticidad
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-1 aspect-square bg-slate-100 p-4 rounded">
              {/* Create a 5x5 grid */}
              {[...Array(25)].map((_, i) => {
                const row = Math.floor(i / 5);
                const col = i % 5;
                const itemsInCell = items.filter(
                  (item) =>
                    Math.ceil(item.incidence) === col + 1 &&
                    Math.ceil(item.risk) === row + 1
                );

                let bgColor = "bg-green-100";
                if ((row + 1) * (col + 1) >= 8) bgColor = "bg-red-100";
                else if ((row + 1) * (col + 1) >= 5) bgColor = "bg-orange-100";
                else if ((row + 1) * (col + 1) >= 3) bgColor = "bg-yellow-100";

                return (
                  <div
                    key={i}
                    className={`${bgColor} border border-slate-300 flex items-center justify-center text-xs font-semibold relative`}
                  >
                    {itemsInCell.length > 0 && (
                      <span className="text-slate-900">{itemsInCell.length}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-xs text-slate-600">
              <p>Eje X: Incidencia (1-5) | Eje Y: Riesgo (1-5)</p>
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

