/**
 * Gang Builder State Management
 * 
 * Simple state management for the gang builder using a reactive pattern.
 */

import { SHEET_SIZES } from "./config.js";
import { autoPackDesign, isWithinBounds } from "./layout.js";

/**
 * @typedef {Object} DesignFile
 * @property {string} id - Unique identifier
 * @property {string} name - File name
 * @property {string} url - Object URL or data URL
 * @property {number} naturalWidthPx - Natural width in pixels
 * @property {number} naturalHeightPx - Natural height in pixels
 * @property {number} widthIn - Width in inches (user-defined, defaults to calculated)
 * @property {number} heightIn - Height in inches (user-defined, defaults to calculated)
 */

/**
 * @typedef {Object} PlacedInstance
 * @property {string} id - Unique identifier
 * @property {string} designId - Reference to design file ID
 * @property {number} xIn - X position in inches
 * @property {number} yIn - Y position in inches
 * @property {number} widthIn - Width in inches
 * @property {number} heightIn - Height in inches
 * @property {number} rotationDeg - Rotation in degrees (default: 0)
 */

/**
 * @typedef {Object} GangBuilderState
 * @property {string} selectedSheetSizeId - Selected sheet size ID
 * @property {number} sheetQuantity - Number of sheets to order
 * @property {DesignFile[]} designFiles - Uploaded design files
 * @property {PlacedInstance[]} instances - Placed instances on the sheet
 * @property {string|null} selectedInstanceId - Currently selected instance ID
 * @property {number} snapIncrement - Snap increment in inches (0 = off, 0.125 = 1/8", 0.25 = 1/4")
 */

/**
 * Default state
 */
const defaultState = {
  selectedSheetSizeId: SHEET_SIZES[0]?.id || "22x12",
  sheetQuantity: 1,
  designFiles: [],
  instances: [],
  selectedInstanceId: null,
  snapIncrement: 0.125, // Default to 1/8 inch snap
};

/**
 * Current state
 */
let state = { ...defaultState };

/**
 * List of state change listeners
 */
const listeners = [];

/**
 * Notify all listeners of state change
 */
function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener({ ...state });
    } catch (error) {
      console.error("Error in state listener:", error);
    }
  });
}

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function that receives the new state
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.push(listener);
  // Immediately call with current state
  listener({ ...state });

  // Return unsubscribe function
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Get current state (read-only copy)
 * @returns {GangBuilderState}
 */
export function getState() {
  return { ...state };
}

/**
 * Set sheet size
 * @param {string} sheetSizeId
 */
export function setSheetSize(sheetSizeId) {
  state.selectedSheetSizeId = sheetSizeId;
  notifyListeners();
}

/**
 * Set sheet quantity
 * @param {number} quantity
 */
export function setSheetQuantity(quantity) {
  state.sheetQuantity = Math.max(1, Math.floor(quantity));
  notifyListeners();
}

/**
 * Add a design file
 * @param {DesignFile} file
 */
export function addDesignFile(file) {
  // Calculate default size if not provided (assuming 300 DPI)
  if (!file.widthIn || !file.heightIn) {
    const dpi = 300;
    file.widthIn = file.naturalWidthPx / dpi;
    file.heightIn = file.naturalHeightPx / dpi;
  }
  state.designFiles.push(file);
  notifyListeners();
}

/**
 * Update a design file's size
 * @param {string} id - Design file ID
 * @param {number} widthIn - New width in inches
 * @param {number} heightIn - New height in inches
 * @param {boolean} reorganize - Whether to reorganize instances using this design
 */
export function updateDesignSize(id, widthIn, heightIn, reorganize = false) {
  const design = state.designFiles.find((f) => f.id === id);
  if (!design) return;

  const oldWidth = design.widthIn;
  const oldHeight = design.heightIn;
  
  design.widthIn = widthIn;
  design.heightIn = heightIn;

  // Update all instances using this design
  if (reorganize) {
    const instancesToUpdate = state.instances.filter((i) => i.designId === id);
    
    if (instancesToUpdate.length > 0) {
      // Calculate scale factors
      const scaleX = widthIn / oldWidth;
      const scaleY = heightIn / oldHeight;
      
      // Scale all instances proportionally
      instancesToUpdate.forEach((instance) => {
        instance.widthIn = instance.widthIn * scaleX;
        instance.heightIn = instance.heightIn * scaleY;
      });

      // Re-auto-pack if there are multiple instances
      if (instancesToUpdate.length > 1) {
        const sheetSize = SHEET_SIZES.find((s) => s.id === state.selectedSheetSizeId);
        if (sheetSize) {
          // Clear existing instances for this design
          state.instances = state.instances.filter((i) => i.designId !== id);
          
          // Re-auto-pack (autoPackDesign is already imported at top)
          const result = autoPackDesign({
            sheetWidthIn: sheetSize.widthIn,
            sheetHeightIn: sheetSize.heightIn,
            designWidthIn: widthIn,
            designHeightIn: heightIn,
            quantity: instancesToUpdate.length,
            tryRotated: true,
          });

          // Create new instances at new positions
          result.positions.forEach((pos) => {
            const instance = {
              id: `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              designId: id,
              xIn: pos.xIn,
              yIn: pos.yIn,
              widthIn: widthIn,
              heightIn: heightIn,
              rotationDeg: pos.rotated || 0,
            };
            state.instances.push(instance);
          });
        }
      }
    }
  } else {
    // Just update instance sizes without repositioning
    state.instances.forEach((instance) => {
      if (instance.designId === id) {
        const scaleX = widthIn / oldWidth;
        const scaleY = heightIn / oldHeight;
        instance.widthIn = instance.widthIn * scaleX;
        instance.heightIn = instance.heightIn * scaleY;
      }
    });
  }

  notifyListeners();
}

/**
 * Remove a design file
 * @param {string} id
 */
export function removeDesignFile(id) {
  state.designFiles = state.designFiles.filter((f) => f.id !== id);
  // Also remove all instances using this design
  state.instances = state.instances.filter((i) => i.designId !== id);
  if (state.selectedInstanceId && state.instances.find((i) => i.id === state.selectedInstanceId)?.designId === id) {
    state.selectedInstanceId = null;
  }
  notifyListeners();
}

/**
 * Add instances for a design
 * @param {string} designId
 * @param {number} quantity
 * @param {boolean} autoPack - Whether to auto-pack the instances
 */
export function addInstancesForDesign(designId, quantity, autoPack = false) {
  const design = state.designFiles.find((f) => f.id === designId);
  if (!design) {
    console.warn(`Design ${designId} not found`);
    return { maxInstances: 0 };
  }

  const sheetSize = SHEET_SIZES.find((s) => s.id === state.selectedSheetSizeId);
  if (!sheetSize) {
    console.warn(`Sheet size not selected`);
    return { maxInstances: 0 };
  }

  // If auto-packing, remove all existing instances of this design first
  // This prevents overlapping when auto-packing multiple times
  if (autoPack) {
    state.instances = state.instances.filter((i) => i.designId !== designId);
    // Also clear selection if the selected instance was removed
    if (state.selectedInstanceId) {
      const stillExists = state.instances.find((i) => i.id === state.selectedInstanceId);
      if (!stillExists) {
        state.selectedInstanceId = null;
      }
    }
  }

  // Use the design's defined size
  const designWidthIn = design.widthIn || design.naturalWidthPx / 300;
  const designHeightIn = design.heightIn || design.naturalHeightPx / 300;

  // Build occupied areas from all existing instances (excluding instances of this design if auto-packing)
  const deadspaceIn = 0.157; // 4mm
  const existingOccupiedAreas = state.instances
    .filter((inst) => !autoPack || inst.designId !== designId) // Exclude this design's instances if auto-packing
    .map((inst) => {
      // Use the same bounding box calculation as in layout.js
      if (inst.rotationDeg === 90) {
        // For rotated graphics, calculate bounding box from center
        const graphicCenterX = inst.xIn + inst.widthIn / 2;
        const graphicCenterY = inst.yIn + inst.heightIn / 2;
        const boxWidth = inst.heightIn + (deadspaceIn * 2);
        const boxHeight = inst.widthIn + (deadspaceIn * 2);
        return {
          xIn: graphicCenterX - boxWidth / 2,
          yIn: graphicCenterY - boxHeight / 2,
          widthIn: boxWidth,
          heightIn: boxHeight,
        };
      } else {
        // Non-rotated: bounding box is graphic + deadspace on all sides
        return {
          xIn: inst.xIn - deadspaceIn,
          yIn: inst.yIn - deadspaceIn,
          widthIn: inst.widthIn + (deadspaceIn * 2),
          heightIn: inst.heightIn + (deadspaceIn * 2),
        };
      }
    });

  let positions = [];
  let maxInstances = quantity;
  let rotated = false;
  
  if (autoPack) {
    const result = autoPackDesign({
      sheetWidthIn: sheetSize.widthIn,
      sheetHeightIn: sheetSize.heightIn,
      designWidthIn,
      designHeightIn,
      quantity,
      tryRotated: true, // Try rotated orientation if needed
      existingOccupiedAreas, // Pass existing occupied areas
    });
    positions = result.positions;
    maxInstances = result.maxInstances;
    rotated = result.rotated;
  } else {
    // Place instances in a simple grid if not auto-packing, checking for overlaps and bounds
    const cols = Math.ceil(Math.sqrt(quantity));
    const spacing = 2.5; // 2.5 inch spacing
    const effectiveWidth = designWidthIn + (deadspaceIn * 2);
    const effectiveHeight = designHeightIn + (deadspaceIn * 2);
    
    let placed = 0;
    let attempts = 0;
    const maxAttempts = quantity * 100; // Prevent infinite loop
    
    for (let row = 0; row < 100 && placed < quantity && attempts < maxAttempts; row++) {
      for (let col = 0; col < cols && placed < quantity && attempts < maxAttempts; col++) {
        attempts++;
        
        // Calculate bounding box position
        const boxX = col * spacing - deadspaceIn;
        const boxY = row * spacing - deadspaceIn;
        
        // First check: Is the bounding box within sheet bounds?
        if (boxX < 0 || boxY < 0 || 
            boxX + effectiveWidth > sheetSize.widthIn || 
            boxY + effectiveHeight > sheetSize.heightIn) {
          continue; // Skip positions that go off the sheet
        }
        
        // Second check: Does this position overlap with existing instances?
        let overlaps = false;
        for (const existing of existingOccupiedAreas) {
          if (
            boxX < existing.xIn + existing.widthIn &&
            boxX + effectiveWidth > existing.xIn &&
            boxY < existing.yIn + existing.heightIn &&
            boxY + effectiveHeight > existing.yIn
          ) {
            overlaps = true;
            break;
          }
        }
        
        if (!overlaps) {
          // Graphic position (top-left of graphic, not bounding box)
          positions.push({
            xIn: boxX + deadspaceIn,
            yIn: boxY + deadspaceIn,
            rotated: 0,
          });
          placed++;
        }
      }
    }
  }

  // Create instances with final validation - STRICT bounds checking
  for (const pos of positions) {
    // Calculate bounding box using the same logic as layout.js
    let box;
    if (pos.rotated === 90) {
      const graphicCenterX = pos.xIn + designWidthIn / 2;
      const graphicCenterY = pos.yIn + designHeightIn / 2;
      const boxWidth = designHeightIn + (deadspaceIn * 2);
      const boxHeight = designWidthIn + (deadspaceIn * 2);
      box = {
        xIn: graphicCenterX - boxWidth / 2,
        yIn: graphicCenterY - boxHeight / 2,
        widthIn: boxWidth,
        heightIn: boxHeight,
      };
    } else {
      box = {
        xIn: pos.xIn - deadspaceIn,
        yIn: pos.yIn - deadspaceIn,
        widthIn: designWidthIn + (deadspaceIn * 2),
        heightIn: designHeightIn + (deadspaceIn * 2),
      };
    }
    
    // STRICT bounds check: entire bounding box must be within sheet
    if (!isWithinBounds(box.xIn, box.yIn, box.widthIn, box.heightIn, sheetSize.widthIn, sheetSize.heightIn)) {
      console.warn(`Skipping instance at (${pos.xIn.toFixed(3)}, ${pos.yIn.toFixed(3)}) - out of bounds. Box: (${box.xIn.toFixed(3)}, ${box.yIn.toFixed(3)}) size: ${box.widthIn.toFixed(3)}x${box.heightIn.toFixed(3)}, sheet: ${sheetSize.widthIn}x${sheetSize.heightIn}`);
      continue; // Skip invalid positions
    }
    
    // Additional verification: ensure graphic position coordinates are valid
    if (pos.xIn < 0 || pos.yIn < 0) {
      console.warn(`Skipping instance at (${pos.xIn}, ${pos.yIn}) - negative coordinates`);
      continue; // Skip invalid positions
    }
    
    const instance = {
      id: `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      designId,
      xIn: pos.xIn,
      yIn: pos.yIn,
      widthIn: designWidthIn,
      heightIn: designHeightIn,
      rotationDeg: pos.rotated || 0,
    };
    state.instances.push(instance);
  }

  // Notify listeners to update UI
  notifyListeners();

  // Return max instances for UI to cap quantity input
  return { maxInstances };
}

/**
 * Update an instance
 * @param {string} id
 * @param {Partial<PlacedInstance>} partial
 */
export function updateInstance(id, partial) {
  const instance = state.instances.find((i) => i.id === id);
  if (!instance) return;

  Object.assign(instance, partial);
  notifyListeners();
}

/**
 * Set selected instance
 * @param {string|null} id
 */
export function setSelectedInstance(id) {
  state.selectedInstanceId = id;
  notifyListeners();
}

/**
 * Clear all instances
 */
export function clearInstances() {
  state.instances = [];
  state.selectedInstanceId = null;
  notifyListeners();
}

/**
 * Reset all state
 */
export function resetAll() {
  state = { ...defaultState };
  notifyListeners();
}

/**
 * Set snap increment
 * @param {number} increment - Snap increment in inches (0 = off)
 */
export function setSnapIncrement(increment) {
  state.snapIncrement = increment;
  notifyListeners();
}

