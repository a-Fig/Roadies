// A tintable render of the girlfriend's car illustration
// (scratchpad/gf-roadies/src/assets/car-teal.png), built from two derived
// PNGs rather than a hand-traced SVG:
//
//   1. `car-teal-body-mask.png` — a mask whose alpha channel is "how close
//      is this pixel to her exact body color", anti-aliased edges
//      preserved. Used as a CSS `mask-image` over a solid-color box, so any
//      `CAR_COLORS` hex tints the body while keeping her exact silhouette
//      (rounded body, wheels correctly nested in the wheel arches, etc).
//   2. `car-teal-details.png` — everything that ISN'T body (windows,
//      wheels, hubs, lights) at her fixed colors, transparent elsewhere.
//      Stacked on top of the tinted body box.
//
// Both were produced from her PNG by scratchpad/build_car_layers.py
// (crop to content + margin, downscale to ~2x display size, auto-detect the
// body color and split by color-distance) — no hand-tracing. We moved to
// this approach from a hand-traced SVG redraw after design review found the
// traced version read as "boxy", with wheels sitting below the wheel arches
// instead of inside them; masking her own pixels sidesteps that fidelity
// problem entirely, at the cost of not being a true vector.
//
// The teal shape is the default (only shape CarArt renders); a red pair
// (`car-red-*`, plus a full-color `car-red.png`) was split the same way and
// is used as-is, un-tinted, for the intro's fixed red mascot car.
//
// Swapping in a real vector later (once a Figma export arrives): drop it at
// `web/src/assets/car.svg` and change this file's implementation to render
// its paths, tinting the body path's `fill`. Keep the exported
// `CarArtProps` shape (`color`/`size`/`title`/`className`) the same and no
// caller needs to change.

import carBodyMask from '../assets/car-teal-body-mask.png';
import carDetails from '../assets/car-teal-details.png';

/** The exported crop's pixel size (car-teal-body-mask.png / car-teal-details.png). */
const ASPECT_W = 420;
const ASPECT_H = 290;

export interface CarArtProps {
  /** Body fill, e.g. a `CAR_COLORS` hex from `@roadies/shared`. */
  color: string;
  /** Width in px; height follows the source crop's aspect ratio. Default 96. */
  size?: number;
  /** Accessible name. Omit to render as a decorative (aria-hidden) graphic. */
  title?: string;
  className?: string;
}

export function CarArt({ color, size = 96, title, className }: CarArtProps) {
  const height = Math.round((size * ASPECT_H) / ASPECT_W);
  const maskImage = `url(${carBodyMask})`;
  return (
    <span
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ position: 'relative', display: 'inline-block', width: size, height }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: color,
          WebkitMaskImage: maskImage,
          maskImage,
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
      <img
        src={carDetails}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </span>
  );
}
