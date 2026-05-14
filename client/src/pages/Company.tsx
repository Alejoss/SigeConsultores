import { useState, useEffect } from 'react';
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Plus, Edit2, Trash2, Check, ArrowLeft } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface Company {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  ownerAccountId: number;
}

export default function Company() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyDescription, setNewCompanyDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Cargar empresas de la base de datos
  const { data: companiesData, isLoading, refetch } = trpc.process.list.useQuery();
  const createMutation = trpc.process.create.useMutation();
  const updateMutation = trpc.process.update.useMutation();
  const deleteMutation = trpc.process.delete.useMutation();

  useEffect(() => {
    if (companiesData) {
      setCompanies(companiesData);
    }
  }, [companiesData]);

  const saveCompanies = async (updatedCompanies: Company[]) => {
    setCompanies(updatedCompanies);
  };

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return;

    try {
      await createMutation.mutateAsync({
        name: newCompanyName,
        description: newCompanyDescription || undefined,
      });
      setNewCompanyName("");
      setNewCompanyDescription("");
      refetch();
      toast.success("Empresa creada exitosamente");
    } catch (error) {
      toast.error("Error al crear empresa");
    }
  };

  const handleSelectCompany = (company: Company) => {
    // Guardar empresa seleccionada en localStorage y navegar
    localStorage.setItem("selectedCompanyId", company.id.toString());
    setLocation(isManagerAccess ? "/manager-dashboard" : "/dashboard");
  };

  const handleUpdateCompany = async (id: number) => {
    try {
      await updateMutation.mutateAsync({
        id,
        name: editName,
        description: editDescription || undefined,
      });
      setEditingId(null);
      refetch();
      toast.success("Empresa actualizada exitosamente");
    } catch (error) {
      toast.error("Error al actualizar empresa");
    }
  };

  const handleDeleteCompany = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      refetch();
      toast.success("Empresa eliminada exitosamente");
    } catch (error) {
      toast.error("Error al eliminar empresa");
    }
  };

  const handleGoBack = () => {
    setLocation(isManagerAccess ? "/manager-dashboard" : "/dashboard");
  };

  return (
    <DashboardLayout>
      <div className="flex-1 space-y-6">
        {/* Header con botón volver */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Mis Empresas</h1>
            <p className="text-gray-600">Gestiona todas tus empresas</p>
          </div>
          <Button variant="outline" onClick={handleGoBack} className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
        </div>

        {/* Crear nueva empresa */}
        <Card>
          <CardHeader>
            <CardTitle>Crear Nueva Empresa</CardTitle>
            <CardDescription>Agrega una nueva empresa a tu plataforma</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Nombre de la empresa..."
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
            />
            <Input
              placeholder="Descripción (opcional)..."
              value={newCompanyDescription}
              onChange={(e) => setNewCompanyDescription(e.target.value)}
            />
            <Button onClick={handleAddCompany} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Crear Empresa
            </Button>
          </CardContent>
        </Card>

        {/* Lista de empresas */}
        <Card>
          <CardHeader>
            <CardTitle>Mis Empresas</CardTitle>
            <CardDescription>{companies.length} empresas registradas</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>Cargando empresas...</p>
            ) : companies.length === 0 ? (
              <p className="text-gray-500">No hay empresas registradas</p>
            ) : (
              <div className="space-y-4">
                {companies.map((company) => (
                  <div key={company.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      {editingId === company.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Nombre"
                          />
                          <Input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Descripción"
                          />
                        </div>
                      ) : (
                        <div>
                          <h3 className="font-semibold">{company.name}</h3>
                          <p className="text-sm text-gray-600">{company.description}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {editingId === company.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleUpdateCompany(company.id)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleSelectCompany(company)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            Seleccionar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(company.id);
                              setEditName(company.name);
                              setEditDescription(company.description || "");
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteCompany(company.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
