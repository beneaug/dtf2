/**
 * Gang Builder Layout Logic
 * 
 * Handles auto-packing designs onto sheets and coordinate conversions.
 * Implements a robust Maximal Rectangles (MaxRects) bin packing algorithm.
 */

/**
 * Pixels per inch for UI canvas scale (screen only)
 */
export const PX_PER_INCH_UI = 200;

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
 * Core Rectangle Class for Packer
 */
class Rect {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  contains(other) {
    return (
      this.x <= other.x &&
      this.y <= other.y &&
      this.x + this.width >= other.x + other.width &&
      this.y + this.height >= other.y + other.height
    );
  }

  overlaps(other) {
    return (
      this.x < other.x + other.width &&
      this.x + this.width > other.x &&
      this.y < other.y + other.height &&
      this.y + this.height > other.y
    );
  }
}

/**
 * Robust MaxRects Packer
 * Based on the algorithm by Jukka Jylänki
 */
class Packer {
  constructor(width, height) {
    this.binWidth = width;
    this.binHeight = height;
    this.freeRects = [new Rect(0, 0, width, height)];
    this.usedRects = [];
  }

  pack(width, height, allowRotation) {
    // Try to find the best free rectangle for specific size
    let bestNode = { rect: null, score1: Number.MAX_VALUE, score2: Number.MAX_VALUE, rotated: false };
    
    // Try unrotated
    this.findBestNode(width, height, false, bestNode);
    
    // Try rotated
    if (allowRotation) {
      this.findBestNode(height, width, true, bestNode);
    }

    if (bestNode.rect) {
      // Place it
      const node = new Rect(
        bestNode.rect.x,
        bestNode.rect.y,
        bestNode.rotated ? height : width,
        bestNode.rotated ? width : height
      );
      
      this.placeRect(node);
      return {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rotated: bestNode.rotated
      };
    }
    
    return null;
  }

  findBestNode(width, height, rotated, bestNode) {
    // Heuristic: Best Short Side Fit (BSSF)
    for (let i = 0; i < this.freeRects.length; i++) {
      const freeRect = this.freeRects[i];
      
      // Check if it fits
      if (freeRect.width >= width && freeRect.height >= height) {
        const leftoverHoriz = Math.abs(freeRect.width - width);
        const leftoverVert = Math.abs(freeRect.height - height);
        const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
        const longSideFit = Math.max(leftoverHoriz, leftoverVert);

        if (shortSideFit < bestNode.score1 || (shortSideFit === bestNode.score1 && longSideFit < bestNode.score2)) {
          bestNode.rect = freeRect;
          bestNode.score1 = shortSideFit;
          bestNode.score2 = longSideFit;
          bestNode.rotated = rotated;
        }
      }
    }
  }

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

  splitFreeNode(freeNode, usedNode) {
    // If no overlap, return false
    if (!freeNode.overlaps(usedNode)) return false;

    const debug = false; // Set to true to debug splitting

    // New node at the top side of the used node
    if (usedNode.y > freeNode.y && usedNode.y < freeNode.y + freeNode.height) {
      const newNode = new Rect(freeNode.x, freeNode.y, freeNode.width, usedNode.y - freeNode.y);
      this.freeRects.push(newNode);
    }

    // New node at the bottom side
    if (usedNode.y + usedNode.height < freeNode.y + freeNode.height) {
      const newNode = new Rect(
        freeNode.x, 
        usedNode.y + usedNode.height, 
        freeNode.width, 
        freeNode.y + freeNode.height - (usedNode.y + usedNode.height)
      );
      this.freeRects.push(newNode);
    }

    // New node at the left side
    if (usedNode.x > freeNode.x && usedNode.x < freeNode.x + freeNode.width) {
      const newNode = new Rect(freeNode.x, freeNode.y, usedNode.x - freeNode.x, freeNode.height);
      this.freeRects.push(newNode);
    }

    // New node at the right side
    if (usedNode.x + usedNode.width < freeNode.x + freeNode.width) {
      const newNode = new Rect(
        usedNode.x + usedNode.width, 
        freeNode.y, 
        freeNode.x + freeNode.width - (usedNode.x + usedNode.width), 
        freeNode.height
      );
      this.freeRects.push(newNode);
    }

    return true;
  }

  pruneFreeList() {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        const rectA = this.freeRects[i];
        const rectB = this.freeRects[j];
        if (rectB.contains(rectA)) {
          this.freeRects.splice(i, 1);
          i--;
          break;
        }
        if (rectA.contains(rectB)) {
          this.freeRects.splice(j, 1);
          j--;
        }
      }
    }
  }
  
  occupyArea(x, y, width, height) {
    this.placeRect(new Rect(x, y, width, height));
  }
}

/**
 * Auto-pack a design onto a sheet
 * 
 * Uses MaxRects bin packing to fit as many instances as possible.
 * Accounts for deadspace around each instance.
 */
export function autoPackDesign({
  sheetWidthIn,
  sheetHeightIn,
  designWidthIn,
  designHeightIn,
  quantity,
  paddingIn = 0, // Padding between items (on top of deadspace)
  tryRotated = true, // Always try rotated for best fit
  existingOccupiedAreas = [],
}) {
  if (quantity <= 0) return { positions: [], maxInstances: 0, rotated: false };

  // 4mm deadspace on all sides
  const deadspaceIn = 0.157;
  
  // Effective dimensions for packing (Content + Deadspace*2 + Padding)
  // We treat the padding as part of the block size for simple separation
  const blockW = designWidthIn + (deadspaceIn * 2) + paddingIn;
  const blockH = designHeightIn + (deadspaceIn * 2) + paddingIn;

  // Initialize Packer
  const packer = new Packer(sheetWidthIn, sheetHeightIn);
  
  // Mark existing areas as occupied
  // We need to be careful: existing areas are Bounding Boxes (Design + Deadspace).
  // If they don't include padding, we might pack too close.
  // But usually we just want to avoid overlap.
  existingOccupiedAreas.forEach(area => {
    packer.occupyArea(area.xIn, area.yIn, area.widthIn, area.heightIn);
  });

  const positions = [];
  let placedCount = 0;
  const isMaxCalculation = quantity >= 1000;
  const maxLimit = isMaxCalculation ? 5000 : quantity;

  // For identical items, we can sometimes optimize by sorting orientation preferences?
  // MaxRects handles this via the score.
  
  for (let i = 0; i < maxLimit; i++) {
    const result = packer.pack(blockW, blockH, tryRotated);
    
    if (result) {
      // Found a spot. Result is the Block (including padding).
      // Calculate Graphic Position.
      // The Block X,Y is the top-left of the reserved area.
      // We center the bounding box in the block (or align top-left).
      // Since block = BBox + Padding, let's align top-left plus half padding.
      
      const padOffset = paddingIn / 2;
      const boxX = result.x + padOffset;
      const boxY = result.y + padOffset;
      // boxW/H = result.width/height - paddingIn
      
      const isRotated = result.rotated;
      
      let gX, gY;
      
      if (isRotated) {
        // Block was fitted for Rotated dimensions
        // result.width ~= blockH, result.height ~= blockW
        // Box Center:
        const boxW = result.width - paddingIn; // Should be designHeightIn + deadspace*2
        const boxH = result.height - paddingIn; // Should be designWidthIn + deadspace*2
        
        const cx = boxX + boxW / 2;
        const cy = boxY + boxH / 2;
        
        // Graphic Top-Left (Unrotated coords relative to graphic)
        // Graphic is rotated 90deg around center
        // Center = xIn + designWidthIn/2, yIn + designHeightIn/2
        gX = cx - designWidthIn / 2;
        gY = cy - designHeightIn / 2;
      } else {
        // Box Center:
        const boxW = result.width - paddingIn;
        const boxH = result.height - paddingIn;
        
        // Graphic Top-Left:
        // boxX = xIn - deadspaceIn => xIn = boxX + deadspaceIn
        gX = boxX + deadspaceIn;
        gY = boxY + deadspaceIn;
      }
      
      // Sanity Check Bounds
      if (isWithinBounds(gX, gY, designWidthIn, designHeightIn, sheetWidthIn, sheetHeightIn)) {
        positions.push({ xIn: gX, yIn: gY, rotated: isRotated ? 90 : 0 });
        placedCount++;
      }
    } else {
      break; // Sheet full
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
