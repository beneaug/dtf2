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
  const previewMetrics = {
    naturalWidth: 0,
    naturalHeight: 0,
  };
  let previewLightNodes = null;
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
  const PX_PER_INCH = 34;
  const MAX_PREVIEW_SIDE = 420;

  function parseSizeLabel(label) {
    if (!label) return null;
    const match = label.match(/(\d+(?:\.\d+)?)"\s*x\s*(\d+(?:\.\d+)?)/i);
    if (!match) return null;
    return {
      width: parseFloat(match[1]),
      height: parseFloat(match[2]),
    };
  }

  function getPreviewElements() {
    if (!previewEl) return { stage: null, artImg: null };
    return {
      stage: previewEl.querySelector(".dtf-preview-stage"),
      artImg: previewEl.querySelector(".dtf-art-image"),
    };
  }

  function ensurePreviewFilters() {
    if (previewLightNodes) return previewLightNodes;
    const filtersRoot = document.getElementById("dtf-preview-filters");
    if (!filtersRoot) return null;
    const pointLight = filtersRoot.querySelector("#dtfPointLightNode");
    const flippedLight = filtersRoot.querySelector("#dtfPointLightFlippedNode");
    if (!pointLight || !flippedLight) return null;
    previewLightNodes = { pointLight, flippedLight };
    return previewLightNodes;
  }

  function setPreviewLightPosition(stage, clientX, clientY) {
    const lights = ensurePreviewFilters();
    if (!lights || !stage) return;
    const rect = stage.getBoundingClientRect();
    const boundedX = Math.max(rect.left, Math.min(rect.right, clientX));
    const boundedY = Math.max(rect.top, Math.min(rect.bottom, clientY));
    const relativeX = boundedX - rect.left;
    const relativeY = boundedY - rect.top;
    lights.pointLight.setAttribute("x", relativeX.toFixed(2));
    lights.pointLight.setAttribute("y", relativeY.toFixed(2));
    lights.flippedLight.setAttribute("x", relativeX.toFixed(2));
    lights.flippedLight.setAttribute(
      "y",
      Math.max(0, rect.height - relativeY).toFixed(2)
    );
  }

  function resetPreviewLight(stage) {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    setPreviewLightPosition(
      stage,
      rect.left + rect.width * 0.6,
      rect.top + rect.height * 0.25
    );
  }

  function bindPreviewInteractions(previewRoot) {
    const stage = previewRoot && previewRoot.querySelector(".dtf-preview-stage");
    if (!stage) return;

    const handlePointerMove = (event) => {
      setPreviewLightPosition(stage, event.clientX, event.clientY);
    };

    stage.addEventListener("pointerenter", (event) => {
      stage.classList.add("is-hovered");
      handlePointerMove(event);
    });

    stage.addEventListener("pointermove", handlePointerMove);

    stage.addEventListener("pointerleave", () => {
      stage.classList.remove("is-hovered", "is-active");
      resetPreviewLight(stage);
    });

    stage.addEventListener("pointerdown", (event) => {
      stage.classList.add("is-active");
      if (stage.setPointerCapture) {
        stage.setPointerCapture(event.pointerId);
      }
    });

    stage.addEventListener("pointerup", () => {
      stage.classList.remove("is-active");
    });

    stage.addEventListener("lostpointercapture", () => {
      stage.classList.remove("is-active");
    });

    resetPreviewLight(stage);
  }

  function createPreviewMarkup() {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div class="dtf-preview">
        <div class="dtf-preview-stage" data-natural-width="0" data-natural-height="0">
          <div class="dtf-art">
            <div class="dtf-art-lighting">
              <img class="dtf-art-image" alt="" draggable="false" />
            </div>
          </div>
          <div class="dtf-transfer" aria-hidden="true">
            <div class="dtf-transfer-sheet"></div>
            <div class="dtf-transfer-peel"></div>
          </div>
        </div>
      </div>
    `;
    return wrapper.firstElementChild;
  }

  function isLikelyImage(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|bmp|svg|webp|tiff?)$/i.test(file.name || "");
  }

  function updateArtSizeSummary() {
    if (!artSizeEl) return;
    if (!sizeSelect || !sizeSelect.value) {
      artSizeEl.textContent = "–";
      return;
    }
    const dimensions = parseSizeLabel(sizeSelect.value);
    if (!dimensions) {
      artSizeEl.textContent = sizeSelect.value;
      return;
    }

    const naturalW = previewMetrics.naturalWidth;
    const naturalH = previewMetrics.naturalHeight;
    if (!naturalW || !naturalH) {
      artSizeEl.textContent = `${dimensions.width.toFixed(
        2
      )}" × ${dimensions.height.toFixed(2)}"`;
      return;
    }

    const naturalAspect = naturalW / naturalH;
    const boxAspect = dimensions.width / dimensions.height;
    let artWidthInches;
    let artHeightInches;

    if (naturalAspect >= boxAspect) {
      artWidthInches = dimensions.width;
      artHeightInches = dimensions.width / naturalAspect;
    } else {
      artHeightInches = dimensions.height;
      artWidthInches = dimensions.height * naturalAspect;
    }

    artSizeEl.textContent = `${artWidthInches.toFixed(
      2
    )}" × ${artHeightInches.toFixed(2)}"`;
  }

  function applyPreviewSizing() {
    const { stage, artImg } = getPreviewElements();
    if (!stage || !artImg) return;

    const naturalW =
      Number(stage.dataset.naturalWidth) ||
      previewMetrics.naturalWidth ||
      artImg.naturalWidth ||
      1;
    const naturalH =
      Number(stage.dataset.naturalHeight) ||
      previewMetrics.naturalHeight ||
      artImg.naturalHeight ||
      1;

    const parsedSize = parseSizeLabel(sizeSelect && sizeSelect.value);
    let boxWidthPx = 180;
    let boxHeightPx = 180;

    if (parsedSize) {
      const widthPxRaw = parsedSize.width * PX_PER_INCH;
      const heightPxRaw = parsedSize.height * PX_PER_INCH;
      const longest = Math.max(widthPxRaw, heightPxRaw, 1);
      const scaleDown = Math.min(1, MAX_PREVIEW_SIDE / longest);
      boxWidthPx = widthPxRaw * scaleDown;
      boxHeightPx = heightPxRaw * scaleDown;
    } else {
      const maxSide = Math.max(naturalW, naturalH, 1);
      const base = 200;
      const scale = base / maxSide;
      boxWidthPx = naturalW * scale;
      boxHeightPx = naturalH * scale;
    }

    const naturalAspect = naturalW / naturalH || 1;
    const boxAspect = boxWidthPx / boxHeightPx || 1;
    let finalWidth = boxWidthPx;
    let finalHeight = boxHeightPx;

    if (naturalAspect >= boxAspect) {
      finalHeight = finalWidth / naturalAspect;
    } else {
      finalWidth = finalHeight * naturalAspect;
    }

    artImg.style.width = `${finalWidth}px`;
    artImg.style.height = `${finalHeight}px`;

    stage.style.setProperty("--dtf-art-width", `${finalWidth}px`);
    stage.style.setProperty("--dtf-art-height", `${finalHeight}px`);

    const computed = getComputedStyle(stage);
    const transferPad =
      parseFloat(computed.getPropertyValue("--dtf-transfer-pad")) || 22;
    const transferWidth = finalWidth + transferPad * 2;
    const transferHeight = finalHeight + transferPad * 2;
    stage.style.setProperty("--dtf-transfer-width", `${transferWidth}px`);
    stage.style.setProperty("--dtf-transfer-height", `${transferHeight}px`);
    const peelMax = Math.min(transferWidth, transferHeight) * 0.65;
    stage.style.setProperty("--dtf-peel-max", `${peelMax}px`);
  }

  function renderImagePreview(file) {
    if (!previewEl) return;
    const previewNode = createPreviewMarkup();
    const stage = previewNode.querySelector(".dtf-preview-stage");
    const artImg = previewNode.querySelector(".dtf-art-image");
    if (!stage || !artImg) return;

    const objectUrl = URL.createObjectURL(file);
    artImg.alt = file.name || "Uploaded artwork";
    artImg.src = objectUrl;
    artImg.addEventListener("contextmenu", (event) => event.preventDefault());

    artImg.onload = () => {
      if (!previewNode.isConnected) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      previewMetrics.naturalWidth = artImg.naturalWidth || 1;
      previewMetrics.naturalHeight = artImg.naturalHeight || 1;
      stage.dataset.naturalWidth = String(previewMetrics.naturalWidth);
      stage.dataset.naturalHeight = String(previewMetrics.naturalHeight);
      applyPreviewSizing();
      updateArtSizeSummary();
      bindPreviewInteractions(previewNode);
      URL.revokeObjectURL(objectUrl);
    };

    artImg.onerror = () => {
      if (!previewNode.isConnected) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      URL.revokeObjectURL(objectUrl);
      previewMetrics.naturalWidth = 0;
      previewMetrics.naturalHeight = 0;
      previewEl.classList.remove("order-upload-preview--visible");
      previewEl.innerHTML = "";
      const errorFallback = document.createElement("div");
      errorFallback.className = "order-upload-preview-fallback";
      errorFallback.textContent =
        "We couldn't preview this file. Please try another image.";
      previewEl.appendChild(errorFallback);
      updateArtSizeSummary();
    };

    previewEl.appendChild(previewNode);
    previewEl.classList.add("order-upload-preview--visible");
  }

  if (uploadInput && previewEl) {
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files && uploadInput.files[0];
      previewEl.innerHTML = "";
      previewEl.classList.remove("order-upload-preview--visible");

      if (!file) {
        previewMetrics.naturalWidth = 0;
        previewMetrics.naturalHeight = 0;
        updateArtSizeSummary();
        return;
      }

      if (isLikelyImage(file)) {
        renderImagePreview(file);
      } else {
        const fallback = document.createElement("div");
        fallback.className = "order-upload-preview-fallback";
        fallback.textContent = file.name;
        previewEl.appendChild(fallback);
        previewEl.classList.add("order-upload-preview--visible");
        previewMetrics.naturalWidth = 0;
        previewMetrics.naturalHeight = 0;
        updateArtSizeSummary();
      }
    });
  }

  if (sizeSelect) {
    sizeSelect.addEventListener("change", () => {
      updatePricingDisplay();
      applyPreviewSizing();
      updateArtSizeSummary();
    });
  }
  if (qtyInput) {
    qtyInput.addEventListener("input", updatePricingDisplay);
  }
  updatePricingDisplay();
  updateArtSizeSummary();

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
});


