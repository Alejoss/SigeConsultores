import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizationChartModule from "../OrganizationChartModule";
import OrganizationChartUpload from "../OrganizationChartUpload";
import OrganizationChartViewer from "../OrganizationChartViewer";
import OrganizationChartNode from "../OrganizationChartNode";
import { trpc } from "@/lib/trpc";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    organizationChart: {
      getChart: {
        useQuery: vi.fn(),
      },
      createChart: {
        useMutation: vi.fn(),
      },
      getFiles: {
        useQuery: vi.fn(),
      },
      uploadPDF: {
        useMutation: vi.fn(),
      },
      deletePDF: {
        useMutation: vi.fn(),
      },
      getNodes: {
        useQuery: vi.fn(),
      },
    },
  },
}));

// Mock useAuth
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Test User", role: "admin" },
    loading: false,
    error: null,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

describe("OrganizationChart Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OrganizationChartModule", () => {
    it("should show create button when no chart exists", () => {
      vi.mocked(trpc.organizationChart.getChart.useQuery).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<OrganizationChartModule companyId={1} />);

      expect(screen.getByText(/Crear Organigrama/i)).toBeInTheDocument();
    });

    it("should show tabs when chart exists", () => {
      vi.mocked(trpc.organizationChart.getChart.useQuery).mockReturnValue({
        data: { id: 1, companyId: 1, name: "Test Chart", description: "Test" },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<OrganizationChartModule companyId={1} />);

      expect(screen.getByText(/Ver Organigrama/i)).toBeInTheDocument();
      expect(screen.getByText(/Subir PDF/i)).toBeInTheDocument();
    });

    it("should handle chart creation", async () => {
      const mockMutate = vi.fn().mockResolvedValue({ id: 1 });
      vi.mocked(trpc.organizationChart.getChart.useQuery).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.mocked(trpc.organizationChart.createChart.useMutation).mockReturnValue({
        mutateAsync: mockMutate,
        isPending: false,
      } as any);

      render(<OrganizationChartModule companyId={1} />);

      const button = screen.getByText(/Crear Organigrama/i);
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith({
          companyId: 1,
          name: "Organigrama de la Empresa",
          description: "Estructura organizacional de la empresa",
        });
      });
    });
  });

  describe("OrganizationChartUpload", () => {
    it("should display upload area", () => {
      vi.mocked(trpc.organizationChart.getFiles.useQuery).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(
        <OrganizationChartUpload
          chartId={1}
          onUploadSuccess={vi.fn()}
        />
      );

      expect(screen.getByText(/Subir Organigrama en PDF/i)).toBeInTheDocument();
      expect(screen.getByText(/Arrastra un archivo PDF aquí/i)).toBeInTheDocument();
    });

    it("should display uploaded PDFs", () => {
      const mockPDFs = [
        {
          id: 1,
          chartId: 1,
          fileName: "organigrama.pdf",
          fileUrl: "https://example.com/pdf",
          uploadedByName: "Admin",
          uploadedAt: new Date(),
        },
      ];

      vi.mocked(trpc.organizationChart.getFiles.useQuery).mockReturnValue({
        data: mockPDFs,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(
        <OrganizationChartUpload
          chartId={1}
          onUploadSuccess={vi.fn()}
        />
      );

      expect(screen.getByText(/PDFs Subidos/i)).toBeInTheDocument();
      expect(screen.getByText(/organigrama.pdf/i)).toBeInTheDocument();
    });

    it("should handle file selection", async () => {
      vi.mocked(trpc.organizationChart.getFiles.useQuery).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const mockUpload = vi.fn().mockResolvedValue({});
      vi.mocked(trpc.organizationChart.uploadPDF.useMutation).mockReturnValue({
        mutateAsync: mockUpload,
        isPending: false,
      } as any);

      render(
        <OrganizationChartUpload
          chartId={1}
          onUploadSuccess={vi.fn()}
        />
      );

      const input = screen.getByRole("button", { name: /Arrastra un archivo PDF aquí/i });
      expect(input).toBeInTheDocument();
    });
  });

  describe("OrganizationChartViewer", () => {
    it("should show empty state when no files uploaded", () => {
      vi.mocked(trpc.organizationChart.getFiles.useQuery).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<OrganizationChartViewer chartId={1} />);

      expect(screen.getByText(/No hay un organigrama subido aún/i)).toBeInTheDocument();
    });

    it("should display PDF when file exists", () => {
      vi.mocked(trpc.organizationChart.getFiles.useQuery).mockReturnValue({
        data: [
          {
            id: 1,
            chartId: 1,
            fileName: "organigrama.pdf",
            fileUrl: "https://s3.example.com/organigrama.pdf",
            uploadedByName: "Admin",
            uploadedAt: new Date(),
          },
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<OrganizationChartViewer chartId={1} />);

      expect(screen.getByText(/organigrama.pdf/i)).toBeInTheDocument();
      expect(screen.getByText(/Descargar/i)).toBeInTheDocument();
    });
  });

  describe("OrganizationChartNode", () => {
    const mockNode = {
      id: 1,
      nodeId: "node-1",
      parentNodeId: null,
      position: "Gerente General",
      name: "Juan Pérez",
      email: "juan@example.com",
      phone: "555-1234",
      responsibilities: "Gestión general",
      salary: 5000,
      level: 0,
    };

    const mockChildren = [
      {
        id: 2,
        nodeId: "node-2",
        parentNodeId: "node-1",
        position: "Gerente de Ventas",
        name: "María García",
        email: "maria@example.com",
        phone: "555-5678",
        responsibilities: "Gestión de ventas",
        salary: 3000,
        level: 1,
      },
    ];

    it("should render node with position", () => {
      render(
        <OrganizationChartNode
          node={mockNode}
          allNodes={[mockNode]}
          viewType="basic"
          isGG={true}
        />
      );

      expect(screen.getByText(/Gerente General/i)).toBeInTheDocument();
    });

    it("should show details in complete view", () => {
      render(
        <OrganizationChartNode
          node={mockNode}
          allNodes={[mockNode]}
          viewType="complete"
          isGG={true}
        />
      );

      expect(screen.getByText(/Juan Pérez/i)).toBeInTheDocument();
      expect(screen.getByText(/juan@example.com/i)).toBeInTheDocument();
    });

    it("should show salary only in financial view for GG", () => {
      const { rerender } = render(
        <OrganizationChartNode
          node={mockNode}
          allNodes={[mockNode]}
          viewType="financial"
          isGG={true}
        />
      );

      expect(screen.getByText(/Salario:/i)).toBeInTheDocument();

      rerender(
        <OrganizationChartNode
          node={mockNode}
          allNodes={[mockNode]}
          viewType="financial"
          isGG={false}
        />
      );

      expect(screen.queryByText(/Salario:/i)).not.toBeInTheDocument();
    });

    it("should show expand/collapse button for nodes with children", () => {
      render(
        <OrganizationChartNode
          node={mockNode}
          allNodes={[mockNode, ...mockChildren]}
          viewType="basic"
          isGG={true}
        />
      );

      expect(screen.getByText(/\+1 posición/i)).toBeInTheDocument();
    });

    it("should expand children on button click", async () => {
      render(
        <OrganizationChartNode
          node={mockNode}
          allNodes={[mockNode, ...mockChildren]}
          viewType="basic"
          isGG={true}
        />
      );

      const expandButton = screen.getByRole("button");
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText(/Gerente de Ventas/i)).toBeInTheDocument();
      });
    });
  });

});
