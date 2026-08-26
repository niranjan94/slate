"use client";

import type { ShapeId, ToolId } from "@/lib/board-doc";
import type { CompanionState } from "@/lib/companion-host";
import { SHAPES, SWATCHES, TOOLS, WIDTHS } from "@/lib/tools";
import { PhonePanel } from "./phone-panel";

const TOOL_BUTTON =
  "cursor-pointer rounded-[10px] px-[13px] py-[9px] text-[13.5px] font-medium transition-colors";

type ToolbarProps = {
  tool: ToolId;
  shape: ShapeId;
  color: string;
  width: number;
  zoomLabel: string;
  /** Non-null exactly while the phone panel is open, so one prop carries the gate and the contents. */
  phone: CompanionState | null;
  onSelectTool: (tool: ToolId) => void;
  onSelectShape: (shape: ShapeId) => void;
  onSelectColor: (color: string) => void;
  onSelectWidth: (width: number) => void;
  onPickImage: () => void;
  onTogglePhone: () => void;
  onRevokePhone: () => void;
  onCopyPhoneLink: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
};

export function Toolbar({
  tool,
  shape,
  color,
  width,
  zoomLabel,
  phone,
  onSelectTool,
  onSelectShape,
  onSelectColor,
  onSelectWidth,
  onPickImage,
  onTogglePhone,
  onRevokePhone,
  onCopyPhoneLink,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: ToolbarProps) {
  return (
    <>
      {phone ? (
        <PhonePanel
          state={phone}
          onCopy={onCopyPhoneLink}
          onRevoke={onRevokePhone}
          onClose={onTogglePhone}
        />
      ) : (
        tool === "shape" && (
          <div className="absolute bottom-[calc(118px+var(--safe-b))] left-1/2 flex -translate-x-1/2 items-center gap-[3px] rounded-xl border border-line bg-panel p-1.5 shadow-panel">
            {SHAPES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelectShape(option.id)}
                className={`cursor-pointer rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors ${
                  shape === option.id
                    ? "bg-active text-ink"
                    : "text-ink-muted hover:bg-hover"
                }`}
              >
                {option.name}
              </button>
            ))}
          </div>
        )
      )}

      <div className="absolute bottom-[calc(22px+var(--safe-b))] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-[15px] border border-line bg-panel p-2 shadow-dock">
        <div className="flex items-center gap-0.5">
          {TOOLS.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.hint}
              onClick={() => onSelectTool(option.id)}
              className={`${TOOL_BUTTON} ${
                tool === option.id
                  ? "bg-ink text-ink-invert"
                  : "text-ink-soft hover:bg-hover"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            title="add a picture"
            onClick={onPickImage}
            className={`${TOOL_BUTTON} text-ink-soft hover:bg-hover`}
          >
            Image
          </button>
          <button
            type="button"
            title="send a photo from your phone"
            aria-pressed={phone !== null}
            onClick={onTogglePhone}
            className={`${TOOL_BUTTON} ${
              phone ? "bg-active text-ink" : "text-ink-soft hover:bg-hover"
            }`}
          >
            Phone
          </button>
        </div>

        <div className="mx-1 h-[26px] w-px bg-rule" />

        <div className="flex items-center gap-[7px] px-1">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.name}
              type="button"
              title={swatch.name}
              aria-label={swatch.name}
              onClick={() => onSelectColor(swatch.value)}
              className="size-[19px] cursor-pointer rounded-full p-0"
              style={{
                background: swatch.value,
                border:
                  color === swatch.value
                    ? "2px solid #fff"
                    : "2px solid transparent",
                boxShadow:
                  color === swatch.value
                    ? `0 0 0 2px ${swatch.value}`
                    : "0 0 0 1px rgb(28 27 25 / 0.12)",
              }}
            />
          ))}
        </div>

        <div className="mx-1 h-[26px] w-px bg-rule" />

        <div className="flex items-center gap-1 px-0.5">
          {WIDTHS.map((option) => (
            <button
              key={option.name}
              type="button"
              title={option.name}
              aria-label={option.name}
              onClick={() => onSelectWidth(option.value)}
              className={`flex size-7 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                width === option.value ? "bg-active" : "hover:bg-hover"
              }`}
            >
              <span
                className="block rounded-full bg-ink"
                style={{
                  width: `${option.value + 2}px`,
                  height: `${option.value + 2}px`,
                }}
              />
            </button>
          ))}
        </div>

        <div className="mx-1 h-[26px] w-px bg-rule" />

        <div className="flex items-center gap-px">
          <button
            type="button"
            title="Zoom out"
            onClick={onZoomOut}
            className="size-7 cursor-pointer rounded-lg text-base text-ink-soft transition-colors hover:bg-hover"
          >
            &#8722;
          </button>
          <button
            type="button"
            title="Reset view"
            onClick={onZoomReset}
            className="h-7 min-w-[46px] cursor-pointer rounded-lg text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-hover"
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            title="Zoom in"
            onClick={onZoomIn}
            className="size-7 cursor-pointer rounded-lg text-base text-ink-soft transition-colors hover:bg-hover"
          >
            +
          </button>
        </div>
      </div>
    </>
  );
}
