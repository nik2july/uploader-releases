import { clipsApi } from './index';

declare global {
  interface Window {
    clipsApi: typeof clipsApi;
  }
}
