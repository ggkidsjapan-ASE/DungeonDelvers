import type { Metadata } from "next";
import "@fontsource/pirata-one/latin-400.css";
import "@fontsource/alegreya/latin-500.css";
import "@fontsource/alegreya/latin-700.css";
import "@fontsource/alegreya/latin-800.css";
import "./globals.css";

export const metadata: Metadata = { title: "Dungeon Delvers — A Co-op Classroom Adventure", description: "Explore a hidden dungeon together, battle monsters, and grow your party.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };

// Sizes the game stage before first paint and on every resize. The game is designed at
// 1280x800 (landscape) or 820x1100 (portrait) and scaled to fit the window, keeping the
// window's shape so there are no black bars. Phones keep their own layout at scale 1.
const fitStageScript = `(function () {
  var root = document.documentElement;
  function fit() {
    var w = window.innerWidth, h = window.innerHeight, scale = 1;
    var phone = Math.min(w, h) < 500 && Math.max(w, h) < 1000;
    if (!phone) {
      var landscape = w >= h;
      scale = Math.min(w / (landscape ? 1280 : 820), h / (landscape ? 800 : 1100));
    }
    root.style.setProperty("--stage-scale", String(scale));
    root.style.setProperty("--stage-w", w / scale + "px");
    root.style.setProperty("--stage-h", h / scale + "px");
  }
  fit();
  window.addEventListener("resize", fit);
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: fitStageScript }} /></head>
    <body><div id="app-stage" className="app-stage">{children}</div></body>
  </html>;
}
