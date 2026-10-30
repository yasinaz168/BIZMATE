import type { Config } from "tailwindcss";

/**
 * ============================================
 * BIZMATE DESIGN SYSTEM — Tailwind Config
 * ============================================
 * Warna didefinisikan sebagai CSS variables (RGB channels) di globals.css,
 * sehingga bisa dipakai dengan opacity modifier Tailwind (mis. bg-primary/10).
 *
 * Palet utama:
 * - primary   #087F73  (hijau utama, aksi & penjualan)
 * - deep      #123D38  (hijau gelap, sidebar & aksen premium)
 * - background#F4F7F6  (latar aplikasi)
 * - surface   #FFFFFF  (kartu/panel)
 * - line      #DCE5E2  (border tipis)
 * - foreground#172B28  (teks utama)
 * - muted-fg  #71817D  (teks sekunder)
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          deep: "rgb(var(--primary-deep) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        income: "rgb(var(--income) / <alpha-value>)",
        expense: "rgb(var(--expense) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        // Bayangan sangat halus sesuai design rules
        card: "0 1px 2px rgba(18, 61, 56, 0.04), 0 6px 20px rgba(18, 61, 56, 0.05)",
        lift: "0 2px 4px rgba(18, 61, 56, 0.06), 0 12px 32px rgba(18, 61, 56, 0.10)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out both",
        "fade-up": "fade-up 0.5s ease-out both",
        "slide-in-right": "slide-in-right 0.25s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
