import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bath,
  BedDouble,
  Check,
  ChevronRight,
  Compass,
  CornerDownRight,
  Edit2,
  Eye,
  Grid,
  Hand,
  HelpCircle,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  MousePointer,
  Move,
  Package,
  Pentagon,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Users,
  Utensils,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  FloorPlanPoint,
  FloorPlanShape,
  FloorPlanShapeType,
  InventoryItem,
  Room,
  RoomCategory,
} from '../types/inventory';

export interface FloorPlanViewProps {
  rooms: Room[];
  roomCategories: RoomCategory[];
  items?: InventoryItem[];
  shapes: FloorPlanShape[];
  mode?: 'selector' | 'editor';
  selectedCategoryId?: string | null;
  selectedRoomId?: string | null;
  selectedRoomIds?: string[];
  onSelectRoom?: (room: Room) => void;
  onSelectCategory?: (category: RoomCategory | null) => void;
  onShapesChange?: (newShapes: FloorPlanShape[]) => void;
  onEditRoom?: (room: Room) => void;
  onDeleteRoom?: (room: Room) => void;
  onCreateRoomWithShape?: (
    name: string,
    categoryId?: string | null,
    parentRoomId?: string | null,
    shapeType?: FloorPlanShapeType,
    customShapeData?: { x: number; y: number; width: number; height: number; points?: FloorPlanPoint[] }
  ) => Promise<Room | null>;
  className?: string;
  readOnly?: boolean;
}

export type EditorTool = 'select' | 'pan' | 'draw_rect' | 'draw_square' | 'draw_polygon';

// Generates SVG path string for custom polygons, L-shapes, T-shapes, or rectangles
function getShapePath(shape: FloorPlanShape): string {
  const { shape_type, width: w, height: h, points } = shape;

  if (shape_type === 'polygon' && points && points.length >= 3) {
    return `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')} Z`;
  }

  if (shape_type === 'l_shape') {
    const cutW = w * 0.45;
    const cutH = h * 0.45;
    return `M 0,0 L ${w},0 L ${w},${h - cutH} L ${w - cutW},${h - cutH} L ${w - cutW},${h} L 0,${h} Z`;
  }

  if (shape_type === 't_shape') {
    const stemW = w * 0.4;
    const stemL = (w - stemW) / 2;
    const topH = h * 0.45;
    return `M 0,0 L ${w},0 L ${w},${topH} L ${stemL + stemW},${topH} L ${stemL + stemW},${h} L ${stemL},${h} L ${stemL},${topH} L 0,${topH} Z`;
  }

  // Standard rectangle or square
  return `M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z`;
}

// Calculate resized bounds accurately without distortion
function calcResizedBounds(
  handle: string,
  initial: { x: number; y: number; width: number; height: number },
  deltaWorldX: number,
  deltaWorldY: number,
  snap: boolean,
  grid: number,
  isSquare: boolean
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = initial;
  const minW = 60;
  const minH = 45;

  // Horizontal resizing
  if (handle.includes('e')) {
    let newW = initial.width + deltaWorldX;
    if (snap) newW = Math.round(newW / grid) * grid;
    width = Math.max(minW, newW);
  } else if (handle.includes('w')) {
    let proposedW = initial.width - deltaWorldX;
    if (snap) proposedW = Math.round(proposedW / grid) * grid;
    if (proposedW >= minW) {
      width = proposedW;
      x = initial.x + (initial.width - proposedW);
    }
  }

  // Vertical resizing
  if (handle.includes('s')) {
    let newH = initial.height + deltaWorldY;
    if (snap) newH = Math.round(newH / grid) * grid;
    height = Math.max(minH, newH);
  } else if (handle.includes('n')) {
    let proposedH = initial.height - deltaWorldY;
    if (snap) proposedH = Math.round(proposedH / grid) * grid;
    if (proposedH >= minH) {
      height = proposedH;
      y = initial.y + (initial.height - proposedH);
    }
  }

  if (isSquare) {
    const size = Math.max(width, height);
    width = size;
    height = size;
  }

  return { x, y, width, height };
}

export const FloorPlanView: React.FC<FloorPlanViewProps> = ({
  rooms,
  roomCategories,
  items = [],
  shapes,
  mode = 'selector',
  selectedCategoryId,
  selectedRoomId: propSelectedRoomId,
  selectedRoomIds = [],
  onSelectRoom,
  onSelectCategory,
  onShapesChange,
  onEditRoom,
  onDeleteRoom,
  onCreateRoomWithShape,
  className = '',
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Active editor tool: Select/Move, Hand/Pan, Draw Rectangle, Draw Square, Draw Polygon
  const [activeTool, setActiveTool] = useState<EditorTool>('select');

  // Zoom and Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Grid snap settings
  const [snapToGrid, setSnapToGrid] = useState(true);
  const GRID_SIZE = 15;

  // Selected shape in editor
  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);

  // Local copy of shapes for high-performance 60fps interaction
  const [localShapes, setLocalShapes] = useState<FloorPlanShape[]>([]);

  // Polygon creation points in progress
  const [polygonDraftPoints, setPolygonDraftPoints] = useState<FloorPlanPoint[]>([]);

  // Real-time hover cursor position in world space
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);

  // Drawing preview for rectangle / square
  const [drawingBox, setDrawingBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    shapeType: 'rectangle' | 'square';
  } | null>(null);

  // Active Pointer Interaction State
  const interactionRef = useRef<
    | {
        type: 'drag_shape';
        shapeId: string;
        pointerId: number;
        startPointerWorld: { x: number; y: number };
        initialShapePos: { x: number; y: number };
        nestedInitialPositions: Map<string, { x: number; y: number }>;
        hasMoved: boolean;
      }
    | {
        type: 'resize_shape';
        shapeId: string;
        pointerId: number;
        handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';
        startPointerWorld: { x: number; y: number };
        initialBounds: { x: number; y: number; width: number; height: number };
        isSquare: boolean;
      }
    | {
        type: 'drag_vertex';
        shapeId: string;
        pointerId: number;
        vertexIndex: number;
        startPointerWorld: { x: number; y: number };
        initialPoints: FloorPlanPoint[];
      }
    | {
        type: 'pan_canvas';
        pointerId: number;
        startPointerScreen: { x: number; y: number };
        initialPan: { x: number; y: number };
      }
    | {
        type: 'draw_shape';
        pointerId: number;
        startPointerWorld: { x: number; y: number };
        shapeType: 'rectangle' | 'square';
      }
    | null
  >(null);

  // Multi-touch tracking for pinch-to-zoom on Android
  const touchPointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);

  // Modal dialog to name and categorize newly created shape
  const [isAddingRoomModalOpen, setIsAddingRoomModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCategory, setNewRoomCategory] = useState<string>('');
  const [newRoomParentId, setNewRoomParentId] = useState<string>('');
  const [newRoomShapeType, setNewRoomShapeType] = useState<FloorPlanShapeType>('rectangle');
  const [pendingShapeData, setPendingShapeData] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    points?: FloorPlanPoint[];
  } | null>(null);
  const [isSubmittingNewRoom, setIsSubmittingNewRoom] = useState(false);

  // Quick lookup maps
  const roomMap = useMemo(() => new Map<string, Room>(rooms.map((r) => [r.id, r])), [rooms]);
  const categoryMap = useMemo(() => new Map<string, RoomCategory>(roomCategories.map((c) => [c.id, c])), [roomCategories]);

  // Inventory count badges per room
  const itemsCountByRoom = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.room_assignments && it.room_assignments.length > 0) {
        for (const ass of it.room_assignments) {
          map.set(ass.room_id, (map.get(ass.room_id) || 0) + (ass.quantity || 1));
        }
      } else if (it.room_id) {
        map.set(it.room_id, (map.get(it.room_id) || 0) + (it.expected_quantity || 1));
      }
    }
    return map;
  }, [items]);

  // Synchronize incoming shapes prop with local state, auto-generating shapes for any missing rooms
  useEffect(() => {
    const list: FloorPlanShape[] = [...shapes];
    const coveredRoomIds = new Set(list.filter((s) => s.room_id).map((s) => s.room_id!));
    const missingRooms = rooms.filter((r) => !coveredRoomIds.has(r.id));

    if (missingRooms.length > 0) {
      const startX = 60;
      const startY = 60;
      const w = 180;
      const h = 130;
      const gap = 24;
      const cols = 3;

      missingRooms.forEach((r, idx) => {
        const offsetIndex = list.length + idx;
        const col = offsetIndex % cols;
        const row = Math.floor(offsetIndex / cols);

        list.push({
          id: `local-gen-${r.id}`,
          room_id: r.id,
          shape_type: 'rectangle',
          x: startX + col * (w + gap),
          y: startY + row * (h + gap),
          width: w,
          height: h,
          parent_room_id: r.room_type === 'suite_bathroom' && r.suite_id ? r.suite_id : null,
          color: r.room_category?.color || null,
          z_index: r.room_type === 'suite_bathroom' ? 2 : 1,
        });
      });
    }

    setLocalShapes(list);
  }, [shapes, rooms]);

  // Conversion: Screen (client) -> World (floor plan space)
  const screenToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      return {
        x: (screenX - pan.x) / zoom,
        y: (screenY - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom]
  );

  // Conversion: World -> Screen
  const worldToScreen = useCallback(
    (worldX: number, worldY: number): { x: number; y: number } => {
      return {
        x: worldX * zoom + pan.x,
        y: worldY * zoom + pan.y,
      };
    },
    [pan.x, pan.y, zoom]
  );

  // Snap coordinate to grid if enabled
  const snapVal = useCallback(
    (val: number) => {
      return snapToGrid ? Math.round(val / GRID_SIZE) * GRID_SIZE : Math.round(val);
    },
    [snapToGrid]
  );

  // Zoom handlers (focus-preserving)
  const handleZoomIn = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - pan.x) / zoom;
    const worldY = (centerY - pan.y) / zoom;
    const newZoom = Math.min(zoom * 1.25, 3.5);

    setZoom(newZoom);
    setPan({
      x: centerX - worldX * newZoom,
      y: centerY - worldY * newZoom,
    });
  };

  const handleZoomOut = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - pan.x) / zoom;
    const worldY = (centerY - pan.y) / zoom;
    const newZoom = Math.max(zoom * 0.8, 0.35);

    setZoom(newZoom);
    setPan({
      x: centerX - worldX * newZoom,
      y: centerY - worldY * newZoom,
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Fit all shapes into visible screen
  const handleFitToScreen = useCallback(() => {
    if (localShapes.length === 0 || !containerRef.current) return;
    const minX = Math.min(...localShapes.map((s) => s.x));
    const minY = Math.min(...localShapes.map((s) => s.y));
    const maxX = Math.max(...localShapes.map((s) => s.x + s.width), 300);
    const maxY = Math.max(...localShapes.map((s) => s.y + s.height), 200);

    const padding = 70;
    const contentW = Math.max(maxX - minX + padding * 2, 200);
    const contentH = Math.max(maxY - minY + padding * 2, 200);

    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth === 0 || clientHeight === 0) return;

    const scaleX = clientWidth / contentW;
    const scaleY = clientHeight / contentH;
    const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.6);

    setZoom(newScale);
    setPan({
      x: (clientWidth - (maxX - minX) * newScale) / 2 - minX * newScale,
      y: (clientHeight - (maxY - minY) * newScale) / 2 - minY * newScale,
    });
  }, [localShapes]);

  // Initial fit to screen on mount
  useEffect(() => {
    const t = setTimeout(() => handleFitToScreen(), 120);
    return () => clearTimeout(t);
  }, []);

  // Mouse wheel zoom (focus follows mouse pointer)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.35), 3.5);

    const worldX = (mouseScreenX - pan.x) / zoom;
    const worldY = (mouseScreenY - pan.y) / zoom;

    setZoom(newZoom);
    setPan({
      x: mouseScreenX - worldX * newZoom,
      y: mouseScreenY - worldY * newZoom,
    });
  };

  // ---------------------------------------------------------------------------
  // POINTER EVENT HANDLERS (UNIFIED FOR MOUSE, TRACKPAD & ANDROID TOUCH)
  // ---------------------------------------------------------------------------

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;

    // Register touch pointer for multi-touch pinch
    touchPointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Handle two-finger pinch gesture start
    if (touchPointersRef.current.size === 2) {
      const pts = Array.from(touchPointersRef.current.values());
      pinchStartDistRef.current = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      pinchStartZoomRef.current = zoom;
      interactionRef.current = null;
      return;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);
    const snappedWorld = { x: snapVal(worldPos.x), y: snapVal(worldPos.y) };

    // 1. Drawing Polygon mode
    if (activeTool === 'draw_polygon' && mode === 'editor' && !readOnly) {
      e.preventDefault();
      // If clicking near the first point, close and finish the polygon
      if (polygonDraftPoints.length >= 3) {
        const first = polygonDraftPoints[0];
        const dist = Math.hypot(snappedWorld.x - first.x, snappedWorld.y - first.y);
        if (dist < 20 / zoom) {
          finishPolygonCreation();
          return;
        }
      }
      setPolygonDraftPoints((prev) => [...prev, snappedWorld]);
      return;
    }

    // 2. Drawing Rectangle / Square mode
    if ((activeTool === 'draw_rect' || activeTool === 'draw_square') && mode === 'editor' && !readOnly) {
      e.preventDefault();
      const shapeType = activeTool === 'draw_square' ? 'square' : 'rectangle';
      interactionRef.current = {
        type: 'draw_shape',
        pointerId: e.pointerId,
        startPointerWorld: snappedWorld,
        shapeType,
      };
      setDrawingBox({
        startX: snappedWorld.x,
        startY: snappedWorld.y,
        currentX: snappedWorld.x,
        currentY: snappedWorld.y,
        shapeType,
      });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 3. Pan tool or middle-click or spacebar or clicking background
    if (
      activeTool === 'pan' ||
      e.button === 1 ||
      (e.target as HTMLElement).id === 'floorplan-canvas-bg' ||
      (e.target as HTMLElement).tagName === 'svg'
    ) {
      interactionRef.current = {
        type: 'pan_canvas',
        pointerId: e.pointerId,
        startPointerScreen: { x: e.clientX, y: e.clientY },
        initialPan: { ...pan },
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      // Clicking blank background deselects in editor mode
      if ((e.target as HTMLElement).id === 'floorplan-canvas-bg' || (e.target as HTMLElement).tagName === 'svg') {
        if (activeShapeId && activeTool === 'select') {
          setActiveShapeId(null);
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Multi-touch pinch-to-zoom update
    if (touchPointersRef.current.has(e.pointerId)) {
      touchPointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }

    if (touchPointersRef.current.size === 2 && pinchStartDistRef.current && containerRef.current) {
      const pts = Array.from(touchPointersRef.current.values());
      const currentDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      const ratio = currentDist / pinchStartDistRef.current;
      const targetZoom = Math.min(Math.max(pinchStartZoomRef.current * ratio, 0.35), 3.5);

      const rect = containerRef.current.getBoundingClientRect();
      const midScreenX = (pts[0].clientX + pts[1].clientX) / 2 - rect.left;
      const midScreenY = (pts[0].clientY + pts[1].clientY) / 2 - rect.top;
      const worldX = (midScreenX - pan.x) / zoom;
      const worldY = (midScreenY - pan.y) / zoom;

      setZoom(targetZoom);
      setPan({
        x: midScreenX - worldX * targetZoom,
        y: midScreenY - worldY * targetZoom,
      });
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    const activeInter = interactionRef.current;
    if (!activeInter) return;

    // Pan canvas
    if (activeInter.type === 'pan_canvas') {
      const dx = e.clientX - activeInter.startPointerScreen.x;
      const dy = e.clientY - activeInter.startPointerScreen.y;
      setPan({
        x: activeInter.initialPan.x + dx,
        y: activeInter.initialPan.y + dy,
      });
      return;
    }

    // Drag shape
    if (activeInter.type === 'drag_shape') {
      const deltaWorldX = world.x - activeInter.startPointerWorld.x;
      const deltaWorldY = world.y - activeInter.startPointerWorld.y;

      let nextX = activeInter.initialShapePos.x + deltaWorldX;
      let nextY = activeInter.initialShapePos.y + deltaWorldY;

      if (snapToGrid) {
        nextX = Math.round(nextX / GRID_SIZE) * GRID_SIZE;
        nextY = Math.round(nextY / GRID_SIZE) * GRID_SIZE;
      }
      nextX = Math.max(10, nextX);
      nextY = Math.max(10, nextY);

      const actualDx = nextX - activeInter.initialShapePos.x;
      const actualDy = nextY - activeInter.initialShapePos.y;

      if (Math.abs(actualDx) > 3 || Math.abs(actualDy) > 3) {
        activeInter.hasMoved = true;
      }

      setLocalShapes((prev) =>
        prev.map((s) => {
          if (s.id === activeInter.shapeId) {
            return { ...s, x: nextX, y: nextY };
          }
          // Move nested children along with parent room
          if (activeInter.nestedInitialPositions.has(s.id)) {
            const initNested = activeInter.nestedInitialPositions.get(s.id)!;
            return {
              ...s,
              x: Math.max(10, initNested.x + actualDx),
              y: Math.max(10, initNested.y + actualDy),
            };
          }
          return s;
        })
      );
      return;
    }

    // Resize shape (8 handles)
    if (activeInter.type === 'resize_shape') {
      const deltaWorldX = world.x - activeInter.startPointerWorld.x;
      const deltaWorldY = world.y - activeInter.startPointerWorld.y;

      const newBounds = calcResizedBounds(
        activeInter.handle,
        activeInter.initialBounds,
        deltaWorldX,
        deltaWorldY,
        snapToGrid,
        GRID_SIZE,
        activeInter.isSquare
      );

      setLocalShapes((prev) =>
        prev.map((s) => (s.id === activeInter.shapeId ? { ...s, ...newBounds } : s))
      );
      return;
    }

    // Drag polygon vertex
    if (activeInter.type === 'drag_vertex') {
      const targetShape = localShapes.find((s) => s.id === activeInter.shapeId);
      if (!targetShape || !targetShape.points) return;

      const snappedPt = { x: snapVal(world.x), y: snapVal(world.y) };
      const updatedPoints = activeInter.initialPoints.map((pt, idx) =>
        idx === activeInter.vertexIndex ? snappedPt : pt
      );

      // Recompute bounding box
      const minX = Math.min(...updatedPoints.map((p) => p.x));
      const minY = Math.min(...updatedPoints.map((p) => p.y));
      const maxX = Math.max(...updatedPoints.map((p) => p.x));
      const maxY = Math.max(...updatedPoints.map((p) => p.y));

      setLocalShapes((prev) =>
        prev.map((s) =>
          s.id === activeInter.shapeId
            ? {
                ...s,
                points: updatedPoints,
                width: Math.max(50, maxX - minX),
                height: Math.max(40, maxY - minY),
              }
            : s
        )
      );
      return;
    }

    // Draw box preview
    if (activeInter.type === 'draw_shape') {
      const snappedCurrentX = snapVal(world.x);
      const snappedCurrentY = snapVal(world.y);
      setDrawingBox({
        startX: activeInter.startPointerWorld.x,
        startY: activeInter.startPointerWorld.y,
        currentX: snappedCurrentX,
        currentY: snappedCurrentY,
        shapeType: activeInter.shapeType,
      });
      return;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    touchPointersRef.current.delete(e.pointerId);
    if (touchPointersRef.current.size < 2) {
      pinchStartDistRef.current = null;
    }

    const activeInter = interactionRef.current;
    if (!activeInter) return;

    // Release pointer capture
    try {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    } catch {}

    // 1. Finished drawing rectangle / square
    if (activeInter.type === 'draw_shape' && drawingBox) {
      let x = Math.min(drawingBox.startX, drawingBox.currentX);
      let y = Math.min(drawingBox.startY, drawingBox.currentY);
      let width = Math.abs(drawingBox.currentX - drawingBox.startX);
      let height = Math.abs(drawingBox.currentY - drawingBox.startY);

      if (activeInter.shapeType === 'square') {
        const size = Math.max(width, height, 80);
        width = size;
        height = size;
      }

      setDrawingBox(null);
      interactionRef.current = null;

      if (width >= 40 && height >= 35) {
        // Open modal to assign name & category
        setPendingShapeData({ x, y, width, height });
        setNewRoomShapeType(activeInter.shapeType);
        setIsAddingRoomModalOpen(true);
        setActiveTool('select');
      }
      return;
    }

    // 2. Finished dragging or resizing shape: commit to onShapesChange
    if (
      activeInter.type === 'drag_shape' ||
      activeInter.type === 'resize_shape' ||
      activeInter.type === 'drag_vertex'
    ) {
      onShapesChange?.(localShapes);
    }

    interactionRef.current = null;
  };

  // Start dragging a room shape
  const handleShapePointerDown = (e: React.PointerEvent, shape: FloorPlanShape) => {
    // If in selector mode, tap directly to select room
    if (mode === 'selector') {
      e.stopPropagation();
      if (shape.room_id) {
        const room = roomMap.get(shape.room_id);
        if (room) onSelectRoom?.(room);
      }
      return;
    }

    if (mode === 'editor' && !readOnly) {
      if (activeTool === 'pan') return; // Allow pan to take precedence if pan tool is active

      e.stopPropagation();
      setActiveShapeId(shape.id);

      const worldPos = screenToWorld(e.clientX, e.clientY);

      // Find any nested children that belong to this room
      const nestedPositions = new Map<string, { x: number; y: number }>();
      if (shape.room_id) {
        localShapes
          .filter((s) => s.parent_room_id === shape.room_id)
          .forEach((child) => nestedPositions.set(child.id, { x: child.x, y: child.y }));
      }

      interactionRef.current = {
        type: 'drag_shape',
        shapeId: shape.id,
        pointerId: e.pointerId,
        startPointerWorld: worldPos,
        initialShapePos: { x: shape.x, y: shape.y },
        nestedInitialPositions: nestedPositions,
        hasMoved: false,
      };

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Start resizing a handle
  const handleResizeHandleDown = (
    e: React.PointerEvent,
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w',
    shape: FloorPlanShape
  ) => {
    e.stopPropagation();
    if (readOnly || mode !== 'editor') return;

    setActiveShapeId(shape.id);
    const worldPos = screenToWorld(e.clientX, e.clientY);

    interactionRef.current = {
      type: 'resize_shape',
      shapeId: shape.id,
      pointerId: e.pointerId,
      handle,
      startPointerWorld: worldPos,
      initialBounds: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      isSquare: shape.shape_type === 'square',
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  // Start dragging a polygon vertex
  const handleVertexPointerDown = (
    e: React.PointerEvent,
    vertexIndex: number,
    shape: FloorPlanShape
  ) => {
    e.stopPropagation();
    if (readOnly || mode !== 'editor') return;

    setActiveShapeId(shape.id);
    const worldPos = screenToWorld(e.clientX, e.clientY);

    interactionRef.current = {
      type: 'drag_vertex',
      shapeId: shape.id,
      pointerId: e.pointerId,
      vertexIndex,
      startPointerWorld: worldPos,
      initialPoints: shape.points ? [...shape.points] : [],
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  // Finish polygon creation
  const finishPolygonCreation = () => {
    if (polygonDraftPoints.length < 3) return;

    const minX = Math.min(...polygonDraftPoints.map((p) => p.x));
    const minY = Math.min(...polygonDraftPoints.map((p) => p.y));
    const maxX = Math.max(...polygonDraftPoints.map((p) => p.x));
    const maxY = Math.max(...polygonDraftPoints.map((p) => p.y));

    setPendingShapeData({
      x: minX,
      y: minY,
      width: Math.max(60, maxX - minX),
      height: Math.max(50, maxY - minY),
      points: [...polygonDraftPoints],
    });

    setNewRoomShapeType('polygon');
    setIsAddingRoomModalOpen(true);
    setPolygonDraftPoints([]);
    setActiveTool('select');
  };

  // Confirm room creation from modal
  const handleConfirmCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || !onCreateRoomWithShape) return;

    setIsSubmittingNewRoom(true);
    try {
      const created = await onCreateRoomWithShape(
        newRoomName.trim(),
        newRoomCategory || null,
        newRoomParentId || null,
        newRoomShapeType,
        pendingShapeData || undefined
      );

      if (created) {
        setIsAddingRoomModalOpen(false);
        setNewRoomName('');
        setNewRoomCategory('');
        setNewRoomParentId('');
        setPendingShapeData(null);
      }
    } finally {
      setIsSubmittingNewRoom(false);
    }
  };

  // Highlights and selection calculation
  // Highlights and selection calculation
  const highlightedRoomIdSet = useMemo(() => {
    const set = new Set<string>();

    if (selectedCategoryId) {
      rooms
        .filter((r) => r.room_category_id === selectedCategoryId)
        .forEach((r) => set.add(r.id));
    }

    if (selectedRoomIds && selectedRoomIds.length > 0) {
      selectedRoomIds.forEach((id) => set.add(id));
    }

    if (propSelectedRoomId && set.size === 0) {
      set.add(propSelectedRoomId);
    }

    return set;
  }, [propSelectedRoomId, selectedRoomIds, selectedCategoryId, rooms]);

  const hasAnySelection = Boolean(
    propSelectedRoomId || (selectedRoomIds && selectedRoomIds.length > 0) || selectedCategoryId
  );

  // Active shape selected in editor mode
  const selectedShape = useMemo(
    () => localShapes.find((s) => s.id === activeShapeId) || null,
    [localShapes, activeShapeId]
  );
  const selectedShapeRoom = selectedShape?.room_id ? roomMap.get(selectedShape.room_id) : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[500px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 select-none flex flex-col ${className}`}
      onWheel={handleWheel}
    >
      {/* =========================================================================
          TOP TOOLBAR: Mode Indicators, Editor Tools, Zoom & Grid Controls
         ========================================================================= */}
      <div className="absolute top-3 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left Section: Active Tool / Selection Pill */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {mode === 'selector' ? (
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-xl flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex items-center gap-2 text-xs flex-wrap">
                {selectedCategoryId ? (
                  <>
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-extrabold uppercase text-[10px] tracking-wide border border-sky-500/30">
                      Modo: Vários Cômodos
                    </span>
                    <span className="text-slate-400 font-medium">Categoria identificada:</span>
                    <span
                      className="font-extrabold flex items-center gap-1"
                      style={{ color: categoryMap.get(selectedCategoryId)?.color || '#10b981' }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: categoryMap.get(selectedCategoryId)?.color || '#10b981' }}
                      />
                      {categoryMap.get(selectedCategoryId)?.name}
                    </span>
                    <span className="text-slate-300 font-bold bg-slate-800 px-2 py-0.5 rounded-md text-[11px]">
                      {highlightedRoomIdSet.size} cômodo{highlightedRoomIdSet.size !== 1 ? 's' : ''} incluído{highlightedRoomIdSet.size !== 1 ? 's' : ''}
                    </span>
                    {propSelectedRoomId && (
                      <span className="text-slate-400 text-[11px] ml-1">
                        (Referência: <strong className="text-white">{roomMap.get(propSelectedRoomId)?.name}</strong>)
                      </span>
                    )}
                  </>
                ) : propSelectedRoomId ? (
                  <>
                    <span className="text-slate-400 font-medium">Cômodo Selecionado:</span>
                    <span className="font-extrabold text-white">
                      {roomMap.get(propSelectedRoomId)?.name || 'Cômodo'}
                    </span>
                    {onSelectCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          const r = roomMap.get(propSelectedRoomId);
                          if (r?.room_category_id) {
                            const cat = categoryMap.get(r.room_category_id);
                            if (cat) onSelectCategory(cat);
                          }
                        }}
                        className="ml-2 px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 text-[11px] font-bold transition-colors"
                        title="Expandir seleção para toda a categoria"
                      >
                        Ver Categoria
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-slate-300 font-medium">
                    Toque em um cômodo para inspecionar ou filtrar
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Editor Mode Tools */
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-xl">
              {/* Select & Move */}
              <button
                type="button"
                onClick={() => {
                  setActiveTool('select');
                  setPolygonDraftPoints([]);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeTool === 'select'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Ferramenta de Seleção e Movimentação (Toque no cômodo para mover ou redimensionar)"
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Selecionar</span>
              </button>

              {/* Hand / Pan */}
              <button
                type="button"
                onClick={() => {
                  setActiveTool('pan');
                  setPolygonDraftPoints([]);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeTool === 'pan'
                    ? 'bg-blue-500 text-white shadow-md font-black'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Mover Tela (Arraste para navegar pelo mapa)"
              >
                <Hand className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mão</span>
              </button>

              {/* Draw Rectangle */}
              <button
                type="button"
                onClick={() => {
                  setActiveTool('draw_rect');
                  setPolygonDraftPoints([]);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeTool === 'draw_rect'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Desenhar Retângulo (Arraste na planta para criar o cômodo)"
              >
                <Square className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Retângulo</span>
              </button>

              {/* Draw Polygon */}
              <button
                type="button"
                onClick={() => {
                  setActiveTool('draw_polygon');
                  setPolygonDraftPoints([]);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeTool === 'draw_polygon'
                    ? 'bg-purple-500 text-white shadow-md font-black'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Desenhar Polígono Personalizado (Clique nos pontos na planta)"
              >
                <Pentagon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Polígono</span>
              </button>

              {/* Quick Add Button */}
              {onCreateRoomWithShape && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingShapeData(null);
                    setNewRoomShapeType('rectangle');
                    setIsAddingRoomModalOpen(true);
                  }}
                  className="ml-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 transition-all"
                  title="Adicionar Cômodo Rápido"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Adicionar</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Section: Snap-to-grid & Zoom Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Snap-to-Grid Toggle */}
          {mode === 'editor' && (
            <button
              type="button"
              onClick={() => setSnapToGrid(!snapToGrid)}
              className={`p-2 rounded-xl border text-xs font-bold transition-all shadow-md ${
                snapToGrid
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title={snapToGrid ? 'Alinhar à Grade: Ativado (15px)' : 'Alinhar à Grade: Desativado'}
            >
              <Grid className="w-4 h-4" />
            </button>
          )}

          {/* Zoom Buttons */}
          <div className="flex items-center rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-800 p-1 shadow-xl">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Aproximar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Afastar Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleFitToScreen}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Enquadrar Toda a Planta (Ajustar à tela)"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-[10px] font-black"
              title="Zoom 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
          </div>
        </div>
      </div>

      {/* Polygon Drawing Instruction Banner */}
      {activeTool === 'draw_polygon' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-purple-950/90 border border-purple-500/40 text-purple-200 text-xs font-bold shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <span>
            {polygonDraftPoints.length === 0
              ? 'Clique na planta para iniciar os vértices do cômodo.'
              : `Vértices adicionados: ${polygonDraftPoints.length}. Toque no 1º ponto para fechar.`}
          </span>
          {polygonDraftPoints.length >= 3 && (
            <button
              type="button"
              onClick={finishPolygonCreation}
              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 shadow-md"
            >
              Concluir Polígono
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPolygonDraftPoints([]);
              setActiveTool('select');
            }}
            className="p-1 text-purple-400 hover:text-white"
            title="Cancelar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =========================================================================
          SVG CANVAS: Interactive Viewport with Touch & Pointer Event Handling
         ========================================================================= */}
      <div
        className={`flex-1 w-full h-full relative overflow-hidden ${
          activeTool === 'pan'
            ? 'cursor-grab active:cursor-grabbing'
            : activeTool === 'draw_rect' || activeTool === 'draw_square' || activeTool === 'draw_polygon'
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        <svg
          ref={svgRef}
          className="w-full h-full absolute inset-0 block select-none"
          style={{ touchAction: 'none' }}
        >
          <defs>
            {/* Grid Pattern */}
            <pattern
              id="grid-subtle-pattern"
              width={20 * zoom}
              height={20 * zoom}
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${pan.x % (20 * zoom)}, ${pan.y % (20 * zoom)})`}
            >
              <path
                d={`M ${20 * zoom} 0 L 0 0 0 ${20 * zoom}`}
                fill="none"
                stroke="#1e293b"
                strokeWidth="0.75"
              />
              <circle cx="0" cy="0" r="1" fill="#334155" />
            </pattern>

            {/* Glowing Drop Shadows */}
            <filter id="shadow-selected" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f59e0b" floodOpacity="0.8" />
            </filter>
            <filter id="shadow-inspect" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#10b981" floodOpacity="0.75" />
            </filter>
            <filter id="shadow-category" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#8b5cf6" floodOpacity="0.5" />
            </filter>
            <filter id="shadow-room" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Interactive Background */}
          <rect
            id="floorplan-canvas-bg"
            width="100%"
            height="100%"
            fill="url(#grid-subtle-pattern)"
            className="pointer-events-auto"
          />

          {/* World Transformed Layer */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* 1. Render Registered Room Shapes */}
            {localShapes.map((shape) => {
              const room = shape.room_id ? roomMap.get(shape.room_id) : null;
              const roomName = room?.name || shape.label_custom || 'Cômodo';
              const category = room?.room_category_id ? categoryMap.get(room.room_category_id) : null;
              const categoryColor = shape.color || category?.color || '#3b82f6';

              const isHighlighted = shape.room_id ? highlightedRoomIdSet.has(shape.room_id) : false;
              const isReferenceRoom = Boolean(
                shape.room_id &&
                  propSelectedRoomId === shape.room_id &&
                  (selectedCategoryId || (selectedRoomIds && selectedRoomIds.length > 1))
              );
              const isSoleActive = Boolean(
                shape.room_id &&
                  propSelectedRoomId === shape.room_id &&
                  !selectedCategoryId &&
                  (!selectedRoomIds || selectedRoomIds.length <= 1)
              );
              const isDimmed = hasAnySelection && !isHighlighted;
              const isSelectedInEditor = mode === 'editor' && activeShapeId === shape.id;
              const itemsCount = shape.room_id ? itemsCountByRoom.get(shape.room_id) || 0 : 0;
              const isNested = Boolean(shape.parent_room_id);

              const strokeColor = isSelectedInEditor
                ? '#f59e0b'
                : isReferenceRoom
                ? '#10b981'
                : isSoleActive
                ? '#10b981'
                : isHighlighted
                ? categoryColor
                : isNested
                ? '#64748b'
                : '#334155';

              const fillColor = isSelectedInEditor
                ? `${categoryColor}35`
                : isReferenceRoom
                ? `${categoryColor}35`
                : isSoleActive
                ? `${categoryColor}30`
                : isHighlighted
                ? `${categoryColor}25`
                : isNested
                ? '#0f172a'
                : '#0b0f19';

              return (
                <g
                  key={shape.id}
                  transform={`translate(${shape.x}, ${shape.y})`}
                  className={`cursor-pointer transition-opacity duration-150 ${
                    isDimmed ? 'opacity-35 hover:opacity-80' : 'opacity-100'
                  }`}
                  onPointerDown={(e) => handleShapePointerDown(e, shape)}
                >
                  {/* Shape Fill & Outline */}
                  <path
                    d={getShapePath(shape)}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={
                      isSelectedInEditor
                        ? 3
                        : isReferenceRoom
                        ? 3.5
                        : isSoleActive
                        ? 3.5
                        : isHighlighted
                        ? 2.5
                        : isNested
                        ? 1.8
                        : 2
                    }
                    strokeDasharray={isNested ? '5,3' : undefined}
                    filter={
                      isSelectedInEditor
                        ? 'url(#shadow-selected)'
                        : isReferenceRoom || isSoleActive
                        ? 'url(#shadow-inspect)'
                        : isHighlighted
                        ? 'url(#shadow-category)'
                        : 'url(#shadow-room)'
                    }
                  />

                  {/* Corner Accent Graphic */}
                  <path
                    d="M 0,10 L 0,0 L 10,0"
                    fill="none"
                    stroke={categoryColor}
                    strokeWidth="2.5"
                    opacity={isDimmed ? 0.3 : 0.8}
                  />

                  {/* Category Pill Tag */}
                  {shape.width >= 100 && (
                    <g transform="translate(8, 8)">
                      <rect
                        width={Math.min(shape.width - 16, 85)}
                        height="18"
                        rx="4"
                        fill="#020617cc"
                        stroke={categoryColor}
                        strokeWidth="1"
                        strokeOpacity="0.5"
                      />
                      <circle cx="7" cy="9" r="3" fill={categoryColor} />
                      <text
                        x="14"
                        y="12.5"
                        fill="#cbd5e1"
                        fontSize="9"
                        fontWeight="700"
                        className="pointer-events-none select-none"
                      >
                        {category?.name ? category.name.slice(0, 11) : isNested ? 'Suíte' : 'Geral'}
                      </text>
                    </g>
                  )}

                  {/* Room Name and Items Count */}
                  <g transform={`translate(${shape.width / 2}, ${shape.height / 2 + (shape.height > 80 ? 4 : 2)})`}>
                    <text
                      textAnchor="middle"
                      fill={
                        isSelectedInEditor
                          ? '#fef08a'
                          : isReferenceRoom || isSoleActive
                          ? '#ffffff'
                          : isHighlighted
                          ? '#f8fafc'
                          : '#94a3b8'
                      }
                      fontSize={shape.width < 110 ? '11' : '13'}
                      fontWeight={isSelectedInEditor || isReferenceRoom || isSoleActive || isHighlighted ? '900' : '700'}
                      className="pointer-events-none select-none"
                    >
                      {roomName}
                    </text>

                    {shape.height >= 80 && (
                      <text
                        y="16"
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="10"
                        fontWeight="600"
                        className="pointer-events-none select-none"
                      >
                        {itemsCount} item{itemsCount !== 1 ? 's' : ''}
                      </text>
                    )}
                  </g>

                  {/* Active Pin Checkmark for Single Room mode */}
                  {isSoleActive && (
                    <g transform={`translate(${shape.width - 24}, 8)`}>
                      <circle cx="10" cy="10" r="10" fill="#10b981" />
                      <path
                        d="M6 10 L9 13 L14 7"
                        fill="none"
                        stroke="#020617"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  )}

                  {/* Reference Indicator for Multi-Room Category Mode */}
                  {isReferenceRoom && (
                    <g transform={`translate(${shape.width - 76}, 8)`}>
                      <rect width="68" height="18" rx="4" fill="#059669" />
                      <text x="34" y="12.5" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="800">
                        Referência
                      </text>
                    </g>
                  )}

                  {/* =============================================================
                      RESIZE HANDLES (8 HANDLES: CORNERS + EDGES)
                     ============================================================= */}
                  {isSelectedInEditor && !readOnly && shape.shape_type !== 'polygon' && (
                    <g className="editor-handles">
                      {/* Top-Left (NW) */}
                      <g
                        transform="translate(0, 0)"
                        className="cursor-nwse-resize"
                        onPointerDown={(e) => handleResizeHandleDown(e, 'nw', shape)}
                      >
                        <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
                        <rect x="-5" y="-5" width="10" height="10" rx="2" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                      </g>

                      {/* Top Edge (N) */}
                      <g
                        transform={`translate(${shape.width / 2}, 0)`}
                        className="cursor-ns-resize"
                        onPointerDown={(e) => handleResizeHandleDown(e, 'n', shape)}
                      >
                        <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
                        <rect x="-4" y="-4" width="8" height="8" rx="2" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                      </g>

                      {/* Top-Right (NE) */}
                      <g
                        transform={`translate(${shape.width}, 0)`}
                        className="cursor-nesw-resize"
                        onPointerDown={(e) => handleResizeHandleDown(e, 'ne', shape)}
                      >
                        <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
                        <rect x="-5" y="-5" width="10" height="10" rx="2" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                      </g>

                      {/* Right Edge (E) */}
                      <g
                        transform={`translate(${shape.width}, ${shape.height / 2})`}
                        className="cursor-ew-resize"
                        onPointerDown={(e) => handleResizeHandleDown(e, 'e', shape)}
                      >
                        <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
                        <rect x="-4" y="-4" width="8" height="8" rx="2" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                      </g>

                      {/* Bottom-Right (SE) */}
                      <g
                        transform={`translate(${shape.width}, ${shape.height})`}
                        className="cursor-nwse-resize"
                        onPointerDown={(e) => handleResizeHandleDown(e, 'se', shape)}
                      >
                        <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
                        <rect x="-5" y="-5" width="10" height="10" rx="2" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                      </g>

                      {/* Bottom Edge (S) */}
                      <g
                        transform={`translate(${shape.width / 2}, ${shape.height})`}
                        className="cursor-ns-resize"
                        onPointerDown={(e) => handleResizeHandleDown(e, 's', shape)}
                      >
                        <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
                        <rect x="-4" y="-4" width="8" height="8" rx="2" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                      </g>

                      {/* Bottom-Left (SW) */}
                      <g
                        transform={`translate(0, ${shape.height})`}
                        className="cursor-nesw-resize"
                        onPointerDown={(e) => handleResizeHandleDown(e, 'sw', shape)}
                      >
                        <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
                        <rect x="-5" y="-5" width="10" height="10" rx="2" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                      </g>

                      {/* Left Edge (W) */}
                      <g
                        transform={`translate(0, ${shape.height / 2})`}
                        className="cursor-ew-resize"
                        onPointerDown={(e) => handleResizeHandleDown(e, 'w', shape)}
                      >
                        <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
                        <rect x="-4" y="-4" width="8" height="8" rx="2" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                      </g>
                    </g>
                  )}

                  {/* Polygon Vertices Resize Handles */}
                  {isSelectedInEditor && !readOnly && shape.shape_type === 'polygon' && shape.points && (
                    <g className="polygon-vertices">
                      {shape.points.map((pt, vIdx) => (
                        <g
                          key={vIdx}
                          transform={`translate(${pt.x}, ${pt.y})`}
                          className="cursor-move"
                          onPointerDown={(e) => handleVertexPointerDown(e, vIdx, shape)}
                        >
                          <circle cx="0" cy="0" r="14" fill="transparent" />
                          <circle cx="0" cy="0" r="6" fill="#a855f7" stroke="#ffffff" strokeWidth="2" />
                        </g>
                      ))}
                    </g>
                  )}
                </g>
              );
            })}

            {/* 2. Drawing Rectangle / Square Interactive Preview */}
            {drawingBox && (
              <rect
                x={Math.min(drawingBox.startX, drawingBox.currentX)}
                y={Math.min(drawingBox.startY, drawingBox.currentY)}
                width={Math.abs(drawingBox.currentX - drawingBox.startX)}
                height={
                  drawingBox.shapeType === 'square'
                    ? Math.abs(drawingBox.currentX - drawingBox.startX)
                    : Math.abs(drawingBox.currentY - drawingBox.startY)
                }
                fill="#10b98125"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeDasharray="6,4"
              />
            )}

            {/* 3. Drawing Polygon In-Progress Draft Lines */}
            {polygonDraftPoints.length > 0 && (
              <g className="polygon-draft">
                <polyline
                  points={polygonDraftPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="2.5"
                  strokeDasharray="4,4"
                />
                {cursorWorld && (
                  <line
                    x1={polygonDraftPoints[polygonDraftPoints.length - 1].x}
                    y1={polygonDraftPoints[polygonDraftPoints.length - 1].y}
                    x2={cursorWorld.x}
                    y2={cursorWorld.y}
                    stroke="#c084fc"
                    strokeWidth="1.5"
                    strokeDasharray="2,3"
                  />
                )}
                {polygonDraftPoints.map((p, idx) => (
                  <g key={idx} transform={`translate(${p.x}, ${p.y})`}>
                    <circle cx="0" cy="0" r="6" fill="#a855f7" stroke="#ffffff" strokeWidth="1.5" />
                    <text x="8" y="4" fill="#cbd5e1" fontSize="10" fontWeight="bold">
                      {idx + 1}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* =========================================================================
          SELECTED SHAPE INSPECTOR HUD (FLOATING CONTROLS)
         ========================================================================= */}
      {mode === 'editor' && selectedShape && (
        <div className="absolute bottom-4 left-4 right-4 z-30 max-w-lg mx-auto bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-3 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white"
              style={{
                backgroundColor:
                  selectedShape.color ||
                  (selectedShapeRoom?.room_category_id
                    ? categoryMap.get(selectedShapeRoom.room_category_id)?.color
                    : '#3b82f6') ||
                  '#3b82f6',
              }}
            >
              {selectedShapeRoom?.name ? selectedShapeRoom.name.slice(0, 2).toUpperCase() : 'CO'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm">
                  {selectedShapeRoom?.name || selectedShape.label_custom || 'Cômodo Selecionado'}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-bold">
                  {Math.round(selectedShape.width)} × {Math.round(selectedShape.height)} px
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Posição: X={Math.round(selectedShape.x)}, Y={Math.round(selectedShape.y)}
                {selectedShape.parent_room_id && (
                  <span className="text-amber-400 ml-2 font-bold">
                    • Dentro de: {roomMap.get(selectedShape.parent_room_id)?.name || 'Outro Cômodo'}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onEditRoom && selectedShapeRoom && (
              <button
                type="button"
                onClick={() => onEditRoom(selectedShapeRoom)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
                title="Editar informações do cômodo"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            )}

            {onDeleteRoom && selectedShapeRoom && (
              <button
                type="button"
                onClick={() => onDeleteRoom(selectedShapeRoom)}
                className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 transition-colors"
                title="Excluir cômodo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveShapeId(null)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white"
              title="Desmarcar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          BOTTOM CATEGORY FILTER STRIP (IN SELECTOR MODE)
         ========================================================================= */}
      {mode === 'selector' && roomCategories.length > 0 && onSelectCategory && (
        <div className="p-3 bg-slate-900/95 border-t border-slate-800 z-20 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-emerald-400" />
            Categorias:
          </span>

          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              !selectedCategoryId && !propSelectedRoomId
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            Todos os Cômodos
          </button>

          {roomCategories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            const roomsInCat = rooms.filter((r) => r.room_category_id === cat.id);

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                  isSelected
                    ? 'text-white border font-black'
                    : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
                }`}
                style={{
                  backgroundColor: isSelected ? `${cat.color}25` : undefined,
                  borderColor: isSelected ? cat.color : undefined,
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span>{cat.name}</span>
                <span className="text-[10px] opacity-70 bg-black/30 px-1.5 py-0.2 rounded-full">
                  {roomsInCat.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          MODAL: ADD NEW ROOM WITH SHAPE
         ========================================================================= */}
      {isAddingRoomModalOpen && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCreateRoom}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Cadastrar Cômodo na Planta
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddingRoomModalOpen(false);
                  setPendingShapeData(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Nome do Cômodo</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Ex: Quarto 3, Banheiro Suíte Master, Área Gourmet..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Categoria</label>
                <select
                  value={newRoomCategory}
                  onChange={(e) => setNewRoomCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Sem Categoria (Geral)</option>
                  {roomCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Espaço Pai / Suíte (Opcional)</label>
                <select
                  value={newRoomParentId}
                  onChange={(e) => setNewRoomParentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Nenhum (Cômodo Independente)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Dentro de: {r.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Selecione caso este ambiente fique fisicamente dentro de outro (ex: Banheiro da Suíte).
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Formato</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRoomShapeType('rectangle')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all ${
                      newRoomShapeType === 'rectangle'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Retângulo
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRoomShapeType('square')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all ${
                      newRoomShapeType === 'square'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Quadrado
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRoomShapeType('polygon')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all ${
                      newRoomShapeType === 'polygon'
                        ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Polígono
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsAddingRoomModalOpen(false);
                  setPendingShapeData(null);
                }}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmittingNewRoom || !newRoomName.trim()}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-xs shadow-lg transition-all"
              >
                {isSubmittingNewRoom ? 'Criando...' : 'Confirmar e Adicionar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
