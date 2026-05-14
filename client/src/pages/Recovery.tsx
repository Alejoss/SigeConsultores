import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Recovery() {
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [page, setPage] = useState(0);
  const limit = 10;

  const { data: recoveries, isLoading } = trpc.recovery.listRecoveries.useQuery(
    {
      companyId,
      limit,
      offset: page * limit,
    },
    {
      enabled: true,
    }
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "partial":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "success":
        return "Exitosa";
      case "partial":
        return "Parcial";
      case "failed":
        return "Fallida";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Auditoría de Recuperación</h1>
          <p className="text-gray-600 mt-2">
            Visualiza y gestiona los registros de recuperación de datos
          </p>
        </div>

        {/* Recovery List Card */}
        <Card>
          <CardHeader>
            <CardTitle>Historial de Recuperaciones</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Cargando recuperaciones...</p>
              </div>
            ) : !recoveries || recoveries.recoveries.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No hay registros de recuperación</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Archivo de Respaldo</TableHead>
                        <TableHead>Fecha de Recuperación</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Módulos Recuperados</TableHead>
                        <TableHead>Realizado por</TableHead>
                        <TableHead>Autorizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recoveries.recoveries.map((recovery: any) => (
                        <TableRow key={recovery.id}>
                          <TableCell className="font-medium">
                            {recovery.companyName}
                          </TableCell>
                          <TableCell className="text-sm">
                            {recovery.backupFile}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(recovery.recoveryDate), "PPP p", {
                              locale: es,
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(recovery.status)}>
                              {getStatusLabel(recovery.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {Array.isArray(recovery.modulesRecovered)
                              ? recovery.modulesRecovered.join(", ")
                              : JSON.parse(recovery.modulesRecovered).join(", ")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {recovery.performedByName}
                          </TableCell>
                          <TableCell>
                            {recovery.authorizedByName ? (
                              <Badge className="bg-blue-100 text-blue-800">
                                {recovery.authorizedByName}
                              </Badge>
                            ) : (
                              <span className="text-gray-500 text-sm">Pendiente</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex justify-between items-center mt-6">
                  <p className="text-sm text-gray-600">
                    Mostrando {page * limit + 1} a{" "}
                    {Math.min((page + 1) * limit, recoveries.total)} de{" "}
                    {recoveries.total} registros
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={page === 0}
                      onClick={() => setPage(Math.max(0, page - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        (page + 1) * limit >= (recoveries.total || 0)
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
