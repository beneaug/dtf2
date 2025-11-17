/**
 * Gang Builder Initialization
 * 
 * Wires up the gang builder to the order page tabs.
 */

import { createBuilderOverlay } from "./builder-overlay.js";

document.addEventListener("DOMContentLoaded", () => {
  const tabs = Array.from(document.querySelectorAll(".order-tab"));
  const buildSheetTab = tabs.find((tab) => tab.textContent.trim().toLowerCase() === "build sheet");
  
  if (!buildSheetTab) return;

  let builderOverlay = null;

  buildSheetTab.addEventListener("click", () => {
    // Only open builder if not already open
    if (builderOverlay) return;

    // Create and show the builder overlay
    builderOverlay = createBuilderOverlay(document.body, () => {
      builderOverlay = null;
      // Switch back to "Single image" tab when builder closes
      const singleImageTab = tabs.find((tab) => tab.textContent.trim().toLowerCase() === "single image");
      if (singleImageTab) {
        tabs.forEach((t) => t.classList.remove("order-tab--active"));
        singleImageTab.classList.add("order-tab--active");
      }
    });
  });
});

