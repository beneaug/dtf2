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
  let isSelecting = false; // Multi-select box
  let dragStartX = 0;
  let dragStartY = 0;
  let dragInstanceId = null;
  let selectedInstanceId = null;
  let selectionBox = null; // {x, y, width, height} for multi-select box
  let dragSelectedInstances = new Set(); // Instances being dragged together

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
  
  // Get maximum allowed zoom to prevent pushing right panel off screen
  function getMaxZoom() {
    const state = store.getState();
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    if (!sheetSize) return 4.0;
    
    // Get the center panel (which contains the canvas wrapper)
    const centerPanel = container.closest(".gang-builder-center");
    if (!centerPanel) return 4.0;
    
    const centerRect = centerPanel.getBoundingClientRect();
    const maxAvailableWidth = centerRect.width - 64; // Account for padding
    
    // Calculate base sheet dimensions
    const baseSheetWidthPx = convertInchesToPixels(sheetSize.widthIn);
    
    // Calculate maximum zoom that keeps canvas within center panel
    // Canvas width = sheetWidthPx * scale + padding
    // We want: sheetWidthPx * scale + padding <= maxAvailableWidth
    // So: scale <= (maxAvailableWidth - padding) / sheetWidthPx
    const paddingPx = 32;
    const maxScale = (maxAvailableWidth - paddingPx * 2) / baseSheetWidthPx;
    
    // Get base scale (at 100% zoom)
    const availableWidth = containerWidth || maxAvailableWidth;
    const baseScale = (availableWidth * 0.95) / baseSheetWidthPx;
    
    // Max zoom = maxScale / baseScale
    const maxZoom = Math.max(1.0, Math.min(4.0, maxScale / baseScale));
    
    return maxZoom;
  }
  
  // Calculate scale for current sheet size and zoom - SINGLE SOURCE OF TRUTH
  function calculateScale() {
    const state = store.getState();
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    if (!sheetSize) return { scale: 1, sheetWidthPx: 0, sheetHeightPx: 0 };
    
    const baseSheetWidthPx = convertInchesToPixels(sheetSize.widthIn);
    const baseSheetHeightPx = convertInchesToPixels(sheetSize.heightIn);
    
    // Use actual container dimensions (freshly measured from wrapper, not canvas)
    const availableWidth = containerWidth || 100;
    const availableHeight = containerHeight || 100;
    
    // Calculate base scale to fit in container (with 5% padding for breathing room)
    const fitScaleX = (availableWidth * 0.95) / baseSheetWidthPx;
    const fitScaleY = (availableHeight * 0.95) / baseSheetHeightPx;
    const baseScale = Math.min(fitScaleX, fitScaleY);
    
    // Apply zoom level (clamped to max zoom)
    const maxZoom = getMaxZoom();
    const clampedZoom = Math.min(zoomLevel, maxZoom);
    const scale = baseScale * clampedZoom;
    
    const sheetWidthPx = baseSheetWidthPx * scale;
    const sheetHeightPx = baseSheetHeightPx * scale;
    
    return { scale, sheetWidthPx, sheetHeightPx };
  }
  
  // Resize canvas to fit container with high DPI support
  function resizeCanvas() {
    // Prevent recursive calls
    if (isResizing) return;
    
    // ALWAYS get fresh wrapper dimensions - this is our FIXED reference
    // The wrapper size should NOT change when canvas size changes
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    if (wrapperRect.width <= 0 || wrapperRect.height <= 0) {
      setTimeout(() => resizeCanvas(), 50);
      return;
    }
    
    isResizing = true;
    
    // Calculate available container space (wrapper minus padding)
    // This is FIXED and should never change based on canvas size
    const availableWidth = Math.max(100, wrapperRect.width - 64); // Account for 2rem padding
    const availableHeight = Math.max(100, wrapperRect.height - 64);
    
    // Store container dimensions - these are FIXED reference dimensions
    // They represent the available space, NOT the canvas size
    containerWidth = availableWidth;
    containerHeight = availableHeight;
    
    // Use device pixel ratio for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    
    // Calculate scale and sheet dimensions
    const { sheetWidthPx, sheetHeightPx } = calculateScale();
    
    if (sheetWidthPx > 0 && sheetHeightPx > 0) {
      // Canvas size: exactly what's needed (sheet + padding)
      const paddingPx = 32;
      const neededWidth = sheetWidthPx + paddingPx * 2;
      const neededHeight = sheetHeightPx + paddingPx * 2;
      
      // Set canvas size
      canvas.width = neededWidth * dpr;
      canvas.height = neededHeight * dpr;
      canvas.style.width = neededWidth + 'px';
      canvas.style.height = neededHeight + 'px';
      
      // Container matches canvas size
      canvasContainer.style.width = neededWidth + 'px';
      canvasContainer.style.height = neededHeight + 'px';
    } else {
      // No sheet size selected, use container size
      canvas.width = availableWidth * dpr;
      canvas.height = availableHeight * dpr;
      canvas.style.width = availableWidth + 'px';
      canvas.style.height = availableHeight + 'px';
      canvasContainer.style.width = availableWidth + 'px';
      canvasContainer.style.height = availableHeight + 'px';
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
    
    // Use the SAME scale calculation as resizeCanvas - ensures consistency
    const { scale, sheetWidthPx, sheetHeightPx } = calculateScale();
    
    // Position sheet - ALWAYS at top, centered horizontally
    const paddingPx = 32; // 2rem = 32px
    const offsetX = Math.max(paddingPx, (canvasWidth - sheetWidthPx) / 2); // Center horizontally
    const offsetY = paddingPx; // ALWAYS start at top

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

      const isSelected = state.selectedInstanceIds.has(instance.id);

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
    const state = store.getState();
    const isMultiSelect = e.ctrlKey || e.metaKey; // Ctrl/Cmd for multi-select
    
    if (instance) {
      if (isMultiSelect) {
        // Multi-select mode: toggle selection
        store.toggleInstanceSelection(instance.id);
        // If this instance is selected, prepare to drag all selected
        if (state.selectedInstanceIds.has(instance.id)) {
          isDragging = true;
          dragStartX = mouseX;
          dragStartY = mouseY;
          dragInstanceId = instance.id;
          dragSelectedInstances = new Set(state.selectedInstanceIds);
          
          // Store initial positions for all selected instances
          dragSelectedInstances.forEach(id => {
            const inst = state.instances.find(i => i.id === id);
            if (inst) {
              inst._dragStartX = inst.xIn;
              inst._dragStartY = inst.yIn;
            }
          });
        }
      } else {
        // Single select mode
        if (state.selectedInstanceIds.has(instance.id)) {
          // Already selected, start dragging
          isDragging = true;
          dragStartX = mouseX;
          dragStartY = mouseY;
          dragInstanceId = instance.id;
          dragSelectedInstances = new Set([instance.id]);
          
          const inst = state.instances.find((i) => i.id === instance.id);
          if (inst) {
            dragStartInstanceX = inst.xIn;
            dragStartInstanceY = inst.yIn;
          }
        } else {
          // Select this instance and start dragging
          store.setSelectedInstance(instance.id);
          isDragging = true;
          dragStartX = mouseX;
          dragStartY = mouseY;
          dragInstanceId = instance.id;
          dragSelectedInstances = new Set([instance.id]);
          
          const inst = state.instances.find((i) => i.id === instance.id);
          if (inst) {
            dragStartInstanceX = inst.xIn;
            dragStartInstanceY = inst.yIn;
          }
        }
      }
      e.preventDefault(); // Prevent text selection
    } else {
      // Clicked on empty space - start selection box
      if (isMultiSelect) {
        // In multi-select mode, don't clear selection, start selection box
        isSelecting = true;
        selectionBox = { x: mouseX, y: mouseY, width: 0, height: 0 };
        dragStartX = mouseX;
        dragStartY = mouseY;
      } else {
        // Clear selection and start selection box
        store.clearSelection();
        isSelecting = true;
        selectionBox = { x: mouseX, y: mouseY, width: 0, height: 0 };
        dragStartX = mouseX;
        dragStartY = mouseY;
      }
      e.preventDefault();
    }
  });

  let dragStartInstanceX = 0;
  let dragStartInstanceY = 0;

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const ctx = canvas._renderContext;
    if (!ctx) return;
    const { offsetX, offsetY, scale } = ctx;
    const state = store.getState();
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    const deadspaceIn = 0.157; // 4mm

    // Handle selection box (multi-select)
    if (isSelecting && selectionBox) {
      selectionBox.width = mouseX - dragStartX;
      selectionBox.height = mouseY - dragStartY;
      render(); // Re-render to show selection box
      return;
    }

    // Handle dragging instances
    if (isDragging && dragSelectedInstances.size > 0) {
      // Calculate mouse movement in canvas coordinates
      const deltaX = (mouseX - dragStartX) / scale;
      const deltaY = (mouseY - dragStartY) / scale;
      const deltaXIn = convertPixelsToInches(deltaX);
      const deltaYIn = convertPixelsToInches(deltaY);

      // Try to move all selected instances
      const updates = [];
      const otherInstances = state.instances.filter(i => !dragSelectedInstances.has(i.id));

      for (const instanceId of dragSelectedInstances) {
        const instance = state.instances.find(i => i.id === instanceId);
        if (!instance) continue;

        // Get initial position from stored value or current position
        const startX = instance._dragStartX !== undefined ? instance._dragStartX : instance.xIn;
        const startY = instance._dragStartY !== undefined ? instance._dragStartY : instance.yIn;

        let newX = startX + deltaXIn;
        let newY = startY + deltaYIn;

        // Apply snapping
        if (state.snapIncrement > 0) {
          newX = snapToGrid(newX, state.snapIncrement);
          newY = snapToGrid(newY, state.snapIncrement);
        }

        // Calculate bounding box for this instance
        const isRotated = instance.rotationDeg === 90;
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

        // Check bounds
        if (!sheetSize || !isWithinBounds(box.xIn, box.yIn, box.widthIn, box.heightIn, sheetSize.widthIn, sheetSize.heightIn)) {
          return; // Don't update if any instance would be out of bounds
        }

        // Check overlaps with other instances (not in selection)
        let hasOverlap = false;
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

          if (
            box.xIn < otherBox.xIn + otherBox.widthIn &&
            box.xIn + box.widthIn > otherBox.xIn &&
            box.yIn < otherBox.yIn + otherBox.heightIn &&
            box.yIn + box.heightIn > otherBox.yIn
          ) {
            hasOverlap = true;
            break;
          }
        }

        // Check overlaps with other instances in selection (that we've already processed)
        if (!hasOverlap) {
          for (const update of updates) {
            const updateBox = update.box;
            if (
              box.xIn < updateBox.xIn + updateBox.widthIn &&
              box.xIn + box.widthIn > updateBox.xIn &&
              box.yIn < updateBox.yIn + updateBox.heightIn &&
              box.yIn + box.heightIn > updateBox.yIn
            ) {
              hasOverlap = true;
              break;
            }
          }
        }

        if (!hasOverlap) {
          updates.push({
            id: instanceId,
            xIn: newX,
            yIn: newY,
            box: box,
          });
        }
      }

      // If all instances can be moved, update them all
      if (updates.length === dragSelectedInstances.size) {
        updates.forEach(update => {
          store.updateInstance(update.id, { xIn: update.xIn, yIn: update.yIn });
        });
      }
    }
  });

  canvas.addEventListener("mouseup", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Handle selection box completion
    if (isSelecting && selectionBox) {
      const ctx = canvas._renderContext;
      if (ctx) {
        const { offsetX, offsetY, scale } = ctx;
        const state = store.getState();
        
        // Convert selection box to inches
        const boxLeft = Math.min(selectionBox.x, selectionBox.x + selectionBox.width);
        const boxTop = Math.min(selectionBox.y, selectionBox.y + selectionBox.height);
        const boxRight = Math.max(selectionBox.x, selectionBox.x + selectionBox.width);
        const boxBottom = Math.max(selectionBox.y, selectionBox.y + selectionBox.height);
        
        const boxLeftIn = convertPixelsToInches((boxLeft - offsetX) / scale);
        const boxTopIn = convertPixelsToInches((boxTop - offsetY) / scale);
        const boxRightIn = convertPixelsToInches((boxRight - offsetX) / scale);
        const boxBottomIn = convertPixelsToInches((boxBottom - offsetY) / scale);
        
        // Find all instances within selection box
        const selectedIds = [];
        state.instances.forEach(instance => {
          const deadspaceIn = 0.157;
          const isRotated = instance.rotationDeg === 90;
          
          let box;
          if (isRotated) {
            const graphicCenterX = instance.xIn + instance.widthIn / 2;
            const graphicCenterY = instance.yIn + instance.heightIn / 2;
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
              xIn: instance.xIn - deadspaceIn,
              yIn: instance.yIn - deadspaceIn,
              widthIn: instance.widthIn + (deadspaceIn * 2),
              heightIn: instance.heightIn + (deadspaceIn * 2),
            };
          }
          
          // Check if instance center or any corner is within selection box
          const centerX = box.xIn + box.widthIn / 2;
          const centerY = box.yIn + box.heightIn / 2;
          
          if (centerX >= boxLeftIn && centerX <= boxRightIn &&
              centerY >= boxTopIn && centerY <= boxBottomIn) {
            selectedIds.push(instance.id);
          }
        });
        
        if (selectedIds.length > 0) {
          if (e.ctrlKey || e.metaKey) {
            // Add to existing selection
            selectedIds.forEach(id => store.addInstanceToSelection(id));
          } else {
            // Replace selection
            store.setSelectedInstances(selectedIds);
          }
        } else if (!(e.ctrlKey || e.metaKey)) {
          // Clear selection if clicking empty space without modifier
          store.clearSelection();
        }
      }
      
      isSelecting = false;
      selectionBox = null;
      render(); // Re-render to hide selection box
    }

    // Clean up drag state
    if (isDragging) {
      // Clear stored drag positions
      dragSelectedInstances.forEach(id => {
        const instance = state.instances.find(i => i.id === id);
        if (instance) {
          delete instance._dragStartX;
          delete instance._dragStartY;
        }
      });
    }
    
    isDragging = false;
    dragInstanceId = null;
    dragSelectedInstances = new Set();
  });

  canvas.addEventListener("mouseleave", () => {
    isDragging = false;
    isSelecting = false;
    dragInstanceId = null;
    selectionBox = null;
    dragSelectedInstances = new Set();
  });

  // Keyboard shortcuts for rotation and deletion
  // Use a scoped handler that only works when overlay is active
  function handleKeyboardShortcuts(e) {
    // Check if overlay is visible
    const overlay = container.closest(".gang-builder-overlay");
    if (!overlay || overlay.style.display === "none") {
      return;
    }
    
    // Don't handle if user is typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {
      return;
    }
    
    const state = store.getState();
    if (state.selectedInstanceIds.size === 0) return;
    
    // R key to rotate 90 degrees
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      store.rotateSelectedInstances(90);
    }
    
    // Delete/Backspace to remove selected instances
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const selectedIds = Array.from(state.selectedInstanceIds);
      if (selectedIds.length > 0) {
        store.removeInstances(selectedIds);
      }
    }
  }
  
  document.addEventListener("keydown", handleKeyboardShortcuts);

  // Zoom controls
  function updateZoomDisplay() {
    zoomLevelDisplay.textContent = Math.round(zoomLevel * 100) + "%";
  }

  let isZooming = false; // Prevent recursive zoom calls
  
  function setZoom(level) {
    // Prevent recursive calls
    if (isZooming) return;
    
    // Get max allowed zoom to prevent pushing right panel off screen
    const maxZoom = getMaxZoom();
    
    // Clamp zoom between 0.25x (25%) and maxZoom
    const newZoom = Math.max(0.25, Math.min(maxZoom, level));
    if (Math.abs(newZoom - zoomLevel) < 0.001) return; // No significant change
    
    isZooming = true;
    zoomLevel = newZoom;
    updateZoomDisplay();
    
    // IMPORTANT: Ensure container dimensions are fresh before resizing
    // Get wrapper dimensions directly (don't rely on cached containerWidth)
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    if (wrapperRect.width > 0 && wrapperRect.height > 0) {
      containerWidth = Math.max(100, wrapperRect.width - 64);
      containerHeight = Math.max(100, wrapperRect.height - 64);
    }
    
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
    
    // If sheet size changed, completely reset everything
    const sheetSizeChanged = lastSheetSizeId !== null && lastSheetSizeId !== state.selectedSheetSizeId;
    if (sheetSizeChanged) {
      lastSheetSizeId = state.selectedSheetSizeId;
      
      // STEP 1: Reset zoom to recommended level for this sheet size
      const defaultZoom = getDefaultZoomForSheetSize(state.selectedSheetSizeId);
      zoomLevel = defaultZoom;
      updateZoomDisplay();
      
      // STEP 2: Clear canvas container inline styles to reset dimensions
      canvasContainer.style.width = '';
      canvasContainer.style.height = '';
      
      // STEP 3: Reset container dimensions to force fresh measurement
      containerWidth = 0;
      containerHeight = 0;
      
      // STEP 4: Reset flags to allow fresh resize
      isResizing = false;
      
      // STEP 5: Wait for DOM to settle, then resize with fresh measurements
      requestAnimationFrame(() => {
        // Get fresh wrapper dimensions
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        if (wrapperRect.width > 0 && wrapperRect.height > 0) {
          // Store fresh container dimensions
          containerWidth = Math.max(100, wrapperRect.width - 64);
          containerHeight = Math.max(100, wrapperRect.height - 64);
        }
        
        // Now resize with correct dimensions
        resizeCanvas();
        positionZoomControls();
        
        // Scroll to top after resize
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

