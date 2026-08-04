"use client";

import { useEffect, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { EntityRelationship } from "@scout/types";

type DataModelEntry = { entity: string; description: string; keyFields: string[] };

const CARDINALITY_LABEL: Record<EntityRelationship["cardinality"], string> = {
  one_to_one: "1:1",
  one_to_many: "1:N",
  many_to_many: "N:N",
};

const NODE_WIDTH = 224;
const NODE_HEIGHT = 104;

// A relationship referencing an entity outside dataModel has nothing to anchor to on
// the canvas -- dagre would otherwise silently invent a floating node for it.
function usableRelationships(entityRelationships: EntityRelationship[], entities: DataModelEntry[]) {
  const known = new Set(entities.map((e) => e.entity));
  return entityRelationships.filter((rel) => known.has(rel.from) && known.has(rel.to));
}

// Grid fallback for entities dagre can't place (no relationships reference them at all).
function layout(entities: DataModelEntry[], relationships: EntityRelationship[]): Node[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 96, marginx: 24, marginy: 24 });

  entities.forEach((entity) => {
    graph.setNode(entity.entity, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  relationships.forEach((rel) => {
    graph.setEdge(rel.from, rel.to);
  });

  dagre.layout(graph);

  return entities.map((entity) => {
    const pos = graph.node(entity.entity);
    return {
      id: entity.entity,
      type: "entity",
      // dagre positions are node centers; react-flow positions are top-left corners.
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { entity },
    };
  });
}

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function EntityNode({ data, selected }: NodeProps) {
  const entity = data.entity as DataModelEntry;
  return (
    <div
      className={`w-56 rounded-lg bg-stone-900 px-3 py-2.5 text-left shadow-sm transition dark:bg-white ${
        selected ? "ring-2 ring-accent-400" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-stone-400" />
      <p className="truncate text-sm font-medium text-stone-50 dark:text-stone-900">{entity.entity}</p>
      <p className="mt-1 line-clamp-2 text-xs text-stone-400 dark:text-stone-500">{entity.description}</p>
      {entity.keyFields.length > 0 && (
        <p className="mt-1.5 truncate font-mono text-[10px] text-stone-500 dark:text-stone-400">
          {entity.keyFields.join(", ")}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-stone-400" />
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

export function EntityDiagramCanvas({
  dataModel,
  entityRelationships,
}: {
  dataModel: DataModelEntry[];
  entityRelationships: EntityRelationship[];
}) {
  const [hovered, setHovered] = useState<DataModelEntry | null>(null);
  const isDark = useIsDarkMode();
  const entities = dataModel ?? [];

  const relationships = useMemo(
    () => usableRelationships(entityRelationships ?? [], entities),
    [entityRelationships, entities],
  );

  const nodes = useMemo(() => layout(entities, relationships), [entities, relationships]);

  // Edge/label colors are set inline (not Tailwind classes) since react-flow renders
  // them as raw SVG attributes. The canvas is inverted per-theme (light canvas + black
  // blocks in light mode, dark canvas + white blocks in dark mode), so edges/labels
  // mirror the block color to stay legible against both the canvas and the blocks.
  const edgeStroke = isDark ? "#d6d3d1" : "#44403c";
  const dotColor = isDark ? "#44403c" : "#e7e5e4";
  const labelText = isDark ? "#1c1917" : "#fafaf9";
  const labelBg = isDark ? "#ffffff" : "#1c1917";

  const edges = useMemo<Edge[]>(
    () =>
      relationships.map((rel, i) => ({
        id: `${rel.from}-${rel.to}-${i}`,
        source: rel.from,
        target: rel.to,
        type: "smoothstep",
        label: `${rel.relationship} (${CARDINALITY_LABEL[rel.cardinality]})`,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        labelStyle: { fontSize: 10, fill: labelText },
        labelBgStyle: { fill: labelBg, fillOpacity: 0.95 },
        style: { stroke: edgeStroke, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: edgeStroke },
      })),
    [relationships, edgeStroke, labelText, labelBg],
  );

  if (entities.length === 0) {
    return <p className="text-sm text-stone-500">No entities were found to diagram.</p>;
  }

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onNodeMouseEnter={(_, node) => setHovered(node.data.entity as DataModelEntry)}
          onNodeMouseLeave={() => setHovered(null)}
        >
          <Background gap={20} color={dotColor} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
      {hovered && (
        <div className="pointer-events-none absolute right-3 bottom-3 max-w-xs rounded-lg bg-stone-900/95 p-3 text-xs shadow-lg backdrop-blur dark:bg-white/95">
          <p className="font-medium text-stone-50 dark:text-stone-900">{hovered.entity}</p>
          <p className="mt-1 text-stone-400 dark:text-stone-500">{hovered.description}</p>
          {hovered.keyFields.length > 0 && (
            <p className="mt-1.5 font-mono text-[10px] text-stone-500 dark:text-stone-400">
              {hovered.keyFields.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
