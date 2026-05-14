import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Users,
    Key,
    FileText,
    BarChart3,
    Loader2,
    ArrowLeft,
  } from "lucide-react";
import { trpc } from "@/lib/trpc";
import CustomizeModulesPanel from "@/components/CustomizeModulesPanel";
import CreateManagerInvitation from "@/components/CreateManagerInvitation";
import RecoveryForm from "@/components/RecoveryForm";
import { useLocation } from "wouter";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [showCreateInvitation, setShowCreateInvitation] = useState(false);
  const [newInvitation, setNewInvitation] = useState({
    companyName: "",
    contactEmail: "",
    expirationDays: 30,
  });

  // Queries
  const companiesQuery = trpc.adminOperations.getCompaniesWithStats.useQuery();
  const managersQuery = trpc.adminOperations.getCompanyManagers.useQuery();
  const processOwnersQuery = trpc.adminOperations.getProcessOwners.useQuery();
  const invitationsQuery = trpc.adminOperations.getProcessLeaderInvitations.useQuery();
  const accessInvitationsListQuery = trpc.accessInvitations.listInvitations.useQuery();
  const accessInvitationsStatsQuery = trpc.accessInvitations.getStatistics.useQuery();

  const createInvitationMutation = trpc.accessInvitations.createInvitation.useMutation({
    onSuccess: () => {
      setShowCreateInvitation(false);
      setNewInvitation({
        companyName: "",
        contactEmail: "",
        expirationDays: 30,
      });
      accessInvitationsListQuery.refetch();
    },
  });

  const handleCreateInvitation = async () => {
    if (!newInvitation.companyName || !newInvitation.contactEmail) {
      alert("Por favor completa todos los campos");
      return;
    }

    createInvitationMutation.mutate({
      companyName: newInvitation.companyName,
      contactEmail: newInvitation.contactEmail,
      expirationDays: newInvitation.expirationDays,
    });
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("es-ES");
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
      "En Proceso": "secondary",
      "Activa": "default",
      "Activo": "default",
      "Desactivada": "destructive",
      "Desactivado": "destructive",
    };
    return statusMap[status] || "outline";
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/dashboard")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Panel de Administración</h1>
              <p className="text-slate-600">Gestiona empresas, usuarios y accesos</p>
            </div>
          </div>
        </div>

        {/* Customize Modules Section */}
        {companiesQuery.data && (
          <CustomizeModulesPanel
            allCompanies={companiesQuery.data}
            isLoadingCompanies={companiesQuery.isLoading}
          />
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="managers">Managers</TabsTrigger>
            <TabsTrigger value="leaders">Líderes de Proceso</TabsTrigger>
            <TabsTrigger value="invitations">Invitaciones</TabsTrigger>
            <TabsTrigger value="recovery">Recuperación</TabsTrigger>
          </TabsList>

          {/* Overview Tab - Companies Summary */}
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Resumen de Empresas</CardTitle>
                <CardDescription>
                  Estado actual de todas las empresas en la plataforma
                </CardDescription>
              </CardHeader>
              <CardContent>
                {companiesQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  </div>
                ) : companiesQuery.data && companiesQuery.data.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Fecha de Creación</TableHead>
                        <TableHead>Fecha de Cancelación</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companiesQuery.data.map((company: any) => (
                        <TableRow key={company.id}>
                          <TableCell className="font-medium">{company.name}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadge(company.status)}>
                              {company.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(company.createdAt)}</TableCell>
                          <TableCell>
                            {company.cancelledAt ? formatDate(company.cancelledAt) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    No hay empresas registradas
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Managers Tab */}
          <TabsContent value="managers">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Invitar Nuevo Gerente</CardTitle>
                      <CardDescription>
                        Crea una invitación para que un gerente se registre
                      </CardDescription>
                    </div>
                    {companiesQuery.data && (
                      <CreateManagerInvitation
                        companies={companiesQuery.data}
                        onSuccess={() => managersQuery.refetch()}
                      />
                    )}
                  </div>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Managers de Empresas</CardTitle>
                  <CardDescription>
                    Managers activos y en proceso
                  </CardDescription>
                </CardHeader>
              <CardContent>
                {managersQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  </div>
                ) : managersQuery.data && managersQuery.data.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Responsable</TableHead>
                        <TableHead>Correo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Creado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {managersQuery.data.map((manager: any) => (
                        <TableRow key={manager.id}>
                          <TableCell className="font-medium">{manager.companyName}</TableCell>
                          <TableCell>{manager.companyName}</TableCell>
                          <TableCell>{manager.managerEmail}</TableCell>
                          <TableCell>
                            <Badge variant={manager.isActive ? "default" : "secondary"}>
                              {manager.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(manager.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    No hay managers registrados
                  </div>
                )}
              </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Leaders Tab - Process Owners */}
          <TabsContent value="leaders">
            <Card>
              <CardHeader>
                <CardTitle>Líderes de Proceso</CardTitle>
                <CardDescription>
                  Process Owners activos y en proceso
                </CardDescription>
              </CardHeader>
              <CardContent>
                {processOwnersQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  </div>
                ) : processOwnersQuery.data && processOwnersQuery.data.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Proceso</TableHead>
                        <TableHead>Correo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Creado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processOwnersQuery.data.map((owner: any) => (
                        <TableRow key={owner.id}>
                          <TableCell className="font-medium">{owner.companyName}</TableCell>
                          <TableCell>{owner.processName}</TableCell>
                          <TableCell>{owner.email}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadge(owner.status)}>
                              {owner.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(owner.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    No hay líderes de proceso registrados
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recovery Tab */}
          <TabsContent value="recovery">
            <RecoveryForm />
          </TabsContent>

          {/* Invitations Tab */}
          <TabsContent value="invitations">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Crear Nueva Invitación</CardTitle>
                      <CardDescription>
                        Invita a nuevas empresas a la plataforma
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => setShowCreateInvitation(!showCreateInvitation)}
                    >
                      {showCreateInvitation ? "Cancelar" : "Nueva Invitación"}
                    </Button>
                  </div>
                </CardHeader>
                {showCreateInvitation && (
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Nombre de la Empresa</Label>
                      <input
                        type="text"
                        value={newInvitation.companyName}
                        onChange={(e) =>
                          setNewInvitation({
                            ...newInvitation,
                            companyName: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-md"
                        placeholder="Nombre de la empresa"
                      />
                    </div>
                    <div>
                      <Label>Email de Contacto</Label>
                      <input
                        type="email"
                        value={newInvitation.contactEmail}
                        onChange={(e) =>
                          setNewInvitation({
                            ...newInvitation,
                            contactEmail: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-md"
                        placeholder="contacto@empresa.com"
                      />
                    </div>
                    <div>
                      <Label>Días de Expiración</Label>
                      <input
                        type="number"
                        value={newInvitation.expirationDays}
                        onChange={(e) =>
                          setNewInvitation({
                            ...newInvitation,
                            expirationDays: parseInt(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-md"
                        min="1"
                      />
                    </div>
                    <Button
                      onClick={handleCreateInvitation}
                      disabled={createInvitationMutation.isPending}
                      className="w-full"
                    >
                      {createInvitationMutation.isPending
                        ? "Creando..."
                        : "Crear Invitación"}
                    </Button>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Invitaciones Pendientes</CardTitle>
                  <CardDescription>
                    Invitaciones enviadas a empresas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {accessInvitationsListQuery.isLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                    </div>
                  ) : accessInvitationsListQuery.data &&
                    accessInvitationsListQuery.data.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Fecha de Creación</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accessInvitationsListQuery.data.map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell>{inv.companyName}</TableCell>
                            <TableCell>{inv.contactEmail}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  inv.status === "pending"
                                    ? "secondary"
                                    : "default"
                                }
                              >
                                {inv.status === "pending"
                                  ? "Pendiente"
                                  : "Aceptada"}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(inv.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      No hay invitaciones
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
