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
    <div class="gang-canvas-wrapper" id="gang-canvas-wrapper">
        <div class="gang-zoom-controls">
          <button class="gang-zoom-btn" id="gang-zoom-out" aria-label="Zoom out">−</button>
          <span class="gang-zoom-level" id="gang-zoom-level">125%</span>
          <button class="gang-zoom-btn" id="gang-zoom-in" aria-label="Zoom in">+</button>
        </div>
      <div class="gang-canvas-container" id="gang-canvas-container">
        <canvas id="gang-canvas"></canvas>
      </div>
    </div>
  `;

  const canvasWrapper = container.querySelector(".gang-canvas-wrapper");
  const canvasContainer = container.querySelector("#gang-canvas-container");
  const canvas = container.querySelector("#gang-canvas");
  const ctx = canvas.getContext("2d");
  const zoomOutBtn = container.querySelector("#gang-zoom-out");
  const zoomInBtn = container.querySelector("#gang-zoom-in");
  const zoomLevelDisplay = container.querySelector("#gang-zoom-level");
  const zoomControls = container.querySelector(".gang-zoom-controls");
  
  // Position zoom controls fixed relative to center panel
  function positionZoomControls() {
    const centerPanel = container.closest(".gang-builder-center");
    if (centerPanel && zoomControls) {
      const centerRect = centerPanel.getBoundingClientRect();
      zoomControls.style.top = (centerRect.top + 16) + 'px';
      zoomControls.style.right = (window.innerWidth - centerRect.right + 16) + 'px';
    }
  }
  
  // Track sheet size to detect changes and scroll to top
  const initialState = store.getState();
  let lastSheetSizeId = initialState.selectedSheetSizeId;
  
  // Get default zoom level for a sheet size
  function getDefaultZoomForSheetSize(sheetSizeId) {
    const zoomMap = {
      "22x12": 1.25,   // 125%
      "22x24": 1.5,    // 150%
      "22x60": 1.75,   // 175%
      "22x120": 2.0,   // 200%
      "22x180": 2.0,   // 200%
    };
    return zoomMap[sheetSizeId] || 1.25; // Default to 125% if not found
  }
  
  // Initialize zoom to default for current sheet size
  const initialZoom = getDefaultZoomForSheetSize(initialState.selectedSheetSizeId);
  
  // Zoom state (1.0 = 100%, 1.25 = 125%, etc.)
  let zoomLevel = initialZoom;

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

  // Store container dimensions for scale calculations
  let containerWidth = 0;
  let containerHeight = 0;
  let isResizing = false; // Prevent recursive resize calls
  let currentScale = 1; // Store the current scale to ensure consistency
  let baseFitScale = 1; // Store the base fit scale for current sheet size (never changes until sheet size changes)
  
  // Resize canvas to fit container with high DPI support
  function resizeCanvas() {
    // Prevent recursive calls
    if (isResizing) return;
    
    // ALWAYS get fresh wrapper dimensions - this is our fixed reference
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    if (wrapperRect.width <= 0 || wrapperRect.height <= 0) {
      setTimeout(() => resizeCanvas(), 50);
      return;
    }
    
    isResizing = true;
    
    // Container is ALWAYS the wrapper size minus padding - NEVER changes
    const containerW = Math.max(100, wrapperRect.width - 64);
    const containerH = Math.max(100, wrapperRect.height - 64);
    
    // Store container dimensions for scale calculations
    containerWidth = containerW;
    containerHeight = containerH;
    
    // Container size is FIXED - never exceeds wrapper
    canvasContainer.style.width = containerW + 'px';
    canvasContainer.style.height = containerH + 'px';
    
    // Use device pixel ratio for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    
    // Calculate canvas size based on sheet size and zoom
    const state = store.getState();
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    
    if (sheetSize) {
      // COMPLETELY NEW APPROACH: Fixed scale based on sheet dimensions only
      // Don't use container dimensions for scale - use a fixed reference
      // This ensures perfect aspect ratio at ALL zoom levels
      const baseSheetWidthPx = convertInchesToPixels(sheetSize.widthIn);
      const baseSheetHeightPx = convertInchesToPixels(sheetSize.heightIn);
      
      // Calculate base fit scale ONLY if sheet size changed (stored in baseFitScale)
      // This ensures the base scale never changes during zoom operations
      const fitScaleX = (containerW * 0.95) / baseSheetWidthPx;
      const fitScaleY = (containerH * 0.95) / baseSheetHeightPx;
      const calculatedBaseFitScale = Math.min(fitScaleX, fitScaleY);
      
      // Only update baseFitScale if it's significantly different (sheet size changed)
      // This prevents recalculation during zoom operations
      if (Math.abs(baseFitScale - calculatedBaseFitScale) > 0.001) {
        baseFitScale = calculatedBaseFitScale;
      }
      
      // CRITICAL: Always use stored baseFitScale * zoomLevel
      // This ensures both width and height use the EXACT same scale value at all times
      currentScale = baseFitScale * zoomLevel;
      
      // Apply the SAME scale to both dimensions - this is the key to preventing warping
      const sheetWidthPx = baseSheetWidthPx * currentScale;
      const sheetHeightPx = baseSheetHeightPx * currentScale;
      
      // Canvas size: sheet + padding, always large enough to show full sheet
      const paddingPx = 32;
      const canvasW = Math.max(containerW, sheetWidthPx + paddingPx * 2);
      const canvasH = Math.max(containerH, sheetHeightPx + paddingPx * 2);
      
      // Set canvas size (can be larger than container for scrolling)
      canvas.width = canvasW * dpr;
      canvas.height = canvasH * dpr;
      canvas.style.width = canvasW + 'px';
      canvas.style.height = canvasH + 'px';
    } else {
      // No sheet size - canvas matches container
      currentScale = 1; // Default scale when no sheet
      canvas.width = containerW * dpr;
      canvas.height = containerH * dpr;
      canvas.style.width = containerW + 'px';
      canvas.style.height = containerH + 'px';
    }
    
    // Reset transform and scale the context to match DPR
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    render();
    isResizing = false;
  }

  // Render the sheet and instances
  function render() {
    const state = store.getState();
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    if (!sheetSize) return;

    // Get canvas display size (CSS pixels, not scaled by DPR)
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;

    // Clear canvas (use actual canvas dimensions)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate base dimensions (in pixels at base resolution)
    const baseSheetWidthPx = convertInchesToPixels(sheetSize.widthIn);
    const baseSheetHeightPx = convertInchesToPixels(sheetSize.heightIn);
    
    // Use the stored scale from resizeCanvas - this is baseFitScale * zoomLevel
    // Both width and height use the SAME scale, ensuring perfect aspect ratio
    const scale = currentScale;

    // Apply the SAME scale to both dimensions - this is critical for aspect ratio
    const sheetWidthPx = baseSheetWidthPx * scale;
    const sheetHeightPx = baseSheetHeightPx * scale;
    
    // Position sheet - ALWAYS at top (minimal offset) so top is visible
    const paddingPx = 16; // Minimal padding so top is clearly visible
    // Center horizontally
    const offsetX = Math.max(paddingPx, (canvasWidth - sheetWidthPx) / 2);
    // ALWAYS start at very top - this ensures top of sheet is always visible
    const offsetY = paddingPx;

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
    ctx.fillText(sheetSize.label, canvasWidth / 2, offsetY - 10);

    // Draw instances
    state.instances.forEach((instance) => {
      const design = state.designFiles.find((d) => d.id === instance.designId);
      if (!design) return;

      // Add 4mm (0.157 inches) deadspace padding around the graphic
      const deadspaceIn = 0.157; // 4mm in inches
      const deadspacePx = convertInchesToPixels(deadspaceIn) * scale;
      
      // Get base dimensions in pixels
      const baseWidthPx = convertInchesToPixels(instance.widthIn) * scale;
      const baseHeightPx = convertInchesToPixels(instance.heightIn) * scale;
      
      // Bounding box dimensions (always include deadspace, dimensions don't swap - rotation handles visual appearance)
      const boxWidthPx = baseWidthPx + (deadspacePx * 2);
      const boxHeightPx = baseHeightPx + (deadspacePx * 2);
      
      // Calculate center point of the bounding box
      // The instance.xIn and instance.yIn represent the top-left of the graphic (before rotation)
      // The bounding box includes deadspace, so:
      // - Bounding box top-left = graphic top-left - deadspace
      // - Bounding box center = bounding box top-left + box dimensions / 2
      const graphicX = offsetX + convertInchesToPixels(instance.xIn) * scale;
      const graphicY = offsetY + convertInchesToPixels(instance.yIn) * scale;
      
      // Bounding box top-left (with deadspace)
      const boxTopLeftX = graphicX - deadspacePx;
      const boxTopLeftY = graphicY - deadspacePx;
      
      // Bounding box center
      const centerX = boxTopLeftX + boxWidthPx / 2;
      const centerY = boxTopLeftY + boxHeightPx / 2;

      const isSelected = instance.id === state.selectedInstanceId;

      // Draw bounding box and image together with rotation
      ctx.save();
      ctx.translate(centerX, centerY);
      if (instance.rotationDeg) {
        ctx.rotate((instance.rotationDeg * Math.PI) / 180);
      }
      
      // Draw instance background (with deadspace) - centered at origin after translation
      ctx.fillStyle = isSelected ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(-boxWidthPx / 2, -boxHeightPx / 2, boxWidthPx, boxHeightPx);

      // Draw instance border (with deadspace)
      ctx.strokeStyle = isSelected ? "rgba(255, 255, 255, 0.6)" : "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(-boxWidthPx / 2, -boxHeightPx / 2, boxWidthPx, boxHeightPx);

      // Draw design image - centered at origin
      if (design.url) {
        const cachedImg = imageCache.get(design.url);
        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
          // Draw image centered (rotation is already applied to context)
          ctx.drawImage(cachedImg, -baseWidthPx / 2, -baseHeightPx / 2, baseWidthPx, baseHeightPx);
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
              ctx.fillRect(-baseWidthPx / 2, -baseHeightPx / 2, baseWidthPx, baseHeightPx);
              render();
            });
        }
      }
      
      ctx.restore();

      // Filename text removed per user request
    });

    // Store render context for mouse events (use display dimensions)
    canvas._renderContext = {
      offsetX,
      offsetY,
      scale,
      sheetSize,
      displayWidth: canvasWidth,
      displayHeight: canvasHeight,
    };
  }

  // Mouse event handlers
  function getInstanceAtPoint(mouseX, mouseY) {
    const state = store.getState();
    const ctx = canvas._renderContext;
    if (!ctx) return null;

    const { offsetX, offsetY, scale } = ctx;
    const deadspaceIn = 0.157; // 4mm in inches

    // Convert mouse coords to canvas pixels, then to inches
    const mouseXIn = convertPixelsToInches((mouseX - offsetX) / scale);
    const mouseYIn = convertPixelsToInches((mouseY - offsetY) / scale);

    // Find instance at point (check in reverse order for top-most)
    // Account for rotation and deadspace padding in bounding box
    for (let i = state.instances.length - 1; i >= 0; i--) {
      const instance = state.instances[i];
      const isRotated = instance.rotationDeg === 90;
      
      // Get bounding box dimensions (swap if rotated)
      const boxWidth = (isRotated ? instance.heightIn : instance.widthIn) + (deadspaceIn * 2);
      const boxHeight = (isRotated ? instance.widthIn : instance.heightIn) + (deadspaceIn * 2);
      
      // Calculate center point of the instance
      const centerX = instance.xIn + instance.widthIn / 2;
      const centerY = instance.yIn + instance.heightIn / 2;
      
      // Check if mouse is within bounding box (accounting for rotation)
      // For rotated instances, we need to check relative to the center
      const relX = mouseXIn - centerX;
      const relY = mouseYIn - centerY;
      
      // If rotated, swap the relative coordinates
      const checkX = isRotated ? relY : relX;
      const checkY = isRotated ? -relX : relY;
      
      if (
        checkX >= -boxWidth / 2 &&
        checkX <= boxWidth / 2 &&
        checkY >= -boxHeight / 2 &&
        checkY <= boxHeight / 2
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
      
      // Store the initial instance position when drag starts
      const state = store.getState();
      const inst = state.instances.find((i) => i.id === instance.id);
      if (inst) {
        dragStartInstanceX = inst.xIn;
        dragStartInstanceY = inst.yIn;
      }
      
      store.setSelectedInstance(instance.id);
      e.preventDefault(); // Prevent text selection
    } else {
      store.setSelectedInstance(null);
    }
  });

  let dragStartInstanceX = 0;
  let dragStartInstanceY = 0;

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

    // Calculate mouse movement in canvas coordinates
    const deltaX = (mouseX - dragStartX) / scale;
    const deltaY = (mouseY - dragStartY) / scale;

    // Convert to inches and add to original position
    let newX = dragStartInstanceX + convertPixelsToInches(deltaX);
    let newY = dragStartInstanceY + convertPixelsToInches(deltaY);

    // Apply snapping
    if (state.snapIncrement > 0) {
      newX = snapToGrid(newX, state.snapIncrement);
      newY = snapToGrid(newY, state.snapIncrement);
    }

    // Check bounds and overlaps (account for deadspace and rotation)
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    if (sheetSize) {
      const deadspaceIn = 0.157; // 4mm
      const isRotated = instance.rotationDeg === 90;
      
      // Calculate bounding box for the new position
      let box;
      if (isRotated) {
        const graphicCenterX = newX + instance.widthIn / 2;
        const graphicCenterY = newY + instance.heightIn / 2;
        const boxWidth = instance.heightIn + (deadspaceIn * 2);
        const boxHeight = instance.widthIn + (deadspaceIn * 2);
        box = {
          xIn: graphicCenterX - boxWidth / 2,
          yIn: graphicCenterY - boxHeight / 2,
          widthIn: boxWidth,
          heightIn: boxHeight,
        };
      } else {
        box = {
          xIn: newX - deadspaceIn,
          yIn: newY - deadspaceIn,
          widthIn: instance.widthIn + (deadspaceIn * 2),
          heightIn: instance.heightIn + (deadspaceIn * 2),
        };
      }
      
      // Check if bounding box is within sheet bounds
      if (!isWithinBounds(box.xIn, box.yIn, box.widthIn, box.heightIn, sheetSize.widthIn, sheetSize.heightIn)) {
        return; // Don't update if out of bounds
      }
      
      // Check if bounding box overlaps with other instances (excluding the one being dragged)
      const otherInstances = state.instances.filter((i) => i.id !== dragInstanceId);
      for (const other of otherInstances) {
        const otherIsRotated = other.rotationDeg === 90;
        let otherBox;
        if (otherIsRotated) {
          const otherCenterX = other.xIn + other.widthIn / 2;
          const otherCenterY = other.yIn + other.heightIn / 2;
          const otherBoxWidth = other.heightIn + (deadspaceIn * 2);
          const otherBoxHeight = other.widthIn + (deadspaceIn * 2);
          otherBox = {
            xIn: otherCenterX - otherBoxWidth / 2,
            yIn: otherCenterY - otherBoxHeight / 2,
            widthIn: otherBoxWidth,
            heightIn: otherBoxHeight,
          };
        } else {
          otherBox = {
            xIn: other.xIn - deadspaceIn,
            yIn: other.yIn - deadspaceIn,
            widthIn: other.widthIn + (deadspaceIn * 2),
            heightIn: other.heightIn + (deadspaceIn * 2),
          };
        }
        
        // Check for overlap
        if (
          box.xIn < otherBox.xIn + otherBox.widthIn &&
          box.xIn + box.widthIn > otherBox.xIn &&
          box.yIn < otherBox.yIn + otherBox.heightIn &&
          box.yIn + box.heightIn > otherBox.yIn
        ) {
          return; // Don't update if overlapping
        }
      }
      
      // Position is valid - update it
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

  // Zoom controls
  function updateZoomDisplay() {
    zoomLevelDisplay.textContent = Math.round(zoomLevel * 100) + "%";
  }

  let isZooming = false; // Prevent recursive zoom calls
  
  function setZoom(level) {
    // Prevent recursive calls
    if (isZooming) return;
    
    // Clamp zoom between 0.25x (25%) and 4x (400%)
    const newZoom = Math.max(0.25, Math.min(4.0, level));
    if (Math.abs(newZoom - zoomLevel) < 0.001) return; // No significant change
    
    isZooming = true;
    zoomLevel = newZoom;
    updateZoomDisplay();
    
    // Resize canvas to accommodate new zoom level
    resizeCanvas();
    
    // Reposition controls after resize (they should stay fixed)
    requestAnimationFrame(() => {
      positionZoomControls();
      isZooming = false;
    });
  }

  zoomOutBtn.addEventListener("click", () => {
    setZoom(zoomLevel - 0.25);
  });

  zoomInBtn.addEventListener("click", () => {
    setZoom(zoomLevel + 0.25);
  });

  // Initialize zoom display and position controls
  updateZoomDisplay();
  positionZoomControls();
  
  // Reposition controls on window resize
  window.addEventListener("resize", positionZoomControls);

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
    
    // If sheet size changed, reset zoom and resize canvas
    const sheetSizeChanged = lastSheetSizeId !== null && lastSheetSizeId !== state.selectedSheetSizeId;
    if (sheetSizeChanged) {
      lastSheetSizeId = state.selectedSheetSizeId;
      
      // Reset zoom to recommended level for this sheet size
      const defaultZoom = getDefaultZoomForSheetSize(state.selectedSheetSizeId);
      zoomLevel = defaultZoom;
      updateZoomDisplay();
      
      // Reset base fit scale - will be recalculated on next resize
      baseFitScale = 1;
      
      // Reset flags to allow fresh resize
      isResizing = false;
      
      // Wait for DOM to settle, then resize with fresh measurements
      requestAnimationFrame(() => {
        resizeCanvas(); // This will get fresh wrapper dimensions and reset container to fixed size
        positionZoomControls();
        requestAnimationFrame(() => {
          if (canvasWrapper) {
            canvasWrapper.scrollTop = 0;
            canvasWrapper.scrollLeft = 0;
          }
        });
      });
    } else {
      // Just render, don't resize
      lastSheetSizeId = state.selectedSheetSizeId;
      render();
    }
  });

  // Initial render and resize handling
  // Use requestAnimationFrame to ensure container is laid out
  requestAnimationFrame(() => {
    positionZoomControls();
    resizeCanvas();
  });
  
  // Also try after a short delay in case container sizing is delayed
  setTimeout(() => {
    positionZoomControls();
    resizeCanvas();
  }, 100);
  
  window.addEventListener("resize", () => {
    positionZoomControls();
    resizeCanvas();
  });
  
  // Clean up image cache when component is destroyed (if needed)
  // For now, we'll keep the cache for the session
}

export const SheetCanvas = { create };

