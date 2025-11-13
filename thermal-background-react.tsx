'use client'

/**
 * Thermal Sunrise Background Component
 * 
 * React + Tailwind version of the Lovable-inspired rising grainy gradient
 * with a thermal-imaging palette.
 * 
 * Usage:
 * ```tsx
 * import ThermalBackground from './thermal-background-react'
 * 
 * function App() {
 *   return (
 *     <ThermalBackground>
 *       <YourContent />
 *     </ThermalBackground>
 *   )
 * }
 * ```
 */

export default function ThermalBackground({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <div 
      className="relative min-h-screen overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 50% -20%, #111827 0, #020308 55%)',
      }}
    >
      {/* Grain overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-70 mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='noStitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.38'/%3E%3C/svg%3E")`,
          backgroundSize: '120px 120px',
        }}
      />
      
      {/* Rising thermal gradient */}
      <div 
        className="absolute left-1/2 w-[350%] aspect-square blur-2xl will-change-transform animate-thermal-rise"
        style={{
          background: `
            radial-gradient(circle at 50% 15%,
              #fff4b3 0,
              #ffe066 10%,
              #ffba08 22%,
              #ff7b00 35%,
              #ff006e 50%,
              #d40078 63%,
              #7b2cbf 78%,
              #240046 100%
            )
          `,
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 5%, black 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 5%, black 100%)',
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen">
        {children}
      </div>
    </div>
  )
}
