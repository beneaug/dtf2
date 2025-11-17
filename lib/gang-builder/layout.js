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
 * Check if a position overlaps with existing positions
 * @param {number} xIn - X position in inches
 * @param {number} yIn - Y position in inches
 * @param {number} widthIn - Width in inches (including deadspace)
 * @param {number} heightIn - Height in inches (including deadspace)
 * @param {Array} existingPositions - Array of {xIn, yIn, widthIn, heightIn} objects
 * @returns {boolean} True if position overlaps
 */
function overlapsWithExisting(xIn, yIn, widthIn, heightIn, existingPositions) {
  for (const existing of existingPositions) {
    // Check if rectangles overlap
    if (
      xIn < existing.xIn + existing.widthIn &&
      xIn + widthIn > existing.xIn &&
      yIn < existing.yIn + existing.heightIn &&
      yIn + heightIn > existing.yIn
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Auto-pack a design onto a sheet using a simple grid-based algorithm
 * Accounts for 4mm deadspace around each transfer
 * Tries to pack in default orientation first, then fills remaining space with rotated instances
 * 
 * @param {Object} params
 * @param {number} params.sheetWidthIn - Sheet width in inches
 * @param {number} params.sheetHeightIn - Sheet height in inches
 * @param {number} params.designWidthIn - Design width in inches
 * @param {number} params.designHeightIn - Design height in inches
 * @param {number} params.quantity - Number of instances to place
 * @param {number} [params.paddingIn=0.125] - Padding between instances in inches (default: 1/8 inch)
 * @param {boolean} [params.tryRotated=false] - Whether to try rotated orientation in remaining space
 * @param {Array} [params.existingOccupiedAreas=[]] - Array of {xIn, yIn, widthIn, heightIn} for existing instances
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
  existingOccupiedAreas = [],
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

  // Phase 1: Pack in default orientation
  let cols = Math.floor(sheetWidthIn / cellWidth);
  let rows = Math.floor(sheetHeightIn / cellHeight);
  let maxInstances = cols * rows;
  
  const positions = [];
  // Start with existing occupied areas to prevent overlaps with other designs
  const occupiedAreas = [...existingOccupiedAreas];
  
  // Pack as many as possible in default orientation
  const cellW = effectiveWidth + paddingIn;
  const cellH = effectiveHeight + paddingIn;
  let placedCount = 0;
  
  // Limit iterations to prevent going off sheet
  const maxIterations = Math.min(quantity, maxInstances, rows * cols);
  
  for (let i = 0; i < maxIterations; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    
    // Safety check: ensure row/col don't exceed calculated limits
    if (row >= rows || col >= cols) break;
    
    // Calculate bounding box position
    const boxXIn = col * cellW + paddingIn / 2;
    const boxYIn = row * cellH + paddingIn / 2;
    
    // Check if bounding box is within sheet bounds (double-check)
    if (!isWithinBounds(boxXIn, boxYIn, effectiveWidth, effectiveHeight, sheetWidthIn, sheetHeightIn)) {
      continue; // Skip positions that go off the sheet
    }
    
    // Check if this position overlaps with existing positions
    if (!overlapsWithExisting(
      boxXIn,
      boxYIn,
      effectiveWidth,
      effectiveHeight,
      occupiedAreas
    )) {
      // Graphic position (top-left of graphic, not bounding box)
      const xIn = boxXIn + deadspaceIn;
      const yIn = boxYIn + deadspaceIn;
      
      positions.push({ xIn, yIn, rotated: 0 });
      occupiedAreas.push({
        xIn: boxXIn,
        yIn: boxYIn,
        widthIn: effectiveWidth,
        heightIn: effectiveHeight,
      });
      placedCount++;
      
      if (placedCount >= quantity) break;
    }
  }

  // Phase 2: If tryRotated is true and we haven't placed all requested, try rotated in remaining space
  let rotatedMaxInstances = 0;
  const isMaxCalculation = quantity >= 1000; // If quantity is very large, we're calculating max
  
  if (tryRotated && (placedCount < quantity || isMaxCalculation)) {
    const rotatedWidth = effectiveHeight;
    const rotatedHeight = effectiveWidth;
    const rotatedCellWidth = rotatedWidth + paddingIn;
    const rotatedCellHeight = rotatedHeight + paddingIn;
    
    const rotatedCols = Math.floor(sheetWidthIn / rotatedCellWidth);
    const rotatedRows = Math.floor(sheetHeightIn / rotatedCellHeight);
    
    // Try to place rotated instances in remaining space
    const rotatedCellW = rotatedWidth + paddingIn;
    const rotatedCellH = rotatedHeight + paddingIn;
    
    // Count how many rotated instances can actually fit
    let rotatedFitCount = 0;
    
    for (let row = 0; row < rotatedRows; row++) {
      for (let col = 0; col < rotatedCols; col++) {
        // For max calculation, continue placing even after quantity is reached
        // For normal placement, stop when quantity is reached
        if (!isMaxCalculation && placedCount >= quantity) break;
        
        // Calculate the bounding box position (top-left of the rotated bounding box)
        const rotatedBoxXIn = col * rotatedCellW + paddingIn / 2;
        const rotatedBoxYIn = row * rotatedCellH + paddingIn / 2;
        
        // Check if bounding box is within sheet bounds
        if (!isWithinBounds(rotatedBoxXIn, rotatedBoxYIn, rotatedWidth, rotatedHeight, sheetWidthIn, sheetHeightIn)) {
          continue; // Skip positions that go off the sheet
        }
        
        // Check if this position overlaps with existing positions
        if (!overlapsWithExisting(
          rotatedBoxXIn,
          rotatedBoxYIn,
          rotatedWidth,
          rotatedHeight,
          occupiedAreas
        )) {
          // The bounding box center
          const boxCenterX = rotatedBoxXIn + rotatedWidth / 2;
          const boxCenterY = rotatedBoxYIn + rotatedHeight / 2;
          
          // For a 90-degree clockwise rotation:
          // The graphic's original top-left (before rotation) relative to bounding box center
          // After rotation, the graphic's height becomes the x-dimension
          // Graphic top-left = boxCenter - (graphicHeight/2, graphicWidth/2)
          const xIn = boxCenterX - designHeightIn / 2;
          const yIn = boxCenterY - designWidthIn / 2;
          
          // Only add to positions if we haven't reached quantity (or if calculating max)
          if (isMaxCalculation || placedCount < quantity) {
            positions.push({ xIn, yIn, rotated: 90 });
            placedCount++;
          }
          
          // Always track occupied areas and count fits for max calculation
          occupiedAreas.push({
            xIn: rotatedBoxXIn,
            yIn: rotatedBoxYIn,
            widthIn: rotatedWidth,
            heightIn: rotatedHeight,
          });
          rotatedFitCount++;
        }
      }
      if (!isMaxCalculation && placedCount >= quantity) break;
    }
    
    rotatedMaxInstances = rotatedFitCount;
  }

  // Total max instances is the sum of non-rotated max + rotated that can fit
  const totalMaxInstances = maxInstances + rotatedMaxInstances;

  return { positions, maxInstances: totalMaxInstances, rotated: positions.some(p => p.rotated === 90) };
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

