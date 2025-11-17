/**
 * Gang Builder State Management
 * 
 * Simple state management for the gang builder using a reactive pattern.
 */

import { SHEET_SIZES } from "./config.js";
import { autoPackDesign } from "./layout.js";

/**
 * @typedef {Object} DesignFile
 * @property {string} id - Unique identifier
 * @property {string} name - File name
 * @property {string} url - Object URL or data URL
 * @property {number} naturalWidthPx - Natural width in pixels
 * @property {number} naturalHeightPx - Natural height in pixels
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
  state.designFiles.push(file);
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
  if (!design) return;

  const sheetSize = SHEET_SIZES.find((s) => s.id === state.selectedSheetSizeId);
  if (!sheetSize) return;

  // Calculate design size in inches (assuming 300 DPI for conversion)
  // For now, use a simple aspect-ratio preserving size
  const designAspect = design.naturalWidthPx / design.naturalHeightPx;
  const baseSizeIn = 2; // Default 2 inches for smaller dimension
  let designWidthIn, designHeightIn;

  if (designAspect >= 1) {
    designWidthIn = baseSizeIn * designAspect;
    designHeightIn = baseSizeIn;
  } else {
    designWidthIn = baseSizeIn;
    designHeightIn = baseSizeIn / designAspect;
  }

  let positions = [];
  if (autoPack) {
    positions = autoPackDesign({
      sheetWidthIn: sheetSize.widthIn,
      sheetHeightIn: sheetSize.heightIn,
      designWidthIn,
      designHeightIn,
      quantity,
    });
  } else {
    // Place instances in a simple grid if not auto-packing
    const cols = Math.ceil(Math.sqrt(quantity));
    const spacing = 2.5; // 2.5 inch spacing
    for (let i = 0; i < quantity; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.push({
        xIn: col * spacing,
        yIn: row * spacing,
      });
    }
  }

  // Create instances
  for (const pos of positions) {
    const instance = {
      id: `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      designId,
      xIn: pos.xIn,
      yIn: pos.yIn,
      widthIn: designWidthIn,
      heightIn: designHeightIn,
      rotationDeg: 0,
    };
    state.instances.push(instance);
  }

  notifyListeners();
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

