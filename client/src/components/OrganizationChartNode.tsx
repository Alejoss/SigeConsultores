import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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

interface OrganizationChartNodeProps {
  node: Node;
  allNodes: Node[];
  viewType: "basic" | "complete" | "financial";
  isGG: boolean;
  level?: number;
}

export default function OrganizationChartNode({
  node,
  allNodes,
  viewType,
  isGG,
  level = 0,
}: OrganizationChartNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get children of this node
  const children = allNodes.filter((n) => n.parentNodeId === node.nodeId);
  const hasChildren = children.length > 0;

  // Determine what to show based on view type
  const showDetails = viewType === "complete" || viewType === "financial";
  const showSalary = viewType === "financial" && isGG;

  return (
    <div className="flex flex-col items-start gap-2">
      {/* Node Box */}
      <div
        className={`flex items-start gap-3 p-3 rounded-lg border-2 transition ${
          level === 0
            ? "border-blue-500 bg-blue-50 min-w-64"
            : "border-gray-300 bg-white min-w-56"
        }`}
      >
        {/* Expand/Collapse Button */}
        {hasChildren && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 mt-1 text-gray-600 hover:text-gray-900"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Node Content */}
        <div className="flex-1 min-w-0">
          {/* Position (always shown) */}
          <p className="font-bold text-sm truncate">{node.position}</p>

          {/* Details (expandible or always shown based on view) */}
          {showDetails && (
            <div className="text-xs text-gray-600 space-y-1 mt-2">
              {node.personName && <p>👤 {node.personName}</p>}
              {node.email && <p>📧 {node.email}</p>}
              {node.phone && <p>📱 {node.phone}</p>}
              {node.responsibilities && (
                <p className="text-gray-700 italic">Responsabilidades: {node.responsibilities}</p>
              )}
              {showSalary && node.salary && (
                <p className="font-semibold text-green-700">
                  Salario: ${node.salary.toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Basic view - show as expandible */}
          {!showDetails && (
            <p className="text-xs text-gray-600">
              {node.personName ? `${node.personName}` : "Sin asignar"}
            </p>
          )}
        </div>
      </div>

      {/* Children (if expanded) */}
      {hasChildren && isExpanded && (
        <div className="ml-8 border-l-2 border-gray-300 pl-4 space-y-4">
          {children.map((child) => (
            <OrganizationChartNode
              key={child.id}
              node={child}
              allNodes={allNodes}
              viewType={viewType}
              isGG={isGG}
              level={level + 1}
            />
          ))}
        </div>
      )}

      {/* Collapsed indicator */}
      {hasChildren && !isExpanded && (
        <p className="text-xs text-gray-500 ml-7">
          +{children.length} posición{children.length > 1 ? "es" : ""}
        </p>
      )}
    </div>
  );
}
