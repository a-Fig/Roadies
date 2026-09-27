import type { SVGProps } from 'react';

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

export const HangUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.96.96 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.3 11.3 0 0 0-2.67-1.85.99.99 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z"
    />
  </Icon>
);

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.6 21 3 13.4 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.46.57 3.58.11.35.03.74-.25 1.02L6.6 10.8Z"
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

export const ShuffleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 6h3.6c1.2 0 2.4.65 3 1.7l4.8 8.6c.6 1.05 1.8 1.7 3 1.7H21m0 0-3-3m3 3-3 3M3 18h3.6c1.2 0 2.4-.65 3-1.7l.6-1M21 6h-3.6c-1.2 0-2.4.65-3 1.7l-.6 1M21 6l-3-3m3 3-3 3"
    />
  </Icon>
);

export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="m19.4 13-.1-1 1.6-1.4a1 1 0 0 0 .2-1.3l-1.6-2.7a1 1 0 0 0-1.2-.4l-1.9.7a7.6 7.6 0 0 0-1.7-1l-.3-2a1 1 0 0 0-1-.9h-3.2a1 1 0 0 0-1 .9l-.3 2a7.6 7.6 0 0 0-1.7 1l-1.9-.7a1 1 0 0 0-1.2.4L2.5 9.3a1 1 0 0 0 .2 1.3L4.3 12l-.1 1 -1.6 1.4a1 1 0 0 0-.2 1.3l1.6 2.7a1 1 0 0 0 1.2.4l1.9-.7a7.6 7.6 0 0 0 1.7 1l.3 2a1 1 0 0 0 1 .9h3.2a1 1 0 0 0 1-.9l.3-2a7.6 7.6 0 0 0 1.7-1l1.9.7a1 1 0 0 0 1.2-.4l1.6-2.7a1 1 0 0 0-.2-1.3L19.4 13Zm-7.4 3a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"
    />
  </Icon>
);

export const CarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2Zm2.1 0h9.8l-1.2-3.6a.5.5 0 0 0-.5-.4H8.8a.5.5 0 0 0-.5.4L7.1 11Z"
    />
  </Icon>
);
