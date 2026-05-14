import jsPDF from 'jspdf';

interface Resource {
  id?: number;
  resourceName: string | null;
  resourceElements: string | null;
  resourceType?: string | null;
}

interface ParticipantGroup {
  participant: {
    id: number;
    position: string;
    processCharacterizationId: number;
  };
  resources: Resource[];
}

export const exportResourcesToPDF = (participantGroups: ParticipantGroup[], processName: string) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 15;
    const margin = 10;
    const maxWidth = pageWidth - 2 * margin;

    // Helper functions
    const addNewPage = () => {
      doc.addPage();
      yPosition = 15;
    };

    const addTitle = (text: string) => {
      if (yPosition > pageHeight - 40) addNewPage();
      doc.setFontSize(18);
      doc.setTextColor(30, 58, 138);
      doc.text(text, margin, yPosition);
      yPosition += 10;
    };

    const addSubtitle = (text: string) => {
      if (yPosition > pageHeight - 30) addNewPage();
      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      doc.text(text, margin, yPosition);
      yPosition += 6;
    };

    const addSectionTitle = (text: string, color: [number, number, number]) => {
      if (yPosition > pageHeight - 25) addNewPage();
      doc.setFontSize(14);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(text, margin, yPosition);
      yPosition += 8;
    };

    const addSeparator = () => {
      if (yPosition > pageHeight - 15) return;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 4;
    };

    const addResourceHeader = (idx: number, resourceName: string, color: [number, number, number]) => {
      if (yPosition > pageHeight - 20) addNewPage();
      doc.setFontSize(11);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(`${idx}. ${resourceName}`, margin + 3, yPosition);
      yPosition += 6;
    };

    const addFieldTable = (fields: Array<[string, string]>) => {
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);

      const colWidth = (maxWidth - 4) / 2;
      const rowHeight = 5;

      fields.forEach((field) => {
        if (yPosition > pageHeight - 10) addNewPage();

        const [label, value] = field;
        const labelText = `${label}:`;

        // Draw label
        doc.setTextColor(80, 80, 80);
        doc.text(labelText, margin + 2, yPosition);

        // Draw value
        doc.setTextColor(50, 50, 50);
        const valueLines = doc.splitTextToSize(value || '-', colWidth - 10);
        doc.text(valueLines as string[], margin + 50, yPosition);

        yPosition += Math.max(rowHeight, valueLines.length * 3.5) + 1;
      });
    };

    // Header
    addTitle('RECURSOS DEL PROCESO');
    addSubtitle(`Proceso: ${processName}`);
    addSubtitle(`Fecha de Generación: ${new Date().toLocaleDateString('es-ES')}`);
    yPosition += 4;

    // Colors for different sections
    const colors: Array<[number, number, number]> = [
      [34, 197, 94],   // Green
      [59, 130, 246],  // Blue
      [249, 115, 22],  // Orange
      [239, 68, 68],   // Red
      [168, 85, 247],  // Purple
      [14, 165, 233],  // Sky
    ];

    // Process each participant group
    participantGroups.forEach((group, groupIdx) => {
      if (group.resources.length === 0) return;

      const color = colors[groupIdx % colors.length];
      addSectionTitle(`${groupIdx + 1}. ${group.participant.position.toUpperCase()}`, color);
      addSeparator();

      // Add each resource
      group.resources.forEach((resource, resourceIdx) => {
        addResourceHeader(resourceIdx + 1, resource.resourceName || resource.resourceType || 'Recurso', color);

        const fields: Array<[string, string]> = [
          ['Elementos del Recurso', resource.resourceElements || ''],
        ];

        addFieldTable(fields);
        addSeparator();
        yPosition += 2;
      });

      yPosition += 4;
    });

    // Save the PDF
    const fileName = `Recursos_${processName}_${new Date().toLocaleDateString('es-ES')}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
