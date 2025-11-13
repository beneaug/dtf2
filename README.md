# Thermal Gradient Background

Recreation of Lovable.dev's rising grainy gradient effect with a thermal-imaging palette.

## Files

### Standalone Version
- **`thermal-standalone.html`** - Drop-in HTML file with embedded CSS. Open in a browser to see the effect immediately.

### React + Tailwind Version (Next.js)
- **`components/ThermalHeroBackground.tsx`** - Reusable React component
- **`app/page.tsx`** - Example usage in Next.js App Router
- **`tailwind.config.js`** - Tailwind configuration with custom animation and background

## Features

- Dark, grainy background at load
- Huge blurred thermal gradient that rises from the bottom like a sunset
- Gradient settles in the lower half of the screen
- Top edge masked to softly fade into the dark background
- Thermal color palette: yellow → orange → hot pink → purple → deep navy

## Usage

### Standalone
Simply open `thermal-standalone.html` in your browser.

### Next.js
1. Ensure you have Tailwind CSS configured
2. Copy `components/ThermalHeroBackground.tsx` to your components folder
3. Add the Tailwind config extensions to your `tailwind.config.js`
4. Use the component in your pages:

```tsx
import { ThermalHeroBackground } from "@/components/ThermalHeroBackground";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050507] text-slate-50">
      <ThermalHeroBackground />
      {/* Your content here */}
    </div>
  );
}
```

## Animation Details

The gradient animates with:
- Initial position: `translate(-50%, 60vh)` with `opacity: 0`
- Overshoots to `translate(-50%, 10vh)` at 40%
- Settles to `translate(-50%, 5vh)` at 100%
- Duration: 2.4s with cubic-bezier easing `(0.22, 0.61, 0.21, 1)`

