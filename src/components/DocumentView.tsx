"use client";
import { useEffect, useRef, useState } from "react";
import type { DocModel, Field } from "@/lib/types";

interface Props {
  doc: DocModel;
  selectedId: string | null;
  addMode: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, value: string) => void;
  onAddAt: (page: number, x: number, y: number) => void;
}

export default function DocumentView({ doc, selectedId, addMode, onSelect, onChange, onAddAt }: Props) {
  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {doc.pages.map((page) => (
        <PageView
          key={page.index}
          page={page}
          fields={doc.fields.filter((f) => f.page === page.index)}
          selectedId={selectedId}
          addMode={addMode}
          onSelect={onSelect}
          onChange={onChange}
          onAddAt={onAddAt}
        />
      ))}
    </div>
  );
}

function PageView({
  page,
  fields,
  selectedId,
  addMode,
  onSelect,
  onChange,
  onAddAt,
}: Omit<Props, "doc"> & { page: DocModel["pages"][number]; fields: Field[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / page.width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.width]);

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!addMode) {
      onSelect(null);
      return;
    }
    const rect = ref.current!.getBoundingClientRect();
    onAddAt(page.index, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
  };

  return (
    <div
      ref={ref}
      onClick={handlePageClick}
      className={`relative w-full max-w-[900px] bg-white shadow-lg ring-1 ring-black/10 ${addMode ? "cursor-crosshair" : ""}`}
      style={{ aspectRatio: `${page.width} / ${page.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={page.imageUrl} alt={`Page ${page.index + 1}`} className="block h-full w-full select-none" draggable={false} />
      {fields.map((f) => {
        const modified = f.value !== f.original;
        const selected = f.id === selectedId;
        const editing = f.id === editingId;
        const style: React.CSSProperties = {
          left: f.x * scale,
          top: f.y * scale,
          minWidth: f.w * scale,
          height: f.h * scale,
          fontSize: f.fontSize * scale,
          lineHeight: `${f.h * scale}px`,
          fontWeight: f.bold ? 700 : 400,
          fontFamily: "Helvetica, Arial, sans-serif",
          backgroundColor: modified || editing ? f.bg : undefined,
        };
        return editing ? (
          <input
            key={f.id}
            autoFocus
            value={f.value}
            onChange={(e) => onChange(f.id, e.target.value)}
            onBlur={() => setEditingId(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditingId(null);
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ ...style, width: Math.max(f.w * scale, f.value.length * f.fontSize * scale * 0.6) }}
            className="absolute z-20 whitespace-nowrap border-0 px-0 text-[#141414] outline-none ring-2 ring-blue-500"
          />
        ) : (
          <div
            key={f.id}
            title={f.label}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(f.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onSelect(f.id);
              setEditingId(f.id);
            }}
            style={style}
            className={`absolute z-10 cursor-pointer whitespace-nowrap px-0 text-[#141414] transition-shadow ${
              selected ? "ring-2 ring-blue-600" : modified ? "ring-1 ring-emerald-500/70" : "ring-1 ring-blue-400/70 hover:ring-blue-600"
            } ${modified ? "" : "bg-blue-400/10 hover:bg-blue-400/20"}`}
          >
            {modified ? f.value : ""}
          </div>
        );
      })}
    </div>
  );
}
