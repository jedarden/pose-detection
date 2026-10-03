import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POSE_CONFIG,
  KeypointName,
  PoseDetectionError,
  type EnhancedKeypoint,
  type PoseDetectionResult,
  type PoseValidationConfig
} from '../../../src/types/pose';
import { PoseValidationService } from '../../../src/services/PoseValidationService';

const names: KeypointName[] = [
  KeypointName.NOSE,
  KeypointName.LEFT_EYE,
  KeypointName.RIGHT_EYE,
  KeypointName.LEFT_EAR,
  KeypointName.RIGHT_EAR,
  KeypointName.LEFT_SHOULDER,
  KeypointName.RIGHT_SHOULDER,
  KeypointName.LEFT_ELBOW,
  KeypointName.RIGHT_ELBOW,
  KeypointName.LEFT_WRIST,
  KeypointName.RIGHT_WRIST,
  KeypointName.LEFT_HIP,
  KeypointName.RIGHT_HIP,
  KeypointName.LEFT_KNEE,
  KeypointName.RIGHT_KNEE,
  KeypointName.LEFT_ANKLE,
  KeypointName.RIGHT_ANKLE
];

const makeKeypoints = (): EnhancedKeypoint[] => names.map((name, index) => {
  const side = name.startsWith('right') ? 1 : -1;
  const y = name === KeypointName.NOSE ? 10 :
    name.includes('shoulder') ? 50 :
    name.includes('elbow') ? 80 :
    name.includes('wrist') ? 110 :
    name.includes('hip') ? 110 :
    name.includes('knee') ? 180 :
    name.includes('ankle') ? 250 : 30;
  const x = name === KeypointName.NOSE ? 50 : 50 + side * (name.includes('shoulder') ? 30 : 20);

  return {
    name,
    x: x + (index === 1 ? -4 : index === 2 ? 4 : 0),
    y,
    score: 0.9,
    timestamp: 1000
  };
});

const makePose = (
  keypoints = makeKeypoints(),
  confidence = 0.9
): PoseDetectionResult => ({
  keypoints,
  confidence,
  timestamp: 1000,
  id: 'pose-1',
  boundingBox: { x: 0, y: 0, width: 100, height: 250 }
});

const makeConfig = (overrides: Partial<PoseValidationConfig> = {}): PoseValidationConfig => ({
  ...DEFAULT_POSE_CONFIG.validation,
  enableAnatomicalValidation: true,
  ...overrides
});

describe('PoseValidationService', () => {
  it('accepts a confident, complete, anatomically ordered pose', () => {
    const service = new PoseValidationService(makeConfig());

    expect(service.validate(makePose())).toBe(true);
    expect(service.getValidationErrors(makePose())).toEqual([]);
  });

  it('reports low confidence and missing required keypoints', () => {
    const keypoints = makeKeypoints().filter((keypoint) => keypoint.name !== KeypointName.NOSE);
    keypoints[0] = { ...keypoints[0], score: 0.1 };
    const service = new PoseValidationService(makeConfig());

    const errors = service.getValidationErrors(makePose(keypoints, 0.2));

    expect(errors).toContain(PoseDetectionError.LOW_CONFIDENCE);
    expect(errors).toContain(PoseDetectionError.INSUFFICIENT_KEYPOINTS);
  });

  it('rejects non-finite keypoint coordinates and scores', () => {
    const keypoints = makeKeypoints();
    keypoints[0] = { ...keypoints[0], x: Number.NaN };
    keypoints[1] = { ...keypoints[1], score: 2 };
    const service = new PoseValidationService(makeConfig());

    expect(service.validate(makePose(keypoints))).toBe(false);
    expect(service.getValidationErrors(makePose(keypoints))).toContain(PoseDetectionError.INVALID_INPUT);
  });

  it('rejects implausibly separated shoulders and anatomically inverted poses', () => {
    const distant = makeKeypoints();
    distant[5] = { ...distant[5], x: 500 };
    const service = new PoseValidationService(makeConfig());

    expect(service.getValidationErrors(makePose(distant))).toContain(PoseDetectionError.INVALID_INPUT);

    const inverted = makeKeypoints();
    inverted[0] = { ...inverted[0], y: 100 };
    expect(service.getValidationErrors(makePose(inverted))).toContain(PoseDetectionError.INVALID_INPUT);
  });

  it('applies updated thresholds to subsequent results', () => {
    const service = new PoseValidationService(makeConfig({ minPoseConfidence: 0.8 }));

    expect(service.validate(makePose(makeKeypoints(), 0.75))).toBe(false);
    service.updateConfig({ ...makeConfig({ minPoseConfidence: 0.7 }) });
    expect(service.validate(makePose(makeKeypoints(), 0.75))).toBe(true);
  });
});
