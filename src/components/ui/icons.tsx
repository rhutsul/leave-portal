// Іконки інтерфейсу — inline SVG зі штрихом currentColor (без бібліотек), декоративні: aria-hidden.
import type { ReactNode } from "react";

function Icon({ size = 18, strokeWidth = 1.8, children }: { size?: number; strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

export const CalendarIcon = ({ size }: IconProps) => (
  <Icon size={size} strokeWidth={2}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M8 2v4M16 2v4M3 10h18" />
  </Icon>
);

export const HomeIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Icon>
);

export const PlusIcon = ({ size }: IconProps) => (
  <Icon size={size} strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ListIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);

export const DecisionsIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 12l2 2 4-4" />
  </Icon>
);

export const ChartIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);

export const SignOutIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Icon>
);

export const AlertIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </Icon>
);

export const CheckCircleIcon = ({ size = 20 }: IconProps) => (
  <Icon size={size} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </Icon>
);

export const CloseIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ChevronLeftIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size} strokeWidth={2}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);

export const ChevronRightIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size} strokeWidth={2}>
    <path d="M9 18l6-6-6-6" />
  </Icon>
);

export const ClockIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

/** Іконки типів відпустки (макет UI). */
export const LeaveTypeIcon = ({ type, size }: IconProps & { type: string }) => (
  <Icon size={size}>
    {type === "sick" && <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />}
    {type === "personal" && <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />}
    {type === "unpaid" && <path d="M3 7h18v10H3zM7 12h.01M17 12h.01M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />}
    {type === "family" && (
      <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7S10 3 7.5 3a2 2 0 0 0 0 4H12zm0 0s2-4 4.5-4a2 2 0 0 1 0 4H12z" />
    )}
  </Icon>
);
