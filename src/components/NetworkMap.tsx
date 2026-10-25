import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radio,
  Zap,
  Activity,
  Cpu,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  Wrench,
  History,
  Battery,
} from 'lucide-react';
import type {
  NetworkMapData,
  NetworkMapNode,
  ZigbeeDevice,
} from '../types/device';

export interface NetworkMapProps {
  data: NetworkMapData | null;
  devices: ZigbeeDevice[];
  isLoading?: boolean;
  onScanMap: () => Promise<NetworkMapData>;
  onPing?: (device: ZigbeeDevice) => Promise<boolean>;
  onInterview?: (device: ZigbeeDevice) => Promise<boolean>;
  onDiagnose?: (device: ZigbeeDevice) => void;
  onViewHistory?: (device: ZigbeeDevice) => void;
}

interface SimulatedNode extends NetworkMapNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isDragging?: boolean;
}

function computeInitialNodes(data: NetworkMapData | null): SimulatedNode[] {
  if (!data || !data.nodes || data.nodes.length === 0) {
    return [];
  }

  const width = 1000;
  const height = 700;
  const centerX = width / 2;
  const centerY = height / 2;

  const coordinator = data.nodes.find((n) => n.type === 'Coordinator');
  const routers = data.nodes.filter((n) => n.type === 'Router');
  const endDevices = data.nodes.filter(
    (n) => n.type !== 'Coordinator' && n.type !== 'Router'
  );

  const initialNodes: SimulatedNode[] = [];

  // 1. Coordinator at center-top
  if (coordinator) {
    initialNodes.push({
      ...coordinator,
      x: centerX,
      y: centerY - 140,
      vx: 0,
      vy: 0,
    });
  }

  // 2. Routers in inner circle
  const routerRadius = 200;
  routers.forEach((r, idx) => {
    const angle = (idx / Math.max(1, routers.length)) * 2 * Math.PI - Math.PI / 2;
    initialNodes.push({
      ...r,
      x: centerX + routerRadius * Math.cos(angle),
      y: centerY + routerRadius * Math.sin(angle) * 0.75,
      vx: 0,
      vy: 0,
    });
  });

  // 3. End devices in outer circle
  const endDevRadius = 340;
  endDevices.forEach((ed, idx) => {
    const angle = (idx / Math.max(1, endDevices.length)) * 2 * Math.PI - Math.PI / 2;
    initialNodes.push({
      ...ed,
      x: centerX + endDevRadius * Math.cos(angle),
      y: centerY + endDevRadius * Math.sin(angle) * 0.85,
      vx: 0,
      vy: 0,
    });
  });

  // Run 60 force relaxation steps to space out nicely
  for (let step = 0; step < 60; step++) {
    for (let i = 0; i < initialNodes.length; i++) {
      for (let j = i + 1; j < initialNodes.length; j++) {
        const dx = initialNodes[j].x - initialNodes[i].x;
        const dy = initialNodes[j].y - initialNodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = 90;
        if (dist < minDist) {
          const force = (minDist - dist) / dist * 0.5;
          if (initialNodes[i].type !== 'Coordinator') {
            initialNodes[i].x -= dx * force;
            initialNodes[i].y -= dy * force;
          }
          if (initialNodes[j].type !== 'Coordinator') {
            initialNodes[j].x += dx * force;
            initialNodes[j].y += dy * force;
          }
        }
      }
    }
  }

  return initialNodes;
}

export const NetworkMap: React.FC<NetworkMapProps> = ({
  data,
  devices,
  isLoading = false,
  onScanMap,
  onPing,
  onInterview,
  onDiagnose,
  onViewHistory,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport transform
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Filtering & Display options
  const [showLqiLabels, setShowLqiLabels] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'routers_only'>('all');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Selection & Actions
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Nodes simulation state
  const [simNodes, setSimNodes] = useState<SimulatedNode[]>(() => computeInitialNodes(data));
  const draggingNodeRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

  // Initialize simulation positions
  useEffect(() => {
    setSimNodes(computeInitialNodes(data));
  }, [data]);

  // Links to render based on filter
  const activeLinks = useMemo(() => {
    if (!data || !data.links) return [];
    if (filterMode === 'routers_only') {
      const routerIeees = new Set(
        simNodes
          .filter((n) => n.type === 'Coordinator' || n.type === 'Router')
          .map((n) => n.ieeeAddr.toLowerCase())
      );
      return data.links.filter(
        (l) =>
          routerIeees.has(l.sourceIeee.toLowerCase()) &&
          routerIeees.has(l.targetIeee.toLowerCase())
      );
    }
    return data.links;
  }, [data, filterMode, simNodes]);

  // Find node by IEEE
  const nodeMap = useMemo(() => {
    const map = new Map<string, SimulatedNode>();
    for (const node of simNodes) {
      map.set(node.ieeeAddr.toLowerCase(), node);
      map.set(node.friendlyName.toLowerCase(), node);
    }
    return map;
  }, [simNodes]);

  // Selected Node full data
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return simNodes.find(
      (n) =>
        n.ieeeAddr.toLowerCase() === selectedNodeId.toLowerCase() ||
        n.friendlyName.toLowerCase() === selectedNodeId.toLowerCase()
    );
  }, [selectedNodeId, simNodes]);

  const selectedDevice = useMemo(() => {
    if (!selectedNode) return null;
    return devices.find(
      (d) =>
        d.ieee_address.toLowerCase() === selectedNode.ieeeAddr.toLowerCase() ||
        d.friendly_name.toLowerCase() === selectedNode.friendlyName.toLowerCase()
    );
  }, [selectedNode, devices]);

  // Canvas Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (draggingNodeRef.current) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    } else if (draggingNodeRef.current) {
      const { id } = draggingNodeRef.current;
      setSimNodes((prev) =>
        prev.map((n) => {
          if (
            n.ieeeAddr.toLowerCase() === id.toLowerCase() ||
            n.friendlyName.toLowerCase() === id.toLowerCase()
          ) {
            return {
              ...n,
              x: (e.clientX - pan.x - 500) / zoom + 500,
              y: (e.clientY - pan.y - 350) / zoom + 350,
            };
          }
          return n;
        })
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    draggingNodeRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.3, Math.min(2.5, prev * zoomFactor)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Node Dragging Start
  const startDragNode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    draggingNodeRef.current = { id, startX: e.clientX, startY: e.clientY };
    setSelectedNodeId(id);
  };

  // Scan Action
  const handleTriggerScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      await onScanMap();
    } finally {
      setIsScanning(false);
    }
  };

  // Node color & style helpers
  const getLinkColor = (lqi?: number) => {
    const val = lqi ?? 100;
    if (val >= 100) return '#10b981'; // emerald-500
    if (val >= 50) return '#f59e0b'; // amber-500
    return '#f43f5e'; // rose-500
  };

  return (
    <div
      className={`relative w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[750px]'
      }`}
    >
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md z-10">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Topologie du Réseau Zigbee
              </h2>
              {data?.isSynthetic && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Vue estimée
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {simNodes.length} nœuds (1 coordinateur,{' '}
              {simNodes.filter((n) => n.type === 'Router').length} routeurs,{' '}
              {simNodes.filter((n) => n.type === 'EndDevice').length} capteurs) &bull;{' '}
              {activeLinks.length} liaisons radio
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Filter links mode */}
          <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterMode === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tous les liens
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('routers_only')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterMode === 'routers_only'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Routeurs seuls
            </button>
          </div>

          {/* LQI Toggle */}
          <button
            type="button"
            onClick={() => setShowLqiLabels(!showLqiLabels)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showLqiLabels
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            LQI: {showLqiLabels ? 'Visible' : 'Masqué'}
          </button>

          {/* Scan Network Radio Button */}
          <button
            type="button"
            onClick={handleTriggerScan}
            disabled={isScanning || isLoading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 border border-indigo-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scan radio (10s)...' : 'Scanner le réseau'}</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center space-x-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-slate-300">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
              className="p-1 hover:text-white rounded"
              title="Zoom avant"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.3, z * 0.85))}
              className="p-1 hover:text-white rounded"
              title="Zoom arrière"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="p-1 hover:text-white rounded"
              title="Recentrer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            title={isFullscreen ? 'Quitter plein écran' : 'Plein écran'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing select-none overflow-hidden bg-slate-950"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Subtle grid background */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-15">
          <defs>
            <pattern
              id="mesh-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#6366f1"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mesh-grid)" />
        </svg>

        {/* Interactive Transform Container */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '500px 350px',
            width: '1000px',
            height: '700px',
            position: 'absolute',
            left: 'calc(50% - 500px)',
            top: 'calc(50% - 350px)',
          }}
        >
          <svg className="w-full h-full overflow-visible">
            {/* Defs for arrow markers and glow filters */}
            <defs>
              <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="22"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
            </defs>

            {/* 1. LINKS (Lines & Curves) */}
            {activeLinks.map((link, idx) => {
              const src = nodeMap.get(link.sourceIeee.toLowerCase());
              const tgt = nodeMap.get(link.targetIeee.toLowerCase());
              if (!src || !tgt) return null;

              const isDirectLink =
                selectedNodeId &&
                (src.ieeeAddr.toLowerCase() === selectedNodeId.toLowerCase() ||
                  tgt.ieeeAddr.toLowerCase() === selectedNodeId.toLowerCase());

              const linkColor = getLinkColor(link.lqi ?? link.linkquality);
              const midX = (src.x + tgt.x) / 2;
              const midY = (src.y + tgt.y) / 2;

              return (
                <g key={`link-${idx}`}>
                  {/* Outer glow line if selected */}
                  {isDirectLink && (
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={linkColor}
                      strokeWidth="6"
                      strokeOpacity="0.4"
                    />
                  )}

                  {/* Main Link Line */}
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={linkColor}
                    strokeWidth={isDirectLink ? 2.5 : 1.5}
                    strokeOpacity={
                      selectedNodeId
                        ? isDirectLink
                          ? 1
                          : 0.15
                        : 0.65
                    }
                    strokeDasharray={
                      tgt.status === 'offline' ? '4 3' : undefined
                    }
                  />

                  {/* LQI Pill on Link */}
                  {showLqiLabels && (
                    <g
                      transform={`translate(${midX}, ${midY})`}
                      opacity={
                        selectedNodeId
                          ? isDirectLink
                            ? 1
                            : 0.2
                          : 0.9
                      }
                    >
                      <rect
                        x="-18"
                        y="-8"
                        width="36"
                        height="16"
                        rx="4"
                        fill="#0f172a"
                        stroke={linkColor}
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fill="#e2e8f0"
                        fontSize="9"
                        fontWeight="600"
                        fontFamily="monospace"
                      >
                        {link.lqi ?? link.linkquality}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* 2. NODES */}
            {simNodes.map((node) => {
              const isSelected =
                selectedNodeId?.toLowerCase() === node.ieeeAddr.toLowerCase() ||
                selectedNodeId?.toLowerCase() === node.friendlyName.toLowerCase();
              const isCoordinator = node.type === 'Coordinator';
              const isRouter = node.type === 'Router';
              const isOffline = node.status === 'offline';

              return (
                <g
                  key={node.ieeeAddr}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer transition-transform"
                  onMouseDown={(e) => startDragNode(e, node.ieeeAddr)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(node.ieeeAddr);
                  }}
                  opacity={
                    selectedNodeId
                      ? isSelected ||
                        activeLinks.some(
                          (l) =>
                            (l.sourceIeee.toLowerCase() === selectedNodeId.toLowerCase() &&
                              l.targetIeee.toLowerCase() === node.ieeeAddr.toLowerCase()) ||
                            (l.targetIeee.toLowerCase() === selectedNodeId.toLowerCase() &&
                              l.sourceIeee.toLowerCase() === node.ieeeAddr.toLowerCase())
                        )
                        ? 1
                        : 0.25
                      : 1
                  }
                >
                  {/* Coordinator Specific Halo */}
                  {isCoordinator && (
                    <circle
                      r="36"
                      fill="#eab308"
                      fillOpacity="0.12"
                      stroke="#eab308"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                      className="animate-spin-slow"
                    />
                  )}

                  {/* Outer selection ring */}
                  {isSelected && (
                    <circle
                      r={isCoordinator ? 32 : isRouter ? 26 : 22}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="3"
                      className="animate-pulse"
                    />
                  )}

                  {/* Main Node Circle */}
                  <circle
                    r={isCoordinator ? 26 : isRouter ? 20 : 16}
                    fill={
                      isCoordinator
                        ? '#ca8a04' // amber-600
                        : isRouter
                        ? '#2563eb' // blue-600
                        : isOffline
                        ? '#475569' // slate-600
                        : '#059669' // emerald-600
                    }
                    stroke={
                      isCoordinator
                        ? '#fef08a'
                        : isRouter
                        ? '#93c5fd'
                        : isOffline
                        ? '#94a3b8'
                        : '#6ee7b7'
                    }
                    strokeWidth="2"
                    filter={isCoordinator ? 'url(#glow-gold)' : undefined}
                  />

                  {/* Icon Representation */}
                  <g transform="translate(-8, -8)" pointerEvents="none">
                    {isCoordinator ? (
                      <Cpu className="h-4 w-4 text-white" />
                    ) : isRouter ? (
                      <Zap className="h-4 w-4 text-white" />
                    ) : (
                      <Activity className="h-4 w-4 text-white" />
                    )}
                  </g>

                  {/* Status Indicator Pip */}
                  {!isCoordinator && (
                    <circle
                      cx={isRouter ? 14 : 11}
                      cy={isRouter ? -14 : -11}
                      r="4"
                      fill={isOffline ? '#f43f5e' : '#10b981'}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />
                  )}

                  {/* Name Label */}
                  <g transform="translate(0, 30)">
                    <rect
                      x={-Math.min(100, Math.max(45, (node.customName || node.friendlyName).length * 4.5))}
                      y="-10"
                      width={Math.min(200, Math.max(90, (node.customName || node.friendlyName).length * 9))}
                      height="18"
                      rx="4"
                      fill="#0f172a"
                      fillOpacity="0.85"
                      stroke={isSelected ? '#38bdf8' : '#334155'}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill={isOffline ? '#94a3b8' : '#f8fafc'}
                      fontSize="10"
                      fontWeight="600"
                    >
                      {node.customName || node.friendlyName}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Bottom Legend */}
        <div className="absolute bottom-4 left-4 p-3 bg-slate-900/90 border border-slate-800 rounded-xl backdrop-blur-md shadow-lg text-xs space-y-2 pointer-events-auto">
          <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            Légende Topologie
          </div>
          <div className="flex items-center space-x-4 text-slate-300">
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-amber-500 border border-amber-300" />
              <span>ConBee II (Coordinateur)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-blue-600 border border-blue-400" />
              <span>Routeur (Secteur)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-600 border border-emerald-400" />
              <span>Capteur (Pile)</span>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-slate-400 text-[11px] border-t border-slate-800 pt-1.5">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-4 bg-emerald-500 rounded" /> LQI &gt; 100
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-4 bg-amber-500 rounded" /> LQI 50-100
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-4 bg-rose-500 rounded" /> LQI &lt; 50
            </span>
          </div>
        </div>

        {/* Selected Node Details Drawer */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-80 bg-slate-900/95 border border-slate-800 rounded-xl backdrop-blur-md shadow-2xl p-4 text-xs space-y-4 animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {selectedNode.type === 'Coordinator'
                    ? 'Coordinateur USB'
                    : selectedNode.type === 'Router'
                    ? 'Routeur Secteur'
                    : 'Capteur sur Pile'}
                </span>
                <h3 className="text-sm font-bold text-white mt-1.5">
                  {selectedNode.customName || selectedNode.friendlyName}
                </h3>
                {selectedNode.customName && (
                  <p className="text-[11px] text-slate-400 font-mono">
                    {selectedNode.friendlyName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Details Grid */}
            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Statut :</span>
                <span
                  className={`font-semibold ${
                    selectedNode.status === 'online' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {selectedNode.status === 'online' ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Adresse IEEE :</span>
                <span className="text-slate-200 font-mono text-[11px]">
                  {selectedNode.ieeeAddr}
                </span>
              </div>
              {selectedNode.model && (
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Modèle :</span>
                  <span className="text-slate-200">{selectedNode.model}</span>
                </div>
              )}
              {selectedNode.vendor && (
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Fabricant :</span>
                  <span className="text-slate-200">{selectedNode.vendor}</span>
                </div>
              )}
              {selectedNode.battery !== null && selectedNode.battery !== undefined && (
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Batterie :</span>
                  <span className="text-slate-200 font-semibold flex items-center gap-1">
                    <Battery className="h-3.5 w-3.5 text-amber-400" />
                    {selectedNode.battery}%
                  </span>
                </div>
              )}
              {selectedNode.linkquality !== null && selectedNode.linkquality !== undefined && (
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Signal (LQI) :</span>
                  <span className="text-slate-200 font-mono">
                    {selectedNode.linkquality} / 255
                  </span>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            {selectedDevice && (
              <div className="pt-2 space-y-2 border-t border-slate-800">
                <div className="text-[11px] font-semibold text-slate-400">Actions rapides</div>
                <div className="grid grid-cols-2 gap-2">
                  {onPing && (selectedNode.type === 'Router' || selectedDevice.type === 'Router') && (
                    <button
                      type="button"
                      onClick={async () => {
                        setActionLoading('ping');
                        try {
                          await onPing(selectedDevice);
                        } finally {
                          setActionLoading(null);
                        }
                      }}
                      disabled={actionLoading !== null}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium transition-colors"
                    >
                      {actionLoading === 'ping' ? 'Ping...' : 'Tester Ping'}
                    </button>
                  )}

                  {onInterview && (
                    <button
                      type="button"
                      onClick={async () => {
                        setActionLoading('interview');
                        try {
                          await onInterview(selectedDevice);
                        } finally {
                          setActionLoading(null);
                        }
                      }}
                      disabled={actionLoading !== null}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium transition-colors"
                    >
                      {actionLoading === 'interview' ? 'Interview...' : 'Interview'}
                    </button>
                  )}

                  {onDiagnose && (
                    <button
                      type="button"
                      onClick={() => onDiagnose(selectedDevice)}
                      className="col-span-2 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>Diagnostiquer</span>
                    </button>
                  )}

                  {onViewHistory && (
                    <button
                      type="button"
                      onClick={() => onViewHistory(selectedDevice)}
                      className="col-span-2 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <History className="h-3.5 w-3.5" />
                      <span>Voir l&apos;historique</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
