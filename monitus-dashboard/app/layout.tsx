import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const TITLE = "Monitus | Early warning for offshore oil wells";
const DESCRIPTION =
  "Monitus reads five pressure and temperature sensors on offshore wells and raises the alarm while a fault is still developing. Replay real well recordings and see when it would have warned.";

export const metadata: Metadata = {
  metadataBase: new URL("https://monitus.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Monitus",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#eef1f5",
};

const RootLayout = ({ children }: Readonly<{ children: ReactNode }>) => (
  <html lang="en" className={archivo.variable}>
    <body suppressHydrationWarning>{children}</body>
  </html>
);

export default RootLayout;
