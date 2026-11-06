import type { PixelLayer } from "./hero-art";

// The travelling merchant, drawn on a 40 x 40 grid. Each piece gets its own outline from PixelGrid.
export const MERCHANT_VIEW_BOX = "0 0 40 40";
const PALETTE = {
  P: "#6d4c80", p: "#46305a", q: "#2c1f3a", S: "#d8a77a", s: "#a9764f", K: "#120d16", E: "#ffe08a", W: "#d8d2c4", w: "#9d978a",
  D: "#7a4a24", d: "#4c2c14", Y: "#d9a13a", y: "#8f6620", G: "#ffe08a", g: "#f0a830", I: "#55555c", i: "#2c2c32", R: "#8e1c14", B: "#3f6d8e",
};
function mirrored(rows: string[]) {
  return rows.map((row) => row + Array.from(row).reverse().join(""));
}
const PIECES: { x: number; y: number; rows: string[] }[] = [
  // Bedroll and the huge pack behind him
  { x: 8, y: 2, rows: [
    "..WWWWWWWWWWWWWWWWWWWW..",
    ".WWwWWWWwWWWWwWWWWwWWWW.",
    ".WWwWWWWwWWWWwWWWWwWWWW.",
    "..wwwwwwwwwwwwwwwwwwww..",
  ] },
  { x: 5, y: 6, rows: [
    "..DDDDDDDDDDDDDDDDDDDDDDDDDD..",
    ".DDDDDDDDDDDDDDDDDDDDDDDDDDDD.",
    "DDYDDDDDDDDDDDDDDDDDDDDDDDDYDD",
    "DDYDDDDDDDDDDDDDDDDDDDDDDDDYDD",
    "DdYdDDDDDDDDDDDDDDDDDDDDDDdYdD",
    "DDYDDDDDDDDDDDDDDDDDDDDDDDDYDD",
    "DDYDDDDDDDDDDDDDDDDDDDDDDDDYDD",
    "ddddddDDDDDDDDDDDDDDDDDDdddddd",
    "DDDDDddDDDDDDDDDDDDDDDddDDDDDD",
    "DDYYDDddDDDDDDDDDDDDDddDDDYYDD",
    "DDYgYDDdDDDDDDDDDDDDDdDDDYgYDD",
    "DDYYDDDdDDDDDDDDDDDDDdDDDDYYDD",
    "DDDDDDDdDDDDDDDDDDDDDdDDDDDDDD",
    "DDDDDDDdddDDDDDDDDdddDDDDDDDDD",
    "dddddddddddddddddddddddddddddd",
  ] },
  // Bottles poking out of the pack
  { x: 4, y: 3, rows: ["..I..", ".BBB.", ".BBB.", ".BBB."] },
  { x: 31, y: 3, rows: ["..I..", ".RRR.", ".RRR.", ".RRR."] },
  // Robe
  { x: 10, y: 17, rows: mirrored([
    ".....PPPPP",
    "...PPPPPPP",
    "..PPPPPPpP",
    "..PPPPPPpP",
    ".PPPPPPPpP",
    ".PPPPPPPpP",
    ".PPPPPPPpY",
    "YYYYYYYYYY",
    "yyyyyyyyyg",
    "PPPPPPPPpP",
    "PPPPPPPPpP",
    "PPPPPPPPpP",
    "PPPPPPPPpP",
    "PPPPPPPPpP",
    "PPPPPPPPpP",
    "PPPPPPPPpP",
    "PPPPPPPPpP",
    "PPPPPPPPpP",
    "pppppppppp",
    "qqqqqqqqqq",
  ]) },
  // Coin pouch on his belt
  { x: 12, y: 25, rows: ["..yy..", ".YYYY.", "YYgYYY", "YgYYYY", "YYYYYY", ".YYYY."] },
  // Left arm resting on the pouch
  { x: 7, y: 18, rows: ["..PPPP", ".PPPPP", ".PPPP.", "PPPP..", "PPPp..", "PPpp..", "PPpp..", ".SSS..", ".SSS.."] },
  // Right arm raising a lantern
  { x: 27, y: 19, rows: ["PPPP....", "PPPPPP..", ".PPPPPP.", "..PPPPSS", "....PPSS"] },
  { x: 31, y: 24, rows: ["..II..", "..II..", ".IIII.", "IGGGGI", "IGEEGI", "IGEEGI", "IGGGGI", ".IIII."] },
  // Hood, shadowed face and beard
  { x: 12, y: 5, rows: mirrored([
    "......PP",
    "....PPPP",
    "...PPPPP",
    "..PPPppp",
    "..PPpKKK",
    ".PPpKKSS",
    ".PPpKSES",
    ".PPpKSSS",
    ".PPpKSSs",
    ".PPPpWWW",
    "..PPpWWW",
    "..PPPWWw",
    "...PPPWW",
    "....PPww",
  ]) },
];
export function merchantLayers(): PixelLayer[] {
  return PIECES.map((piece) => ({ ...piece, palette: PALETTE }));
}
