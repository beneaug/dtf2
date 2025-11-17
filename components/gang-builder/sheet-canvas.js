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

  // Image cache to avoid reloading images
  const imageCache = new Map();

  // Preload an image and cache it
  function preloadImage(url) {
    if (imageCache.has(url)) {
      return Promise.resolve(imageCache.get(url));
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        imageCache.set(url, img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // Resize canvas to fit container with high DPI support
  function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    // Ensure we have valid dimensions
    if (rect.width > 0 && rect.height > 0) {
      // Use device pixel ratio for high DPI displays
      const dpr = window.devicePixelRatio || 1;
      
      // Set actual canvas size in memory (scaled by DPR)
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      // Set display size (CSS pixels)
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      
      // Scale the context to match DPR
      ctx.scale(dpr, dpr);
      
      render();
    } else {
      // Retry after a short delay if container isn't sized yet
      setTimeout(() => resizeCanvas(), 50);
    }
  }

  // Render the sheet and instances
  function render() {
    const state = store.getState();
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    if (!sheetSize) return;

    // Get canvas display size (CSS pixels, not scaled by DPR)
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;

    // Clear canvas (use actual canvas dimensions)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate base dimensions at base PPI
    const baseSheetWidthPx = convertInchesToPixels(sheetSize.widthIn);
    const baseSheetHeightPx = convertInchesToPixels(sheetSize.heightIn);
    
    // Calculate what scale would fit the canvas, then multiply by zoom factor
    const fitScaleX = displayWidth / baseSheetWidthPx;
    const fitScaleY = displayHeight / baseSheetHeightPx;
    const fitScale = Math.min(fitScaleX, fitScaleY);
    
    // Apply large zoom multiplier - this makes it much bigger
    const zoomMultiplier = 5.0;
    let scale = fitScale * zoomMultiplier;
    
    // Cap at 98% of canvas to prevent cutoff
    const maxScaleX = (displayWidth * 0.98) / baseSheetWidthPx;
    const maxScaleY = (displayHeight * 0.98) / baseSheetHeightPx;
    const maxScale = Math.min(maxScaleX, maxScaleY);
    if (scale > maxScale) {
      scale = maxScale;
    }

    const sheetWidthPx = baseSheetWidthPx * scale;
    const sheetHeightPx = baseSheetHeightPx * scale;
    const offsetX = (displayWidth - sheetWidthPx) / 2;
    const offsetY = (displayHeight - sheetHeightPx) / 2;

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

    // Draw sheet background - make it more visible
    ctx.fillStyle = "rgba(20, 22, 28, 0.95)";
    ctx.fillRect(offsetX, offsetY, sheetWidthPx, sheetHeightPx);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, sheetWidthPx, sheetHeightPx);
    
    // Add a subtle inner border for better visibility
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX + 1, offsetY + 1, sheetWidthPx - 2, sheetHeightPx - 2);

    // Draw sheet label
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(sheetSize.label, displayWidth / 2, offsetY - 10);

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
      if (design.url) {
        const cachedImg = imageCache.get(design.url);
        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
          // Image is cached and loaded, draw it
          ctx.save();
          ctx.translate(x + width / 2, y + height / 2);
          if (instance.rotationDeg) {
            ctx.rotate((instance.rotationDeg * Math.PI) / 180);
          }
          ctx.drawImage(cachedImg, -width / 2, -height / 2, width, height);
          ctx.restore();
        } else {
          // Preload the image if not cached
          preloadImage(design.url)
            .then(() => {
              // Re-render after image loads
              render();
            })
            .catch(() => {
              // Draw placeholder if image fails to load
              ctx.fillStyle = "rgba(100, 100, 100, 0.3)";
              ctx.fillRect(x, y, width, height);
              render();
            });
        }
      }

      // Draw instance label
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(design.name.substring(0, 20), x + 4, y + 14);
    });

    // Store render context for mouse events (use display dimensions)
    canvas._renderContext = {
      offsetX,
      offsetY,
      scale,
      sheetSize,
      displayWidth,
      displayHeight,
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
  store.subscribe((state) => {
    // Preload any new design images
    state.designFiles.forEach((design) => {
      if (design.url && !imageCache.has(design.url)) {
        preloadImage(design.url).catch(() => {
          // Silently fail - will show placeholder in render
        });
      }
    });
    render();
  });

  // Initial render and resize handling
  // Use requestAnimationFrame to ensure container is laid out
  requestAnimationFrame(() => {
    resizeCanvas();
  });
  
  // Also try after a short delay in case container sizing is delayed
  setTimeout(() => {
    resizeCanvas();
  }, 100);
  
  window.addEventListener("resize", resizeCanvas);
  
  // Clean up image cache when component is destroyed (if needed)
  // For now, we'll keep the cache for the session
}

export const SheetCanvas = { create };

