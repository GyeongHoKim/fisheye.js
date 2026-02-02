import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

const SIDEBAR_TOGGLE_WIDTH = 52;

@customElement("demo-sidebar")
export class DemoSidebar extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex-shrink: 0;
      width: ${SIDEBAR_TOGGLE_WIDTH}px;
    }

    .sidebar-toggle {
      width: 100%;
      min-height: 3rem;
      padding: 0 0.25rem;
      background: #0f3460;
      border: none;
      border-right: 1px solid #1a3a5c;
      color: #00d9ff;
      font-size: 0.8125rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      transition: background 0.15s, color 0.15s;
    }

    .sidebar-toggle:hover {
      background: #1a3a5c;
      color: #fff;
    }

    .sidebar-toggle .icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      transition: transform 0.25s ease;
    }

    .sidebar-toggle .label {
      line-height: 1.1;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .sidebar-toggle[aria-expanded="true"] .icon {
      transform: rotate(180deg);
    }

    @media (max-width: 900px) {
      :host {
        width: 100%;
      }

      .sidebar-toggle {
        flex-direction: row;
        width: 100%;
        height: ${SIDEBAR_TOGGLE_WIDTH}px;
        padding: 0 0.75rem;
        border-right: none;
        border-bottom: 1px solid #1a3a5c;
      }

      .sidebar-toggle .label {
        flex: 1;
        text-align: left;
      }

      .sidebar-toggle[aria-expanded="true"] .icon {
        transform: rotate(0deg);
      }

      .sidebar-toggle[aria-expanded="false"] .icon {
        transform: rotate(180deg);
      }
    }
  `;

  @property({ type: Boolean }) open = true;

  private toggle() {
    this.dispatchEvent(new CustomEvent("toggle", { bubbles: true, composed: true }));
  }

  private get toggleLabel(): string {
    return this.open ? "Close settings" : "Open settings";
  }

  render() {
    return html`
      <button
        type="button"
        class="sidebar-toggle"
        @click=${this.toggle}
        aria-expanded=${this.open}
        aria-label=${this.toggleLabel}
        title=${this.toggleLabel}
      >
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="label">Settings</span>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "demo-sidebar": DemoSidebar;
  }
}
