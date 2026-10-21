import { useRef } from 'react';

const PATHS = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>,
  start: <><path d="M6 5v14" /><path d="M18 5l-9 7 9 7z" fill="currentColor" /></>,
  end: <><path d="M18 5v14" /><path d="M6 5l9 7-9 7z" fill="currentColor" /></>,
  prev: <path d="M15 6l-6 6 6 6" />,
  next: <path d="M9 6l6 6-6 6" />,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></>,
  cursor: <path d="M5 3l14 8-6 2-2 6z" fill="currentColor" />,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6A17 17 0 002 12s3.5 7 10 7a9.6 9.6 0 005.4-1.6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 017.5-2" /></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" /><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" /><path d="M17 9l5 6M22 9l-5 6" /></>,
  magnet: <><path d="M5 4v8a7 7 0 0014 0V4h-4v8a3 3 0 01-6 0V4z" /><path d="M5 8h4M15 8h4" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5M8 11h6" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5L5 20" /></>,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  shapes: <><rect x="3" y="3" width="9" height="9" rx="1.5" /><circle cx="16.5" cy="16.5" r="4.5" /></>,
  sparkles: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  transition: <><rect x="2" y="6" width="9" height="12" rx="1.5" /><rect x="13" y="6" width="9" height="12" rx="1.5" /><path d="M9 12h6M13 10l2 2-2 2" /></>,
  export: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5" /></>,
  folder: <path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  save: <><path d="M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M7 3v6h8V3M7 21v-7h10v7" /></>,
  help: <><circle cx="12" cy="12" r="9.5" /><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 4M12 17.5v.01" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  camera: <><path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="12" cy="13" r="4" /></>,
  stopwatch: <><circle cx="12" cy="14" r="7" /><path d="M12 14V10M10 3h4M12 3v4" /></>,
  diamond: <path d="M12 3l9 9-9 9-9-9z" fill="currentColor" />,
  diamondO: <path d="M12 3l9 9-9 9-9-9z" />,
  link: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>,
  unlink: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7M3 3l18 18" /></>,
  marker: <path d="M6 3h12v14l-6 4-6-4z" />,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3" /></>,
  reset: <><path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" /><path d="M3 3v5h5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12l5 5L20 7" />,
  speed: <><path d="M12 14l4-4" /><path d="M3.3 19a10 10 0 1117.4 0" /></>,
  wand: <><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" /></>,
};

export function Icon({ name, size = 18, className = '', style }) {
  return (
    <svg className={'icon ' + className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function IconButton({ icon, label, onClick, active, disabled, size = 18, className = '', shortcut, children }) {
  return (
    <button
      className={`icon-btn ${active ? 'active' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label}  (${shortcut})` : label}
      aria-label={label}
    >
      <Icon name={icon} size={size} />
      {children}
    </button>
  );
}

// Number box you can also drag left/right to change, like in Premiere / After Effects.
export function ScrubNumber({ value, onChange, onBegin, onEnd, step = 1, min, max, unit = '', width = 64 }) {
  const drag = useRef(null);
  const clamp = (v) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const shown = Math.round(value * 100) / 100;
  return (
    <span className="scrub" style={{ width }}>
      <input
        type="number"
        value={shown}
        step={step}
        onChange={(e) => e.target.value !== '' && onChange(clamp(parseFloat(e.target.value)), false)}
        onPointerDown={(e) => {
          if (document.activeElement === e.target) return;
          drag.current = { x: e.clientX, v: value, moved: false };
          e.target.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) < 3) return;
          if (!d.moved) { d.moved = true; onBegin?.(); }
          const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          onChange(clamp(Math.round((d.v + dx * step * mult) * 100) / 100), true);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d?.moved) onEnd?.();
          else e.target.focus();
        }}
      />
      {unit && <em>{unit}</em>}
    </span>
  );
}

export function Slider({ value, min, max, step = 1, onChange, onBegin, onEnd }) {
  return (
    <input
      className="slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--p': `${((value - min) / (max - min)) * 100}%` }}
      onPointerDown={() => onBegin?.()}
      onPointerUp={() => onEnd?.()}
      onChange={(e) => onChange(parseFloat(e.target.value), true)}
    />
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Section({ title, icon, children, right, defaultOpen = true }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        {icon && <Icon name={icon} size={15} />}
        <span>{title}</span>
        <span className="section-right" onClick={(e) => e.preventDefault()}>{right}</span>
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ width }}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <IconButton icon="close" label="Close" onClick={onClose} />}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
