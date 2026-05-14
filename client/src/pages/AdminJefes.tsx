import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin page to view and manage process owners (Jefes de Proceso)
 * Only accessible to admin users
 */
export default function AdminJefes() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedProcessId, setSelectedProcessId] = useState<string>("");

  // Fetch all companies
  const companiesQuery = trpc.adminOperations.getAllCompanies.useQuery();

  // Fetch all process owners
  const processOwnersQuery = trpc.hierarchicalAccess.processOwners.listAll.useQuery();

  // Fetch processes for selected company
  const processesQuery = trpc.processMap.list.useQuery(
    { companyId: selectedCompanyId ? parseInt(selectedCompanyId) : 0 },
    { enabled: !!selectedCompanyId }
  );

  // Filter process owners
  let filteredOwners = processOwnersQuery.data || [];
  if (selectedCompanyId) {
    filteredOwners = filteredOwners.filter((o) => o.companyId === parseInt(selectedCompanyId));
  }
  if (selectedProcessId) {
    filteredOwners = filteredOwners.filter((o) => o.processId === parseInt(selectedProcessId));
  }

  // Delete mutation
  const deleteOwnerMutation = trpc.hierarchicalAccess.processOwners.delete.useMutation({
    onSuccess: () => {
      toast.success("Dueño de Proceso eliminado");
      processOwnersQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar");
    },
  });

  const handleDeleteOwner = (ownerId: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este Dueño de Proceso?")) {
      deleteOwnerMutation.mutate({ processId: 0, userId: 0 }); // TODO: Fix delete mutation
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Jefes de Proceso</h1>
        <p className="text-muted-foreground mt-2">
          Administra los Dueños de Proceso y sus accesos a procesos específicos
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Seleccionar Empresa</label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Todas las empresas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas las empresas</SelectItem>
                  {companiesQuery.data?.map((company: any) => (
                    <SelectItem key={company.id} value={company.id.toString()}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Seleccionar Proceso</label>
              <Select
                value={selectedProcessId}
                onValueChange={setSelectedProcessId}
                disabled={!selectedCompanyId}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Todos los procesos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los procesos</SelectItem>
                  {processesQuery.data?.map((process: any) => (
                    <SelectItem key={process.id} value={process.id.toString()}>
                      {process.processName || process.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Process Owners Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedCompanyId && selectedProcessId
              ? "Dueños de Proceso"
              : selectedCompanyId
                ? "Dueños de Proceso de la Empresa"
                : "Todos los Dueños de Proceso"}
          </CardTitle>
          <CardDescription>
            {filteredOwners.length} dueño{filteredOwners.length !== 1 ? "s" : ""} de proceso registrado
            {filteredOwners.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {processOwnersQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOwners.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No hay Dueños de Proceso registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Proceso</TableHead>
                    <TableHead>Usuario ID</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Fecha Asignación</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOwners.map((owner: any) => {
                    const company = companiesQuery.data?.find((c: any) => c.id === owner.companyId);
                    const process = processesQuery.data?.find((p: any) => p.id === owner.processId);

                    return (
                      <TableRow key={owner.id}>
                        <TableCell className="font-medium">{owner.id}</TableCell>
                        <TableCell>{company?.name || `Empresa ${owner.companyId}`}</TableCell>
                        <TableCell>{process?.name || `Proceso ${owner.processId}`}</TableCell>
                        <TableCell>{owner.userId}</TableCell>
                        <TableCell>
                          <Badge variant="outline">Dueño de Proceso</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(owner.createdAt).toLocaleDateString("es-ES", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteOwner(owner.id)}
                            disabled={deleteOwnerMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Acerca de los Dueños de Proceso</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>
            • Los <strong>Dueños de Proceso</strong> (Jefes de Proceso) son responsables de un proceso específico dentro
            de una empresa
          </p>
          <p>
            • Solo pueden acceder a su proceso específico en "Mapa de Procesos", no a otros procesos de la empresa
          </p>
          <p>
            • Tienen acceso a todos los módulos de SIGE (Indicadores, Riesgos, Cumplimientos, etc.) para su proceso
          </p>
          <p>
            • Pueden compartir el link de acceso con sus colaboradores, quienes tendrán el mismo nivel de acceso
          </p>
          <p>
            • Son creados a través de invitaciones generadas por el Gerente de Empresa con un código de 4 dígitos
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
