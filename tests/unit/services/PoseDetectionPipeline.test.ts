import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_POSE_CONFIG,
  KeypointName,
  type PoseDetectionConfig
} from '../../../src/types/pose';
import { PoseDetectionService } from '../../../src/services/PoseDetectionService';

const makeConfig = (overrides: Partial<PoseDetectionConfig> = {}): PoseDetectionConfig => ({
  ...DEFAULT_POSE_CONFIG,
  ...overrides,
  performance: {
    ...DEFAULT_POSE_CONFIG.performance,
    enableFrameSkipping: false,
    ...overrides.performance
  }
});

const makeRawPose = (score = 0.9) => ({
  score,
  keypoints: [
    { name: 'nose', x: 10, y: 20, score: 0.95 },
    { name: 'left_shoulder', x: 50, y: 80, score: 0.9 },
    { name: 'right_shoulder', x: 110, y: 80, score: 0.9 },
    { name: 'left_hip', x: 55, y: 180, score: 0.9 },
    { name: 'right_hip', x: 105, y: 180, score: 0.9 },
    { name: 'left_eye', x: 20, y: 30, score: 0.2 }
  ]
});

type Detector = {
  estimatePoses: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const installRuntime = (config = makeConfig()): { service: PoseDetectionService; detector: Detector } => {
  const service = new PoseDetectionService(config);
  const detector: Detector = {
    estimatePoses: vi.fn(),
    dispose: vi.fn()
  };

  // The detector is the only browser/model boundary in these tests. Installing
  // it directly keeps the cases focused on result handling and frame policy.
  Object.assign(service as unknown as Record<string, unknown>, {
    detector,
    config,
    isInitialized: true
  });

  return { service, detector };
};

describe('PoseDetectionService result handling', () => {
  it('converts confident model output, filters weak keypoints, and calculates a padded box', async () => {
    const { service, detector } = installRuntime();
    detector.estimatePoses.mockResolvedValue([makeRawPose(), makeRawPose(0.2)]);

    const [result] = await service.detectPoses({} as ImageData);

    expect(result).toMatchObject({
      confidence: 0.9,
      boundingBox: { x: 0, y: 4, width: 120, height: 192 }
    });
    expect(result.keypoints.map((keypoint) => keypoint.name)).toEqual([
      KeypointName.NOSE,
      KeypointName.LEFT_SHOULDER,
      KeypointName.RIGHT_SHOULDER,
      KeypointName.LEFT_HIP,
      KeypointName.RIGHT_HIP
    ]);
    expect(result.keypoints.every((keypoint) => keypoint.timestamp === result.timestamp)).toBe(true);
    expect(service.getStats()).toMatchObject({ totalPoses: 1, averageConfidence: 0.9 });
  });

  it('rejects missing frame data before invoking the detector', async () => {
    const { service, detector } = installRuntime();

    await expect(service.detectPoses(null as unknown as ImageData)).rejects.toThrow(
      'Invalid input: imageData is null or undefined'
    );
    expect(detector.estimatePoses).not.toHaveBeenCalled();
  });

  it('returns the last valid result when inference fails', async () => {
    const { service, detector } = installRuntime();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    detector.estimatePoses
      .mockResolvedValueOnce([makeRawPose()])
      .mockRejectedValueOnce(new Error('inference failed'));

    const first = await service.detectPoses({} as ImageData);
    const second = await service.detectPoses({} as ImageData);

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].timestamp).toBeGreaterThanOrEqual(first[0].timestamp);
    expect(consoleError).toHaveBeenCalledWith('Pose detection failed:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('counts adaptive skipped frames and processes the next scheduled frame', async () => {
    const { service, detector } = installRuntime(makeConfig({
      performance: {
        ...DEFAULT_POSE_CONFIG.performance,
        enableFrameSkipping: true,
        frameSkipInterval: 2
      }
    }));
    detector.estimatePoses.mockResolvedValue([makeRawPose()]);
    vi.spyOn(service as any, 'shouldSkipFrameAdaptive')
      .mockReturnValueOnce(true)
      .mockReturnValue(false);

    const skipped = await service.detectPoses({} as ImageData);
    const processed = await service.detectPoses({} as ImageData);

    expect(skipped).toEqual([]);
    expect(processed).toHaveLength(1);
    expect(detector.estimatePoses).toHaveBeenCalled();
    expect(service.getStats().droppedFrames).toBeGreaterThanOrEqual(1);
    expect(service.getStats().totalPoses).toBe(1);
    expect(service.getPoseHistory()).toHaveLength(1);
  });
});
