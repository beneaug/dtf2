const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='noStitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.38'/%3E%3C/svg%3E";

export function ThermalHeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-radial-hero">
      {/* Grain overlay */}
      <div
        className="absolute inset-0 mix-blend-overlay opacity-70"
        style={{
          backgroundImage: `url("${GRAIN_SVG}")`,
          backgroundSize: "120px 120px",
        }}
      />

      {/* Rising thermal gradient */}
      <div
        className="
          absolute left-1/2 top-full aspect-square w-[350%]
          -translate-x-1/2 blur-3xl
          will-change-transform will-change-opacity
          animate-thermal-rise
          md:w-[190%]
          [mask-image:linear-gradient(to_bottom,transparent_0%,black_5%,black_100%)]
          [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_5%,black_100%)]
          bg-thermal-blob
        "
      />
    </div>
  );
}



