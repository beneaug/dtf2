# Thermal Sunrise Background

A Lovable-inspired rising grainy gradient effect with a thermal-imaging palette.

## Files

### 1. `thermal-background.html`
**Drop-in HTML/CSS** - Standalone file you can open directly in a browser for quick experiments.

### 2. `thermal-background-react.tsx`
**React + Tailwind version** - Component ready to use in your React app.

### 3. `thermal-background-tailwind.css`
**Additional CSS** - Keyframes and utilities for Tailwind integration.

## Usage

### HTML Version
Simply open `thermal-background.html` in your browser.

### React Version
```tsx
import ThermalBackground from './thermal-background-react'

function App() {
  return (
    <ThermalBackground>
      <h1>Your content here</h1>
    </ThermalBackground>
  )
}
```

## Features

- 🌡️ Thermal-imaging color palette (yellow → orange → pink → purple)
- 🌾 Grainy overlay texture
- ☀️ Rising gradient animation (sunset effect)
- 🎨 Soft fade at top edge (like Lovable)
- ⚡ Smooth cubic-bezier animation

## Customization

Adjust the thermal colors in the `background` gradient, or modify the animation timing in the `@keyframes thermal-rise` rule.
