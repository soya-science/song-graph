import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>
);
export const BackIcon = (p: IconProps) => (
  <Icon {...p}><path d="M15 18l-6-6 6-6" /></Icon>
);
export const ForwardIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 18l6-6-6-6" /></Icon>
);
export const FitIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const MinusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14" /></Icon>
);
export const RotateIcon = (p: IconProps) => (
  <Icon {...p}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></Icon>
);
export const SlidersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </Icon>
);
export const HelpIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /><path d="M12 17.5h0" /></Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>
);
export const GraphIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="1.8" /><circle cx="19" cy="6" r="1.8" />
    <circle cx="5" cy="18" r="1.8" /><circle cx="19" cy="18" r="1.8" />
    <path d="M10.2 10.4 6.4 7.3M13.8 10.4l3.8-3.1M10.2 13.6l-3.8 3.1M13.8 13.6l3.8 3.1" />
  </Icon>
);
export const TargetIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Icon>
);
export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>
);
export const FilterIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></Icon>
);
export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>
);
export const LogoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="17" r="2.4" /><circle cx="17" cy="15" r="2.4" /><circle cx="12" cy="6" r="2.4" />
    <path d="M7.6 15.2 10.8 8M13.4 8l2.6 4.7M8.4 16.6l6.2-1.2" />
  </Icon>
);
export const SidebarIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Icon>
);
