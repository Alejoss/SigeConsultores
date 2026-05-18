import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ProcessSelector from "./ProcessSelector";

interface SelectedProcess {
  id: number;
  name: string;
  processType: string;
  parts: Set<string>;
  isExpanded: boolean;
}

const MODULES = [
  {
    id: "purpose",
    label: "Propósito, Misión, Visión",
    children: [],
  },
  {
    id: "values",
    label: "Valores Empresariales",
    children: [],
  },
  {
    id: "policy",
    label: "Política",
    children: [
      { id: "policy-objectives", label: "Objetivos de la Política" },
      { id: "policy-docs", label: "Documentos de la Política" },
    ],
  },
  {
    id: "strategic-objectives",
    label: "Objetivos Estratégicos",
    children: [],
  },
  {
    id: "process-map",
    label: "Mapa de Procesos",
    children: [
      { id: "process-files", label: "Archivos Descargados" },
      {
        id: "processes",
        label: "Procesos",
        children: [
          { id: "process-general", label: "Datos Generales" },
          { id: "process-participants", label: "Participantes" },
          { id: "process-resources", label: "Recursos" },
          { id: "process-subprocesses", label: "Mapa de Subprocesos" },
          { id: "process-criticality", label: "Criticidad Partes Interesadas" },
          { id: "process-foda", label: "FODA" },
          { id: "process-matrix", label: "Matriz" },
          { id: "process-tactical-objectives", label: "Objetivos Tácticos" },
          { id: "process-compliance", label: "Cumplimientos" },
          { id: "process-training", label: "Capacitaciones" },
          { id: "process-procedures", label: "Procedimientos" },
          { id: "process-schedule", label: "Cronograma Consolidado" },
          { id: "process-indicators", label: "Indicadores" },
        ],
      },
    ],
  },
  {
    id: "company-foda",
    label: "FODA de Empresa",
    children: [],
  },
  {
    id: "indicators",
    label: "Indicadores",
    children: [],
  },
  {
    id: "sige-flowchart",
    label: "Flujograma SIGE",
    children: [],
  },
  {
    id: "all-info",
    label: "Toda la Información de la Empresa",
    children: [],
  },
];

export default function RecoveryForm() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [recoveryDate, setRecoveryDate] = useState("");
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [selectedProcesses, setSelectedProcesses] = useState<Map<number, SelectedProcess>>(new Map());

  // Queries
  const companiesQuery = trpc.recovery.getCompanies.useQuery();

  // Mutations
  const logRecoveryMutation = trpc.recovery.logRecovery.useMutation();

  // Toggle module selection
  const toggleModule = (moduleId: string) => {
    const newSelected = new Set(selectedModules);
    if (moduleId === "all-info") {
      if (newSelected.has("all-info")) {
        newSelected.clear();
      } else {
        newSelected.clear();
        MODULES.forEach(m => newSelected.add(m.id));
      }
    } else {
      if (newSelected.has(moduleId)) {
        newSelected.delete(moduleId);
        newSelected.delete("all-info");
      } else {
        newSelected.add(moduleId);
      }
    }
    setSelectedModules(newSelected);
  };



  // Toggle module expansion
  const toggleExpanded = (moduleId: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  // Handle recovery submission
  const handleRecover = async () => {
    if (!selectedCompanyId) {
      toast.error("Selecciona una empresa");
      return;
    }
    if (!recoveryDate) {
      toast.error("Selecciona una fecha de recuperación");
      return;
    }
    if (selectedModules.size === 0) {
      toast.error("Selecciona al menos un módulo");
      return;
    }

    const modulesArray = Array.from(selectedModules);
    const selectedCompany = companiesQuery.data?.find(c => c.id === selectedCompanyId);
    const processesArray = Array.from(selectedProcesses.values()).map(p => ({
      id: p.id,
      name: p.name,
      processType: p.processType,
      parts: Array.from(p.parts),
    }));

    try {
      await logRecoveryMutation.mutateAsync({
        companyId: selectedCompanyId,
        companyName: selectedCompany?.name || "",
        backupFile: `backup_${new Date().toISOString().split('T')[0]}.sql`,
        backupDate: new Date(recoveryDate),
        modulesRecovered: modulesArray,
        processesRecovered: processesArray.length > 0 ? processesArray : undefined,
        recordsCount: processesArray.length,
        status: "success",
        performedByUserId: 1,
        performedByName: "Admin",
        reason: `Recuperación de ${modulesArray.length} módulos`,
        durationSeconds: 0,
        notes: processesArray.length > 0 ? `Procesos: ${processesArray.map(p => `${p.name} (${p.processType}) - Partes: ${p.parts.join(", ")}`).join("; ")}` : undefined,
      });

      toast.success(`Recuperación registrada para ${modulesArray.length} módulos`);
      
      setSelectedCompanyId(null);
      setRecoveryDate("");
      setSelectedModules(new Set());
      setSelectedProcesses(new Map());
    } catch (error) {
      console.error("Error al registrar recuperación:", error);
      toast.error("Error al registrar la recuperación");
    }
  };

  // Render module checkbox
  const renderModule = (module: any, level: number = 0) => {
    const isSelected = selectedModules.has(module.id);
    const hasChildren = module.children && module.children.length > 0;
    const isExpanded = expandedModules.has(module.id);

    return (
      <div key={module.id} style={{ marginLeft: `${level * 20}px` }}>
        <div className="flex items-center gap-2 py-2">
          {hasChildren && (
            <button
              onClick={() => toggleExpanded(module.id)}
              className="w-4 h-4 flex items-center justify-center text-xs"
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleModule(module.id)}
            id={module.id}
          />
          <Label htmlFor={module.id} className="cursor-pointer text-sm">
            {module.label}
          </Label>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {module.children.map((child: any) => renderModule(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperación de Datos</CardTitle>
        <CardDescription>
          Selecciona la empresa, fecha y módulos que deseas recuperar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Company Selector */}
        <div className="space-y-2">
          <Label htmlFor="company">Empresa</Label>
          <NativeSelect
            id="company"
            value={selectedCompanyId?.toString() ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedCompanyId(value ? parseInt(value, 10) : null);
              setSelectedProcesses(new Map());
            }}
          >
            <option value="">Selecciona una empresa...</option>
            {companiesQuery.data?.map((company) => (
              <option key={company.id} value={company.id.toString()}>
                {company.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        {/* Recovery Date */}
        <div className="space-y-2">
          <Label htmlFor="recovery-date">Fecha de Recuperación</Label>
          <Input
            id="recovery-date"
            type="date"
            value={recoveryDate}
            onChange={(e) => setRecoveryDate(e.target.value)}
          />
        </div>

        {/* Modules Checklist */}
        <div className="space-y-2">
          <Label>Módulos a Recuperar</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selectedModules.size === MODULES.length) {
                setSelectedModules(new Set());
              } else {
                const allModules = new Set(MODULES.map(m => m.id));
                setSelectedModules(allModules);
              }
            }}
            className="mb-4"
          >
            {selectedModules.size === MODULES.length ? "Deseleccionar Todo" : "Seleccionar Todo"}
          </Button>

          <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
            {MODULES.map((module) => renderModule(module))}
          </div>
        </div>

        {/* Process Selector (if Processes module is selected) */}
        {selectedModules.has("processes") && selectedCompanyId && (
          <div className="mt-4 border-t pt-4">
            <h3 className="font-semibold mb-3">Selector de Procesos</h3>
            <ProcessSelector
              companyId={selectedCompanyId}
              selectedProcesses={selectedProcesses}
              onProcessesChange={setSelectedProcesses}
            />
          </div>
        )}

        {/* Debug info */}
        {selectedModules.has("processes") && (
          <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-100 rounded">
            Debug: Procesos seleccionado={selectedModules.has("processes") ? "sí" : "no"}, Empresa={selectedCompanyId || "ninguna"}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <Button 
            onClick={handleRecover} 
            disabled={logRecoveryMutation.isPending}
            className="flex-1"
          >
            {logRecoveryMutation.isPending ? "Procesando..." : "Iniciar Recuperación"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedCompanyId(null);
              setRecoveryDate("");
              setSelectedModules(new Set());
              setSelectedProcesses(new Map());
            }}
          >
            Limpiar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
