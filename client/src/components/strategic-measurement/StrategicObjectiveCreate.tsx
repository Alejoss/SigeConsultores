import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { emptyStrategicMeasurementConfig, isStrategicMeasurementConfigured } from "@shared/strategicObjectiveMeasurement";
import { emptyDefinition, configToDraft, draftToConfig, configDraftError, isCalendarDate, StrategicDefinitionFields, StrategicConfigFields } from "./StrategicMeasurementFields";

export function StrategicObjectiveCreate({ companyId, orderIndex, onClose, onCreated }: { companyId: number; orderIndex: number; onClose: () => void; onCreated: () => void }) {
  const [definition, setDefinition] = useState(emptyDefinition);
  const [config, setConfig] = useState(() => configToDraft(emptyStrategicMeasurementConfig()));
  const mutation = trpc.strategicObjectives.create.useMutation();
  const [error, setError] = useState<string | null>(null);
  async function create() {
    const measurementConfig = draftToConfig(config);
    if (!definition.name.trim()) { setError("Ingresa el nombre del objetivo."); return; }
    if (definition.deadline && !isCalendarDate(definition.deadline)) { setError("Completa una fecha límite válida."); return; }
    if (configDraftError(config) || !isStrategicMeasurementConfigured(measurementConfig)) { setError(configDraftError(config) || "Completa indicador, ponderación, punto de partida, meta numérica distinta, unidad y fecha meta para crear el OE."); return; }
    setError(null);
    try {
      await mutation.mutateAsync({ companyId, orderIndex, ...definition, deadline: measurementConfig.deadline, measurementConfig });
      toast.success("Objetivo agregado exitosamente");
      onCreated();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo agregar el objetivo."); }
  }
  return <Card className="border-blue-200 bg-blue-50/40">
    <CardHeader><CardTitle className="text-lg">Agregar nuevo objetivo estratégico</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <StrategicDefinitionFields value={definition} onChange={setDefinition} disabled={mutation.isPending} />
      <div className="border-t pt-4"><h3 className="font-semibold mb-3">Indicador propio del OE</h3><StrategicConfigFields value={config} onChange={setConfig} disabled={mutation.isPending} /></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2"><Button onClick={() => void create()} disabled={mutation.isPending}>{mutation.isPending ? "Creando…" : "Agregar objetivo"}</Button><Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cerrar</Button></div>
    </CardContent>
  </Card>;
}
