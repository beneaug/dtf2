import { ThermalHeroBackground } from "@/components/ThermalHeroBackground";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050507] text-slate-50">
      <ThermalHeroBackground />

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 pb-24 pt-24 text-center">
        <h1 className="mb-4 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Build something <span className="text-[#ffba08]">Thermal</span>
        </h1>
        <p className="max-w-xl text-base text-slate-300 sm:text-lg">
          Create apps and websites with a warm infrared glow, powered by AI.
        </p>
      </main>
    </div>
  );
}


