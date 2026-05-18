import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { trpc } from "@/lib/trpc";

const PROCESS_PARTS = [
  { id: "general", label: "Datos Generales" },
  { id: "participants", label: "Participantes" },
  { id: "resources", label: "Recursos" },
  { id: "subprocesses", label: "Mapa de Subprocesos" },
  { id: "criticality", label: "Criticidad Partes Interesadas" },
  { id: "foda", label: "FODA" },
  { id: "matrix", label: "Matriz" },
  { id: "tactical-objectives", label: "Objetivos Tácticos" },
  { id: "compliance", label: "Cumplimientos" },
  { id: "training", label: "Capacitaciones" },
  { id: "procedures", label: "Procedimientos" },
  { id: "schedule", label: "Cronograma Consolidado" },
  { id: "indicators", label: "Indicadores" },
];

interface SelectedProcess {
  id: number;
  name: string;
  processType: string;
  parts: Set<string>;
  isExpanded: boolean;
}

interface ProcessSelectorProps {
  companyId: number | null;
  selectedProcesses: Map<number, SelectedProcess>;
  onProcessesChange: (processes: Map<number, SelectedProcess>) => void;
}

export default function ProcessSelector({
  companyId,
  selectedProcesses,
  onProcessesChange,
}: ProcessSelectorProps) {
  const [newProcessId, setNewProcessId] = useState<number | null>(null);
  const processesQuery = trpc.recovery.getProcesses.useQuery(
    { companyId: companyId || 0 },
    { enabled: !!companyId }
  );

  const handleAddProcess = () => {
    if (!newProcessId) return;

    const process = processesQuery.data?.find((p) => p.id === newProcessId);
    if (!process) return;

    const newProcesses = new Map(selectedProcesses);
    if (!newProcesses.has(newProcessId)) {
      newProcesses.set(newProcessId, {
        id: process.id,
        name: process.name,
        processType: process.processType,
        parts: new Set(),
        isExpanded: true,
      });
      onProcessesChange(newProcesses);
    }

    setNewProcessId(null);
  };

  const handleRemoveProcess = (processId: number) => {
    const newProcesses = new Map(selectedProcesses);
    newProcesses.delete(processId);
    onProcessesChange(newProcesses);
  };

  const handleTogglePart = (processId: number, partId: string) => {
    const newProcesses = new Map(selectedProcesses);
    const process = newProcesses.get(processId);
    if (!process) return;

    const newParts = new Set(process.parts);
    if (newParts.has(partId)) {
      newParts.delete(partId);
    } else {
      newParts.add(partId);
    }

    newProcesses.set(processId, { ...process, parts: newParts });
    onProcessesChange(newProcesses);
  };

  const handleToggleExpanded = (processId: number) => {
    const newProcesses = new Map(selectedProcesses);
    const process = newProcesses.get(processId);
    if (!process) return;

    newProcesses.set(processId, { ...process, isExpanded: !process.isExpanded });
    onProcessesChange(newProcesses);
  };

  const handleSelectAllParts = (processId: number) => {
    const newProcesses = new Map(selectedProcesses);
    const process = newProcesses.get(processId);
    if (!process) return;

    const newParts = new Set(
      process.parts.size === PROCESS_PARTS.length ? [] : PROCESS_PARTS.map((p) => p.id)
    );

    newProcesses.set(processId, { ...process, parts: newParts });
    onProcessesChange(newProcesses);
  };

  const availableProcesses = processesQuery.data?.filter(
    (p) => !selectedProcesses.has(p.id)
  ) || [];

  return (
    <div className="space-y-4 border-t pt-4">
      <Label>Procesos a Recuperar</Label>

      {/* Add Process Dropdown */}
      {companyId && (
        <div className="flex gap-2">
          <NativeSelect
            className="flex-1"
            value={newProcessId?.toString() ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setNewProcessId(v ? parseInt(v, 10) : null);
            }}
          >
            <option value="">Selecciona un proceso...</option>
            {availableProcesses.map((process) => (
              <option key={process.id} value={process.id.toString()}>
                {process.name} ({process.processType})
              </option>
            ))}
          </NativeSelect>
          <Button onClick={handleAddProcess} disabled={!newProcessId} variant="outline">
            Agregar
          </Button>
        </div>
      )}

      {/* Selected Processes */}
      {selectedProcesses.size > 0 ? (
        <div className="space-y-3">
          {Array.from(selectedProcesses.values()).map((process) => (
            <div key={process.id} className="border rounded-lg p-4 bg-slate-50">
              {/* Process Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleExpanded(process.id)}
                    className="w-5 h-5 flex items-center justify-center text-xs font-bold"
                  >
                    {process.isExpanded ? "▼" : "▶"}
                  </button>
                  <div>
                    <div className="font-semibold">{process.name}</div>
                    <div className="text-sm text-gray-500">{process.processType}</div>
                  </div>
                </div>
                <Button
                  onClick={() => handleRemoveProcess(process.id)}
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  ✕
                </Button>
              </div>

              {/* Process Parts */}
              {process.isExpanded && (
                <div className="space-y-2 ml-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllParts(process.id)}
                    className="mb-2"
                  >
                    {process.parts.size === PROCESS_PARTS.length
                      ? "Deseleccionar Todo"
                      : "Seleccionar Todo"}
                  </Button>

                  <div className="space-y-2">
                    {PROCESS_PARTS.map((part) => (
                      <div key={part.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={process.parts.has(part.id)}
                          onCheckedChange={() => handleTogglePart(process.id, part.id)}
                          id={`process-${process.id}-${part.id}`}
                        />
                        <Label
                          htmlFor={`process-${process.id}-${part.id}`}
                          className="cursor-pointer text-sm"
                        >
                          {part.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic p-4 border rounded-lg bg-gray-50">
          {companyId
            ? "No hay procesos seleccionados. Agrega uno desde el dropdown arriba."
            : "Selecciona una empresa primero para ver los procesos disponibles."}
        </div>
      )}
    </div>
  );
}
