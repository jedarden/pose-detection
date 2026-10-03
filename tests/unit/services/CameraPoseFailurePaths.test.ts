/**
 * Failure-path coverage for browser camera access and pose model lifecycle.
 * Covers denied webcam permission, missing cameras, model-load failures,
 * detection errors, and resource cleanup.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCamera } from '../../../src/hooks/useCamera';
import { CameraService } from '../../../src/services/CameraService';
import { PoseDetectionService } from '../../../src/services/PoseDetectionService';
import type { PoseDetectionConfig } from '../../../src/types/pose';

const { mockCreateDetector, mockEstimatePoses, mockDetectorDispose, mockSetBackend, mockReady } = vi.hoisted(() => {
  const mockEstimatePoses = vi.fn();
  const mockDetectorDispose = vi.fn();
  return {
    mockEstimatePoses,
    mockDetectorDispose,
    mockCreateDetector: vi.fn(async () => ({
      estimatePoses: mockEstimatePoses,
      dispose: mockDetectorDispose,
    })),
    mockSetBackend: vi.fn(async () => true),
    mockReady: vi.fn(async () => undefined),
  };
});

vi.mock('@tensorflow/tfjs', () => ({
  ready: mockReady,
  setBackend: mockSetBackend,
  getBackend: () => 'cpu',
  ENV: { set: vi.fn() },
}));

vi.mock('@tensorflow-models/pose-detection', () => ({
  SupportedModels: { MoveNet: 'MoveNet' },
  movenet: {
    modelType: {
      SINGLEPOSE_LIGHTNING: 'lightning',
      SINGLEPOSE_THUNDER: 'thunder',
    },
  },
  createDetector: mockCreateDetector,
}));

const makeError = (name: string, message: string): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

const makeStream = () => {
  const track = { stop: vi.fn() };
  return {
    track,
    stream: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream,
  };
};

const poseConfig: PoseDetectionConfig = {
  modelType: 'lightning',
  inputResolution: { width: 256, height: 256 },
  enableGPU: false,
  maxPoses: 1,
  smoothing: {} as PoseDetectionConfig['smoothing'],
  validation: { minPoseConfidence: 0.3 } as PoseDetectionConfig['validation'],
  performance: {
    targetFPS: 30,
    enableFrameSkipping: false,
    frameSkipInterval: 1,
  },
};

describe('CameraService failure paths', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let service: CameraService;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(async () => {
    getUserMedia = vi.fn();
    // The shared test setup defines navigator.mediaDevices as non-configurable,
    // so swap the property value directly (it is writable) and restore it later.
    (navigator as { mediaDevices: unknown }).mediaDevices = { getUserMedia };
    service = new CameraService({
      defaultConstraints: { video: { width: { ideal: 640 } } },
    });
    // start() relies on the canvas created by initialize().
    await service.initialize();
  });

  afterEach(async () => {
    await service.stop();
    (navigator as { mediaDevices: unknown }).mediaDevices = originalMediaDevices;
    vi.restoreAllMocks();
  });

  it('emits error and rejects when webcam permission is denied', async () => {
    getUserMedia.mockRejectedValueOnce(makeError('NotAllowedError', 'Permission denied by user'));
    const onError = vi.fn();
    service.on('error', onError);

    await expect(service.start()).rejects.toThrow('Permission denied by user');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toEqual({ isCapturing: false, hasStream: false, hasVideo: false });
  });

  it('emits error and rejects when no camera device exists', async () => {
    getUserMedia.mockRejectedValueOnce(makeError('NotFoundError', 'Requested device not found'));
    const onError = vi.fn();
    service.on('error', onError);

    await expect(service.start()).rejects.toThrow('Requested device not found');

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'NotFoundError' }));
    expect(service.getStatus().isCapturing).toBe(false);
  });

  it('does not start frame capture after a failed start, so a retry can succeed', async () => {
    getUserMedia.mockRejectedValueOnce(makeError('NotReadableError', 'Camera in use'));
    await expect(service.start()).rejects.toThrow('Camera in use');

    const { stream } = makeStream();
    getUserMedia.mockResolvedValueOnce(stream);
    const onStarted = vi.fn();
    service.on('started', onStarted);

    await service.start();

    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(service.getStatus().isCapturing).toBe(true);
    await service.stop();
  });

  it('stops every media track and clears the video element on stop()', async () => {
    const { stream, track } = makeStream();
    getUserMedia.mockResolvedValueOnce(stream);
    await service.start();
    expect(service.getStatus().hasStream).toBe(true);

    await service.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toEqual({ isCapturing: false, hasStream: false, hasVideo: false });
  });

  // Known defect: start() without a prior initialize() has no canvas, so
  // initializeCamera() throws after getUserMedia() has already granted a stream,
  // and that stream is never stopped (camera stays on). Remove `.fails` once fixed.
  it.fails('releases an acquired stream when start() fails after getUserMedia succeeds', async () => {
    const uninitialized = new CameraService({
      defaultConstraints: { video: true },
    });
    const { stream, track } = makeStream();
    getUserMedia.mockResolvedValueOnce(stream);

    await expect(uninitialized.start()).rejects.toThrow();
    expect(track.stop).toHaveBeenCalled();
    await uninitialized.stop();
  });

  it('stop() is safe to call when the camera was never started', async () => {
    const stopped = vi.fn();
    service.on('stopped', stopped);

    await expect(service.stop()).resolves.toBeUndefined();
    expect(stopped).toHaveBeenCalledTimes(1);
  });
});

describe('PoseDetectionService failure paths', () => {
  let service: PoseDetectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateDetector.mockImplementation(async () => ({
      estimatePoses: mockEstimatePoses,
      dispose: mockDetectorDispose,
    }));
    service = new PoseDetectionService();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    service.dispose();
    vi.restoreAllMocks();
  });

  it('rejects initialization when no configuration is supplied', async () => {
    await expect(service.initialize()).rejects.toThrow(
      'Failed to initialize pose detection: Pose detection configuration is required'
    );
    expect(service.isReady()).toBe(false);
    expect(mockCreateDetector).not.toHaveBeenCalled();
  });

  it('wraps model-load failures and leaves the service not ready', async () => {
    mockCreateDetector.mockRejectedValueOnce(new Error('Failed to fetch MoveNet weights'));

    await expect(service.initialize(poseConfig)).rejects.toThrow(
      'Failed to initialize pose detection: Failed to fetch MoveNet weights'
    );
    expect(service.isReady()).toBe(false);
  });

  it('wraps TensorFlow runtime failures during backend setup', async () => {
    mockReady.mockRejectedValueOnce(new Error('TensorFlow runtime unavailable'));

    await expect(service.initialize(poseConfig)).rejects.toThrow(
      'Failed to initialize pose detection: TensorFlow runtime unavailable'
    );
    expect(service.isReady()).toBe(false);
  });

  it('rejects detectPoses before a model has been loaded', async () => {
    const frame = {} as ImageData;

    await expect(service.detectPoses(frame)).rejects.toThrow(
      'PoseDetectionService not initialized'
    );
  });

  it('rejects detectPoses with a missing input frame', async () => {
    await service.initialize(poseConfig);

    await expect(service.detectPoses(null as unknown as ImageData)).rejects.toThrow(
      'Invalid input: imageData is null or undefined'
    );
  });

  it('returns the last valid poses instead of throwing when estimation fails', async () => {
    await service.initialize(poseConfig);
    mockEstimatePoses.mockRejectedValueOnce(new Error('GPU context lost'));

    const frame = {} as ImageData;
    const poses = await service.detectPoses(frame);

    expect(poses).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('Pose detection failed:', expect.any(Error));
    expect(service.isReady()).toBe(true);
  });

  it('releases the detector and resets readiness on dispose()', async () => {
    await service.initialize(poseConfig);
    expect(service.isReady()).toBe(true);

    service.dispose();

    expect(mockDetectorDispose).toHaveBeenCalledTimes(1);
    expect(service.isReady()).toBe(false);
    await expect(service.detectPoses({} as ImageData)).rejects.toThrow(
      'PoseDetectionService not initialized'
    );
  });

  it('dispose() is idempotent and safe before initialization', () => {
    expect(() => {
      service.dispose();
      service.dispose();
    }).not.toThrow();
    expect(mockDetectorDispose).not.toHaveBeenCalled();
  });
});

describe('useCamera unmount cleanup', () => {
  // Known defect: useCamera was written against a CameraService API (getState,
  // dispose, initialize(video, constraints)) that src/services/CameraService.ts
  // does not provide. The hook throws while mounting ("getState is not a
  // function") and again on unmount ("dispose is not a function"), so the
  // camera is never released by the hook. Remove `.fails` once the API is reconciled.
  it.fails('mounts and unmounts without throwing, releasing the camera', () => {
    const { unmount } = renderHook(() => useCamera());
    expect(() => unmount()).not.toThrow();
  });
});
