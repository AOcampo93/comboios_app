import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Providers from "./providers";

import "@/i18n/i18n";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "comboios.live 🚆",
    description:
        "Acompanhe todos os comboios da CP em tempo real, com histórico e fiabilidade.",
    applicationName: "comboios.live",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "comboios.live",
    },
    formatDetection: {
        telephone: false,
    },
};

export const viewport: Viewport = {
    themeColor: "#0b6cf2",
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <Providers>{children}</Providers>
            </body>
            <Script
                defer
                src="https://webanalytics.transportes.fyi/script.js"
                data-website-id="54bd1214-ecd6-4abb-bef6-6f3caf490e13"
            />
        </html>
    );
}
