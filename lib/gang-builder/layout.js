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
  // Use strict comparison with small epsilon to handle floating point precision
  const epsilon = 0.001;
  return (
    xIn >= -epsilon &&
    yIn >= -epsilon &&
    xIn + widthIn <= sheetWidthIn + epsilon &&
    yIn + heightIn <= sheetHeightIn + epsilon
  );
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
    // Check if rectangles overlap (with a small tolerance to prevent edge cases)
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
 * Calculate the bounding box for a graphic at a given position
 * @param {number} xIn - Graphic top-left X (in original orientation)
 * @param {number} yIn - Graphic top-left Y (in original orientation)
 * @param {number} designWidthIn - Graphic width in original orientation
 * @param {number} designHeightIn - Graphic height in original orientation
 * @param {number} rotationDeg - Rotation in degrees (0 or 90)
 * @param {number} deadspaceIn - Deadspace in inches
 * @returns {Object} {xIn, yIn, widthIn, heightIn} bounding box
 */
function getBoundingBox(xIn, yIn, designWidthIn, designHeightIn, rotationDeg, deadspaceIn) {
  if (rotationDeg === 90) {
    // For rotated graphics, the bounding box dimensions are swapped
    // The graphic's width becomes the bounding box height, and vice versa
    const boxWidth = designHeightIn + (deadspaceIn * 2);
    const boxHeight = designWidthIn + (deadspaceIn * 2);
    
    // For 90-degree rotation, we need to calculate where the bounding box top-left is
    // The graphic position (xIn, yIn) is the top-left of the graphic in its original orientation
    // After rotation, the graphic occupies a different space
    // The bounding box should fully contain the rotated graphic + deadspace
    
    // When rotated 90 degrees clockwise:
    // - Original top-left becomes the top-right of the rotated graphic
    // - The bounding box top-left is: (xIn - designHeightIn, yIn)
    //   But we need to account for deadspace, so: (xIn - designHeightIn - deadspaceIn, yIn - deadspaceIn)
    
    // Actually, let's think about this more carefully:
    // If we rotate a graphic 90 degrees clockwise around its center:
    // - The graphic's top-left (xIn, yIn) in original orientation
    // - After rotation, the graphic's new top-left would be at (xIn - designHeightIn, yIn)
    // - But we want the bounding box that contains the rotated graphic + deadspace
    
    // Simpler approach: calculate from the graphic's center
    const graphicCenterX = xIn + designWidthIn / 2;
    const graphicCenterY = yIn + designHeightIn / 2;
    
    // After 90-degree rotation, the bounding box center is the same as graphic center
    // The bounding box dimensions are swapped
    const boxX = graphicCenterX - boxWidth / 2;
    const boxY = graphicCenterY - boxHeight / 2;
    
    return { xIn: boxX, yIn: boxY, widthIn: boxWidth, heightIn: boxHeight };
  } else {
    // Non-rotated: bounding box is graphic + deadspace on all sides
    return {
      xIn: xIn - deadspaceIn,
      yIn: yIn - deadspaceIn,
      widthIn: designWidthIn + (deadspaceIn * 2),
      heightIn: designHeightIn + (deadspaceIn * 2),
    };
  }
}

/**
 * Check if a graphic position is valid (within bounds and no overlaps)
 * @param {number} xIn - Graphic top-left X (in original orientation)
 * @param {number} yIn - Graphic top-left Y (in original orientation)
 * @param {number} designWidthIn - Graphic width
 * @param {number} designHeightIn - Graphic height
 * @param {number} rotationDeg - Rotation in degrees
 * @param {number} deadspaceIn - Deadspace in inches
 * @param {number} sheetWidthIn - Sheet width
 * @param {number} sheetHeightIn - Sheet height
 * @param {Array} occupiedAreas - Existing occupied areas
 * @returns {boolean} True if position is valid
 */
function isValidPosition(xIn, yIn, designWidthIn, designHeightIn, rotationDeg, deadspaceIn, sheetWidthIn, sheetHeightIn, occupiedAreas) {
  // Get the bounding box for this position
  const box = getBoundingBox(xIn, yIn, designWidthIn, designHeightIn, rotationDeg, deadspaceIn);
  
  // Check if bounding box is within sheet bounds
  if (!isWithinBounds(box.xIn, box.yIn, box.widthIn, box.heightIn, sheetWidthIn, sheetHeightIn)) {
    return false;
  }
  
  // Check if bounding box overlaps with existing positions
  if (overlapsWithExisting(box.xIn, box.yIn, box.widthIn, box.heightIn, occupiedAreas)) {
    return false;
  }
  
  return true;
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
  const cellW = effectiveWidth + paddingIn;
  const cellH = effectiveHeight + paddingIn;
  
  const positions = [];
  const occupiedAreas = [...existingOccupiedAreas];
  
  let placedCount = 0;
  let maxFitCount = 0;
  const isMaxCalculation = quantity >= 1000;
  
  // Phase 1: Pack in default orientation
  const cols = Math.max(1, Math.floor(sheetWidthIn / cellW));
  const rows = Math.max(1, Math.floor(sheetHeightIn / cellH));
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isMaxCalculation && placedCount >= quantity) break;
      
      // Calculate potential graphic position (top-left of graphic in original orientation)
      const xIn = col * cellW + paddingIn / 2 + deadspaceIn;
      const yIn = row * cellH + paddingIn / 2 + deadspaceIn;
      
      // Check if this position is valid
      if (isValidPosition(xIn, yIn, designWidthIn, designHeightIn, 0, deadspaceIn, sheetWidthIn, sheetHeightIn, occupiedAreas)) {
        maxFitCount++;
        
        if (isMaxCalculation || placedCount < quantity) {
          positions.push({ xIn, yIn, rotated: 0 });
          
          // Add to occupied areas
          const box = getBoundingBox(xIn, yIn, designWidthIn, designHeightIn, 0, deadspaceIn);
          occupiedAreas.push(box);
          placedCount++;
        }
      }
    }
    if (!isMaxCalculation && placedCount >= quantity) break;
  }
  
  const maxInstances = maxFitCount;
  
  // Phase 2: Try rotated orientation if requested - use intelligent gap-filling
  let rotatedMaxInstances = 0;
  
  if (tryRotated && (placedCount < quantity || isMaxCalculation)) {
    // For rotated, swap dimensions
    const rotatedEffectiveWidth = effectiveHeight;
    const rotatedEffectiveHeight = effectiveWidth;
    const rotatedCellW = rotatedEffectiveWidth + paddingIn;
    const rotatedCellH = rotatedEffectiveHeight + paddingIn;
    
    // First, try grid-based placement (similar to Phase 1)
    const rotatedCols = Math.max(1, Math.floor(sheetWidthIn / rotatedCellW));
    const rotatedRows = Math.max(1, Math.floor(sheetHeightIn / rotatedCellH));
    
    let rotatedFitCount = 0;
    
    // Try grid positions first
    for (let row = 0; row < rotatedRows; row++) {
      for (let col = 0; col < rotatedCols; col++) {
        if (!isMaxCalculation && placedCount >= quantity) break;
        
        const cellX = col * rotatedCellW + paddingIn / 2;
        const cellY = row * rotatedCellH + paddingIn / 2;
        
        const boxCenterX = cellX + rotatedEffectiveWidth / 2;
        const boxCenterY = cellY + rotatedEffectiveHeight / 2;
        
        const xIn = boxCenterX - designHeightIn / 2;
        const yIn = boxCenterY - designWidthIn / 2;
        
        if (isValidPosition(xIn, yIn, designWidthIn, designHeightIn, 90, deadspaceIn, sheetWidthIn, sheetHeightIn, occupiedAreas)) {
          rotatedFitCount++;
          
          if (isMaxCalculation || placedCount < quantity) {
            positions.push({ xIn, yIn, rotated: 90 });
            const box = getBoundingBox(xIn, yIn, designWidthIn, designHeightIn, 90, deadspaceIn);
            occupiedAreas.push(box);
            placedCount++;
          }
        }
      }
      if (!isMaxCalculation && placedCount >= quantity) break;
    }
    
    // Phase 2b: Intelligent gap-filling - try to place in remaining spaces
    // Use a finer grid to find gaps between existing placements, but be smart about it
    if (placedCount < quantity || isMaxCalculation) {
      // Use a step size that's reasonable - not too fine (slow) but fine enough to find gaps
      const stepSize = Math.max(0.05, Math.min(paddingIn * 0.5, 0.125)); // Between 0.05 and 0.125 inches
      const maxAttempts = 3000; // Limit attempts to prevent infinite loops
      let attempts = 0;
      
      // Try placing rotated instances in gaps
      // Start from top-left and scan systematically
      for (let y = 0; y <= sheetHeightIn - rotatedEffectiveHeight && attempts < maxAttempts; y += stepSize) {
        for (let x = 0; x <= sheetWidthIn - rotatedEffectiveWidth && attempts < maxAttempts; x += stepSize) {
          attempts++;
          
          if (!isMaxCalculation && placedCount >= quantity) break;
          
          // Calculate graphic position for this potential bounding box location
          const boxCenterX = x + rotatedEffectiveWidth / 2;
          const boxCenterY = y + rotatedEffectiveHeight / 2;
          const xIn = boxCenterX - designHeightIn / 2;
          const yIn = boxCenterY - designWidthIn / 2;
          
          if (isValidPosition(xIn, yIn, designWidthIn, designHeightIn, 90, deadspaceIn, sheetWidthIn, sheetHeightIn, occupiedAreas)) {
            rotatedFitCount++;
            
            if (isMaxCalculation || placedCount < quantity) {
              positions.push({ xIn, yIn, rotated: 90 });
              const box = getBoundingBox(xIn, yIn, designWidthIn, designHeightIn, 90, deadspaceIn);
              occupiedAreas.push(box);
              placedCount++;
            }
          }
        }
        if (!isMaxCalculation && placedCount >= quantity) break;
      }
    }
    
    rotatedMaxInstances = rotatedFitCount;
  }
  
  const totalMaxInstances = maxInstances + rotatedMaxInstances;
  
  return { positions, maxInstances: totalMaxInstances, rotated: positions.some(p => p.rotated === 90) };
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
