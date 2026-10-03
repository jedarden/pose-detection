import { describe, expect, it } from 'vitest';
import { calculateAcceleration, calculateVelocity } from '../../../src/utils/distance';

describe('motion velocity and acceleration', () => {
  it('converts displacement to metres per second', () => {
    expect(calculateVelocity({ x: 0, y: 0 }, { x: 100, y: 50 }, 2)).toEqual({
      x: 0.5,
      y: 0.25
    });
  });

  it('returns zero velocity for a non-positive time delta', () => {
    expect(calculateVelocity({ x: 0, y: 0 }, { x: 100, y: 50 }, 0)).toEqual({ x: 0, y: 0 });
    expect(calculateVelocity({ x: 0, y: 0 }, { x: 100, y: 50 }, -1)).toEqual({ x: 0, y: 0 });
  });

  it('calculates acceleration from two velocity vectors', () => {
    expect(calculateAcceleration({ x: 1, y: 2 }, { x: 3, y: 8 }, 2)).toEqual({
      x: 1,
      y: 3
    });
  });

  it('returns zero acceleration for a non-positive time delta', () => {
    expect(calculateAcceleration({ x: 1, y: 2 }, { x: 3, y: 8 }, 0)).toEqual({ x: 0, y: 0 });
  });
});
