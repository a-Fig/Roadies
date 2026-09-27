import type { SVGProps } from 'react';
import { WORDMARK } from '../intro/shapes';

type IconProps = SVGProps<SVGSVGElement> & { slashed?: boolean };

function Icon({ slashed, children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
      {children}
      {slashed && <path d="M3 3.5 20.5 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
    />
  </Icon>
);

export const HeadphonesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9Z"
    />
  </Icon>
);

export const SpeakerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M11.38 3.08A1 1 0 0 1 12 4v16a1 1 0 0 1-1.7.7L5.58 16H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h2.58l4.72-4.7a1 1 0 0 1 1.08-.22ZM14 5.14a7 7 0 0 1 0 13.72v-2.06a5 5 0 0 0 0-9.6V5.14Zm0 3.96a3 3 0 0 1 0 5.8V9.1Z"
    />
  </Icon>
);

/** Her actual "Roadies" wordmark (the outlined Bepory type from the intro), not the app icon + text. */
export const Wordmark = (p: SVGProps<SVGSVGElement>) => (
  <svg className="wordmark" viewBox="0 0 297 57" role="img" aria-label="Roadies" {...p}>
    <path d={WORDMARK.ro} />
    <path d={WORDMARK.adies} />
  </svg>
);

export const CarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2Zm2.1 0h9.8l-1.2-3.6a.5.5 0 0 0-.5-.4H8.8a.5.5 0 0 0-.5.4L7.1 11Z"
    />
  </Icon>
);

// ---- Her line icons ----
// The girlfriend's screens use Lucide's 24px line icons (ISC license,
// lucide.dev). These are the exact Lucide paths for the ones the phone
// screens need, so the voice chat's controls, tags and cards match hers. The
// filled icons above stay for the projector.

type LineProps = SVGProps<SVGSVGElement>;

function Line({ children, ...props }: LineProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const LineMic = (p: LineProps) => (
  <Line {...p}>
    <path d="M12 19v3" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <rect x="9" y="2" width="6" height="13" rx="3" />
  </Line>
);

export const LineMicOff = (p: LineProps) => (
  <Line {...p}>
    <path d="M12 19v3" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M16.95 16.95A7 7 0 0 1 5 12v-2" />
    <path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
    <path d="m2 2 20 20" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
  </Line>
);

export const LineHeadphones = (p: LineProps) => (
  <Line {...p}>
    <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
  </Line>
);

export const LineHeadphoneOff = (p: LineProps) => (
  <Line {...p}>
    <path d="M21 14h-1.343" />
    <path d="M9.128 3.47A9 9 0 0 1 21 12v3.343" />
    <path d="m2 2 20 20" />
    <path d="M20.414 20.414A2 2 0 0 1 19 21h-1a2 2 0 0 1-2-2v-3" />
    <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 2.636-6.364" />
  </Line>
);

export const LinePhoneOff = (p: LineProps) => (
  <Line {...p}>
    <path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272" />
    <path d="M22 2 2 22" />
    <path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473" />
  </Line>
);

export const LineUsers = (p: LineProps) => (
  <Line {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <path d="M16 3.128a4 4 0 0 1 0 7.744" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <circle cx="9" cy="7" r="4" />
  </Line>
);

export const LineShieldCheck = (p: LineProps) => (
  <Line {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </Line>
);

export const LineClock = (p: LineProps) => (
  <Line {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Line>
);

export const LineVolume = (p: LineProps) => (
  <Line {...p}>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <path d="M16 9a5 5 0 0 1 0 6" />
    <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </Line>
);

export const LineArrowLeft = (p: LineProps) => (
  <Line {...p}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </Line>
);

export const LineAlert = (p: LineProps) => (
  <Line {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </Line>
);

export const LineSettings = (p: LineProps) => (
  <Line {...p}>
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
  </Line>
);
