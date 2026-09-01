/**
 * Comprehensive Tests for Keypoint Detection - Major Body Parts
 * Following TDD principles - these tests verify detection of all major body parts
 * with proper confidence scoring and spatial relationships
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PoseDetectionService } from '../src/services/PoseDetectionService';
import { PoseValidationService } from '../src/services/PoseValidationService';
import { 
  PoseDetectionResult, 
  PoseDetectionConfig, 
  DEFAULT_POSE_CONFIG,
  Keypoint,
  KeypointName 
} from '../src/types/pose';

// Mock TensorFlow.js
vi.mock('@tensorflow/tfjs', () => ({
  ready: vi.fn().mockResolvedValue(true),
  setBackend: vi.fn().mockResolvedValue(true),
  getBackend: vi.fn().mockReturnValue('webgl'),
  ENV: { set: vi.fn() }
}));

// Mock pose detection model
vi.mock('@tensorflow-models/pose-detection', () => ({
  createDetector: vi.fn().mockResolvedValue({
    estimatePoses: vi.fn(),
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

describe('Keypoint Detection - Major Body Parts', () => {
  let poseDetectionService: PoseDetectionService;
  let poseValidationService: PoseValidationService;
  let config: PoseDetectionConfig;
  let mockVideo: HTMLVideoElement;

  // Complete keypoint mapping for human pose
  const REQUIRED_KEYPOINTS: KeypointName[] = [
    // Head and facial features
    'nose',
    'left_eye',
    'right_eye',
    'left_ear',
    'right_ear',
    
    // Upper body
    'left_shoulder',
    'right_shoulder',
    'left_elbow',
    'right_elbow',
    'left_wrist',
    'right_wrist',
    
    // Lower body
    'left_hip',
    'right_hip',
    'left_knee',
    'right_knee',
    'left_ankle',
    'right_ankle'
  ];

  beforeEach(async () => {
    config = { ...DEFAULT_POSE_CONFIG };
    poseDetectionService = new PoseDetectionService();
    poseValidationService = new PoseValidationService();

    // Mock video element
    mockVideo = {
      videoWidth: 640,
      videoHeight: 480,
      readyState: 4
    } as HTMLVideoElement;

    await poseDetectionService.initialize(config);
    vi.clearAllMocks();
  });

  afterEach(() => {
    poseDetectionService?.dispose();
    poseValidationService?.dispose();
  });

  describe('Head and Facial Keypoints', () => {
    it('should detect nose keypoint as the primary facial reference', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 320, y: 100, score: 0.95, name: 'nose' },
          { x: 310, y: 90, score: 0.85, name: 'left_eye' },
          { x: 330, y: 90, score: 0.85, name: 'right_eye' }
        ],
        score: 0.9
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);

      expect(results).toHaveLength(1);
      
      const noseKeypoint = results[0].keypoints.find(kp => kp.name === 'nose');
      expect(noseKeypoint).toBeDefined();
      expect(noseKeypoint!.score).toBeGreaterThan(0.8);
      expect(noseKeypoint!.x).toBeCloseTo(320, 10);
      expect(noseKeypoint!.y).toBeCloseTo(100, 10);
    });

    it('should detect both eyes with proper spatial relationship to nose', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 320, y: 100, score: 0.95, name: 'nose' },
          { x: 310, y: 90, score: 0.85, name: 'left_eye' },
          { x: 330, y: 90, score: 0.85, name: 'right_eye' }
        ],
        score: 0.9
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      const nose = pose.keypoints.find(kp => kp.name === 'nose')!;
      const leftEye = pose.keypoints.find(kp => kp.name === 'left_eye')!;
      const rightEye = pose.keypoints.find(kp => kp.name === 'right_eye')!;

      // Eyes should be above nose
      expect(leftEye.y).toBeLessThan(nose.y);
      expect(rightEye.y).toBeLessThan(nose.y);

      // Eyes should be horizontally aligned (approximately)
      expect(Math.abs(leftEye.y - rightEye.y)).toBeLessThan(10);

      // Left eye should be to the left of right eye (from viewer perspective)
      expect(leftEye.x).toBeLessThan(rightEye.x);

      // Both eyes should have good confidence
      expect(leftEye.score).toBeGreaterThan(0.7);
      expect(rightEye.score).toBeGreaterThan(0.7);
    });

    it('should detect ears when visible with proper positioning', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 320, y: 100, score: 0.95, name: 'nose' },
          { x: 310, y: 90, score: 0.85, name: 'left_eye' },
          { x: 330, y: 90, score: 0.85, name: 'right_eye' },
          { x: 290, y: 95, score: 0.75, name: 'left_ear' },
          { x: 350, y: 95, score: 0.75, name: 'right_ear' }
        ],
        score: 0.88
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      const leftEye = pose.keypoints.find(kp => kp.name === 'left_eye')!;
      const rightEye = pose.keypoints.find(kp => kp.name === 'right_eye')!;
      const leftEar = pose.keypoints.find(kp => kp.name === 'left_ear')!;
      const rightEar = pose.keypoints.find(kp => kp.name === 'right_ear')!;

      // Ears should be outside of eyes horizontally
      expect(leftEar.x).toBeLessThan(leftEye.x);
      expect(rightEar.x).toBeGreaterThan(rightEye.x);

      // Ears should be approximately at eye level
      expect(Math.abs(leftEar.y - leftEye.y)).toBeLessThan(15);
      expect(Math.abs(rightEar.y - rightEye.y)).toBeLessThan(15);
    });

    it('should handle partially occluded facial features', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 320, y: 100, score: 0.95, name: 'nose' },
          { x: 310, y: 90, score: 0.85, name: 'left_eye' },
          { x: 330, y: 90, score: 0.3, name: 'right_eye' }, // Low confidence (occluded)
          { x: 290, y: 95, score: 0.75, name: 'left_ear' },
          { x: 350, y: 95, score: 0.2, name: 'right_ear' } // Low confidence (occluded)
        ],
        score: 0.75
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      // Should still detect the pose despite low confidence features
      expect(results).toHaveLength(1);
      
      const isValid = poseValidationService.validatePose(results[0]);
      expect(isValid.isValid).toBe(true);
      expect(isValid.warnings).toContain('Low confidence keypoints detected');
    });
  });

  describe('Upper Body Keypoints', () => {
    it('should detect shoulder keypoints as body structure foundation', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 280, y: 150, score: 0.9, name: 'left_shoulder' },
          { x: 360, y: 150, score: 0.9, name: 'right_shoulder' },
          { x: 320, y: 100, score: 0.95, name: 'nose' }
        ],
        score: 0.92
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      const leftShoulder = pose.keypoints.find(kp => kp.name === 'left_shoulder')!;
      const rightShoulder = pose.keypoints.find(kp => kp.name === 'right_shoulder')!;
      const nose = pose.keypoints.find(kp => kp.name === 'nose')!;

      // Shoulders should be below the nose/head
      expect(leftShoulder.y).toBeGreaterThan(nose.y);
      expect(rightShoulder.y).toBeGreaterThan(nose.y);

      // Shoulders should be roughly aligned horizontally
      expect(Math.abs(leftShoulder.y - rightShoulder.y)).toBeLessThan(20);

      // Shoulder distance should be reasonable for human proportions
      const shoulderDistance = Math.abs(rightShoulder.x - leftShoulder.x);
      expect(shoulderDistance).toBeGreaterThan(50); // Minimum reasonable shoulder width
      expect(shoulderDistance).toBeLessThan(200); // Maximum reasonable shoulder width
    });

    it('should detect elbow keypoints with proper arm structure', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 280, y: 150, score: 0.9, name: 'left_shoulder' },
          { x: 360, y: 150, score: 0.9, name: 'right_shoulder' },
          { x: 250, y: 200, score: 0.85, name: 'left_elbow' },
          { x: 390, y: 200, score: 0.85, name: 'right_elbow' }
        ],
        score: 0.88
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      const leftShoulder = pose.keypoints.find(kp => kp.name === 'left_shoulder')!;
      const rightShoulder = pose.keypoints.find(kp => kp.name === 'right_shoulder')!;
      const leftElbow = pose.keypoints.find(kp => kp.name === 'left_elbow')!;
      const rightElbow = pose.keypoints.find(kp => kp.name === 'right_elbow')!;

      // Elbows should be below shoulders
      expect(leftElbow.y).toBeGreaterThan(leftShoulder.y);
      expect(rightElbow.y).toBeGreaterThan(rightShoulder.y);

      // Upper arm length should be reasonable
      const leftUpperArmLength = Math.sqrt(
        Math.pow(leftElbow.x - leftShoulder.x, 2) + Math.pow(leftElbow.y - leftShoulder.y, 2)
      );
      const rightUpperArmLength = Math.sqrt(
        Math.pow(rightElbow.x - rightShoulder.x, 2) + Math.pow(rightElbow.y - rightShoulder.y, 2)
      );

      expect(leftUpperArmLength).toBeGreaterThan(30);
      expect(leftUpperArmLength).toBeLessThan(150);
      expect(rightUpperArmLength).toBeGreaterThan(30);
      expect(rightUpperArmLength).toBeLessThan(150);
    });

    it('should detect wrist keypoints with complete arm chain', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 280, y: 150, score: 0.9, name: 'left_shoulder' },
          { x: 360, y: 150, score: 0.9, name: 'right_shoulder' },
          { x: 250, y: 200, score: 0.85, name: 'left_elbow' },
          { x: 390, y: 200, score: 0.85, name: 'right_elbow' },
          { x: 230, y: 250, score: 0.8, name: 'left_wrist' },
          { x: 410, y: 250, score: 0.8, name: 'right_wrist' }
        ],
        score: 0.85
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      const leftElbow = pose.keypoints.find(kp => kp.name === 'left_elbow')!;
      const rightElbow = pose.keypoints.find(kp => kp.name === 'right_elbow')!;
      const leftWrist = pose.keypoints.find(kp => kp.name === 'left_wrist')!;
      const rightWrist = pose.keypoints.find(kp => kp.name === 'right_wrist')!;

      // Wrists should extend from elbows
      expect(leftWrist.y).toBeGreaterThan(leftElbow.y);
      expect(rightWrist.y).toBeGreaterThan(rightElbow.y);

      // Forearm length should be reasonable
      const leftForearmLength = Math.sqrt(
        Math.pow(leftWrist.x - leftElbow.x, 2) + Math.pow(leftWrist.y - leftElbow.y, 2)
      );
      const rightForearmLength = Math.sqrt(
        Math.pow(rightWrist.x - rightElbow.x, 2) + Math.pow(rightWrist.y - rightElbow.y, 2)
      );

      expect(leftForearmLength).toBeGreaterThan(25);
      expect(leftForearmLength).toBeLessThan(120);
      expect(rightForearmLength).toBeGreaterThan(25);
      expect(rightForearmLength).toBeLessThan(120);
    });

    it('should maintain arm proportion consistency', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 280, y: 150, score: 0.9, name: 'left_shoulder' },
          { x: 360, y: 150, score: 0.9, name: 'right_shoulder' },
          { x: 250, y: 200, score: 0.85, name: 'left_elbow' },
          { x: 390, y: 200, score: 0.85, name: 'right_elbow' },
          { x: 230, y: 250, score: 0.8, name: 'left_wrist' },
          { x: 410, y: 250, score: 0.8, name: 'right_wrist' }
        ],
        score: 0.85
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      const proportions = poseValidationService.validateBodyProportions(results[0]);
      
      expect(proportions.isValid).toBe(true);
      expect(proportions.armSymmetry).toBeGreaterThan(0.8); // Arms should be reasonably symmetric
      expect(proportions.upperArmToForearmRatio).toBeCloseTo(1.0, 0.3); // Realistic proportion
    });
  });

  describe('Lower Body Keypoints', () => {
    it('should detect hip keypoints as lower body foundation', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 290, y: 300, score: 0.88, name: 'left_hip' },
          { x: 350, y: 300, score: 0.88, name: 'right_hip' },
          { x: 280, y: 150, score: 0.9, name: 'left_shoulder' },
          { x: 360, y: 150, score: 0.9, name: 'right_shoulder' }
        ],
        score: 0.89
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      const leftHip = pose.keypoints.find(kp => kp.name === 'left_hip')!;
      const rightHip = pose.keypoints.find(kp => kp.name === 'right_hip')!;
      const leftShoulder = pose.keypoints.find(kp => kp.name === 'left_shoulder')!;
      const rightShoulder = pose.keypoints.find(kp => kp.name === 'right_shoulder')!;

      // Hips should be below shoulders
      expect(leftHip.y).toBeGreaterThan(leftShoulder.y);
      expect(rightHip.y).toBeGreaterThan(rightShoulder.y);

      // Hips should be roughly aligned horizontally
      expect(Math.abs(leftHip.y - rightHip.y)).toBeLessThan(15);

      // Hip width should be reasonable
      const hipDistance = Math.abs(rightHip.x - leftHip.x);
      expect(hipDistance).toBeGreaterThan(30);
      expect(hipDistance).toBeLessThan(120);
    });

    it('should detect knee keypoints with proper leg structure', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 290, y: 300, score: 0.88, name: 'left_hip' },
          { x: 350, y: 300, score: 0.88, name: 'right_hip' },
          { x: 285, y: 400, score: 0.82, name: 'left_knee' },
          { x: 355, y: 400, score: 0.82, name: 'right_knee' }
        ],
        score: 0.85
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      const leftHip = pose.keypoints.find(kp => kp.name === 'left_hip')!;
      const rightHip = pose.keypoints.find(kp => kp.name === 'right_hip')!;
      const leftKnee = pose.keypoints.find(kp => kp.name === 'left_knee')!;
      const rightKnee = pose.keypoints.find(kp => kp.name === 'right_knee')!;

      // Knees should be below hips
      expect(leftKnee.y).toBeGreaterThan(leftHip.y);
      expect(rightKnee.y).toBeGreaterThan(rightHip.y);

      // Thigh length should be reasonable
      const leftThighLength = Math.sqrt(
        Math.pow(leftKnee.x - leftHip.x, 2) + Math.pow(leftKnee.y - leftHip.y, 2)
      );
      const rightThighLength = Math.sqrt(
        Math.pow(rightKnee.x - rightHip.x, 2) + Math.pow(rightKnee.y - rightHip.y, 2)
      );

      expect(leftThighLength).toBeGreaterThan(50);
      expect(leftThighLength).toBeLessThan(200);
      expect(rightThighLength).toBeGreaterThan(50);
      expect(rightThighLength).toBeLessThan(200);
    });

    it('should detect ankle keypoints completing leg structure', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 290, y: 300, score: 0.88, name: 'left_hip' },
          { x: 350, y: 300, score: 0.88, name: 'right_hip' },
          { x: 285, y: 400, score: 0.82, name: 'left_knee' },
          { x: 355, y: 400, score: 0.82, name: 'right_knee' },
          { x: 280, y: 500, score: 0.78, name: 'left_ankle' },
          { x: 360, y: 500, score: 0.78, name: 'right_ankle' }
        ],
        score: 0.83
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      const leftKnee = pose.keypoints.find(kp => kp.name === 'left_knee')!;
      const rightKnee = pose.keypoints.find(kp => kp.name === 'right_knee')!;
      const leftAnkle = pose.keypoints.find(kp => kp.name === 'left_ankle')!;
      const rightAnkle = pose.keypoints.find(kp => kp.name === 'right_ankle')!;

      // Ankles should be below knees
      expect(leftAnkle.y).toBeGreaterThan(leftKnee.y);
      expect(rightAnkle.y).toBeGreaterThan(rightKnee.y);

      // Shin length should be reasonable
      const leftShinLength = Math.sqrt(
        Math.pow(leftAnkle.x - leftKnee.x, 2) + Math.pow(leftAnkle.y - leftKnee.y, 2)
      );
      const rightShinLength = Math.sqrt(
        Math.pow(rightAnkle.x - rightKnee.x, 2) + Math.pow(rightAnkle.y - rightKnee.y, 2)
      );

      expect(leftShinLength).toBeGreaterThan(40);
      expect(leftShinLength).toBeLessThan(180);
      expect(rightShinLength).toBeGreaterThan(40);
      expect(rightShinLength).toBeLessThan(180);
    });

    it('should validate complete leg chain connectivity', async () => {
      const fullPose = [{
        keypoints: [
          // Complete pose for validation
          { x: 290, y: 300, score: 0.88, name: 'left_hip' },
          { x: 350, y: 300, score: 0.88, name: 'right_hip' },
          { x: 285, y: 400, score: 0.82, name: 'left_knee' },
          { x: 355, y: 400, score: 0.82, name: 'right_knee' },
          { x: 280, y: 500, score: 0.78, name: 'left_ankle' },
          { x: 360, y: 500, score: 0.78, name: 'right_ankle' }
        ],
        score: 0.83
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(fullPose);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      const legConnectivity = poseValidationService.validateLegConnectivity(results[0]);
      
      expect(legConnectivity.leftLegComplete).toBe(true);
      expect(legConnectivity.rightLegComplete).toBe(true);
      expect(legConnectivity.legSymmetry).toBeGreaterThan(0.8);
    });
  });

  describe('Keypoint Confidence and Quality', () => {
    it('should maintain minimum confidence thresholds for reliable detection', async () => {
      const mockPoses = [{
        keypoints: REQUIRED_KEYPOINTS.map((name, index) => ({
          x: 100 + (index * 10),
          y: 100 + (index * 15),
          score: 0.75 + (Math.random() * 0.2), // Random confidence between 0.75-0.95
          name
        })),
        score: 0.82
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      // All keypoints should meet minimum confidence threshold
      pose.keypoints.forEach(keypoint => {
        expect(keypoint.score).toBeGreaterThan(config.validation.minKeypointConfidence);
      });

      // Overall pose confidence should be acceptable
      expect(pose.confidence).toBeGreaterThan(config.validation.minPoseConfidence);
    });

    it('should detect all required keypoints for complete pose', async () => {
      const mockPoses = [{
        keypoints: REQUIRED_KEYPOINTS.map((name, index) => ({
          x: 320 + (Math.random() - 0.5) * 200, // Random positions around center
          y: 100 + (index * 25),
          score: 0.8 + (Math.random() * 0.15),
          name
        })),
        score: 0.85
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      const pose = results[0];

      // Should detect all required keypoints
      expect(pose.keypoints).toHaveLength(REQUIRED_KEYPOINTS.length);

      // Each required keypoint should be present
      REQUIRED_KEYPOINTS.forEach(requiredName => {
        const keypoint = pose.keypoints.find(kp => kp.name === requiredName);
        expect(keypoint).toBeDefined();
        expect(keypoint!.score).toBeGreaterThan(0.5);
      });
    });

    it('should handle missing keypoints gracefully', async () => {
      // Pose with some missing keypoints (common in real scenarios)
      const partialKeypoints = REQUIRED_KEYPOINTS.slice(0, 12); // Only first 12 keypoints
      
      const mockPoses = [{
        keypoints: partialKeypoints.map((name, index) => ({
          x: 320 + (Math.random() - 0.5) * 100,
          y: 100 + (index * 30),
          score: 0.8,
          name
        })),
        score: 0.75
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      // Should still detect the pose
      expect(results).toHaveLength(1);
      
      const validation = poseValidationService.validatePose(results[0]);
      expect(validation.isValid).toBe(true);
      expect(validation.warnings).toContain('Missing keypoints detected');
      expect(validation.missingKeypoints).toHaveLength(REQUIRED_KEYPOINTS.length - partialKeypoints.length);
    });

    it('should provide keypoint-specific confidence analysis', async () => {
      const mockPoses = [{
        keypoints: [
          { x: 320, y: 100, score: 0.95, name: 'nose' }, // High confidence
          { x: 310, y: 90, score: 0.85, name: 'left_eye' }, // Good confidence
          { x: 330, y: 90, score: 0.45, name: 'right_eye' }, // Low confidence
          { x: 280, y: 150, score: 0.9, name: 'left_shoulder' }, // High confidence
          { x: 360, y: 150, score: 0.3, name: 'right_shoulder' } // Very low confidence
        ],
        score: 0.72
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(mockPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      const confidenceAnalysis = poseValidationService.analyzeKeypointConfidence(results[0]);
      
      expect(confidenceAnalysis.highConfidenceKeypoints).toHaveLength(2); // nose, left_shoulder
      expect(confidenceAnalysis.lowConfidenceKeypoints).toHaveLength(2); // right_eye, right_shoulder
      expect(confidenceAnalysis.averageConfidence).toBeCloseTo(0.7, 0.1);
      expect(confidenceAnalysis.confidenceVariance).toBeGreaterThan(0.05); // High variance due to mixed confidence
    });
  });

  describe('Anatomical Consistency Validation', () => {
    it('should validate anatomically correct keypoint relationships', async () => {
      const anatomicallyCorrectPose = [{
        keypoints: [
          // Head
          { x: 320, y: 80, score: 0.95, name: 'nose' },
          { x: 310, y: 70, score: 0.9, name: 'left_eye' },
          { x: 330, y: 70, score: 0.9, name: 'right_eye' },
          
          // Upper body
          { x: 290, y: 140, score: 0.9, name: 'left_shoulder' },
          { x: 350, y: 140, score: 0.9, name: 'right_shoulder' },
          { x: 270, y: 190, score: 0.85, name: 'left_elbow' },
          { x: 370, y: 190, score: 0.85, name: 'right_elbow' },
          { x: 260, y: 240, score: 0.8, name: 'left_wrist' },
          { x: 380, y: 240, score: 0.8, name: 'right_wrist' },
          
          // Lower body
          { x: 300, y: 280, score: 0.88, name: 'left_hip' },
          { x: 340, y: 280, score: 0.88, name: 'right_hip' },
          { x: 295, y: 380, score: 0.82, name: 'left_knee' },
          { x: 345, y: 380, score: 0.82, name: 'right_knee' },
          { x: 290, y: 480, score: 0.78, name: 'left_ankle' },
          { x: 350, y: 480, score: 0.78, name: 'right_ankle' }
        ],
        score: 0.86
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(anatomicallyCorrectPose);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      const anatomicalValidation = poseValidationService.validateAnatomicalConsistency(results[0]);
      
      expect(anatomicalValidation.isAnatomicallyValid).toBe(true);
      expect(anatomicalValidation.symmetryScore).toBeGreaterThan(0.8);
      expect(anatomicalValidation.proportionScore).toBeGreaterThan(0.8);
      expect(anatomicalValidation.connectivityScore).toBeGreaterThan(0.9);
    });

    it('should detect anatomically impossible poses', async () => {
      const impossiblePose = [{
        keypoints: [
          { x: 320, y: 80, score: 0.95, name: 'nose' },
          { x: 290, y: 140, score: 0.9, name: 'left_shoulder' },
          { x: 350, y: 140, score: 0.9, name: 'right_shoulder' },
          { x: 270, y: 100, score: 0.85, name: 'left_elbow' }, // Elbow above shoulder - impossible
          { x: 370, y: 100, score: 0.85, name: 'right_elbow' }, // Elbow above shoulder - impossible
          { x: 300, y: 280, score: 0.88, name: 'left_hip' },
          { x: 340, y: 280, score: 0.88, name: 'right_hip' }
        ],
        score: 0.86
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(impossiblePose);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      const anatomicalValidation = poseValidationService.validateAnatomicalConsistency(results[0]);
      
      expect(anatomicalValidation.isAnatomicallyValid).toBe(false);
      expect(anatomicalValidation.errors).toContain('Impossible joint configuration detected');
      expect(anatomicalValidation.connectivityScore).toBeLessThan(0.6);
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle extremely low confidence poses', async () => {
      const lowConfidencePose = [{
        keypoints: REQUIRED_KEYPOINTS.map((name, index) => ({
          x: 100 + (index * 10),
          y: 100 + (index * 15),
          score: 0.1 + (Math.random() * 0.2), // Very low confidence
          name
        })),
        score: 0.15
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(lowConfidencePose);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      // Should filter out low confidence poses
      expect(results).toHaveLength(0);
    });

    it('should handle poses with invalid coordinates', async () => {
      const invalidPose = [{
        keypoints: [
          { x: NaN, y: 100, score: 0.9, name: 'nose' },
          { x: 320, y: Infinity, score: 0.9, name: 'left_shoulder' },
          { x: -1000, y: 150, score: 0.9, name: 'right_shoulder' }
        ],
        score: 0.8
      }];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(invalidPose);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      // Should filter out poses with invalid coordinates
      expect(results).toHaveLength(0);
    });

    it('should handle multiple person detection scenarios', async () => {
      const multiPersonPoses = [
        {
          keypoints: [
            { x: 200, y: 100, score: 0.9, name: 'nose' },
            { x: 180, y: 150, score: 0.85, name: 'left_shoulder' },
            { x: 220, y: 150, score: 0.85, name: 'right_shoulder' }
          ],
          score: 0.87
        },
        {
          keypoints: [
            { x: 450, y: 120, score: 0.88, name: 'nose' },
            { x: 430, y: 170, score: 0.82, name: 'left_shoulder' },
            { x: 470, y: 170, score: 0.82, name: 'right_shoulder' }
          ],
          score: 0.84
        }
      ];

      const { createDetector } = await import('@tensorflow-models/pose-detection');
      const mockDetector = await createDetector();
      vi.mocked(mockDetector.estimatePoses).mockResolvedValueOnce(multiPersonPoses);

      const results = await poseDetectionService.detectPoses(mockVideo);
      
      expect(results).toHaveLength(2);
      
      // Each pose should have unique ID
      expect(results[0].id).not.toBe(results[1].id);
      
      // Both poses should be valid
      results.forEach(pose => {
        const validation = poseValidationService.validatePose(pose);
        expect(validation.isValid).toBe(true);
      });
    });
  });
});