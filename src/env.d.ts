/// <reference types="vite/client" />

/**
 * We only ever ask WebGPU two things: does it exist, and will it give us an
 * adapter. Pulling in the full @webgpu/types package for that would add a
 * dependency and a lot of surface we never touch.
 */
interface GPUAdapterLike {
  readonly __brand?: 'GPUAdapter';
}

interface GPULike {
  requestAdapter(): Promise<GPUAdapterLike | null>;
}

interface Navigator {
  readonly gpu?: GPULike;
}
