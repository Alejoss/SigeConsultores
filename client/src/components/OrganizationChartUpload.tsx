import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

interface OrganizationChartUploadProps {
  chartId: number;
  onUploadSuccess?: () => void;
}

function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

export default function OrganizationChartUpload({
  chartId,
  onUploadSuccess,
}: OrganizationChartUploadProps) {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Get list of uploaded PDFs
  const { data: pdfList, refetch: refetchPDFs } = trpc.organizationChart.getFiles.useQuery(
    { chartId }
  );

  // Upload PDF mutation
  const uploadMutation = trpc.organizationChart.uploadPDF.useMutation({
    onSuccess: () => {
      toast.success("PDF subido exitosamente");
      setSelectedFile(null);
      refetchPDFs();
      onUploadSuccess?.();
    },
    onError: (error: any) => {
      toast.error(`Error al subir PDF: ${error.message}`);
    },
  });

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      if (isPdfFile(file)) {
        setSelectedFile(file);
      } else {
        toast.error("Solo se permiten archivos PDF (.pdf). Convierte tu archivo a PDF e inténtalo de nuevo.");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      if (isPdfFile(file)) {
        setSelectedFile(file);
      } else {
        toast.error("Solo se permiten archivos PDF (.pdf). Convierte tu archivo a PDF e inténtalo de nuevo.");
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Por favor, selecciona un archivo");
      return;
    }

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      console.log("[OrgChartUpload] Sending file:", selectedFile.name, "size:", uint8Array.length);

      await uploadMutation.mutateAsync({
        chartId,
        fileName: selectedFile.name,
        fileData: Array.from(uint8Array),
      });
    } catch (error) {
      console.error("[OrgChartUpload] Upload failed:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>Subir Organigrama en PDF</CardTitle>
          <CardDescription>
            Solo se aceptan archivos en formato PDF (.pdf). Arrastra el archivo aquí o haz clic para seleccionarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-gray-50 hover:border-gray-400"
            }`}
          >
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="pdf-upload"
            />
            <label htmlFor="pdf-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-gray-400" />
                <p className="text-sm font-medium">
                  {selectedFile ? selectedFile.name : "Arrastra un PDF aquí"}
                </p>
                <p className="text-xs text-gray-500">Formato obligatorio: PDF (.pdf)</p>
                <p className="text-xs text-gray-400">o haz clic para seleccionar</p>
              </div>
            </label>
          </div>

          {selectedFile && (
            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploadMutation.isPending}
            className="w-full"
          >
            {uploadMutation.isPending ? "Subiendo..." : "Subir PDF"}
          </Button>
        </CardContent>
      </Card>

      {/* Current PDF info */}
      {pdfList && pdfList.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-amber-50 border border-amber-200 p-3 rounded-lg">
          <span>
            Organigrama actual: <strong>{pdfList[0].fileName}</strong>
            {" — "}subido por {pdfList[0].uploadedByName} el{" "}
            {new Date(pdfList[0].uploadedAt).toLocaleDateString()}.
            Subir un nuevo PDF reemplazará el actual.
          </span>
        </div>
      )}
    </div>
  );
}
