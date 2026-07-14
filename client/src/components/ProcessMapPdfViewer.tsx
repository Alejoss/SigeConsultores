import { FileText } from "lucide-react";

interface ProcessMapPdfViewerProps {
  fileUrl: string;
  fileName: string;
}

export default function ProcessMapPdfViewer({ fileUrl, fileName }: ProcessMapPdfViewerProps) {
  return (
    <div className="w-full border border-purple-200 rounded-lg overflow-hidden bg-gray-100">
      <iframe
        src={fileUrl}
        className="w-full h-[700px]"
        title={fileName}
      />
    </div>
  );
}
