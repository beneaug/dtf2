import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Lovable Thermal Hero",
  description: "Landing page with a thermal hero background inspired by Lovable.dev",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[#050507] text-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}


