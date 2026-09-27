// Wrappers that only exist so the studio can preview the effects on a real scene.
import { VhsRewind, type VhsRewindProps } from '../fx/VhsRewind';
import { HighwayScene } from './HighwayScene';

/** VhsRewind over the highway, rewinding it from frame 180. */
export function VhsRewindDemo(props: VhsRewindProps) {
  return (
    <VhsRewind {...props}>
      <HighwayScene
        arrivals={[{ id: 'hero', at: 10 }]}
        speaking={[{ id: 'prius', from: 120, to: 160 }]}
        bubbles={[{ id: 'prius', text: 'is it Tuesday again', from: 120, to: 160 }]}
      />
    </VhsRewind>
  );
}
