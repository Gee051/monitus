import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitus | Early warning for offshore oil wells",
  description:
    "Replays real offshore well recordings and shows when Monitus would have raised the alarm. Built on Petrobras' public 3W dataset.",
};

const RootLayout = ({ children }: Readonly<{ children: ReactNode }>) => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;