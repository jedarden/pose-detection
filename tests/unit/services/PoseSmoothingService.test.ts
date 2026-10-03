import { describe, expect, it } from 'vitest';
import { PoseSmoothingService } from '../../../src/services/PoseSmoothingService';
import { KeypointName, type EnhancedKeypoint, type PoseDetectionResult, type PoseSmoothingConfig } from '../../../src/types/pose';

const config: PoseSmoothingConfig = {
  smoothingFactor: 0.7,
  minConfidence: 0.3,
  maxDistance: 50,
  enableVelocitySmoothing: true,
  historySize: 8
};

const makePose = (x: number, timestamp: number, score = 0.9): PoseDetectionResult => {
  const keypoint: EnhancedKeypoint = {
    name: KeypointName.NOSE,
    x,
    y: 10,
    score,
    timestamp
  };

  return {
    keypoints: [keypoint],
    confidence: score,
    timestamp,
    id: 'pose-1',
    boundingBox: { x, y: 10, width: 0, height: 0 }
  };
};

describe('PoseSmoothingService', () => {
  it('smooths successive results while preserving pose metadata and recalculating bounds', () => {
    const service = new PoseSmoothingService(config);

    service.smooth([makePose(0, 0)]);
    const [smoothed] = service.smooth([makePose(10, 100)]);

    expect(smoothed.id).toBe('pose-1');
    expect(smoothed.keypoints[0].x).toBeCloseTo(3, 6);
    expect(smoothed.boundingBox).toMatchObject({ y: 10, width: 0, height: 0 });
    expect(smoothed.boundingBox.x).toBeCloseTo(3, 6);
    expect(service.getHistorySize()).toBe(2);
  });

  it('rejects an implausible jump by retaining the last smoothed position', () => {
    const service = new PoseSmoothingService(config);

    service.smooth([makePose(10, 0)]);
    const [smoothed] = service.smooth([makePose(100, 100)]);

    expect(smoothed.keypoints[0].x).toBe(10);
    expect(service.getKeypointHistory(KeypointName.NOSE)).toHaveLength(2);
  });

  it('tracks velocity and ignores keypoints below the confidence threshold', () => {
    const service = new PoseSmoothingService({ ...config, smoothingFactor: 0, maxDistance: 500 });

    service.smooth([makePose(0, 0)]);
    service.smooth([makePose(10, 100)]);

    expect(service.getKeypointVelocity(KeypointName.NOSE)?.x).toBeCloseTo(0.03, 6);
    const lowConfidence = service.smooth([makePose(20, 200, 0.2)]);
    expect(lowConfidence[0].keypoints).toEqual([]);
  });

  it('handles empty input and reset without leaking temporal state', () => {
    const service = new PoseSmoothingService(config);

    expect(service.smooth([])).toEqual([]);
    service.smooth([makePose(5, 0)]);
    service.reset();

    expect(service.getHistorySize()).toBe(0);
    expect(service.getKeypointHistory(KeypointName.NOSE)).toEqual([]);
    expect(service.smooth([makePose(100, 100)])[0].keypoints[0].x).toBe(100);
  });
});
