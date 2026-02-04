import type { Metadata } from "next";
import { Fraunces, Spline_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const displayFont = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const bodyFont = Spline_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const siteUrl = "https://fileshare.hackerslash.dev";
const siteName = "WarpShare";
const siteTitle = "WarpShare - Free Unlimited File Sharing | No Size Limits | P2P Transfer";
const siteDescription = "Share files instantly with no size limits. Free unlimited file sharing powered by WebRTC peer-to-peer technology. No registration required, secure, and private. Transfer large files directly between browsers.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  keywords: [
    "unlimited file share",
    "free file sharing",
    "no size limit file transfer",
    "p2p file sharing",
    "peer to peer file transfer",
    "large file sharing",
    "send large files free",
    "browser file transfer",
    "WebRTC file sharing",
    "secure file sharing",
    "private file transfer",
    "no registration file share",
    "instant file sharing",
    "file sharing without limits",
    "share files online free",
  ],
  authors: [{ name: "Md Afridi" }],
  creator: "Md Afridi",
  publisher: "WarpShare",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: siteName,
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "WarpShare - Free Unlimited File Sharing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [`${siteUrl}/og-image.png`],
    creator: "@hackerslash",
  },
  alternates: {
    canonical: siteUrl,
  },
  category: "technology",
};

// JSON-LD Structured Data
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteName,
  url: siteUrl,
  description: siteDescription,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Unlimited file size",
    "No registration required",
    "Peer-to-peer secure transfer",
    "Real-time file sharing",
    "Cross-platform support",
    "No file storage on servers",
  ],
  author: {
    "@type": "Person",
    name: "Md Afridi",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
