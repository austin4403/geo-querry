import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

export default function GeoQuerryLogo({
  size = 24,
  className = "w-6 h-6",
  ...props
}: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* ====================================================================
          OPEN BOOK (Arched / Bowed upward at center, sweeping to edges)
          ==================================================================== */}
      {/* Left Top Page Curve */}
      <path d="M16 18.5 C12.5 15.5 7.5 16 3 18.8 L3 23.8 C7.5 21 12.5 20.5 16 23.5 Z" />

      {/* Right Top Page Curve */}
      <path d="M16 18.5 C19.5 15.5 24.5 16 29 18.8 L29 23.8 C24.5 21 19.5 20.5 16 23.5 Z" />

      {/* Center Spine Crease */}
      <path d="M16 18.5 L16 23.5" />

      {/* Book Bottom Page Layers / Thickness */}
      <path d="M3.5 25 C7.5 22.5 12 22 15 24.5" />
      <path d="M28.5 25 C24.5 22.5 20 22 17 24.5" />

      {/* ====================================================================
          MICROSCOPE (Original angled position on left)
          ==================================================================== */}
      {/* Microscope Base Stand */}
      <path d="M6.5 18 L11.5 18" />
      {/* Stage */}
      <path d="M6.5 14.5 L11.5 14.5" />
      {/* Curved Arm */}
      <path d="M9 18 L9 14.5 C9 11 12 9.5 12 7.5" />
      {/* Angled Body Tube */}
      <path d="M13.5 4.5 L10.5 11" />
      {/* Eyepiece */}
      <path d="M12.5 3 L15 4.5" />
      {/* Revolving Nosepiece / Objective Lens */}
      <path d="M9.8 11.8 L10.8 13.5" />
      {/* Substage focus knob */}
      <circle cx="9" cy="14.5" r="0.75" fill="currentColor" />

      {/* ====================================================================
          GEOLOGICAL ROCK HAMMER (Original position on right)
          ==================================================================== */}
      {/* Hammer Handle */}
      <path d="M15.5 18 L23.5 7.5" />
      {/* Hammer Grip details */}
      <path d="M16.5 16.7 L17.7 17.6" />
      {/* Hammer Grip details */}
      <path d="M18 14.7 L19.2 15.6" />
      {/* Hammer Head - Flat Strike Face (Top Right) */}
      <path d="M22 5.5 L26 8.5" />
      {/* Hammer Head - Pointed Rock Pick (Top Left Arc) */}
      <path d="M22 5.5 Q18 3.5 17 5.5" />
      {/* Hammer Head Collar Ring */}
      <path d="M21 7 L23 8.5" />
    </svg>
  );
}

export { GeoQuerryLogo, GeoQuerryLogo as GeolifyLogo };
