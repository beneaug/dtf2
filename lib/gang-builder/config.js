/**
 * Gang Builder Configuration
 * 
 * Defines sheet sizes and pricing bands for the DTF gang sheet builder.
 */

/**
 * @typedef {Object} SheetSize
 * @property {string} id - Unique identifier (e.g., "22x12")
 * @property {string} label - Display label (e.g., "22\" x 12\"")
 * @property {number} widthIn - Width in inches
 * @property {number} heightIn - Height in inches
 */

/**
 * @typedef {Object} PriceBand
 * @property {number} from - Starting quantity (inclusive)
 * @property {number|null} to - Ending quantity (inclusive, null = open-ended)
 * @property {number} unitPrice - Price per sheet in USD
 */

/**
 * @typedef {Object} VariantPricing
 * @property {string} sheetSizeId - Sheet size ID
 * @property {PriceBand[]} bands - Array of price bands
 */

/**
 * Available sheet sizes for gang printing
 * @type {SheetSize[]}
 */
export const SHEET_SIZES = [
  { id: "22x12", label: "22\" x 12\"", widthIn: 22, heightIn: 12 },
  { id: "22x24", label: "22\" x 24\"", widthIn: 22, heightIn: 24 },
  { id: "22x60", label: "22\" x 60\"", widthIn: 22, heightIn: 60 },
  { id: "22x120", label: "22\" x 120\"", widthIn: 22, heightIn: 120 },
  { id: "22x180", label: "22\" x 180\"", widthIn: 22, heightIn: 180 },
];

/**
 * Pricing bands for each sheet size
 * @type {VariantPricing[]}
 */
export const PRICING = [
  {
    sheetSizeId: "22x12",
    bands: [
      { from: 1, to: 9, unitPrice: 14.27 },
      { from: 10, to: null, unitPrice: 11.76 },
    ],
  },
  {
    sheetSizeId: "22x24",
    bands: [
      { from: 1, to: 9, unitPrice: 28.54 },
      { from: 10, to: null, unitPrice: 23.52 },
    ],
  },
  {
    sheetSizeId: "22x60",
    bands: [
      { from: 1, to: 9, unitPrice: 71.35 },
      { from: 10, to: null, unitPrice: 58.80 },
    ],
  },
  {
    sheetSizeId: "22x120",
    bands: [
      { from: 1, to: 9, unitPrice: 142.70 },
      { from: 10, to: null, unitPrice: 117.60 },
    ],
  },
  {
    sheetSizeId: "22x180",
    bands: [
      { from: 1, to: 9, unitPrice: 214.05 },
      { from: 10, to: null, unitPrice: 176.40 },
    ],
  },
];

/**
 * Get sheet size by ID
 * @param {string} sheetSizeId
 * @returns {SheetSize|undefined}
 */
export function getSheetSize(sheetSizeId) {
  return SHEET_SIZES.find((s) => s.id === sheetSizeId);
}

/**
 * Get pricing for a sheet size
 * @param {string} sheetSizeId
 * @returns {VariantPricing|undefined}
 */
export function getPricing(sheetSizeId) {
  return PRICING.find((p) => p.sheetSizeId === sheetSizeId);
}

