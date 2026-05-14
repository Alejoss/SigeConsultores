import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { Plus, Trash2 } from 'lucide-react';

interface FODAItem {
  id: number;
  description: string;
}

export default function FODAAnalysis() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);
  const [fortalezas, setFortalezas] = useState<FODAItem[]>([]);
  const [oportunidades, setOportunidades] = useState<FODAItem[]>([]);
  const [debilidades, setDebilidades] = useState<FODAItem[]>([]);
  const [amenazas, setAmenazas] = useState<FODAItem[]>([]);
  const [newItems, setNewItems] = useState({
    fortalezas: "",
    oportunidades: "",
    debilidades: "",
    amenazas: "",
  });

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    if (stored) {
      setProcessId(parseInt(stored));
    }
  }, []);

  const addItem = (
    type: "fortalezas" | "oportunidades" | "debilidades" | "amenazas"
  ) => {
    const text = newItems[type];
    if (!text.trim()) return;

    const newItem = { id: Date.now(), description: text };

    switch (type) {
      case "fortalezas":
        setFortalezas([...fortalezas, newItem]);
        break;
      case "oportunidades":
        setOportunidades([...oportunidades, newItem]);
        break;
      case "debilidades":
        setDebilidades([...debilidades, newItem]);
        break;
      case "amenazas":
        setAmenazas([...amenazas, newItem]);
        break;
    }

    setNewItems({ ...newItems, [type]: "" });
  };

  const deleteItem = (
    type: "fortalezas" | "oportunidades" | "debilidades" | "amenazas",
    id: number
  ) => {
    switch (type) {
      case "fortalezas":
        setFortalezas(fortalezas.filter((item) => item.id !== id));
        break;
      case "oportunidades":
        setOportunidades(oportunidades.filter((item) => item.id !== id));
        break;
      case "debilidades":
        setDebilidades(debilidades.filter((item) => item.id !== id));
        break;
      case "amenazas":
        setAmenazas(amenazas.filter((item) => item.id !== id));
        break;
    }
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

  const FODASection = ({
    title,
    type,
    items,
    bgColor,
    borderColor,
  }: {
    title: string;
    type: "fortalezas" | "oportunidades" | "debilidades" | "amenazas";
    items: FODAItem[];
    bgColor: string;
    borderColor: string;
  }) => (
    <Card className={`border-2 ${borderColor} ${bgColor}`}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Textarea
            placeholder={`Agregar ${title.toLowerCase()}...`}
            value={newItems[type]}
            onChange={(e) => setNewItems({ ...newItems, [type]: e.target.value })}
            className="min-h-[80px]"
          />
          <Button
            onClick={() => addItem(type)}
            disabled={!newItems[type].trim()}
            className="h-fit"
          >
            <Plus size={20} />
          </Button>
        </div>

        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-2 p-2 bg-white rounded border"
            >
              <p className="text-sm text-slate-900 flex-1">{item.description}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteItem(type, item.id)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <p className="text-center text-slate-600 text-sm py-2">
            No hay elementos agregados
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Análisis FODA</h1>
          <p className="text-slate-600 mt-2">
            Fortalezas, Oportunidades, Debilidades y Amenazas
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FODASection
            title="Fortalezas"
            type="fortalezas"
            items={fortalezas}
            bgColor="bg-green-50"
            borderColor="border-green-200"
          />
          <FODASection
            title="Oportunidades"
            type="oportunidades"
            items={oportunidades}
            bgColor="bg-blue-50"
            borderColor="border-blue-200"
          />
          <FODASection
            title="Debilidades"
            type="debilidades"
            items={debilidades}
            bgColor="bg-orange-50"
            borderColor="border-orange-200"
          />
          <FODASection
            title="Amenazas"
            type="amenazas"
            items={amenazas}
            bgColor="bg-red-50"
            borderColor="border-red-200"
          />
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Resumen FODA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-green-100 p-4 rounded text-center">
                <p className="text-sm text-slate-600">Fortalezas</p>
                <p className="text-3xl font-bold text-green-900">
                  {fortalezas.length}
                </p>
              </div>
              <div className="bg-blue-100 p-4 rounded text-center">
                <p className="text-sm text-slate-600">Oportunidades</p>
                <p className="text-3xl font-bold text-blue-900">
                  {oportunidades.length}
                </p>
              </div>
              <div className="bg-orange-100 p-4 rounded text-center">
                <p className="text-sm text-slate-600">Debilidades</p>
                <p className="text-3xl font-bold text-orange-900">
                  {debilidades.length}
                </p>
              </div>
              <div className="bg-red-100 p-4 rounded text-center">
                <p className="text-sm text-slate-600">Amenazas</p>
                <p className="text-3xl font-bold text-red-900">
                  {amenazas.length}
                </p>
              </div>
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

