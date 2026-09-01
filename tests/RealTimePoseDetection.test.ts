/**
 * Comprehensive Tests for Real-Time Pose Detection from Webcam Feed
 * Following TDD principles - these tests should initially fail until implementation is complete
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { PoseDetectionService } from '../src/services/PoseDetectionService';
import { CameraService } from '../src/services/CameraService';
import { PoseDetectionResult, PoseDetectionConfig, DEFAULT_POSE_CONFIG } from '../src/types/pose';

// Mock MediaDevices API
const mockMediaDevices = {
  getUserMedia: vi.fn(),
  enumerateDevices: vi.fn()
};

// Mock MediaStream API
const mockMediaStream = {
  getTracks: vi.fn().mockReturnValue([{
    stop: vi.fn(),
    getSettings: vi.fn().mockReturnValue({
      width: 1920,
      height: 1080,
      frameRate: 30
    })
  }]),
  getVideoTracks: vi.fn().mockReturnValue([{
    stop: vi.fn(),
    enabled: true,
    readyState: 'live'
  }])
};

// Mock HTMLVideoElement
const mockVideoElement = {
  srcObject: null,
  videoWidth: 1920,
  videoHeight: 1080,
  readyState: 4, // HAVE_ENOUGH_DATA
  currentTime: 0,
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
};

// Mock TensorFlow.js
vi.mock('@tensorflow/tfjs', () => ({
  ready: vi.fn().mockResolvedValue(true),
  setBackend: vi.fn().mockResolvedValue(true),
  ENV: { set: vi.fn() }
}));

// Mock TensorFlow Models
vi.mock('@tensorflow-models/pose-detection', () => ({
  createDetector: vi.fn().mockResolvedValue({
    estimatePoses: vi.fn().mockResolvedValue([]),
    dispose: vi.fn()
  }),
  SupportedModels: { MoveNet: 'MoveNet' },
  movenet: {
    modelType: {
      SINGLEPOSE_LIGHTNING: 'SINGLEPOSE_LIGHTNING',
      SINGLEPOSE_THUNDER: 'SINGLEPOSE_THUNDER'
    }
  }
}));

// Mock Performance API
Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn().mockReturnValue(Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn().mockReturnValue([])
  }
});

describe('Real-Time Pose Detection from Webcam Feed', () => {
  let poseDetectionService: PoseDetectionService;
  let cameraService: CameraService;
  let config: PoseDetectionConfig;

  beforeEach(() => {
    // Setup global mocks
    Object.defineProperty(navigator, 'mediaDevices', {
      value: mockMediaDevices,
      writable: true
    });

    config = { ...DEFAULT_POSE_CONFIG };
    poseDetectionService = new PoseDetectionService();
    cameraService = new CameraService();

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    poseDetectionService?.dispose();
    cameraService?.dispose();
  });

  describe('Camera Stream Initialization', () => {
    it('should request camera access with proper constraints', async () => {
      const expectedConstraints = {
        video: {
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          frameRate: { ideal: 30, min: 15 }
        },
        audio: false
      };

      mockMediaDevices.getUserMedia.mockResolvedValueOnce(mockMediaStream);

      const stream = await cameraService.requestCameraAccess(expectedConstraints);

      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith(expectedConstraints);
      expect(stream).toBeDefined();
      expect(stream.getVideoTracks()).toHaveLength(1);
    });

    it('should enumerate available camera devices', async () => {
      const mockDevices = [
        { deviceId: 'camera1', kind: 'videoinput', label: 'Front Camera' },
        { deviceId: 'camera2', kind: 'videoinput', label: 'Back Camera' }
      ];

      mockMediaDevices.enumerateDevices.mockResolvedValueOnce(mockDevices);

      const devices = await cameraService.getAvailableCameras();

      expect(mockMediaDevices.enumerateDevices).toHaveBeenCalled();
      expect(devices).toHaveLength(2);
      expect(devices[0]).toHaveProperty('deviceId', 'camera1');
    });

    it('should handle camera access permission denied', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      
      mockMediaDevices.getUserMedia.mockRejectedValueOnce(permissionError);

      await expect(cameraService.requestCameraAccess()).rejects.toThrow('Permission denied');
    });

    it('should handle no camera devices available', async () => {
      const deviceError = new Error('No video input devices found');
      deviceError.name = 'NotFoundError';
      
      mockMediaDevices.getUserMedia.mockRejectedValueOnce(deviceError);

      await expect(cameraService.requestCameraAccess()).rejects.toThrow('No video input devices found');
    });

    it('should automatically select best quality camera settings', async () => {
      mockMediaDevices.getUserMedia.mockResolvedValueOnce(mockMediaStream);

      const stream = await cameraService.requestCameraAccess();
      const settings = await cameraService.getOptimalSettings(stream);

      expect(settings).toHaveProperty('width');
      expect(settings).toHaveProperty('height');
      expect(settings).toHaveProperty('frameRate');
      expect(settings.width).toBeGreaterThanOrEqual(640);
      expect(settings.height).toBeGreaterThanOrEqual(480);
    });
  });

  describe('Real-Time Video Processing', () => {
    beforeEach(async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockMediaStream);
      await poseDetectionService.initialize(config);
    });

    it('should process video frames at target frame rate', async () => {
      const targetFPS = 30;
      const processingDuration = 1000; // 1 second
      const expectedFrames = targetFPS; // Approximately 30 frames in 1 second

      let frameCount = 0;
      const mockDetectPoses = vi.fn().mockImplementation(() => {
        frameCount++;
        return Promise.resolve([]);
      });

      // Replace the detectPoses method
      poseDetectionService.detectPoses = mockDetectPoses;

      // Start real-time processing
      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      const processingPromise = poseDetectionService.startRealTimeDetection(video, {
        targetFPS,
        maxProcessingTime: 33 // 33ms for 30 FPS
      });

      // Let it run for the specified duration
      await new Promise(resolve => setTimeout(resolve, processingDuration));
      
      await poseDetectionService.stopRealTimeDetection();

      // Should have processed approximately the target number of frames
      expect(frameCount).toBeGreaterThanOrEqual(expectedFrames * 0.8); // Allow 20% variance
      expect(frameCount).toBeLessThanOrEqual(expectedFrames * 1.2);
    });

    it('should maintain consistent frame intervals', async () => {
      const frameTimestamps: number[] = [];
      const targetFPS = 30;
      const expectedInterval = 1000 / targetFPS; // ~33.33ms

      const mockDetectPoses = vi.fn().mockImplementation(() => {
        frameTimestamps.push(performance.now());
        return Promise.resolve([]);
      });

      poseDetectionService.detectPoses = mockDetectPoses;

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video, { targetFPS });

      // Let it run to collect frame data
      await new Promise(resolve => setTimeout(resolve, 500));
      await poseDetectionService.stopRealTimeDetection();

      // Analyze frame intervals
      const intervals = frameTimestamps.slice(1).map((time, index) => 
        time - frameTimestamps[index]
      );

      const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => 
        sum + Math.pow(interval - averageInterval, 2), 0) / intervals.length;

      expect(averageInterval).toBeCloseTo(expectedInterval, -1); // Within 10ms
      expect(Math.sqrt(variance)).toBeLessThan(expectedInterval * 0.3); // Low variance
    });

    it('should adapt to processing performance automatically', async () => {
      let processingTime = 50; // Start with slow processing
      const mockDetectPoses = vi.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([]);
            processingTime = Math.max(10, processingTime - 5); // Gradually improve
          }, processingTime);
        });
      });

      poseDetectionService.detectPoses = mockDetectPoses;

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video, {
        targetFPS: 30,
        adaptivePerformance: true
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      await poseDetectionService.stopRealTimeDetection();

      const stats = poseDetectionService.getStats();
      
      // Should maintain reasonable FPS despite initial slow processing
      expect(stats.currentFPS).toBeGreaterThan(15);
      expect(stats.droppedFrames).toBeLessThan(stats.totalFrames * 0.3); // Less than 30% dropped
    });

    it('should handle video stream interruptions gracefully', async () => {
      const mockDetectPoses = vi.fn().mockResolvedValue([]);
      poseDetectionService.detectPoses = mockDetectPoses;

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video);

      // Simulate stream interruption
      setTimeout(() => {
        stream.getTracks().forEach(track => track.stop());
      }, 100);

      // Should not throw an error
      await expect(
        new Promise(resolve => setTimeout(resolve, 500))
      ).resolves.toBeUndefined();

      await poseDetectionService.stopRealTimeDetection();
    });

    it('should provide real-time statistics during processing', async () => {
      const mockDetectPoses = vi.fn().mockResolvedValue([{
        keypoints: [{ x: 100, y: 200, score: 0.8, name: 'nose' }],
        confidence: 0.8,
        timestamp: Date.now(),
        id: 'pose_1',
        boundingBox: { x: 80, y: 180, width: 40, height: 40 }
      }]);

      poseDetectionService.detectPoses = mockDetectPoses;

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video);

      // Let it process for a short time
      await new Promise(resolve => setTimeout(resolve, 200));

      const stats = poseDetectionService.getStats();

      expect(stats).toHaveProperty('currentFPS');
      expect(stats).toHaveProperty('avgProcessingTime');
      expect(stats).toHaveProperty('totalFrames');
      expect(stats).toHaveProperty('droppedFrames');
      expect(stats).toHaveProperty('memoryUsage');

      expect(stats.currentFPS).toBeGreaterThan(0);
      expect(stats.totalFrames).toBeGreaterThan(0);

      await poseDetectionService.stopRealTimeDetection();
    });
  });

  describe('Webcam Integration', () => {
    it('should support multiple camera resolutions', async () => {
      const resolutions = [
        { width: 640, height: 480 },
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 }
      ];

      for (const resolution of resolutions) {
        mockMediaDevices.getUserMedia.mockResolvedValueOnce({
          ...mockMediaStream,
          getTracks: vi.fn().mockReturnValue([{
            stop: vi.fn(),
            getSettings: vi.fn().mockReturnValue(resolution)
          }])
        });

        const constraints = {
          video: {
            width: { exact: resolution.width },
            height: { exact: resolution.height }
          }
        };

        const stream = await cameraService.requestCameraAccess(constraints);
        const settings = stream.getTracks()[0].getSettings();

        expect(settings.width).toBe(resolution.width);
        expect(settings.height).toBe(resolution.height);
      }
    });

    it('should handle different camera orientations', async () => {
      const orientations = ['user', 'environment']; // Front/back cameras

      for (const facing of orientations) {
        mockMediaDevices.getUserMedia.mockResolvedValueOnce(mockMediaStream);

        const constraints = {
          video: { facingMode: facing }
        };

        const stream = await cameraService.requestCameraAccess(constraints);

        expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith(
          expect.objectContaining({
            video: expect.objectContaining({ facingMode: facing })
          })
        );
      }
    });

    it('should support camera switching during runtime', async () => {
      const camera1Stream = { ...mockMediaStream };
      const camera2Stream = { ...mockMediaStream };

      mockMediaDevices.getUserMedia
        .mockResolvedValueOnce(camera1Stream)
        .mockResolvedValueOnce(camera2Stream);

      // Start with first camera
      const stream1 = await cameraService.requestCameraAccess({
        video: { deviceId: 'camera1' }
      });

      expect(stream1).toBe(camera1Stream);

      // Switch to second camera
      const stream2 = await cameraService.switchCamera('camera2');

      expect(stream2).toBe(camera2Stream);
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    });

    it('should optimize camera settings for pose detection', async () => {
      mockMediaDevices.getUserMedia.mockResolvedValueOnce(mockMediaStream);

      const optimizedConstraints = await cameraService.getOptimizedConstraints();

      expect(optimizedConstraints.video).toHaveProperty('width');
      expect(optimizedConstraints.video).toHaveProperty('height');
      expect(optimizedConstraints.video).toHaveProperty('frameRate');

      // Should prioritize quality for pose detection
      expect(optimizedConstraints.video.width.ideal).toBeGreaterThanOrEqual(1280);
      expect(optimizedConstraints.video.frameRate.ideal).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should recover from temporary processing failures', async () => {
      let failureCount = 0;
      const mockDetectPoses = vi.fn().mockImplementation(() => {
        failureCount++;
        if (failureCount <= 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve([]);
      });

      poseDetectionService.detectPoses = mockDetectPoses;

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video, {
        maxRetries: 5,
        retryDelay: 100
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const stats = poseDetectionService.getStats();
      
      // Should have recovered and continue processing
      expect(stats.totalFrames).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(3); // Retried beyond initial failures

      await poseDetectionService.stopRealTimeDetection();
    });

    it('should handle GPU memory exhaustion gracefully', async () => {
      const memoryError = new Error('GPU memory exhausted');
      memoryError.name = 'ResourceExhaustedError';

      const mockDetectPoses = vi.fn().mockRejectedValueOnce(memoryError);
      poseDetectionService.detectPoses = mockDetectPoses;

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);

      // Should fallback to CPU processing
      await expect(poseDetectionService.startRealTimeDetection(video)).resolves.toBeUndefined();

      await poseDetectionService.stopRealTimeDetection();
    });

    it('should provide detailed error reporting', async () => {
      const testError = new Error('Test detection error');
      const mockDetectPoses = vi.fn().mockRejectedValue(testError);
      poseDetectionService.detectPoses = mockDetectPoses;

      const errorHandler = vi.fn();
      poseDetectionService.onError(errorHandler);

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: testError,
          timestamp: expect.any(Number),
          context: 'real-time-detection'
        })
      );

      await poseDetectionService.stopRealTimeDetection();
    });
  });

  describe('Resource Management', () => {
    it('should properly cleanup resources on stop', async () => {
      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video);
      await poseDetectionService.stopRealTimeDetection();

      // All tracks should be stopped
      stream.getTracks().forEach(track => {
        expect(track.stop).toHaveBeenCalled();
      });

      // Service should no longer be processing
      expect(poseDetectionService.isProcessing()).toBe(false);
    });

    it('should monitor memory usage during processing', async () => {
      const mockDetectPoses = vi.fn().mockResolvedValue([]);
      poseDetectionService.detectPoses = mockDetectPoses;

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video);

      await new Promise(resolve => setTimeout(resolve, 200));

      const stats = poseDetectionService.getStats();
      
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeLessThan(1000); // Reasonable memory usage (MB)

      await poseDetectionService.stopRealTimeDetection();
    });

    it('should implement automatic garbage collection', async () => {
      const mockDetectPoses = vi.fn().mockResolvedValue([]);
      poseDetectionService.detectPoses = mockDetectPoses;

      const stream = await cameraService.requestCameraAccess();
      const video = await cameraService.createVideoElement(stream);
      
      await poseDetectionService.startRealTimeDetection(video, {
        enableGarbageCollection: true,
        gcInterval: 100 // Every 100ms
      });

      const initialMemory = poseDetectionService.getStats().memoryUsage;

      await new Promise(resolve => setTimeout(resolve, 500));

      const currentMemory = poseDetectionService.getStats().memoryUsage;

      // Memory should be managed and not grow unbounded
      expect(currentMemory).toBeLessThanOrEqual(initialMemory * 1.5);

      await poseDetectionService.stopRealTimeDetection();
    });
  });
});