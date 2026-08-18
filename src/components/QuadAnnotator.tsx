import React, { useRef, useState, useEffect } from 'react';
import type { Pt } from '../types';

// Draggable 4-corner quad over an image, in fractional (0..1) coordinates so it
// is resolution-independent. Corners are ordered [TL, TR, BR, BL].
interface Props {
  imageUrl: string;
  quad: [Pt, Pt, Pt, Pt];          // fractional coords
  onChange: (quad: [Pt, Pt, Pt, Pt]) => void;
}

const LABELS = ['TL', 'TR', 'BR', 'BL'];

export const QuadAnnotator: React.FC<Props> = ({ imageUrl, quad, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    if (drag == null) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const pt = 'touches' in e ? e.touches[0] : e;
      const x = Math.min(1, Math.max(0, (pt.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (pt.clientY - rect.top) / rect.height));
      const next = quad.map((p, i) => (i === drag ? { x, y } : p)) as [Pt, Pt, Pt, Pt];
      onChange(next);
    };
    const up = () => setDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [drag, quad, onChange]);

  const poly = quad.map(p => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none', touchAction: 'none' }}>
      <img src={imageUrl} alt="annotate" style={{ display: 'block', width: '100%', borderRadius: 8 }} draggable={false} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <polygon points={poly} style={{ fill: 'var(--accent2)', stroke: 'var(--accent2)' }}
          fillOpacity={0.22} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {quad.map((p, i) => (
        <button key={i}
          onMouseDown={() => setDrag(i)}
          onTouchStart={() => setDrag(i)}
          title={`Corner ${LABELS[i]}`}
          style={{
            position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`,
            transform: 'translate(-50%,-50%)', width: 22, height: 22, borderRadius: '50%',
            background: 'var(--accent2)', border: '2px solid #fff', cursor: 'grab',
            boxShadow: '0 1px 4px rgba(0,0,0,.4)', color: '#06251f', font: '700 9px system-ui',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}>
          {LABELS[i]}
        </button>
      ))}
    </div>
  );
};
