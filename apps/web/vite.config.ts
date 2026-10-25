import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Guilty Dragon Remake",
        short_name: "GD Remake",
        description: "Card-building and asynchronous PvP for friends.",
        lang: "zh-Hant",
        display: "standalone",
        orientation: "portrait",
        background_color: "#14101f",
        theme_color: "#14101f",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        // App shell and versioned static assets only. Never cache API responses:
        // they are authenticated, private, or mutate draws/battles.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
});
