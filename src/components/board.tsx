"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addImageElement,
  addTextElement,
  appendInkPoints,
  type BoardElement,
  clearBoard,
  createInkStroke,
  createShapeStroke,
  duplicateElement,
  elementsOf,
  LOCAL_ORIGIN,
  pruneEmptyText,
  readElements,
  readStrokes,
  removeElement,
  type ShapeId,
  type ShapeStroke,
  type Stroke,
  strokesOf,
  type ToolId,
  textBodyOf,
  updateElement,
  type YStroke,
} from "@/lib/board-doc";
import { type CompanionState, companionHostFor } from "@/lib/companion-host";
import {
  type ImportedImage,
  imageFilesFrom,
  importImage,
} from "@/lib/image-import";
import { paintBoard, resizeCanvas, type Viewport } from "@/lib/paint";
import type { LinkStatus } from "@/lib/peer-link";
import { displayNameFor, inviteUrl } from "@/lib/room";
import {
  eraserSize,
  MAX_ZOOM,
  MIN_ZOOM,
  shortcutToTool,
  TOOL_STATUS,
} from "@/lib/tools";
import {
  type BoardRoom,
  type PeerPresence,
  useAuthorNames,
} from "@/lib/use-board-room";
import { NameChip } from "./name-field";
import { PeerCursors } from "./peer-cursors";
import { RoomGate } from "./room-gate";
import { ShortcutSheet } from "./shortcut-sheet";
import { TextBox } from "./text-box";
import { Toolbar } from "./toolbar";

const CURSOR_BROADCAST_MS = 40;
const MIN_POINT_DISTANCE = 1.2;
const MIN_SHAPE_SIZE = 6;
const MIN_ELEMENT_WIDTH = 60;
const ANGLE_STEP = 15;
const NUDGE_STEP = 1;
const NUDGE_FAR = 10;
const DUPLICATE_OFFSET = 28;
const RIGHT_ANGLE_PULL = 4;

type Gesture =
  | {
      type: "pan";
      originX: number;
      originY: number;
      panX: number;
      panY: number;
    }
  | { type: "draw"; stroke: YStroke; lastX: number; lastY: number }
  | { type: "shape" }
  | { type: "drag"; id: string; offsetX: number; offsetY: number }
  | {
      type: "resize";
      id: string;
      originX: number;
      originY: number;
      originWidth: number;
      angle: number;
    }
  | {
      type: "rotate";
      id: string;
      centreX: number;
      centreY: number;
      offset: number;
    };

type BoardProps = {
  code: string;
  room: BoardRoom;
  status: LinkStatus;
  peers: PeerPresence[];
  localName: string;
  onRename: (name: string) => string;
};

const HOME_VIEW: Viewport = { zoom: 1, panX: 0, panY: 0 };

const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

const normalizeAngle = (degrees: number) => ((degrees % 360) + 360) % 360;

const angleFrom = (dx: number, dy: number) =>
  (Math.atan2(dy, dx) * 180) / Math.PI;

/** A photograph almost always wants a right angle, so those pull the handle in. */
function snapAngle(degrees: number, stepped: boolean): number {
  const angle = normalizeAngle(degrees);
  if (stepped) {
    return normalizeAngle(Math.round(angle / ANGLE_STEP) * ANGLE_STEP);
  }
  const right = Math.round(angle / 90) * 90;
  return Math.abs(angle - right) <= RIGHT_ANGLE_PULL
    ? normalizeAngle(right)
    : angle;
}

function peerLabel(status: LinkStatus, peers: PeerPresence[]): string {
  if (status === "connected" && peers.length > 0) return peers[0].name;
  if (status === "full") return "board full";
  if (status === "error") return "no connection";
  if (status === "reconnecting") return "reconnecting";
  return "just you";
}

export function Board({
  code,
  room,
  status,
  peers,
  localName,
  onRename,
}: BoardProps) {
  const { doc, awareness, undoManager, localClientId } = room;
  const authorNames = useAuthorNames(doc);

  const [tool, setTool] = useState<ToolId>("pen");
  const [shape, setShape] = useState<ShapeId>("rect");
  const [color, setColor] = useState("#1c1b19");
  const [width, setWidth] = useState(3);
  const [view, setView] = useState<Viewport>(HOME_VIEW);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [toast, setToast] = useState("");
  const [gateDismissed, setGateDismissed] = useState(false);
  const [focusedTextId, setFocusedTextId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [companion, setCompanion] = useState<CompanionState | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const strokesRef = useRef<Stroke[]>([]);
  // Keys act on the element in hand without the handler resubscribing on every drag.
  const elementsRef = useRef<BoardElement[]>([]);
  const previewRef = useRef<ShapeStroke | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const viewRef = useRef<Viewport>(view);
  const dprRef = useRef(1);
  const frameRef = useRef<number | null>(null);
  const spaceRef = useRef(false);
  const cursorSentRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cascadeRef = useRef({ step: 0, at: 0 });

  // Constructing the host opens nothing; the companion peer waits for a panel open.
  const host = useMemo(() => companionHostFor(code), [code]);

  const drawMode =
    tool === "pen" || tool === "eraser" || tool === "shape" || tool === "pan";
  const canMove = tool === "select";

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(""), 2400);
  }, []);

  const scheduleRedraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      paintBoard(
        canvas,
        strokesRef.current,
        previewRef.current,
        viewRef.current,
        dprRef.current,
      );
    });
  }, []);

  useEffect(() => {
    viewRef.current = view;
    scheduleRedraw();
  }, [view, scheduleRedraw]);

  useEffect(() => {
    const strokes = strokesOf(doc);
    const sync = () => {
      strokesRef.current = readStrokes(doc);
      scheduleRedraw();
    };
    sync();
    strokes.observeDeep(sync);
    return () => strokes.unobserveDeep(sync);
  }, [doc, scheduleRedraw]);

  useEffect(() => {
    const map = elementsOf(doc);
    const sync = () => {
      elementsRef.current = readElements(doc);
      setElements(elementsRef.current);
    };
    sync();
    map.observeDeep(sync);
    return () => map.unobserveDeep(sync);
  }, [doc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const fitCanvas = () => {
      dprRef.current = resizeCanvas(canvas);
      scheduleRedraw();
    };
    fitCanvas();
    const observer = new ResizeObserver(fitCanvas);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [scheduleRedraw]);

  useEffect(() => {
    return () => {
      // The handle has to be cleared as well as cancelled: the ref outlives a
      // remount, and a stale handle would make scheduleRedraw skip forever.
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return [0, 0] as const;
    const rect = surface.getBoundingClientRect();
    const current = viewRef.current;
    return [
      (clientX - rect.left - current.panX) / current.zoom,
      (clientY - rect.top - current.panY) / current.zoom,
    ] as const;
  }, []);

  const zoomAround = useCallback(
    (factor: number, anchorX: number, anchorY: number) => {
      setView((current) => {
        const zoom = clampZoom(current.zoom * factor);
        const ratio = zoom / current.zoom;
        return {
          zoom,
          panX: anchorX - (anchorX - current.panX) * ratio,
          panY: anchorY - (anchorY - current.panY) * ratio,
        };
      });
    },
    [],
  );

  // Wheel must be a non-passive native listener so pinch-zoom can be intercepted.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = surface.getBoundingClientRect();
        zoomAround(
          1 - event.deltaY * 0.0022,
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
        return;
      }
      setView((current) => ({
        ...current,
        panX: current.panX - event.deltaX,
        panY: current.panY - event.deltaY,
      }));
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [zoomAround]);

  const zoomToCentre = useCallback(
    (factor: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      zoomAround(factor, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2);
    },
    [zoomAround],
  );

  /**
   * Read at the moment a photo arrives rather than closed over: the insert happens in
   * a data channel callback, with no render between it and whatever pan or zoom is
   * current. `toWorld` takes client coordinates, so the surface origin has to be added
   * back in, which is where `zoomToCentre` differs.
   */
  const viewportCentre = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0] as const;
    return toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [toWorld]);

  const undo = useCallback(() => {
    if (undoManager.undoStack.length === 0) {
      showToast("Nothing to undo");
      return;
    }
    undoManager.undo();
  }, [undoManager, showToast]);

  const redo = useCallback(() => {
    if (undoManager.redoStack.length === 0) {
      showToast("Nothing to redo");
      return;
    }
    undoManager.redo();
  }, [undoManager, showToast]);

  const pickImage = useCallback(() => fileInputRef.current?.click(), []);

  const addImages = useCallback(
    async (files: File[], worldX: number, worldY: number) => {
      let placed: string | null = null;
      for (const [index, file] of files.entries()) {
        try {
          const { src, ratio } = await importImage(file);
          placed = addImageElement(
            doc,
            localClientId,
            worldX + index * 28,
            worldY + index * 28,
            src,
            ratio,
          );
          undoManager.stopCapturing();
        } catch {
          showToast("That image would not open");
        }
      }
      if (placed) {
        setTool("select");
        setSelectedId(placed);
        showToast("Drag to move · corner resizes · Backspace removes");
      }
    },
    [doc, localClientId, undoManager, showToast],
  );

  /** Photos arrive one channel event at a time, so the cascade is carried in a ref. */
  const acceptPhoto = useCallback(
    (image: ImportedImage) => {
      const now = performance.now();
      const burst = now - cascadeRef.current.at < 6000;
      const step = burst ? (cascadeRef.current.step + 1) % 6 : 0;
      cascadeRef.current = { step, at: now };

      const offset = step * 28;
      const [centreX, centreY] = viewportCentre();
      const id = addImageElement(
        doc,
        localClientId,
        centreX - 140 + offset,
        centreY - 140 / image.ratio + offset,
        image.src,
        image.ratio,
      );
      undoManager.stopCapturing();
      // The panel covers the middle of the board, which is where photos land.
      setPhoneOpen(false);
      setSelectedId(id);
      // A tool change mid gesture would strand the stroke, so a busy hand keeps its tool.
      if (!gestureRef.current) setTool("select");
      showToast("Photo from your phone · drag it where you want it");
    },
    [doc, localClientId, undoManager, showToast, viewportCentre],
  );

  const selectedElement = useCallback(
    () =>
      elementsRef.current.find((element) => element.id === selectedId) ?? null,
    [selectedId],
  );

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      const element = selectedElement();
      if (!element) return;
      updateElement(doc, element.id, {
        x: element.x + dx,
        y: element.y + dy,
      });
    },
    [doc, selectedElement],
  );

  const turnSelected = useCallback(
    (delta: number) => {
      const element = selectedElement();
      if (!element) return;
      updateElement(doc, element.id, { a: snapAngle(element.a + delta, true) });
    },
    [doc, selectedElement],
  );

  const duplicateSelected = useCallback(() => {
    const element = selectedElement();
    if (!element) return;
    const copy = duplicateElement(
      doc,
      element.id,
      localClientId,
      DUPLICATE_OFFSET,
      DUPLICATE_OFFSET,
    );
    if (!copy) return;
    undoManager.stopCapturing();
    // The copy is what you have in hand now, so the original gives up the caret.
    if (document.activeElement instanceof HTMLTextAreaElement) {
      document.activeElement.blur();
    }
    setSelectedId(copy);
    showToast("Duplicated");
  }, [doc, localClientId, undoManager, selectedElement, showToast]);

  const editSelectedText = useCallback(() => {
    const element = selectedElement();
    if (element?.type !== "text") return;
    setFocusedTextId(element.id);
  }, [selectedElement]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    removeElement(doc, selectedId);
    undoManager.stopCapturing();
    setSelectedId(null);
    showToast("Removed · Undo brings it back");
  }, [selectedId, doc, undoManager, showToast]);

  useEffect(
    () => host.attach({ onState: setCompanion, onImage: acceptPhoto }),
    [host, acceptPhoto],
  );

  useEffect(() => host.setName(localName), [host, localName]);

  const copyPhoneLink = useCallback(async () => {
    const url = companion?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Phone link copied");
    } catch {
      showToast(url);
    }
  }, [companion, showToast]);

  const togglePhone = useCallback(() => {
    // Opening is a click, never an effect, so a strict mode remount cannot double it.
    if (!phoneOpen) host.start();
    setPhoneOpen((open) => !open);
  }, [host, phoneOpen]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFilesFrom(event.clipboardData?.files);
      if (files.length > 0) void addImages(files, 140, 140);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImages]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const tag = (target as HTMLElement | null)?.tagName;
      return tag === "TEXTAREA" || tag === "INPUT";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (sheetOpen) {
          event.preventDefault();
          setSheetOpen(false);
        } else if (phoneOpen) {
          event.preventDefault();
          setPhoneOpen(false);
        } else {
          setSelectedId(null);
        }
        return;
      }
      // A focused panel button turns Space into a click and would leave pan mode stuck on.
      if (
        event.code === "Space" &&
        !phoneOpen &&
        !sheetOpen &&
        !isTypingTarget(event.target)
      ) {
        spaceRef.current = true;
        return;
      }
      // Chords stay live behind an open panel and inside a text box, as undo always has.
      if (event.metaKey || event.ctrlKey) {
        const chord = event.key.toLowerCase();
        if (chord === "z") {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
        } else if (chord === "y") {
          event.preventDefault();
          redo();
        } else if (chord === "d" && canMove && selectedId) {
          event.preventDefault();
          duplicateSelected();
        }
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        setSheetOpen((open) => !open);
        return;
      }
      if (phoneOpen || sheetOpen) return;

      if (canMove && selectedId) {
        const step = event.shiftKey ? NUDGE_FAR : NUDGE_STEP;
        switch (event.key) {
          case "Delete":
          case "Backspace":
            event.preventDefault();
            removeSelected();
            return;
          case "ArrowLeft":
            event.preventDefault();
            nudgeSelected(-step, 0);
            return;
          case "ArrowRight":
            event.preventDefault();
            nudgeSelected(step, 0);
            return;
          case "ArrowUp":
            event.preventDefault();
            nudgeSelected(0, -step);
            return;
          case "ArrowDown":
            event.preventDefault();
            nudgeSelected(0, step);
            return;
          case "[":
            event.preventDefault();
            turnSelected(-ANGLE_STEP);
            return;
          case "]":
            event.preventDefault();
            turnSelected(ANGLE_STEP);
            return;
          case "Enter":
            event.preventDefault();
            editSelectedText();
            return;
        }
      }

      if (event.key === "0") {
        setView(HOME_VIEW);
        return;
      }
      if (event.key === "=" || event.key === "+") {
        zoomToCentre(1.2);
        return;
      }
      if (event.key === "-") {
        zoomToCentre(1 / 1.2);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "p") {
        togglePhone();
        return;
      }
      if (key === "i") {
        pickImage();
        return;
      }
      const next = shortcutToTool(key);
      if (next) setTool(next);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    undo,
    redo,
    phoneOpen,
    sheetOpen,
    canMove,
    selectedId,
    removeSelected,
    nudgeSelected,
    turnSelected,
    duplicateSelected,
    editSelectedText,
    togglePhone,
    pickImage,
    zoomToCentre,
  ]);

  const broadcastCursor = useCallback(
    (worldX: number, worldY: number) => {
      const now = performance.now();
      if (now - cursorSentRef.current < CURSOR_BROADCAST_MS) return;
      cursorSentRef.current = now;
      awareness.setLocalStateField("cursor", { x: worldX, y: worldY });
    },
    [awareness],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (tool === "pan" || spaceRef.current || event.button === 1) {
        gestureRef.current = {
          type: "pan",
          originX: event.clientX,
          originY: event.clientY,
          panX: viewRef.current.panX,
          panY: viewRef.current.panY,
        };
        return;
      }

      if (tool === "select") {
        setSelectedId(null);
        return;
      }

      const [x, y] = toWorld(event.clientX, event.clientY);

      if (tool === "text") {
        // Without this the browser's default mousedown focus lands on the body
        // straight after the new box focuses itself, and the blur reaps it.
        event.preventDefault();
        const id = addTextElement(doc, localClientId, color, x, y);
        undoManager.stopCapturing();
        setFocusedTextId(id);
        return;
      }

      if (tool === "shape") {
        previewRef.current = {
          kind: "shape",
          shape,
          x0: x,
          y0: y,
          x1: x,
          y1: y,
          color,
          size: width,
        };
        gestureRef.current = { type: "shape" };
        return;
      }

      if (tool !== "pen" && tool !== "eraser") return;

      const erase = tool === "eraser";
      const stroke = createInkStroke(
        color,
        erase ? eraserSize(width) : width,
        erase,
        [x, y],
      );
      doc.transact(() => strokesOf(doc).push([stroke]), LOCAL_ORIGIN);
      gestureRef.current = { type: "draw", stroke, lastX: x, lastY: y };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [tool, shape, color, width, doc, localClientId, undoManager, toWorld],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      const [x, y] = toWorld(event.clientX, event.clientY);
      broadcastCursor(x, y);

      if (!gesture) return;

      switch (gesture.type) {
        case "pan":
          setView((current) => ({
            ...current,
            panX: gesture.panX + (event.clientX - gesture.originX),
            panY: gesture.panY + (event.clientY - gesture.originY),
          }));
          return;
        case "resize": {
          // The handle rides the element's own axis, so the drag is projected onto it.
          const radians = (gesture.angle * Math.PI) / 180;
          const along =
            (x - gesture.originX) * Math.cos(radians) +
            (y - gesture.originY) * Math.sin(radians);
          updateElement(doc, gesture.id, {
            w: Math.max(MIN_ELEMENT_WIDTH, gesture.originWidth + along),
          });
          return;
        }
        case "rotate": {
          const pointed = angleFrom(x - gesture.centreX, y - gesture.centreY);
          updateElement(doc, gesture.id, {
            a: snapAngle(pointed - gesture.offset, event.shiftKey),
          });
          return;
        }
        case "drag":
          updateElement(doc, gesture.id, {
            x: x - gesture.offsetX,
            y: y - gesture.offsetY,
          });
          return;
        case "shape": {
          const preview = previewRef.current;
          if (!preview) return;
          previewRef.current = { ...preview, x1: x, y1: y };
          scheduleRedraw();
          return;
        }
        case "draw": {
          if (
            Math.abs(x - gesture.lastX) + Math.abs(y - gesture.lastY) <
            MIN_POINT_DISTANCE
          ) {
            return;
          }
          gesture.lastX = x;
          gesture.lastY = y;
          doc.transact(
            () => appendInkPoints(gesture.stroke, [x, y]),
            LOCAL_ORIGIN,
          );
          return;
        }
      }
    },
    [doc, toWorld, broadcastCursor, scheduleRedraw],
  );

  const endGesture = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;

    if (gesture?.type === "shape") {
      const preview = previewRef.current;
      previewRef.current = null;
      if (
        preview &&
        Math.abs(preview.x1 - preview.x0) + Math.abs(preview.y1 - preview.y0) >
          MIN_SHAPE_SIZE
      ) {
        doc.transact(
          () => strokesOf(doc).push([createShapeStroke(preview)]),
          LOCAL_ORIGIN,
        );
      }
      scheduleRedraw();
    }

    if (gesture) undoManager.stopCapturing();
  }, [doc, undoManager, scheduleRedraw]);

  const onPointerLeave = useCallback(() => {
    endGesture();
    awareness.setLocalStateField("cursor", null);
  }, [endGesture, awareness]);

  const copyInvite = useCallback(async () => {
    const url = inviteUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Invite link copied");
    } catch {
      showToast(url);
    }
  }, [code, showToast]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = imageFilesFrom(event.dataTransfer?.files);
      if (files.length === 0) {
        showToast("That file is not an image");
        return;
      }
      const [x, y] = toWorld(event.clientX, event.clientY);
      void addImages(files, x - 140, y - 100);
    },
    [addImages, toWorld, showToast],
  );

  const gateVisible =
    !gateDismissed &&
    peers.length === 0 &&
    (status === "connecting" ||
      status === "waiting" ||
      status === "full" ||
      status === "error");

  const surfaceCursor = drawMode
    ? tool === "pan"
      ? "grab"
      : "crosshair"
    : tool === "text"
      ? "text"
      : "default";

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper">
      <div
        ref={surfaceRef}
        role="application"
        aria-label="Whiteboard surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerLeave={onPointerLeave}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="absolute inset-0 touch-none bg-paper"
        style={{
          backgroundImage:
            "radial-gradient(rgb(28 27 25 / 0.13) 1px, transparent 1px)",
          backgroundSize: `${22 * view.zoom}px ${22 * view.zoom}px`,
          backgroundPosition: `${view.panX}px ${view.panY}px`,
          cursor: surfaceCursor,
        }}
      >
        <div
          className="absolute top-0 left-0 h-full w-full"
          style={{
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {elements.map((element) => {
            const selected = canMove && selectedId === element.id;
            return (
              <div
                key={element.id}
                onPointerDown={(event) => {
                  if (drawMode) return;
                  event.stopPropagation();
                  if (!canMove) return;
                  setSelectedId(element.id);
                  const [x, y] = toWorld(event.clientX, event.clientY);
                  gestureRef.current = {
                    type: "drag",
                    id: element.id,
                    offsetX: x - element.x,
                    offsetY: y - element.y,
                  };
                }}
                style={{
                  position: "absolute",
                  left: `${element.x}px`,
                  top: `${element.y}px`,
                  width: `${element.w}px`,
                  // Text mode keeps text boxes clickable so they can be edited,
                  // but pictures must not swallow a click meant to place new text.
                  pointerEvents:
                    drawMode || (tool === "text" && element.type === "image")
                      ? "none"
                      : "auto",
                  cursor: canMove ? "grab" : "default",
                  transform: element.a ? `rotate(${element.a}deg)` : undefined,
                  outline: selected
                    ? "1.5px solid oklch(0.62 0.19 250)"
                    : element.type === "image" && canMove
                      ? "1px solid oklch(0.62 0.19 250 / 0.55)"
                      : undefined,
                  outlineOffset: "2px",
                }}
              >
                {element.type === "text" ? (
                  <TextBox
                    text={element.text}
                    color={element.color}
                    body={textBodyOf(doc, element.id)}
                    caretCursor={canMove ? "grab" : "text"}
                    focusOnMount={focusedTextId === element.id}
                    onBlur={() => {
                      pruneEmptyText(doc, element.id);
                      setFocusedTextId((current) =>
                        current === element.id ? null : current,
                      );
                    }}
                  />
                ) : (
                  <div
                    className="rounded-[5px] bg-center bg-cover shadow-art"
                    style={{
                      width: "100%",
                      height: `${element.w / (element.ratio || 1.4)}px`,
                      backgroundImage: `url("${element.src}")`,
                    }}
                  />
                )}

                {selected && (
                  <>
                    <div
                      title="Rotate"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        // Rotating about the centre leaves the bounding box centred on the
                        // same point, so the wrapper's rect gives the pivot at any angle.
                        const box =
                          event.currentTarget.parentElement?.getBoundingClientRect();
                        if (!box) return;
                        const [centreX, centreY] = toWorld(
                          box.left + box.width / 2,
                          box.top + box.height / 2,
                        );
                        const [x, y] = toWorld(event.clientX, event.clientY);
                        gestureRef.current = {
                          type: "rotate",
                          id: element.id,
                          centreX,
                          centreY,
                          offset:
                            angleFrom(x - centreX, y - centreY) - element.a,
                        };
                      }}
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: `${-27 / view.zoom}px`,
                        width: `${13 / view.zoom}px`,
                        height: `${13 / view.zoom}px`,
                        marginLeft: `${-6.5 / view.zoom}px`,
                        borderRadius: "50%",
                        background: "#fff",
                        border: `${1.5 / view.zoom}px solid oklch(0.62 0.19 250)`,
                        cursor: "grab",
                        touchAction: "none",
                      }}
                    />

                    <button
                      type="button"
                      title="Remove"
                      aria-label="Remove"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={removeSelected}
                      style={{
                        position: "absolute",
                        right: `${-9 / view.zoom}px`,
                        top: `${-9 / view.zoom}px`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: `${18 / view.zoom}px`,
                        height: `${18 / view.zoom}px`,
                        padding: 0,
                        borderRadius: "50%",
                        background: "#fff",
                        border: `${1.5 / view.zoom}px solid oklch(0.62 0.19 250)`,
                        color: "oklch(0.62 0.19 250)",
                        fontSize: `${13 / view.zoom}px`,
                        lineHeight: 1,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>

                    {element.type === "image" && (
                      <div
                        title="Resize"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          const [x, y] = toWorld(event.clientX, event.clientY);
                          gestureRef.current = {
                            type: "resize",
                            id: element.id,
                            originX: x,
                            originY: y,
                            originWidth: element.w,
                            angle: element.a,
                          };
                        }}
                        style={{
                          position: "absolute",
                          right: `${-7 / view.zoom}px`,
                          bottom: `${-7 / view.zoom}px`,
                          width: `${13 / view.zoom}px`,
                          height: `${13 / view.zoom}px`,
                          borderRadius: "3px",
                          background: "#fff",
                          border: `${1.5 / view.zoom}px solid oklch(0.62 0.19 250)`,
                          cursor: "nwse-resize",
                          touchAction: "none",
                        }}
                      />
                    )}
                  </>
                )}

                {element.author !== localClientId && (
                  <div className="absolute -top-[17px] left-0.5 rounded bg-peer px-1.5 py-px text-[10.5px] font-medium text-white">
                    {authorNames.get(element.author) ??
                      displayNameFor(element.author)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 block"
        />

        <PeerCursors
          awareness={awareness}
          localClientId={localClientId}
          view={view}
        />
      </div>

      <div className="absolute top-[18px] left-[18px] flex items-center gap-2.5">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-[9px] shadow-panel">
          <span className="text-base font-semibold tracking-[-0.01em]">
            slate
          </span>
          <div className="h-4 w-px bg-rule" />
          <span className="text-[13px] font-medium tracking-[0.12em] text-ink-muted">
            {code}
          </span>
          <button
            type="button"
            onClick={copyInvite}
            className="cursor-pointer rounded-[7px] border border-line-strong bg-raised px-[9px] py-[5px] text-xs font-medium text-ink-soft transition-colors hover:bg-active"
          >
            Copy link
          </button>
        </div>

        <div
          className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-[9px] shadow-panel"
          style={{ color: status === "connected" ? "#1c1b19" : "#8a8880" }}
        >
          <div
            className="size-2 rounded-full"
            style={{
              background:
                status === "connected" ? "oklch(0.62 0.19 25)" : "#cfcdc6",
            }}
          />
          <span className="text-[13px] font-medium">
            {peerLabel(status, peers)}
          </span>
        </div>

        <NameChip name={localName} onRename={onRename} />
      </div>

      <div className="absolute top-[18px] right-[18px] flex items-center gap-1 rounded-xl border border-line bg-panel p-[7px] shadow-panel">
        <button
          type="button"
          title="Undo · ⌘Z"
          onClick={undo}
          className="cursor-pointer rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-hover"
        >
          Undo
        </button>
        <button
          type="button"
          title="Redo · ⇧⌘Z"
          onClick={redo}
          className="cursor-pointer rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-hover"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => {
            clearBoard(doc);
            undoManager.stopCapturing();
            showToast("Board cleared for everyone");
          }}
          className="cursor-pointer rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-ghost transition-colors hover:bg-hover hover:text-peer"
        >
          Clear
        </button>
        <div className="mx-0.5 h-[22px] w-px bg-rule" />
        <button
          type="button"
          title="Keyboard shortcuts · ?"
          aria-label="Keyboard shortcuts"
          aria-pressed={sheetOpen}
          onClick={() => setSheetOpen((open) => !open)}
          className={`size-9 cursor-pointer rounded-lg text-[13.5px] font-medium transition-colors ${
            sheetOpen ? "bg-active text-ink" : "text-ink-soft hover:bg-hover"
          }`}
        >
          ?
        </button>
      </div>

      <Toolbar
        tool={tool}
        shape={shape}
        color={color}
        width={width}
        zoomLabel={`${Math.round(view.zoom * 100)}%`}
        onSelectTool={setTool}
        onSelectShape={(next) => {
          setShape(next);
          setTool("shape");
        }}
        onSelectColor={(next) => {
          setColor(next);
          if (tool === "eraser") setTool("pen");
        }}
        onSelectWidth={setWidth}
        onPickImage={pickImage}
        phone={phoneOpen ? companion : null}
        onTogglePhone={togglePhone}
        onRevokePhone={() => host.revoke()}
        onCopyPhoneLink={() => void copyPhoneLink()}
        onZoomIn={() => zoomToCentre(1.2)}
        onZoomOut={() => zoomToCentre(1 / 1.2)}
        onZoomReset={() => setView(HOME_VIEW)}
      />

      <div className="pointer-events-none absolute bottom-[88px] left-1/2 -translate-x-1/2 text-[11.5px] leading-[1.5] tracking-[0.01em] whitespace-nowrap text-ink-ghost">
        {TOOL_STATUS[tool]}
      </div>

      {status === "reconnecting" && (
        <div className="absolute top-[74px] left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-[11px] bg-ink px-[15px] py-[9px] text-[13px] text-ink-invert shadow-notice">
          <div className="size-[7px] rounded-full bg-amber" />
          <span>Lost the connection · reconnecting</span>
        </div>
      )}

      {toast && (
        <div
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 animate-toast-in rounded-[10px] bg-ink px-4 py-[9px] text-[13px] text-ink-invert ${
            status === "reconnecting" ? "top-[126px]" : "top-[74px]"
          }`}
        >
          {toast}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = imageFilesFrom(event.target.files);
          event.target.value = "";
          if (files.length > 0) void addImages(files, 140, 150);
        }}
      />

      {sheetOpen && <ShortcutSheet onClose={() => setSheetOpen(false)} />}

      {gateVisible && (
        <RoomGate
          status={status}
          code={code}
          localName={localName}
          onRename={onRename}
          onCopy={copyInvite}
          onDismiss={() => setGateDismissed(true)}
        />
      )}
    </div>
  );
}
