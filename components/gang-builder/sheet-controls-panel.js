/**
 * Sheet Controls Panel Component
 * 
 * Left panel with sheet size selector, artwork upload, layout controls, and add to cart.
 */

import * as store from "../../lib/gang-builder/store.js";
import * as pricing from "../../lib/gang-builder/pricing.js";
import { SHEET_SIZES } from "../../lib/gang-builder/config.js";
import { addToCart } from "../../lib/gang-builder/cart.js";

/**
 * Create the controls panel
 * @param {HTMLElement} container
 */
export function create(container) {
  container.innerHTML = `
    <div class="gang-controls-panel">
      <div class="gang-controls-section">
        <h3 class="gang-controls-heading">Step 1: Sheet Size</h3>
        <div class="gang-sheet-size-buttons" id="gang-sheet-sizes"></div>
      </div>

      <div class="gang-controls-section">
        <h3 class="gang-controls-heading">Step 2: Upload Artwork</h3>
        <div class="gang-upload-area" id="gang-upload-area">
          <div class="gang-upload-drop">
            <span class="gang-upload-icon">⬆︎</span>
            <span class="gang-upload-text">Drag & drop or click to browse</span>
            <input type="file" id="gang-upload-input" accept="image/*" multiple style="display: none;" />
          </div>
        </div>
        <div class="gang-designs-list" id="gang-designs-list"></div>
      </div>
      
      <div class="gang-controls-section" id="gang-size-controls-section" style="display: none;">
        <h3 class="gang-controls-heading">Artwork Size</h3>
        <div class="gang-size-controls" id="gang-size-controls">
          <div class="gang-size-inputs">
            <label class="gang-label">Width (inches):</label>
            <input type="number" id="gang-size-width" class="gang-input" step="0.1" min="0.1" />
            <label class="gang-label">Height (inches):</label>
            <input type="number" id="gang-size-height" class="gang-input" step="0.1" min="0.1" />
          </div>
          <div class="gang-dpi-display" id="gang-dpi-display"></div>
          <button id="gang-size-apply" class="gang-btn gang-btn-secondary">Apply & Reorganize</button>
        </div>
      </div>

      <div class="gang-controls-section">
        <h3 class="gang-controls-heading">Step 3: Layout</h3>
        <div class="gang-layout-controls">
          <div class="gang-layout-group">
            <label class="gang-label">Auto-pack selected design:</label>
            <div class="gang-auto-pack-controls">
              <select id="gang-auto-pack-design" class="gang-select">
                <option value="">Select a design...</option>
              </select>
              <input type="number" id="gang-auto-pack-qty" class="gang-input" min="1" value="1" placeholder="Qty" />
              <button id="gang-auto-pack-btn" class="gang-btn gang-btn-secondary">Auto-pack</button>
            </div>
          </div>
          <div class="gang-layout-group">
            <label class="gang-label">Snap to grid:</label>
            <div class="gang-snap-buttons">
              <button class="gang-snap-btn" data-increment="0">Off</button>
              <button class="gang-snap-btn" data-increment="0.125">1/8"</button>
              <button class="gang-snap-btn gang-snap-btn-active" data-increment="0.25">1/4"</button>
            </div>
          </div>
        </div>
      </div>

      <div class="gang-controls-section">
        <h3 class="gang-controls-heading">Step 4: Order</h3>
        <div class="gang-order-controls">
          <label class="gang-label">Sheet Quantity:</label>
          <div class="gang-qty-controls">
            <button class="gang-qty-btn" id="gang-qty-dec">−</button>
            <input type="number" id="gang-qty-input" class="gang-input" min="1" value="1" />
            <button class="gang-qty-btn" id="gang-qty-inc">+</button>
          </div>
          <div class="gang-price-preview" id="gang-price-preview"></div>
          <button id="gang-add-to-cart" class="gang-btn gang-btn-primary">Add to Cart</button>
        </div>
      </div>
    </div>
  `;

  // Initialize sheet size buttons
  const sheetSizesContainer = container.querySelector("#gang-sheet-sizes");
  const currentState = store.getState();
  
  SHEET_SIZES.forEach((size) => {
    const btn = document.createElement("button");
    btn.className = `gang-sheet-size-btn ${size.id === currentState.selectedSheetSizeId ? "gang-sheet-size-btn-active" : ""}`;
    btn.textContent = size.label;
    btn.dataset.sizeId = size.id;
    btn.addEventListener("click", () => {
      store.setSheetSize(size.id);
    });
    sheetSizesContainer.appendChild(btn);
  });

  // Upload handling
  const uploadArea = container.querySelector("#gang-upload-area");
  const uploadInput = container.querySelector("#gang-upload-input");
  
  uploadArea.addEventListener("click", () => uploadInput.click());
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("gang-upload-area-dragover");
  });
  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("gang-upload-area-dragover");
  });
  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("gang-upload-area-dragover");
    handleFiles(e.dataTransfer.files);
  });
  
  uploadInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
  });

  let lastUploadedDesignId = null;

  function handleFiles(files) {
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const designFile = {
              id: `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              url: e.target.result,
              naturalWidthPx: img.naturalWidth,
              naturalHeightPx: img.naturalHeight,
            };
            store.addDesignFile(designFile);
            // Auto-select in Step 3 dropdown
            lastUploadedDesignId = designFile.id;
            // Update will happen in the subscribe callback
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Auto-pack controls
  const autoPackDesignSelect = container.querySelector("#gang-auto-pack-design");
  const autoPackQtyInput = container.querySelector("#gang-auto-pack-qty");
  const autoPackBtn = container.querySelector("#gang-auto-pack-btn");
  
  autoPackBtn.addEventListener("click", () => {
    const designId = autoPackDesignSelect.value;
    const qty = parseInt(autoPackQtyInput.value, 10) || 1;
    if (designId) {
      store.addInstancesForDesign(designId, qty, true);
    }
  });

  // Snap buttons
  const snapButtons = container.querySelectorAll(".gang-snap-btn");
  snapButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      snapButtons.forEach((b) => b.classList.remove("gang-snap-btn-active"));
      btn.classList.add("gang-snap-btn-active");
      const increment = parseFloat(btn.dataset.increment);
      store.setSnapIncrement(increment);
    });
  });

  // Quantity controls
  const qtyInput = container.querySelector("#gang-qty-input");
  const qtyDec = container.querySelector("#gang-qty-dec");
  const qtyInc = container.querySelector("#gang-qty-inc");
  
  qtyDec.addEventListener("click", () => {
    const current = parseInt(qtyInput.value, 10) || 1;
    qtyInput.value = Math.max(1, current - 1);
    store.setSheetQuantity(parseInt(qtyInput.value, 10));
  });
  
  qtyInc.addEventListener("click", () => {
    const current = parseInt(qtyInput.value, 10) || 1;
    qtyInput.value = current + 1;
    store.setSheetQuantity(parseInt(qtyInput.value, 10));
  });
  
  qtyInput.addEventListener("change", () => {
    store.setSheetQuantity(parseInt(qtyInput.value, 10) || 1);
  });

  // Add to cart
  const addToCartBtn = container.querySelector("#gang-add-to-cart");
  addToCartBtn.addEventListener("click", () => {
    const state = store.getState();
    addToCart(state);
  });

  // Size controls
  const sizeControlsSection = container.querySelector("#gang-size-controls-section");
  const sizeWidthInput = container.querySelector("#gang-size-width");
  const sizeHeightInput = container.querySelector("#gang-size-height");
  const dpiDisplay = container.querySelector("#gang-dpi-display");
  const sizeApplyBtn = container.querySelector("#gang-size-apply");
  let selectedDesignForSize = null;

  // Calculate and display DPI
  function updateDPI(design, widthIn, heightIn) {
    if (!design || !widthIn || !heightIn) {
      dpiDisplay.textContent = "";
      return;
    }
    
    const dpiX = design.naturalWidthPx / widthIn;
    const dpiY = design.naturalHeightPx / heightIn;
    const avgDPI = (dpiX + dpiY) / 2;
    
    dpiDisplay.innerHTML = `
      <div class="gang-dpi-info">
        <div class="gang-dpi-value">${avgDPI.toFixed(1)} DPI</div>
        <div class="gang-dpi-details">${dpiX.toFixed(1)} × ${dpiY.toFixed(1)}</div>
      </div>
    `;
  }

  // Update size inputs when design is selected
  function updateSizeControls(design) {
    if (design) {
      selectedDesignForSize = design;
      sizeWidthInput.value = design.widthIn.toFixed(2);
      sizeHeightInput.value = design.heightIn.toFixed(2);
      updateDPI(design, design.widthIn, design.heightIn);
      sizeControlsSection.style.display = "block";
    } else {
      selectedDesignForSize = null;
      sizeControlsSection.style.display = "none";
    }
  }

  // Update DPI as user types
  sizeWidthInput.addEventListener("input", () => {
    if (selectedDesignForSize) {
      const width = parseFloat(sizeWidthInput.value) || 0;
      const height = parseFloat(sizeHeightInput.value) || 0;
      updateDPI(selectedDesignForSize, width, height);
    }
  });

  sizeHeightInput.addEventListener("input", () => {
    if (selectedDesignForSize) {
      const width = parseFloat(sizeWidthInput.value) || 0;
      const height = parseFloat(sizeHeightInput.value) || 0;
      updateDPI(selectedDesignForSize, width, height);
    }
  });

  // Apply size changes and reorganize
  sizeApplyBtn.addEventListener("click", () => {
    if (!selectedDesignForSize) return;
    
    const width = parseFloat(sizeWidthInput.value);
    const height = parseFloat(sizeHeightInput.value);
    
    if (width > 0 && height > 0) {
      store.updateDesignSize(selectedDesignForSize.id, width, height, true);
    }
  });

  // Subscribe to state changes
  store.subscribe((state) => {
    // Update sheet size buttons
    sheetSizesContainer.querySelectorAll(".gang-sheet-size-btn").forEach((btn) => {
      btn.classList.toggle("gang-sheet-size-btn-active", btn.dataset.sizeId === state.selectedSheetSizeId);
    });

    // Update designs list
    updateDesignsList(container.querySelector("#gang-designs-list"), state.designFiles, (designId) => {
      const design = state.designFiles.find((d) => d.id === designId);
      updateSizeControls(design);
    });

    // Update auto-pack design select and auto-select last uploaded
    updateAutoPackSelect(autoPackDesignSelect, state.designFiles);
    if (lastUploadedDesignId && state.designFiles.find((d) => d.id === lastUploadedDesignId)) {
      autoPackDesignSelect.value = lastUploadedDesignId;
      lastUploadedDesignId = null; // Reset after selecting
    }

    // Update size controls if design still exists
    if (selectedDesignForSize) {
      const updatedDesign = state.designFiles.find((d) => d.id === selectedDesignForSize.id);
      if (updatedDesign) {
        updateSizeControls(updatedDesign);
      } else {
        updateSizeControls(null);
      }
    }

    // Update quantity input
    qtyInput.value = state.sheetQuantity;

    // Update price preview
    updatePricePreview(container.querySelector("#gang-price-preview"), state);
  });
}

function updateDesignsList(container, designFiles, onSelectDesign) {
  container.innerHTML = "";
  
  if (designFiles.length === 0) {
    container.innerHTML = '<p class="gang-empty-state">No designs uploaded yet</p>';
    return;
  }

  designFiles.forEach((design) => {
    const item = document.createElement("div");
    item.className = "gang-design-item";
    const sizeIn = design.widthIn && design.heightIn 
      ? `${design.widthIn.toFixed(2)}" × ${design.heightIn.toFixed(2)}"`
      : `${design.naturalWidthPx} × ${design.naturalHeightPx} px`;
    
    item.innerHTML = `
      <div class="gang-design-thumb">
        <img src="${design.url}" alt="${design.name}" />
      </div>
      <div class="gang-design-info">
        <div class="gang-design-name">${design.name}</div>
        <div class="gang-design-size">${sizeIn}</div>
      </div>
      <button class="gang-design-edit-btn" data-design-id="${design.id}">Edit size</button>
      <button class="gang-design-use-btn" data-design-id="${design.id}">Use on sheet</button>
      <button class="gang-design-remove-btn" data-design-id="${design.id}" aria-label="Remove">×</button>
    `;
    
    const editBtn = item.querySelector(".gang-design-edit-btn");
    const useBtn = item.querySelector(".gang-design-use-btn");
    const removeBtn = item.querySelector(".gang-design-remove-btn");
    
    editBtn.addEventListener("click", () => {
      if (onSelectDesign) onSelectDesign(design.id);
    });
    
    useBtn.addEventListener("click", () => {
      store.addInstancesForDesign(design.id, 1, false);
    });
    
    removeBtn.addEventListener("click", () => {
      store.removeDesignFile(design.id);
    });
    
    container.appendChild(item);
  });
}

function updateAutoPackSelect(select, designFiles) {
  const currentValue = select.value;
  select.innerHTML = '<option value="">Select a design...</option>';
  
  designFiles.forEach((design) => {
    const option = document.createElement("option");
    option.value = design.id;
    option.textContent = design.name;
    select.appendChild(option);
  });
  
  // Restore selection if still valid
  if (currentValue && designFiles.find((d) => d.id === currentValue)) {
    select.value = currentValue;
  }
}

function updatePricePreview(container, state) {
  const unitPrice = pricing.getUnitPrice(state.selectedSheetSizeId, state.sheetQuantity);
  const subtotal = pricing.getSubtotal(state.selectedSheetSizeId, state.sheetQuantity);
  const band = pricing.getEffectiveBand(state.selectedSheetSizeId, state.sheetQuantity);

  if (unitPrice === null) {
    container.innerHTML = '<p class="gang-price-note">Pricing not available</p>';
    return;
  }

  let bandText = "";
  if (band) {
    if (band.to === null) {
      bandText = `Qty ${band.from}+: ${pricing.formatPrice(band.unitPrice)} / sheet`;
    } else {
      bandText = `Qty ${band.from}–${band.to}: ${pricing.formatPrice(band.unitPrice)} / sheet`;
    }
  }

  container.innerHTML = `
    <div class="gang-price-band">${bandText}</div>
    <div class="gang-price-total">${pricing.formatPrice(unitPrice)} per sheet × ${state.sheetQuantity} = ${pricing.formatPrice(subtotal)}</div>
  `;
}

export const SheetControlsPanel = { create };

