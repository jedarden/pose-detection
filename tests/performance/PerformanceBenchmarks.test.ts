/**
 * Performance Benchmarks for Gait Detection Application
 * Measures and validates performance characteristics under various conditions
 */

import { ApplicationCoordinator } from '../../src/services/ApplicationCoordinator';
import { PerformanceMonitorService } from '../../src/services/PerformanceMonitorService';
import { AdaptiveQualityService } from '../../src/services/AdaptiveQualityService';
import { AppConfig, PerformanceMetrics } from '../../src/types';

// Benchmark configuration
const BENCHMARK_CONFIG: AppConfig = {
  camera: {
    defaultConstraints: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 60, max: 60 }
    },
    permissionsTimeout: 10000,
    maxRetries: 3
  },
  ai: {
    modelPath: '/models/benchmark',
    modelType: 'thunder', // Use more demanding model for benchmarks
    minPoseScore: 0.25,
    maxPoses: 2, // Test with multiple poses
    enableSmoothing: true
  },
  performance: {
    targetFPS: 60,
    maxDroppedFrames: 3,
    memoryThreshold: 1024,
    adaptiveQuality: true
  },
  ui: {
    theme: 'light',
    showDebugInfo: true,
    autoSaveInterval: 10000
  },
  export: {
    defaultFormat: 'json',
    includeRawData: true,
    compressionLevel: 9
  }
};

// Mock high-resolution performance data
const mockHighResFrame = () => ({
  data: new Uint8ClampedArray(1280 * 720 * 4),
  timestamp: Date.now(),
  width: 1280,
  height: 720
});

describe('Performance Benchmarks', () => {
  let coordinator: ApplicationCoordinator;
  let performanceMonitor: PerformanceMonitorService;
  let adaptiveQuality: AdaptiveQualityService;

  beforeEach(() => {
    coordinator = new ApplicationCoordinator(BENCHMARK_CONFIG);
    performanceMonitor = new PerformanceMonitorService();
    adaptiveQuality = new AdaptiveQualityService(BENCHMARK_CONFIG.performance);
    
    // Mock performance.now for consistent timing
    let mockTime = 0;
    jest.spyOn(global.performance, 'now').mockImplementation(() => {
      mockTime += 16.67; // Simulate 60 FPS
      return mockTime;
    });
  });

  afterEach(async () => {
    await coordinator.shutdown();
    jest.restoreAllMocks();
  });

  describe('Frame Processing Benchmarks', () => {
    test('should process frames at target 60 FPS', async () => {
      const FRAMES_TO_PROCESS = 60;
      const TARGET_FRAME_TIME = 16.67; // ms for 60 FPS
      
      await performanceMonitor.initialize();
      
      const processingTimes: number[] = [];
      
      for (let i = 0; i < FRAMES_TO_PROCESS; i++) {
        performanceMonitor.startFrameProcessing();
        
        // Simulate frame processing work
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 5));
        
        performanceMonitor.endFrameProcessing();
        
        const metrics = performanceMonitor.getMetrics();
        if (metrics.averageProcessingTime > 0) {
          processingTimes.push(metrics.averageProcessingTime);
        }
      }
      
      const averageProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
      
      expect(averageProcessingTime).toBeLessThan(TARGET_FRAME_TIME);
      expect(processingTimes.filter(t => t > TARGET_FRAME_TIME).length).toBeLessThan(FRAMES_TO_PROCESS * 0.1); // Less than 10% over target
    });

    test('should maintain performance under high load', async () => {
      const HIGH_LOAD_FRAMES = 300; // 5 seconds at 60 FPS
      const ACCEPTABLE_DROPPED_FRAMES = 15; // 5% tolerance
      
      await coordinator.initialize();
      await coordinator.start();
      
      const performanceService = coordinator.getService('performanceMonitor');
      let droppedFrames = 0;
      
      for (let i = 0; i < HIGH_LOAD_FRAMES; i++) {
        performanceService.startFrameProcessing();
        
        // Simulate heavy processing
        const processingTime = Math.random() * 30 + 10; // 10-40ms processing
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        performanceService.endFrameProcessing();
        
        const metrics = performanceService.getMetrics();
        if (metrics.averageProcessingTime > 16.67) {
          droppedFrames++;
        }
      }
      
      expect(droppedFrames).toBeLessThan(ACCEPTABLE_DROPPED_FRAMES);
    });
  });

  describe('Memory Performance Benchmarks', () => {
    test('should maintain stable memory usage over time', async () => {
      const DURATION_MINUTES = 2;
      const SAMPLES_PER_SECOND = 10;
      const TOTAL_SAMPLES = DURATION_MINUTES * 60 * SAMPLES_PER_SECOND;
      
      await coordinator.initialize();
      await coordinator.start();
      
      const memoryReadings: number[] = [];
      
      for (let i = 0; i < TOTAL_SAMPLES; i++) {
        // Simulate continuous operation
        const gaitService = coordinator.getService('gaitAnalysis');
        const mockPose = {
          keypoints: Array(17).fill({ x: Math.random() * 1280, y: Math.random() * 720, score: 0.8 }),
          score: 0.8 + Math.random() * 0.2
        };
        
        gaitService.addPose(mockPose, Date.now());
        
        const metrics = coordinator.getPerformanceMetrics();
        memoryReadings.push(metrics.memoryUsage);
        
        if (i % 100 === 0) {
          // Periodic cleanup simulation
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      // Calculate memory growth rate
      const initialMemory = memoryReadings.slice(0, 100).reduce((a, b) => a + b, 0) / 100;
      const finalMemory = memoryReadings.slice(-100).reduce((a, b) => a + b, 0) / 100;
      const memoryGrowthRate = (finalMemory - initialMemory) / DURATION_MINUTES; // MB per minute
      
      // Memory growth should be minimal (less than 10MB per minute)
      expect(memoryGrowthRate).toBeLessThan(10);
      
      // No memory reading should exceed the threshold significantly
      const exceededThreshold = memoryReadings.filter(m => m > BENCHMARK_CONFIG.performance.memoryThreshold * 1.5);
      expect(exceededThreshold.length).toBeLessThan(TOTAL_SAMPLES * 0.05); // Less than 5% of samples
    });

    test('should handle memory pressure gracefully', async () => {
      await coordinator.initialize();
      await coordinator.start();
      
      const adaptiveQualityService = coordinator.getService('adaptiveQuality');
      
      // Simulate memory pressure
      const highMemoryMetrics: PerformanceMetrics = {
        frameRate: 25,
        averageProcessingTime: 35,
        memoryUsage: 1500, // Above threshold
        droppedFrames: 8,
        modelInferenceTime: 25,
        renderingTime: 10,
        overallHealth: 'poor'
      };
      
      adaptiveQualityService.updatePerformanceMetrics(highMemoryMetrics);
      
      // Wait for adaptation
      await new Promise(resolve => setTimeout(resolve, 2500)); // Wait for cooldown
      
      const adaptedSettings = adaptiveQualityService.getSettings();
      
      // Quality should be reduced to handle memory pressure
      expect(adaptedSettings.processEveryNthFrame).toBeGreaterThan(1);
      expect(adaptedSettings.videoResolution.width).toBeLessThan(1280);
    });
  });

  describe('Adaptive Quality Benchmarks', () => {
    test('should adapt quality within acceptable time frames', async () => {
      await adaptiveQuality.initialize();
      
      const adaptationTimes: number[] = [];
      
      // Test multiple adaptation scenarios
      for (let scenario = 0; scenario < 10; scenario++) {
        const startTime = Date.now();
        
        // Simulate performance degradation
        const poorMetrics: PerformanceMetrics = {
          frameRate: 15 + Math.random() * 10,
          averageProcessingTime: 40 + Math.random() * 20,
          memoryUsage: 600 + Math.random() * 200,
          droppedFrames: 5 + Math.random() * 10,
          modelInferenceTime: 30 + Math.random() * 20,
          renderingTime: 15 + Math.random() * 10,
          overallHealth: 'poor'
        };
        
        adaptiveQuality.updatePerformanceMetrics(poorMetrics);
        
        // Wait for adaptation
        await new Promise(resolve => setTimeout(resolve, 2100)); // Just over cooldown
        
        const adaptationTime = Date.now() - startTime;
        adaptationTimes.push(adaptationTime);
        
        // Reset for next scenario
        adaptiveQuality.reset();
      }
      
      const averageAdaptationTime = adaptationTimes.reduce((a, b) => a + b, 0) / adaptationTimes.length;
      
      // Adaptation should happen quickly (within 3 seconds)
      expect(averageAdaptationTime).toBeLessThan(3000);
    });

    test('should optimize for different performance profiles', async () => {
      await adaptiveQuality.initialize();
      
      const performanceProfiles = [
        { name: 'Low-end device', fps: 15, processing: 50, memory: 256 },
        { name: 'Mid-range device', fps: 25, processing: 30, memory: 512 },
        { name: 'High-end device', fps: 45, processing: 15, memory: 1024 }
      ];
      
      for (const profile of performanceProfiles) {
        adaptiveQuality.reset();
        
        const metrics: PerformanceMetrics = {
          frameRate: profile.fps,
          averageProcessingTime: profile.processing,
          memoryUsage: profile.memory,
          droppedFrames: profile.fps < 20 ? 8 : 2,
          modelInferenceTime: profile.processing * 0.6,
          renderingTime: profile.processing * 0.4,
          overallHealth: profile.fps >= 30 ? 'good' : 'fair'
        };
        
        adaptiveQuality.updatePerformanceMetrics(metrics);
        await new Promise(resolve => setTimeout(resolve, 2100));
        
        const settings = adaptiveQuality.getSettings();
        
        // Verify appropriate adaptations for each profile
        if (profile.name === 'Low-end device') {
          expect(settings.processEveryNthFrame).toBeGreaterThan(1);
          expect(settings.renderQuality).toBe('low');
        } else if (profile.name === 'High-end device') {
          expect(settings.frameRate).toBeGreaterThanOrEqual(30);
          expect(settings.renderQuality).toBe('high');
        }
      }
    });
  });

  describe('End-to-End Performance Benchmarks', () => {
    test('should maintain target metrics during realistic usage', async () => {
      jest.setTimeout(30000); // 30 second timeout
      
      await coordinator.initialize();
      await coordinator.start();
      
      const SIMULATION_DURATION = 10000; // 10 seconds
      const MEASUREMENT_INTERVAL = 100; // 100ms
      const measurements: PerformanceMetrics[] = [];
      
      const simulationPromise = new Promise<void>(async (resolve) => {
        const startTime = Date.now();
        
        while (Date.now() - startTime < SIMULATION_DURATION) {
          // Simulate user interactions and system load
          const gaitService = coordinator.getService('gaitAnalysis');
          
          // Add multiple poses (simulating person detection)
          for (let p = 0; p < Math.floor(Math.random() * 3) + 1; p++) {
            const mockPose = {
              keypoints: Array(17).fill({
                x: Math.random() * 1280,
                y: Math.random() * 720,
                score: 0.5 + Math.random() * 0.5
              }),
              score: 0.7 + Math.random() * 0.3
            };
            
            gaitService.addPose(mockPose, Date.now());
          }
          
          // Collect performance metrics
          const metrics = coordinator.getPerformanceMetrics();
          measurements.push(metrics);
          
          await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL));
        }
        
        resolve();
      });
      
      await simulationPromise;
      
      // Analyze performance metrics
      const avgFrameRate = measurements.reduce((sum, m) => sum + m.frameRate, 0) / measurements.length;
      const avgProcessingTime = measurements.reduce((sum, m) => sum + m.averageProcessingTime, 0) / measurements.length;
      const maxMemoryUsage = Math.max(...measurements.map(m => m.memoryUsage));
      const totalDroppedFrames = Math.max(...measurements.map(m => m.droppedFrames));
      
      // Performance assertions
      expect(avgFrameRate).toBeGreaterThan(25); // Should maintain > 25 FPS average
      expect(avgProcessingTime).toBeLessThan(40); // Average processing < 40ms
      expect(maxMemoryUsage).toBeLessThan(BENCHMARK_CONFIG.performance.memoryThreshold); // Stay within memory limits
      expect(totalDroppedFrames).toBeLessThan(BENCHMARK_CONFIG.performance.maxDroppedFrames * 2); // Reasonable dropped frame count
      
      // Health distribution
      const healthCounts = measurements.reduce((counts, m) => {
        counts[m.overallHealth] = (counts[m.overallHealth] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);
      
      const goodHealthPercentage = ((healthCounts.excellent || 0) + (healthCounts.good || 0)) / measurements.length;
      expect(goodHealthPercentage).toBeGreaterThan(0.7); // At least 70% good/excellent health
    });

    test('should handle stress conditions without crashing', async () => {
      jest.setTimeout(20000); // 20 second timeout
      
      await coordinator.initialize();
      await coordinator.start();
      
      const STRESS_DURATION = 5000; // 5 seconds of stress
      const HIGH_FREQUENCY_OPERATIONS = 50; // Operations per second
      
      const stressPromise = new Promise<void>(async (resolve, reject) => {
        const startTime = Date.now();
        let operationCount = 0;
        
        try {
          while (Date.now() - startTime < STRESS_DURATION) {
            const operations = [];
            
            // Burst of operations
            for (let i = 0; i < HIGH_FREQUENCY_OPERATIONS; i++) {
              operations.push(this.performStressOperation(coordinator));
            }
            
            await Promise.all(operations);
            operationCount += HIGH_FREQUENCY_OPERATIONS;
            
            await new Promise(resolve => setTimeout(resolve, 1000 / HIGH_FREQUENCY_OPERATIONS));
          }
          
          console.log(`Completed ${operationCount} stress operations`);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      await expect(stressPromise).resolves.toBeUndefined();
      
      // Verify system is still responsive after stress
      const finalState = coordinator.getState();
      expect(finalState.isRunning).toBe(true);
      expect(finalState.error).toBeNull();
    });

    // Helper function for stress operations
    const performStressOperation = async (coordinator: ApplicationCoordinator): Promise<void> => {
      const operations = [
        // Heavy pose processing
        () => {
          const gaitService = coordinator.getService('gaitAnalysis');
          for (let i = 0; i < 10; i++) {
            const complexPose = {
              keypoints: Array(17).fill({
                x: Math.random() * 1920,
                y: Math.random() * 1080,
                score: Math.random()
              }),
              score: Math.random()
            };
            gaitService.addPose(complexPose, Date.now());
          }
        },
        // Memory allocation stress
        () => {
          const largeArray = new Array(1000).fill(0).map(() => Math.random());
          return largeArray.length;
        },
        // Configuration updates
        () => {
          const randomConfig = {
            performance: {
              targetFPS: 20 + Math.random() * 40,
              memoryThreshold: 256 + Math.random() * 768
            }
          };
          return coordinator.updateConfig(randomConfig);
        }
      ];
      
      const operation = operations[Math.floor(Math.random() * operations.length)];
      await operation();
    }
  });

  describe('Resource Utilization Benchmarks', () => {
    test('should efficiently utilize system resources', async () => {
      await coordinator.initialize();
      await coordinator.start();
      
      const utilizationMetrics = {
        cpuEfficiency: 0,
        memoryEfficiency: 0,
        throughputPerResource: 0
      };
      
      const startTime = Date.now();
      const startMemory = coordinator.getPerformanceMetrics().memoryUsage;
      let frameCount = 0;
      
      // Run for 3 seconds
      while (Date.now() - startTime < 3000) {
        const performanceService = coordinator.getService('performanceMonitor');
        performanceService.startFrameProcessing();
        
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 8));
        
        performanceService.endFrameProcessing();
        frameCount++;
      }
      
      const duration = (Date.now() - startTime) / 1000;
      const endMemory = coordinator.getPerformanceMetrics().memoryUsage;
      const memoryUsed = endMemory - startMemory;
      
      utilizationMetrics.throughputPerResource = frameCount / (memoryUsed || 1);
      utilizationMetrics.memoryEfficiency = frameCount / duration / (memoryUsed || 1);
      
      // Efficiency assertions
      expect(utilizationMetrics.throughputPerResource).toBeGreaterThan(0.1); // Reasonable throughput per MB
      expect(frameCount / duration).toBeGreaterThan(20); // At least 20 FPS throughput
    });
  });
});