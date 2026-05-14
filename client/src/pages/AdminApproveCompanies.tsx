import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle, XCircle, Mail, Phone, FileText } from "lucide-react";

export default function AdminApproveCompanies() {
  const [selectedRequest, setSelectedRequest] = useState<number | null>(null);

  // Fetch pending requests
  const { data: requests = [], isLoading, refetch } = trpc.companyAccessRequests.list.useQuery(
    undefined,
    { refetchInterval: 5000 }
  );

  // Filter for pending requests
  const pendingRequests = requests.filter((r) => r.status === "pending");

  // Approve mutation
  const approveMutation = trpc.companyAccessRequests.approve.useMutation({
    onSuccess: () => {
      toast.success("Solicitud aprobada. Email de confirmación enviado.");
      setSelectedRequest(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al aprobar solicitud");
    },
  });

  // Reject mutation
  const rejectMutation = trpc.companyAccessRequests.reject.useMutation({
    onSuccess: () => {
      toast.success("Solicitud rechazada.");
      setSelectedRequest(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al rechazar solicitud");
    },
  });

  const handleApprove = (requestId: number) => {
    if (window.confirm("¿Estás seguro de que deseas aprobar esta solicitud?")) {
      approveMutation.mutate({ requestId });
    }
  };

  const handleReject = (requestId: number) => {
    const reason = window.prompt("¿Por qué deseas rechazar esta solicitud?");
    if (reason && reason.trim()) {
      rejectMutation.mutate({ requestId, reason: reason.trim() });
    }
  };

  const selectedRequestData = requests.find((r) => r.id === selectedRequest);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Panel de Aprobación</h1>
          <p className="text-gray-600 mt-2">Gestiona las solicitudes de acceso de nuevas empresas</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Solicitudes */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Solicitudes Pendientes</CardTitle>
                <CardDescription>{pendingRequests.length} solicitud(es) pendiente(s)</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Cargando solicitudes...</p>
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No hay solicitudes pendientes</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map((request) => (
                      <button
                        key={request.id}
                        onClick={() => setSelectedRequest(request.id)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                          selectedRequest === request.id
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <p className="font-medium text-sm text-gray-900">{request.companyName}</p>
                        <p className="text-xs text-gray-500 mt-1">{request.contactName}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detalles de la Solicitud */}
          <div className="lg:col-span-2">
            {selectedRequestData ? (
              <Card>
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                  <CardTitle>{selectedRequestData.companyName}</CardTitle>
                  <CardDescription>Solicitud del {new Date(selectedRequestData.createdAt).toLocaleDateString()}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Información de la Empresa */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Información de la Empresa</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center">
                        <span className="text-gray-500 w-24">RUC/CI:</span>
                        <span className="font-medium text-gray-900">{selectedRequestData.rucOrCI}</span>
                      </div>
                    </div>
                  </div>

                  {/* Información del Contacto */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Contacto Principal</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center">
                        <span className="text-gray-500 w-24">Nombre:</span>
                        <span className="font-medium text-gray-900">{selectedRequestData.contactName}</span>
                      </div>
                      <div className="flex items-start">
                        <Mail className="w-4 h-4 text-gray-400 mt-1 mr-2 flex-shrink-0" />
                        <a
                          href={`mailto:${selectedRequestData.email}`}
                          className="text-blue-600 hover:text-blue-700 underline"
                        >
                          {selectedRequestData.email}
                        </a>
                      </div>
                      {selectedRequestData.phone && (
                        <div className="flex items-start">
                          <Phone className="w-4 h-4 text-gray-400 mt-1 mr-2 flex-shrink-0" />
                          <a
                            href={`tel:${selectedRequestData.phone}`}
                            className="text-blue-600 hover:text-blue-700 underline"
                          >
                            {selectedRequestData.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estado */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Estado</h3>
                    <Badge className="bg-yellow-100 text-yellow-800">Pendiente de Aprobación</Badge>
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={() => handleApprove(selectedRequestData.id)}
                      disabled={approveMutation.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {approveMutation.isPending ? "Aprobando..." : "Aprobar"}
                    </Button>
                    <Button
                      onClick={() => handleReject(selectedRequestData.id)}
                      disabled={rejectMutation.isPending}
                      variant="destructive"
                      className="flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      {rejectMutation.isPending ? "Rechazando..." : "Rechazar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-12 pb-12">
                  <div className="text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Selecciona una solicitud para ver los detalles</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
