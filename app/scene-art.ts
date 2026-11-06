import type { PixelLayer } from "./hero-art";

// Objects shown in the first-person dungeon view, drawn on a 40 x 40 grid.
export const SCENE_VIEW_BOX = "0 0 40 40";
export type SceneObject = "chest" | "trap" | "corpse" | "key" | "exit";

const PALETTE = {
  D: "#7a4a24", d: "#4c2c14", Y: "#d9a13a", y: "#8f6620", S: "#7c7a80", s: "#47454c", B: "#d8cfb4", b: "#8f8770",
  K: "#000000", R: "#8e1c14", W: "#f4f1e6", G: "#ffe08a", I: "#55555c", i: "#2c2c32",
};

function mirrored(rows: string[]) {
  return rows.map((row) => row + Array.from(row).reverse().join(""));
}

const PIECES: Record<SceneObject, { x: number; y: number; rows: string[] }[]> = {
  chest: [
    { x: 6, y: 13, rows: mirrored([
      "....DDDDDDDDDD",
      "..DDDDDDDDDDDD",
      ".DDYDDDDDDDDDD",
      ".DDYDDDDdDDDDD",
      "DDDYDDDDdDDDDD",
      "DDDYDDDDDDDDDD",
      "YYYYYYYYYYYYYY",
      "yyyyyyyyyyyyGG",
      "DDDYDDDDDDDDGG",
      "DDDYDDDDDDDDyy",
      "DDDYDDDDdDDDDD",
      "DDDYDDDDdDDDDD",
      "DDDYDDDDDDDDDD",
      "YYYYYYYYYYYYYY",
      "dddddddddddddd",
    ]) },
  ],
  trap: [
    { x: 3, y: 30, rows: mirrored([
      "..sSsSsSsSsSsSsSsS",
      ".sSSSSSSSSSSSSSSSS",
      "isssssssssssssssss",
      ".iiiiiiiiiiiiiiiii",
    ]) },
    { x: 4, y: 14, rows: mirrored([
      "...W.....W.....W",
      "...S.....S.....S",
      "...S.....S.....S",
      "..SS....SS....SS",
      "..Ss....Ss....Ss",
      "..Ss....Ss....Ss",
      "..Ss....Ss....Ss",
      ".SSs...SSs...SSs",
      ".Ris...Ris...Sis",
      ".Ris...Sis...Sis",
      ".Sis...Sis...Rii",
      ".Sis...Sis...Rii",
      "SSis..SSis..SSis",
      "SSis..SSis..SSis",
      "SSis..SSis..SSis",
      "SSis..SSis..SSis",
    ]) },
  ],
  corpse: [
    { x: 6, y: 21, rows: mirrored([
      ".........BBBBB",
      ".......BBBBBBB",
      "......BBKKBBBB",
      "......BKKKBBBB",
      "......BBKKBBKB",
      ".......BBBBBKB",
      "........bBKBKB",
      "B....B...bbbbb",
      "BBBBBBB.......",
      "BBbbbbBBB..BBB",
      "B....BBBBBBBbb",
      ".........BBb..",
    ]) },
  ],
  key: [
    { x: 8, y: 31, rows: mirrored([
      "....SSSSSSSSSSSS",
      "..SSSSSSSSSSSSSS",
      "ssssssssssssssss",
      ".iiiiiiiiiiiiiii",
    ]) },
    { x: 14, y: 5, rows: [
      "...YYYYYY...",
      "..YGGGGGYY..",
      ".YGY....YYy.",
      ".YG......Yy.",
      ".YG......Yy.",
      ".YYY....YYy.",
      "..YYYYYYYy..",
      "...yyYYyy...",
      ".....YY.....",
      ".....GY.....",
      ".....GY.....",
      ".....GY.....",
      ".....GY.....",
      ".....GYYYY..",
      ".....GYyyy..",
      ".....GY.....",
      ".....GYYY...",
      ".....GYyy...",
      ".....GY.....",
      ".....yy.....",
    ] },
  ],
  exit: [
    { x: 4, y: 12, rows: mirrored([
      "....SSSSSSSSSSSS",
      "..SSSSSSSSSSSSSS",
      ".SSsKKKKKKKKKKKK",
      ".SsKKKKKKKKKKKKK",
      "SSsKKKKKKKKKKKKK",
      "SsKKKKKKKKKKKKKK",
      "SsKKKKKKKKKKKKKK",
      "SsKKKKKKKiiiiiii",
      "SsKKKKKKKIIIIIII",
      "SsKKKKKiiiiiiiii",
      "SsKKKKKIIIIIIIII",
      "SsKKKiiiiiiiiiii",
      "SsKKKSSSSSSSSSSS",
      "SsKiiiiiiiiiiiii",
      "SsKSSSSSSSSSSSSS",
      "SsiiiiiiiiiiiiiI",
      "SSSSSSSSSSSSSSSS",
      "ssssssssssssssss",
    ]) },
  ],
};

export function sceneObjectLayers(kind: SceneObject): PixelLayer[] {
  return PIECES[kind].map((piece) => ({ ...piece, palette: PALETTE }));
}
