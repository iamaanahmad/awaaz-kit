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

/**
 * Still ghost used as the Bill Awaaz brand mark. Same drawing as the mascot, without the float,
 * so the header stays calm. Decorative.
 */
export function GhostMark({ size = 28, className }: DecorProps): ReactElement {
  return <GhostMascot size={size} className={`ak-ghost-still${className ? ` ${className}` : ''}`} />;
}

/*
 * UI icon set. One family: 24px grid, 2px rounded stroke, currentColor, so they inherit the
 * control's text colour in every theme and state. Always aria-hidden next to a visible label.
 */
interface IconProps {
  size?: number;
  className?: string;
}

function Icon({
  size = 20,
  className,
  children,
}: IconProps & { children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <svg
      {...hidden}
      className={`ak-icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function MicIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </Icon>
  );
}

export function StopIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </Icon>
  );
}

export function RetryIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />
    </Icon>
  );
}

export function SunIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Icon>
  );
}
