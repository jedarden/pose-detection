import { act, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { Pose } from '@tensorflow-models/pose-detection';
import App from '../src/App';

type MockCoordinator = {
  emit: (event: string, payload?: unknown) => void;
};

type MockVisualization = {
  updateAnalysisParameters: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  coordinator: null as MockCoordinator | null,
  visualization: null as MockVisualization | null
}));

vi.mock('../src/services/ApplicationCoordinator', () => ({
  ApplicationCoordinator: class {
    private listeners = new Map<string, (...args: any[]) => void>();
    public readonly gaitService = { reset: vi.fn() };

    constructor() {
      mocks.coordinator = this as unknown as MockCoordinator;
    }

    getService<T>(name: string): T | undefined {
      return name === 'gaitAnalysis' ? this.gaitService as T : undefined;
    }

    on(event: string, listener: (...args: any[]) => void): void {
      this.listeners.set(event, listener);
    }

    emit(event: string, payload?: unknown): void {
      this.listeners.get(event)?.(payload);
    }

    async initialize(): Promise<void> {}
    async shutdown(): Promise<void> {}
    async start(): Promise<void> {}
    async stop(): Promise<void> {}
    removeAllListeners(): void {
      this.listeners.clear();
    }
  }
}));

vi.mock('../src/components/GaitVisualizationSystem', () => ({
  GaitVisualizationSystem: class {
    public readonly renderPose = vi.fn();
    public readonly updateAnalysisParameters = vi.fn();
    public readonly dispose = vi.fn();

    constructor() {
      mocks.visualization = this as unknown as MockVisualization;
    }
  }
}));

vi.mock('../src/services/LoggingService', () => ({
  LoggingService: class {
    initialize = vi.fn().mockResolvedValue(undefined);
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  }
}));

vi.mock('../src/performance/RuntimePerformanceManager', () => ({
  RuntimePerformanceManager: class {
    subscribe = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
    renderFrame = vi.fn();
  }
}));

vi.mock('../src/components/CameraSelector', () => ({
  CameraSelector: () => <div data-testid="camera-selector" />
}));

vi.mock('../src/components/ControlPanel', () => ({
  ControlPanel: () => <div data-testid="control-panel" />
}));

vi.mock('../src/components/PerformanceMonitor', () => ({
  PerformanceMonitor: () => <div data-testid="performance-monitor" />
}));

const createPose = (offset = 0): Pose => ({
  score: 0.92,
  keypoints: Array.from({ length: 17 }, (_, index) => ({
    x: index * 10 + offset,
    y: index * 5,
    score: 0.9,
    name: `keypoint-${index}`
  }))
});

const createGaitParameters = (cadence: number, velocity: number) => ({
  cadence,
  strideLength: 1.3,
  strideTime: 1.1,
  stepWidth: 0.14,
  velocity,
  symmetryIndex: 96,
  confidence: 0.88,
  leftStepLength: 0.64,
  rightStepLength: 0.66,
  gaitPhase: {
    left: 'mid-stance' as const,
    right: 'mid-swing' as const,
    leftProgress: 0.5,
    rightProgress: 0.6,
    confidence: 0.84
  },
  stanceTime: 0.7,
  swingTime: 0.4,
  doubleSupport: 20
});

describe('production App analysis integration', () => {
  beforeEach(() => {
    mocks.coordinator = null;
    mocks.visualization = null;
  });

  it('renders and updates coordinator gait output and computed motion metrics', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('camera-status').textContent).toContain('Ready');
    });

    const coordinator = mocks.coordinator;
    expect(coordinator).not.toBeNull();

    act(() => {
      coordinator!.emit('poseDetected', { pose: createPose(), timestamp: 1000 });
      coordinator!.emit('gaitParametersUpdated', createGaitParameters(112, 1.45));
    });

    expect(screen.getByTestId('gait-cadence-value').textContent).toContain('112.0 steps/min');
    expect(screen.getByTestId('gait-velocity-value').textContent).toContain('1.45 m/s');
    expect(screen.getByTestId('motion-visible-keypoints-value').textContent).toContain('17/17');
    expect(screen.getByTestId('motion-intensity-value').textContent).toContain('0.0%');

    act(() => {
      coordinator!.emit('poseDetected', { pose: createPose(25), timestamp: 2500 });
      coordinator!.emit('gaitParametersUpdated', createGaitParameters(118, 1.62));
    });

    expect(screen.getByTestId('gait-cadence-value').textContent).toContain('118.0 steps/min');
    expect(screen.getByTestId('gait-velocity-value').textContent).toContain('1.62 m/s');
    expect(screen.getByTestId('motion-intensity-value').textContent).toContain('50.0%');
    expect(screen.getByTestId('motion-pose-duration-value').textContent).toContain('1.50 s');
    expect(mocks.visualization?.updateAnalysisParameters).toHaveBeenCalled();
  });
});
