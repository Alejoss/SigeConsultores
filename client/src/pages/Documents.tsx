import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Plus, Trash2, Download, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface Document {
  id: number;
  documentName: string;
  documentType: "Politica" | "Programa" | "Procedimiento" | "Varios";
  status: "Obsoleto" | "Vigente" | "Registro";
  fileUrl?: string;
  fileKey?: string;
  createdAt: Date;
}

export default function Documents() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [newDocName, setNewDocName] = useState("");
  const [newDocType, setNewDocType] = useState<"Politica" | "Programa" | "Procedimiento" | "Varios">("Procedimiento");
  const [newDocStatus, setNewDocStatus] = useState<"Obsoleto" | "Vigente" | "Registro">("Vigente");

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    if (stored) {
      setProcessId(parseInt(stored));
    }
  }, []);

  const handleAddDocument = () => {
    if (!newDocName.trim()) return;
    setDocuments([
      ...documents,
      {
        id: Date.now(),
        documentName: newDocName,
        documentType: newDocType,
        status: newDocStatus,
        createdAt: new Date(),
      },
    ]);
    setNewDocName("");
    setNewDocType("Procedimiento");
    setNewDocStatus("Vigente");
  };

  const handleDeleteDocument = (id: number) => {
    setDocuments(documents.filter((d) => d.id !== id));
  };

  const documentTypeColors: Record<string, string> = {
    Politica: "bg-purple-100 text-purple-900",
    Programa: "bg-blue-100 text-blue-900",
    Procedimiento: "bg-green-100 text-green-900",
    Varios: "bg-slate-100 text-slate-900",
  };

  const statusColors: Record<string, { bg: string; icon: React.ReactNode }> = {
    Vigente: { bg: "bg-green-50 border-green-200", icon: <CheckCircle size={20} className="text-green-600" /> },
    Obsoleto: { bg: "bg-red-50 border-red-200", icon: <AlertCircle size={20} className="text-red-600" /> },
    Registro: { bg: "bg-blue-50 border-blue-200", icon: <FileText size={20} className="text-blue-600" /> },
  };

  const vicenteCount = documents.filter((d) => d.status === "Vigente").length;
  const obsoletoCount = documents.filter((d) => d.status === "Obsoleto").length;
  const registroCount = documents.filter((d) => d.status === "Registro").length;

  if (!processId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">
              Por favor, selecciona un proceso desde el Mapa de Procesos
            </p>
            <Button
              className="w-full mt-4"
              onClick={() => setLocation("/process-map")}
            >
              Volver al Mapa de Procesos
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Documentos</h1>
          <p className="text-slate-600 mt-2">
            Gestiona la documentación del proceso
          </p>
        </div>

        {/* Add New Document */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agregar Nuevo Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Nombre del documento..."
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") handleAddDocument();
                }}
              />
              <select
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value as any)}
                className="px-3 py-2 border rounded"
              >
                <option value="Politica">Política</option>
                <option value="Programa">Programa</option>
                <option value="Procedimiento">Procedimiento</option>
                <option value="Varios">Varios</option>
              </select>
              <select
                value={newDocStatus}
                onChange={(e) => setNewDocStatus(e.target.value as any)}
                className="px-3 py-2 border rounded"
              >
                <option value="Vigente">Vigente</option>
                <option value="Obsoleto">Obsoleto</option>
                <option value="Registro">Registro</option>
              </select>
            </div>
            <Button
              onClick={handleAddDocument}
              disabled={!newDocName.trim()}
              className="w-full"
            >
              <Plus size={20} />
              Agregar Documento
            </Button>
          </CardContent>
        </Card>

        {/* Document Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Total Documentos</p>
              <p className="text-3xl font-bold text-slate-900">{documents.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Vigentes</p>
              <p className="text-3xl font-bold text-green-900">{vicenteCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Obsoletos</p>
              <p className="text-3xl font-bold text-red-900">{obsoletoCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Registros</p>
              <p className="text-3xl font-bold text-blue-900">{registroCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Document List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Documentación del Proceso</CardTitle>
            <CardDescription>
              Gestiona todos los documentos asociados a este proceso
            </CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-center text-slate-600 py-6">
                No hay documentos agregados aún
              </p>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`p-4 border rounded-lg transition ${statusColors[doc.status].bg}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        {statusColors[doc.status].icon}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-slate-900">
                              {doc.documentName}
                            </h3>
                            <span className={`px-2 py-1 text-xs rounded font-medium ${documentTypeColors[doc.documentType]}`}>
                              {doc.documentType}
                            </span>
                            <span className={`px-2 py-1 text-xs rounded font-medium ${
                              doc.status === "Vigente"
                                ? "bg-green-100 text-green-900"
                                : doc.status === "Obsoleto"
                                ? "bg-red-100 text-red-900"
                                : "bg-blue-100 text-blue-900"
                            }`}>
                              {doc.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Creado: {doc.createdAt.toLocaleDateString("es-CO")}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {doc.fileUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Download size={16} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribución por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {["Politica", "Programa", "Procedimiento", "Varios"].map((type) => {
                const count = documents.filter((d) => d.documentType === type).length;
                const percentage = documents.length > 0 ? (count / documents.length) * 100 : 0;
                return (
                  <div key={type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{type}</span>
                      <span className="text-slate-600">{count} documentos</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => setLocation("/process-characterization")}
            className="flex-1"
          >
            Volver a Caracterización
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

