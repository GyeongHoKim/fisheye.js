import { css } from "lit";

export const fisheyeDemoStyles = css`
  :host {
    display: block;
    font-family: system-ui, -apple-system, sans-serif;
    color: #e0e0e0;
    background: #1a1a2e;
    min-height: 100vh;
  }

  .container {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  header {
    padding: 1rem 2rem;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
  }

  header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    background: linear-gradient(90deg, #00d9ff, #00ff88);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  header p {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: #8892b0;
  }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .controls {
    width: 320px;
    padding: 1.5rem;
    background: #16213e;
    overflow-y: auto;
    border-right: 1px solid #0f3460;
  }

  .control-group {
    margin-bottom: 1.5rem;
  }

  .control-group h3 {
    margin: 0 0 0.75rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #00d9ff;
  }

  .control-item {
    margin-bottom: 1rem;
  }

  .control-item label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    color: #a0a0a0;
  }

  .control-item label span {
    font-family: monospace;
    color: #00ff88;
  }

  input[type="range"] {
    width: 100%;
    height: 6px;
    background: #0f3460;
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: #00d9ff;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }

  input[type="range"]::-webkit-slider-thumb:hover {
    background: #00ff88;
  }

  input[type="number"] {
    width: 100%;
    padding: 0.5rem;
    background: #0f3460;
    border: 1px solid #1a3a5c;
    border-radius: 4px;
    color: #e0e0e0;
    font-family: monospace;
    font-size: 0.875rem;
  }

  input[type="number"]:focus {
    outline: none;
    border-color: #00d9ff;
  }

  .file-input-wrapper {
    position: relative;
  }

  .file-input-wrapper input[type="file"] {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

  .file-input-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: linear-gradient(135deg, #0f3460, #16213e);
    border: 2px dashed #0f3460;
    border-radius: 8px;
    color: #8892b0;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .file-input-wrapper:hover .file-input-label {
    border-color: #00d9ff;
    color: #00d9ff;
  }

  .canvas-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    gap: 1rem;
    overflow: auto;
  }

  .canvas-container {
    display: flex;
    gap: 2rem;
    align-items: flex-start;
  }

  .canvas-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .canvas-wrapper h4 {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8892b0;
  }

  canvas {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  #input-canvas {
    max-width: 400px;
    background: #0a0a14;
  }

  #output-canvas {
    max-width: 600px;
    background: #0a0a14;
  }

  .error {
    padding: 1rem;
    background: rgba(255, 82, 82, 0.1);
    border: 1px solid #ff5252;
    border-radius: 8px;
    color: #ff5252;
    font-size: 0.875rem;
  }

  .processing {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #00d9ff;
    font-size: 0.875rem;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #0f3460;
    border-top-color: #00d9ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .btn {
    width: 100%;
    padding: 0.75rem 1rem;
    background: linear-gradient(135deg, #00d9ff, #00ff88);
    border: none;
    border-radius: 8px;
    color: #1a1a2e;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn:hover {
    opacity: 0.9;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #0f3460;
    color: #e0e0e0;
  }

  /* Tablet and mobile: stack layout */
  @media (max-width: 900px) {
    .main {
      flex-direction: column;
    }

    .controls {
      width: 100%;
      max-height: none;
      border-right: none;
      border-bottom: 1px solid #0f3460;
      overflow: visible;
    }

    .controls.collapsed {
      padding: 0;
    }

    .controls.collapsed .controls-content {
      display: none;
    }

    .canvas-container {
      flex-direction: column;
      align-items: center;
    }
  }

  /* Mobile toggle button */
  .controls-toggle {
    display: none;
    width: 100%;
    padding: 1rem;
    background: #16213e;
    border: none;
    border-bottom: 1px solid #0f3460;
    color: #e0e0e0;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    align-items: center;
    justify-content: space-between;
  }

  .controls-toggle .toggle-icon {
    transition: transform 0.3s ease;
  }

  .controls-toggle .toggle-icon.expanded {
    transform: rotate(180deg);
  }

  .controls-content {
    padding: 1.5rem;
  }

  @media (max-width: 900px) {
    .controls-toggle {
      display: flex;
    }

    .controls {
      padding: 0;
    }

    .controls-content {
      padding: 1rem;
    }
  }

  /* Small mobile screens */
  @media (max-width: 600px) {
    header {
      padding: 0.75rem 1rem;
    }

    header h1 {
      font-size: 1.25rem;
    }

    header p {
      font-size: 0.75rem;
    }

    .controls-content {
      padding: 1rem;
    }

    .control-group {
      margin-bottom: 1rem;
    }

    .control-group h3 {
      font-size: 0.7rem;
      margin-bottom: 0.5rem;
    }

    .control-item {
      margin-bottom: 0.75rem;
    }

    .control-item label {
      font-size: 0.8rem;
    }

    /* Larger touch targets for sliders */
    input[type="range"] {
      height: 8px;
      padding: 8px 0;
    }

    input[type="range"]::-webkit-slider-thumb {
      width: 24px;
      height: 24px;
    }

    .file-input-label {
      padding: 1rem;
      font-size: 1rem;
    }

    .btn {
      padding: 1rem;
      font-size: 1rem;
    }

    .canvas-area {
      padding: 1rem;
      gap: 0.75rem;
    }

    .canvas-container {
      gap: 1rem;
      width: 100%;
    }

    .canvas-wrapper {
      width: 100%;
    }

    .canvas-wrapper h4 {
      font-size: 0.7rem;
    }

    #input-canvas,
    #output-canvas {
      max-width: 100%;
      width: 100%;
    }

    #input-canvas {
      max-width: 100%;
    }

    #output-canvas {
      max-width: 100%;
    }
  }

  /* Very small screens */
  @media (max-width: 400px) {
    header h1 {
      font-size: 1.1rem;
    }

    .control-item label {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }

    .control-item label span {
      font-size: 0.75rem;
    }
  }

  /* Landscape mobile optimization */
  @media (max-height: 500px) and (orientation: landscape) {
    .container {
      height: auto;
      min-height: 100vh;
    }

    header {
      padding: 0.5rem 1rem;
    }

    header h1 {
      font-size: 1rem;
    }

    header p {
      display: none;
    }

    .main {
      flex-direction: row;
    }

    .controls {
      width: 280px;
      max-height: calc(100vh - 50px);
      overflow-y: auto;
    }

    .controls-toggle {
      display: none;
    }

    .controls-content {
      display: block !important;
      padding: 0.75rem;
    }

    .control-group {
      margin-bottom: 0.75rem;
    }

    .control-item {
      margin-bottom: 0.5rem;
    }

    .canvas-area {
      padding: 0.5rem;
    }

    .canvas-container {
      flex-direction: row;
      gap: 0.5rem;
    }
  }
`;
