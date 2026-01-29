import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

const SIDEBAR_TOGGLE_WIDTH = 48;

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
      padding: 0;
      background: #0f3460;
      border: none;
      border-right: 1px solid #1a3a5c;
      color: #00d9ff;
      font-size: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }

    .sidebar-toggle:hover {
      background: #1a3a5c;
    }

    .sidebar-toggle .icon {
      transition: transform 0.25s ease;
    }

    .sidebar-toggle[aria-expanded="true"] .icon {
      transform: rotate(180deg);
    }

    @media (max-width: 900px) {
      :host {
        width: 100%;
      }

      .sidebar-toggle {
        width: 100%;
        height: ${SIDEBAR_TOGGLE_WIDTH}px;
        border-right: none;
        border-bottom: 1px solid #1a3a5c;
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

  render() {
    return html`
      <button
        type="button"
        class="sidebar-toggle"
        @click=${this.toggle}
        aria-expanded=${this.open}
        aria-label=${this.open ? "Close sidebar" : "Open sidebar"}
      >
        <span class="icon" aria-hidden="true">▶</span>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "demo-sidebar": DemoSidebar;
  }
}
