import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Dungeon Delvers — A Co-op Classroom Adventure", description: "Explore a hidden dungeon together, battle monsters, and grow your party.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
