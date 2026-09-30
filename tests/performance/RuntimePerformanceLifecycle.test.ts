import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimePerformanceManager } from '../../src/performance/RuntimePerformanceManager';
import { MemoryManager } from '../../src/memory/MemoryManager';

function createCanvas(): HTMLCanvasElement {
  const context = {
    clearRect: vi.fn(),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    imageSmoothingEnabled: false,
    lineCap: 'round',
    lineJoin: 'round',
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left'
  } as unknown as CanvasRenderingContext2D;

  return {
    width: 640,
    height: 480,
    getContext: vi.fn((contextType: string) => contextType === '2d' ? context : null)
  } as unknown as HTMLCanvasElement;
}

function createFrame(timestamp: number): {
  data: ImageData;
  timestamp: number;
  width: number;
  height: number;
} {
  return {
    data: new ImageData(2, 2),
    timestamp,
    width: 2,
    height: 2
  };
}

describe('runtime performance lifecycle', () => {
  let now = 0;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).jest = vi;
    now = 0;
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('records the active camera flow near the configured 30 FPS target', () => {
    const manager = new RuntimePerformanceManager(createCanvas(), {
      targetFPS: 30,
      enableGPUAcceleration: false
    });

    manager.start();
    for (let index = 0; index < 30; index += 1) {
      now += 1000 / 30;
      manager.renderFrame(createFrame(index), null, {}, false);
    }

    const metrics = manager.getMetrics();
    expect(metrics.frameRate).toBeGreaterThan(28);
    expect(metrics.frameRate).toBeLessThan(32);
    expect(metrics.qualityProfile).toBeTruthy();

    manager.dispose();
  });

  it('stops monitoring and rendering resources when a session ends', () => {
    const manager = new RuntimePerformanceManager(createCanvas(), {
      enableGPUAcceleration: false
    });

    manager.start();
    manager.stop();
    expect(() => manager.dispose()).not.toThrow();
    expect(() => manager.dispose()).not.toThrow();
  });

  it('does not retain memory monitoring intervals across a long session', () => {
    vi.useFakeTimers();
    const memoryManager = new MemoryManager();
    const observer = vi.fn();
    memoryManager.subscribe(observer);

    memoryManager.startMonitoring();
    vi.advanceTimersByTime(5000);
    expect(observer).toHaveBeenCalledTimes(5);

    memoryManager.stopMonitoring();
    const callsAfterStop = observer.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(observer).toHaveBeenCalledTimes(callsAfterStop);

    memoryManager.dispose();
  });

});
