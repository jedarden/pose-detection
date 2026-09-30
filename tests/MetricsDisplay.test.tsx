import { render, screen } from '@testing-library/react';
import { GaitParameters } from '../src/services/GaitAnalysisService';
import MetricsDisplay, { MotionMetrics } from '../src/components/MetricsDisplay';

const gaitParameters: GaitParameters = {
  cadence: 112.5,
  strideLength: 1.24,
  strideTime: 1.08,
  stepWidth: 0.14,
  velocity: 1.52,
  symmetryIndex: 94.2,
  confidence: 0.86,
  leftStepLength: 0.62,
  rightStepLength: 0.64,
  gaitPhase: {
    left: 'mid-stance',
    right: 'mid-swing',
    leftProgress: 0.45,
    rightProgress: 0.7,
    confidence: 0.8
  },
  stanceTime: 0.68,
  swingTime: 0.4,
  doubleSupport: 20
};

const motionMetrics: MotionMetrics = {
  detectionConfidence: 0.91,
  keypointCount: 17,
  visibleKeypoints: 15,
  trackingQuality: 0.83,
  movementIntensity: 0.36,
  poseDuration: 3.25,
  averageKeypointConfidence: 0.88
};

describe('MetricsDisplay', () => {
  it('renders computed gait and motion metrics', () => {
    render(<MetricsDisplay gaitParameters={gaitParameters} motionMetrics={motionMetrics} />);

    expect(screen.getByTestId('gait-cadence-value').textContent).toContain('112.5 steps/min');
    expect(screen.getByTestId('gait-stride-length-value').textContent).toContain('1.24 m');
    expect(screen.getByTestId('gait-velocity-value').textContent).toContain('1.52 m/s');
    expect(screen.getByTestId('gait-symmetry-value').textContent).toContain('94.2%');
    expect(screen.getByTestId('gait-phase-left-value').textContent).toContain('mid-stance');
    expect(screen.getByTestId('motion-visible-keypoints-value').textContent).toContain('15/17');
    expect(screen.getByTestId('motion-intensity-value').textContent).toContain('36.0%');
    expect(screen.getByTestId('motion-pose-duration-value').textContent).toContain('3.25 s');
  });

  it('updates displayed values when analysis output changes', () => {
    const { rerender } = render(
      <MetricsDisplay gaitParameters={gaitParameters} motionMetrics={motionMetrics} />
    );

    const updatedGaitParameters = {
      ...gaitParameters,
      cadence: 126,
      velocity: 1.84,
      gaitPhase: { ...gaitParameters.gaitPhase, left: 'toe-off' as const }
    };
    const updatedMotionMetrics = {
      ...motionMetrics,
      visibleKeypoints: 17,
      movementIntensity: 0.72,
      poseDuration: 7.5
    };

    rerender(
      <MetricsDisplay
        gaitParameters={updatedGaitParameters}
        motionMetrics={updatedMotionMetrics}
      />
    );

    expect(screen.getByTestId('gait-cadence-value').textContent).toContain('126.0 steps/min');
    expect(screen.getByTestId('gait-velocity-value').textContent).toContain('1.84 m/s');
    expect(screen.getByTestId('gait-phase-left-value').textContent).toContain('toe-off');
    expect(screen.getByTestId('motion-visible-keypoints-value').textContent).toContain('17/17');
    expect(screen.getByTestId('motion-intensity-value').textContent).toContain('72.0%');
    expect(screen.getByTestId('motion-pose-duration-value').textContent).toContain('7.50 s');
  });
});
