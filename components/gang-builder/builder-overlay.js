/**
 * Gang Builder Overlay Component
 * 
 * Main overlay component that contains the full builder interface.
 */

import { SheetCanvas } from "./sheet-canvas.js";
import { SheetControlsPanel } from "./sheet-controls-panel.js";
import { StatsPanel } from "./stats-panel.js";

/**
 * Create and initialize the builder overlay
 * @param {HTMLElement} container - Container element to mount the overlay
 * @param {Function} onClose - Callback when overlay is closed
 */
export function createBuilderOverlay(container, onClose) {
  const overlay = document.createElement("div");
  overlay.className = "gang-builder-overlay";
  overlay.innerHTML = `
    <div class="gang-builder-overlay-backdrop"></div>
    <div class="gang-builder-container">
      <div class="gang-builder-header">
        <h2>Gang Sheet Builder</h2>
        <button class="gang-builder-close" type="button" aria-label="Close builder">×</button>
      </div>
      <div class="gang-builder-layout">
        <div class="gang-builder-left-panel">
          <div id="gang-builder-controls"></div>
        </div>
        <div class="gang-builder-center">
          <div id="gang-builder-canvas"></div>
        </div>
        <div class="gang-builder-right-panel">
          <div id="gang-builder-stats"></div>
        </div>
      </div>
    </div>
  `;

  const backdrop = overlay.querySelector(".gang-builder-overlay-backdrop");
  const closeBtn = overlay.querySelector(".gang-builder-close");
  const controlsContainer = overlay.querySelector("#gang-builder-controls");
  const canvasContainer = overlay.querySelector("#gang-builder-canvas");
  const statsContainer = overlay.querySelector("#gang-builder-stats");

  // Lock body scroll when overlay is open
  const originalOverflow = document.body.style.overflow;
  const originalPosition = document.body.style.position;
  const scrollY = window.scrollY;
  
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.width = "100%";
  document.body.style.top = `-${scrollY}px`;

  // Close handlers
  const handleClose = () => {
    // Restore body scroll
    document.body.style.overflow = originalOverflow;
    document.body.style.position = originalPosition;
    document.body.style.width = "";
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
    
    overlay.remove();
    if (onClose) onClose();
  };

  backdrop.addEventListener("click", handleClose);
  closeBtn.addEventListener("click", handleClose);

  // Initialize sub-components
  SheetControlsPanel.create(controlsContainer);
  SheetCanvas.create(canvasContainer);
  StatsPanel.create(statsContainer);

  // Append to container
  container.appendChild(overlay);

  return {
    overlay,
    destroy: () => {
      overlay.remove();
    },
  };
}

