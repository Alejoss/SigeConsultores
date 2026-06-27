import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Plus, Trash2, ChevronRight, AlertCircle, CheckCircle, Upload, Download } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useSearch } from "wouter";
import { getAxisBackPath } from "@/lib/sessionScope";

type ProcessType = "estrategico" | "misional" | "soporte";

export default function ProcessMap() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const { isManagerLogin, managerCompanyId } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  
  // Check if this is being accessed by a manager
  const urlParams = new URLSearchParams(search);
  const isManagerAccess = urlParams.get('isManager') === 'true';
  
  // Check if user is a process leader
  const isProcessLeader = !!processLeaderSession;
  const processIdFromUrl = urlParams.get('processId') ? parseInt(urlParams.get('processId')!) : null;
  
  // Back button handler
  const handleBack = () => {
    console.log("[DEBUG] ProcessMap handleBack:", { isProcessLeader, isManagerAccess, isManagerLogin });
    if (isProcessLeader) {
      setLocation('/process-leader-dashboard');
    } else if (isManagerLogin || isManagerAccess) {
      setLocation(getAxisBackPath('/manager-dashboard'));
    } else {
      setLocation('/dashboard');
    }
  };
  // Declare state variables
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [newProcessName, setNewProcessName] = useState("");
  const [newProcessType, setNewProcessType] = useState<ProcessType>("misional");
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [mapImageFileName, setMapImageFileName] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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
  // If processId is in URL (process leader access), only fetch that process
  // Otherwise, use processLeaderEmail if user is NOT a manager
  const processLeaderEmail = !isManagerLogin && !processIdFromUrl && typeof window !== 'undefined' ? localStorage.getItem("processLeaderEmail") : null;
  const { data: processes = [], isLoading, refetch } = trpc.processMap.list.useQuery(
    { 
      companyId: companyId || 0, 
      processLeaderEmail: processLeaderEmail || undefined,
      filterProcessId: processIdFromUrl || undefined
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

  const isDisplayableImage = (fileName: string | null) => {
    if (!fileName) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
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

    const link = document.createElement("a");
    link.href = mapImage;
    link.download = mapImageFileName || "mapa-procesos";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Descargando archivo...");
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
              onClick={() => setLocation(isProcessLeader ? "/process-leader-dashboard" : (isManagerAccess ? "/manager-dashboard" : "/dashboard"))}
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

        {/* Sección de Imagen del Mapa de Procesos */}
        <Card className="border-2 border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="text-lg">Imagen del Mapa de Procesos</CardTitle>
            <CardDescription>Sube una imagen o archivo Excel del mapa de procesos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoadingMapImage ? (
                <p className="text-center text-slate-600 py-4">Cargando mapa de procesos...</p>
              ) : mapImage ? (
                <div className="space-y-4">
                  {isDisplayableImage(mapImageFileName) ? (
                    <div
                      onDoubleClick={handleDownloadImage}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      title="Haz doble clic para descargar"
                    >
                      <img
                        src={mapImage}
                        alt="Mapa de Procesos"
                        className="w-full max-h-96 object-contain border border-gray-300 rounded"
                      />
                    </div>
                  ) : (
                    <div className="border border-gray-300 rounded-lg p-6 text-center bg-white">
                      <p className="font-medium text-slate-800">{mapImageFileName}</p>
                      <p className="text-sm text-slate-500 mt-2">
                        Archivo guardado en el servidor. Usa descargar para abrirlo.
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleDownloadImage}
                      className="flex-1 gap-2"
                    >
                      <Download size={16} />
                      Descargar Archivo
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDeleteMapImage}
                      disabled={deleteMapImageMutation.isPending}
                      className="flex-1"
                    >
                      Eliminar Imagen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-purple-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 mx-auto text-purple-400 mb-4" />
                  <p className="text-slate-600 mb-4">Arrastra una imagen o haz clic para seleccionar</p>
                  <input
                    type="file"
                    accept="image/*,.xlsx,.xls"
                    onChange={handleImageUpload}
                    disabled={isUploadingImage}
                    className="hidden"
                    id="map-image-input"
                  />
                  <div className="space-y-2">
                    <Button
                      asChild
                      disabled={isUploadingImage || uploadMapImageMutation.isPending}
                    >
                      <label htmlFor="map-image-input" className="cursor-pointer">
                        {isUploadingImage ? "Cargando..." : "Seleccionar Archivo"}
                      </label>
                    </Button>
                    <p className="text-xs text-slate-500 text-center">Soporta imágenes (PNG, JPG, etc.)</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
                    {strategicProcesses.map((process) => (
                      <div
                        key={process.id}
                        className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-blue-900">{process.name}</p>
                          <p className="text-xs text-blue-700">Estratégico</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteProcess(process.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAccessProcess(process.id)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Procesos Misionales */
            {misionalProcesses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Procesos Misionales ({misionalProcesses.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {misionalProcesses.map((process) => (
                      <div
                        key={process.id}
                        className="flex items-center justify-between p-3 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 transition"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-green-900">{process.name}</p>
                          <p className="text-xs text-green-700">Misional</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteProcess(process.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAccessProcess(process.id)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Procesos de Soporte */
            {supportProcesses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Procesos de Soporte ({supportProcesses.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {supportProcesses.map((process) => (
                      <div
                        key={process.id}
                        className="flex items-center justify-between p-3 border border-orange-200 bg-orange-50 rounded-lg hover:bg-orange-100 transition"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-orange-900">{process.name}</p>
                          <p className="text-xs text-orange-700">Soporte</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteProcess(process.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAccessProcess(process.id)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
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
