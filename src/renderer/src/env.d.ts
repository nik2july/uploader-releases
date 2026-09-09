/// <reference types="vite/client" />

// `window.api` is declared once, by the preload bundle's own contract
// (src/preload/index.d.ts). Redeclaring it here is how the two drifted apart:
// the renderer typechecked against a shape the preload had long stopped exposing.
