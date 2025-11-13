import ThermalBackground from '../thermal-background-react'

export default function Home() {
  return (
    <ThermalBackground>
      <main className="flex min-h-screen flex-col items-center justify-center text-center px-6 py-16">
        <h1 className="text-6xl font-bold mb-4">
          Build something <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-600">Thermal</span>
        </h1>
        <p className="text-xl text-gray-300 max-w-2xl">
          Create apps and websites with a spicy IR glow.
        </p>
      </main>
    </ThermalBackground>
  )
}
