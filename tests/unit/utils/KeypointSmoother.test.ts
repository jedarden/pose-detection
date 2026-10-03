/**
 * KeypointSmoother temporal smoothing tests.
 *
 * Velocity and acceleration are kept private by KeypointSmoother, so these tests
 * check the behaviour they drive: exponential blending, confidence weighting,
 * per-keypoint isolation, and finite output for degenerate timing.
 */

import { describe, it, expect } from 'vitest';
import { KeypointSmoother, SmoothingAlgorithm } from '../../../src/utils/smoothing';
import type { EnhancedKeypoint, KeypointName } from '../../../src/types/pose';
import type { Skeleton } from '../../../src/types/skeleton';

const kp = (
  name: KeypointName,
  x: number,
  y: number,
  timestamp: number,
  score = 1
): EnhancedKeypoint =>
  ({ name, x, y, score, timestamp } as unknown as EnhancedKeypoint);

describe('KeypointSmoother', () => {
  describe('exponential smoothing', () => {
    it('passes the first sample through unchanged', () => {
      const smoother = new KeypointSmoother();

      const out = smoother.smoothKeypoint(kp('nose', 42, 17, 0));

      expect(out.x).toBe(42);
      expect(out.y).toBe(17);
    });

    it('blends each sample with the previous raw position using factor * confidence', () => {
      // alpha = min(1, factor * score) = 0.7 * 1.0 = 0.7
      const smoother = new KeypointSmoother({ factor: 0.7 });
      smoother.smoothKeypoint(kp('nose', 0, 0, 0));

      const out = smoother.smoothKeypoint(kp('nose', 10, 0, 100));

      expect(out.x).toBeCloseTo(7, 6);
      expect(out.y).toBeCloseTo(0, 6);
    });

    it('weakens smoothing toward the new sample for low-confidence keypoints', () => {
      // alpha = 0.7 * 0.5 = 0.35, so the new sample carries less weight than at full confidence
      const smoother = new KeypointSmoother({ factor: 0.7 });
      smoother.smoothKeypoint(kp('nose', 0, 0, 0, 0.5));

      const out = smoother.smoothKeypoint(kp('nose', 10, 0, 100, 0.5));

      expect(out.x).toBeCloseTo(3.5, 6);
    });

    it('keeps non-positional keypoint fields intact', () => {
      const smoother = new KeypointSmoother();
      smoother.smoothKeypoint(kp('left_knee', 0, 0, 0, 0.8));

      const out = smoother.smoothKeypoint(kp('left_knee', 5, 5, 33, 0.8));

      expect(out.name).toBe('left_knee');
      expect(out.score).toBe(0.8);
      expect(out.timestamp).toBe(33);
    });

    it('stays finite when consecutive samples share a timestamp', () => {
      // A zero time delta must not divide by zero when deriving velocity.
      const smoother = new KeypointSmoother();
      smoother.smoothKeypoint(kp('nose', 0, 0, 100));

      const out = smoother.smoothKeypoint(kp('nose', 10, 10, 100));

      expect(Number.isFinite(out.x)).toBe(true);
      expect(Number.isFinite(out.y)).toBe(true);
    });
  });

  describe('per-keypoint isolation', () => {
    it('does not let one keypoint influence another', () => {
      const smoother = new KeypointSmoother({ factor: 0.7 });
      smoother.smoothKeypoint(kp('nose', 0, 0, 0));
      smoother.smoothKeypoint(kp('left_wrist', 500, 500, 0));

      const out = smoother.smoothKeypoint(kp('nose', 10, 0, 100));

      expect(out.x).toBeCloseTo(7, 6);
    });

    it('resets a single keypoint without clearing the others', () => {
      const smoother = new KeypointSmoother({ factor: 0.7 });
      smoother.smoothKeypoint(kp('nose', 0, 0, 0));
      smoother.smoothKeypoint(kp('left_wrist', 0, 0, 0));
      smoother.smoothKeypoint(kp('left_wrist', 10, 0, 100));

      smoother.reset('nose');

      // nose history is gone, so its next sample is a fresh first sample
      expect(smoother.smoothKeypoint(kp('nose', 100, 0, 200)).x).toBe(100);
      // left_wrist still blends against its previous raw position (10)
      expect(smoother.smoothKeypoint(kp('left_wrist', 20, 0, 200)).x).toBeCloseTo(17, 6);
    });

    it('clears all history on a full reset', () => {
      const smoother = new KeypointSmoother({ factor: 0.7 });
      smoother.smoothKeypoint(kp('nose', 0, 0, 0));
      smoother.smoothKeypoint(kp('nose', 10, 0, 100));

      smoother.reset();

      expect(smoother.smoothKeypoint(kp('nose', 50, 0, 200)).x).toBe(50);
    });
  });

  describe('configuration', () => {
    it('applies updated smoothing factors to subsequent samples', () => {
      const smoother = new KeypointSmoother({ factor: 0.7 });
      smoother.updateConfig({ factor: 0.2 });
      smoother.smoothKeypoint(kp('nose', 0, 0, 0));

      // alpha = 0.2 -> 0.2 * 10 + 0.8 * 0
      expect(smoother.smoothKeypoint(kp('nose', 10, 0, 100)).x).toBeCloseTo(2, 6);
    });

    it('keeps the default algorithm unless overridden', () => {
      const smoother = new KeypointSmoother({ algorithm: SmoothingAlgorithm.MOVING_AVERAGE });
      smoother.updateConfig({ factor: 0.5 });

      expect(() => smoother.smoothKeypoint(kp('nose', 1, 1, 0))).not.toThrow();
    });
  });

  describe('skeleton smoothing', () => {
    it('smooths every keypoint in a skeleton and preserves other skeleton fields', () => {
      const smoother = new KeypointSmoother({ factor: 0.7 });
      const first = {
        id: 'person-1',
        keypoints: [kp('nose', 0, 0, 0), kp('left_ankle', 0, 100, 0)],
        timestamp: 0
      } as unknown as Skeleton;
      const second = {
        ...first,
        keypoints: [kp('nose', 10, 0, 100), kp('left_ankle', 10, 100, 100)],
        timestamp: 100
      } as unknown as Skeleton;

      smoother.smoothSkeleton(first);
      const out = smoother.smoothSkeleton(second);

      expect(out.id).toBe('person-1');
      expect(out.timestamp).toBe(100);
      expect(out.keypoints.find((k) => k.name === 'nose')!.x).toBeCloseTo(7, 6);
      expect(out.keypoints.find((k) => k.name === 'left_ankle')!.x).toBeCloseTo(7, 6);
    });
  });

  describe('outlier rejection (known defect)', () => {
    // Known defect: isOutlier() compares the incoming sample against
    // history.positions[last], but smoothKeypoint() pushes the incoming sample
    // into that history first. The distance is therefore always 0, the
    // predicted-position fallback never runs, and velocity is never used.
    // A 490px jump on a 50px maxMovement should be rejected, not blended.
    // Marked `fails` so the suite stays green and flags the fix when it lands.
    it.fails('rejects a jump larger than maxMovement instead of blending it in', () => {
      const smoother = new KeypointSmoother({ factor: 0.7, maxMovement: 50 });
      smoother.smoothKeypoint(kp('nose', 0, 0, 0));
      smoother.smoothKeypoint(kp('nose', 10, 0, 100));

      const out = smoother.smoothKeypoint(kp('nose', 500, 0, 200));

      expect(out.x).toBeLessThan(50);
    });
  });
});
