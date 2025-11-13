const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='noStitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.38'/%3E%3C/svg%3E";

const HERO_BG =
  "radial-gradient(circle at 50% -20%, #111827 0, #020308 55%, #020308 100%)";

// Thermal blob that concentrates heat near the bottom and fades to transparent
const BLOB_BG =
  "radial-gradient(circle at 50% 120%, rgba(255,244,179,0) 0%, rgba(255,244,179,0.16) 20%, rgba(255,186,8,0.45) 38%, rgba(255,0,110,0.6) 55%, rgba(123,44,191,0.45) 72%, rgba(2,3,8,0) 100%)";

export function ThermalHeroBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        backgroundImage: HERO_BG,
        backgroundColor: "#020308",
      }}
    >
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
        style={{
          backgroundImage: BLOB_BG,
        }}
        className="thermal-blob"
      />
    </div>
  );
}



