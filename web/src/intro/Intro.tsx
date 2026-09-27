// React port of the girlfriend's intro
// (scratchpad/gf-roadies/src/intro/intro.js): two cars draw the "R", chat,
// then settle into the wordmark. Frame data/timing/easing are unchanged
// (frames.ts/shapes.ts) - this file only swaps her imperative
// `playIntro(stage)` for a component that builds the same GSAP timeline
// against refs, and resolves via an `onDone` prop instead of a Promise.
//
// GSAP (+ MorphSVGPlugin) is dynamically imported so it never ships in the
// initial bundle - the intro is the very first thing a phone renders, and
// nothing else on that first paint needs animation. `prefers-reduced-motion`
// skips the whole thing (straight to `onDone`), and tapping anywhere jumps
// the timeline to its end (the existing pointerdown-skip behavior, ported
// as-is).
import { useEffect, useRef } from 'react';

import redCarUrl from '../assets/car-red-intro.png?inline';
import tealCarUrl from '../assets/car-teal-intro.png?inline';
import { BUBBLES, FRAMES, ZOOM, ZOOM_FOCUS, frameById } from './frames';
import type { CarState } from './frames';
import './intro.css';
import { BUBBLE_TAIL, BUBBLE_TEXT, WORDMARK } from './shapes';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface IntroProps {
  /** Called once, either when the timeline completes or reduced motion skips it. */
  onDone: () => void;
}

export function Intro({ onDone }: IntroProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const wordmarkRef = useRef<SVGGElement>(null);
  const roRef = useRef<SVGPathElement>(null);
  const adiesRef = useRef<SVGPathElement>(null);
  const masksRef = useRef<SVGGElement>(null);
  const mask6Ref = useRef<SVGPathElement>(null);
  const mask5Ref = useRef<SVGPathElement>(null);
  const carsRef = useRef<SVGGElement>(null);
  const redRef = useRef<SVGImageElement>(null);
  const tealRef = useRef<SVGImageElement>(null);
  const bubblesRef = useRef<SVGGElement>(null);

  // Always call the latest onDone without re-running the whole effect if the
  // caller passes a fresh function identity each render.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onDoneRef.current();
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const [{ gsap }, { MorphSVGPlugin }] = await Promise.all([
        import('gsap'),
        import('gsap/MorphSVGPlugin'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(MorphSVGPlugin);

      const el = {
        world: worldRef.current!,
        wordmark: wordmarkRef.current!,
        ro: roRef.current!,
        adies: adiesRef.current!,
        masks: masksRef.current!,
        mask6: mask6Ref.current!,
        mask5: mask5Ref.current!,
        cars: carsRef.current!,
        red: redRef.current!,
        teal: tealRef.current!,
        bubbles: bubblesRef.current!,
      };

      el.wordmark.setAttribute('transform', `translate(${WORDMARK.x} ${WORDMARK.y})`);
      el.ro.setAttribute('d', WORDMARK.ro);
      el.adies.setAttribute('d', WORDMARK.adies);
      el.red.setAttribute('href', redCarUrl);
      el.teal.setAttribute('href', tealCarUrl);

      const svg = <K extends keyof SVGElementTagNameMap>(
        tag: K,
        attrs: Record<string, string | number>,
        parent: SVGElement,
      ): SVGElementTagNameMap[K] => {
        const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
        parent.appendChild(node);
        return node;
      };

      const buildBubble = ({ text, ellipse: e, tail: t, origin }: (typeof BUBBLES)['left']) => {
        const g = svg('g', { class: 'bubble' }, el.bubbles);
        svg('ellipse', { rx: e.rx, ry: e.ry, transform: `translate(${e.cx} ${e.cy}) rotate(${e.rot})` }, g);
        svg(
          'path',
          {
            d: BUBBLE_TAIL.d,
            transform: `translate(${t.cx} ${t.cy}) rotate(${t.rot}) translate(${-BUBBLE_TAIL.w / 2} ${-BUBBLE_TAIL.h / 2})`,
          },
          g,
        );
        const label = BUBBLE_TEXT[text]!;
        svg('path', { class: 'bubble-text', d: label.d, transform: `translate(${label.x} ${label.y})` }, g);
        gsap.set(g, { svgOrigin: origin, scale: 0, opacity: 0 });
        return g;
      };

      const bubbleLeft = buildBubble(BUBBLES.left); // "Wassup" (red car)
      const bubbleRight = buildBubble(BUBBLES.right); // "Ni Howdy!" (teal car)

      // Everything the timeline animates. render() pushes it into the SVG.
      const carVars = ({ cx, cy, w, h, rot }: CarState) => ({ cx, cy, w, h, rot });
      const first = FRAMES[0]!;
      const state = {
        cam: first.cam,
        wordmark: first.wordmark,
        adies: first.adies,
        masks: first.masks,
        cars: first.cars,
        red: carVars(first.red),
        teal: carVars(first.teal),
      };
      el.mask6.setAttribute('d', first.m6);
      el.mask5.setAttribute('d', first.m5);

      const placeCar = (node: SVGImageElement, c: CarState) => {
        node.setAttribute('x', String(-c.w / 2));
        node.setAttribute('y', String(-c.h / 2));
        node.setAttribute('width', String(c.w));
        node.setAttribute('height', String(c.h));
        node.setAttribute('transform', `translate(${c.cx} ${c.cy}) rotate(${c.rot})`);
      };

      const render = () => {
        // Zoom in log space so the push-in feels constant-speed, pinned on ZOOM_FOCUS.
        const s = ZOOM.scale ** state.cam;
        el.world.setAttribute(
          'transform',
          `matrix(${s} 0 0 ${s} ${ZOOM_FOCUS.x * (1 - s)} ${ZOOM_FOCUS.y * (1 - s)})`,
        );
        el.wordmark.style.opacity = String(state.wordmark);
        el.adies.style.opacity = String(state.adies);
        el.masks.style.opacity = String(state.masks);
        el.cars.style.opacity = String(state.cars);
        placeCar(el.red, state.red);
        placeCar(el.teal, state.teal);
      };

      // One Figma "smart animate" step: every layer tweens to frame `id`'s state.
      // Pass { camera: false } when the zoom is driven by its own tween.
      const morph = (
        id: number,
        duration: number,
        ease = 'none',
        { camera = true }: { camera?: boolean } = {},
      ) => {
        const f = frameById(id);
        const layers: Record<string, number> = { wordmark: f.wordmark, masks: f.masks, cars: f.cars };
        if (camera) layers.cam = f.cam;
        return gsap
          .timeline({ defaults: { duration, ease } })
          .to(state.red, carVars(f.red), 0)
          .to(state.teal, carVars(f.teal), 0)
          .to(state, layers, 0)
          .to(el.mask6, { morphSVG: f.m6 }, 0)
          .to(el.mask5, { morphSVG: f.m5 }, 0);
      };

      const tl = gsap.timeline({ paused: true, onUpdate: render });

      // Solve ease(t) = p, to find when an eased run passes a given frame.
      function invertEase(ease: string, p: number): number {
        const fn = gsap.parseEase(ease);
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (fn(mid) < p) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2;
      }

      // Several frames as one continuous move: linear between keyframes (so the cars
      // don't stop at every frame), with a single ease over the whole run.
      // `steps` is [[frameId, seconds], ...]. Returns when each frame is reached.
      const drive = (
        steps: Array<[number, number]>,
        ease: string,
        morphOptions?: { camera?: boolean },
      ): Record<number, number> => {
        const chain = gsap.timeline({ paused: true });
        const offsets: Array<[number, number]> = [];
        for (const [id, duration] of steps) {
          chain.add(morph(id, duration, 'none', morphOptions));
          offsets.push([id, chain.duration()]);
        }
        const start = tl.duration();
        const total = chain.duration();
        tl.add(chain.tweenFromTo(0, total, { ease, immediateRender: false }), start);
        const result: Record<number, number> = {};
        for (const [id, offset] of offsets) {
          result[id] = start + total * invertEase(ease, offset / total);
        }
        return result;
      };

      tl.to({}, { duration: 0.1 });

      // 2 -> 10 as one move: the cars draw the "R" (masks morph away) and the camera
      // pushes in on "Ro" as "adies" leaves the shot. The cars barely move between
      // frames 9 and 10, so the push starts at frame 8 to keep the motion going.
      const drawn = drive(
        [...[3, 4, 5, 6, 7, 8, 9].map((id): [number, number] => [id, 0.12]), [10, 0.4]],
        'sine.inOut',
        { camera: false },
      );
      tl.to(state, { cam: 1, duration: drawn[10]! - drawn[8]!, ease: 'power2.inOut' }, drawn[8]!);
      tl.to(state, { adies: 0, duration: (drawn[10]! - drawn[9]!) * 0.7, ease: 'power1.in' }, drawn[9]!);

      // 10 -> 12: the conversation.
      tl.to(bubbleLeft, { scale: 1, opacity: 1, duration: 0.22, ease: 'back.out(2)' }, drawn[10]!);
      tl.to(bubbleRight, { scale: 1, opacity: 1, duration: 0.22, ease: 'back.out(2)' }, '+=0.05');
      tl.to({}, { duration: 0.45 });
      tl.to([bubbleRight, bubbleLeft], { scale: 0.6, opacity: 0, duration: 0.15, ease: 'power1.in', stagger: 0.03 });

      // 12 -> 16 as one move: the camera pulls back while the cars keep rolling into
      // place. Then the masks drop to reveal the full "R" and the cars fade out.
      const pullBackStart = tl.duration();
      const settled = drive(
        [
          [13, 0.4],
          [14, 0.15],
          [15, 0.2],
          [16, 0.2],
        ],
        'sine.inOut',
        { camera: false },
      );
      const pullBack = settled[13]! - pullBackStart; // camera lands exactly on frame 13
      tl.to(state, { cam: 0, duration: pullBack, ease: 'power2.inOut' }, pullBackStart);
      tl.to(state, { adies: 1, duration: pullBack * 0.75, ease: 'power1.out' }, pullBackStart + pullBack * 0.25);

      render();

      const skip = () => tl.progress(1);
      stage.addEventListener('pointerdown', skip);
      tl.eventCallback('onComplete', () => {
        stage.removeEventListener('pointerdown', skip);
        onDoneRef.current();
      });
      tl.play();

      cleanup = () => {
        stage.removeEventListener('pointerdown', skip);
        tl.kill();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // Deliberately empty: the timeline is built once per mount from refs and
    // module-level frame data, none of which changes across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={stageRef} className="intro brand-kit">
      <div className="intro-stage">
        <svg
          viewBox="0 0 440 956"
          role="img"
          aria-label="Two cars draw the Roadies logo, say hi to each other, then drive off"
        >
          {/* Layer order matches the Figma frames: text, Rectangle 6, Rectangle 5, "3 1", "2 1". */}
          <g ref={worldRef} id="world">
            <g ref={wordmarkRef} id="wordmark">
              <path ref={roRef} id="ro" />
              <path ref={adiesRef} id="adies" />
            </g>
            <g ref={masksRef} id="masks">
              <path ref={mask6Ref} id="mask6" />
              <path ref={mask5Ref} id="mask5" />
            </g>
            <g ref={carsRef} id="cars">
              <image ref={redRef} id="car-red" preserveAspectRatio="xMidYMid slice" />
              <image ref={tealRef} id="car-teal" preserveAspectRatio="xMidYMid slice" />
            </g>
          </g>
          <g ref={bubblesRef} id="bubbles" />
        </svg>
      </div>
    </div>
  );
}
