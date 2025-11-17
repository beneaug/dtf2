/**
 * Gang Builder Cart Integration
 * 
 * Handles adding gang sheet orders to the cart.
 */

import * as metrics from "./metrics.js";
import * as pricing from "./pricing.js";
import { SHEET_SIZES } from "./config.js";

/**
 * Add gang sheet order to cart
 * @param {Object} state - Gang builder state
 */
export async function addToCart(state) {
  if (!state.selectedSheetSizeId || state.instances.length === 0) {
    alert("Please add at least one design to the sheet before adding to cart.");
    return;
  }

  const usageStats = metrics.getSheetUsage(state);
  const sheetSize = SHEET_SIZES.find((s) => s.id === state.selectedSheetSizeId);
  const unitPrice = pricing.getUnitPrice(state.selectedSheetSizeId, state.sheetQuantity);
  const totalPrice = pricing.getSubtotal(state.selectedSheetSizeId, state.sheetQuantity);

  // Build gang sheet data object
  const gangSheetData = {
    sheetSizeId: state.selectedSheetSizeId,
    quantity: state.sheetQuantity,
    usageStats: {
      usedAreaIn: usageStats.usedAreaIn,
      sheetAreaIn: usageStats.sheetAreaIn,
      usagePct: usageStats.usagePct,
      instanceCount: usageStats.instanceCount,
    },
    instanceLayout: state.instances.map((instance) => ({
      id: instance.id,
      designId: instance.designId,
      xIn: instance.xIn,
      yIn: instance.yIn,
      widthIn: instance.widthIn,
      heightIn: instance.heightIn,
      rotationDeg: instance.rotationDeg || 0,
    })),
    designFiles: state.designFiles.map((file) => ({
      id: file.id,
      name: file.name,
      naturalWidthPx: file.naturalWidthPx,
      naturalHeightPx: file.naturalHeightPx,
      widthIn: file.widthIn,
      heightIn: file.heightIn,
    })),
  };

  // Store gang sheet data in localStorage - will be sent after successful checkout
  try {
    localStorage.setItem('pendingGangSheetData', JSON.stringify(gangSheetData));
    console.log('Gang sheet data stored in localStorage');
  } catch (err) {
    console.error('Failed to store gang sheet data in localStorage:', err);
    // Fallback: include in form data if localStorage fails
    alert('Warning: Could not save layout data. Please try again.');
    return;
  }

  // Build FormData for submission (matching the order.js format)
  // NOTE: We do NOT include gangSheetData here - it will be sent after checkout success
  const formData = new FormData();
  formData.set("mode", "gang-sheet");
  formData.set("size", sheetSize?.label || state.selectedSheetSizeId);
  formData.set("quantity", String(state.sheetQuantity));
  formData.set("unitPrice", unitPrice ? String(unitPrice) : "");
  formData.set("totalPrice", totalPrice ? String(totalPrice) : "");

  // Add design files
  for (const file of state.designFiles) {
    // Convert data URL to blob if needed
    if (file.url.startsWith("data:")) {
      const response = await fetch(file.url);
      const blob = await response.blob();
      formData.append("files", blob, file.name);
    } else {
      // If it's already a URL, fetch it first
      const response = await fetch(file.url);
      const blob = await response.blob();
      formData.append("files", blob, file.name);
    }
  }

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Server responded with ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    if (data && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }

    // Show success message
    const banner = document.getElementById("order-banner");
    if (banner) {
      banner.textContent = `Order received. Redirecting to checkout...`;
      banner.className = "order-banner order-banner--success";
    } else {
      alert("Order received. You can safely close this page.");
    }
  } catch (err) {
    console.error("Error adding to cart:", err);
    alert("Something went wrong while submitting your order. Please try again or contact 12ozCollective.");
  }
}

