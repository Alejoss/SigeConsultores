import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Upload, Download, Trash2, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getCompanyIdFromSession } from "@/lib/sessionScope";

interface DocumentManagerProps {
  documentType: "Policy" | "Values" | "StrategicObjectives" | "Indicators" | "ProcessMap";
  title: string;
  description: string;
  backUrl: string;
  infoTitle?: string;
  infoContent?: React.ReactNode;
}

export default function DocumentManager({
  documentType,
  title,
  description,
  backUrl,
  infoTitle,
  infoContent,
}: DocumentManagerProps) {
  const [, setLocation] = useLocation();
  const [companyId] = useState<number | null>(() => getCompanyIdFromSession());
  const [companyName] = useState(
    () =>
      localStorage.getItem("selectedCompanyName") ||
      localStorage.getItem("managerCompanyName") ||
      "Empresa"
  );
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch documents for this company and type
  const { data: documents, isLoading, refetch } = trpc.documents.getByCompanyAndType.useQuery(
    { companyId: companyId || 0, documentType },
    { enabled: companyId !== null }
  );

  // Upload mutation
  const uploadMutation = trpc.documents.uploadPolicyDocument.useMutation({
    onSuccess: () => {
      toast.success(`Documento de ${title.toLowerCase()} cargado exitosamente`);
      refetch();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al cargar el documento");
    },
  });

  // Delete mutation
  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      toast.success("Documento eliminado exitosamente");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el documento");
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !companyId) return;

    // Validate file type
    const validTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!validTypes.includes(file.type)) {
      toast.error("Por favor, selecciona un archivo PDF o Word (.doc, .docx)");
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error("El archivo no debe superar 50MB");
      return;
    }

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      await uploadMutation.mutateAsync({
        companyId,
        fileName: file.name,
        fileData: Array.from(uint8Array),
        fileType: file.type,
        documentType: documentType,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Error al procesar el archivo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (docId: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este documento?")) {
      deleteMutation.mutate({ id: docId });
    }
  };

  const handleDownload = (fileUrl: string, fileName: string) => {
    // Para PDFs, abrir en nueva ventana. Para otros formatos, descargar.
    if (fileName.toLowerCase().endsWith('.pdf')) {
      window.open(fileUrl, '_blank');
    } else {
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (!companyId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-slate-600">
            <AlertCircle size={20} />
            <p>Por favor, selecciona una empresa primero desde el Dashboard</p>
          </div>
          <Button
            className="w-full mt-4"
            onClick={() => setLocation("/company")}
          >
            Ir a Gestión de Empresas
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-slate-600 mt-2">
            {description} <strong>{companyName}</strong>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation(`${backUrl}${companyId}`)}
        >
          ← Volver
        </Button>
      </div>

      {/* Upload Section */}
      <Card className="border-2 border-dashed border-blue-300 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload size={20} className="text-blue-600" />
            Cargar Documento de {title}
          </CardTitle>
          <CardDescription>
            Sube un archivo Word (.doc, .docx) o PDF con tu documentación
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileSelect}
            disabled={isUploading || uploadMutation.isPending}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || uploadMutation.isPending}
            className="w-full"
            size="lg"
          >
            {isUploading || uploadMutation.isPending ? "Cargando..." : "Seleccionar Archivo"}
          </Button>
          <p className="text-xs text-slate-500 mt-3">
            Máximo 50MB • Formatos: PDF, Word (.doc, .docx)
          </p>
        </CardContent>
      </Card>

      {/* Documents List */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Cargando documentos...</p>
          </CardContent>
        </Card>
      ) : documents && documents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText size={20} />
              Documentos Cargados ({documents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{doc.documentName}</p>
                    <p className="text-sm text-slate-500">
                      Cargado el {new Date(doc.createdAt).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(doc.fileUrl || "", doc.documentName)}
                      disabled={!doc.fileUrl}
                    >
                      <Download size={16} />
                      {doc.documentName.toLowerCase().endsWith('.pdf') ? 'Abrir' : 'Descargar'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 size={16} />
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <FileText size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium">No hay documentos cargados</p>
              <p className="text-sm text-slate-500 mt-1">
                Carga tu primer documento usando el formulario arriba
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Box */}
      {infoTitle && infoContent && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900">{infoTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-800">
            {infoContent}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
