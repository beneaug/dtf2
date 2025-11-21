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
 * Helper to calculate packing for a specific primary strategy
 */
function packWithStrategy(params, forcePrimaryRotation) {
  const {
    sheetWidthIn, sheetHeightIn, designWidthIn, designHeightIn,
    quantity, paddingIn, existingOccupiedAreas, isMaxCalculation
  } = params;

  const positions = [];
  const occupiedAreas = [...existingOccupiedAreas];
  let placedCount = 0;
  const deadspaceIn = 0.157;

  // Dimensions for primary orientation
  const primaryW = forcePrimaryRotation ? designHeightIn : designWidthIn;
  const primaryH = forcePrimaryRotation ? designWidthIn : designHeightIn;
  
  // Effective dimensions (box)
  const effectiveW = primaryW + (deadspaceIn * 2);
  const effectiveH = primaryH + (deadspaceIn * 2);
  
  // Cell size
  const cellW = effectiveW + paddingIn;
  const cellH = effectiveH + paddingIn;

  // Grid Phase
  const cols = Math.max(1, Math.floor(sheetWidthIn / cellW));
  const rows = Math.max(1, Math.floor(sheetHeightIn / cellH));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isMaxCalculation && placedCount >= quantity) break;

      // Grid position is top-left of CELL
      // We need to calculate graphic position
      const cellX = col * cellW + paddingIn / 2;
      const cellY = row * cellH + paddingIn / 2;
      
      let xIn, yIn;
      
      if (forcePrimaryRotation) {
        // If rotated, the effective W/H is bounding box.
        // Bounding box center = Cell center
        const boxCenterX = cellX + effectiveW / 2;
        const boxCenterY = cellY + effectiveH / 2;
        
        // Graphic top-left
        xIn = boxCenterX - designWidthIn / 2; // Note: designWidthIn/HeightIn are unswapped props
        yIn = boxCenterY - designHeightIn / 2; // Wait, unrotated dimensions?
        
        // Re-verify getBoundingBox logic:
        // graphicCenterX = xIn + designWidthIn / 2
        // boxX = graphicCenterX - boxWidth / 2
        
        // Here we want to place the BOX at cellX, cellY (plus deadspace offset?)
        // Actually, simpler:
        // cellX/Y is top-left of where we want the bounding box (roughly)
        // Let's aim for bounding box at cellX, cellY.
        // box.xIn = cellX
        // box.yIn = cellY
        // box.widthIn = effectiveW
        // box.heightIn = effectiveH
        
        // Reverse map to graphic xIn/yIn:
        // boxX = (xIn + designWidthIn/2) - boxWidth/2
        // => xIn = boxX + boxWidth/2 - designWidthIn/2
        // boxY = (yIn + designHeightIn/2) - boxHeight/2
        // => yIn = boxY + boxHeight/2 - designHeightIn/2
        
        // Note: effectiveW IS boxWidth (roughly, assuming box calc matches)
        // effectiveW = designHeightIn + deadspace*2 (for rotated)
        // boxWidth = designHeightIn + deadspace*2
        // Matches.
        
        xIn = cellX + effectiveW / 2 - designWidthIn / 2;
        yIn = cellY + effectiveH / 2 - designHeightIn / 2;
        
      } else {
        // Default orientation
        // box.xIn = cellX
        // box.yIn = cellY
        // xIn = boxX + deadspaceIn
        xIn = cellX + deadspaceIn;
        yIn = cellY + deadspaceIn;
      }
      
      if (isValidPosition(xIn, yIn, designWidthIn, designHeightIn, forcePrimaryRotation ? 90 : 0, deadspaceIn, sheetWidthIn, sheetHeightIn, occupiedAreas)) {
        positions.push({ xIn, yIn, rotated: forcePrimaryRotation ? 90 : 0 });
        const box = getBoundingBox(xIn, yIn, designWidthIn, designHeightIn, forcePrimaryRotation ? 90 : 0, deadspaceIn);
        occupiedAreas.push(box);
        placedCount++;
      }
    }
    if (!isMaxCalculation && placedCount >= quantity) break;
  }

  // Gap Filling Phase
  // Try BOTH orientations in gaps, prioritizing primary
  if (placedCount < quantity || isMaxCalculation) {
    const stepSize = Math.max(0.05, Math.min(paddingIn * 0.5, 0.125)); 
    const maxAttempts = 15000; // Cap iterations
    let attempts = 0;

    // Pre-calculate dimensions for both
    // 0 deg
    const w0 = designWidthIn + deadspaceIn * 2;
    const h0 = designHeightIn + deadspaceIn * 2;
    // 90 deg
    const w90 = designHeightIn + deadspaceIn * 2;
    const h90 = designWidthIn + deadspaceIn * 2;

    // Scan grid
    for (let y = 0; y <= sheetHeightIn - Math.min(h0, h90) && attempts < maxAttempts; y += stepSize) {
      for (let x = 0; x <= sheetWidthIn - Math.min(w0, w90) && attempts < maxAttempts; x += stepSize) {
        attempts++;
        if (!isMaxCalculation && placedCount >= quantity) break;

        // Try Primary First
        let success = false;
        
        // Primary Attempt
        const tryRotated = forcePrimaryRotation;
        const boxW = tryRotated ? w90 : w0;
        const boxH = tryRotated ? h90 : h0;
        
        // Calculate graphic pos from box pos (x, y)
        let gX, gY;
        if (tryRotated) {
           gX = x + boxW / 2 - designWidthIn / 2;
           gY = y + boxH / 2 - designHeightIn / 2;
        } else {
           gX = x + deadspaceIn;
           gY = y + deadspaceIn;
        }

        if (isValidPosition(gX, gY, designWidthIn, designHeightIn, tryRotated ? 90 : 0, deadspaceIn, sheetWidthIn, sheetHeightIn, occupiedAreas)) {
           positions.push({ xIn: gX, yIn: gY, rotated: tryRotated ? 90 : 0 });
           occupiedAreas.push(getBoundingBox(gX, gY, designWidthIn, designHeightIn, tryRotated ? 90 : 0, deadspaceIn));
           placedCount++;
           success = true;
        }

        // Secondary Attempt (if primary failed)
        if (!success) {
           const tryRotated2 = !forcePrimaryRotation;
           const boxW2 = tryRotated2 ? w90 : w0;
           const boxH2 = tryRotated2 ? h90 : h0;
           
           // Ensure this fits in the remaining sheet from x,y
           if (x + boxW2 <= sheetWidthIn && y + boxH2 <= sheetHeightIn) {
               let gX2, gY2;
               if (tryRotated2) {
                 gX2 = x + boxW2 / 2 - designWidthIn / 2;
                 gY2 = y + boxH2 / 2 - designHeightIn / 2;
               } else {
                 gX2 = x + deadspaceIn;
                 gY2 = y + deadspaceIn;
               }

               if (isValidPosition(gX2, gY2, designWidthIn, designHeightIn, tryRotated2 ? 90 : 0, deadspaceIn, sheetWidthIn, sheetHeightIn, occupiedAreas)) {
                 positions.push({ xIn: gX2, yIn: gY2, rotated: tryRotated2 ? 90 : 0 });
                 occupiedAreas.push(getBoundingBox(gX2, gY2, designWidthIn, designHeightIn, tryRotated2 ? 90 : 0, deadspaceIn));
                 placedCount++;
                 success = true;
               }
           }
        }
        
        // Optimization: if we placed something, advance x by its width to skip filled space?
        // But step loop controls x. Manually advancing might miss tight fits below?
        // Let's just stick to grid scan, it's robust.
      }
      if (!isMaxCalculation && placedCount >= quantity) break;
    }
  }

  return { positions, count: placedCount };
}

/**
 * Auto-pack a design onto a sheet
 * Optimizes by trying both orientations and picking the best packing strategy.
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

  const isMaxCalculation = quantity >= 1000;
  const commonParams = {
    sheetWidthIn, sheetHeightIn, designWidthIn, designHeightIn,
    quantity, paddingIn, existingOccupiedAreas, isMaxCalculation
  };

  // Strategy 1: Primary Default Orientation
  const resultDefault = packWithStrategy(commonParams, false);

  // Strategy 2: Primary Rotated Orientation (only if tryRotated is true)
  let resultRotated = { positions: [], count: -1 };
  if (tryRotated) {
    resultRotated = packWithStrategy(commonParams, true);
  }

  // Pick Winner
  // If quantity is limited (not max calc), pick the one that hit quantity with least space?
  // Actually, if both hit quantity, they are equal.
  // If max calc, pick highest count.
  
  let winner;
  if (resultRotated.count > resultDefault.count) {
    winner = resultRotated;
  } else {
    winner = resultDefault;
  }

  return {
    positions: winner.positions,
    maxInstances: winner.count,
    rotated: winner.positions.some(p => p.rotated === 90) // Just a flag if *any* are rotated
  };
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
