document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".order-form");
  if (!form) return;

  const qtyInput = form.querySelector(".order-qty-input");
  const decBtn = form.querySelectorAll(".order-qty-btn")[0];
  const incBtn = form.querySelectorAll(".order-qty-btn")[1];
  const statusEl = form.querySelector(".order-status");
  const card = form.closest(".order-card") || document;
  const uploadInput = card.querySelector(".order-upload-input");
  const previewEl = card.querySelector(".order-upload-preview");
  const tabs = Array.from(card.querySelectorAll(".order-tab"));
  const sizeSelect = form.querySelector('select[name="size"]');
  const transferNameInput = form.querySelector('input[name="transferName"]');
  const garmentColorSelect = form.querySelector('select[name="garmentColor"]');
  const priceNoteEl = form.querySelector(".order-price-note");
  const qtySummaryEl = form.querySelector(".order-summary-qty");
  const totalSummaryEl = form.querySelector(".order-summary-total");
  const artSizeEl = form.querySelector(".order-summary-art-size");
  const bannerEl = document.getElementById("order-banner");
  // Success / cancel message based on querystring
  if (bannerEl) {
    const params = new URLSearchParams(window.location.search);
    const isSuccess = params.get("success") === "1";
    const isCanceled = params.get("canceled") === "1";

    if (isSuccess) {
      bannerEl.textContent =
        "Thanks — your DTF order is in the queue. You'll receive a Stripe receipt shortly.";
      bannerEl.classList.add("order-banner--success");
    } else if (isCanceled) {
      bannerEl.textContent =
        "Payment was canceled. No charge was made. You can update your details and try again.";
      bannerEl.classList.add("order-banner--error");
    }
  }

  // Configurable endpoint so you can point this at your real backend later.
  const ORDERS_ENDPOINT =
    window.ORDER_API_ENDPOINT || "/api/orders";

  function setStatus(message, type = "info") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `order-status order-status--${type}`;
  }

  function clampQuantity(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 1) return 1;
    if (n > 9999) return 9999;
    return n;
  }

  if (qtyInput && decBtn && incBtn) {
    decBtn.addEventListener("click", () => {
      const current = Number(qtyInput.value || "0");
      qtyInput.value = clampQuantity(current - 1);
      applyPreviewSizing();
      if (sizeSelect) {
        // keep price/preview in sync
        const qty = clampQuantity(qtyInput.value);
        qtyInput.value = qty;
        if (typeof getUnitPrice === "function") {
          // no-op here, real update happens in updatePreview/price
        }
      }
    });

    incBtn.addEventListener("click", () => {
      const current = Number(qtyInput.value || "0");
      qtyInput.value = clampQuantity(current + 1);
      applyPreviewSizing();
      if (sizeSelect) {
        const qty = clampQuantity(qtyInput.value);
        qtyInput.value = qty;
      }
    });

    qtyInput.addEventListener("blur", () => {
      qtyInput.value = clampQuantity(qtyInput.value);
    });
  }

  // Pricing bands (USD per transfer) scraped from SupaDTF
  const PRICE_BANDS = {
    '2" x 2"': [1.0, 0.65, 0.55, 0.45],
    '4" x 2"': [1.95, 1.25, 1.05, 0.9],
    '3" x 3"': [2.25, 1.45, 1.25, 1.0],
    '5" x 3"': [2.95, 1.95, 1.65, 1.35],
    '4" x 4"': [2.95, 1.95, 1.65, 1.35],
    '5" x 5"': [3.95, 2.55, 2.15, 1.8],
    '6" x 6"': [4.95, 3.2, 2.7, 2.2],
    '7" x 7"': [5.95, 3.85, 3.25, 2.7],
    '11" x 5"': [6.4, 4.2, 3.55, 2.9],
    '8" x 8"': [6.95, 4.5, 3.8, 3.1],
    '9" x 9"': [7.95, 5.15, 4.39, 3.5],
    '9" x 11"': [8.45, 5.5, 4.65, 3.8],
    '10" x 10"': [8.95, 5.8, 4.9, 4.0],
    '11" x 11"': [9.95, 6.4, 5.4, 4.5],
    '11" x 14"': [11.45, 7.4, 6.3, 5.15],
    '12" x 17"': [14.4, 9.4, 7.95, 6.4],
    '12" x 22"': [15.31, 12.41, 10.82, 9.24],
  };

  function getUnitPrice(sizeLabel, qty) {
    const bands = PRICE_BANDS[sizeLabel];
    if (!bands) return null;
    let idx = 0;
    if (qty <= 9) idx = 0;
    else if (qty <= 49) idx = 1;
    else if (qty <= 99) idx = 2;
    else idx = 3;
    return bands[idx];
  }

  function formatPrice(n) {
    return `$${n.toFixed(2)}`;
  }

  function updatePricingDisplay() {
    if (!sizeSelect || !qtyInput) return;
    const sizeLabel = sizeSelect.value;
    const qty = clampQuantity(qtyInput.value);
    const unitPrice = getUnitPrice(sizeLabel, qty);
    if (!unitPrice) {
      if (priceNoteEl) {
        priceNoteEl.textContent =
          "Pricing will be confirmed by 12ozCollective.";
      }
      if (totalSummaryEl) totalSummaryEl.textContent = "$0.00";
      if (qtySummaryEl) qtySummaryEl.textContent = String(qty);
      return;
    }
    const total = unitPrice * qty;
    if (priceNoteEl) {
      priceNoteEl.textContent = `${formatPrice(
        unitPrice
      )} per transfer · ${formatPrice(total)} total`;
    }
    if (qtySummaryEl) qtySummaryEl.textContent = String(qty);
    if (totalSummaryEl) totalSummaryEl.textContent = formatPrice(total);
  }

  // Artwork preview in the upload area
  function applyPreviewSizing() {
    if (!previewEl) return;
    const img = previewEl.querySelector("img");
    if (!img) return;

    const label = (sizeSelect && sizeSelect.value) || '2" x 2"';
    // Map size labels to a base pixel dimension so sizes feel 1:1 relative.
    const baseSideMap = {
      '2" x 2"': 80,
      '4" x 2"': 80,
      '3" x 3"': 100,
      '5" x 3"': 120,
      '4" x 4"': 140,
      '5" x 5"': 160,
      '6" x 6"': 200,
      '7" x 7"': 220,
      '11" x 5"': 240,
      '8" x 8"': 240,
      '9" x 9"': 260,
      '9" x 11"': 280,
      '10" x 10"': 280,
      '11" x 11"': 300,
      '11" x 14"': 320,
      '12" x 17"': 340,
      '12" x 22"': 360,
      "Custom sheet": 220,
    };
    const baseSide = baseSideMap[label] || 120;

    const naturalW = img.naturalWidth || baseSide;
    const naturalH = img.naturalHeight || baseSide;
    const maxSide = Math.max(naturalW, naturalH);
    const scale = baseSide / maxSide;

    img.style.width = `${naturalW * scale}px`;
    img.style.height = `${naturalH * scale}px`;
  }

  if (uploadInput && previewEl) {
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files && uploadInput.files[0];
      previewEl.innerHTML = "";
      previewEl.classList.remove("order-upload-preview--visible");

      if (!file) return;

      if (file.type && file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.alt = file.name;
        img.src = URL.createObjectURL(file);
        img.draggable = false;
        img.oncontextmenu = () => false;
        
        img.onload = () => {
          applyPreviewSizing();
          // Actual artwork size calculation
          if (artSizeEl && sizeSelect) {
            const label = sizeSelect.value;
            const match =
              label && label.match(/(\d+(?:\.\d+)?)"\s*x\s*(\d+(?:\.\d+)?)/);
            if (match) {
              const boxW = parseFloat(match[1]);
              const boxH = parseFloat(match[2]);
              const naturalW = img.naturalWidth || 1;
              const naturalH = img.naturalHeight || 1;
              const aspect = naturalW / naturalH;
              const boxAspect = boxW / boxH;

              let artW, artH;
              if (aspect >= boxAspect) {
                artW = boxW;
                artH = boxW / aspect;
              } else {
                artH = boxH;
                artW = boxH * aspect;
              }
              artSizeEl.textContent = `${artW.toFixed(2)}" × ${artH.toFixed(
                2
              )}"`;
            } else {
              artSizeEl.textContent = label;
            }
          }
          // Release memory once the image is loaded
          URL.revokeObjectURL(img.src);
        };
        
        // Create DTF transfer structure
        const container = document.createElement("div");
        container.className = "dtf-transfer-container";
        
        const artworkBase = document.createElement("div");
        artworkBase.className = "dtf-artwork-base";
        
        const artworkLighting = document.createElement("div");
        artworkLighting.className = "dtf-artwork-lighting";
        artworkLighting.appendChild(img);
        
        artworkBase.appendChild(artworkLighting);
        container.appendChild(artworkBase);
        
        // Transfer sheet overlay
        const transferSheet = document.createElement("div");
        transferSheet.className = "dtf-transfer-sheet";
        
        // Main sheet layer (covers the image, clips as corner peels)
        const sheetMain = document.createElement("div");
        sheetMain.className = "dtf-sheet-main";
        const sheetMainInner = document.createElement("div");
        sheetMainInner.className = "dtf-sheet-main-inner";
        sheetMain.appendChild(sheetMainInner);
        transferSheet.appendChild(sheetMain);
        
        // Shadow layer under the peeling corner
        const shadow = document.createElement("div");
        shadow.className = "dtf-sheet-shadow";
        const shadowInner = document.createElement("div");
        shadowInner.className = "dtf-sheet-shadow-inner";
        shadow.appendChild(shadowInner);
        transferSheet.appendChild(shadow);
        
        // Flap layer (the curling 3D corner with backside visible)
        const sheetFlap = document.createElement("div");
        sheetFlap.className = "dtf-sheet-flap";
        const flapLighting = document.createElement("div");
        flapLighting.className = "dtf-flap-lighting";
        const flapInner = document.createElement("div");
        flapInner.className = "dtf-flap-inner";
        flapLighting.appendChild(flapInner);
        sheetFlap.appendChild(flapLighting);
        transferSheet.appendChild(sheetFlap);
        
        artworkBase.appendChild(transferSheet);
        previewEl.appendChild(container);
      } else {
        const fallback = document.createElement("div");
        fallback.className = "order-upload-preview-fallback";
        fallback.textContent = file.name;
        previewEl.appendChild(fallback);
      }

      previewEl.classList.add("order-upload-preview--visible");
    });

    if (sizeSelect) {
      sizeSelect.addEventListener("change", () => {
        applyPreviewSizing();
        updatePricingDisplay();
      });
    }
  }

  if (sizeSelect) {
    sizeSelect.addEventListener("change", updatePricingDisplay);
  }
  if (qtyInput) {
    qtyInput.addEventListener("input", updatePricingDisplay);
  }
  updatePricingDisplay();

  // Mode tabs – just cosmetic for now, but we record the choice.
  let currentMode = "single-image";
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("order-tab--active"));
      tab.classList.add("order-tab--active");
      currentMode = (tab.textContent || "").trim().toLowerCase().replace(/\s+/g, "-");
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector(".order-primary-btn");
    if (!submitBtn) return;

    setStatus("", "info");

    // Client-side validation
    if (!transferNameInput || !transferNameInput.value.trim()) {
      setStatus("Please name this transfer run.", "error");
      transferNameInput && transferNameInput.focus();
      return;
    }

    if (!garmentColorSelect || !garmentColorSelect.value) {
      setStatus("Please choose a garment color.", "error");
      garmentColorSelect && garmentColorSelect.focus();
      return;
    }
    if (!uploadInput || !uploadInput.files || uploadInput.files.length === 0) {
      setStatus("Please upload at least one artwork file.", "error");
      uploadInput && uploadInput.focus();
      return;
    }

    if (!qtyInput || clampQuantity(qtyInput.value) < 1) {
      setStatus("Quantity must be at least 1.", "error");
      qtyInput && qtyInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      const formData = new FormData(form);
      formData.set("quantity", String(clampQuantity(qtyInput.value)));
      formData.set("mode", currentMode);
      // include pricing info if available
      const sizeLabel = sizeSelect && sizeSelect.value;
      const qty = clampQuantity(qtyInput.value);
      const unitPrice = sizeLabel ? getUnitPrice(sizeLabel, qty) : null;
      if (unitPrice != null) {
        formData.set("unitPrice", String(unitPrice));
        formData.set("totalPrice", String(unitPrice * qty));
      }

      const response = await fetch(ORDERS_ENDPOINT, {
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

      setStatus(
        "Order received. You can safely close this page.",
        "success"
      );
    } catch (err) {
      console.error(err);
      setStatus(
        "Something went wrong while submitting your order. Please try again or contact 12ozCollective.",
        "error"
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Checkout";
    }
  });

  // === DTF Transfer Interactive Effects ===
  const pointLight = document.querySelector("fePointLight");
  const pointLightFlipped = document.getElementById("fePointLightFlipped");
  let currentTransferContainer = null;
  let currentArtworkBase = null;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function getContainingBlockOffset(element) {
    const containingBlock = element.offsetParent || document.documentElement;
    const rect = containingBlock.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top
    };
  }

  function updateLightPosition(mouseX, mouseY) {
    if (!currentArtworkBase || !pointLight || !pointLightFlipped) return;
    
    const rect = currentArtworkBase.getBoundingClientRect();
    const relativeX = mouseX - rect.left;
    const relativeY = mouseY - rect.top;
    
    pointLight.setAttribute("x", relativeX);
    pointLight.setAttribute("y", relativeY);
    pointLightFlipped.setAttribute("x", relativeX);
    pointLightFlipped.setAttribute("y", rect.height - relativeY);
  }

  function startDrag(e) {
    if (!currentTransferContainer) return;
    isDragging = true;
    
    const rect = currentTransferContainer.getBoundingClientRect();
    const containingBlockOffset = getContainingBlockOffset(currentTransferContainer);
    
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    
    currentTransferContainer.style.position = "absolute";
    currentTransferContainer.style.left = rect.left - containingBlockOffset.left + "px";
    currentTransferContainer.style.top = rect.top - containingBlockOffset.top + "px";
  }

  function updateDragPosition(e) {
    if (!isDragging || !currentTransferContainer) return;
    
    const containingBlockOffset = getContainingBlockOffset(currentTransferContainer);
    currentTransferContainer.style.left = e.clientX - dragOffsetX - containingBlockOffset.left + "px";
    currentTransferContainer.style.top = e.clientY - dragOffsetY - containingBlockOffset.top + "px";
  }

  function stopDrag() {
    isDragging = false;
  }

  // Update references when a new image is loaded
  const observer = new MutationObserver(() => {
    const container = previewEl && previewEl.querySelector(".dtf-transfer-container");
    const artworkBase = container && container.querySelector(".dtf-artwork-base");
    
    if (container && artworkBase) {
      currentTransferContainer = container;
      currentArtworkBase = artworkBase;
      
      // Remove old event listeners
      container.removeEventListener("mousedown", startDrag);
      
      // Add new event listeners
      container.addEventListener("mousedown", startDrag);
    }
  });

  if (previewEl) {
    observer.observe(previewEl, { childList: true, subtree: true });
  }

  // Global mouse movement for lighting
  document.addEventListener("mousemove", (e) => {
    updateLightPosition(e.clientX, e.clientY);
    updateDragPosition(e);
  });

  document.addEventListener("mouseup", stopDrag);
});


