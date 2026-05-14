import { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";

interface Node {
  id: number;
  nodeId: string;
  parentNodeId: string | null;
  position: string;
  personName: string | null;
  email: string | null;
  phone: string | null;
  responsibilities: string | null;
  salary: number | null;
  level: number;
}

interface OrganizationChartFlowProps {
  nodes: Node[];
  viewType: "basic" | "complete" | "financial";
  isGG: boolean;
}

// Custom node component
function OrganizationNode({ data }: any) {
  const showDetails = data.viewType === "complete" || data.viewType === "financial";
  const showSalary = data.viewType === "financial";

  return (
    <div
      className={`flex flex-col p-3 rounded-lg border-2 shadow-md ${
        data.level === 0
          ? "border-blue-500 bg-blue-50 min-w-56"
          : "border-gray-300 bg-white min-w-48"
      }`}
    >
      {/* Position */}
      <p className="font-bold text-sm text-gray-900">{data.position}</p>

      {/* Details */}
      {showDetails && (
        <div className="text-xs text-gray-600 space-y-1 mt-2">
          {data.personName && <p>👤 {data.personName}</p>}
          {data.email && <p>📧 {data.email}</p>}
          {data.phone && <p>📱 {data.phone}</p>}
          {data.responsibilities && (
            <p className="text-gray-700 italic">Resp: {data.responsibilities.substring(0, 30)}...</p>
          )}
          {showSalary && data.salary && (
            <p className="font-semibold text-green-700">
              ${data.salary.toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Basic view */}
      {!showDetails && data.personName && (
        <p className="text-xs text-gray-600 mt-1">{data.personName}</p>
      )}

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  organization: OrganizationNode,
};

// Calculate hierarchical layout positions
function calculateHierarchicalLayout(allNodes: Node[]) {
  const nodeMap = new Map<number, Node>();
  const childrenMap = new Map<number | string | null, Node[]>();
  
  allNodes.forEach((node) => {
    nodeMap.set(node.id, node);
    if (!childrenMap.has(node.parentNodeId)) {
      childrenMap.set(node.parentNodeId, []);
    }
    childrenMap.get(node.parentNodeId)?.push(node);
  });

  const positions = new Map<number, { x: number; y: number }>();
  const levelWidths = new Map<number, number>();
  const levelCounts = new Map<number, number>();

  // First pass: count nodes per level
  const countNodesPerLevel = (nodeId: number | null) => {
    const children = childrenMap.get(nodeId) || [];
    children.forEach((child) => {
      const level = child.level;
      levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
      countNodesPerLevel(child.id);
    });
  };

  countNodesPerLevel(null);

  // Second pass: calculate positions
  const assignPositions = (nodeId: number | string | null, parentX: number, level: number, indexInLevel: number) => {
    const children = childrenMap.get(nodeId as number | null) || [];
    const levelCount = levelCounts.get(level) || 1;
    const horizontalSpacing = Math.max(280, 1000 / Math.max(1, levelCount));
    const verticalSpacing = 200;

    children.forEach((child, childIndex) => {
      let childIndexInLevel = 0;
      for (let i = 0; i < child.level; i++) {
        if (allNodes.filter((n) => n.level === i).length > 0) {
          childIndexInLevel = allNodes.filter((n) => n.level === child.level && n.parentNodeId === nodeId).indexOf(child);
        }
      }

      const childLevelCount = childrenMap.get(child.id)?.length || 0;
      const x = parentX + (childIndex - children.length / 2 + 0.5) * horizontalSpacing;
      const y = level * verticalSpacing + verticalSpacing;

      positions.set(child.id, { x, y });
      assignPositions(child.id, x, level + 1, childIndex);
    });
  };

  // Start from root nodes (parentNodeId is null)
  const rootNodes = childrenMap.get(null) || [];
  const rootLevelCount = rootNodes.length;
  const horizontalSpacing = Math.max(400, 1200 / Math.max(1, rootLevelCount));

  rootNodes.forEach((root, index) => {
    const x = (index - rootLevelCount / 2 + 0.5) * horizontalSpacing;
    positions.set(root.id, { x, y: 0 });
    assignPositions(root.id, x, 1, index);
  });

  return positions;
}

function FlowContent({ nodes: allNodes, viewType, isGG }: OrganizationChartFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const positionsMap = calculateHierarchicalLayout(allNodes);

    const flowNodes = allNodes.map((node) => {
      const pos = positionsMap.get(node.id) || { x: 0, y: 0 };
      return {
        id: String(node.id),
        data: {
          position: node.position,
          personName: node.personName,
          email: node.email,
          phone: node.phone,
          responsibilities: node.responsibilities,
          salary: node.salary,
          level: node.level,
          viewType,
          isGG,
        },
        position: pos,
        type: "organization",
      };
    });

    const flowEdges = allNodes
      .filter((node) => node.parentNodeId)
      .map((node) => {
        const parentNode = allNodes.find((n) => n.nodeId === node.parentNodeId);
        return {
          id: `${node.parentNodeId}-${node.id}`,
          source: String(parentNode?.id),
          target: String(node.id),
        };
      });

    return { nodes: flowNodes, edges: flowEdges };
  }, [allNodes, viewType, isGG]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}

export default function OrganizationChartFlow({
  nodes,
  viewType,
  isGG,
}: OrganizationChartFlowProps) {
  return (
    <div className="w-full h-[600px] border rounded-lg overflow-hidden">
      <ReactFlowProvider>
        <FlowContent nodes={nodes} viewType={viewType} isGG={isGG} />
      </ReactFlowProvider>
    </div>
  );
}
