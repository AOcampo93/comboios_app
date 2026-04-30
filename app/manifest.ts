import type { MetadataRoute } from "next";

// PWA manifest for installable mobile/desktop usage. Icons are placeholders generated
// from the existing train icon — replace with branded artwork before launch.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "comboios.live",
        short_name: "comboios",
        description:
            "Acompanhe todos os comboios da CP em tempo real, com histórico e fiabilidade.",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b1a2a",
        theme_color: "#0b6cf2",
        icons: [
            {
                src: "/icons/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icons/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icons/icon-maskable-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
        categories: ["travel", "navigation", "utilities"],
        lang: "pt-PT",
    };
}
