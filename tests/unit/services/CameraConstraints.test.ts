/**
 * Regression coverage for the constraints CameraService passes to getUserMedia.
 * App supplies flat camera settings; getUserMedia(undefined) rejects, which left
 * the camera stuck at "Ready" in a production build.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CameraService } from '../../../src/services/CameraService';

describe('CameraService media constraints', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    // Reject so start() stops right after the constraint check.
    getUserMedia = vi.fn().mockRejectedValue(new Error('constraint check only'));
    // The shared test setup defines navigator.mediaDevices as non-configurable,
    // so swap the property value directly (it is writable) and restore it later.
    (navigator as { mediaDevices: unknown }).mediaDevices = { getUserMedia };
  });

  afterEach(() => {
    (navigator as { mediaDevices: unknown }).mediaDevices = originalMediaDevices;
    vi.restoreAllMocks();
  });

  it('requests video from the flat camera settings App passes', async () => {
    const service = new CameraService({
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    });
    await service.initialize();

    await expect(service.start()).rejects.toThrow('constraint check only');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    });
  });

  it('prefers explicit defaultConstraints when they are supplied', async () => {
    const defaultConstraints = { video: { width: { ideal: 1280 } }, audio: false };
    const service = new CameraService({ defaultConstraints });
    await service.initialize();

    await expect(service.start()).rejects.toThrow('constraint check only');
    expect(getUserMedia).toHaveBeenCalledWith(defaultConstraints);
  });
});
