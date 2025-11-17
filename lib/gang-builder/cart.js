/**
 * Gang Builder Cart Integration
 * 
 * Handles adding gang sheet orders to the cart.
 * This is a stub implementation that can be replaced with actual cart integration.
 */

import * as metrics from "./metrics.js";

/**
 * Add gang sheet order to cart
 * @param {Object} state - Gang builder state
 */
export function addToCart(state) {
  const usageStats = metrics.getSheetUsage(state);

  // Build cart payload
  const payload = {
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
      rotationDeg: instance.rotationDeg,
    })),
    designFiles: state.designFiles.map((file) => ({
      id: file.id,
      name: file.name,
      naturalWidthPx: file.naturalWidthPx,
      naturalHeightPx: file.naturalHeightPx,
      // Note: In production, you'd upload the file to a server and store the URL
      // For now, we just store the data URL (which is large but works for demo)
      url: file.url,
    })),
  };

  // Log to console for now
  console.log("Add to Cart (stub):", payload);

  // Show a simple alert/notification
  // In production, this would call your cart API
  const message = `Added ${state.sheetQuantity} sheet(s) to cart (demo mode)`;
  
  // Try to show a toast notification if available
  const banner = document.getElementById("order-banner");
  if (banner) {
    banner.textContent = message;
    banner.className = "order-banner order-banner--success";
    setTimeout(() => {
      banner.textContent = "";
      banner.className = "order-banner";
    }, 3000);
  } else {
    alert(message);
  }

  // TODO: Replace with actual cart API call
  // Example:
  // fetch('/api/cart/add', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(payload)
  // })
  // .then(res => res.json())
  // .then(data => {
  //   // Handle success
  // })
  // .catch(err => {
  //   // Handle error
  // });

  return payload;
}

