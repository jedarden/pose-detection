/**
 * ApplicationCoordinator event flow tests.
 *
 * Service dependencies are replaced with lightweight EventEmitter fakes so the
 * tests exercise only the coordinator's wiring: camera frames -> pose detection
 * -> gait analysis -> emitted events, plus dropped frames and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AppConfig } from '../../../src/types';

vi.mock('../../../src/services/CameraService', async () => {
  const { EventEmitter } = await import('events');
  class CameraService extends EventEmitter {
    initialize = vi.fn().mockResolvedValue(undefined);
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    reset = vi.fn().mockResolvedValue(undefined);
    restart = vi.fn().mockResolvedValue(undefined);
    constructor(_config: unknown) {
      super();
    }
  }
  return { CameraService };
});

vi.mock('../../../src/services/PoseDetectionService', () => {
  class PoseDetectionService {
    initialize = vi.fn().mockResolvedValue(undefined);
    detectPoses = vi.fn().mockResolvedValue([]);
    restart = vi.fn().mockResolvedValue(undefined);
    constructor(_config: unknown) {}
  }
  return { PoseDetectionService };
});

vi.mock('../../../src/services/GaitAnalysisService', () => {
  class GaitAnalysisService {
    initialize = vi.fn().mockResolvedValue(undefined);
    addPose = vi.fn();
    calculateGaitParameters = vi.fn(() => ({ cadence: 100 }));
    reset = vi.fn().mockResolvedValue(undefined);
    exportData = vi.fn().mockResolvedValue({});
  }
  return { GaitAnalysisService };
});

vi.mock('../../../src/services/PerformanceMonitorService', async () => {
  const { EventEmitter } = await import('events');
  class PerformanceMonitorService extends EventEmitter {
    initialize = vi.fn().mockResolvedValue(undefined);
    startFrameProcessing = vi.fn();
    endFrameProcessing = vi.fn();
    getMetrics = vi.fn(() => ({}));
    getOptimizationRecommendations = vi.fn(() => []);
    reset = vi.fn();
  }
  return { PerformanceMonitorService };
});

vi.mock('../../../src/services/AdaptiveQualityService', async () => {
  const { EventEmitter } = await import('events');
  class AdaptiveQualityService extends EventEmitter {
    initialize = vi.fn().mockResolvedValue(undefined);
    updatePerformanceMetrics = vi.fn();
    applyRecommendations = vi.fn();
    reset = vi.fn();
    constructor(_config: unknown) {
      super();
    }
  }
  return { AdaptiveQualityService };
});

vi.mock('../../../src/services/ErrorHandlingService', async () => {
  const { EventEmitter } = await import('events');
  class ErrorHandlingService extends EventEmitter {
    initialize = vi.fn().mockResolvedValue(undefined);
    // Mirror the real service: report errors on its own 'error' event.
    handleError = vi.fn((error: unknown) => {
      this.emit('error', error);
    });
    constructor(_bus: unknown) {
      super();
    }
  }
  return { ErrorHandlingService };
});

vi.mock('../../../src/services/NotificationService', () => {
  class NotificationService {
    initialize = vi.fn().mockResolvedValue(undefined);
    showNotification = vi.fn();
    constructor(_bus: unknown) {}
  }
  return { NotificationService };
});

vi.mock('../../../src/services/DataExportService', () => {
  class DataExportService {
    initialize = vi.fn().mockResolvedValue(undefined);
    exportData = vi.fn().mockResolvedValue(new Blob());
  }
  return { DataExportService };
});

vi.mock('../../../src/services/ConfigurationService', () => {
  class ConfigurationService {
    initialize = vi.fn().mockResolvedValue(undefined);
    updateConfig = vi.fn().mockResolvedValue(undefined);
    constructor(_config: unknown) {}
  }
  return { ConfigurationService };
});

vi.mock('../../../src/services/LoggingService', () => {
  class LoggingService {
    initialize = vi.fn().mockResolvedValue(undefined);
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  }
  return { LoggingService };
});

import { ApplicationCoordinator } from '../../../src/services/ApplicationCoordinator';

// Let the coordinator's async frame handler settle.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeConfig = (): AppConfig =>
  ({ camera: {}, ai: {}, performance: {} } as unknown as AppConfig);

const makeDetection = (overrides: Record<string, unknown> = {}) => ({
  id: 'person-1',
  keypoints: [
    { name: 'left_ankle', x: 100, y: 400, score: 0.9, timestamp: 1000 },
    { name: 'right_ankle', x: 180, y: 402, score: 0.85, timestamp: 1000 }
  ],
  confidence: 0.92,
  timestamp: 1000,
  ...overrides
});

describe('ApplicationCoordinator event flow', () => {
  let coordinator: ApplicationCoordinator;
  let camera: any;
  let poseDetection: any;
  let gait: any;
  let performanceMonitor: any;
  let errorHandling: any;
  let eventBus: any;

  const frame = (data: unknown = { width: 640, height: 480 }) => ({ data });

  beforeEach(async () => {
    coordinator = new ApplicationCoordinator(makeConfig());
    camera = coordinator.getService('camera');
    poseDetection = coordinator.getService('poseDetection');
    gait = coordinator.getService('gaitAnalysis');
    performanceMonitor = coordinator.getService('performanceMonitor');
    errorHandling = coordinator.getService('errorHandling');
    eventBus = coordinator.getService('eventBus');
  });

  afterEach(async () => {
    await coordinator.shutdown();
    vi.clearAllMocks();
  });

  const startCoordinator = async () => {
    await coordinator.initialize();
    await coordinator.start();
  };

  describe('lifecycle', () => {
    it('initializes all registered services and emits initialized', async () => {
      const initialized = vi.fn();
      coordinator.on('initialized', initialized);

      await coordinator.initialize();

      expect(initialized).toHaveBeenCalledTimes(1);
      expect(coordinator.isInitialized()).toBe(true);
      expect(coordinator.getServiceStatus('camera')?.health).toBe('healthy');
      expect(coordinator.getServiceStatus('poseDetection')?.isRunning).toBe(true);
    });

    it('refuses to start before initialization', async () => {
      await expect(coordinator.start()).rejects.toThrow('Application not initialized');
      expect(camera.start).not.toHaveBeenCalled();
    });

    it('starts the camera and emits started', async () => {
      const started = vi.fn();
      coordinator.on('started', started);

      await startCoordinator();

      expect(camera.start).toHaveBeenCalledTimes(1);
      expect(started).toHaveBeenCalledTimes(1);
      expect(coordinator.isRunning()).toBe(true);
      expect(coordinator.getCurrentMode()).toBe('analysis');
    });

    it('stops the camera and emits stopped', async () => {
      await startCoordinator();
      const stopped = vi.fn();
      coordinator.on('stopped', stopped);

      await coordinator.stop();

      expect(camera.stop).toHaveBeenCalledTimes(1);
      expect(stopped).toHaveBeenCalledTimes(1);
      expect(coordinator.isRunning()).toBe(false);
      expect(coordinator.getCurrentMode()).toBe('idle');
    });
  });

  describe('frame processing', () => {
    it('runs each camera frame through pose detection and gait analysis', async () => {
      const detection = makeDetection();
      poseDetection.detectPoses.mockResolvedValueOnce([detection]);
      await startCoordinator();

      const data = { width: 640, height: 480 };
      camera.emit('frameReady', frame(data));
      await flush();

      expect(poseDetection.detectPoses).toHaveBeenCalledWith(data);
      expect(gait.addPose).toHaveBeenCalledWith(
        { keypoints: detection.keypoints, score: detection.confidence },
        detection.timestamp
      );
    });

    it('emits poseDetected, gaitParametersUpdated and frameProcessed in order', async () => {
      const detection = makeDetection();
      poseDetection.detectPoses.mockResolvedValueOnce([detection]);
      await startCoordinator();

      const events: string[] = [];
      coordinator.on('frameReady', () => events.push('frameReady'));
      coordinator.on('poseDetected', (analysis) => {
        events.push('poseDetected');
        expect(analysis).toEqual({
          pose: { keypoints: detection.keypoints, score: detection.confidence },
          timestamp: detection.timestamp
        });
      });
      coordinator.on('gaitParametersUpdated', (params) => {
        events.push('gaitParametersUpdated');
        expect(params).toEqual({ cadence: 100 });
      });
      eventBus.on('frameProcessed', () => events.push('frameProcessed'));

      camera.emit('frameReady', frame());
      await flush();

      expect(events).toEqual([
        'frameReady',
        'poseDetected',
        'gaitParametersUpdated',
        'frameProcessed'
      ]);
    });

    it('publishes poseDetected on the event bus as well as the coordinator', async () => {
      poseDetection.detectPoses.mockResolvedValueOnce([makeDetection()]);
      await startCoordinator();

      camera.emit('frameReady', frame());
      await flush();

      const busTypes = eventBus.getEventHistory().map((e: { type: string }) => e.type);
      expect(busTypes).toContain('poseDetected');
      expect(busTypes).toContain('frameProcessed');
    });

    it('feeds every detection in a multi-person frame to gait analysis', async () => {
      poseDetection.detectPoses.mockResolvedValueOnce([
        makeDetection({ id: 'a', timestamp: 2000 }),
        makeDetection({ id: 'b', timestamp: 2000 })
      ]);
      await startCoordinator();

      const poseEvents: unknown[] = [];
      coordinator.on('poseDetected', (analysis) => poseEvents.push(analysis));

      camera.emit('frameReady', frame());
      await flush();

      expect(gait.addPose).toHaveBeenCalledTimes(2);
      expect(poseEvents).toHaveLength(2);
    });

    it('still completes a frame whose detection has no keypoints', async () => {
      // Invalid/empty keypoint sets must not be treated as a processing failure.
      poseDetection.detectPoses.mockResolvedValueOnce([
        makeDetection({ keypoints: [], confidence: 0 })
      ]);
      await startCoordinator();

      const frameProcessed = vi.fn();
      const error = vi.fn();
      eventBus.on('frameProcessed', frameProcessed);
      coordinator.on('error', error);

      camera.emit('frameReady', frame());
      await flush();

      expect(gait.addPose).toHaveBeenCalledWith({ keypoints: [], score: 0 }, 1000);
      expect(frameProcessed).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    });

    it('times each processed frame with the performance monitor', async () => {
      poseDetection.detectPoses.mockResolvedValue([]);
      await startCoordinator();

      camera.emit('frameReady', frame());
      await flush();

      expect(performanceMonitor.startFrameProcessing).toHaveBeenCalledTimes(1);
      expect(performanceMonitor.endFrameProcessing).toHaveBeenCalledTimes(1);
    });
  });

  describe('dropped frames', () => {
    it('drops frames that arrive before the application is started', async () => {
      await coordinator.initialize();
      const poseListener = vi.fn();
      coordinator.on('poseDetected', poseListener);

      camera.emit('frameReady', frame());
      await flush();

      expect(poseDetection.detectPoses).not.toHaveBeenCalled();
      expect(gait.addPose).not.toHaveBeenCalled();
      expect(poseListener).not.toHaveBeenCalled();
    });

    it('drops frames that arrive after the application is stopped', async () => {
      poseDetection.detectPoses.mockResolvedValue([makeDetection()]);
      await startCoordinator();
      await coordinator.stop();
      poseDetection.detectPoses.mockClear();

      camera.emit('frameReady', frame());
      await flush();

      expect(poseDetection.detectPoses).not.toHaveBeenCalled();
      expect(gait.addPose).not.toHaveBeenCalled();
    });

    it('keeps processing subsequent frames after one detection fails', async () => {
      poseDetection.detectPoses
        .mockRejectedValueOnce(new Error('inference failed'))
        .mockResolvedValueOnce([makeDetection()]);
      await startCoordinator();

      const poseListener = vi.fn();
      // App.tsx always subscribes to 'error'; without a listener the coordinator's
      // emit would throw inside the frame handler.
      const errorListener = vi.fn();
      coordinator.on('poseDetected', poseListener);
      coordinator.on('error', errorListener);

      camera.emit('frameReady', frame());
      await flush();
      camera.emit('frameReady', frame());
      await flush();

      expect(poseDetection.detectPoses).toHaveBeenCalledTimes(2);
      expect(errorListener).toHaveBeenCalledTimes(1);
      expect(poseListener).toHaveBeenCalledTimes(1);
      expect(coordinator.isRunning()).toBe(true);
    });
  });

  describe('error flow', () => {
    it('reports a failed frame as a recoverable AI error without emitting pose events', async () => {
      poseDetection.detectPoses.mockRejectedValueOnce(new Error('inference failed'));
      await startCoordinator();

      const errors: any[] = [];
      const poseListener = vi.fn();
      coordinator.on('error', (error) => errors.push(error));
      coordinator.on('poseDetected', poseListener);

      camera.emit('frameReady', frame());
      await flush();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        type: 'ai',
        severity: 'low',
        message: 'Frame processing failed',
        recoverable: true
      });
      expect(poseListener).not.toHaveBeenCalled();
      expect(gait.addPose).not.toHaveBeenCalled();
    });

    it('marks permission-denied camera errors as non-recoverable', async () => {
      await startCoordinator();
      const errors: any[] = [];
      coordinator.on('error', (error) => errors.push(error));

      const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      camera.emit('error', denied);

      expect(errors).toHaveLength(1);
      expect(errorHandling.handleError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'camera', recoverable: false })
      );
      expect(errors[0]).toMatchObject({ type: 'camera', recoverable: false });
    });

    it('treats other camera errors as recoverable', async () => {
      await startCoordinator();
      const errors: any[] = [];
      coordinator.on('error', (error) => errors.push(error));

      camera.emit('error', Object.assign(new Error('Camera disconnected'), { name: 'OverconstrainedError' }));

      expect(errors[0]).toMatchObject({ type: 'camera', recoverable: true });
    });
  });
});
