import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "sonner";
import { Loader2, Copy, Check } from "lucide-react";

/**
 * Admin page to view and manage company managers (Gerentes)
 * Only accessible to admin users
 */
export default function AdminGerentes() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Fetch all companies
  const companiesQuery = trpc.adminOperations.getAllCompanies.useQuery();

  // Fetch all company managers
  const managersQuery = trpc.hierarchicalAccess.companyManagers.listAll.useQuery();

  // Fetch company info for display
  const companyInfoQuery = trpc.process.get.useQuery(
    { companyId: selectedCompanyId ? parseInt(selectedCompanyId) : 0 },
    { enabled: !!selectedCompanyId }
  );

  // Filter managers by selected company
  const filteredManagers = selectedCompanyId
    ? managersQuery.data?.filter((m) => m.companyId === parseInt(selectedCompanyId)) || []
    : managersQuery.data || [];

  const handleCopyLink = (managerId: number) => {
    const link = `${window.location.origin}/manager-dashboard?managerId=${managerId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(managerId);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gerentes de Empresa</h1>
        <p className="text-muted-foreground mt-2">
          Administra los gerentes de empresa y sus accesos a la plataforma
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Seleccionar Empresa</label>
              <NativeSelect
                id="filter-company"
                className="mt-2"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
              >
                <option value="">Todas las empresas</option>
                {companiesQuery.data?.map((company: any) => (
                  <option key={company.id} value={company.id.toString()}>
                    {company.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Info */}
      {selectedCompanyId && companyInfoQuery.data && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">{companyInfoQuery.data?.name || "Empresa"}</CardTitle>
            <CardDescription className="text-blue-700">
              {companyInfoQuery.data?.description || "Sin descripción"}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Managers Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedCompanyId ? "Gerentes de " + (companyInfoQuery.data?.name || "Empresa") : "Todos los Gerentes"}
          </CardTitle>
          <CardDescription>
            {filteredManagers.length} gerente{filteredManagers.length !== 1 ? "s" : ""} registrado
            {filteredManagers.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {managersQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredManagers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No hay gerentes registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Gerente</TableHead>
                    <TableHead>ID Empresa</TableHead>
                    <TableHead>ID Cuenta</TableHead>
                    <TableHead>Fecha Creación</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredManagers.map((manager) => (
                    <TableRow key={`${manager.companyId}-${manager.managerEmail}`}>
                      <TableCell className="font-medium">{manager.id}</TableCell>
                      <TableCell>{manager.companyId}</TableCell>
                      <TableCell>{manager.accountId}</TableCell>
                      <TableCell>
                        {new Date(manager.createdAt).toLocaleDateString("es-ES", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyLink(manager.id)}
                            title="Copiar link de acceso"
                          >
                            {copiedId === manager.id ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="bg-amber-50 border-amber-200">
        <CardHeader>
          <CardTitle className="text-amber-900">Información</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-800 space-y-2">
          <p>
            • Los <strong>Gerentes de Empresa</strong> son usuarios que pueden administrar los accesos de los Dueños de
            Proceso en su empresa
          </p>
          <p>
            • Cada gerente recibe un <strong>link único</strong> para acceder al panel "Administración [Nombre Empresa]"
          </p>
          <p>
            • Desde ese panel, pueden invitar Jefes de Proceso por correo con enlace para crear su contraseña
          </p>
          <p>
            • Los Dueños de Proceso solo pueden acceder a los módulos de SIGE y a su proceso específico en "Mapa de
            Procesos"
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
