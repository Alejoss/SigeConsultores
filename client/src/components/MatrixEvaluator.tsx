import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Plus, Trash2 } from 'lucide-react';

interface MatrixItem {
  id: number;
  name: string;
  probability?: number;
  impact?: number;
  score?: number;
  color?: string;
}

interface MatrixEvaluatorProps {
  title: string;
  description: string;
  items: MatrixItem[];
  onAddItem: (name: string) => void;
  onDeleteItem: (id: number) => void;
  onUpdateScore: (id: number, probability: number, impact: number) => void;
  type: "criticidad" | "foda" | "riesgos";
}

export function MatrixEvaluator({
  title,
  description,
  items,
  onAddItem,
  onDeleteItem,
  onUpdateScore,
  type,
}: MatrixEvaluatorProps) {
  const [newItemName, setNewItemName] = useState("");

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    onAddItem(newItemName);
    setNewItemName("");
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "bg-red-100 text-red-900";
    if (score >= 5) return "bg-orange-100 text-orange-900";
    if (score >= 3) return "bg-yellow-100 text-yellow-900";
    return "bg-green-100 text-green-900";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 8) return "CRÍTICO";
    if (score >= 5) return "ALTO";
    if (score >= 3) return "MEDIO";
    return "BAJO";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New Item */}
        <div className="flex gap-2">
          <Input
            placeholder={`Agregar nuevo ${type === "criticidad" ? "cliente/proveedor" : "elemento"}...`}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") handleAddItem();
            }}
          />
          <Button onClick={handleAddItem} disabled={!newItemName.trim()}>
            <Plus size={20} />
            Agregar
          </Button>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Elemento</th>
                <th className="text-center py-2 px-3">Probabilidad (1-5)</th>
                <th className="text-center py-2 px-3">Impacto (1-5)</th>
                <th className="text-center py-2 px-3">Puntuación</th>
                <th className="text-center py-2 px-3">Nivel</th>
                <th className="text-center py-2 px-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b hover:bg-slate-50">
                  <td className="py-2 px-3">{item.name}</td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={item.probability || 1}
                      onChange={(e) => {
                        const prob = parseInt(e.target.value) || 1;
                        const impact = item.impact || 1;
                        onUpdateScore(item.id, prob, impact);
                      }}
                      className="w-16 px-2 py-1 border rounded text-center"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={item.impact || 1}
                      onChange={(e) => {
                        const impact = parseInt(e.target.value) || 1;
                        const prob = item.probability || 1;
                        onUpdateScore(item.id, prob, impact);
                      }}
                      className="w-16 px-2 py-1 border rounded text-center"
                    />
                  </td>
                  <td className="py-2 px-3 text-center font-semibold">
                    {(item.probability || 1) * (item.impact || 1)}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${getScoreColor(
                        (item.probability || 1) * (item.impact || 1)
                      )}`}
                    >
                      {getScoreLabel((item.probability || 1) * (item.impact || 1))}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteItem(item.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <p className="text-center text-slate-600 py-4">
            No hay elementos agregados aún. ¡Comienza a agregar!
          </p>
        )}

        {/* Legend */}
        <div className="bg-slate-50 p-4 rounded border border-slate-200">
          <p className="text-sm font-semibold mb-2">Escala de Evaluación:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="bg-green-100 p-2 rounded">Bajo (1-2)</div>
            <div className="bg-yellow-100 p-2 rounded">Medio (3-4)</div>
            <div className="bg-orange-100 p-2 rounded">Alto (5-7)</div>
            <div className="bg-red-100 p-2 rounded">Crítico (8-25)</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

