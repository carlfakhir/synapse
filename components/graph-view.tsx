"use client";

// Obsidian-style force-directed graph of the whole vault.
//
// Hand-rolled physics (repulsion + spring + centering + damping) — no d3
// dependency. The simulation runs on an rAF loop for ~2s, then settles.
// Nodes can be dragged, and clicking a node focuses it in the viewer.
//
// Why hand-rolled: the layout we need is simple enough that d3-force
// would be 10KB of library for 30 lines of logic, and keeping the graph
// component dep-free means it's portable if we ever extract it.

import { useEffect, useRef, useState, useMemo } from "react";
import type { Note, NoteId } from "@/lib/engine";

interface Edge {
  source: NoteId;
  target: NoteId;
  weight: number;
  kind: "wiki" | "semantic";
}

interface GraphViewProps {
  notes: Note[];
  edges: Edge[];
  activeId: NoteId | null;
  onSelect: (id: NoteId) => void;
}

interface SimNode {
  id: NoteId;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
}

const WIDTH = 900;
const HEIGHT = 600;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

export function GraphView({ notes, edges, activeId, onSelect }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tick, setTick] = useState(0);
  const [dragging, setDragging] = useState<NoteId | null>(null);

  // Build the simulation node array once per (notes, edges) change.
  const simNodesRef = useRef<Map<NoteId, SimNode>>(new Map());

  const degrees = useMemo(() => {
    const d = new Map<NoteId, number>();
    for (const e of edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  useEffect(() => {
    const map = new Map<NoteId, SimNode>();
    notes.forEach((n, i) => {
      // Seed nodes on a circle so the initial layout isn't pathological.
      const angle = (i / notes.length) * Math.PI * 2;
      const r = 180;
      map.set(n.id, {
        id: n.id,
        title: n.title,
        x: CENTER_X + Math.cos(angle) * r,
        y: CENTER_Y + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        degree: degrees.get(n.id) ?? 0,
      });
    });
    simNodesRef.current = map;
    setTick((t) => t + 1);
  }, [notes, degrees]);

  // The force simulation: repulsion + spring + centering + damping.
  // Runs continuously but quickly settles; cheap enough to keep animating
  // so drags feel live.
  useEffect(() => {
    let raf = 0;
    let iteration = 0;

    const step = () => {
      const nodes = [...simNodesRef.current.values()];
      if (nodes.length === 0) {
        raf = requestAnimationFrame(step);
        return;
      }

      // Temperature cools over time so the layout settles, but never to
      // zero — dragging a node should still cause neighbors to respond.
      const temperature = Math.max(0.1, 1 - iteration / 300);

      // Pairwise repulsion (Coulomb-like, O(n^2) — fine for ≤100 nodes).
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy + 0.01;
          const dist = Math.sqrt(distSq);
          const force = 2800 / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Edge springs: connected nodes pull toward each other.
      for (const e of edges) {
        const a = simNodesRef.current.get(e.source);
        const b = simNodesRef.current.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy + 0.01);
        const rest = e.kind === "wiki" ? 90 : 140;
        const stiffness = e.kind === "wiki" ? 0.06 : 0.03 * e.weight;
        const disp = (dist - rest) * stiffness;
        const fx = (dx / dist) * disp;
        const fy = (dy / dist) * disp;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Gentle centering so the graph doesn't drift offscreen.
      for (const n of nodes) {
        n.vx += (CENTER_X - n.x) * 0.002;
        n.vy += (CENTER_Y - n.y) * 0.002;
      }

      // Integrate velocities with damping — except the node being dragged,
      // which is under the user's control and shouldn't feel physics.
      for (const n of nodes) {
        if (n.id === dragging) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= 0.78;
        n.vy *= 0.78;
        n.x += n.vx * temperature;
        n.y += n.vy * temperature;
      }

      iteration++;
      setTick((t) => t + 1);
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, dragging]);

  // Drag handling: convert client coordinates back into SVG space.
  const onPointerDown = (id: NoteId) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(id);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    const node = simNodesRef.current.get(dragging);
    if (node) {
      node.x = loc.x;
      node.y = loc.y;
    }
  };
  const onPointerUp = () => setDragging(null);

  // Short-circuit if data isn't ready.
  if (simNodesRef.current.size === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#666]">
        Building graph…
      </div>
    );
  }

  const nodes = [...simNodesRef.current.values()];
  // Keep `tick` referenced so React re-renders on physics updates.
  void tick;

  return (
    <div className="flex-1 flex items-center justify-center bg-[#141414] relative overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-full max-w-5xl max-h-[90vh]"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Edges first so nodes render on top */}
        <g>
          {edges.map((e, i) => {
            const a = simNodesRef.current.get(e.source);
            const b = simNodesRef.current.get(e.target);
            if (!a || !b) return null;
            const isActive = activeId && (a.id === activeId || b.id === activeId);
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={
                  isActive
                    ? "#9d7aff"
                    : e.kind === "wiki"
                      ? "#3d4a66"
                      : "#2e2e3a"
                }
                strokeWidth={
                  isActive ? 2 : e.kind === "wiki" ? 1.4 : 0.8 + e.weight * 0.8
                }
                strokeDasharray={e.kind === "semantic" ? "3 3" : undefined}
                opacity={isActive ? 1 : 0.7}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {nodes.map((n) => {
            const r = 6 + Math.min(n.degree, 8) * 1.4;
            const isActive = n.id === activeId;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                style={{ cursor: dragging === n.id ? "grabbing" : "grab" }}
                onPointerDown={onPointerDown(n.id)}
                onClick={(e) => {
                  // Only count as a click if we weren't dragging.
                  if (!dragging) {
                    e.stopPropagation();
                    onSelect(n.id);
                  }
                }}
              >
                <circle
                  r={r + (isActive ? 3 : 0)}
                  fill={isActive ? "#9d7aff" : "#5a4a8a"}
                  stroke={isActive ? "#c9b3ff" : "#7a6ab0"}
                  strokeWidth={1.5}
                />
                <text
                  x={r + 6}
                  y={4}
                  fontSize={11}
                  fill={isActive ? "#f0ebff" : "#b8b0d4"}
                  fontWeight={isActive ? 600 : 400}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {n.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-4 left-4 text-[10px] text-[#555] leading-relaxed">
        Solid lines: wiki-linked · Dashed lines: semantic neighbors
        <br />
        Drag nodes to rearrange · Click to focus
      </div>
    </div>
  );
}
