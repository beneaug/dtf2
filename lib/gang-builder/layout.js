/**
 * Gang Builder Layout Logic
 * 
 * Handles auto-packing designs onto sheets and coordinate conversions.
 */

/**
 * Pixels per inch for UI canvas scale (screen only)
 * Higher value = more zoomed in view
 * Set high enough to get a large preview while still fitting in canvas
 */
export const PX_PER_INCH_UI = 200;

/**
 * Convert inches to pixels for UI display
 * @param {number} inches - Measurement in inches
 * @returns {number} Measurement in pixels
 */
export function convertInchesToPixels(inches) {
  return inches * PX_PER_INCH_UI;
}

/**
 * Convert pixels to inches for UI display
 * @param {number} px - Measurement in pixels
 * @returns {number} Measurement in inches
 */
export function convertPixelsToInches(px) {
  return px / PX_PER_INCH_UI;
}

/**
 * Auto-pack a design onto a sheet using a simple grid-based algorithm
 * Accounts for 4mm deadspace around each transfer
 * 
 * @param {Object} params
 * @param {number} params.sheetWidthIn - Sheet width in inches
 * @param {number} params.sheetHeightIn - Sheet height in inches
 * @param {number} params.designWidthIn - Design width in inches
 * @param {number} params.designHeightIn - Design height in inches
 * @param {number} params.quantity - Number of instances to place
 * @param {number} [params.paddingIn=0.125] - Padding between instances in inches (default: 1/8 inch)
 * @param {boolean} [params.tryRotated=false] - Whether to try rotated orientation
 * @returns {Object} Object with positions array and maxInstances count
 */
export function autoPackDesign({
  sheetWidthIn,
  sheetHeightIn,
  designWidthIn,
  designHeightIn,
  quantity,
  paddingIn = 0.125,
  tryRotated = false,
}) {
  if (quantity <= 0) return { positions: [], maxInstances: 0, rotated: false };

  // 4mm deadspace (0.157 inches) on all sides
  const deadspaceIn = 0.157;
  
  // Effective size includes deadspace (deadspace on both sides = 2x)
  const effectiveWidth = designWidthIn + (deadspaceIn * 2);
  const effectiveHeight = designHeightIn + (deadspaceIn * 2);
  
  // Cell size includes padding between instances
  const cellWidth = effectiveWidth + paddingIn;
  const cellHeight = effectiveHeight + paddingIn;

  // Compute how many columns and rows fit in default orientation
  let cols = Math.floor(sheetWidthIn / cellWidth);
  let rows = Math.floor(sheetHeightIn / cellHeight);
  let maxInstances = cols * rows;
  let rotated = false;
  let finalWidth = effectiveWidth;
  let finalHeight = effectiveHeight;

  // Always try rotating 90 degrees if requested, to see if it fits more instances
  if (tryRotated) {
    // Try rotated orientation (swap width/height)
    const rotatedWidth = effectiveHeight;
    const rotatedHeight = effectiveWidth;
    const rotatedCellWidth = rotatedWidth + paddingIn;
    const rotatedCellHeight = rotatedHeight + paddingIn;
    
    const rotatedCols = Math.floor(sheetWidthIn / rotatedCellWidth);
    const rotatedRows = Math.floor(sheetHeightIn / rotatedCellHeight);
    const rotatedMaxInstances = rotatedCols * rotatedRows;
    
    // Use rotated if it fits more instances (or same number but might be better layout)
    if (rotatedMaxInstances > maxInstances) {
      cols = rotatedCols;
      rows = rotatedRows;
      maxInstances = rotatedMaxInstances;
      rotated = true;
      finalWidth = rotatedWidth;
      finalHeight = rotatedHeight;
    }
  }

  // Cap quantity to maximum that can fit
  const instancesToPlace = Math.min(quantity, maxInstances);
  const positions = [];

  const cellW = finalWidth + paddingIn;
  const cellH = finalHeight + paddingIn;

  for (let i = 0; i < instancesToPlace; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Position is the graphic position (top-left of the graphic itself)
    // The cell includes deadspace, so we position at the start of the cell plus deadspace offset
    const xIn = col * cellW + paddingIn / 2 + deadspaceIn;
    const yIn = row * cellH + paddingIn / 2 + deadspaceIn;

    positions.push({ xIn, yIn, rotated: rotated ? 90 : 0 });
  }

  return { positions, maxInstances, rotated };
}

/**
 * Check if a position is within sheet bounds
 * @param {number} xIn - X position in inches
 * @param {number} yIn - Y position in inches
 * @param {number} widthIn - Width in inches
 * @param {number} heightIn - Height in inches
 * @param {number} sheetWidthIn - Sheet width in inches
 * @param {number} sheetHeightIn - Sheet height in inches
 * @returns {boolean} True if position is within bounds
 */
export function isWithinBounds(xIn, yIn, widthIn, heightIn, sheetWidthIn, sheetHeightIn) {
  return (
    xIn >= 0 &&
    yIn >= 0 &&
    xIn + widthIn <= sheetWidthIn &&
    yIn + heightIn <= sheetHeightIn
  );
}

/**
 * Snap a value to a grid increment
 * @param {number} value - Value to snap
 * @param {number} increment - Grid increment (e.g., 0.125 for 1/8 inch)
 * @returns {number} Snapped value
 */
export function snapToGrid(value, increment) {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

