// Remotion port of web/src/components/CarArt.tsx: the girlfriend's car,
// body tinted through a CSS mask (car-teal-body-mask.png) with the
// un-tinted details (windows, wheels, lights) stacked on top. Adds what the
// reel needs on top of it: brake lights, a Discord "speaking" outline and a
// muted badge. The source art faces right (hood on the right).
import type { CSSProperties } from 'react';
import { Img } from 'remotion';
import carBodyMask from '../../../web/src/assets/car-teal-body-mask.png';
import carDetails from '../../../web/src/assets/car-teal-details.png';
import { BRAND } from '../cast';
import { MicGlyph } from './icons';

/** Source crop size (car-teal-body-mask.png / car-teal-details.png). */
export const CAR_W = 420;
export const CAR_H = 290;
/** Discord's speaking green. */
export const SPEAKING_GREEN = '#3ba55d';

export interface CarArtProps {
  /** Body fill, e.g. `CAST.prius.hex`. */
  color: string;
  /** Width in px; height follows the 420:290 source. Default 420. */
  width?: number;
  /** 0..1: rear brake light glow (0 = off). */
  brakeGlow?: number;
  /** Face left instead of right. Badges are not mirrored. */
  flip?: boolean;
  /** 0..1: Discord-green outline glow while talking (0 = off). */
  speaking?: number;
  /** 0..1: pop-in progress of the brake-red mic-slash badge (0 = hidden). */
  muted?: number;
  /** 0..1: desaturate the whole car (freeze frames). */
  grayscale?: number;
  style?: CSSProperties;
}

/** Height for a car drawn `width` px wide. */
export const carHeight = (width: number): number => (width * CAR_H) / CAR_W;

export function CarArt({ color, width = CAR_W, brakeGlow = 0, flip, speaking = 0, muted = 0, grayscale = 0, style }: CarArtProps) {
  const height = carHeight(width);
  const k = width / CAR_W;
  const mask = `url(${carBodyMask})`;
  // Stacked zero-blur drop-shadows trace the car's silhouette (an outline that
  // follows the art, like Discord's ring around an avatar), plus a soft glow.
  const o = Math.max(2, 7 * k) * speaking;
  const g = SPEAKING_GREEN;
  const outline =
    speaking > 0
      ? `drop-shadow(${o}px 0 0 ${g}) drop-shadow(-${o}px 0 0 ${g}) drop-shadow(0 ${o}px 0 ${g}) drop-shadow(0 -${o}px 0 ${g}) drop-shadow(0 0 ${22 * k * speaking}px ${g})`
      : '';
  const filter = [outline, grayscale > 0 ? `grayscale(${grayscale})` : ''].filter(Boolean).join(' ') || undefined;

  // The rear light sits at x 12-58, y 205-242 of the 420x290 source.
  const rear = { left: 10 * k, top: 203 * k, w: 50 * k, h: 40 * k };
  const badge = Math.max(26, 96 * k);

  return (
    <div style={{ position: 'relative', width, height, ...style }}>
      <div style={{ position: 'absolute', inset: 0, transform: flip ? 'scaleX(-1)' : undefined, filter }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: color,
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
        <Img src={carDetails} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {/* Remotion waits for <Img> but not for CSS masks: loading the mask once as an
            invisible image makes sure the body is never blank on the first frames. */}
        <Img src={carBodyMask} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
        {brakeGlow > 0 && (
          <>
            <div
              style={{
                position: 'absolute',
                left: rear.left - rear.w * 0.9,
                top: rear.top - rear.h * 0.9,
                width: rear.w * 2.8,
                height: rear.h * 2.8,
                borderRadius: '50%',
                background: `radial-gradient(closest-side, rgba(255,60,40,${0.75 * brakeGlow}), rgba(255,60,40,0))`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: rear.left,
                top: rear.top,
                width: rear.w,
                height: rear.h,
                borderRadius: '50%',
                background: BRAND.brakeRed,
                opacity: brakeGlow,
                boxShadow: `0 0 ${14 * k}px ${4 * k}px rgba(255,70,50,${0.8 * brakeGlow})`,
              }}
            />
          </>
        )}
      </div>
      {muted > 0 && (
        <div
          style={{
            position: 'absolute',
            right: flip ? undefined : width * 0.1,
            left: flip ? width * 0.1 : undefined,
            top: -badge * 0.35,
            width: badge,
            height: badge,
            borderRadius: '50%',
            background: BRAND.brakeRed,
            border: `${Math.max(3, badge * 0.07)}px solid ${BRAND.cream}`,
            display: 'grid',
            placeItems: 'center',
            transform: `scale(${muted})`,
            boxShadow: '0 4px 10px rgba(42,31,31,0.3)',
          }}
        >
          <MicGlyph size={badge * 0.58} color={BRAND.cream} slashed />
        </div>
      )}
    </div>
  );
}
