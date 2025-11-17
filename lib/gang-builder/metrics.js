/**
 * Gang Builder Usage Metrics
 * 
 * Calculates sheet usage statistics (area used, percentage, instance count).
 */

import { getSheetSize } from "./config.js";

/**
 * Calculate sheet usage metrics
 * 
 * @param {Object} state - Gang builder state
 * @param {string} state.selectedSheetSizeId - Selected sheet size ID
 * @param {Array} state.instances - Array of placed instances
 * @returns {Object} Usage metrics
 * @returns {number} returns.usedAreaIn - Total area used in square inches
 * @returns {number} returns.sheetAreaIn - Total sheet area in square inches
 * @returns {number} returns.usagePct - Usage percentage (0-100)
 * @returns {number} returns.instanceCount - Number of instances on sheet
 */
export function getSheetUsage(state) {
  const { selectedSheetSizeId, instances = [] } = state;

  if (!selectedSheetSizeId || !instances || instances.length === 0) {
    const sheetSize = getSheetSize(selectedSheetSizeId);
    const sheetAreaIn = sheetSize
      ? sheetSize.widthIn * sheetSize.heightIn
      : 0;

    return {
      usedAreaIn: 0,
      sheetAreaIn,
      usagePct: 0,
      instanceCount: 0,
    };
  }

  const sheetSize = getSheetSize(selectedSheetSizeId);
  if (!sheetSize) {
    return {
      usedAreaIn: 0,
      sheetAreaIn: 0,
      usagePct: 0,
      instanceCount: 0,
    };
  }

  const sheetAreaIn = sheetSize.widthIn * sheetSize.heightIn;

  // Calculate total area used (bounding box approximation)
  let usedAreaIn = 0;
  for (const instance of instances) {
    const area = (instance.widthIn || 0) * (instance.heightIn || 0);
    usedAreaIn += area;
  }

  const usagePct = sheetAreaIn > 0 ? (usedAreaIn / sheetAreaIn) * 100 : 0;

  return {
    usedAreaIn,
    sheetAreaIn,
    usagePct: Math.min(100, Math.max(0, usagePct)), // Clamp between 0 and 100
    instanceCount: instances.length,
  };
}

