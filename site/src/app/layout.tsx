import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Disruptis - Global Trade Disruption Monitor",
  description:
    "Trade disruption intelligence, updated daily. Scored, classified, and delivered as structured datasets.",
  openGraph: {
    locale: "en_US",
    type: "website",
    url: "https://disruptis.io/",
    title: "Disruptis — Global Trade Disruption Monitor",
    description:
      "Trade disruption intelligence, updated daily. Scored, classified, and delivered as structured datasets.",
    images: [
      {
        url: "https://disruptis.io/assets/og-image.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
      },
    ],
    siteName: "Disruptis",
  },
  twitter: {
    card: "summary_large_image",
    title: "Disruptis — Global Trade Disruption Monitor",
    description:
      "Trade disruption intelligence, updated daily. Scored, classified, and delivered as structured datasets.",
    images: ["https://disruptis.io/assets/og-image.jpg"],
  },
  icons: {
    icon: "/assets/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
      </head>
      <body>
        {children}
        <Script
          src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
