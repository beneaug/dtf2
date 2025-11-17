/**
 * Sheet Canvas Component
 * 
 * Interactive canvas for visualizing and manipulating designs on the sheet.
 */

import * as store from "../../lib/gang-builder/store.js";
import { getSheetSize } from "../../lib/gang-builder/config.js";
import { convertInchesToPixels, convertPixelsToInches, snapToGrid, isWithinBounds } from "../../lib/gang-builder/layout.js";

/**
 * Create the canvas component
 * @param {HTMLElement} container
 */
export function create(container) {
  container.innerHTML = `
    <div class="gang-canvas-wrapper">
      <div class="gang-canvas-container" id="gang-canvas-container">
        <canvas id="gang-canvas"></canvas>
      </div>
    </div>
  `;

  const canvasContainer = container.querySelector("#gang-canvas-container");
  const canvas = container.querySelector("#gang-canvas");
  const ctx = canvas.getContext("2d");

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragInstanceId = null;
  let selectedInstanceId = null;

  // Resize canvas to fit container
  function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    render();
  }

  // Render the sheet and instances
  function render() {
    const state = store.getState();
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    if (!sheetSize) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scale to fit sheet in canvas
    const scaleX = canvas.width / convertInchesToPixels(sheetSize.widthIn);
    const scaleY = canvas.height / convertInchesToPixels(sheetSize.heightIn);
    const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave some padding

    const sheetWidthPx = convertInchesToPixels(sheetSize.widthIn) * scale;
    const sheetHeightPx = convertInchesToPixels(sheetSize.heightIn) * scale;
    const offsetX = (canvas.width - sheetWidthPx) / 2;
    const offsetY = (canvas.height - sheetHeightPx) / 2;

    // Draw grid (subtle)
    if (state.snapIncrement > 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      const gridSizePx = convertInchesToPixels(state.snapIncrement) * scale;
      for (let x = offsetX; x < offsetX + sheetWidthPx; x += gridSizePx) {
        ctx.beginPath();
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + sheetHeightPx);
        ctx.stroke();
      }
      for (let y = offsetY; y < offsetY + sheetHeightPx; y += gridSizePx) {
        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + sheetWidthPx, y);
        ctx.stroke();
      }
    }

    // Draw sheet background
    ctx.fillStyle = "rgba(10, 11, 15, 0.9)";
    ctx.fillRect(offsetX, offsetY, sheetWidthPx, sheetHeightPx);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, sheetWidthPx, sheetHeightPx);

    // Draw sheet label
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(sheetSize.label, canvas.width / 2, offsetY - 10);

    // Draw instances
    state.instances.forEach((instance) => {
      const design = state.designFiles.find((d) => d.id === instance.designId);
      if (!design) return;

      const x = offsetX + convertInchesToPixels(instance.xIn) * scale;
      const y = offsetY + convertInchesToPixels(instance.yIn) * scale;
      const width = convertInchesToPixels(instance.widthIn) * scale;
      const height = convertInchesToPixels(instance.heightIn) * scale;

      const isSelected = instance.id === state.selectedInstanceId;

      // Draw instance background
      ctx.fillStyle = isSelected ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(x, y, width, height);

      // Draw instance border
      ctx.strokeStyle = isSelected ? "rgba(255, 255, 255, 0.6)" : "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(x, y, width, height);

      // Draw design image (if loaded)
      // Note: Images are cached by the browser, so we can create new Image objects
      // For better performance, you could preload and cache images
      if (design.url) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          // Re-render after image loads
          render();
        };
        img.onerror = () => {
          // Draw placeholder if image fails to load
          ctx.fillStyle = "rgba(100, 100, 100, 0.3)";
          ctx.fillRect(x, y, width, height);
        };
        try {
          img.src = design.url;
          // If image is already cached, draw it immediately
          if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(x + width / 2, y + height / 2);
            if (instance.rotationDeg) {
              ctx.rotate((instance.rotationDeg * Math.PI) / 180);
            }
            ctx.drawImage(img, -width / 2, -height / 2, width, height);
            ctx.restore();
          }
        } catch (e) {
          // Fallback if image URL is invalid
          ctx.fillStyle = "rgba(100, 100, 100, 0.3)";
          ctx.fillRect(x, y, width, height);
        }
      }

      // Draw instance label
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(design.name.substring(0, 20), x + 4, y + 14);
    });

    // Store render context for mouse events
    canvas._renderContext = {
      offsetX,
      offsetY,
      scale,
      sheetSize,
    };
  }

  // Mouse event handlers
  function getInstanceAtPoint(mouseX, mouseY) {
    const state = store.getState();
    const ctx = canvas._renderContext;
    if (!ctx) return null;

    const { offsetX, offsetY, scale, sheetSize } = ctx;

    // Convert mouse coords to inches
    const mouseXIn = convertPixelsToInches((mouseX - offsetX) / scale);
    const mouseYIn = convertPixelsToInches((mouseY - offsetY) / scale);

    // Find instance at point (check in reverse order for top-most)
    for (let i = state.instances.length - 1; i >= 0; i--) {
      const instance = state.instances[i];
      if (
        mouseXIn >= instance.xIn &&
        mouseXIn <= instance.xIn + instance.widthIn &&
        mouseYIn >= instance.yIn &&
        mouseYIn <= instance.yIn + instance.heightIn
      ) {
        return instance;
      }
    }
    return null;
  }

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const instance = getInstanceAtPoint(mouseX, mouseY);
    if (instance) {
      isDragging = true;
      dragStartX = mouseX;
      dragStartY = mouseY;
      dragInstanceId = instance.id;
      store.setSelectedInstance(instance.id);
    } else {
      store.setSelectedInstance(null);
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging || !dragInstanceId) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const ctx = canvas._renderContext;
    if (!ctx) return;

    const { offsetX, offsetY, scale } = ctx;
    const state = store.getState();
    const instance = state.instances.find((i) => i.id === dragInstanceId);
    if (!instance) return;

    // Calculate new position
    const deltaX = (mouseX - dragStartX) / scale;
    const deltaY = (mouseY - dragStartY) / scale;

    let newX = instance.xIn + convertPixelsToInches(deltaX);
    let newY = instance.yIn + convertPixelsToInches(deltaY);

    // Apply snapping
    if (state.snapIncrement > 0) {
      newX = snapToGrid(newX, state.snapIncrement);
      newY = snapToGrid(newY, state.snapIncrement);
    }

    // Check bounds
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    if (sheetSize && isWithinBounds(newX, newY, instance.widthIn, instance.heightIn, sheetSize.widthIn, sheetSize.heightIn)) {
      store.updateInstance(dragInstanceId, { xIn: newX, yIn: newY });
    }
  });

  canvas.addEventListener("mouseup", () => {
    isDragging = false;
    dragInstanceId = null;
  });

  canvas.addEventListener("mouseleave", () => {
    isDragging = false;
    dragInstanceId = null;
  });

  // Subscribe to state changes
  store.subscribe(() => {
    render();
  });

  // Initial render and resize handling
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

export const SheetCanvas = { create };

