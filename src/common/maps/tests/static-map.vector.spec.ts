import { jest } from '@jest/globals';

const { calculateVectorRenderZoom } = await import('../static-map.vector');
const { STATIC_MAP_VECTOR_RENDER_RATIO } = await import('../static-map.constants');

describe('Runich vector static map', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compensates the camera zoom for the native render ratio', () => {
    expect(calculateVectorRenderZoom(15.25)).toBeCloseTo(15.25 - Math.log2(STATIC_MAP_VECTOR_RENDER_RATIO));
  });
});
