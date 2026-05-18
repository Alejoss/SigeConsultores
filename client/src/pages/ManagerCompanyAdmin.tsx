import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Copy, Check, Mail, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Company Manager Administration Panel
 * Allows company managers (Gerentes) to create invitations for process owners (Dueños de Proceso)
 */
export default function ManagerCompanyAdmin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Load company from localStorage on mount
  useEffect(() => {
    const savedCompanyId = localStorage.getItem('selectedCompanyId');
    if (savedCompanyId) {
      setCompanyId(parseInt(savedCompanyId));
    }
  }, []);

  // Form state for creating invitation
  const [formData, setFormData] = useState({
    processId: "",
    email: "",
  });

  // Fetch user's companies
  const userCompaniesQuery = trpc.process.list.useQuery();

  // Fetch company info
  const companyInfoQuery = trpc.companyInfo.get.useQuery(
    { companyId: companyId || 0 },
    { enabled: !!companyId }
  );

  // Fetch company processes
  const processesQuery = trpc.processMap.list.useQuery({ companyId: companyId || 0 }, { enabled: !!companyId });

  // Fetch invitations for company
  const invitationsQuery = trpc.hierarchicalAccess.processOwnerInvitations.listByCompany.useQuery(
    { companyId: companyId || 0 },
    { enabled: !!companyId }
  );

  // Memoize processes to prevent unnecessary re-renders
  const processesList = useMemo(() => processesQuery.data || [], [processesQuery.data]);

  // Mutations
  const createInvitationMutation = trpc.hierarchicalAccess.processOwnerInvitations.create.useMutation({
    onSuccess: () => {
      toast.success("Invitación creada exitosamente");
      setFormData({ processId: "", email: "" });
      setShowCreateDialog(false);
      invitationsQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al crear la invitación");
    },
  });

  const deleteInvitationMutation = trpc.hierarchicalAccess.processOwnerInvitations.delete.useMutation({
    onSuccess: () => {
      toast.success("Invitación eliminada");
      invitationsQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar la invitación");
    },
  });

  const handleCreateInvitation = async () => {
    if (!formData.processId || !formData.email) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    if (!companyId) {
      toast.error("Selecciona una empresa");
      return;
    }

    createInvitationMutation.mutate({
      companyId,
      processId: parseInt(formData.processId),
      email: formData.email,
      // accessCode is now optional - Process Owner will create it
    });
  };

  const handleCopyInvitationLink = (token: string) => {
    const link = `${window.location.origin}/process-owner-invitation?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    toast.success("Link copiado al portapapeles");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleDeleteInvitation = (token: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta invitación?")) {
      deleteInvitationMutation.mutate({ token });
    }
  };

  if (!user) {
    return <div className="text-center py-8">Debes iniciar sesión para acceder a esta página</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Administración de Empresa</h1>
        <p className="text-muted-foreground mt-2">
          Gestiona los accesos de los Dueños de Proceso a tu empresa
        </p>
      </div>

      {/* Back Button */}
      <Button variant="outline" onClick={() => setLocation("/manager-dashboard")} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver
      </Button>

      {/* Company Selection (Hidden) */}
      {!companyId && userCompaniesQuery.data && userCompaniesQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Seleccionar Empresa</CardTitle>
            <CardDescription>Elige la empresa que deseas administrar</CardDescription>
          </CardHeader>
          <CardContent>
            <NativeSelect
              value={companyId?.toString() ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setCompanyId(v ? parseInt(v, 10) : null);
              }}
            >
              <option value="">Selecciona una empresa</option>
              {userCompaniesQuery.data?.map((company: any) => (
                <option key={company.id} value={company.id.toString()}>
                  {company.name}
                </option>
              ))}
            </NativeSelect>
          </CardContent>
        </Card>
      )}

      {/* Process Selection */}
      {companyId && (
        <Card>
          <CardHeader>
            <CardTitle>Seleccionar Proceso</CardTitle>
            <CardDescription>Elige el proceso para el cual deseas crear una invitación</CardDescription>
          </CardHeader>
          <CardContent>
            <NativeSelect
              value={selectedProcessId?.toString() ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedProcessId(v ? parseInt(v, 10) : null);
              }}
            >
              <option value="">Selecciona un proceso</option>
              {processesList.map((process: any) => (
                <option key={process.id} value={process.id.toString()}>
                  {process.processName || process.name}
                </option>
              ))}
            </NativeSelect>
          </CardContent>
        </Card>
      )}

      {/* Company Info */}
      {companyId && companyInfoQuery.data && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">{companyInfoQuery.data.proposito || "Empresa"}</CardTitle>
            <CardDescription className="text-blue-700">
              {companyInfoQuery.data.mision || "Sin misión definida"}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {companyId && (
        <>
          {/* Create Invitation Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="w-full" size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Crear Invitación para Dueño de Proceso
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Crear Invitación para Dueño de Proceso</DialogTitle>
                <DialogDescription>
                  Crea una invitación con un código de 12 caracteres robusto para que el Dueño de Proceso pueda acceder a su
                  proceso específico
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Process selection */}
                <div>
                  <Label htmlFor="process">Seleccionar Proceso</Label>
                  {processesQuery.isLoading ? (
                    <div className="mt-2 p-3 text-sm text-muted-foreground bg-gray-50 rounded border">
                      Cargando procesos...
                    </div>
                  ) : processesList.length === 0 ? (
                    <div className="mt-2 p-3 text-sm text-muted-foreground bg-gray-50 rounded border">
                      No hay procesos disponibles
                    </div>
                  ) : (
                    <NativeSelect
                      id="process"
                      className="mt-2"
                      value={formData.processId}
                      onChange={(e) => setFormData({ ...formData, processId: e.target.value })}
                    >
                      <option value="">Selecciona un proceso</option>
                      {processesList.map((process: any) => (
                        <option key={`process-item-${process.id}`} value={process.id.toString()}>
                          {process.processName || process.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </div>

                {/* Email Input */}
                <div>
                  <Label htmlFor="email">Email del Dueño de Proceso</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="dolores@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-2"
                  />
                </div>

                {/* Access Code Note */}
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-900">
                    <strong>Nota:</strong> El Dueño de Proceso creará su propio código de acceso (12 caracteres) cuando acepte la invitación. Esto es más seguro que compartir un código predefinido.
                  </p>
                </div>

                {/* Create Button */}
                <Button
                  onClick={handleCreateInvitation}
                  disabled={createInvitationMutation.isPending}
                  className="w-full"
                >
                  {createInvitationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Crear Invitación
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Invitations Table */}
          <Card>
            <CardHeader>
              <CardTitle>Invitaciones Activas</CardTitle>
              <CardDescription>
                {invitationsQuery.data?.length || 0} invitación
                {invitationsQuery.data?.length !== 1 ? "es" : ""} pendiente
                {invitationsQuery.data?.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invitationsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : invitationsQuery.data && invitationsQuery.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proceso</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Expira</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitationsQuery.data.map((invitation: any) => (
                        <TableRow key={invitation.id}>
                          <TableCell className="font-medium">
                            {processesList.find((p: any) => p.id === invitation.processId)?.name || `Proceso ${invitation.processId}`}
                          </TableCell>
                          <TableCell>{invitation.email}</TableCell>
                          <TableCell className="font-mono font-bold">{invitation.accessCode}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                invitation.status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : invitation.status === "accepted"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {invitation.status === "pending"
                                ? "Pendiente"
                                : invitation.status === "accepted"
                                  ? "Aceptada"
                                  : "Expirada"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {invitation.expiresAt
                              ? new Date(invitation.expiresAt).toLocaleDateString("es-ES")
                              : "-"}
                          </TableCell>
                          <TableCell className="space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyInvitationLink(invitation.invitationToken)}
                              title="Copiar link de invitación"
                            >
                              {copiedToken === invitation.invitationToken ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteInvitation(invitation.invitationToken)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No hay invitaciones creadas aún
                </div>
              )}
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="bg-amber-50 border-amber-200">
            <CardHeader>
              <CardTitle className="text-amber-900">Cómo funciona</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-800 space-y-2">
              <p><strong>1. Crear Invitación:</strong> Selecciona el proceso y proporciona el email del Dueño de Proceso junto con un código de 12 caracteres robusto</p>
              <p><strong>2. Compartir Código:</strong> Comparte el código de acceso con el Dueño de Proceso de forma segura (no por email)</p>
              <p><strong>3. Enviar Link:</strong> Copia el link de invitación y envíaselo al Dueño de Proceso</p>
              <p><strong>4. Aceptar Invitación:</strong> El Dueño de Proceso accede al link y proporciona el código para confirmar su identidad</p>
              <p><strong>5. Acceso Garantizado:</strong> Una vez aceptada, el Dueño de Proceso puede acceder a su proceso específico en "Mapa de Procesos"</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
