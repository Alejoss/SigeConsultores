import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, HardDrive, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

function StorageBar({ percent }: { percent: number }) {
  const color =
    percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
      <div
        className={`${color} h-2.5 rounded-full transition-all`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

export default function AdminStorage() {
  const [, setLocation] = useLocation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const storageQuery = trpc.adminOperations.getAllStorageUsage.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const setLimitMutation = trpc.adminOperations.setStorageLimit.useMutation({
    onSuccess: () => {
      toast.success("Límite actualizado correctamente");
      setEditingId(null);
      storageQuery.refetch();
    },
    onError: () => toast.error("Error al actualizar el límite"),
  });

  const handleEditStart = (companyId: number, currentLimit: number) => {
    setEditingId(companyId);
    setEditValue(currentLimit.toString());
  };

  const handleSave = (companyId: number) => {
    const limitMb = parseInt(editValue, 10);
    if (isNaN(limitMb) || limitMb < 50) {
      toast.error("El límite mínimo es 50 MB");
      return;
    }
    setLimitMutation.mutate({ companyId, limitMb });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin-dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <HardDrive className="h-7 w-7 text-blue-600" />
              Almacenamiento por Empresa
            </h1>
            <p className="text-slate-600">
              Monitorea el espacio utilizado y configura el límite de cada cliente
            </p>
          </div>
        </div>

        {/* Tabla */}
        <Card>
          <CardHeader>
            <CardTitle>Uso de almacenamiento</CardTitle>
          </CardHeader>
          <CardContent>
            {storageQuery.isLoading ? (
              <p className="text-slate-500 py-4 text-center">Cargando datos...</p>
            ) : storageQuery.error ? (
              <p className="text-red-500 py-4 text-center">Error al cargar datos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-600">
                      <th className="py-3 pr-4 font-semibold">Empresa</th>
                      <th className="py-3 pr-4 font-semibold">Estado</th>
                      <th className="py-3 pr-4 font-semibold">Usado</th>
                      <th className="py-3 pr-4 font-semibold w-48">Límite (MB)</th>
                      <th className="py-3 font-semibold w-64">Uso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageQuery.data?.map((company) => (
                      <tr key={company.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-3 pr-4 font-medium">{company.name}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              company.status === "Activa"
                                ? "bg-green-100 text-green-700"
                                : company.status === "En Proceso"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {company.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {company.usedMb < 1
                            ? `${Math.round(company.usedBytes / 1024)} KB`
                            : `${company.usedMb.toFixed(2)} MB`}
                        </td>
                        <td className="py-3 pr-4">
                          {editingId === company.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-24 h-7 text-sm"
                                min={50}
                                autoFocus
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-green-600"
                                onClick={() => handleSave(company.id)}
                                disabled={setLimitMutation.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-500"
                                onClick={() => setEditingId(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{company.limitMb} MB</span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-slate-400 hover:text-blue-600"
                                onClick={() => handleEditStart(company.id, company.limitMb)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <StorageBar percent={company.percentUsed} />
                            </div>
                            <span
                              className={`text-xs font-semibold w-10 text-right ${
                                company.percentUsed >= 100
                                  ? "text-red-600"
                                  : company.percentUsed >= 80
                                  ? "text-yellow-600"
                                  : "text-green-600"
                              }`}
                            >
                              {company.percentUsed}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-slate-400 text-center">
          * El uso mostrado corresponde únicamente a archivos subidos desde que se activó el rastreo de tamaño.
          Los archivos subidos anteriormente se contabilizarán como 0 bytes hasta que sean reemplazados.
        </p>
      </div>
    </div>
  );
}
