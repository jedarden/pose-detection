import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pose } from '@tensorflow-models/pose-detection';
import { GaitAnalysisService } from '../../../src/services/GaitAnalysisService';

const keypointNames = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
];

const makePose = (leftY: number, rightY: number, frame: number): Pose => ({
  score: 0.9,
  keypoints: keypointNames.map((name, index) => {
    const isRight = name.startsWith('right');
    const isAnkle = index === 15 || index === 16;
    const isKnee = index === 13 || index === 14;

    return {
      name,
      x: isAnkle ? 100 + frame * 10 + (isRight ? 20 : 0) : 50 + (isRight ? 20 : -20),
      y: isAnkle ? (isRight ? rightY : leftY) : isKnee ? 130 : 40,
      score: 0.9
    };
  })
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GaitAnalysisService metrics', () => {
  it('returns empty metrics until a complete analysis window is available', () => {
    const service = new GaitAnalysisService();

    service.addPose(makePose(100, 120, 0), 1000);

    expect(service.calculateGaitParameters()).toMatchObject({
      cadence: 0,
      strideLength: 0,
      velocity: 0,
      confidence: 0,
      gaitPhase: { left: 'mid-stance', right: 'mid-stance' }
    });
  });

  it('derives step width from calibrated ankle separation', () => {
    const service = new GaitAnalysisService();
    service.calibrate({
      pixelsPerMeter: 100,
      referenceHeight: 1.7,
      cameraHeight: 1,
      cameraAngle: 0
    });

    for (let frame = 0; frame < 30; frame += 1) {
      service.addPose(makePose(100, 100, frame), 1000 + frame * 100);
    }

    expect(service.calculateGaitParameters().stepWidth).toBeCloseTo(0.2, 6);
    expect(service.isCalibrated()).toBe(true);
  });

  it('detects repeated foot events and calculates cadence, stride, velocity, and symmetry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const service = new GaitAnalysisService();

    service.calibrate({
      pixelsPerMeter: 100,
      referenceHeight: 1.7,
      cameraHeight: 1,
      cameraAngle: 0
    });

    // Each ten-frame cycle contains a downward ankle movement (heel strike)
    // followed by an upward movement (toe off). Both feet move together here
    // so the metric assertions stay deterministic.
    for (let frame = 0; frame < 40; frame += 1) {
      const phase = frame % 10;
      const ankleY = phase < 4 ? 100 : phase === 4 ? 200 : phase === 5 ? 50 : 100;
      service.addPose(makePose(ankleY, ankleY, frame), 100 + frame * 100);
    }

    const events = service.getRecentEvents(5000);
    const parameters = service.calculateGaitParameters();

    expect(events.filter((event) => event.type === 'heel-strike')).toHaveLength(8);
    expect(events.filter((event) => event.type === 'toe-off').length).toBeGreaterThanOrEqual(8);
    expect(parameters.cadence).toBeGreaterThan(0);
    expect(parameters.strideLength).toBeCloseTo(1, 6);
    expect(parameters.velocity).toBeGreaterThan(0);
    expect(parameters.symmetryIndex).toBeCloseTo(100, 6);
    expect(parameters.confidence).toBeGreaterThan(0);
    expect(parameters.gaitPhase.confidence).toBeGreaterThan(0);
  });

  it('clears pose and event history on reset', () => {
    const service = new GaitAnalysisService();
    service.addPose(makePose(100, 100, 0), Date.now());

    expect(service.getPoseHistory(5000)).toHaveLength(1);
    service.reset();

    expect(service.getPoseHistory(5000)).toEqual([]);
    expect(service.getRecentEvents()).toEqual([]);
    expect(service.calculateGaitParameters().confidence).toBe(0);
  });
});
