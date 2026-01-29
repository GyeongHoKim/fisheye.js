import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("page-header")
export class PageHeader extends LitElement {
  static styles = css`
    :host {
      display: block;
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
    }

    @media (max-height: 500px) and (orientation: landscape) {
      header {
        padding: 0.5rem 1rem;
      }

      header h1 {
        font-size: 1rem;
      }

      header p {
        display: none;
      }
    }
  `;

  @property() title = "fisheye.js";
  @property() subtitle = "GPU-accelerated fisheye dewarping using WebGPU";

  render() {
    return html`
      <header>
        <h1>${this.title}</h1>
        <p>${this.subtitle}</p>
      </header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-header": PageHeader;
  }
}
