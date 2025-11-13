const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='noStitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.38'/%3E%3C/svg%3E";

const HERO_BG =
  "radial-gradient(circle at 50% -20%, #111827 0, #020308 55%)";

const BLOB_BG =
  "radial-gradient(circle at 50% 80%, #fff4b3 0, #ffe066 10%, #ffba08 22%, #ff7b00 35%, #ff006e 50%, #d40078 63%, #7b2cbf 78%, #020308 100%)";

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



