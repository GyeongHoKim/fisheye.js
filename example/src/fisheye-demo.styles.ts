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

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .sidebar-container {
    display: flex;
    flex-shrink: 0;
    background: #16213e;
    border-right: 1px solid #0f3460;
  }

  .sidebar-form {
    width: 320px;
    padding: 1.5rem;
    overflow-y: auto;
    overflow-x: hidden;
    transition: width 0.25s ease, padding 0.25s ease, opacity 0.2s ease;
  }

  .sidebar-form.closed {
    width: 0;
    padding: 0;
    min-width: 0;
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .sidebar-form .control-group {
    margin-bottom: 1.5rem;
  }

  .sidebar-form .control-group h3 {
    margin: 0 0 0.75rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #00d9ff;
  }

  .sidebar-form .control-hint {
    margin: 0 0 0.5rem;
    font-size: 0.7rem;
    color: #666;
    line-height: 1.3;
  }

  .sidebar-form .control-item {
    margin-bottom: 1rem;
  }

  .sidebar-form .control-item label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    color: #a0a0a0;
  }

  .sidebar-form .control-item label span {
    font-family: monospace;
    color: #00ff88;
  }

  .sidebar-form input[type="range"] {
    width: 100%;
    height: 6px;
    background: #0f3460;
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
  }

  .sidebar-form input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: #00d9ff;
    border-radius: 50%;
    cursor: pointer;
  }

  .sidebar-form .sample-thumbnails {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .sidebar-form .sample-thumb {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem;
    background: #0f3460;
    border: 2px solid #1a3a5c;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sidebar-form .sample-thumb:hover {
    border-color: #00d9ff;
    background: #1a3a5c;
  }

  .sidebar-form .sample-thumb.active {
    border-color: #00d9ff;
    background: rgba(0, 217, 255, 0.15);
  }

  .sidebar-form .sample-thumb img {
    width: 100%;
    aspect-ratio: 4/3;
    object-fit: cover;
    border-radius: 4px;
  }

  .sidebar-form .sample-thumb span {
    font-size: 0.65rem;
    color: #8892b0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .sidebar-form .sample-thumb.active span {
    color: #00d9ff;
  }

  .sidebar-form .file-input-wrapper {
    position: relative;
  }

  .sidebar-form .file-input-wrapper input[type="file"] {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

  .sidebar-form .file-input-label {
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

  .sidebar-form .file-input-wrapper:hover .file-input-label {
    border-color: #00d9ff;
    color: #00d9ff;
  }

  .sidebar-form .preset-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .sidebar-form .preset-btn {
    padding: 0.5rem 0.75rem;
    background: #0f3460;
    border: 1px solid #1a3a5c;
    border-radius: 6px;
    color: #a0a0a0;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sidebar-form .preset-btn:hover {
    border-color: #00d9ff;
    color: #00d9ff;
  }

  .sidebar-form .preset-btn.active {
    background: #00d9ff;
    border-color: #00d9ff;
    color: #1a1a2e;
  }

  .sidebar-form .btn {
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

  .sidebar-form .btn-secondary {
    background: #0f3460;
    color: #e0e0e0;
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

  /* Tablet and mobile: stack layout */
  @media (max-width: 900px) {
    .main {
      flex-direction: column;
    }

    .sidebar-container {
      flex-direction: column;
      border-right: none;
      border-bottom: 1px solid #0f3460;
      max-height: 50vh;
      overflow: hidden;
    }

    .sidebar-form.closed {
      max-height: 0;
    }

    .canvas-container {
      flex-direction: column;
      align-items: center;
    }
  }

  /* Small mobile screens */
  @media (max-width: 600px) {
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

  @media (max-width: 400px) {
    .sidebar-form .control-item label {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }

    .sidebar-form .control-item label span {
      font-size: 0.75rem;
    }
  }

  /* Landscape mobile optimization */
  @media (max-height: 500px) and (orientation: landscape) {
    .container {
      height: auto;
      min-height: 100vh;
    }

    .main {
      flex-direction: row;
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
