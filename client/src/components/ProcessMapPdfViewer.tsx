import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProcessMapPdfViewerProps {
  fileUrl: string;
  fileName: string;
}

export default function ProcessMapPdfViewer({ fileUrl, fileName }: ProcessMapPdfViewerProps) {
  return (
    <div className="w-full border border-purple-200 rounded-lg overflow-hidden bg-gray-100">
      <object
        data={fileUrl}
        type="application/pdf"
        className="w-full h-[700px]"
        aria-label={fileName}
      >
        {/* Fallback si el browser no puede mostrar el PDF inline */}
        <div className="flex flex-col items-center justify-center h-[700px] gap-4 text-gray-500">
          <p className="text-sm">Tu navegador no puede mostrar el PDF directamente.</p>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Abrir PDF en nueva pestaña
            </Button>
          </a>
        </div>
      </object>
    </div>
  );
}
