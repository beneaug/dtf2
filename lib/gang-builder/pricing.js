/**
 * Gang Builder Pricing Logic
 * 
 * Calculates unit prices and subtotals based on sheet size and quantity.
 */

import { getPricing } from "./config.js";

/**
 * Get the unit price for a given sheet size and quantity
 * @param {string} sheetSizeId - Sheet size identifier
 * @param {number} quantity - Number of sheets
 * @returns {number|null} Unit price in USD, or null if not found
 */
export function getUnitPrice(sheetSizeId, quantity) {
  const pricing = getPricing(sheetSizeId);
  if (!pricing || !pricing.bands || pricing.bands.length === 0) {
    return null;
  }

  // Find the matching price band
  for (const band of pricing.bands) {
    const from = band.from;
    const to = band.to;
    
    if (quantity >= from && (to === null || quantity <= to)) {
      return band.unitPrice;
    }
  }

  // If no band matches, return the last band's price (for quantities beyond the last band)
  const lastBand = pricing.bands[pricing.bands.length - 1];
  return lastBand ? lastBand.unitPrice : null;
}

/**
 * Get the subtotal for a given sheet size and quantity
 * @param {string} sheetSizeId - Sheet size identifier
 * @param {number} quantity - Number of sheets
 * @returns {number|null} Subtotal in USD, or null if pricing not found
 */
export function getSubtotal(sheetSizeId, quantity) {
  const unitPrice = getUnitPrice(sheetSizeId, quantity);
  if (unitPrice === null) return null;
  return unitPrice * quantity;
}

/**
 * Get the effective price band for a given sheet size and quantity
 * @param {string} sheetSizeId - Sheet size identifier
 * @param {number} quantity - Number of sheets
 * @returns {Object|null} Object with {from, to, unitPrice} or null
 */
export function getEffectiveBand(sheetSizeId, quantity) {
  const pricing = getPricing(sheetSizeId);
  if (!pricing || !pricing.bands || pricing.bands.length === 0) {
    return null;
  }

  for (const band of pricing.bands) {
    const from = band.from;
    const to = band.to;
    
    if (quantity >= from && (to === null || quantity <= to)) {
      return { ...band };
    }
  }

  // Return the last band if quantity exceeds all bands
  const lastBand = pricing.bands[pricing.bands.length - 1];
  return lastBand ? { ...lastBand } : null;
}

/**
 * Format a price as currency string
 * @param {number} price - Price in USD
 * @returns {string} Formatted price (e.g., "$14.27")
 */
export function formatPrice(price) {
  if (price === null || price === undefined) return "$0.00";
  return `$${price.toFixed(2)}`;
}

