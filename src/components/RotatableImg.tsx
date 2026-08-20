import React, { useEffect, useRef, useState } from 'react';
import { RotateCw, Undo2 } from 'lucide-react';
import { SmartImg } from './SmartImg';
import type { RotationDeg } from '../types';

const CYCLE: Record<RotationDeg, RotationDeg> = { 0: 90, 90: 180, 180: 270, 270: 0 };

interface Props {
  src: string;
  alt?: string;
  rotationDeg: RotationDeg;
  onRotationChange: (deg: RotationDeg) => void;
  crossOrigin?: 'anonymous' | 'use-credentials' | '';
  height?: number; // container height budget, px
}

// Wraps SmartImg with a rotate control. `object-fit: contain` + swapping which
// side (max-width vs max-height) is capped at 90°/270° means this doesn't need
// to know the image's intrinsic aspect ratio — works for any source.
export const RotatableImg: React.FC<Props> = ({ src, alt, rotationDeg, onRotationChange, crossOrigin, height = 460 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rotated = rotationDeg === 90 || rotationDeg === 270;
  // Pre-rotation layout box, capped so the POST-rotation paint fits the container.
  const boxStyle: React.CSSProperties = rotated
    ? { maxWidth: height, maxHeight: containerWidth || height }
    : { maxWidth: containerWidth || '100%', maxHeight: height };

  return (
    <div>
      <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height, overflow: 'hidden', borderRadius: 8, background: '#000' }}>
        <SmartImg src={src} alt={alt} crossOrigin={crossOrigin}
          style={{ ...boxStyle, width: 'auto', height: 'auto', objectFit: 'contain', transform: `rotate(${rotationDeg}deg)`, transition: 'transform .2s' }} />
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
        <button className="btn btn-sm btn-ghost" onClick={() => onRotationChange(CYCLE[rotationDeg])} title="Rotate 90°">
          <RotateCw size={14} /> Rotate 90°
        </button>
        {rotationDeg !== 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => onRotationChange(0)} title="Reset rotation">
            <Undo2 size={14} /> Reset
          </button>
        )}
        {rotationDeg !== 0 && <span className="muted" style={{ fontSize: '.72rem' }}>{rotationDeg}°</span>}
      </div>
    </div>
  );
};
