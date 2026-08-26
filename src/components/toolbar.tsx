"use client";

import { Minus, Plus } from "@phosphor-icons/react";
import type { ShapeId, ToolId } from "@/lib/board-doc";
import type { CompanionState } from "@/lib/companion-host";
import { SHAPES, SWATCHES, TOOLS, WIDTHS } from "@/lib/tools";
import { PhonePanel } from "./phone-panel";

const TOOL_BUTTON =
  "cursor-pointer rounded-[10px] px-[13px] py-[9px] text-[13.5px] font-medium transition-colors";

/** A thumb needs about this much of a target, whatever the label inside it is. */
const THUMB = "min-h-11 min-w-11";

const DOCK_SHELL =
  "absolute rounded-[15px] border border-line bg-panel shadow-dock";

const ROW_SHELL =
  "absolute flex items-center justify-center rounded-xl border border-line bg-panel shadow-panel";

type ToolbarProps = {
  tool: ToolId;
  shape: ShapeId;
  color: string;
  width: number;
  zoomLabel: string;
  /** Below the width the full dock needs, so the dock carries the tools alone. */
  narrow: boolean;
  coarse: boolean;
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

function Swatch({
  swatch,
  selected,
  size,
}: {
  swatch: { name: string; value: string };
  selected: boolean;
  size: number;
}) {
  return (
    <span
      className="block rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: swatch.value,
        border: selected ? "2px solid #fff" : "2px solid transparent",
        boxShadow: selected
          ? `0 0 0 2px ${swatch.value}`
          : "0 0 0 1px rgb(28 27 25 / 0.12)",
      }}
    />
  );
}

/** The colours and the nib, which the narrow dock has no room to keep beside the tools. */
function StyleRow({
  color,
  width,
  onSelectColor,
  onSelectWidth,
}: Pick<ToolbarProps, "color" | "width" | "onSelectColor" | "onSelectWidth">) {
  return (
    <div
      className={`${ROW_SHELL} inset-x-3 bottom-[calc(76px+var(--safe-b))] gap-0.5 p-1.5`}
    >
      {SWATCHES.map((swatch) => (
        <button
          key={swatch.name}
          type="button"
          aria-label={swatch.name}
          onClick={() => onSelectColor(swatch.value)}
          className={`${THUMB} flex flex-1 cursor-pointer items-center justify-center rounded-[10px]`}
        >
          <Swatch swatch={swatch} selected={color === swatch.value} size={22} />
        </button>
      ))}

      <div className="mx-1 h-6 w-px bg-rule" />

      {WIDTHS.map((option) => (
        <button
          key={option.name}
          type="button"
          aria-label={option.name}
          onClick={() => onSelectWidth(option.value)}
          className={`${THUMB} flex flex-1 cursor-pointer items-center justify-center rounded-[10px] transition-colors ${
            width === option.value ? "bg-active" : ""
          }`}
        >
          <span
            className="block rounded-full bg-ink"
            style={{
              width: `${option.value + 3}px`,
              height: `${option.value + 3}px`,
            }}
          />
        </button>
      ))}
    </div>
  );
}

export function Toolbar({
  tool,
  shape,
  color,
  width,
  zoomLabel,
  narrow,
  coarse,
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
  const inks = tool === "pen" || tool === "eraser" || tool === "shape";

  const shapeRow = (
    <div
      className={`${ROW_SHELL} left-1/2 -translate-x-1/2 gap-[3px] p-1.5 ${
        narrow
          ? "bottom-[calc(140px+var(--safe-b))]"
          : "bottom-[calc(118px+var(--safe-b))]"
      }`}
    >
      {SHAPES.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelectShape(option.id)}
          className={`cursor-pointer rounded-lg px-3 text-[13px] font-medium transition-colors ${
            coarse ? "min-h-11" : "py-[7px]"
          } ${
            shape === option.id
              ? "bg-active text-ink"
              : "text-ink-muted hover:bg-hover"
          }`}
        >
          {option.name}
        </button>
      ))}
    </div>
  );

  if (narrow) {
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
          <>
            {tool === "shape" && shapeRow}
            {inks && (
              <StyleRow
                color={color}
                width={width}
                onSelectColor={onSelectColor}
                onSelectWidth={onSelectWidth}
              />
            )}
          </>
        )}

        <div
          className={`${DOCK_SHELL} inset-x-3 bottom-[calc(12px+var(--safe-b))] flex items-center gap-0.5 p-1.5`}
        >
          {TOOLS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-label={option.label}
              onClick={() => onSelectTool(option.id)}
              className={`${THUMB} flex-1 cursor-pointer rounded-[10px] px-1 text-[13px] font-medium transition-colors ${
                tool === option.id ? "bg-ink text-ink-invert" : "text-ink-soft"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </>
    );
  }

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
        tool === "shape" && shapeRow
      )}

      <div
        className={`${DOCK_SHELL} bottom-[calc(22px+var(--safe-b))] left-1/2 flex -translate-x-1/2 items-center gap-1.5 p-2`}
      >
        <div className="flex items-center gap-0.5">
          {TOOLS.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.hint}
              onClick={() => onSelectTool(option.id)}
              className={`${TOOL_BUTTON} ${coarse ? THUMB : ""} ${
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
            className={`${TOOL_BUTTON} ${coarse ? THUMB : ""} text-ink-soft hover:bg-hover`}
          >
            Image
          </button>
          <button
            type="button"
            title="send a photo from your phone"
            aria-pressed={phone !== null}
            onClick={onTogglePhone}
            className={`${TOOL_BUTTON} ${coarse ? THUMB : ""} ${
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
              className={`flex cursor-pointer items-center justify-center rounded-full p-0 ${
                coarse ? THUMB : "size-[19px]"
              }`}
            >
              <Swatch
                swatch={swatch}
                selected={color === swatch.value}
                size={19}
              />
            </button>
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
              className={`flex cursor-pointer items-center justify-center rounded-lg transition-colors ${
                coarse ? THUMB : "size-7"
              } ${width === option.value ? "bg-active" : "hover:bg-hover"}`}
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
            aria-label="Zoom out"
            onClick={onZoomOut}
            className={`flex cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-hover ${
              coarse ? THUMB : "size-7"
            }`}
          >
            <Minus size={15} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            title="Reset view"
            onClick={onZoomReset}
            className={`min-w-[46px] cursor-pointer rounded-lg text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-hover ${
              coarse ? "min-h-11" : "h-7"
            }`}
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className={`flex cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-hover ${
              coarse ? THUMB : "size-7"
            }`}
          >
            <Plus size={15} weight="bold" aria-hidden />
          </button>
        </div>
      </div>
    </>
  );
}
