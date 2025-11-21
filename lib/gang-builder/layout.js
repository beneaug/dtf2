/**
 * Gang Builder Layout Logic
 * 
 * Handles auto-packing designs onto sheets and coordinate conversions.
 * Implements Maximal Rectangles (MaxRects) algorithm for efficient bin packing.
 */

/**
 * Pixels per inch for UI canvas scale (screen only)
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
 * Maximal Rectangles Packer Class
 * Implements the MaxRects algorithm for efficient 2D bin packing.
 */
class MaxRectsPacker {
  constructor(width, height) {
    this.binWidth = width;
    this.binHeight = height;
    this.freeRects = [];
    this.usedRects = [];
    
    // Initialize with one free rect covering the whole bin
    this.freeRects.push({
      x: 0,
      y: 0,
      width: width,
      height: height
    });
  }

  /**
   * Pack a rectangle into the bin
   * @param {number} width 
   * @param {number} height 
   * @param {boolean} allowRotation 
   * @returns {Object|null} {x, y, rotated} or null if no fit
   */
  pack(width, height, allowRotation = true) {
    // Find best free rect
    // Heuristic: Best Short Side Fit (BSSF)
    // Minimizes the length of the shorter leftover side
    
    let bestNode = { x: 0, y: 0, width: 0, height: 0 };
    let bestShortSideFit = Number.MAX_VALUE;
    let bestLongSideFit = Number.MAX_VALUE;
    let bestRotated = false;
    let found = false;

    for (let i = 0; i < this.freeRects.length; i++) {
      const freeRect = this.freeRects[i];
      
      // Try unrotated
      if (freeRect.width >= width && freeRect.height >= height) {
        const leftoverHoriz = Math.abs(freeRect.width - width);
        const leftoverVert = Math.abs(freeRect.height - height);
        const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
        const longSideFit = Math.max(leftoverHoriz, leftoverVert);

        if (shortSideFit < bestShortSideFit || (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
          bestNode = { x: freeRect.x, y: freeRect.y, width: width, height: height };
          bestShortSideFit = shortSideFit;
          bestLongSideFit = longSideFit;
          bestRotated = false;
          found = true;
        }
      }

      // Try rotated
      if (allowRotation && freeRect.width >= height && freeRect.height >= width) {
        const leftoverHoriz = Math.abs(freeRect.width - height);
        const leftoverVert = Math.abs(freeRect.height - width);
        const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
        const longSideFit = Math.max(leftoverHoriz, leftoverVert);

        if (shortSideFit < bestShortSideFit || (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
          bestNode = { x: freeRect.x, y: freeRect.y, width: height, height: width };
          bestShortSideFit = shortSideFit;
          bestLongSideFit = longSideFit;
          bestRotated = true;
          found = true;
        }
      }
    }

    if (found) {
      this.placeRect(bestNode);
      return {
        x: bestNode.x,
        y: bestNode.y,
        width: bestNode.width,
        height: bestNode.height,
        rotated: bestRotated
      };
    }

    return null;
  }

  /**
   * Place a rectangle and update free rects
   */
  placeRect(rect) {
    const numFreeRects = this.freeRects.length;
    for (let i = 0; i < numFreeRects; i++) {
      if (this.splitFreeNode(this.freeRects[i], rect)) {
        this.freeRects.splice(i, 1);
        i--;
      }
    }
    this.pruneFreeList();
    this.usedRects.push(rect);
  }

  /**
   * Split a free node against a placed rect
   */
  splitFreeNode(freeNode, usedNode) {
    // Test if overlapping
    if (usedNode.x >= freeNode.x + freeNode.width || usedNode.x + usedNode.width <= freeNode.x ||
        usedNode.y >= freeNode.y + freeNode.height || usedNode.y + usedNode.height <= freeNode.y) {
      return false;
    }

    // New node at the top side of the used node
    if (usedNode.y > freeNode.y && usedNode.y < freeNode.y + freeNode.height) {
      const newNode = { ...freeNode };
      newNode.height = usedNode.y - newNode.y;
      if (newNode.height > 0) this.freeRects.push(newNode);
    }

    // New node at the bottom side
    if (usedNode.y + usedNode.height < freeNode.y + freeNode.height) {
      const newNode = { ...freeNode };
      newNode.y = usedNode.y + usedNode.height;
      newNode.height = freeNode.y + freeNode.height - (usedNode.y + usedNode.height);
      if (newNode.height > 0) this.freeRects.push(newNode);
    }

    // New node at the left side
    if (usedNode.x > freeNode.x && usedNode.x < freeNode.x + freeNode.width) {
      const newNode = { ...freeNode };
      newNode.width = usedNode.x - newNode.x;
      if (newNode.width > 0) this.freeRects.push(newNode);
    }

    // New node at the right side
    if (usedNode.x + usedNode.width < freeNode.x + freeNode.width) {
      const newNode = { ...freeNode };
      newNode.x = usedNode.x + usedNode.width;
      newNode.width = freeNode.x + freeNode.width - (usedNode.x + usedNode.width);
      if (newNode.width > 0) this.freeRects.push(newNode);
    }

    return true;
  }

  /**
   * Prune the free list (remove contained rects)
   */
  pruneFreeList() {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        if (this.isContainedIn(this.freeRects[i], this.freeRects[j])) {
          this.freeRects.splice(i, 1);
          i--;
          break;
        }
        if (this.isContainedIn(this.freeRects[j], this.freeRects[i])) {
          this.freeRects.splice(j, 1);
          j--;
        }
      }
    }
  }

  isContainedIn(a, b) {
    return a.x >= b.x && a.y >= b.y && 
           a.x + a.width <= b.x + b.width && 
           a.y + a.height <= b.y + b.height;
  }
  
  /**
   * Occupy a specific area (e.g., for existing placements)
   */
  occupyArea(x, y, width, height) {
     this.placeRect({ x, y, width, height });
  }
}


/**
 * Auto-pack a design onto a sheet using MaxRects algorithm
 */
export function autoPackDesign({
  sheetWidthIn,
  sheetHeightIn,
  designWidthIn,
  designHeightIn,
  quantity,
  paddingIn = 0, // Default to 0 padding (rely on deadspace)
  tryRotated = false,
  existingOccupiedAreas = [],
}) {
  if (quantity <= 0) return { positions: [], maxInstances: 0, rotated: false };

  // Initialize Packer
  const packer = new MaxRectsPacker(sheetWidthIn, sheetHeightIn);
  
  // Mark existing areas as occupied
  existingOccupiedAreas.forEach(area => {
    // Ensure we occupy exactly the bounding box area
    // MaxRects assumes integers usually, but floats work if consistent
    // We just need to ensure we don't have tiny floating point gaps
    packer.occupyArea(area.xIn, area.yIn, area.widthIn, area.heightIn);
  });

  const positions = [];
  const deadspaceIn = 0.157;
  
  // Calculate dimensions including deadspace and padding
  // Note: MaxRects logic operates on "blocks" to be placed.
  // The block = design + deadspace*2 + padding?
  // If we include padding in the block, we get padding between items.
  // BUT, padding shouldn't apply to the sheet edges necessarily.
  // However, simpliest is to pack (design + deadspace*2 + padding).
  // Then when placing, we center the design in that block?
  // Or just pack (design + deadspace*2) and rely on the packer to find touching spots?
  // If we want padding, we should add it to the dimension packed.
  
  // Let's pack: Effective Dimension = Design + Deadspace*2 + Padding
  // When saving position: x = boxX + deadspaceIn + paddingIn/2 ?
  // Wait, padding should be between items.
  
  // Correct approach:
  // Pack (Width + Padding) x (Height + Padding).
  // This effectively ensures separation.
  // Sheet edges: This enforces padding at edges too, which is usually fine/good.
  
  const packW = designWidthIn + (deadspaceIn * 2) + paddingIn;
  const packH = designHeightIn + (deadspaceIn * 2) + paddingIn;
  
  let placedCount = 0;
  const isMaxCalculation = quantity >= 1000;
  
  // Run packing
  // For max calculation, run until full.
  // For quantity, run until quantity reached.
  
  // Safety break
  const maxLimit = isMaxCalculation ? 10000 : quantity;
  
  for (let i = 0; i < maxLimit; i++) {
    const result = packer.pack(packW, packH, tryRotated);
    
    if (result) {
      // Found a spot!
      // result has x, y, width, height (rotated dimensions)
      // These are the box top-left coordinates (including padding)
      
      // We need to convert back to "Graphic Position" (top-left of graphic in original orientation)
      // Logic:
      // Result Box (x,y) represents the top-left of the area reserved for this item.
      // This area includes padding. So real content starts at x + padding/2, y + padding/2.
      // The content itself is the Bounding Box (Design + Deadspace).
      
      const boxX = result.x + paddingIn / 2;
      const boxY = result.y + paddingIn / 2;
      const boxW = result.width - paddingIn; // Should match effective width
      const boxH = result.height - paddingIn;
      
      // Verify rotation status from result
      const isRotated = result.rotated;
      
      // Calculate graphic position from bounding box
      let gX, gY;
      if (isRotated) {
         // Box is Height x Width
         // boxW = designHeightIn + deadspace*2
         // boxH = designWidthIn + deadspace*2
         // Center of box:
         const cx = boxX + boxW / 2;
         const cy = boxY + boxH / 2;
         
         // Graphic Top-Left (xIn, yIn)
         // Center = xIn + designWidthIn/2, yIn + designHeightIn/2
         gX = cx - designWidthIn / 2;
         gY = cy - designHeightIn / 2;
      } else {
         // Box is Width x Height
         // boxX = xIn - deadspaceIn
         gX = boxX + deadspaceIn;
         gY = boxY + deadspaceIn;
      }
      
      // Double check validity (bounds) just in case
      // (MaxRects guarantees no overlap with other packed items, provided we synced existing correctly)
      if (isWithinBounds(gX, gY, designWidthIn, designHeightIn, sheetWidthIn, sheetHeightIn)) {
        positions.push({ xIn: gX, yIn: gY, rotated: isRotated ? 90 : 0 });
        placedCount++;
      } else {
        // Should not happen if logic is correct
        // console.warn("Packed item out of bounds", gX, gY);
      }
      
    } else {
      // No more space
      break;
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
