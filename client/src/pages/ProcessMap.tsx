import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Plus, Trash2, ChevronRight, AlertCircle, CheckCircle, Upload, Download, Eye, EyeOff, Pencil } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useSearch } from "wouter";
import { getAxisBackPathForRole } from "@/lib/sessionScope";

type ProcessType = "estrategico" | "misional" | "soporte";

export default function ProcessMap() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const { isManagerLogin, managerCompanyId } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  
  // Check if this is being accessed by a manager
  const urlParams = new URLSearchParams(search);
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null;
  
  // Check if user is a process leader
  const isProcessLeader = !!processLeaderSession;
  const processIdFromUrl = urlParams.get('processId') ? parseInt(urlParams.get('processId')!) : null;
  
  // Back button handler
  const handleBack = () => {
    setLocation(getAxisBackPathForRole());
  };
  // Declare state variables
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [newProcessName, setNewProcessName] = useState("");
  const [newProcessType, setNewProcessType] = useState<ProcessType>("misional");
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [mapImageFileName, setMapImageFileName] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [editingProcessId, setEditingProcessId] = useState<number | null>(null);
  const [editingProcessName, setEditingProcessName] = useState("");

  // Fetch user's companies (only if not manager login)
  const userCompaniesQuery = trpc.adminOperations.getUserCompanies.useQuery(
    { accountId: user?.id || 0 },
    { enabled: !!user?.id && !isManagerLogin }
  );

  // Get company name when manager login
  const managerCompanyQuery = trpc.adminOperations.getCompanyById.useQuery(
    { companyId: managerCompanyId || 0 },
    { enabled: isManagerLogin && !!managerCompanyId }
  );

  // Get company from manager context or localStorage
  useEffect(() => {
    // If process leader, use process leader company ID
    if (isProcessLeader && processLeaderSession?.companyId) {
      console.log("[ProcessMap] Process leader detected, companyId:", processLeaderSession.companyId);
      setCompanyId(processLeaderSession.companyId);
      setCompanyName(processLeaderSession.companyName || "Empresa");
      return;
    }

    // If manager login, use manager company ID
    if (isManagerLogin && managerCompanyId) {
      console.log("[ProcessMap] Manager login detected, managerCompanyId:", managerCompanyId);
      console.log("[ProcessMap] managerCompanyQuery.data:", managerCompanyQuery.data);
      setCompanyId(managerCompanyId);
      if (managerCompanyQuery.data) {
        console.log("[ProcessMap] Setting company name:", managerCompanyQuery.data.name);
        setCompanyName(managerCompanyQuery.data.name);
        localStorage.setItem("selectedCompanyId", managerCompanyId.toString());
        localStorage.setItem("selectedCompanyName", managerCompanyQuery.data.name);
      }
      return;
    }

    // Otherwise use OAuth user companies
    if (!userCompaniesQuery.data || userCompaniesQuery.data.length === 0) {
      return; // Wait for user companies to load
    }

    const stored = localStorage.getItem("selectedCompanyId");
    const storedName = localStorage.getItem("selectedCompanyName");
    
    if (stored) {
      const companyIdNum = parseInt(stored);
      // Validate that the stored company ID is in the user's companies
      const hasAccess = userCompaniesQuery.data.some(c => c.id === companyIdNum);
      
      if (hasAccess) {
        setCompanyId(companyIdNum);
        setCompanyName(storedName || "Empresa");
      } else {
        // User doesn't have access to the stored company, use first company
        const userCompany = userCompaniesQuery.data[0];
        setCompanyId(userCompany.id);
        setCompanyName(userCompany.name);
        localStorage.setItem("selectedCompanyId", userCompany.id.toString());
        localStorage.setItem("selectedCompanyName", userCompany.name);
      }
    } else {
      // Auto-select user's first company if not already selected
      const userCompany = userCompaniesQuery.data[0];
      setCompanyId(userCompany.id);
      setCompanyName(userCompany.name);
      localStorage.setItem("selectedCompanyId", userCompany.id.toString());
      localStorage.setItem("selectedCompanyName", userCompany.name);
    }
  }, [userCompaniesQuery.data, isManagerLogin, managerCompanyId, isProcessLeader, processLeaderSession, managerCompanyQuery.data]);

  const {
    data: mapImageData,
    refetch: refetchMapImage,
    isLoading: isLoadingMapImage,
  } = trpc.processMap.getMapImage.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId !== null }
  );

  useEffect(() => {
    if (!companyId || isLoadingMapImage) return;
    if (mapImageData?.fileUrl) {
      setMapImage(mapImageData.fileUrl);
      setMapImageFileName(mapImageData.fileName);
    } else {
      setMapImage(null);
      setMapImageFileName(null);
    }
  }, [mapImageData, companyId, isLoadingMapImage]);

  const uploadMapImageMutation = trpc.processMap.uploadMapImage.useMutation({
    onSuccess: (result) => {
      setMapImage(result.fileUrl);
      setMapImageFileName(result.fileName);
      refetchMapImage();
      toast.success("Imagen del Mapa de Procesos cargada exitosamente");
    },
    onError: (error) => {
      toast.error(error.message || "Error al cargar la imagen");
    },
  });

  const deleteMapImageMutation = trpc.processMap.deleteMapImage.useMutation({
    onSuccess: () => {
      setMapImage(null);
      setMapImageFileName(null);
      refetchMapImage();
      toast.success("Imagen eliminada");
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar la imagen");
    },
  });

  // Fetch processes from database
  // Jefe de Proceso: filtrar por processId (de URL o de su sesión) para mostrar solo su proceso
  // Gerente/Admin: sin filtro de processId para ver todos los procesos
  const processLeaderEmail = !isManagerLogin && !processIdFromUrl && !isProcessLeader && typeof window !== 'undefined' ? localStorage.getItem("processLeaderEmail") : null;
  // Si es Jefe, usar el processId de la URL o el de su sesión como filtro
  const filterProcessId = isProcessLeader 
    ? (processIdFromUrl || processLeaderSession?.processId || undefined)
    : undefined;
  const { data: processes = [], isLoading, refetch } = trpc.processMap.list.useQuery(
    { 
      companyId: companyId || 0, 
      processLeaderEmail: processLeaderEmail || undefined,
      filterProcessId: filterProcessId
    },
    { enabled: companyId !== null }
  );

  // Get user's assigned processes if they are a Process Owner
  const userAssignedProcessesQuery = trpc.hierarchicalAccess.processOwners.getByUser.useQuery(
    { userId: user?.id || 0 },
    { enabled: !!user?.id }
  );

  // Filter processes based on user role
  const filteredProcesses = processes.filter(process => {
    if (userAssignedProcessesQuery.data && userAssignedProcessesQuery.data.length > 0) {
      const assignedProcessIds = userAssignedProcessesQuery.data.map(po => po.processId);
      return assignedProcessIds.includes(process.id);
    }
    return true;
  });

  // Create process mutation
  const createMutation = trpc.processMap.create.useMutation({
    onSuccess: () => {
      toast.success("Proceso creado exitosamente");
      setNewProcessName("");
      setNewProcessType("misional");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al crear el proceso");
    },
  });

  const renameMutation = trpc.processMap.rename.useMutation({
    onSuccess: () => {
      toast.success("Nombre del proceso actualizado");
      setEditingProcessId(null);
      setEditingProcessName("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "No se pudo actualizar el nombre del proceso");
    },
  });

  // Delete process mutation
  const deleteMutation = trpc.processMap.delete.useMutation({
    onSuccess: () => {
      toast.success("Proceso eliminado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar el proceso");
    },
  });

  const handleAddProcess = async () => {
    if (!newProcessName.trim()) {
      toast.error("Por favor ingresa un nombre para el proceso");
      return;
    }

    if (!companyId) return;

    await createMutation.mutateAsync({
      companyId,
      name: newProcessName,
      processType: newProcessType,
      description: "",
    });
  };

  const handleDeleteProcess = async (processId: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este proceso?")) {
      await deleteMutation.mutateAsync({ processId });
    }
  };

  const startRenamingProcess = (processId: number, name: string) => {
    setEditingProcessId(processId);
    setEditingProcessName(name);
  };

  const saveProcessName = async (processId: number, currentName: string) => {
    if (editingProcessId !== processId || renameMutation.isPending) return;

    const name = editingProcessName.trim();
    if (!name) {
      toast.error("El nombre del proceso no puede quedar vacío");
      setEditingProcessName(currentName);
      return;
    }

    if (name === currentName) {
      setEditingProcessId(null);
      setEditingProcessName("");
      return;
    }

    if (!companyId) return;
    await renameMutation.mutateAsync({ companyId, processId, name });
  };

  const renderProcessRow = (
    process: (typeof processes)[number],
    typeLabel: string,
    styles: { border: string; background: string; hover: string; title: string; subtitle: string }
  ) => (
    <div
      key={process.id}
      className={`flex items-center justify-between p-3 border ${styles.border} ${styles.background} rounded-lg ${styles.hover} transition`}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={() => handleDeleteProcess(process.id)}
        aria-label={`Eliminar ${process.name}`}
      >
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => startRenamingProcess(process.id, process.name)}
        aria-label={`Editar nombre de ${process.name}`}
        title="Editar nombre"
      >
        <Pencil className="h-4 w-4 text-slate-600" />
      </Button>
      <div className="flex-1 px-2 min-w-0">
        {editingProcessId === process.id ? (
          <Input
            autoFocus
            value={editingProcessName}
            onChange={(event) => setEditingProcessName(event.target.value)}
            onBlur={() => void saveProcessName(process.id, process.name)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setEditingProcessId(null);
                setEditingProcessName("");
              }
            }}
            disabled={renameMutation.isPending}
            aria-label="Nombre del proceso"
            className="h-8 bg-white"
          />
        ) : (
          <p className={`font-medium ${styles.title} truncate`}>{process.name}</p>
        )}
        <p className={`text-xs ${styles.subtitle}`}>{typeLabel}</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => handleAccessProcess(process.id)}
        aria-label={`Abrir ${process.name}`}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  const isDisplayableImage = (fileName: string | null) => {
    if (!fileName) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
  };

  const isPdf = (fileName: string | null) => {
    if (!fileName) return false;
    return /\.pdf$/i.test(fileName);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    setIsUploadingImage(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      await uploadMapImageMutation.mutateAsync({
        companyId,
        fileName: file.name,
        fileData: Array.from(uint8Array),
        fileType: file.type || "application/octet-stream",
      });
    } catch {
      // Error toast handled by mutation
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleDownloadImage = () => {
    if (!mapImage) return;
    // Open in new tab — browser will display images inline and download Excel/PDF
    window.open(mapImage, "_blank", "noopener,noreferrer");
    toast.success("Abriendo archivo...");
  };

  const handleDeleteMapImage = async () => {
    if (!companyId) return;
    await deleteMapImageMutation.mutateAsync({ companyId });
  };

  const handleAccessProcess = (processId: number) => {
    localStorage.setItem("selectedProcessId", processId.toString());
    setLocation("/process-characterization");
  };

  const strategicProcesses = filteredProcesses.filter(p => p.processType === "estrategico");
  const misionalProcesses = filteredProcesses.filter(p => p.processType === "misional");
  const supportProcesses = filteredProcesses.filter(p => p.processType === "soporte");

  if (!companyId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">
              Por favor, selecciona una empresa primero desde el Dashboard
            </p>
            <Button
              className="w-full mt-4"
              onClick={() => setLocation(getAxisBackPathForRole())}
            >
              Volver al Dashboard
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Mapa de Procesos</h1>
            <p className="text-slate-600 mt-2">Visualiza y gestiona los procesos empresariales de {companyName}</p>
          </div>
            <Button
              variant="outline"
              onClick={handleBack}
            >
              ← Volver
            </Button>
        </div>

        {/* Sección de Imagen del Mapa de Procesos — diseño compacto */}
        <div className="border border-purple-200 bg-purple-50 rounded-xl px-4 py-3">
          {/* Fila compacta: título + 3 botones */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Upload size={16} className="text-purple-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">Imagen del Mapa de Procesos</p>
                {mapImageFileName ? (
                  <p className="text-xs text-slate-500 truncate max-w-xs">{mapImageFileName}</p>
                ) : (
                  <p className="text-xs text-slate-400">Sin archivo subido</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Input oculto para subir */}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleImageUpload}
                disabled={isUploadingImage}
                className="hidden"
                id="map-image-input"
              />
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={isUploadingImage || uploadMapImageMutation.isPending}
                className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                <label htmlFor="map-image-input" className="cursor-pointer">
                  <Upload size={14} />
                  {isUploadingImage ? "Subiendo..." : "Subir Mapa"}
                </label>
              </Button>
              <span className="text-xs text-slate-400 hidden sm:inline">PDF, PNG o JPG</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (mapImage && isPdf(mapImageFileName)) {
                    window.open(mapImage, "_blank", "noopener,noreferrer");
                  } else {
                    setShowMap(!showMap);
                  }
                }}
                disabled={!mapImage}
                className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-100 disabled:opacity-40"
              >
                {(!isPdf(mapImageFileName) && showMap) ? <EyeOff size={14} /> : <Eye size={14} />}
                {(!isPdf(mapImageFileName) && showMap) ? "Ocultar Mapa" : "Ver Mapa"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteMapImage}
                disabled={!mapImage || deleteMapImageMutation.isPending}
                className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={14} />
                Eliminar Mapa
              </Button>
            </div>
          </div>
        </div>

        {/* Visor expandible — fuera del div compacto para evitar error React DOM */}
        {showMap && mapImage && (
          <div className="rounded-xl border border-purple-200 bg-white overflow-hidden shadow-sm">
            {isDisplayableImage(mapImageFileName) ? (
              <img
                src={mapImage}
                alt="Mapa de Procesos"
                className="w-full object-contain max-h-[70vh]"
              />
            ) : isPdf(mapImageFileName) ? (
              <iframe
                src={mapImage}
                title="Mapa de Procesos PDF"
                className="w-full"
                style={{ height: '75vh', border: 'none' }}
              />
            ) : (
              <div className="p-8 text-center bg-purple-50 rounded-xl border-2 border-dashed border-purple-200">
                <div className="text-4xl mb-3">📊</div>
                <p className="font-semibold text-slate-800 mb-1 text-lg">Archivo cargado</p>
                <p className="font-medium text-slate-600 mb-2 text-sm">{mapImageFileName}</p>
                <p className="text-sm text-slate-500 mb-4">Este tipo de archivo no se puede previsualizar directamente en el navegador.<br/>Haz clic en el botón para abrirlo o descargarlo.</p>
                <Button onClick={handleDownloadImage} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                  <Download size={16} /> Abrir Mapa de Procesos
                </Button>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-slate-600">Cargando procesos...</p>
            </CardContent>
          </Card>
        ) : processes.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-slate-600">No hay procesos registrados. Crea uno para comenzar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Procesos Estratégicos */}
            {strategicProcesses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Procesos Estratégicos ({strategicProcesses.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {strategicProcesses.map((process) =>
                      renderProcessRow(process, "Estratégico", {
                        border: "border-blue-200",
                        background: "bg-blue-50",
                        hover: "hover:bg-blue-100",
                        title: "text-blue-900",
                        subtitle: "text-blue-700",
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Procesos Misionales */}
            {misionalProcesses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Procesos Misionales ({misionalProcesses.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {misionalProcesses.map((process) =>
                      renderProcessRow(process, "Misional", {
                        border: "border-green-200",
                        background: "bg-green-50",
                        hover: "hover:bg-green-100",
                        title: "text-green-900",
                        subtitle: "text-green-700",
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Procesos de Soporte */}
            {supportProcesses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Procesos de Soporte ({supportProcesses.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {supportProcesses.map((process) =>
                      renderProcessRow(process, "Soporte", {
                        border: "border-orange-200",
                        background: "bg-orange-50",
                        hover: "hover:bg-orange-100",
                        title: "text-orange-900",
                        subtitle: "text-orange-700",
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Agregar nuevo proceso */}
        <Card className="border-2 border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-lg">Agregar Nuevo Proceso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nombre del Proceso</label>
                <Input
                  placeholder="Ej: Ventas, Compras, etc."
                  value={newProcessName}
                  onChange={(e) => setNewProcessName(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Tipo de Proceso</label>
                <select
                  value={newProcessType}
                  onChange={(e) => setNewProcessType(e.target.value as ProcessType)}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="estrategico">Estratégico</option>
                  <option value="misional">Misional</option>
                  <option value="soporte">Soporte</option>
                </select>
              </div>
              <Button
                onClick={handleAddProcess}
                disabled={createMutation.isPending}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createMutation.isPending ? "Creando..." : "Crear Proceso"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
