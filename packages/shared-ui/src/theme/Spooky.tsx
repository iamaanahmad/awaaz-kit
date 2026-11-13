import type { ReactElement } from 'react';

/** Props shared by the decorative Halloween SVGs. They are always hidden from assistive tech. */
export interface DecorProps {
  size?: number;
  className?: string;
}

const hidden = { 'aria-hidden': true, focusable: 'false' } as const;

/**
 * Small friendly ghost. Purely decorative: aria-hidden, no text. The gentle float is plain CSS
 * (`.ak-ghost`) and is switched off by prefers-reduced-motion in tokens.css.
 */
export function GhostMascot({ size = 72, className }: DecorProps): ReactElement {
  return (
    <svg
      {...hidden}
      className={`ak-ghost${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
    >
      <path
        d="M32 6C19.3 6 10 15.6 10 28v26c0 2.2 2.4 3.5 4.2 2.2l4.6-3.3 5.1 3.7a3 3 0 0 0 3.5 0L32 53l4.6 3.6a3 3 0 0 0 3.5 0l5.1-3.7 4.6 3.3c1.8 1.3 4.2 0 4.2-2.2V28C54 15.6 44.7 6 32 6z"
        fill="var(--ui-ghost-body)"
        stroke="var(--ui-color-border)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <ellipse cx="25" cy="27" rx="3.6" ry="4.6" fill="var(--ui-ghost-eye)" />
      <ellipse cx="39" cy="27" rx="3.6" ry="4.6" fill="var(--ui-ghost-eye)" />
      <ellipse cx="32" cy="38" rx="3.4" ry="4" fill="var(--ui-ghost-eye)" />
      <ellipse cx="19" cy="35" rx="3" ry="2" fill="#ff9aa8" opacity="0.55" />
      <ellipse cx="45" cy="35" rx="3" ry="2" fill="#ff9aa8" opacity="0.55" />
    </svg>
  );
}

/** Tiny jack-o'-lantern for headers. Decorative. */
export function PumpkinIcon({ size = 28, className }: DecorProps): ReactElement {
  return (
    <svg {...hidden} className={className} width={size} height={size} viewBox="0 0 32 32">
      <path
        d="M16 7c0-2.4 1-4 3-5"
        fill="none"
        stroke="#7ee2a0"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <ellipse cx="9.5" cy="19" rx="6.5" ry="9" fill="#ff7a1a" />
      <ellipse cx="22.5" cy="19" rx="6.5" ry="9" fill="#ff7a1a" />
      <ellipse cx="16" cy="19" rx="6" ry="10" fill="#ff9a45" />
      <path d="M10.5 15l2.8 3.4h-5.6zM21.5 15l2.8 3.4h-5.6z" fill="#1a0b00" />
      <path
        d="M10 23.5l2.2 1.6 1.8-1.4 2 1.4 2-1.4 1.8 1.4 2.2-1.6"
        fill="none"
        stroke="#1a0b00"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Tiny bat for headers. Decorative. */
export function BatIcon({ size = 28, className }: DecorProps): ReactElement {
  return (
    <svg {...hidden} className={className} width={size} height={size} viewBox="0 0 32 32">
      <path
        d="M16 10l1.8-3 1.2 3.2c2.2-1 4.6-2.8 7-2.2-1 1.4-1.4 3.2-1 5 .4 1.8 1.6 3.4 2.8 4.6-2.2-.6-4.2-.2-5.6 1.2-1-1.2-2.4-1.8-4-1.4L16 25l-2.2-4.4c-1.6-.4-3 .2-4 1.4-1.4-1.4-3.4-1.8-5.6-1.2 1.2-1.2 2.4-2.8 2.8-4.6.4-1.8 0-3.6-1-5 2.4-.6 4.8 1.2 7 2.2L14.2 7z"
        fill="var(--ui-color-border)"
      />
      <circle cx="14" cy="13" r="0.9" fill="var(--ui-color-surface)" />
      <circle cx="18" cy="13" r="0.9" fill="var(--ui-color-surface)" />
    </svg>
  );
}
