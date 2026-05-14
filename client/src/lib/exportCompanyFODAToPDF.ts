import jsPDF from 'jspdf';

interface CompanyFODAElement {
  id: number;
  type: "Fortaleza" | "Oportunidad" | "Debilidad" | "Amenaza";
  description: string;
  justification?: string | null;
  isCustom: boolean;
}

interface CompanyFODAData {
  strengths: CompanyFODAElement[];
  opportunities: CompanyFODAElement[];
  weaknesses: CompanyFODAElement[];
  threats: CompanyFODAElement[];
}

const FODA_COLORS = {
  Fortaleza: { text: [25, 100, 50] },
  Oportunidad: { text: [25, 55, 109] },
  Debilidad: { text: [80, 80, 80] },
  Amenaza: { text: [139, 0, 0] },
};

export const exportCompanyFODAToPDF = (fodaData: CompanyFODAData, companyName: string = "Empresa") => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;

    // Helper function to add text with automatic page break
    const addText = (text: string, fontSize: number, fontStyle: 'normal' | 'bold' = 'normal', color: [number, number, number] = [0, 0, 0]) => {
      doc.setFontSize(fontSize);
      doc.setFont('Helvetica', fontStyle);
      doc.setTextColor(color[0], color[1], color[2]);
      
      const lines = doc.splitTextToSize(text, contentWidth);
      const lineHeight = fontSize * 0.35;
      const textHeight = lines.length * lineHeight;

      if (yPosition + textHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }

      doc.text(lines as string[], margin, yPosition);
      yPosition += textHeight + 2;
    };

    // Helper function to add a FODA section
    const addFODASection = (
      title: string,
      elements: CompanyFODAElement[],
      titleColor: [number, number, number]
    ) => {
      // Section title without background - just text in formal color
      doc.setFontSize(12);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
      doc.text(title, margin, yPosition);
      yPosition += 8;

      if (elements.length === 0) {
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text('Sin elementos registrados', margin + 3, yPosition);
        yPosition += 6;
      } else {
        elements.forEach((element, index) => {
          // Check if we need a new page
          if (yPosition > pageHeight - 30) {
            doc.addPage();
            yPosition = margin;
          }

          // Element number and description
          doc.setFontSize(10);
          doc.setFont('Helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          
          const descLines = doc.splitTextToSize(`${index + 1}. ${element.description}`, contentWidth - 6);
          doc.text(descLines as string[], margin + 3, yPosition);
          yPosition += descLines.length * 5 + 3;

          // Justification if available
          if (element.justification) {
            doc.setFontSize(9);
            doc.setFont('Helvetica', 'italic');
            doc.setTextColor(80, 80, 80);
            const justLines = doc.splitTextToSize(`Justificación: ${element.justification}`, contentWidth - 10);
            doc.text(justLines as string[], margin + 5, yPosition);
            yPosition += justLines.length * 3.5 + 2;
          }

          yPosition += 3;
        });
      }

      yPosition += 6;
    };

    // Title
    addText('FODA DE LA EMPRESA', 16, 'bold', [25, 55, 109]);
    yPosition += 2;

    // Company name
    addText(`Empresa: ${companyName}`, 11, 'normal', [80, 80, 80]);
    yPosition += 4;

    // Add date
    const date = new Date().toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    addText(`Fecha de generación: ${date}`, 9, 'normal', [120, 120, 120]);
    yPosition += 6;

    // Add summary
    const totalElements = fodaData.strengths.length + fodaData.opportunities.length + 
                         fodaData.weaknesses.length + fodaData.threats.length;
    addText(`Total de Elementos: ${totalElements}`, 10, 'bold', [25, 55, 109]);
    yPosition += 4;

    // Add FODA sections
    addFODASection('FORTALEZAS', fodaData.strengths, FODA_COLORS.Fortaleza.text as [number, number, number]);
    addFODASection('OPORTUNIDADES', fodaData.opportunities, FODA_COLORS.Oportunidad.text as [number, number, number]);
    addFODASection('DEBILIDADES', fodaData.weaknesses, FODA_COLORS.Debilidad.text as [number, number, number]);
    addFODASection('AMENAZAS', fodaData.threats, FODA_COLORS.Amenaza.text as [number, number, number]);

    // Save PDF
    doc.save(`FODA_Empresa_${companyName}.pdf`);
  } catch (error) {
    console.error('Error exporting company FODA to PDF:', error);
    throw error;
  }
};
