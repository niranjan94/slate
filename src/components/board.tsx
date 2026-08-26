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
  dropStroke,
  duplicateElement,
  elementsOf,
  inkPointCount,
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
  clampZoom,
  type Pinch,
  pinchFrom,
  pinchView,
  type SurfacePoint,
} from "@/lib/gesture";
import { topmostAt } from "@/lib/hit-test";
import {
  type ImportedImage,
  imageFilesFrom,
  importImage,
} from "@/lib/image-import";
import { paintBoard, resizeCanvas, type Viewport } from "@/lib/paint";
import type { LinkStatus } from "@/lib/peer-link";
import { displayNameFor, inviteUrl } from "@/lib/room";
import { useCoarsePointer, useNarrowScreen } from "@/lib/screen";
import {
  eraserSize,
  MEDIUM_WIDTH,
  shortcutToTool,
  TOOL_STATUS,
} from "@/lib/tools";
import {
  type BoardRoom,
  type PeerPresence,
  useAuthorNames,
} from "@/lib/use-board-room";
import { BoardMenu } from "./board-menu";
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
/** Stands in for a text box's laid out height before it has been measured. */
const MIN_ELEMENT_HEIGHT = 30;
const ANGLE_STEP = 15;
const NUDGE_STEP = 1;
const NUDGE_FAR = 10;
const DUPLICATE_OFFSET = 28;
const RIGHT_ANGLE_PULL = 4;
/** Ink this short at the moment a second finger lands was the finger, not a stroke. */
const PINCH_FORGIVES_POINTS = 4;
const LONG_PRESS_MS = 420;
/** Travel that means the finger is drawing rather than holding still. */
const LONG_PRESS_SLOP = 10;
const HANDLE_REACH = 44;
const MOUSE_REACH = 18;
/**
 * A finger sized handle centred on the corner would cover the corner, and on a small
 * picture the handles together would leave no body left to drag. Pushing them out
 * keeps most of that reach outside the box.
 */
const HANDLE_PUSH = 8;

type Gesture =
  | {
      type: "pan";
      originX: number;
      originY: number;
      panX: number;
      panY: number;
    }
  | { type: "draw"; stroke: YStroke; lastX: number; lastY: number }
  | { type: "pinch"; pinch: Pinch }
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

/**
 * Handles hold their size on screen at any zoom, which is why every measurement here
 * is divided by it. `reach` is the part a finger has to land on and stays invisible;
 * `visual` is the dot that is drawn in the middle of it.
 */
function handleFrame(
  reach: number,
  visual: number,
  zoom: number,
): React.CSSProperties {
  return {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${Math.max(reach, visual) / zoom}px`,
    height: `${Math.max(reach, visual) / zoom}px`,
    padding: 0,
    border: "none",
    background: "transparent",
    touchAction: "none",
  };
}

const dotStyle = (
  visual: number,
  zoom: number,
  radius: string,
): React.CSSProperties => ({
  width: `${visual / zoom}px`,
  height: `${visual / zoom}px`,
  borderRadius: radius,
  background: "#fff",
  border: `${1.5 / zoom}px solid oklch(0.62 0.19 250)`,
});

/** Offsets the frame so its centre lands where the dot's centre used to. */
const frameOffset = (reach: number, visual: number, zoom: number) =>
  Math.max(reach, visual) / 2 / zoom;

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
  const [width, setWidth] = useState(MEDIUM_WIDTH);
  const [view, setView] = useState<Viewport>(HOME_VIEW);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [toast, setToast] = useState("");
  const [gateDismissed, setGateDismissed] = useState(false);
  const [focusedTextId, setFocusedTextId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [companion, setCompanion] = useState<CompanionState | null>(null);

  const narrow = useNarrowScreen();
  const coarse = useCoarsePointer();
  // Read from callbacks that a re-render would otherwise have to be threaded into.
  const coarseRef = useRef(coarse);
  coarseRef.current = coarse;

  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const strokesRef = useRef<Stroke[]>([]);
  // Keys act on the element in hand without the handler resubscribing on every drag.
  const elementsRef = useRef<BoardElement[]>([]);
  const previewRef = useRef<ShapeStroke | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const viewRef = useRef<Viewport>(view);
  const dprRef = useRef(1);
  const frameRef = useRef<number | null>(null);
  const spaceRef = useRef(false);
  /** Live touches, in insertion order, so the first two are the ones a pinch follows. */
  const pointersRef = useRef(new Map<number, SurfacePoint>());
  const penDownRef = useRef(false);
  // A pinch leaves one finger on the surface when the other lifts. That finger has
  // already had its say, so it is ignored until the hand comes off altogether.
  const holdOffRef = useRef(false);
  const pressRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  /** The laid out wrapper of each element, which is where its height comes from. */
  const nodesRef = useRef(new Map<string, HTMLDivElement>());
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
      if (pressRef.current) {
        clearTimeout(pressRef.current.timer);
        pressRef.current = null;
      }
    };
  }, []);

  const toSurface = useCallback(
    (clientX: number, clientY: number): SurfacePoint => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
    },
    [],
  );

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
  const takePhoto = useCallback(() => cameraInputRef.current?.click(), []);

  const clearAll = useCallback(() => {
    clearBoard(doc);
    undoManager.stopCapturing();
    showToast("Board cleared for everyone");
  }, [doc, undoManager, showToast]);

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
        showToast(
          coarseRef.current
            ? "Drag to move · corner resizes · × removes"
            : "Drag to move · corner resizes · Backspace removes",
        );
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
        !menuOpen &&
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
      if (phoneOpen || sheetOpen || menuOpen) return;

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

    // Switching away while Space is held means the keyup never arrives, and pan
    // would stay latched on for every pointer that follows.
    const releaseSpace = () => {
      spaceRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseSpace);
    };
  }, [
    undo,
    redo,
    phoneOpen,
    sheetOpen,
    menuOpen,
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

  const cancelLongPress = useCallback(() => {
    const press = pressRef.current;
    if (!press) return;
    clearTimeout(press.timer);
    pressRef.current = null;
  }, []);

  /**
   * Holding a finger on something picks it up, whatever tool is in hand. Without it
   * the only way to move a picture on a phone is to find Move first, and a finger
   * has no equivalent of noticing that the cursor changed over it.
   */
  const takeHold = useCallback(
    (worldX: number, worldY: number) => {
      const held = topmostAt(
        elementsRef.current.map((element) => ({
          element,
          height:
            nodesRef.current.get(element.id)?.offsetHeight ??
            (element.type === "image"
              ? element.w / (element.ratio || 1.4)
              : MIN_ELEMENT_HEIGHT),
        })),
        worldX,
        worldY,
      );
      if (!held) return;

      const gesture = gestureRef.current;
      // A press that held still long enough to count has no stroke worth keeping.
      if (gesture?.type === "draw") dropStroke(doc, gesture.stroke);
      if (gesture?.type === "shape") {
        previewRef.current = null;
        scheduleRedraw();
      }

      setTool("select");
      setSelectedId(held.id);
      // The finger is already on it, so the same touch carries on into the drag.
      gestureRef.current = {
        type: "drag",
        id: held.id,
        offsetX: worldX - held.x,
        offsetY: worldY - held.y,
      };
      showToast("Picked up · drag it where you want it");
    },
    [doc, scheduleRedraw, showToast],
  );

  /**
   * A second finger means the hand came to move the board, not to draw, so whatever
   * the first finger had started is wound back before the pinch takes over.
   */
  const beginPinch = useCallback(() => {
    const [a, b] = [...pointersRef.current.values()];
    if (!a || !b) return;
    const gesture = gestureRef.current;

    if (gesture?.type === "draw") {
      if (inkPointCount(gesture.stroke) <= PINCH_FORGIVES_POINTS) {
        dropStroke(doc, gesture.stroke);
      }
      undoManager.stopCapturing();
    } else if (gesture?.type === "shape") {
      previewRef.current = null;
      scheduleRedraw();
    }

    cancelLongPress();
    holdOffRef.current = true;
    gestureRef.current = {
      type: "pinch",
      pinch: pinchFrom(a, b, viewRef.current),
    };
  }, [doc, undoManager, scheduleRedraw, cancelLongPress]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // A finger arriving while a stylus is down is a hand resting on the board.
      if (event.pointerType === "touch" && penDownRef.current) return;
      if (event.pointerType === "pen") penDownRef.current = true;

      const pointers = pointersRef.current;
      pointers.set(event.pointerId, toSurface(event.clientX, event.clientY));
      if (pointers.size === 2) {
        beginPinch();
        return;
      }
      if (pointers.size > 2 || holdOffRef.current) return;

      if (event.pointerType === "touch" && tool !== "select") {
        const [pressX, pressY] = toWorld(event.clientX, event.clientY);
        const at = pointers.get(event.pointerId);
        pressRef.current = {
          timer: setTimeout(() => {
            pressRef.current = null;
            takeHold(pressX, pressY);
          }, LONG_PRESS_MS),
          pointerId: event.pointerId,
          x: at?.x ?? 0,
          y: at?.y ?? 0,
        };
      }

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
    [
      tool,
      shape,
      color,
      width,
      doc,
      localClientId,
      undoManager,
      toWorld,
      toSurface,
      beginPinch,
      takeHold,
    ],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current;
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, toSurface(event.clientX, event.clientY));
      }

      const press = pressRef.current;
      const at = pointers.get(event.pointerId);
      if (
        press &&
        at &&
        press.pointerId === event.pointerId &&
        Math.abs(at.x - press.x) + Math.abs(at.y - press.y) > LONG_PRESS_SLOP
      ) {
        cancelLongPress();
      }

      const gesture = gestureRef.current;

      if (gesture?.type === "pinch") {
        const [a, b] = [...pointers.values()];
        if (a && b) setView(pinchView(gesture.pinch, a, b));
        return;
      }
      // An extra finger on the surface must not steer what one finger started.
      if (pointers.size > 1) return;

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
    [doc, toWorld, toSurface, broadcastCursor, scheduleRedraw, cancelLongPress],
  );

  /**
   * `abandoned` is the pointercancel path, where the platform took the touch away
   * mid gesture. A shape being dragged out has nothing committed yet, so it is
   * dropped rather than landing at whatever size the interruption caught it at.
   */
  const endGesture = useCallback(
    (abandoned = false) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;

      if (gesture?.type === "shape") {
        const preview = previewRef.current;
        previewRef.current = null;
        if (
          !abandoned &&
          preview &&
          Math.abs(preview.x1 - preview.x0) +
            Math.abs(preview.y1 - preview.y0) >
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
    },
    [doc, undoManager, scheduleRedraw],
  );

  const releasePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, abandoned: boolean) => {
      const pointers = pointersRef.current;
      // A hand resting on the board was turned away on the way down, so its lift
      // must not end the stroke the stylus is still drawing.
      if (
        event.pointerType === "touch" &&
        penDownRef.current &&
        !pointers.has(event.pointerId)
      ) {
        return;
      }
      pointers.delete(event.pointerId);
      if (event.pointerType === "pen") penDownRef.current = false;
      cancelLongPress();

      if (gestureRef.current?.type === "pinch") {
        const [a, b] = [...pointers.values()];
        // A third finger lifting leaves a pinch going, on whichever two remain.
        gestureRef.current =
          a && b
            ? { type: "pinch", pinch: pinchFrom(a, b, viewRef.current) }
            : null;
      } else {
        endGesture(abandoned);
      }

      if (pointers.size === 0) holdOffRef.current = false;
    },
    [endGesture, cancelLongPress],
  );

  const onPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      releasePointer(event, false);
      awareness.setLocalStateField("cursor", null);
    },
    [releasePointer, awareness],
  );

  const copyInvite = useCallback(async () => {
    const url = inviteUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Invite link copied");
    } catch {
      showToast(url);
    }
  }, [code, showToast]);

  const onFilesPicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = imageFilesFrom(event.target.files);
      event.target.value = "";
      if (files.length === 0) return;
      // A fixed corner puts a picture off the side of a phone, so it lands where
      // the board is being looked at, as a dropped one does.
      const [centreX, centreY] = viewportCentre();
      void addImages(files, centreX - 140, centreY - 100);
    },
    [addImages, viewportCentre],
  );

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

  const reach = coarse ? HANDLE_REACH : MOUSE_REACH;
  const push = coarse ? HANDLE_PUSH : 0;

  const surfaceCursor = drawMode
    ? tool === "pan"
      ? "grab"
      : "crosshair"
    : tool === "text"
      ? "text"
      : "default";

  return (
    <div className="fixed inset-x-0 top-0 h-[100dvh] overflow-hidden bg-paper">
      <div
        ref={surfaceRef}
        role="application"
        aria-label="Whiteboard surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => releasePointer(event, false)}
        onPointerCancel={(event) => releasePointer(event, true)}
        onPointerLeave={onPointerLeave}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="absolute inset-0 touch-none bg-paper select-none [-webkit-touch-callout:none]"
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
                ref={(node) => {
                  const nodes = nodesRef.current;
                  if (node) nodes.set(element.id, node);
                  else nodes.delete(element.id);
                }}
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
                        ...handleFrame(reach, 13, view.zoom),
                        left: "50%",
                        marginLeft: `${-frameOffset(reach, 13, view.zoom)}px`,
                        top: `${-20.5 / view.zoom - frameOffset(reach, 13, view.zoom)}px`,
                        cursor: "grab",
                      }}
                    >
                      <span style={dotStyle(13, view.zoom, "50%")} />
                    </div>

                    <button
                      type="button"
                      title="Remove"
                      aria-label="Remove"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={removeSelected}
                      style={{
                        ...handleFrame(reach, 18, view.zoom),
                        right: `${-push / view.zoom - frameOffset(reach, 18, view.zoom)}px`,
                        top: `${-push / view.zoom - frameOffset(reach, 18, view.zoom)}px`,
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          ...dotStyle(18, view.zoom, "50%"),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "oklch(0.62 0.19 250)",
                          fontSize: `${13 / view.zoom}px`,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </span>
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
                          ...handleFrame(reach, 13, view.zoom),
                          right: `${(-0.5 - push) / view.zoom - frameOffset(reach, 13, view.zoom)}px`,
                          bottom: `${(-0.5 - push) / view.zoom - frameOffset(reach, 13, view.zoom)}px`,
                          cursor: "nwse-resize",
                        }}
                      >
                        <span style={dotStyle(13, view.zoom, "3px")} />
                      </div>
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

      {narrow ? (
        <>
          <div className="absolute top-[calc(12px+var(--safe-t))] left-[calc(12px+var(--safe-l))] flex items-center gap-2.5 rounded-xl border border-line bg-panel px-3 py-2 shadow-panel">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">
              slate
            </span>
            <div className="h-3.5 w-px bg-rule" />
            <span className="text-[12px] font-medium tracking-[0.12em] text-ink-muted">
              {code}
            </span>
            <div
              className="size-2 rounded-full"
              title={peerLabel(status, peers)}
              style={{
                background:
                  status === "connected" ? "oklch(0.62 0.19 25)" : "#cfcdc6",
              }}
            />
          </div>

          <button
            type="button"
            title="Reset view"
            onClick={() => setView(HOME_VIEW)}
            className="absolute top-[calc(60px+var(--safe-t))] left-[calc(12px+var(--safe-l))] min-h-9 cursor-pointer rounded-[10px] border border-line bg-panel px-2.5 text-[12px] font-medium text-ink-soft shadow-panel"
          >
            {`${Math.round(view.zoom * 100)}%`}
          </button>

          <div className="absolute top-[calc(12px+var(--safe-t))] right-[calc(12px+var(--safe-r))] flex items-center gap-0.5 rounded-xl border border-line bg-panel p-1 shadow-panel">
            <button
              type="button"
              aria-label="Undo"
              onClick={undo}
              className="size-10 cursor-pointer rounded-[10px] text-[17px] text-ink-soft"
            >
              &#8617;
            </button>
            <button
              type="button"
              aria-label="Redo"
              onClick={redo}
              className="size-10 cursor-pointer rounded-[10px] text-[17px] text-ink-soft"
            >
              &#8618;
            </button>
            <button
              type="button"
              aria-label="More"
              aria-pressed={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className={`size-10 cursor-pointer rounded-[10px] text-[17px] leading-none ${
                menuOpen ? "bg-active text-ink" : "text-ink-soft"
              }`}
            >
              &#8943;
            </button>
          </div>

          {menuOpen && (
            <BoardMenu
              localName={localName}
              onRename={onRename}
              onCopy={copyInvite}
              onPickImage={pickImage}
              onTakePhoto={coarse ? takePhoto : null}
              onPairPhone={coarse ? null : togglePhone}
              onClear={clearAll}
              onShowHelp={() => setSheetOpen(true)}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </>
      ) : (
        <>
          <div className="absolute top-[calc(18px+var(--safe-t))] left-[calc(18px+var(--safe-l))] flex items-center gap-2.5">
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

          <div className="absolute top-[calc(18px+var(--safe-t))] right-[calc(18px+var(--safe-r))] flex items-center gap-1 rounded-xl border border-line bg-panel p-[7px] shadow-panel">
            <button
              type="button"
              title="Undo \u00b7 \u2318Z"
              onClick={undo}
              className={`cursor-pointer rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-hover ${
                coarse ? "min-h-11" : ""
              }`}
            >
              Undo
            </button>
            <button
              type="button"
              title="Redo \u00b7 \u21e7\u2318Z"
              onClick={redo}
              className={`cursor-pointer rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-hover ${
                coarse ? "min-h-11" : ""
              }`}
            >
              Redo
            </button>
            <button
              type="button"
              onClick={clearAll}
              className={`cursor-pointer rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-ghost transition-colors hover:bg-hover hover:text-peer ${
                coarse ? "min-h-11" : ""
              }`}
            >
              Clear
            </button>
            <div className="mx-0.5 h-[22px] w-px bg-rule" />
            <button
              type="button"
              title="Keyboard shortcuts \u00b7 ?"
              aria-label="Keyboard shortcuts"
              aria-pressed={sheetOpen}
              onClick={() => setSheetOpen((open) => !open)}
              className={`cursor-pointer rounded-lg text-[13.5px] font-medium transition-colors ${
                coarse ? "size-11" : "size-9"
              } ${sheetOpen ? "bg-active text-ink" : "text-ink-soft hover:bg-hover"}`}
            >
              ?
            </button>
          </div>
        </>
      )}

      <Toolbar
        tool={tool}
        shape={shape}
        color={color}
        width={width}
        zoomLabel={`${Math.round(view.zoom * 100)}%`}
        narrow={narrow}
        coarse={coarse}
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

      {!narrow && (
        <div className="pointer-events-none absolute bottom-[calc(88px+var(--safe-b))] left-1/2 -translate-x-1/2 text-[11.5px] leading-[1.5] tracking-[0.01em] whitespace-nowrap text-ink-ghost">
          {TOOL_STATUS[tool]}
        </div>
      )}

      {status === "reconnecting" && (
        <div
          className={`absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-[11px] bg-ink px-[15px] py-[9px] text-[13px] text-ink-invert shadow-notice ${
            narrow
              ? "top-[calc(106px+var(--safe-t))]"
              : "top-[calc(74px+var(--safe-t))]"
          }`}
        >
          <div className="size-[7px] rounded-full bg-amber" />
          <span>Lost the connection · reconnecting</span>
        </div>
      )}

      {toast && (
        <div
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 animate-toast-in rounded-[10px] bg-ink px-4 py-[9px] text-[13px] text-ink-invert ${
            status === "reconnecting"
              ? narrow
                ? "top-[calc(158px+var(--safe-t))]"
                : "top-[calc(126px+var(--safe-t))]"
              : narrow
                ? "top-[calc(106px+var(--safe-t))]"
                : "top-[calc(74px+var(--safe-t))]"
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
        onChange={onFilesPicked}
      />

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFilesPicked}
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
