// Signature on screen (WF-04 step 7, Figma 39:19987): draw with a finger, pen or mouse. Exported as a
// PNG and uploaded through the photo pipeline (staff only).
import { useEffect, useRef, useState } from 'react';

export function SignaturePad({
  label,
  onChange,
}: {
  label: string;
  /** Called with true once something is drawn, false after clearing. */
  onChange: (signed: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    // Ink on white whatever the theme: the signature is archived as a document image.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function clear() {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    setSigned(false);
    onChange(false);
  }

  return (
    <div>
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        className="h-44 w-full touch-none rounded-lg border border-dashed border-control bg-white"
        onPointerDown={(e) => {
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          if (!signed) {
            setSigned(true);
            onChange(true);
          }
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
      />
      <button
        type="button"
        onClick={clear}
        className="mt-2 min-h-11 text-body font-semibold text-primary underline"
      >
        Clear signature
      </button>
    </div>
  );
}

/** The pad's drawing as a PNG blob. */
export function signatureBlob(container: HTMLElement | null): Promise<Blob | null> {
  const c = container?.querySelector('canvas');
  return new Promise((resolve) => {
    if (!c) resolve(null);
    else c.toBlob(resolve, 'image/png');
  });
}
