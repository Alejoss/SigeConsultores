import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, Check, Download } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { exportSubprocessMapToPDF } from "@/lib/exportSubprocessMapToPDF";

// Auto-expand textarea al escribir
const autoExpandTextarea = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 48) + 'px';
};

interface EntradaRow {
  id: number;
  partesInteresadas: string;
  internoExterno: string;
  clienteProveedor: string;
  necesidades: string;
  solicita: string;
  entrega: string;
}

interface SubprocesosRow {
  id: number;
  acciones: string;
  subproceso: string;
}

interface SalidaRow {
  id: number;
  salidas: string;
  entregables: string;
  doc: string;
}

export default function SubprocessMap() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null || isManagerLogin;
  const [processId, setProcessId] = useState<number | null>(() => {
    // For Process Leaders: Try to get from URL params first
    if (isProcessLeader) {
      const urlParams = new URLSearchParams(search);
      const urlProcessId = urlParams.get('processId');
      if (urlProcessId) return parseInt(urlProcessId);
      // Will be set from session when it loads
      return null;
    }
    // For Managers: Get from localStorage
    const stored = localStorage.getItem("selectedProcessId");
    return stored ? parseInt(stored) : null;
  });
  const [processName, setProcessName] = useState(() => {
    // For Process Leaders: Will be set when session loads
    if (isProcessLeader) {
      return "Proceso";
    }
    // For Managers: Get from localStorage
    return localStorage.getItem("selectedProcessName") || "Proceso";
  });
  const { isLoading: contextLoading } = useProcessLeaderAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update processId and processName when Process Leader session loads
  useEffect(() => {
    if (isProcessLeader && processLeaderSession && !contextLoading) {
      if (processLeaderSession.processId) {
        setProcessId(processLeaderSession.processId);
      }
      if (processLeaderSession.processName) {
        setProcessName(processLeaderSession.processName);
      }
    }
  }, [isProcessLeader, processLeaderSession, contextLoading]);
  
  const [data, setData] = useState({
    entrada: [{ id: 1, partesInteresadas: "", internoExterno: "", clienteProveedor: "", necesidades: "", solicita: "", entrega: "" }],
    subprocesos: [{ id: 1, acciones: "", subproceso: "" }],
    salida: [{ id: 1, salidas: "", entregables: "", doc: "" }],
  });

  // Fetch subprocess map data
  const { data: subprocessMapData } = trpc.subprocessMap.get.useQuery(
    { processId: processId || 0 },
    { enabled: !!processId && !contextLoading }
  );

  // Load data from database when available
  useEffect(() => {
    // Wait for context to load for Process Leaders
    if (isProcessLeader && contextLoading) {
      return;
    }
    
    if (subprocessMapData) {
      try {
        let entrada = subprocessMapData.entrada ? JSON.parse(subprocessMapData.entrada) : data.entrada;
        const subprocesos = subprocessMapData.subprocesos ? JSON.parse(subprocessMapData.subprocesos) : data.subprocesos;
        const salida = subprocessMapData.salida ? JSON.parse(subprocessMapData.salida) : data.salida;
        
        // Asegurar que cada fila de entrada tiene los campos solicita y entrega
        entrada = entrada.map((row: any) => ({
          ...row,
          solicita: row.solicita || "",
          entrega: row.entrega || "",
        }));
        
        setData({ entrada, subprocesos, salida });
      } catch (error) {
        console.error("Error parsing subprocess map data:", error);
      }
    }
    setIsLoading(false);
  }, [subprocessMapData, isProcessLeader, contextLoading]);

  // Get utils for query invalidation
  const utils = trpc.useUtils();

  // Update subprocess map mutation
  const updateMutation = trpc.subprocessMap.upsert.useMutation({
    onSuccess: () => {
      setLastSaved(new Date());
      setIsSaving(false);
      utils.subprocessMap.get.invalidate();
    },
    onError: (error) => {
      setIsSaving(false);
      toast.error(error.message || "Error al guardar el mapa");
    },
  });

  // Validar que una fila no esté completamente vacía
  const isRowEmpty = (row: any): boolean => {
    if (row.partesInteresadas !== undefined) {
      // Entrada row
      return !row.partesInteresadas?.trim() && !row.internoExterno?.trim() && !row.clienteProveedor?.trim() && !row.necesidades?.trim() && !row.solicita?.trim() && !row.entrega?.trim();
    } else if (row.acciones !== undefined) {
      // Subprocesos row
      return !row.acciones?.trim() && !row.responsable?.trim() && !row.tiempoEstimado?.trim();
    } else if (row.salidas !== undefined) {
      // Salida row
      return !row.salidas?.trim() && !row.entregables?.trim() && !row.doc?.trim();
    }
    return false;
  };

  // Validar que no haya filas vacías
  const validateData = (): boolean => {
    for (const row of data.entrada) {
      if (isRowEmpty(row)) {
        toast.error("No se puede guardar: hay filas vacías en Entrada. Completa o elimina las filas vacías.");
        return false;
      }
    }
    for (const row of data.subprocesos) {
      if (isRowEmpty(row)) {
        toast.error("No se puede guardar: hay filas vacías en Subprocesos. Completa o elimina las filas vacías.");
        return false;
      }
    }
    for (const row of data.salida) {
      if (isRowEmpty(row)) {
        toast.error("No se puede guardar: hay filas vacías en Salida. Completa o elimina las filas vacías.");
        return false;
      }
    }
    return true;
  };

  // Guardar automáticamente con debounce
  const autoSave = () => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      if (!validateData()) return;
      if (!processId) return;
      
      // Combinar solicita y entrega en el campo necesidades
      const necesidadesText = data.entrada
        .map((row) => {
          const parts = [];
          if (row.solicita?.trim()) parts.push(`Solicita: ${row.solicita}`);
          if (row.entrega?.trim()) parts.push(`Entrega: ${row.entrega}`);
          return parts.join('\n');
        })
        .filter(text => text.trim())
        .join('\n---\n');
      
      setIsSaving(true);
      updateMutation.mutate({
        processId,
        entrada: JSON.stringify(data.entrada),
        necesidades: necesidadesText,
        subprocesos: JSON.stringify(data.subprocesos),
        salida: JSON.stringify(data.salida),
      });
    }, 1000);
  }

  const handleSave = () => {
    if (!validateData()) return;
    if (!processId) return;
    
    // Combinar solicita y entrega en el campo necesidades
    const necesidadesText = data.entrada
      .map((row) => {
        const parts = [];
        if (row.solicita?.trim()) parts.push(`Solicita: ${row.solicita}`);
        if (row.entrega?.trim()) parts.push(`Entrega: ${row.entrega}`);
        return parts.join('\n');
      })
      .filter(text => text.trim())
      .join('\n---\n');
    
    setIsSaving(true);
    updateMutation.mutate({
      processId,
      entrada: JSON.stringify(data.entrada),
      necesidades: necesidadesText,
      subprocesos: JSON.stringify(data.subprocesos),
      salida: JSON.stringify(data.salida),
    });
  };

  const addRow = (section: "entrada" | "subprocesos" | "salida") => {
    const newData = { ...data };
    const newId = Math.max(...newData[section].map((r: any) => r.id), 0) + 1;
    
    if (section === "entrada") {
      (newData.entrada as EntradaRow[]).push({ id: newId, partesInteresadas: "", internoExterno: "", clienteProveedor: "", necesidades: "", solicita: "", entrega: "" });
    } else if (section === "subprocesos") {
      (newData.subprocesos as SubprocesosRow[]).push({ id: newId, acciones: "", subproceso: "" });
    } else {
      (newData.salida as SalidaRow[]).push({ id: newId, salidas: "", entregables: "", doc: "" });
    }
    
    setData(newData);
    autoSave();
  };

  const deleteRow = (section: "entrada" | "subprocesos" | "salida", id: number) => {
    const newData = { ...data };
    if (section === "entrada" && newData.entrada.length > 1) {
      newData.entrada = newData.entrada.filter(r => r.id !== id);
    } else if (section === "subprocesos" && newData.subprocesos.length > 1) {
      newData.subprocesos = newData.subprocesos.filter(r => r.id !== id);
    } else if (section === "salida" && newData.salida.length > 1) {
      newData.salida = newData.salida.filter(r => r.id !== id);
    }
    setData(newData);
    autoSave();
  };

  const updateField = (section: "entrada" | "subprocesos" | "salida", id: number, field: string, value: string) => {
    const newData = { ...data };
    if (section === "entrada") {
      const row = newData.entrada.find(r => r.id === id);
      if (row) (row as any)[field] = value;
    } else if (section === "subprocesos") {
      const row = newData.subprocesos.find(r => r.id === id);
      if (row) (row as any)[field] = value;
    } else {
      const row = newData.salida.find(r => r.id === id);
      if (row) (row as any)[field] = value;
    }
    setData(newData);
    autoSave();
  };

  if (isLoading || (isProcessLeader && contextLoading)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-slate-600">Cargando Mapa de Subprocesos...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-900">MAPA DE SUBPROCESOS</h1>
          <p className="text-slate-600 mt-2">Proceso: <strong>{processName}</strong></p>
          {lastSaved && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <Check size={12} /> Guardado automáticamente a las {lastSaved.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Save size={16} />
            {isSaving ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            onClick={() => {
              const exportData = {
                entrada: data.entrada.map(row => ({
                  entrada: row.solicita,
                  subproceso: row.partesInteresadas,
                  salida: row.entrega
                })),
                subprocesos: data.subprocesos.map(row => ({
                  entrada: row.acciones,
                  subproceso: row.subproceso,
                  salida: ''
                })),
                salida: data.salida.map(row => ({
                  entrada: row.salidas,
                  subproceso: row.entregables,
                  salida: row.doc
                }))
              };
              exportSubprocessMapToPDF(exportData, processName);
              toast.success('PDF exportado correctamente');
            }}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <Download size={16} />
            Exportar a PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // Always go back to process characterization
              setLocation("/process-characterization");
            }}
            className="gap-2"
          >
            <ArrowLeft size={16} />
            VOLVER
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ENTRADA */}
        <div>
          <div className="bg-green-500 text-white font-bold p-3 text-center rounded-t-lg">
            ENTRADA
          </div>
          <div className="border border-green-500 rounded-b-lg overflow-hidden space-y-3 p-3">
            {data.entrada.map((row, index) => (
              <div key={row.id} className="space-y-2 border border-green-300 p-3 rounded bg-green-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-slate-700">Fila {index + 1}</span>
                  {data.entrada.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRow("entrada", row.id)}
                      className="text-red-600 hover:text-red-700 h-6 w-6 p-0"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-green-700 block mb-1">Partes interesadas</label>
                  <Textarea
                    placeholder="Ingrese partes interesadas"
                    value={row.partesInteresadas}
                    onChange={(e) => { updateField("entrada", row.id, "partesInteresadas", e.target.value); autoExpandTextarea(e.target); }}
                    onInput={(e) => autoExpandTextarea(e.currentTarget)}
                    className="text-xs min-h-12 resize-none overflow-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-green-700 block mb-1">Interno/Externo</label>
                  <select
                    value={row.internoExterno}
                    onChange={(e) => updateField("entrada", row.id, "internoExterno", e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                  >
                    <option value="">Selecciona Interno/Externo</option>
                    <option value="Interno">Interno</option>
                    <option value="Externo">Externo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-green-700 block mb-1">Cliente/Proveedor</label>
                  <select
                    value={row.clienteProveedor}
                    onChange={(e) => updateField("entrada", row.id, "clienteProveedor", e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                  >
                    <option value="">Selecciona Cliente/Proveedor</option>
                    <option value="Cliente">Cliente</option>
                    <option value="Proveedor">Proveedor</option>
                  </select>
                </div>
                <div className="border border-green-300 p-3 rounded bg-green-100">
                  <label className="text-xs font-semibold text-green-700 block mb-2">Necesidades y Expectativas</label>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-semibold text-green-700 block mb-1">Solicita:</label>
                      <Textarea
                        placeholder="Ingrese solicitud"
                        value={row.solicita}
                        onChange={(e) => { updateField("entrada", row.id, "solicita", e.target.value); autoExpandTextarea(e.target); }}
                        onInput={(e) => autoExpandTextarea(e.currentTarget)}
                        className="text-xs min-h-12 resize-none overflow-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-green-700 block mb-1">Entrega:</label>
                      <Textarea
                        placeholder="Ingrese entrega"
                        value={row.entrega}
                        onChange={(e) => { updateField("entrada", row.id, "entrega", e.target.value); autoExpandTextarea(e.target); }}
                        onInput={(e) => autoExpandTextarea(e.currentTarget)}
                        className="text-xs min-h-12 resize-none overflow-hidden"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => addRow("entrada")}
              className="w-full gap-2 text-green-700 border-green-300 hover:bg-green-50"
            >
              <Plus size={16} />
              Agregar Fila
            </Button>
          </div>
        </div>

        {/* SUBPROCESOS */}
        <div>
          <div className="bg-blue-500 text-white font-bold p-3 text-center rounded-t-lg">
            SUBPROCESOS
          </div>
          <div className="border border-blue-500 rounded-b-lg overflow-hidden space-y-3 p-3">
            {data.subprocesos.map((row, index) => (
              <div key={row.id} className="space-y-2 border border-blue-300 p-3 rounded bg-blue-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-slate-700">Fila {index + 1}</span>
                  {data.subprocesos.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRow("subprocesos", row.id)}
                      className="text-red-600 hover:text-red-700 h-6 w-6 p-0"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-blue-700 block mb-1">Acciones</label>
                  <Textarea
                    placeholder="Ingrese acciones"
                    value={row.acciones}
                    onChange={(e) => { updateField("subprocesos", row.id, "acciones", e.target.value); autoExpandTextarea(e.target); }}
                    onInput={(e) => autoExpandTextarea(e.currentTarget)}
                    className="text-xs min-h-12 resize-none overflow-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-blue-700 block mb-1">Subproceso</label>
                  <Textarea
                    placeholder="Ingrese subproceso"
                    value={row.subproceso}
                    onChange={(e) => { updateField("subprocesos", row.id, "subproceso", e.target.value); autoExpandTextarea(e.target); }}
                    onInput={(e) => autoExpandTextarea(e.currentTarget)}
                    className="text-xs min-h-12 resize-none overflow-hidden"
                  />
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => addRow("subprocesos")}
              className="w-full gap-2 text-blue-700 border-blue-300 hover:bg-blue-50"
            >
              <Plus size={16} />
              Agregar Fila
            </Button>
          </div>
        </div>

        {/* SALIDA */}
        <div>
          <div className="bg-orange-500 text-white font-bold p-3 text-center rounded-t-lg">
            SALIDA
          </div>
          <div className="border border-orange-500 rounded-b-lg overflow-hidden space-y-3 p-3">
            {data.salida.map((row, index) => (
              <div key={row.id} className="space-y-2 border border-orange-300 p-3 rounded bg-orange-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-slate-700">Fila {index + 1}</span>
                  {data.salida.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRow("salida", row.id)}
                      className="text-red-600 hover:text-red-700 h-6 w-6 p-0"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-orange-700 block mb-1">Salidas</label>
                  <Textarea
                    placeholder="Ingrese salidas"
                    value={row.salidas}
                    onChange={(e) => { updateField("salida", row.id, "salidas", e.target.value); autoExpandTextarea(e.target); }}
                    onInput={(e) => autoExpandTextarea(e.currentTarget)}
                    className="text-xs min-h-12 resize-none overflow-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-orange-700 block mb-1">Entregables</label>
                  <Textarea
                    placeholder="Ingrese entregables"
                    value={row.entregables}
                    onChange={(e) => { updateField("salida", row.id, "entregables", e.target.value); autoExpandTextarea(e.target); }}
                    onInput={(e) => autoExpandTextarea(e.currentTarget)}
                    className="text-xs min-h-12 resize-none overflow-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-orange-700 block mb-1">Documentación</label>
                  <Textarea
                    placeholder="Ingrese documentación"
                    value={row.doc}
                    onChange={(e) => { updateField("salida", row.id, "doc", e.target.value); autoExpandTextarea(e.target); }}
                    onInput={(e) => autoExpandTextarea(e.currentTarget)}
                    className="text-xs min-h-12 resize-none overflow-hidden"
                  />
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => addRow("salida")}
              className="w-full gap-2 text-orange-700 border-orange-300 hover:bg-orange-50"
            >
              <Plus size={16} />
              Agregar Fila
            </Button>
          </div>
        </div>
      </div>


    </div>
  );
}
