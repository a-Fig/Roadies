import type { ComponentType } from 'react';
import { DashboardScene } from './DashboardScene';
import { EndCard } from './EndCard';
import { HighwayScene } from './HighwayScene';
import { LonelyRoadScene } from './LonelyRoadScene';
import { NerdDiagram } from './NerdDiagram';
import { VhsRewindDemo } from './previews';

/** Standalone previews of the animated scenes, registered under "Scenes" in the studio. */
export interface ScenePreview {
  id: string;
  // Remotion compositions take arbitrary serializable props.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  durationInFrames: number;
  defaultProps?: Record<string, unknown>;
}

export const SCENE_PREVIEWS: ScenePreview[] = [
  {
    id: 'HighwayFreeze',
    component: HighwayScene,
    durationInFrames: 120,
    defaultProps: { freezeAt: 45, camera: [{ at: 0, focus: 'all', zoom: 1 }] },
  },
  {
    id: 'HighwayChat',
    component: HighwayScene,
    durationInFrames: 330,
    defaultProps: {
      arrivals: [{ id: 'wrangler', at: 200 }],
      inCall: ['hero', 'prius', 'tacoma', 'miata', 'wrangler'],
      speaking: [
        { id: 'prius', from: 20, to: 70 },
        { id: 'miata', from: 90, to: 150 },
        { id: 'tacoma', from: 160, to: 190 },
      ],
      bubbles: [
        { id: 'prius', text: 'hey 👋', from: 20, to: 70 },
        { id: 'miata', text: 'anyone else starving? sushi?', from: 90, to: 150 },
        { id: 'tacoma', text: 'hey!', from: 160, to: 190 },
      ],
      muted: [{ id: 'prius', from: 230 }],
      leftCall: [{ id: 'tacoma', from: 260 }],
      camera: [
        { at: 0, focus: 'all', zoom: 1 },
        { at: 80, focus: 'all', zoom: 1 },
        { at: 110, focus: 'miata', zoom: 1.5 },
        { at: 150, focus: 'miata', zoom: 1.5 },
        { at: 180, focus: 'all', zoom: 1 },
      ],
    },
  },
  {
    id: 'Dashboard',
    component: DashboardScene,
    durationInFrames: 150,
    defaultProps: { sayBubble: { text: 'unmute', from: 20, to: 70 }, boomAt: 75, boomHold: 45 },
  },
  {
    id: 'LonelyRoad',
    component: LonelyRoadScene,
    durationInFrames: 170,
    defaultProps: { sayBubble: { text: 'hello...?', from: 30, to: 75 } },
  },
  {
    id: 'VhsRewind',
    component: VhsRewindDemo,
    durationInFrames: 150,
    defaultProps: { rewindFrom: 180 },
  },
  {
    id: 'EndCard',
    component: EndCard,
    durationInFrames: 120,
    defaultProps: { url: 'link in bio' },
  },
  {
    id: 'NerdDiagram',
    component: NerdDiagram,
    durationInFrames: 360,
  },
];
