/**
 * Tests for PoseDetectionService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PoseDetectionService } from '../src/services/PoseDetectionService';
import { 
  PoseDetectionConfig, 
  PoseDetectionResult, 
  PoseDetectionError,
  DEFAULT_POSE_CONFIG,
  KeypointName
} from '../src/types/pose';

// Mock TensorFlow.js modules
vi.mock('@tensorflow/tfjs', () => ({
  ready: vi.fn().mockResolvedValue(true),
  setBackend: vi.fn().mockResolvedValue(true),
  ENV: {
    set: vi.fn()
  }
}));

vi.mock('@tensorflow-models/pose-detection', () => ({
  createDetector: vi.fn().mockResolvedValue({
    estimatePoses: vi.fn().mockResolvedValue([
      {
        keypoints: [
          { x: 100, y: 200, score: 0.8, name: 'nose' },
          { x: 120, y: 180, score: 0.7, name: 'left_eye' },
          { x: 80, y: 180, score: 0.7, name: 'right_eye' }
        ],
        score: 0.75
      }
    ]),
    dispose: vi.fn()
  }),
  SupportedModels: {
    MoveNet: 'MoveNet'
  },
  movenet: {
    modelType: {
      SINGLEPOSE_LIGHTNING: 'SINGLEPOSE_LIGHTNING',
      SINGLEPOSE_THUNDER: 'SINGLEPOSE_THUNDER'
    }
  }
}));

describe('PoseDetectionService', () => {
  let service: PoseDetectionService;
  let mockConfig: PoseDetectionConfig;

  beforeEach(() => {
    service = new PoseDetectionService();
    mockConfig = { ...DEFAULT_POSE_CONFIG };
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      await service.initialize(mockConfig);
      expect(service.isReady()).toBe(true);
    });

    it('should throw error if initialization fails', async () => {
      const { createDetector } = await import('@tensorflow-models/pose-detection');
      vi.mocked(createDetector).mockRejectedValueOnce(new Error('Model load failed'));
      
      await expect(service.initialize(mockConfig)).rejects.toThrow('Model load failed');
    });

    it('should configure GPU backend when enabled', async () => {
      const config = { ...mockConfig, enableGPU: true };
      await service.initialize(config);
      
      const tf = await import('@tensorflow/tfjs');
      expect(tf.setBackend).toHaveBeenCalledWith('webgl');
    });

    it('should configure CPU backend when GPU disabled', async () => {
      const config = { ...mockConfig, enableGPU: false };
      await service.initialize(config);
      
      const tf = await import('@tensorflow/tfjs');
      expect(tf.setBackend).toHaveBeenCalledWith('cpu');
    });
  });

  describe('pose detection', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should detect poses from video element', async () => {
      const mockVideo = document.createElement('video');
      const results = await service.detectPoses(mockVideo);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('keypoints');
      expect(results[0]).toHaveProperty('confidence');
      expect(results[0]).toHaveProperty('timestamp');
      expect(results[0]).toHaveProperty('id');
    });

    it('should detect poses from canvas element', async () => {
      const mockCanvas = document.createElement('canvas');
      const results = await service.detectPoses(mockCanvas);
      
      expect(results).toHaveLength(1);
      expect(results[0].keypoints).toHaveLength(3);
    });

    it('should detect poses from ImageData', async () => {
      const mockImageData = new ImageData(256, 256);
      const results = await service.detectPoses(mockImageData);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('boundingBox');
    });

    it('should handle detection errors gracefully', async () => {
      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockRejectedValueOnce(new Error('Inference failed'));
      
      const mockVideo = document.createElement('video');
      await expect(service.detectPoses(mockVideo)).rejects.toThrow('Inference failed');
    });

    it('should filter low confidence poses', async () => {
      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce([
        {
          keypoints: [
            { x: 100, y: 200, score: 0.2, name: 'nose' }
          ],
          score: 0.2
        }
      ]);
      
      const mockVideo = document.createElement('video');
      const results = await service.detectPoses(mockVideo);
      
      expect(results).toHaveLength(0);
    });

    it('should assign unique IDs to each detection', async () => {
      const mockVideo = document.createElement('video');
      const results1 = await service.detectPoses(mockVideo);
      const results2 = await service.detectPoses(mockVideo);
      
      expect(results1[0].id).not.toBe(results2[0].id);
    });

    it('should calculate bounding box for detected poses', async () => {
      const mockVideo = document.createElement('video');
      const results = await service.detectPoses(mockVideo);
      
      expect(results[0].boundingBox).toHaveProperty('x');
      expect(results[0].boundingBox).toHaveProperty('y');
      expect(results[0].boundingBox).toHaveProperty('width');
      expect(results[0].boundingBox).toHaveProperty('height');
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should track detection statistics', async () => {
      const mockVideo = document.createElement('video');
      await service.detectPoses(mockVideo);
      
      const stats = service.getStats();
      expect(stats.totalPoses).toBe(1);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.currentFPS).toBeGreaterThan(0);
    });

    it('should update FPS calculations', async () => {
      const mockVideo = document.createElement('video');
      
      // Perform multiple detections
      await service.detectPoses(mockVideo);
      await service.detectPoses(mockVideo);
      await service.detectPoses(mockVideo);
      
      const stats = service.getStats();
      expect(stats.totalPoses).toBe(3);
      expect(stats.currentFPS).toBeGreaterThan(0);
    });

    it('should track processing time', async () => {
      const mockVideo = document.createElement('video');
      await service.detectPoses(mockVideo);
      
      const stats = service.getStats();
      expect(stats.avgProcessingTime).toBeGreaterThan(0);
    });
  });

  describe('configuration updates', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should update configuration at runtime', () => {
      const newConfig = {
        validation: {
          minPoseConfidence: 0.8
        }
      };
      
      service.updateConfig(newConfig);
      
      // Configuration should be updated
      expect(service.isReady()).toBe(true);
    });

    it('should handle invalid configuration updates', () => {
      const invalidConfig = {
        validation: {
          minPoseConfidence: -1 // Invalid value
        }
      };
      
      expect(() => service.updateConfig(invalidConfig)).toThrow();
    });
  });

  describe('resource management', () => {
    it('should dispose of resources properly', async () => {
      await service.initialize(mockConfig);
      expect(service.isReady()).toBe(true);
      
      service.dispose();
      expect(service.isReady()).toBe(false);
    });

    it('should handle multiple dispose calls', async () => {
      await service.initialize(mockConfig);
      service.dispose();
      
      expect(() => service.dispose()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw error when detecting poses before initialization', async () => {
      const mockVideo = document.createElement('video');
      
      await expect(service.detectPoses(mockVideo)).rejects.toThrow();
    });

    it('should handle null/undefined input gracefully', async () => {
      await service.initialize(mockConfig);
      
      await expect(service.detectPoses(null as any)).rejects.toThrow();
      await expect(service.detectPoses(undefined as any)).rejects.toThrow();
    });
  });

  describe('performance optimization', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should respect frame skipping configuration', async () => {
      const config = {
        ...mockConfig,
        performance: {
          ...mockConfig.performance,
          enableFrameSkipping: true,
          frameSkipInterval: 2
        }
      };
      
      service.updateConfig(config);
      
      const mockVideo = document.createElement('video');
      
      // First detection should process
      const results1 = await service.detectPoses(mockVideo);
      expect(results1).toHaveLength(1);
      
      // Second detection should be skipped
      const results2 = await service.detectPoses(mockVideo);
      expect(results2).toHaveLength(0);
      
      // Third detection should process
      const results3 = await service.detectPoses(mockVideo);
      expect(results3).toHaveLength(1);
    });

    it('should track memory usage', async () => {
      const mockVideo = document.createElement('video');
      await service.detectPoses(mockVideo);
      
      const stats = service.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });
});