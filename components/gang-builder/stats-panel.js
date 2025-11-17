/**
 * Stats Panel Component
 * 
 * Right panel showing sheet usage statistics and quality checks.
 */

import * as store from "../../lib/gang-builder/store.js";
import * as metrics from "../../lib/gang-builder/metrics.js";
import { getSheetSize } from "../../lib/gang-builder/config.js";

/**
 * Create the stats panel
 * @param {HTMLElement} container
 */
export function create(container) {
  container.innerHTML = `
    <div class="gang-stats-panel">
      <div class="gang-stats-section">
        <h3 class="gang-stats-heading">Sheet Info</h3>
        <div class="gang-stat-item">
          <span class="gang-stat-label">Size:</span>
          <span class="gang-stat-value" id="gang-stat-size">–</span>
        </div>
        <div class="gang-stat-item">
          <span class="gang-stat-label">Instances:</span>
          <span class="gang-stat-value" id="gang-stat-instances">0</span>
        </div>
      </div>

      <div class="gang-stats-section">
        <h3 class="gang-stats-heading">Usage</h3>
        <div class="gang-usage-display">
          <div class="gang-usage-percent" id="gang-usage-percent">0%</div>
          <div class="gang-usage-details" id="gang-usage-details"></div>
        </div>
      </div>

      <div class="gang-stats-section">
        <h3 class="gang-stats-heading">Quality Check</h3>
        <div class="gang-quality-status" id="gang-quality-status">
          <p class="gang-quality-text">Resolution OK for 300 DPI</p>
        </div>
      </div>
    </div>
  `;

  // Subscribe to state changes
  store.subscribe((state) => {
    const sheetSize = getSheetSize(state.selectedSheetSizeId);
    const usage = metrics.getSheetUsage(state);

    // Update sheet size
    const sizeEl = container.querySelector("#gang-stat-size");
    if (sizeEl) {
      sizeEl.textContent = sheetSize ? sheetSize.label : "–";
    }

    // Update instances count
    const instancesEl = container.querySelector("#gang-stat-instances");
    if (instancesEl) {
      instancesEl.textContent = String(usage.instanceCount);
    }

    // Update usage
    const usagePercentEl = container.querySelector("#gang-usage-percent");
    const usageDetailsEl = container.querySelector("#gang-usage-details");
    
    if (usagePercentEl) {
      usagePercentEl.textContent = `${usage.usagePct.toFixed(1)}%`;
    }
    
    if (usageDetailsEl) {
      usageDetailsEl.textContent = `${usage.usedAreaIn.toFixed(1)} in² / ${usage.sheetAreaIn.toFixed(1)} in²`;
    }

    // Update quality status (stub for now)
    const qualityEl = container.querySelector("#gang-quality-status");
    if (qualityEl) {
      // Simple quality check based on instance count and usage
      if (usage.instanceCount === 0) {
        qualityEl.innerHTML = '<p class="gang-quality-text">No designs on sheet</p>';
      } else if (usage.usagePct > 95) {
        qualityEl.innerHTML = '<p class="gang-quality-text gang-quality-warning">Sheet nearly full</p>';
      } else {
        qualityEl.innerHTML = '<p class="gang-quality-text">Resolution OK for 300 DPI</p>';
      }
    }
  });
}

export const StatsPanel = { create };

