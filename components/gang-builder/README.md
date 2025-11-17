# Gang Builder Architecture

## Overview

The Gang Builder is a self-contained DTF gang sheet builder implemented in vanilla JavaScript (ES modules). It provides a full-screen overlay interface for building custom gang sheets with multiple designs.

## Architecture

### Core Library (`/lib/gang-builder/`)

- **`config.js`**: Defines sheet sizes (22x12, 22x24, 22x60, 22x120, 22x180) and pricing bands
- **`pricing.js`**: Calculates unit prices and subtotals based on quantity and price bands
- **`layout.js`**: Handles auto-packing logic and coordinate conversions (inches ↔ pixels)
- **`metrics.js`**: Calculates sheet usage statistics (area used, percentage, instance count)
- **`store.js`**: Simple reactive state management using a subscription pattern
- **`cart.js`**: Stub implementation for adding orders to cart (ready for backend integration)

### UI Components (`/components/gang-builder/`)

- **`builder-overlay.js`**: Main overlay container that orchestrates the builder UI
- **`sheet-controls-panel.js`**: Left panel with sheet size selector, artwork upload, layout controls, and order summary
- **`sheet-canvas.js`**: Interactive HTML5 canvas for visualizing and manipulating designs on the sheet
- **`stats-panel.js`**: Right panel showing usage statistics and quality checks
- **`gang-builder-init.js`**: Initialization script that wires the builder to the order page tabs

## Key Features

1. **Sheet Size Selection**: Choose from 5 standard sheet sizes (22x12 to 22x180 inches)
2. **Artwork Upload**: Drag & drop or browse to upload multiple design files
3. **Auto-Packing**: Grid-based algorithm to automatically pack designs onto the sheet
4. **Interactive Canvas**: Drag instances to reposition, with optional snap-to-grid
5. **Live Usage Stats**: Real-time calculation of sheet usage percentage and instance count
6. **Volume Pricing**: Price bands that adjust based on quantity
7. **Add to Cart**: Stub function ready for backend integration

## State Management

The builder uses a simple reactive state pattern:
- State is stored in a single object
- Components subscribe to state changes
- Actions update state and notify all subscribers
- No external dependencies (no Zustand, Redux, etc.)

## Integration

The builder is integrated into `order.html` via:
- Clicking the "Build sheet" tab opens the builder overlay
- The builder is initialized in `gang-builder-init.js`
- All modules use ES6 imports/exports

## Future Enhancements

- Image preloading and caching for better canvas performance
- Resize handles for instances
- Rotation controls
- Undo/redo functionality
- Export layout as JSON/image
- Backend cart integration (replace stub in `cart.js`)

