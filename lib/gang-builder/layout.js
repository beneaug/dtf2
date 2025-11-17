/**
 * Gang Builder Layout Logic
 * 
 * Handles auto-packing designs onto sheets and coordinate conversions.
 */

/**
 * Pixels per inch for UI canvas scale (screen only)
 * Standard value - zoom is handled by scale multiplier in canvas
 */
export const PX_PER_INCH_UI = 50;

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
 * 
 * @param {Object} params
 * @param {number} params.sheetWidthIn - Sheet width in inches
 * @param {number} params.sheetHeightIn - Sheet height in inches
 * @param {number} params.designWidthIn - Design width in inches
 * @param {number} params.designHeightIn - Design height in inches
 * @param {number} params.quantity - Number of instances to place
 * @param {number} [params.paddingIn=0.125] - Padding between instances in inches (default: 1/8 inch)
 * @returns {Array<{xIn: number, yIn: number}>} Array of positions for each instance
 */
export function autoPackDesign({
  sheetWidthIn,
  sheetHeightIn,
  designWidthIn,
  designHeightIn,
  quantity,
  paddingIn = 0.125,
}) {
  if (quantity <= 0) return [];

  // Compute cell size (design + padding)
  const cellWidth = designWidthIn + paddingIn;
  const cellHeight = designHeightIn + paddingIn;

  // Compute how many columns and rows fit
  const cols = Math.floor(sheetWidthIn / cellWidth);
  const rows = Math.floor(sheetHeightIn / cellHeight);

  // Maximum instances that can fit
  const maxInstances = cols * rows;

  // Place up to min(quantity, maxInstances) instances
  const instancesToPlace = Math.min(quantity, maxInstances);
  const positions = [];

  for (let i = 0; i < instancesToPlace; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const xIn = col * cellWidth + paddingIn / 2;
    const yIn = row * cellHeight + paddingIn / 2;

    positions.push({ xIn, yIn });
  }

  return positions;
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

