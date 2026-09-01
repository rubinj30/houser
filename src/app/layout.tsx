import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Houser",
  title: "Houser — Home care, made clear",
  description: "Track maintenance, projects, documents, and service history across your properties.",
  appleWebApp: {
    capable: true,
    title: "Houser",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#173f32",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
