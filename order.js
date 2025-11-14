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
      qtyInput.value = clampQuantity(qtyInput.value - 1);
    });

    incBtn.addEventListener("click", () => {
      qtyInput.value = clampQuantity(qtyInput.value + 1);
    });

    qtyInput.addEventListener("blur", () => {
      qtyInput.value = clampQuantity(qtyInput.value);
    });
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
      '4" x 4"': 140,
      '6" x 6"': 200,
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
        img.onload = () => {
          applyPreviewSizing();
          // Release memory once the image is loaded
          URL.revokeObjectURL(img.src);
        };
        previewEl.appendChild(img);
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
      });
    }
  }

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

      const response = await fetch(ORDERS_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Server responded with ${response.status}`);
      }

      setStatus(
        "Order received. This is a demo endpoint – 12ozCollective will wire this into your real production workflow.",
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
      submitBtn.textContent = "Add to cart";
    }
  });
});


