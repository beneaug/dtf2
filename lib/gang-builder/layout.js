/**
 * Gang Builder Layout Logic
 * 
 * Handles auto-packing designs onto sheets and coordinate conversions.
 * Implements a Grid-based (Bitmask-like) bin packing algorithm for robust, high-density packing.
 */

/**
 * Pixels per inch for UI canvas scale (screen only)
 */
export const PX_PER_INCH_UI = 200;

/**
 * Packing Grid Resolution (Cells per Inch)
 * Higher = more precise but slower.
 * 20 = 0.05" precision (approx 1.27mm). 
 * Sufficient for 4mm (0.157") deadspace checks.
 */
const PACKING_SCALE = 20; 

/**
 * Convert inches to pixels for UI display
 */
export function convertInchesToPixels(inches) {
  return inches * PX_PER_INCH_UI;
}

/**
 * Convert pixels to inches for UI display
 */
export function convertPixelsToInches(px) {
  return px / PX_PER_INCH_UI;
}

/**
 * Check if a position is within sheet bounds
 */
export function isWithinBounds(xIn, yIn, widthIn, heightIn, sheetWidthIn, sheetHeightIn) {
  const epsilon = 0.001;
  return (
    xIn >= -epsilon &&
    yIn >= -epsilon &&
    xIn + widthIn <= sheetWidthIn + epsilon &&
    yIn + heightIn <= sheetHeightIn + epsilon
  );
}

/**
 * Grid Packer Class
 * Uses a discrete 2D grid to track occupied space.
 * Robust "First Fit" strategy (Tetris-like).
 */
class GridPacker {
  constructor(widthIn, heightIn) {
    this.scale = PACKING_SCALE;
    this.cols = Math.ceil(widthIn * this.scale);
    this.rows = Math.ceil(heightIn * this.scale);
    
    // Flattened 2D grid (0 = free, 1 = occupied)
    this.grid = new Uint8Array(this.cols * this.rows);
    
    this.sheetW = widthIn;
    this.sheetH = heightIn;
  }

  /**
   * Mark a rectangular area as occupied
   */
  occupy(xIn, yIn, wIn, hIn) {
    // Convert to grid coordinates with bounds checking
    const x = Math.floor(xIn * this.scale);
    const y = Math.floor(yIn * this.scale);
    const w = Math.ceil(wIn * this.scale);
    const h = Math.ceil(hIn * this.scale);

    const startX = Math.max(0, x);
    const startY = Math.max(0, y);
    const endX = Math.min(this.cols, x + w);
    const endY = Math.min(this.rows, y + h);

    for (let r = startY; r < endY; r++) {
      const rowOffset = r * this.cols;
      for (let c = startX; c < endX; c++) {
        this.grid[rowOffset + c] = 1;
      }
    }
  }

  /**
   * Check if an area is free
   */
  isFree(x, y, w, h) {
    if (x + w > this.cols || y + h > this.rows) return false;

    for (let r = y; r < y + h; r++) {
      const rowOffset = r * this.cols;
      // Optimization: Check start and end first?
      // Inner loop scan
      for (let c = x; c < x + w; c++) {
        if (this.grid[rowOffset + c] === 1) return false;
      }
    }
    return true;
  }

  /**
   * Find the first free position for a rectangle
   * Scans top-to-bottom, left-to-right
   * @returns {Object|null} {xIn, yIn}
   */
  findSpot(wIn, hIn) {
    const w = Math.ceil(wIn * this.scale);
    const h = Math.ceil(hIn * this.scale);

    // Optimization: maintain a "lowest free Y" index? 
    // For now, full scan is acceptable for typical sheet sizes (max 100k-1M cells).
    // 22x12 @ 20 = 440x240 = 105k cells. Fast.
    
    // To improve performance, we can iterate with larger steps or skip occupied runs,
    // but standard loops in JS are JIT optimized well.
    
    for (let y = 0; y <= this.rows - h; y++) {
      for (let x = 0; x <= this.cols - w; x++) {
        // Quick check top-left corner first
        if (this.grid[y * this.cols + x] === 1) continue;
        
        // Full check
        if (this.isFree(x, y, w, h)) {
          return {
            xIn: x / this.scale,
            yIn: y / this.scale
          };
        }
      }
    }
    
    return null;
  }
}

/**
 * Calculate the bounding box for a graphic at a given position
 */
function getBoundingBox(xIn, yIn, designWidthIn, designHeightIn, rotationDeg, deadspaceIn) {
  if (rotationDeg === 90) {
    // For rotated graphics, the bounding box dimensions are swapped
    const boxWidth = designHeightIn + (deadspaceIn * 2);
    const boxHeight = designWidthIn + (deadspaceIn * 2);
    
    // Calculate from graphic's center
    const graphicCenterX = xIn + designWidthIn / 2;
    const graphicCenterY = yIn + designHeightIn / 2;
    
    const boxX = graphicCenterX - boxWidth / 2;
    const boxY = graphicCenterY - boxHeight / 2;
    
    return { xIn: boxX, yIn: boxY, widthIn: boxWidth, heightIn: boxHeight };
  } else {
    // Non-rotated
    return {
      xIn: xIn - deadspaceIn,
      yIn: yIn - deadspaceIn,
      widthIn: designWidthIn + (deadspaceIn * 2),
      heightIn: designHeightIn + (deadspaceIn * 2),
    };
  }
}

/**
 * Auto-pack a design onto a sheet using Grid Packing (Tetris-style)
 */
export function autoPackDesign({
  sheetWidthIn,
  sheetHeightIn,
  designWidthIn,
  designHeightIn,
  quantity,
  paddingIn = 0, // Padding is handled by grid resolution rounding + deadspace
  tryRotated = true,
  existingOccupiedAreas = [],
}) {
  if (quantity <= 0) return { positions: [], maxInstances: 0, rotated: false };

  const deadspaceIn = 0.157; // 4mm
  
  // Initialize Grid Packer
  const packer = new GridPacker(sheetWidthIn, sheetHeightIn);
  
  // Mark existing areas
  existingOccupiedAreas.forEach(area => {
    packer.occupy(area.xIn, area.yIn, area.widthIn, area.heightIn);
  });

  const positions = [];
  let placedCount = 0;
  const isMaxCalculation = quantity >= 1000;
  const maxLimit = isMaxCalculation ? 2000 : quantity; // Reduced limit slightly for grid perf if max calc

  // Dimensions with deadspace
  // We pack the "Bounding Box" (Design + Deadspace)
  // Note: Grid handles the discreteness.
  
  const w0 = designWidthIn + deadspaceIn * 2;
  const h0 = designHeightIn + deadspaceIn * 2;
  
  const w90 = designHeightIn + deadspaceIn * 2;
  const h90 = designWidthIn + deadspaceIn * 2;

  for (let i = 0; i < maxLimit; i++) {
    // Try both orientations
    let bestSpot = null;
    let isBestRotated = false;

    // 1. Try 0 degrees
    const spot0 = packer.findSpot(w0, h0);
    
    // 2. Try 90 degrees (if allowed)
    let spot90 = null;
    if (tryRotated) {
      spot90 = packer.findSpot(w90, h90);
    }

    // Decision Strategy: Top-Left Preference (Standard Reading Order)
    // If one exists and other doesn't, pick existing.
    // If both exist, pick the one with lower Y, then lower X.
    
    if (spot0 && !spot90) {
      bestSpot = spot0;
      isBestRotated = false;
    } else if (!spot0 && spot90) {
      bestSpot = spot90;
      isBestRotated = true;
    } else if (spot0 && spot90) {
      // Both fit. Pick top-most, left-most.
      if (spot0.yIn < spot90.yIn - 0.01) { // Epsilon for float compare
        bestSpot = spot0;
        isBestRotated = false;
      } else if (spot90.yIn < spot0.yIn - 0.01) {
        bestSpot = spot90;
        isBestRotated = true;
      } else {
        // Same Y (roughly), check X
        if (spot0.xIn <= spot90.xIn) {
          bestSpot = spot0;
          isBestRotated = false;
        } else {
          bestSpot = spot90;
          isBestRotated = true;
        }
      }
    }

    if (bestSpot) {
      // Place it
      const boxW = isBestRotated ? w90 : w0;
      const boxH = isBestRotated ? h90 : h0;
      
      packer.occupy(bestSpot.xIn, bestSpot.yIn, boxW, boxH);
      
      // Convert Box Top-Left to Graphic Top-Left
      // Box includes deadspace.
      // boxX = gX - deadspace (if unrotated)
      // => gX = boxX + deadspace
      
      // But for rotated?
      // getBoundingBox: boxX = center - width/2.
      // We need to reverse getBoundingBox logic.
      
      const boxX = bestSpot.xIn;
      const boxY = bestSpot.yIn;
      
      let gX, gY;
      if (isBestRotated) {
        // Box is H x W
        const cx = boxX + boxW / 2;
        const cy = boxY + boxH / 2;
        gX = cx - designWidthIn / 2;
        gY = cy - designHeightIn / 2;
      } else {
        gX = boxX + deadspaceIn;
        gY = boxY + deadspaceIn;
      }
      
      positions.push({ xIn: gX, yIn: gY, rotated: isBestRotated ? 90 : 0 });
      placedCount++;
    } else {
      break; // No more room
    }
  }

  return {
    positions,
    maxInstances: placedCount,
    rotated: positions.some(p => p.rotated === 90)
  };
}

/**
 * Snap a value to a grid increment
 */
export function snapToGrid(value, increment) {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}
