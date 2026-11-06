"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import QRCode from "qrcode";
import { ArrowDownToLine, Bomb, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Copy, DoorOpen, Feather, FlaskConical, Footprints, Heart, KeyRound, Map, Music2, Package, PackageOpen, Pencil, RotateCcw, RotateCw, ScrollText, Shield, SkipForward, Skull, Swords, TriangleAlert, Users, VolumeX, X } from "lucide-react";
import { BODY_PART_OPTIONS, CHARACTER_CLASSES, CREATOR_COLORS, defaultBodyParts, defaultPartColors, type BodyParts, type CharacterDesign, type CharacterDesignStats, type CharacterClass as CharacterClassType, type CreatorKind, type DesignInput, type MonsterDesignStats, type PartColors, type SavedDesign } from "./creations";

type CharacterClass = CharacterClassType;
type CharacterState = { level: number; xp: number; hp: number; maxHp: number; damage: number; dexterity: number; speed: number; gold: number; floor: number; x: number; y: number; hasKey: boolean; inventory: string[]; spriteColor: string };
type Hero = { id: string; name: string; characterClass: CharacterClass; icon: string; level: number; xp: number; hp: number; maxHp: number; damage: number; dexterity: number; speed: number; guarding: boolean; spriteColor: string; trimColor?: string; partColors?: PartColors; appearance: BodyParts };
type Group = { id: string; name: string; characterClass: CharacterClass; icon: string; stats: CharacterState; characters: Hero[]; gameOver: boolean };
type Tile = { id: string; name?: string; x: number; y: number; kind: "hidden" | "entrance" | "corridor" | "room" | "treasure" | "key" | "exit" | "trap"; enemy?: string };
type MapTile = Omit<Tile, "kind"> & { kind: Exclude<Tile["kind"], "hidden" | "entrance"> };
type MapTemplate = { id: string; name: string; tiles: MapTile[]; starts: string[] };
type FloorMap = { number: number; name?: string; tiles: Tile[]; revealed: string[]; defeated: string[]; keyFound: boolean };
type Battle = { groupId: string; floor: number; tileId: string; enemy: string; hp: number; maxHp: number; damageMin: number; damageMax: number; speed: number; actedCharacterIds: string[] };
type DiceRoll = { id: string; groupId: string; actor: string; label: string; dice: number[]; modifier: number; total: number; target: number; success: boolean; sides: number; createdAt: number };
type ChestReward = { id: string; kind: "gold" | "item"; amount?: number; item?: string };
type BattleEffect = { id: string; actorId: string; actorName: string; characterClass: CharacterClass; kind: "sword-slash" | "arrow-volley" | "dagger-strike" | "magic-blast" | "bomb-blast"; hit: boolean; damage: number };
type MonsterAttack = { id: string; targetId: string; targetName: string; damage: number; rolledDamage: number };
type BattleEnd = { id: string; result: "victory" | "defeat" | "escaped"; enemy: string; gold?: number };
type MapMarkerKind = "path" | "start" | "monster" | "corpse" | "chest" | "trap" | "key" | "exit";
type BestiaryEntry = { name: string; icon: string; description: string; bounty: number; damageMin: number; damageMax: number; speed: number; boss?: boolean; color?: string; trimColor?: string; colors?: PartColors; appearance?: BodyParts; custom?: boolean };
type GameState = { code: string; phase: "lobby" | "exploration" | "complete"; floors: FloorMap[]; battles: Record<string, Battle>; feed: string[]; rolls: DiceRoll[]; bestiary: BestiaryEntry[]; groups: Group[] };
type Tab = "map" | "bestiary" | "items" | "bounties";
type GameApiResponse = { error?: string; code?: string; teacherToken?: string; playerId?: string; state?: GameState; trapRolls?: DiceRoll[]; chestReward?: ChestReward; battleEffect?: BattleEffect; monsterAttack?: MonsterAttack; battleEnd?: BattleEnd };
const CLASSES: { name: CharacterClass; icon: string; description: string; hp: number }[] = [
  { name: "Warrior", icon: "🛡️", description: "Front-line defender. Guard to reduce a hit.", hp: 25 },
  { name: "Thief", icon: "🗡️", description: "Fast and clever. Mug monsters for gold.", hp: 15 },
  { name: "Archer", icon: "🏹", description: "Sure-shot ranger. Fire two arrows at once.", hp: 15 },
  { name: "Mage", icon: "🔮", description: "Arcane healer. Recover HP while dealing damage.", hp: 20 },
];
const SPRITE_COLORS = CREATOR_COLORS;
const MAP_SIZE = 13;
const MONSTER_TURN_ID = "__monster__";
const MAX_GROUPS = 4;
const ITEM_LABELS: Record<string, string> = { potion: "Healing Potion", "phoenix-feather": "Phoenix Feather", bomb: "Bomb" };

function battleTurnOrder(group: Group, battle: Battle) {
  return [
    ...group.characters.filter((hero) => hero.hp > 0).map((hero) => ({ id: hero.id, speed: hero.speed })),
    { id: MONSTER_TURN_ID, speed: battle.speed },
  ].sort((first, second) => second.speed - first.speed).map((actor) => actor.id);
}

function nextBattleActor(group: Group, battle: Battle) {
  return battleTurnOrder(group, battle).find((actorId) => !battle.actedCharacterIds.includes(actorId));
}

async function api(body: Record<string, string>): Promise<GameApiResponse> {
  const response = await fetch("/api/game", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const data = await response.json() as GameApiResponse;
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}
function getLocationSearch() { return window.location.search; }
function useStoredValue(key: string | null, tabScoped = false) {
  const subscribe = useCallback((callback: () => void) => {
    if (!key) return () => {};
    window.addEventListener("storage", callback);
    window.addEventListener("dungeon-storage", callback);
    return () => {
      window.removeEventListener("storage", callback);
      window.removeEventListener("dungeon-storage", callback);
    };
  }, [key]);
  const getSnapshot = useCallback(() => key
    ? (tabScoped ? window.sessionStorage : window.localStorage).getItem(key) || ""
    : "", [key, tabScoped]);
  useEffect(() => {
    if (!key || !tabScoped || window.sessionStorage.getItem(key)) return;
    const legacy = window.localStorage.getItem(key);
    if (legacy) {
      window.sessionStorage.setItem(key, legacy);
      window.localStorage.removeItem(key);
      window.dispatchEvent(new Event("dungeon-storage"));
    }
  }, [key, tabScoped]);
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}
function saveStoredValue(key: string, value: string, tabScoped = false) {
  (tabScoped ? window.sessionStorage : window.localStorage).setItem(key, value);
  window.dispatchEvent(new Event("dungeon-storage"));
}

function Brand() {
  return <div className="brand"><span className="brand-mark">✦</span><span>Dungeon Delvers</span></div>;
}

const MUSIC_TRACKS = [
  { name: "Dungeon", src: "/music/Dungeon.mp3" },
  { name: "Rune", src: "/music/Rune.mp3" },
];

function MusicToggle() {
  const [enabled, setEnabled] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [musicError, setMusicError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  function stopMusic() {
    audioRef.current?.pause();
    audioRef.current = null;
  }

  async function startMusic(index: number) {
    stopMusic();
    const audio = new Audio(MUSIC_TRACKS[index].src);
    audio.loop = true;
    audio.volume = 0.45;
    audioRef.current = audio;
    try {
      await audio.play();
      setMusicError("");
    } catch (error) {
      audio.pause();
      if (audioRef.current === audio) audioRef.current = null;
      throw error;
    }
  }

  async function toggleMusic() {
    if (audioRef.current) {
      stopMusic();
      setEnabled(false);
      return;
    }
    try {
      await startMusic(trackIndex);
      setEnabled(true);
    } catch {
      setEnabled(false);
      setMusicError(`Could not play ${MUSIC_TRACKS[trackIndex].name}. Check the audio file and try again.`);
    }
  }

  async function nextTrack() {
    const next = (trackIndex + 1) % MUSIC_TRACKS.length;
    setTrackIndex(next);
    if (!audioRef.current) return;
    try {
      await startMusic(next);
      setEnabled(true);
    } catch {
      setEnabled(false);
      setMusicError(`Could not play ${MUSIC_TRACKS[next].name}. Check the audio file and try again.`);
    }
  }

  return <div className="music-controls">
    {musicError && <span className="music-error" role="alert">{musicError}</span>}
    <button className="music-toggle" type="button" onClick={() => void toggleMusic()} aria-label={enabled ? `Turn off background music (${MUSIC_TRACKS[trackIndex].name})` : `Turn background music on (${MUSIC_TRACKS[trackIndex].name})`} aria-pressed={enabled} title={enabled ? `Turn off: ${MUSIC_TRACKS[trackIndex].name}` : `Play: ${MUSIC_TRACKS[trackIndex].name}`}>
      {enabled ? <Music2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
    </button>
    <button className="music-next" type="button" onClick={() => void nextTrack()} aria-label={`Select next track: ${MUSIC_TRACKS[(trackIndex + 1) % MUSIC_TRACKS.length].name}`} title={`Track: ${MUSIC_TRACKS[trackIndex].name} — select next track`}>
      <SkipForward aria-hidden="true" />
    </button>
  </div>;
}

function PixelSprite({ characterClass, color, trimColor = "#d7d1c7", colors, className = "", appearance }: { characterClass: CharacterClass; color: string; trimColor?: string; colors?: PartColors; className?: string; appearance?: BodyParts }) {
  const parts = appearance || defaultBodyParts("character", characterClass);
  const palette = {
    C: colors?.torso || color,
    A: colors?.arms || color,
    L: colors?.legs || color,
    H: colors?.head || color,
    S: "#efbf8c",
    E: "#28212b",
    M: "#bdc8c8",
    T: trimColor,
    B: "#765137",
  };
  // Class silhouettes stay recognizable even when the player swaps equipment:
  // equipment changes details while every class keeps the same lean human frame.
  const torso: Record<string, string[]> = {
    tunic: ["...CCCC...", "..CCCCCC..", ".CCCCCCCC.", ".CC.CC.CC.", "..CCCCCC..", "..CC..CC.."],
    plate: ["..MMMMMM..", ".MMMMMMMM.", ".MMTTTTMM.", ".MMMMMMMM.", "..MMMMMM..", "..MM..MM.."],
    chainmail: ["...CCCC...", "..CCCCCC..", ".CTCTCTCC.", ".TCTCTCTC.", ".CTCTCTCC.", "..CCCCCC.."],
    "full-plate": ["..MMMMMM..", ".MMMMMMMM.", ".MMTTTTMM.", ".MMMMMMMM.", "..MMMMMM..", "..MM..MM.."],
    vest: ["...CCCC...", "..CCCCCC..", ".CC..CCCC.", ".CC..CCCC.", "..C..CCC..", "..CCCCCC.."],
    cloak: ["...CCCC...", "..CCCCCC..", ".CCCCCCCC.", "..CCCCCC..", "..CCCCCC..", "..CCCCCC..", "...CCCC..."],
    leather: ["...BBBB...", "..BBBBBB..", ".BBTTTTBB.", ".BBTTTTBB.", "..BBBBBB..", "..BB..BB.."],
    "forest-cloak": ["...CCCC...", "..CCCCCC..", ".CCCCCCCC.", "..CCCCCC..", "..CCCCCC..", "..CCCCCC..", "...CCCC..."],
    robe: ["...CCCC...", "..CCCCCC..", ".CCCCCCCC.", "..CCCCCC..", "..CCCCCC..", "..CCCCCC..", ".CCCCCCCC."],
  };
  const arms: Record<string, string[]> = {
    // The sprite is only 18px wide and the torso covers the inner arm pixels.
    // Keep each exposed arm at least 2px wide so it reads as an arm, not a line.
    sleeves: ["..AA..........AA..", "..AAA........AAA..", "..AAA........AAA..", "...AA........AA...", "...SS........SS..."],
    gauntlets: ["..MM..........MM..", "..MMM........MMM..", "..MMM........MMM..", "...MM........MM...", "...SS........SS..."],
    "plate-gauntlets": ["..MM..........MM..", "..MMM........MMM..", "..MMM........MMM..", "..MMM........MMM..", "...MM........MM...", "...SS........SS..."],
    gloves: ["..AA..........AA..", "..AAA........AAA..", "..AAA........AAA..", "...MM........MM...", "...SS........SS..."],
    bracers: ["..AA..........AA..", "..AAA........AAA..", "..TT..........TT..", "...AA........AA...", "...SS........SS..."],
    "archer-bracers": ["..AA..........AA..", "..AAA........AAA..", "..TT..........TT..", "..TT..........TT..", "...AA........AA...", "...SS........SS..."],
    "wide-sleeves": [".AAA..........AAA.", ".AAAA........AAAA.", "..AAA........AAA..", "..AAA........AAA..", "...SS........SS..."],
  };
  const legs: Record<string, string[]> = {
    trousers: ["..LL..LL..", "..LL..LL..", "..LL..LL..", ".LL....LL."],
    greaves: ["..MM..MM..", "..MM..MM..", "..MT..TM..", ".MM....MM."],
    "plate-greaves": ["..MM..MM..", ".MMT..TMM.", ".MMT..TMM.", "MMM....MMM"],
    boots: ["..LL..LL..", "..LL..LL..", "..LL..LL..", ".LLL..LLL."],
    "leather-boots": ["..LL..LL..", ".LTT..TTL.", "..LL..LL..", ".LLL..LLL."],
    "forest-boots": ["..LL..LL..", ".LTT..TTL.", "..LL..LL..", "..LL..LL.."],
    "robe-hem": ["...CCCC...", "..CCCCCC..", "..CCCCCC..", ".CCCCCCCC."],
  };
  const headwear: Record<string, string[]> = {
    hair: ["..HHHH..", ".HHHHHH.", ".HH..HH.."],
    helmet: ["..MMMM..", ".MMMMMM.", "MMMMMMMM", "MM....MM"],
    "great-helm": [".MMMMMM.", "MMMMMMMM", "MMTTTTMM", "MMMMMMMM"],
    hood: ["..HHHH..", ".HHHHHH.", "HH....HH", "HH....HH"],
    mask: ["..HHHH..", ".HHHHHH.", ".HHHHHH.", "..HHHH.."],
    headband: ["..HHHH..", ".HHHHHH.", ".HTTTTH."],
    "robin-hood-hat": ["......T...", ".....HHH..", "....HHHHH.", "...HHHHHHH", ".HHHHHHHHH", "HHHHHHHHHH"],
    "wizard-hat": ["....H...", "...HHH..", "..HHHHH.", ".HHHHHHH", "HHHHHHHH"],
    circlet: ["..TTTT..", ".HHTTHH.", "..HHHH.."],
  };
  const face = ["..SSSS..", ".SSSSSS.", ".SE..ES.", ".SSSSSS.", "..SSSS.."];
  const archerTorso: Record<string, string[]> = {
    tunic: ["...CCCC...", "...CCCC...", "..CCCCCC..", "..CC..CC..", "...C..C..."],
    vest: ["...CCCC...", "..CC..CC..", "..CC..CC..", "...C..C...", "...CCCC..."],
    "forest-cloak": ["...CCCC...", "..CCCCCC..", "..CCCCCC..", ".CCCCCCCC.", "..CCCCCC.."],
    leather: ["...BBBB...", "..BBBBBB..", "..BBTTBB..", "..BBBBBB..", "...B..B..."],
  };
  const classArmDefaults: Record<CharacterClass, string> = { Warrior: "gauntlets", Thief: "gloves", Archer: "archer-bracers", Mage: "wide-sleeves" };
  const armRows = arms[parts.arms] || arms[classArmDefaults[characterClass]];
  const torsoRows = characterClass === "Archer"
    ? archerTorso[parts.torso] || ["...CCCC...", "..CCCCCC..", "..CC..CC..", "...C..C..."]
    : torso[parts.torso] || torso.tunic;
  const layers: PixelLayer[] = [
    { rows: legs[parts.legs] || legs.trousers, palette: { ...palette, C: colors?.legs || color }, x: 4, y: 18 },
    { rows: armRows, palette, x: 0, y: 12 },
    { rows: torsoRows, palette, x: characterClass === "Archer" ? 4 : 4, y: 12 },
    { rows: face, palette, x: 5, y: 6 },
    { rows: headwear[parts.head] || headwear.hair, palette, x: parts.head === "robin-hood-hat" ? 4 : 5, y: parts.head === "robin-hood-hat" ? 1 : 3 },
    ...(characterClass === "Mage" ? [{ rows: [".TT.", "TMMT", ".TT."], palette, x: 2, y: 7 }] : []),
  ];
  return <PixelGrid layers={layers} className={"pixel-sprite " + className} label={characterClass + " pixel art hero"} viewBox="0 0 18 24" />;
}

function PixelGrid({ layers, className, label, viewBox }: { layers: { rows: string[]; palette: Record<string, string>; x?: number; y?: number }[]; className: string; label: string; viewBox: string }) {
  return <svg className={className} viewBox={viewBox} role="img" aria-label={label} shapeRendering="crispEdges" style={{ imageRendering: "pixelated" }}>
    {layers.flatMap((layer, index) => {
      const cells = new Set(layer.rows.flatMap((row, y) => Array.from(row).flatMap((pixel, x) => pixel === "." ? [] : [x + "," + y])));
      const border = new Set<string>();
      for (const cell of cells) {
        const [x, y] = cell.split(",").map(Number);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!cells.has((x + dx) + "," + (y + dy))) border.add((x + dx) + "," + (y + dy));
      }
      const outline = Array.from(border, (cell) => {
        const [x, y] = cell.split(",").map(Number);
        return <rect key={index + "-o-" + cell} x={x + (layer.x || 0)} y={y + (layer.y || 0)} width="1" height="1" fill="#1d1a23" />;
      });
      const pixels = layer.rows.flatMap((row, y) => Array.from(row).map((pixel, x) => pixel === "." ? null : <rect key={index + "-" + y + "-" + x} x={x + (layer.x || 0)} y={y + (layer.y || 0)} width="1" height="1" fill={layer.palette[pixel] || "#ff00ff"} />));
      return [...outline, ...pixels];
    })}
  </svg>;
}

function LegacyPixelSprite({ characterClass, color, trimColor = "#d7d1c7", colors, className = "", appearance }: { characterClass: CharacterClass; color: string; trimColor?: string; colors?: PartColors; className?: string; appearance?: BodyParts }) {
  const head = appearance?.head || "hair";
  const torso = appearance?.torso || "tunic";
  const arms = appearance?.arms || "sleeves";
  const legs = appearance?.legs || "trousers";
  const headColor = colors?.head || color;
  const torsoColor = colors?.torso || color;
  const armColor = colors?.arms || color;
  const legColor = colors?.legs || color;
  const skin = "#f1c99c";
  const metal = "#aab5bc";
  const leather = "#795536";
  const torsoShape: Record<string, string> = {
    tunic: "M10 13H22L27 18L24 29H8L5 18Z",
    plate: "M9 13H23L27 18L24 27H8L5 18Z",
    chainmail: "M10 13H22L26 17L24 28H8L6 17Z",
    "full-plate": "M9 13H23L27 16L29 21L25 29H7L3 21L5 16Z",
    vest: "M10 13H22L25 18L23 28H9L7 18Z",
    cloak: "M10 13H22L25 17L30 31L24 29L16 33L8 29L2 31L7 17Z",
    leather: "M10 13H22L25 18L23 28H9L7 18Z",
    "forest-cloak": "M10 13H22L25 17L29 32H23L16 29L9 32H3L7 17Z",
    robe: "M10 13H22L25 17L29 36H3L7 17Z",
  };
  const armShape: Record<string, string> = {
    sleeves: "M9 15L5 16L3 25L7 27L11 20M23 15L27 16L29 25L25 27L21 20Z",
    gauntlets: "M9 14L5 15L2 25L7 28L12 20M23 14L27 15L30 25L25 28L20 20Z",
    "plate-gauntlets": "M9 13L5 14L2 24L5 29L10 28L13 21M23 13L27 14L30 24L27 29L22 28L19 21Z",
    gloves: "M9 15L5 17L4 24L8 27L12 20M23 15L27 17L28 24L24 27L20 20Z",
    bracers: "M9 14L5 15L2 26L8 27L12 20M23 14L27 15L30 26L24 27L20 20Z",
    "archer-bracers": "M9 14L5 15L2 26L8 27L12 20M23 14L27 15L30 26L24 27L20 20Z",
    "wide-sleeves": "M10 13L4 14L1 24L7 28L13 21M22 13L28 14L31 24L25 28L19 21Z",
  };
  const legShape: Record<string, string> = {
    trousers: "M9 27H16V36L15 38H8L9 35ZM16 27H23L24 35L25 38H18L17 36Z",
    greaves: "M9 27H16V37L15 39H8L9 35ZM16 27H23L24 35L25 39H18L17 37Z",
    "plate-greaves": "M8 26H16L16 36L14 39H7L8 35ZM16 26H24L24 35L26 39H19L17 36Z",
    boots: "M9 27H16V34L15 36H9ZM16 27H23L23 34L24 36H17ZM9 34H15V37H17V40H5L7 37H9ZM17 34H23V37H25L27 40H16V37H18Z",
    "leather-boots": "M9 27H16V33L15 35H9ZM16 27H23L23 33L24 35H17ZM9 33H15V37H17V40H5L7 37H9ZM17 33H23V37H25L27 40H16V37H18Z",
    "forest-boots": "M9 27H16V33L15 35H9ZM16 27H23L23 33L24 35H17ZM9 33H15V37H17V40H5L7 37H9ZM17 33H23V37H25L27 40H16V37H18Z",
    "robe-hem": "M9 26H23L27 39H5Z",
  };
  return <svg className={`pixel-sprite ${className}`} viewBox="0 0 32 42" role="img" aria-label={`${characterClass} sprite`} shapeRendering="crispEdges">
    <path d={legShape[legs] || legShape.trousers} fill={legColor} stroke="#17191d" strokeWidth="1" />
    {legs === "greaves" && <><path d="M9 32H15M18 32H24M9 35H15M19 35H24" stroke={metal} strokeWidth="1.2" /><path d="M9 37H15M18 37H24" stroke={trimColor} strokeWidth=".8" /></>}
    {legs === "plate-greaves" && <><path d="M9 28H15L15 35H9ZM18 28H23L23 35H18Z" fill={metal} stroke="#17191d" strokeWidth=".8" /><path d="M10 31H14M19 31H22M9 36H14M19 36H24" stroke={trimColor} strokeWidth="1" /></>}
    {(legs === "boots" || legs === "leather-boots" || legs === "forest-boots") && <><path d="M6 38H16M17 38H27" stroke={trimColor} strokeWidth="1.1" />{legs === "leather-boots" && <path d="M9 33H15M18 33H23" stroke={trimColor} strokeWidth="1" />}{legs === "forest-boots" && <path d="M9 34L15 35M18 35L23 34" stroke="#4c6f43" strokeWidth="1.2" />}</>}
    {legs === "robe-hem" && <path d="M7 36H25" stroke={trimColor} strokeWidth="1" />}
    {torso === "plate" ? <><path d={torsoShape[torso]} fill={torsoColor} stroke="#17191d" strokeWidth="1.4" /><path d="M9 16L12 18L16 16L20 18L23 16M12 18V26M20 18V26" fill="none" stroke={metal} strokeWidth="1.2" /><path d="M16 17V26" stroke={trimColor} strokeWidth="1.2" /></>
      : torso === "full-plate" ? <><path d={torsoShape[torso]} fill={torsoColor} stroke="#17191d" strokeWidth="1.5" /><path d="M6 17L12 14L16 17L20 14L26 17L24 21H21L20 18H12L11 21H8Z" fill={metal} stroke="#17191d" strokeWidth="1" /><path d="M12 19L10 27M20 19L22 27M16 17V28M11 23H13M19 23H21" fill="none" stroke={trimColor} strokeWidth="1" /><path d="M13 21H19L18 25H14Z" fill={metal} stroke="#17191d" strokeWidth=".8" /></>
      : torso === "chainmail" ? <><path d={torsoShape[torso]} fill={torsoColor} stroke="#17191d" strokeWidth="1.4" /><path d="M9 17H23M8 20H24M8 23H24M9 26H23" stroke={trimColor} strokeWidth=".85" /></>
        : <path d={torsoShape[torso] || torsoShape.tunic} fill={torsoColor} stroke="#17191d" strokeWidth="1.4" />}
    {torso === "vest" && <><path d="M10 14L14 14L15 27H10ZM18 14L22 14L22 27H17Z" fill={color} stroke="#17191d" strokeWidth=".8" /><path d="M16 15V27" stroke={trimColor} strokeWidth="1.2" /></>}
    {torso === "leather" && <><path d="M11 15L21 15L23 26H9Z" fill={leather} stroke="#17191d" strokeWidth="1" /><path d="M11 17L21 25M21 17L11 25" stroke={trimColor} strokeWidth="1" /></>}
    {torso === "robe" && <><path d="M10 15H22M8 33H24" stroke={trimColor} strokeWidth="1.4" /><path d="M16 17V27" stroke={trimColor} strokeWidth=".9" /></>}
    {(torso === "cloak" || torso === "forest-cloak") && <><path d="M10 15L16 19L22 15M16 19V28" fill="none" stroke={trimColor} strokeWidth="1.4" /><path d="M5 30L10 28M27 30L22 28" stroke="#17191d" strokeWidth="1" /></>}
    <path d={armShape[arms] || armShape.sleeves} fill={armColor} stroke="#17191d" strokeWidth="1.5" />
    {arms === "gauntlets" && <><path d="M2 24L7 26V30L3 30Z M30 24L25 26V30L29 30Z" fill={trimColor} stroke="#17191d" strokeWidth="1" /></>}
    {arms === "plate-gauntlets" && <><path d="M4 16L8 15L11 20L8 25L4 24ZM28 16L24 15L21 20L24 25L28 24Z" fill={metal} stroke="#17191d" strokeWidth="1" /><path d="M3 25L7 26L6 30L2 29ZM29 25L25 26L26 30L30 29Z" fill={armColor} stroke="#17191d" strokeWidth="1" /><path d="M5 18L8 20M27 18L24 20M3 27H6M29 27H26" stroke={trimColor} strokeWidth="1" /></>}
    {(arms === "bracers" || arms === "archer-bracers") && <><path d="M3 22L8 23L7 27L2 26ZM29 22L24 23L25 27L30 26Z" fill={trimColor} stroke="#17191d" strokeWidth=".8" />{arms === "archer-bracers" && <path d="M3 18L8 23M29 18L24 23" stroke="#4c6f43" strokeWidth="1.3" />}</>}
    {arms === "gloves" && <><path d="M4 24L8 25V29H3ZM28 24L24 25V29H29Z" fill={armColor} stroke="#17191d" strokeWidth="1" /></>}
    {arms === "wide-sleeves" && <><path d="M2 23L8 25M30 23L24 25" stroke={trimColor} strokeWidth="2" /><path d="M3 28L1 32M6 29L5 33M29 28L31 32M26 29L27 33" stroke={armColor} strokeWidth="1.5" /></>}
    <rect x="11" y="4" width="10" height="10" rx={head === "slime" ? 4 : 1} fill={skin} stroke="#17191d" strokeWidth="1.2" />
    <path d="M12 4H20L22 7H19V6H14V8H11Z" fill={head === "hair" ? headColor : "#322b38"} />
    <rect x="13" y="8" width="1.3" height="1.3" fill="#302838" /><rect x="18" y="8" width="1.3" height="1.3" fill="#302838" />
    {head === "helmet" && <><path d="M9 8V4L12 2H20L23 4V9H19V7H13V9Z" fill={headColor} stroke="#17191d" strokeWidth="1.3" /><path d="M10 8H22M15 4H17" stroke={trimColor} strokeWidth="1.4" /><path d="M15 2H17V5H15Z" fill={color} /></>}
    {head === "great-helm" && <><path d="M9 10V5L12 2H20L23 5V10L21 13H11Z" fill={headColor} stroke="#17191d" strokeWidth="1.3" /><path d="M10 8H22M12 10H20M15 3H17V6H15Z" stroke={trimColor} strokeWidth="1.2" /><path d="M12 8H14M18 8H20" stroke="#17191d" strokeWidth="1.5" /></>}
    {head === "hood" && <path d="M9 9V5L12 2H20L23 5V12H20V7H12V12H9Z" fill={headColor} stroke={trimColor} strokeWidth="1.1" />}
    {head === "wizard-hat" && <><path d="M9 5L15 0L17 1L18 4L23 5L25 8H7Z" fill={headColor} stroke="#17191d" strokeWidth="1" /><path d="M8 6H24" stroke={trimColor} strokeWidth="1.5" /></>}
    {head === "headband" && <><path d="M10 6H22" stroke={headColor} strokeWidth="2" /><path d="M10 6L7 9M22 6L25 9" stroke={trimColor} strokeWidth="1.2" /></>}
    {head === "robin-hood-hat" && <><path d="M8 7L10 4L15 3L19 4L22 7L21 9H8Z" fill={headColor} stroke="#17191d" strokeWidth="1" /><path d="M8 8H23" stroke={trimColor} strokeWidth="1.5" /><path d="M16 4Q22 2 25 0Q25 4 20 8L18 7Z" fill={trimColor} stroke="#17191d" strokeWidth=".8" /><path d="M17 5L23 2" stroke={headColor} strokeWidth="1" /></>}
    {head === "circlet" && <><path d="M10 5H22" stroke={trimColor} strokeWidth="1.5" /><path d="M14 4L16 1L18 4Z" fill={headColor} stroke="#17191d" strokeWidth=".7" /></>}
    {head === "mask" && <><path d="M11 8H21V12L16 14L11 12Z" fill={headColor} stroke="#17191d" strokeWidth=".8" /><path d="M12 9H14M18 9H20" stroke={trimColor} strokeWidth="1" /></>}
  </svg>;
}

function MonsterSprite({ monster, className = "" }: { monster: { name: string; color?: string; trimColor?: string; colors?: PartColors; appearance?: BodyParts; parts?: BodyParts }; className?: string }) {
  const parts = monster.appearance || monster.parts || defaultBodyParts("monster");
  const main = monster.color || "#a56d42";
  const colorFor = (part: keyof PartColors, fallback = main) => monster.colors?.[part] || fallback;
  const pal = (base: string) => ({ G: base, H: colorFor("head"), M: base, P: base, T: monster.trimColor || "#d3b35d", S: monster.trimColor || "#d3b35d", W: "#ffe786", K: "#211a25" });
  const heads: Record<string, string[]> = {
    beast:["....H......H...","...HHH....HHH..","..HHHHHHHHHHHH.",".HHHWW.HH.WWHHH",".HHHKK.HH.KKHHH","..HHHHHHHHHHHH.","...HHHSSHHHHH..","....HHSSSSHH..."],
    horned:["..T.........T..","..TT.......TT..","...HHHHHHHHH...","..HHHWW..WWHHH.","..HHHKK..KKHHH.","...HHHHHHHHH...","....HHHHHH.....",".....HHHH......"],
    skull:[".....TTTT......","...TTTTTTTT....","..TTTTTTTTTT...","..TTWWTTWWTT...","..TTKKTTKKTT...","...TTTTTTTT....","...TTSTTSST....","...TT.TT.TT...."],
    slime:["......HH.......","....HHHHHH.....","..HHHHHHHHHH...",".HHHWWWHHHHH..",".HHHKKKHHHHHHH.","..HHHHHHHHHHH...","....HHHHHHH....."],
    dragon:["..T..HHHH..T...","..TT.HHHHHH.TT..","..HHHHHHHHHHH..",".HHHWW..WWHHHHH.",".HHHKK..KKHHHHH.","..HHHHHHHHHHHHH.","...HHHHHHHHHSS.","....HHHHHHHSSS.."],
    eyestalks:["...TT......TT...","...TWK....KWT...","....T......T....",".....HHHHHH.....","...HHWW..WWHH...","...HHKK..KKHH...","....HHHHHHHH....",".....HHHHHH....."],
  };
  const bodies: Record<string,string[]> = {
    scaled:["...GG......GG...","...GGGGGGGGGG...","...GGTGGGTGGG...","...GGGGGGGGGG...","....GGGGGGGG....","....GTGGTGGG....",".....GGGGGG....."],
    furred:["..HHH......HHH..",".HHHHHHHHHHHHHH.",".HHHGHHHHHHHGHH.","..HHHHHHHHHHHH..","...HHHHHHHHHH...","...HHGHHHHGHH...","....HHHHHHHH...."],
    stone:["..MMMM......MMMM",".MMMMMMMMMMMMMMM",".MMMTMMMMMMMTMMM",".MMMMMMMMMMMMMMM","..MMMMMMMMMMMM..","..MMMTMMMMMMTMM.","...MMMMMMMMMM..."],
    "slime-body":["....GGGGGGGG....","..GGGGGGGGGGGG..",".GGGGGTGGGTGGGG.",".GGGGGGGGGGGGGG.","..GGGGGTGGGGGG..","...GGGGGGGGGG..."],
    armored:["..MMMM......MMMM",".MMMMMMMMMMMMMMM",".MMMTMMMMMMMTMMM","..MMMMMMMMMMMM..","..MMMMMMMMMMMM..","...MMMTMMTMMM...","....MMMMMMMM...."],
    spectral:["...PPPP....PPPP.","..PPPPPPPPPPPP..",".PPPPWPPPPPWPPP.",".PPPPPPPPPPPPPP.","..PPPPPPPPPPPP..","...PPPPWPPPPPP..","....PPPPPPPP...."],
  };
  const armArt: Record<string,string[]> = {
    claws:[".GG............GG","..GG..........GG.","...GG........GG..","....GG......GG...",".....TT......TT.."],
    talons:[".GG............GG","..GG..........GG.","...GG........GG..","....GG......GG...","....TTT......TTT."],
    paws:["..GG..........GG.","..GG..........GG.","...GG........GG..","...GG........GG..","...TTT......TTT.."],
    "stone-arms":["MMMM............MMMM",".MMMM..........MMMM.","..MMMM........MMMM..","...MMMM......MMMM...","....MMMM....MMMM...."],
    tentacles:["...GG........GG...","..GGG........GGG..",".GGG..........GGG.","..GGG........GGG..","...TT........TT..."],
  };
  const legArt: Record<string,string[]> = {
    talons:["...GG......GG...","...GG......GG...","...GG......GG...","..TTT......TTT.."],
    hooves:["...GG......GG...","...GG......GG...","..GGGG....GGGG..",".TTTT......TTTT."],
    paws:["...GG......GG...","..GGGG....GGGG..","..GGGG....GGGG..",".TTTT......TTTT."],
    "stone-legs":["..MMMM....MMMM..","..MMMM....MMMM..","..MMMM....MMMM..",".MMMMM....MMMMM."],
    coiled:["................","...GGGGGGGG.....",".GGGG....GGGG....","..GGGGGGGGGGGG..."],
  };
  const wings: Record<string,string[][]> = {
    bat:[["GG.......","GGGG.....",".GGGG....","..GGGG...","..GGGGGGG"],[".......GG",".....GGGG","....GGGG.","...GGGG..","GGGGGGG.."]],
    feathered:[["W.WW.....","WWWWW....",".WWWWW...","..WWWWW..","..WWWWWWW"],[".....WW.W","....WWWWW","...WWWWW.","..WWWWW..","WWWWWWW.."]],
    dragon:[["T........","TT.......","TTT......","TTTT.....","..TTTTTTT"],["........T",".......TT","......TTT",".....TTTT","TTTTTTT.."]],
  };
  // Tails occupy a large part of the sprite and begin under the hindquarters,
  // so each one has a thick, continuous root plus a distinct readable tip.
  const tailArt: Record<string, string[]> = {
    spiked: [
      "..GGGGGGGG..", ".GGGGGGGGGG.", "...GGGGGGGGG", ".....GGGGGGG",
      ".......GGGGG", ".........GGG", "...........TT", "..........TTT",
    ],
    serpent: [
      "..GGGGGGGG..", "...GGGGGGGGG", "......GGGGGG", ".........GGG",
      ".......GGGGG", "....GGGGGGG.", "..GGGGGGG...", ".GGGGGG......",
    ],
    flame: [
      "..GGGGGGGG..", ".GGGGGGGGGG.", "...GGGGGGGGG", ".....GGGGGGG",
      ".......GGGGTT", ".........GGTT", "...........TTT", "..........TT..",
    ],
    clubbed: [
      "..GGGGGGGG..", "...GGGGGGGGG", ".....GGGGGGG", ".......GGGGG",
      "......GGGGGG", ".....GGGGGGG", "......GGGGGG", ".......GGGGG",
    ],
  };
  const tail = parts.tail && parts.tail !== "none" ? tailArt[parts.tail] || tailArt.spiked : [];
  const wing = parts.wings && parts.wings !== "none" ? wings[parts.wings] || wings.bat : [];
  const layers = [
    ...(wing.length ? [{rows:wing[0],palette:pal(colorFor("wings")),x:1,y:3},{rows:wing[1],palette:pal(colorFor("wings")),x:20,y:3}] : []),
    ...(tail.length ? [{rows:tail,palette:pal(colorFor("tail")),x:18,y:10}] : []),
    {rows:legArt[parts.legs] || legArt.talons,palette:pal(colorFor("legs")),x:6,y:13},
    {rows:bodies[parts.torso] || bodies.scaled,palette:pal(colorFor("torso")),x:6,y:7},
    {rows:armArt[parts.arms] || armArt.claws,palette:pal(colorFor("arms")),x:4,y:9},
    {rows:heads[parts.head] || heads.beast,palette:pal(colorFor("head")),x:6,y:0},
  ];
  return <PixelGrid layers={layers} className={"monster-design-sprite " + className} label={(monster.name || "Dungeon monster") + " pixel art monster"} viewBox="0 0 30 19" />;
}

function LegacyMonsterSprite({ monster, className = "" }: { monster: { name: string; color?: string; trimColor?: string; colors?: PartColors; appearance?: BodyParts; parts?: BodyParts }; className?: string }) {
  const parts = monster.appearance || monster.parts;
  const color = monster.color || "#7b493c";
  const trim = monster.trimColor || "#d7d1c7";
  const headColor = monster.colors?.head || color;
  const torsoColor = monster.colors?.torso || color;
  const armColor = monster.colors?.arms || color;
  const legColor = monster.colors?.legs || color;
  const tailColor = monster.colors?.tail || color;
  const wingColor = monster.colors?.wings || color;
  const torsoShape: Record<string, string> = {
    scaled: "M23 18L41 18L48 25L43 43L37 49H27L21 44L16 25Z",
    furred: "M25 20L21 15L28 18L32 13L36 18L43 17L41 23L49 26L44 32L47 39L39 42L36 48H27L22 43L15 41L19 34L14 28L22 25Z",
    stone: "M20 17H42L49 23V40L42 49H21L14 41V24Z",
    "slime-body": "M23 21Q23 16 32 15Q42 16 42 22L49 36Q47 47 40 49H23Q15 46 15 37Z",
    armored: "M19 20L26 15H38L46 20L49 40L42 48H20L14 40Z",
    spectral: "M23 19H41L47 31L43 40L38 37L32 49L26 40L20 45L15 33Z",
  };
  const armShape: Record<string, string> = {
    claws: "M22 25L14 24L8 31L12 39L20 35M42 25L50 24L56 31L52 39L44 35Z",
    talons: "M22 25L14 24L9 34L16 38L14 45L22 39M42 25L50 24L55 34L48 38L50 45L42 39Z",
    paws: "M22 26L15 25L11 33L15 38L23 36M42 26L49 25L53 33L49 38L41 36Z",
    "stone-arms": "M23 24L13 22L7 28L9 39L17 42L24 35M41 24L51 22L57 28L55 39L47 42L40 35Z",
  };
  return <svg className={`monster-design-sprite ${className}`} viewBox="0 0 64 64" role="img" aria-label={`${monster.name} creature`} shapeRendering="crispEdges">
    {parts?.wings && parts.wings !== "none" && <path d={parts.wings === "feathered" ? "M23 24L5 8L9 29L2 38L22 36M41 24L59 8L55 29L62 38L42 36Z" : parts.wings === "dragon" ? "M22 25L2 3L9 32L2 43L23 40M42 25L62 3L55 32L62 43L41 40Z" : "M23 24L5 10L10 34L3 43L23 39M41 24L59 10L54 34L61 43L41 39Z"} fill={wingColor} stroke="#17191d" strokeWidth="2.5" />}
    {parts?.wings === "dragon" && <path d="M5 10L21 27M59 10L43 27" stroke={trim} strokeWidth="2" />}
    {parts?.wings === "feathered" && <><path d="M6 15L17 24M5 22L17 28M58 15L47 24M59 22L47 28" stroke={trim} strokeWidth="1.5" /></>}
    {parts?.tail && parts.tail !== "none" && <path d={parts.tail === "serpent" ? "M41 43Q59 43 59 53Q58 61 48 60L43 55" : parts.tail === "flame" ? "M41 43L55 37L53 44L62 40L57 51L63 51L51 60L49 52L42 55Z" : parts.tail === "spiked" ? "M41 43L55 46L61 54L57 59L51 56L45 53Z" : "M41 43L55 47L61 56L52 58L45 53Z"} fill={tailColor} stroke="#17191d" strokeWidth="2.5" />}
    {parts?.tail === "spiked" && <path d="M48 46L50 42L53 47M54 49L58 46L59 51" stroke={trim} strokeWidth="2" />}
    {parts?.tail === "flame" && <path d="M53 43L56 39M56 47L60 45" stroke={trim} strokeWidth="1.7" />}
    {parts?.legs === "coiled" ? <path d="M19 43Q22 34 32 39Q43 45 48 37L47 53Q38 60 29 53Q22 49 15 59Z" fill={legColor} stroke="#17191d" strokeWidth="2.5" />
      : parts?.legs === "stone-legs" ? <path d="M19 42H29V54L24 60H13L15 52ZM35 42H45V52L51 60H40L35 54Z" fill={legColor} stroke="#17191d" strokeWidth="2.5" />
        : <path d={parts?.legs === "hooves" ? "M20 41H30V54H17ZM35 41H45V54H33Z" : "M19 40H29V55H20ZM36 40H46V55H37Z"} fill={legColor} stroke="#17191d" strokeWidth="2.5" />}
    {parts?.legs === "talons" && <path d="M20 53L14 61L24 57M37 53L34 61L43 57" fill={trim} stroke="#17191d" strokeWidth="1.8" />}
    {parts?.legs === "hooves" && <path d="M16 52H29V60H14ZM32 52H46V60H32Z" fill={trim} stroke="#17191d" strokeWidth="1.8" />}
    {parts?.legs === "paws" && <><ellipse cx="24" cy="57" rx="7" ry="4" fill={trim} /><ellipse cx="42" cy="57" rx="7" ry="4" fill={trim} /><circle cx="20" cy="51" r="2" fill={trim} /><circle cx="26" cy="50" r="2" fill={trim} /><circle cx="39" cy="50" r="2" fill={trim} /><circle cx="45" cy="51" r="2" fill={trim} /></>}
    {parts?.legs === "stone-legs" && <path d="M17 47H27M37 47H47M17 53L21 55M40 55L46 53" stroke={trim} strokeWidth="1.5" />}
    {parts?.arms === "tentacles"
      ? <><path d="M20 29Q8 34 11 44Q14 50 19 46M43 29Q56 35 53 44Q50 50 45 46M22 33Q12 42 18 49M41 33Q51 42 45 49" fill="none" stroke={armColor} strokeWidth="5" /><path d="M11 44L8 48M53 44L56 48" stroke={trim} strokeWidth="2" /></>
      : <path d={armShape[parts?.arms || "claws"] || armShape.claws} fill={armColor} stroke="#17191d" strokeWidth={parts?.arms === "stone-arms" ? 3 : 2.5} />}
    {parts?.arms === "stone-arms" && <path d="M10 28L17 30M47 30L54 28M12 37L18 38M46 38L52 37" stroke={trim} strokeWidth="2" />}
    {parts?.arms === "paws" && <><circle cx="13" cy="34" r="1.7" fill={trim} /><circle cx="17" cy="36" r="1.7" fill={trim} /><circle cx="51" cy="34" r="1.7" fill={trim} /><circle cx="47" cy="36" r="1.7" fill={trim} /></>}
    {parts?.arms === "claws" && <path d="M11 36L7 42M15 38L13 45M52 36L57 42M48 38L50 45" stroke={trim} strokeWidth="2" />}
    {parts?.arms === "talons" && <path d="M17 38L14 44L20 41M45 38L48 44L42 41" stroke={trim} strokeWidth="2" />}
    <path d={torsoShape[parts?.torso || "scaled"] || torsoShape.scaled} fill={torsoColor} stroke="#17191d" strokeWidth="2.5" />
    {parts?.torso === "scaled" && <path d="M22 26L26 29L30 26L34 29L38 26M21 34L25 37L29 34L33 37L37 34M26 42L29 39L32 42L35 39L38 42" fill="none" stroke={trim} strokeWidth="1.7" />}
    {parts?.torso === "furred" && <><path d="M21 22L17 18L20 28M42 22L47 18L44 28M23 39L17 45L27 43M41 39L47 45L37 43" fill="none" stroke={trim} strokeWidth="2" /><path d="M26 31L29 34M35 34L38 31" stroke={trim} strokeWidth="2" /></>}
    {parts?.torso === "stone" && <><path d="M18 24L28 26L25 35L17 34ZM35 24L46 22L43 34L35 36ZM25 38L39 37L42 45L21 45Z" fill={trim} stroke="#17191d" strokeWidth="1.5" /><path d="M28 26L25 31L30 34M40 27L37 30L42 32" fill="none" stroke="#555e61" strokeWidth="1.5" /></>}
    {parts?.torso === "slime-body" && <><ellipse cx="32" cy="25" rx="10" ry="4" fill={trim} opacity=".8" /><path d="M22 35Q27 39 32 35Q37 39 42 35" fill="none" stroke={trim} strokeWidth="2" /><circle cx="19" cy="45" r="2" fill={trim} /></>}
    {parts?.torso === "armored" && <><path d="M23 23H41L45 35H19Z" fill={trim} stroke="#17191d" strokeWidth="2" /><path d="M27 24L32 29L37 24M22 40H42" fill="none" stroke="#17191d" strokeWidth="2" /><circle cx="32" cy="36" r="3" fill={torsoColor} stroke="#17191d" strokeWidth="1.5" /></>}
    {parts?.torso === "spectral" && <><path d="M23 26Q32 21 41 26M22 32Q32 27 42 32" fill="none" stroke={trim} strokeWidth="2" opacity=".85" /><circle cx="22" cy="39" r="1.7" fill={trim} /><circle cx="42" cy="39" r="1.7" fill={trim} /></>}
    <path d={parts?.head === "skull" ? "M20 19V10L25 5H39L44 10V20L39 25H25Z" : parts?.head === "slime" ? "M19 20Q19 8 32 7Q45 8 45 20L40 27H24Z" : parts?.head === "dragon" ? "M19 18L16 9L27 12L29 4L36 10L44 8L47 19L41 26H23Z" : parts?.head === "eyestalks" ? "M19 19L17 12L24 9L32 7L40 9L47 12L45 20L40 26H24Z" : "M19 20L15 11L23 13L28 5L34 11L43 9L47 20L40 27H24Z"} fill={parts?.head === "skull" ? trim : headColor} stroke="#17191d" strokeWidth="2.5" />
    {parts?.head === "horned" && <path d="M25 11L21 2L31 8M39 11L43 2L34 8" fill="none" stroke={trim} strokeWidth="3" />}
    {parts?.head === "dragon" && <><path d="M20 17L8 12L16 24M45 17L57 12L48 24Z" fill={headColor} stroke="#17191d" strokeWidth="2" /><path d="M44 23L55 22L48 28Z" fill={trim} /></>}
    {parts?.head === "skull" ? <><path d="M24 14H29V18H24ZM36 14H41V18H36Z" fill="#17191d" /><path d="M31 20L33 18L35 20L33 22Z" fill="#17191d" /><path d="M26 24V27M32 24V27M38 24V27" stroke="#17191d" strokeWidth="1.5" /></>
      : <><circle cx="27" cy="17" r="2.3" fill={trim} /><circle cx="38" cy="17" r="2.3" fill={trim} /></>}
    {parts?.head === "slime" && <><circle cx="27" cy="17" r="1.3" fill="#17191d" /><circle cx="38" cy="17" r="1.3" fill="#17191d" /><path d="M26 22Q32 27 39 22" fill="none" stroke={trim} strokeWidth="1.5" /></>}
    {parts?.head === "dragon" && <path d="M25 23L29 25H38L42 22" fill="none" stroke={trim} strokeWidth="1.6" />}
    {parts?.head === "eyestalks" && <><path d="M26 10L24 2M39 10L41 2" stroke={trim} strokeWidth="2.3" /><circle cx="24" cy="2" r="3" fill={headColor} stroke="#17191d" /><circle cx="41" cy="2" r="3" fill={headColor} stroke="#17191d" /><circle cx="24" cy="2" r="1" fill="#17191d" /><circle cx="41" cy="2" r="1" fill="#17191d" /></>}
  </svg>;
}

function MapMarker({ kind }: { kind: MapMarkerKind }) {
  const props = { "aria-hidden": true as const, className: "map-marker-icon", strokeWidth: 2 };
  if (kind === "path") return <Footprints {...props} />;
  if (kind === "start") return <DoorOpen {...props} />;
  if (kind === "monster") return <Skull {...props} />;
  if (kind === "corpse") return <span className="corpse-map-marker"><Skull {...props} /><i aria-hidden="true">×</i></span>;
  if (kind === "trap") return <TriangleAlert {...props} />;
  if (kind === "key") return <KeyRound {...props} />;
  if (kind === "exit") return <ArrowDownToLine {...props} />;
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8h18v12H3z" />
    <path d="M3 8l3-5h12l3 5M3 13h18M11 13v3h2v-3" />
  </svg>;
}

export default function Home() {
  const search = useSyncExternalStore(subscribeToLocation, getLocationSearch, () => "");
  const params = new URLSearchParams(search);
  const roomFromUrl = (params.get("room") || "").toUpperCase();
  const hostFromUrl = params.get("host") === "1";
  const [newExpedition, setNewExpedition] = useState<{ code: string; token: string } | null>(null);
  const code = newExpedition?.code || roomFromUrl;
  const storedTeacherToken = useStoredValue(code ? `dungeon_host_${code}` : null);
  const storedPlayerId = useStoredValue(code ? `dungeon_group_${code}` : null, true);
  const teacherToken = newExpedition?.code === code ? newExpedition.token : storedTeacherToken;
  const [joinedGroup, setJoinedGroup] = useState<{ code: string; id: string } | null>(null);
  const playerId = joinedGroup?.code === code ? joinedGroup.id : storedPlayerId;
  const mode = newExpedition ? "host" : roomFromUrl ? hostFromUrl ? "host" : "group" : "home";
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [maps, setMaps] = useState<MapTemplate[]>([]);
  const [mapError, setMapError] = useState("");
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [designError, setDesignError] = useState("");
  const requestVersion = useRef(0);
  const mutationsInFlight = useRef(0);

  useEffect(() => {
    if (mode !== "home") return;
    fetch("/api/maps", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { maps?: MapTemplate[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load custom maps.");
        setMaps(data.maps || []);
        setMapError("");
      })
      .catch((cause: unknown) => setMapError(cause instanceof Error ? cause.message : "Could not load custom maps."));
  }, [mode]);

  useEffect(() => {
    if (mode !== "home" && mode !== "group") return;
    fetch("/api/creations", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { designs?: SavedDesign[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load saved designs.");
        setDesigns(data.designs || []);
        setDesignError("");
      })
      .catch((cause: unknown) => setDesignError(cause instanceof Error ? cause.message : "Could not load saved designs."));
  }, [mode]);

  const refresh = useCallback(async () => {
    if (!code || mutationsInFlight.current) return;
    const version = requestVersion.current;
    try {
      const identity = mode === "host" && teacherToken
        ? `&teacherToken=${encodeURIComponent(teacherToken)}`
        : mode === "group" && playerId ? `&playerId=${encodeURIComponent(playerId)}` : "";
      const response = await fetch(`/api/game?room=${encodeURIComponent(code)}${identity}`, { cache: "no-store" });
      const data = await response.json() as GameState & { error?: string };
      if (version !== requestVersion.current || mutationsInFlight.current) return;
      if (response.ok) setGame(data);
      else if (response.status === 404) setError(data.error || "Expedition not found.");
    } catch { /* Keep the last synchronized view during a brief Wi-Fi interruption. */ }
  }, [code, mode, playerId, teacherToken]);

  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(() => void refresh(), 1400);
    return () => window.clearInterval(timer);
  }, [code, refresh]);

  async function createExpedition(mapId?: string) {
    setBusy(true); setError("");
    try {
      const data = await api({ action: "create", ...(mapId ? { mapId } : {}) });
      if (!data.code || !data.teacherToken || !data.state) throw new Error("The expedition could not be opened.");
      setNewExpedition({ code: data.code, token: data.teacherToken }); setGame(data.state);
      saveStoredValue(`dungeon_host_${data.code}`, data.teacherToken);
      window.history.replaceState({}, "", `?room=${data.code}&host=1`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function saveMap(map: Omit<MapTemplate, "id"> & { id?: string }) {
    const response = await fetch("/api/maps", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: map.id, map }),
    });
    const data = await response.json() as { map?: MapTemplate; error?: string };
    if (!response.ok || !data.map) throw new Error(data.error || "Could not save this map.");
    setMaps((current) => [data.map!, ...current.filter((saved) => saved.id !== data.map!.id)]);
    return data.map;
  }
  async function deleteMap(id: string) {
    const response = await fetch("/api/maps", {
      method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    });
    const data = await response.json() as { deleted?: string; error?: string };
    if (!response.ok || data.deleted !== id) throw new Error(data.error || "Could not delete this map.");
    setMaps((current) => current.filter((map) => map.id !== id));
  }
  async function saveDesign(design: Omit<SavedDesign, "id"> & { id?: string }) {
    const response = await fetch("/api/creations", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: design.id, design }),
    });
    const data = await response.json() as { design?: SavedDesign; error?: string };
    if (!response.ok || !data.design) throw new Error(data.error || "Could not save this design.");
    setDesigns((current) => [data.design!, ...current.filter((saved) => saved.id !== data.design!.id)]);
    return data.design;
  }
  async function deleteDesign(id: string) {
    const response = await fetch("/api/creations", {
      method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    });
    const data = await response.json() as { deleted?: string; error?: string };
    if (!response.ok || data.deleted !== id) throw new Error(data.error || "Could not delete this design.");
    setDesigns((current) => current.filter((design) => design.id !== id));
  }
  async function hostAction(action: string) {
    requestVersion.current += 1;
    const version = requestVersion.current;
    mutationsInFlight.current += 1;
    setBusy(true); setError("");
    try {
      const data = await api({ action, room: code, teacherToken });
      if (data.state && version === requestVersion.current) setGame(data.state);
    } catch (cause) { setError((cause as Error).message); }
    finally { mutationsInFlight.current = Math.max(0, mutationsInFlight.current - 1); setBusy(false); }
  }
  async function groupAction(action: string, details: Record<string, string> = {}): Promise<GameApiResponse | undefined> {
    requestVersion.current += 1;
    const version = requestVersion.current;
    mutationsInFlight.current += 1;
    setError("");
    try {
      const data = await api({ action, room: code, playerId, ...details });
      if (data.playerId) {
        setJoinedGroup({ code, id: data.playerId });
        saveStoredValue(`dungeon_group_${code}`, data.playerId, true);
      }
      if (data.state && version === requestVersion.current) setGame(data.state);
      return data;
    } catch (cause) { setError((cause as Error).message); }
    finally { mutationsInFlight.current = Math.max(0, mutationsInFlight.current - 1); }
  }

  return <main className="app-shell">
    <div className="stars" aria-hidden="true" />
    <MusicToggle />
    {mode === "home" && <Landing maps={maps} mapError={mapError} designs={designs} designError={designError} onCreate={createExpedition} onSaveMap={saveMap} onDeleteMap={deleteMap} onSaveDesign={saveDesign} onDeleteDesign={deleteDesign} busy={busy} error={error} />}
    {mode === "host" && game && <ExpeditionBoard game={game} onAction={hostAction} error={error} busy={busy} />}
    {mode === "host" && !game && <section className="loading-screen"><Brand /><p className="eyebrow">Loading the expedition</p>{error && <p className="error">{error}</p>}</section>}
    {mode === "group" && <GroupScreen code={code} game={game} playerId={playerId} designs={designs} designError={designError} onAction={groupAction} error={error} />}
  </main>;
}

type HomeSection = "home" | "maps" | "characters" | "monsters";

function Landing({ maps, mapError, designs, designError, onCreate, onSaveMap, onDeleteMap, onSaveDesign, onDeleteDesign, busy, error }: {
  maps: MapTemplate[];
  mapError: string;
  designs: SavedDesign[];
  designError: string;
  onCreate: (mapId?: string) => void;
  onSaveMap: (map: Omit<MapTemplate, "id"> & { id?: string }) => Promise<MapTemplate>;
  onDeleteMap: (id: string) => Promise<void>;
  onSaveDesign: (design: DesignInput & { id?: string }) => Promise<SavedDesign>;
  onDeleteDesign: (id: string) => Promise<void>;
  busy: boolean;
  error: string;
}) {
  const [section, setSection] = useState<HomeSection>("home");
  const [selectedMapId, setSelectedMapId] = useState("");
  const [editingMap, setEditingMap] = useState<MapTemplate | null | undefined>(undefined);
  const [editingDesign, setEditingDesign] = useState<{ kind: CreatorKind; design?: SavedDesign } | null>(null);
  const [deletingMapId, setDeletingMapId] = useState("");
  const [deletingDesignId, setDeletingDesignId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  if (editingMap !== undefined) return <MapEditor initialMap={editingMap} onClose={() => setEditingMap(undefined)} onSave={async (map) => {
    const saved = await onSaveMap(map);
    setSelectedMapId(saved.id);
    setEditingMap(undefined);
  }} />;
  if (editingDesign) return <DesignEditor kind={editingDesign.kind} initialDesign={editingDesign.design} onClose={() => setEditingDesign(null)} onSave={async (design) => {
    await onSaveDesign(design);
    setEditingDesign(null);
  }} />;
  const selectedMap = maps.find((map) => map.id === selectedMapId);
  async function deleteMap(map: MapTemplate) {
    if (!window.confirm(`Delete "${map.name}"? This cannot be undone.`)) return;
    setDeletingMapId(map.id);
    setDeleteError("");
    try {
      await onDeleteMap(map.id);
      setSelectedMapId((current) => current === map.id ? "" : current);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Could not delete this map.");
    } finally {
      setDeletingMapId("");
    }
  }
  async function deleteDesign(design: SavedDesign) {
    if (!window.confirm(`Delete "${design.name}"? This cannot be undone.`)) return;
    setDeletingDesignId(design.id);
    setDeleteError("");
    try { await onDeleteDesign(design.id); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Could not delete this design."); }
    finally { setDeletingDesignId(""); }
  }
  if (section === "home") return <section className="landing landing-home homepage">
    <div className="landing-art" aria-hidden="true"><span>⌖</span><i>✦</i><b>♜</b></div>
    <Brand />
    <p className="eyebrow">A co-op classroom adventure</p>
    <h1>Build your<br /><em>own dungeon.</em></h1>
    <p className="lede">Create a world, gather your party, and descend into adventure.</p>
    <button className="primary big homepage-play" onClick={() => onCreate(selectedMapId || undefined)} disabled={busy}>{busy ? "Opening an expedition…" : selectedMap ? `Play ${selectedMap.name}` : "Host an expedition"}<ChevronRight /></button>
    <div className="homepage-options" aria-label="Dungeon workshop options">
      <button onClick={() => setSection("maps")}><Map /><strong>Map maker</strong><span>Build a dungeon layout</span><b>{maps.length} saved</b></button>
      <button onClick={() => setSection("characters")}><Users /><strong>Character creator</strong><span>Design class-based heroes</span><b>{designs.filter((design) => design.kind === "character").length} saved</b></button>
      <button onClick={() => setSection("monsters")}><Skull /><strong>Monster creator</strong><span>Invent dungeon creatures</span><b>{designs.filter((design) => design.kind === "monster").length} saved</b></button>
    </div>
    <p className="hosting-note"><Users /> Students join by scanning the room QR code. No accounts needed.</p>
    {error && <p className="error">{error}</p>}{mapError && <p className="error">{mapError}</p>}{designError && <p className="error">{designError}</p>}
  </section>;
  return <section className="workshop-screen">
    <header className="topbar"><Brand /><button className="text-button" onClick={() => setSection("home")}><ChevronLeft /> Homepage</button></header>
    {section === "maps" ? <div className="workshop-content">
      <div className="workshop-heading"><p className="eyebrow">Dungeon workshop</p><h1>Map maker</h1><p>Design connected maps for your next expedition. Select a map to use it when hosting.</p></div>
      <div className="workshop-toolbar"><button className="primary" onClick={() => setEditingMap(null)}><Pencil /> Create a map</button>{selectedMap && <button className="text-button" onClick={() => setSelectedMapId("")}>Clear selection: {selectedMap.name}</button>}</div>
      {mapError && <p className="error">{mapError}</p>}
      {maps.length ? <div className="map-library-grid">{maps.map((map) => <article key={map.id} className={`map-library-card ${selectedMapId === map.id ? "selected" : ""}`}>
        <button className="map-library-select" onClick={() => setSelectedMapId(selectedMapId === map.id ? "" : map.id)} aria-pressed={selectedMapId === map.id}><strong>{map.name}</strong><span>{map.tiles.length} tiles · {map.tiles.filter((tile) => tile.enemy).length} monsters · {map.tiles.filter((tile) => tile.kind === "treasure").length} chests</span></button>
        <button className="text-button" onClick={() => setEditingMap(map)} aria-label={`Edit ${map.name}`}><Pencil /> Edit</button>
        <button className="text-button danger map-delete-button" onClick={() => void deleteMap(map)} disabled={!!deletingMapId} aria-label={`Delete ${map.name}`}>{deletingMapId === map.id ? "Deleting…" : "Delete"}</button>
      </article>)}</div> : <p className="muted map-library-empty">No saved maps yet. Create one to guarantee a custom layout on floor 1.</p>}
      {deleteError && <p className="error" role="alert">{deleteError}</p>}
    </div> : <div className={`workshop-content ${section === "monsters" ? "monster-workshop-content" : "character-workshop-content"}`}>
      <div className="workshop-heading"><p className="eyebrow">Dungeon workshop</p><h1>{section === "characters" ? "Character creator" : "Monster creator"}</h1><p>{section === "characters" ? "Save custom heroes for students to choose when forming a party." : "Your saved creatures join the monsters that can appear in future expeditions."}</p></div>
      <div className="workshop-toolbar"><button className="primary" onClick={() => setEditingDesign({ kind: section === "characters" ? "character" : "monster" })}><Pencil /> Create {section === "characters" ? "character" : "monster"}</button></div>
      {designError && <p className="error">{designError}</p>}
      <div className={`design-library-grid ${section === "monsters" ? "monster-library-grid" : "character-library-grid"}`}>{designs.filter((design) => design.kind === (section === "characters" ? "character" : "monster")).map((design) => <article className={`design-library-card ${design.kind === "monster" ? "monster-library-card" : "character-library-card"}`} key={design.id}>
        {design.kind === "monster"
          ? <div className="monster-card-nameplate"><strong>{design.name}</strong><span>BESTIARY SPECIMEN</span></div>
          : <div className="monster-card-nameplate character-card-nameplate"><strong>{design.name}</strong><span>{design.characterClass.toUpperCase()} · HERO</span></div>}
        <div className="design-card-preview">{design.kind === "character" ? <PixelSprite characterClass={design.characterClass} color={design.color} trimColor={design.trimColor} colors={design.colors} appearance={design.parts} /> : <MonsterSprite monster={design} />}</div>
        <div className="design-card-copy"><div className="design-card-stats">{design.kind === "character" ? <><span>DMG {design.stats.damage}</span><span>DEX {design.stats.dexterity}</span><span>SPD {design.stats.speed}</span></> : <><span>DMG {design.stats.damageMin}–{design.stats.damageMax}</span><span>SPD {design.stats.speed}</span><span>{design.stats.bounty} gold</span></>}</div></div>
        <div className="design-card-actions">
          <button className="text-button" onClick={() => setEditingDesign({ kind: design.kind, design })} aria-label={`Edit ${design.name}`}><Pencil /> Edit</button>
          <button className="text-button danger" disabled={!!deletingDesignId} onClick={() => void deleteDesign(design)} aria-label={`Delete ${design.name}`}>{deletingDesignId === design.id ? "Deleting…" : "Delete"}</button>
        </div>
      </article>)}</div>
      {designs.filter((design) => design.kind === (section === "characters" ? "character" : "monster")).length === 0 && <p className="muted map-library-empty">No saved designs yet. Create one to add it to the library.</p>}
      {deleteError && <p className="error" role="alert">{deleteError}</p>}
    </div>}
  </section>;
}

function DesignEditor({ kind, initialDesign, onClose, onSave }: { kind: CreatorKind; initialDesign?: SavedDesign; onClose: () => void; onSave: (design: DesignInput & { id?: string }) => Promise<void> }) {
  const [name, setName] = useState(initialDesign?.name || "");
  const [characterClass, setCharacterClass] = useState<CharacterClass>(initialDesign?.kind === "character" ? initialDesign.characterClass : "Warrior");
  const [color] = useState(initialDesign?.color || CREATOR_COLORS[0]);
  const [trimColor, setTrimColor] = useState(initialDesign?.trimColor || CREATOR_COLORS[7]);
  const [partColors, setPartColors] = useState<PartColors>({ ...defaultPartColors(initialDesign?.color), ...initialDesign?.colors });
  const [parts, setParts] = useState<BodyParts>(initialDesign?.parts || defaultBodyParts(kind));
  const [characterStats, setCharacterStats] = useState<CharacterDesignStats | null>(initialDesign?.kind === "character" ? initialDesign.stats : null);
  const [characterRolls, setCharacterRolls] = useState<StatRoll[] | null>(null);
  const [assignments, setAssignments] = useState<Record<StatKey, number>>({ damage: 0, dexterity: 1, speed: 2 });
  const [monsterStats, setMonsterStats] = useState<MonsterDesignStats | null>(initialDesign?.kind === "monster" ? initialDesign.stats : null);
  const [monsterDice, setMonsterDice] = useState<{ damage: number[]; speed: number[]; bounty: number[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = kind === "monster" ? BODY_PART_OPTIONS.monster : BODY_PART_OPTIONS.character[characterClass];
  const colorParts = kind === "monster" ? ["head", "torso", "arms", "legs", "tail", "wings"] as const : ["head", "torso", "arms", "legs"] as const;
  function updatePart(part: keyof BodyParts, value: string) { setParts((current) => ({ ...current, [part]: value })); }
  function updatePartColor(part: keyof PartColors, value: string) { setPartColors((current) => ({ ...current, [part]: value })); }
  function rollCharacterStats() {
    const rolls = [rollAbility(), rollAbility(), rollAbility()];
    setCharacterRolls(rolls);
    setAssignments({ damage: 0, dexterity: 1, speed: 2 });
    setCharacterStats({ damage: rolls[0].value, dexterity: rolls[1].value, speed: rolls[2].value });
  }
  function assignCharacterStat(stat: StatKey, index: number) {
    if (!characterRolls) return;
    const replaced = Object.entries(assignments).find(([key, assigned]) => key !== stat && assigned === index);
    const nextAssignments = replaced
      ? { ...assignments, [replaced[0]]: assignments[stat], [stat]: index }
      : { ...assignments, [stat]: index };
    setAssignments(nextAssignments);
    setCharacterStats({
      damage: characterRolls[nextAssignments.damage].value,
      dexterity: characterRolls[nextAssignments.dexterity].value,
      speed: characterRolls[nextAssignments.speed].value,
    });
  }
  function rollMonsterStats() {
    const die = () => Math.floor(Math.random() * 6) + 1;
    const damageDice = [die(), die()];
    const speedDice = [die(), die(), die()];
    const bountyDice = [die(), die()];
    setMonsterDice({ damage: damageDice, speed: speedDice, bounty: bountyDice });
    setMonsterStats({
      damageMin: damageDice[0],
      damageMax: damageDice[0] + damageDice[1],
      speed: speedDice.reduce((sum, value) => sum + value, 0),
      bounty: bountyDice.reduce((sum, value) => sum + value, 0) * 5,
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (kind === "character" && !characterStats || kind === "monster" && !monsterStats) {
      setError("Roll the design's stats before saving.");
      return;
    }
    setSaving(true);
    setError("");
    const design: DesignInput & { id?: string } = kind === "character"
      ? { ...(initialDesign ? { id: initialDesign.id } : {}), kind, name, characterClass, color, trimColor, colors: partColors, stats: characterStats!, parts: { head: parts.head, torso: parts.torso, arms: parts.arms, legs: parts.legs } }
      : { ...(initialDesign ? { id: initialDesign.id } : {}), kind, name, color, trimColor, colors: partColors, stats: monsterStats!, parts: { ...parts } };
    try { await onSave(design); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this design."); }
    finally { setSaving(false); }
  }
  const colorPicker = (label: string, value: string, onChange: (next: string) => void) => <fieldset className="creator-color-field" key={label}>
    <legend>{label}</legend><div className="sprite-options">{CREATOR_COLORS.map((spriteColor) => <button type="button" key={spriteColor} aria-label={`Choose ${label.toLowerCase()} ${spriteColor}`} aria-pressed={value === spriteColor} className={value === spriteColor ? "selected" : ""} onClick={() => onChange(spriteColor)}><i style={{ backgroundColor: spriteColor }} /></button>)}</div>
  </fieldset>;
  return <section className="map-editor">
    <header className="topbar"><Brand /><button className="text-button" onClick={onClose}><ChevronLeft /> Back to workshop</button></header>
    <form className="design-editor-content" onSubmit={submit}>
      <div className="workshop-heading"><p className="eyebrow">{kind === "character" ? "Hero workshop" : "Monster workshop"}</p><h1>{initialDesign ? "Edit design" : `Create a ${kind}`}</h1><p>Each body part changes the sprite. Roll stats here to save them with the design.</p></div>
      <div className="design-editor-layout">
        <div className="design-preview-card">{kind === "character" ? <PixelSprite characterClass={characterClass} color={color} trimColor={trimColor} colors={partColors} appearance={parts} /> : <MonsterSprite monster={{ name: name || "Your monster", color, trimColor, colors: partColors, appearance: parts }} />}<strong>{name || (kind === "character" ? characterClass : "Your monster")}</strong><span>{kind === "character" ? characterClass : "Custom dungeon monster"}</span>
          {kind === "character" && characterStats && <div className="design-stat-summary"><span>DMG {characterStats.damage}</span><span>DEX {characterStats.dexterity}</span><span>SPD {characterStats.speed}</span></div>}
          {kind === "monster" && monsterStats && <div className="design-stat-summary"><span>DMG {monsterStats.damageMin}–{monsterStats.damageMax}</span><span>SPD {monsterStats.speed}</span><span>{monsterStats.bounty} gold</span></div>}
        </div>
        <div className="design-controls">
          <label className="map-name-field">Design name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} required placeholder={kind === "character" ? "e.g. Aria the Brave" : "e.g. Crystal Maw"} /></label>
          {kind === "character" && <label className="creator-field">Class<select value={characterClass} onChange={(event) => { const next = event.target.value as CharacterClass; setCharacterClass(next); setParts(defaultBodyParts("character", next)); setCharacterStats(null); setCharacterRolls(null); }}>{CHARACTER_CLASSES.map((character) => <option key={character}>{character}</option>)}</select></label>}
          <div className="body-part-grid">{Object.entries(options).map(([part, values]) => <label className="creator-field" key={part}>{part === "tail" || part === "wings" ? `${part} (optional)` : part}<select value={parts[part as keyof BodyParts] || "none"} onChange={(event) => updatePart(part as keyof BodyParts, event.target.value)}>{values.map((value) => <option value={value} key={value}>{value.replaceAll("-", " ")}</option>)}</select></label>)}</div>
          <section className="design-stat-controls">
            {kind === "character" ? <>
              <div className="creator-heading"><div><p className="form-label">Roll hero stats</p><small>Roll 4d6, drop the lowest, then assign the results.</small></div><button type="button" className="roll-button" onClick={rollCharacterStats}>🎲 {characterStats ? "Reroll" : "Roll stats"}</button></div>
              {characterRolls ? <><div className="stat-roll-cards">{characterRolls.map((roll, index) => <div className="stat-roll-card" key={`${index}-${roll.value}`}><small>4D6 · DROP LOWEST</small><span className="stat-dice">{roll.dice.map((die, dieIndex) => <i key={dieIndex} className={dieIndex === 0 ? "drop-die" : ""}>{die}</i>)}</span><strong>{roll.value}</strong></div>)}</div><div className="stat-assignments">{(["damage", "dexterity", "speed"] as StatKey[]).map((stat) => <label key={stat}>{STAT_LABELS[stat]}<select value={assignments[stat]} onChange={(event) => assignCharacterStat(stat, Number(event.target.value))}>{characterRolls.map((roll, index) => <option key={`${index}-${roll.value}`} value={index}>Roll {index + 1} · {roll.value}</option>)}</select></label>)}</div></>
                : characterStats ? <p className="muted">Saved stats: Damage {characterStats.damage}, Dexterity {characterStats.dexterity}, Speed {characterStats.speed}. Reroll to replace them.</p>
                  : <p className="muted roll-prompt">Roll three stats to finish this character design.</p>}
            </> : <>
              <div className="creator-heading"><div><p className="form-label">Roll monster stats</p><small>Damage range d6 + d6 · Speed 3d6 · Bounty 2d6 × 5 gold.</small></div><button type="button" className="roll-button" onClick={rollMonsterStats}>🎲 {monsterStats ? "Reroll" : "Roll stats"}</button></div>
              {monsterStats && <div className="monster-stat-rolls"><span>Damage <b>{monsterStats.damageMin}–{monsterStats.damageMax}</b>{monsterDice && <small>({monsterDice.damage.join(" + ")})</small>}</span><span>Speed <b>{monsterStats.speed}</b>{monsterDice && <small>({monsterDice.speed.join(" + ")})</small>}</span><span>Bounty <b>{monsterStats.bounty} gold</b>{monsterDice && <small>({monsterDice.bounty.join(" + ")} × 5)</small>}</span></div>}
              {!monsterStats && <p className="muted roll-prompt">Roll monster stats before saving.</p>}
            </>}
          </section>
          <section className="part-color-pickers"><p className="form-label">Choose a color for each part</p><small>Head, torso, arms, legs, tail, and wings can each have their own color.</small>
            {colorParts.map((part) => colorPicker(`${part[0].toUpperCase()}${part.slice(1)} color`, partColors[part] || color, (value) => updatePartColor(part, value)))}
            {colorPicker("Detail / trim color", trimColor, setTrimColor)}
          </section>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="map-editor-actions"><button type="button" className="text-button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary" type="submit" disabled={saving || (kind === "character" ? !characterStats : !monsterStats)}>{saving ? "Saving…" : "Save design"}<ChevronRight /></button></div>
    </form>
  </section>;
}

function BattleScreen({ game, group, battle, battleEffect, monsterAttack, sequenceBusy, onAction, onOpenInventory, onRetryMonsterTurn, error }: { game: GameState; group: Group; battle: Battle; battleEffect: BattleEffect | null; monsterAttack: MonsterAttack | null; sequenceBusy: boolean; onAction: (action: string, details?: Record<string, string>) => Promise<GameApiResponse | undefined>; onOpenInventory: (item: string) => void; onRetryMonsterTurn: () => void; error: string }) {
  const livingHeroes = group.characters.filter((hero) => hero.hp > 0);
  const nextActorId = nextBattleActor(group, battle);
  const activeHero = nextActorId && nextActorId !== MONSTER_TURN_ID
    ? livingHeroes.find((hero) => hero.id === nextActorId)
    : undefined;
  const effectActor = battleEffect ? group.characters.find((hero) => hero.id === battleEffect.actorId) : undefined;
  const incomingTarget = monsterAttack ? group.characters.find((hero) => hero.id === monsterAttack.targetId) : undefined;
  const displayedHero = incomingTarget || effectActor || activeHero;
  const monster = game.bestiary.find((beast) => beast.name === battle.enemy);

  function act(move: string) {
    if (activeHero && !sequenceBusy) void onAction("battle", { move, characterId: activeHero.id });
  }

  return <main className="battle-screen">
    <header className="battle-screen-topbar"><Brand /><span className="battle-floor-label">FLOOR {battle.floor} · {monster?.boss ? "BOSS BATTLE" : "ENCOUNTER"}</span><span className="battle-party-label">{group.name}</span></header>
    <div className="battle-screen-content">
      <div className="battle-screen-heading"><p className="eyebrow">A monster blocks your path</p><h1>{battle.enemy}</h1></div>
      <section className="battle-arena" aria-label={`${group.name} fighting ${battle.enemy}`}>
        <div className="battle-monster-status">
          <div><strong>{battle.enemy}</strong><span>{battle.hp} / {battle.maxHp} HP · SPD {battle.speed} · DMG {battle.damageMin}–{battle.damageMax}</span></div>
          <div className="health-track enemy"><i style={{ width: `${Math.max(0, battle.hp / battle.maxHp * 100)}%` }} /></div>
        </div>
        <div className="battle-ground">
          {battleEffect && <div key={battleEffect.id} className={`battle-combat-effect effect-${battleEffect.kind} ${battleEffect.hit ? "effect-hit" : "effect-miss"}`} aria-live="polite">
            <span className="combat-effect-actor">{battleEffect.actorName}</span>
            <span className="combat-effect-projectile" aria-hidden="true">{battleEffect.kind === "sword-slash" ? "⚔" : battleEffect.kind === "arrow-volley" ? "➶ ➶" : battleEffect.kind === "dagger-strike" ? "🗡 🗡" : battleEffect.kind === "magic-blast" ? "✦" : "💥"}</span>
            <strong>{battleEffect.hit ? `-${battleEffect.damage} HP` : "MISS"}</strong>
          </div>}
          {monsterAttack && <div key={monsterAttack.id} className="battle-monster-attack" aria-live="assertive"><strong>{battle.enemy} attacks!</strong><span>{monsterAttack.targetName} · rolled {monsterAttack.rolledDamage} · −{monsterAttack.damage} HP</span></div>}
          <div className="battle-actor">
            <span className={`battle-actor-sprite ${displayedHero ? "" : "battle-actor-waiting"} ${battleEffect && effectActor?.id === displayedHero?.id ? `battle-actor-attacking attack-${battleEffect.kind}` : ""} ${monsterAttack?.targetId === displayedHero?.id ? "battle-hero-hit" : ""}`}>{displayedHero ? <PixelSprite characterClass={displayedHero.characterClass} color={displayedHero.spriteColor} trimColor={displayedHero.trimColor} colors={displayedHero.partColors} appearance={displayedHero.appearance} /> : "✦"}</span>
            <span className="battle-platform" />
            {displayedHero && <div className="battle-actor-caption"><strong>{displayedHero.name}</strong><small>{displayedHero.characterClass} · {displayedHero.hp}/{displayedHero.maxHp} HP</small>{monsterAttack?.targetId === displayedHero.id ? <small>Hit by the monster!</small> : battleEffect && effectActor?.id === displayedHero.id ? <small>Attacking!</small> : activeHero && battle.actedCharacterIds.includes(activeHero.id) && <small>Turn complete</small>}</div>}
          </div>
          <div className="battle-vs" aria-hidden="true">VS</div>
          <div className={`battle-enemy ${monsterAttack ? "battle-enemy-attacking" : ""}`}>
            <span className="battle-enemy-sprite" aria-hidden="true">{monster?.appearance ? <MonsterSprite monster={monster} /> : monster?.icon || "👾"}</span>
            <span className="battle-platform monster-platform" />
            <div className="battle-actor-caption"><strong>{battle.enemy}</strong><small>{monster?.boss ? "Dungeon boss" : "Dungeon monster"}</small></div>
          </div>
        </div>
      </section>
      <section className="battle-party-strip" aria-label="Party status">
        {group.characters.map((hero) => {
          const acted = battle.actedCharacterIds.includes(hero.id);
          const current = activeHero?.id === hero.id;
          return <div className={`battle-party-hero ${current ? "current" : ""} ${monsterAttack?.targetId === hero.id ? "attacked" : ""} ${hero.hp <= 0 ? "fallen" : acted ? "acted" : ""}`} key={hero.id}>
            <PixelSprite characterClass={hero.characterClass} color={hero.spriteColor} trimColor={hero.trimColor} colors={hero.partColors} appearance={hero.appearance} />
            <span><strong>{hero.name}</strong><small>{hero.hp <= 0 ? "Fallen" : `${hero.hp}/${hero.maxHp} HP`}</small></span>
            {current && <b>YOUR TURN</b>}
          </div>;
        })}
      </section>
      <section className="battle-initiative" aria-label="Battle turn order">
        <strong>INITIATIVE · FASTEST FIRST</strong>
        <div>{battleTurnOrder(group, battle).map((actorId, index) => {
          const monsterTurn = actorId === MONSTER_TURN_ID;
          const hero = monsterTurn ? undefined : group.characters.find((character) => character.id === actorId);
          const acted = battle.actedCharacterIds.includes(actorId);
          return <span key={actorId} className={`${monsterTurn ? "monster" : ""} ${actorId === nextActorId ? "next" : ""} ${acted ? "acted" : ""}`}>
            <b>{index + 1}</b>{monsterTurn ? `${battle.enemy} · SPD ${battle.speed}` : `${hero?.name || "Hero"} · SPD ${hero?.speed ?? 0}`}
          </span>;
        })}</div>
      </section>
      <InventoryPanel inventory={group.stats.inventory} onSelect={onOpenInventory} compact disabled={sequenceBusy} />
      <section className="battle-command-panel">
        <div className="battle-command-title"><span className="eyebrow">Battle commands</span><strong>{sequenceBusy ? "The monster is preparing to strike…" : activeHero ? `${activeHero.name}, choose an action` : "Waiting for the next turn…"}</strong></div>
        {activeHero ? <div className="battle-command-grid">
          <button disabled={sequenceBusy} className="battle-command-primary" onClick={() => act("attack")}><Swords /><span><strong>Attack</strong><small>Strike the monster</small></span></button>
          {activeHero.characterClass === "Warrior" && <button disabled={sequenceBusy} onClick={() => act("guard")}><Shield /><span><strong>Guard</strong><small>Reduce the next hit</small></span></button>}
          {activeHero.characterClass === "Thief" && <button disabled={sequenceBusy} onClick={() => act("steal")}><Coins /><span><strong>Mug</strong><small>Deal damage and steal 8 gold</small></span></button>}
          {activeHero.characterClass === "Archer" && <button disabled={sequenceBusy} onClick={() => act("double")}><span className="battle-command-emoji">🏹</span><span><strong>Dual shot</strong><small>Fire two arrows</small></span></button>}
          {activeHero.characterClass === "Mage" && <button disabled={sequenceBusy} onClick={() => act("heal")}><span className="battle-command-emoji">✨</span><span><strong>Heal</strong><small>Restore an ally&apos;s HP</small></span></button>}
          <button disabled={sequenceBusy} className="battle-command-run" onClick={() => act("run")}><DoorOpen /><span><strong>Run</strong><small>Try to escape</small></span></button>
        </div> : <div className="battle-no-turn">
          <p className="battle-waiting">{nextActorId === undefined ? "Resuming the next round…" : "Waiting for the monster's turn…"}</p>
          {error && (nextActorId === MONSTER_TURN_ID || nextActorId === undefined) && <button className="text-button" disabled={sequenceBusy} onClick={onRetryMonsterTurn}>Retry battle turn</button>}
        </div>}
        <p className="battle-turn-hint">Turns follow Speed order, fastest first. The monster acts when its initiative comes up.</p>
      </section>
      <DiceRolls game={game} groupId={group.id} />
      {error && <p className="error battle-screen-error">{error}</p>}
    </div>
  </main>;
}

type MapBrush = "erase" | Exclude<MapMarkerKind, "corpse">;
const MAP_BRUSHES: { id: MapBrush; label: string }[] = [
  { id: "erase", label: "Erase" }, { id: "path", label: "Path" },
  { id: "start", label: "Start" }, { id: "monster", label: "Monster" },
  { id: "chest", label: "Chest" }, { id: "trap", label: "Trap" },
  { id: "key", label: "Key" }, { id: "exit", label: "Exit" },
];
const MONSTER_ICONS: Record<string, string> = { Mossling: "🍄", "Cave Bat": "🦇", "Stone Golem": "🗿" };

function MapEditor({ initialMap, onClose, onSave }: { initialMap: MapTemplate | null; onClose: () => void; onSave: (map: Omit<MapTemplate, "id"> & { id?: string }) => Promise<void> }) {
  const [name, setName] = useState(initialMap?.name || "");
  const [tiles, setTiles] = useState<MapTile[]>(initialMap?.tiles.map((tile) => tile.kind === "room" ? { ...tile, kind: "corridor" } : tile) || []);
  const [starts, setStarts] = useState(initialMap?.starts || []);
  const [brush, setBrush] = useState<MapBrush>("path");
  const [monster, setMonster] = useState("Mossling");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function paint(x: number, y: number) {
    const id = `1-${x}-${y}`;
    if (brush === "erase") {
      setTiles((current) => current.filter((tile) => tile.id !== id));
      setStarts((current) => current.filter((start) => start !== id));
      return;
    }
    const kind: MapTile["kind"] = brush === "start" || brush === "path" || brush === "monster" ? "corridor" : brush === "chest" ? "treasure" : brush;
    const enemy = brush === "monster" ? monster : undefined;
    const tile: MapTile = { id, x, y, kind, name: enemy ? `${enemy} Den` : kind === "treasure" ? "Forgotten Chest" : kind === "key" ? "Key Chamber" : kind === "exit" ? "Stairway" : kind === "trap" ? "Hidden Trap" : "Stone Passage", ...(enemy ? { enemy } : {}) };
    setTiles((current) => {
      const withoutSingleObjective = kind === "key" || kind === "exit" ? current.filter((existing) => existing.kind !== kind || existing.id === id) : current;
      return [...withoutSingleObjective.filter((existing) => existing.id !== id), tile];
    });
    if (brush === "start") setStarts((current) => [...new Set([...current.filter((start) => start !== id), id])]);
    else setStarts((current) => current.filter((start) => start !== id));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ ...(initialMap ? { id: initialMap.id } : {}), name, tiles, starts });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this map.");
    } finally { setSaving(false); }
  }

  function tileMarker(tile: MapTile | undefined): MapMarkerKind | null {
    if (!tile) return null;
    if (tile.enemy) return "monster";
    if (starts.includes(tile.id)) return "start";
    if (tile.kind === "treasure") return "chest";
    if (tile.kind === "key") return "key";
    if (tile.kind === "exit") return "exit";
    if (tile.kind === "trap") return "trap";
    return null;
  }

  return <section className="map-editor">
    <header className="topbar"><Brand /><button className="text-button" onClick={onClose}>← Back to start</button></header>
    <form className="map-editor-content" onSubmit={save}>
      <div className="board-title"><div><p className="eyebrow">Dungeon workshop · 13 × 13</p><h1>Design your map</h1></div><Map /></div>
      <label className="map-name-field">Map name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required placeholder="e.g. The Crystal Caverns" /></label>
      <div className="map-tools" aria-label="Map tile brush">
        {MAP_BRUSHES.map((item) => <button type="button" key={item.id} className={brush === item.id ? "selected" : ""} aria-pressed={brush === item.id} onClick={() => setBrush(item.id)}><span>{item.id === "erase" ? <X aria-hidden="true" /> : <MapMarker kind={item.id} />}</span>{item.label}</button>)}
        {brush === "monster" && <label className="monster-choice">Monster<select value={monster} onChange={(event) => setMonster(event.target.value)}>{Object.keys(MONSTER_ICONS).map((name) => <option key={name}>{name}</option>)}</select></label>}
      </div>
      <div className="map-editor-card">
        <div className="map-caption"><span>Selected tool: {MAP_BRUSHES.find((item) => item.id === brush)?.label}</span><span>{tiles.length} tiles</span></div>
        <div className="map-editor-grid" role="grid" aria-label="Editable dungeon map">
          {Array.from({ length: MAP_SIZE * MAP_SIZE }, (_, index) => {
            const x = index % MAP_SIZE;
            const y = Math.floor(index / MAP_SIZE);
            const tile = tiles.find((candidate) => candidate.x === x && candidate.y === y);
            const marker = tileMarker(tile);
            return <button type="button" key={`${x}-${y}`} role="gridcell" className={`map-editor-tile ${tile ? `tile-${tile?.enemy ? "monster" : starts.includes(tile.id) ? "entrance" : tile.kind}` : "tile-empty"}`} aria-label={`${tile?.name || "Empty"} at column ${x + 1}, row ${y + 1}`} title={tile?.name || "Empty"} onClick={() => paint(x, y)}>{marker && <MapMarker kind={marker} />}</button>;
          })}
        </div>
        <div className="map-legend"><span><MapMarker kind="start" /> Start</span><span><MapMarker kind="monster" /> Monster</span><span><MapMarker kind="chest" /> Chest</span><span><MapMarker kind="key" /> Key</span><span><MapMarker kind="trap" /> Trap</span><span><MapMarker kind="exit" /> Exit</span></div>
      </div>
      <p className="muted map-editor-help">Every path tile is walkable: connect one-wide paths and use groups of 6 path tiles to shape rectangular rooms. Place a start, one key, and one exit on the path; add monsters, chests, and traps to their own tiles. Your saved map becomes floor 1; floors 2 and 3 stay procedurally generated.</p>
      {error && <p className="error">{error}</p>}
      <div className="map-editor-actions"><button type="button" className="text-button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : initialMap ? "Save changes" : "Save map"}<ChevronRight /></button></div>
    </form>
  </section>;
}

function ExpeditionBoard({ game, onAction, error, busy }: { game: GameState; onAction: (action: string) => void; error: string; busy: boolean }) {
  const [qr, setQr] = useState("");
  const [tab, setTab] = useState<Tab>("map");
  const [creatureBook, setCreatureBook] = useState<"bestiary" | "bounties" | null>(null);
  const closeCreatureBook = useCallback(() => setCreatureBook(null), []);
  const [mapFloor, setMapFloor] = useState(1);
  const joinUrl = useMemo(() => typeof window === "undefined" ? "" : `${window.location.origin}/?room=${game.code}`, [game.code]);
  useEffect(() => { if (joinUrl) QRCode.toDataURL(joinUrl, { width: 280, margin: 1, color: { dark: "#19172a", light: "#ffffff" } }).then(setQr); }, [joinUrl]);
  const link = <button className="text-button" onClick={() => navigator.clipboard?.writeText(joinUrl)}><Copy /> Copy join link</button>;
  return <section className={`host-screen ${game.phase === "lobby" ? "host-lobby-screen" : "host-board-screen"}`}>
    <header className="topbar"><Brand /><span className="floor-chip">{game.phase === "lobby" ? "Party lobby" : game.phase === "complete" ? "Quest complete" : "Dungeon control"}</span><span className="room-chip">ROOM <b>{game.code}</b></span></header>
    {game.phase === "lobby" ? <div className="host-lobby">
      <article className="join-card"><p className="eyebrow">Ready your groups</p><h1>Join the expedition</h1><p className="muted">Scan on up to four devices or tabs. Each group can create up to four heroes.</p><div className="qr-box">{qr ? <Image src={qr} alt="QR code to join this expedition" width={260} height={260} unoptimized /> : <span>Making code…</span>}</div><p className="room-code">ROOM CODE <strong>{game.code}</strong></p>{link}</article>
      <article className="party-card"><div className="section-heading"><div><p className="eyebrow">Adventuring groups</p><h2>{game.groups.length}/{MAX_GROUPS} joined</h2></div><Users /></div>
        {game.groups.length ? <div className="group-list">{game.groups.map((group) => <GroupSummary key={group.id} group={group} />)}</div> : <div className="empty-state"><span>✧</span><p>Your party will appear here as groups join.</p></div>}
        <div className="host-actions"><p>Share the code with up to four groups. Each group can have up to four heroes.</p><button className="primary" onClick={() => onAction("start")} disabled={busy || !game.groups.length}>Enter the dungeon<ChevronRight /></button></div>
      </article>
    </div> : <div className="central-layout">
      <section className="central-main">
        <div className="board-title"><div><p className="eyebrow">{game.phase === "complete" ? "Quest complete" : "All parties · shared discoveries"}</p><h1>{game.phase === "complete" ? "The dungeon is clear!" : game.floors.find((floor) => floor.number === mapFloor)?.name || "The Sunken Halls"}</h1></div></div>
        {game.phase === "complete" ? <div className="complete-panel"><span>🏆</span><h2>Expedition complete</h2><p>All parties have escaped or been defeated. The expedition earned {game.groups.reduce((sum, group) => sum + group.stats.gold, 0)} gold.</p><button className="primary" onClick={() => onAction("reset")} disabled={busy}><RotateCcw /> New expedition</button></div> : <>
          <div className="floor-picker" aria-label="Select a floor overview">{game.floors.map((floor) => <button key={floor.number} className={mapFloor === floor.number ? "selected" : ""} onClick={() => setMapFloor(floor.number)}>FLOOR {floor.number}</button>)}</div>
          {game.floors.find((floor) => floor.keyFound) && <div className="key-found-banner"><KeyRound /> Floor {game.floors.find((floor) => floor.keyFound)?.number} key found! The stairway is unlocked.</div>}
          <DungeonMap game={game} floorNumber={mapFloor} />
        </>}
        <div className="tab-bar" role="tablist" aria-label="Dungeon information">{tabOptions.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={id === "bestiary" || id === "bounties" ? creatureBook === id : tab === id} className={id === "bestiary" || id === "bounties" ? creatureBook === id ? "active" : "" : tab === id ? "active" : ""} onClick={() => {
          if (id === "bestiary" || id === "bounties") {
            setTab("map");
            setCreatureBook(id);
          } else setTab(id);
        }}><Icon />{label}</button>)}</div>
        <InfoPanel game={game} tab={tab} />
      </section>
      <aside className="board-sidebar">
        <div><p className="eyebrow">Party status · {game.groups.length}</p><div className="group-list compact">{game.groups.map((group) => <GroupSummary key={group.id} group={group} />)}</div></div>
        <div className="host-battles"><p className="eyebrow">Active encounters · {Object.keys(game.battles).length}</p>{game.groups.filter((group) => game.battles[group.id]).map((group) => <BattleCard key={group.id} game={game} group={group} onAction={onAction} host />)}{!Object.keys(game.battles).length && <p className="muted">No parties are in battle.</p>}</div>
        <DiceRolls game={game} />
        <div className="feed-panel"><p className="eyebrow">Expedition log</p>{game.feed.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}</div>
        <button className="text-button danger" onClick={() => onAction("reset")} disabled={busy}><RotateCcw /> Return to lobby</button>
      </aside>
      {error && <p className="floating-error error">{error}</p>}
    </div>}
    {creatureBook && typeof document !== "undefined" && createPortal(<CreatureBook entries={game.bestiary} mode={creatureBook} onClose={closeCreatureBook} />, document.body)}
  </section>;
}

const tabOptions: { id: Tab; label: string; icon: typeof Map }[] = [
  { id: "map", label: "Map", icon: Map }, { id: "bestiary", label: "Bestiary", icon: BookOpen }, { id: "items", label: "Items", icon: Package }, { id: "bounties", label: "Bounties", icon: ScrollText },
];

function DungeonMap({ game, floorNumber, groupId, onMove }: { game: GameState; floorNumber: number; groupId?: string; onMove?: (tile: string) => void }) {
  const floor = game.floors.find((candidate) => candidate.number === floorNumber);
  const activeGroup = game.groups.find((group) => group.id === groupId);
  const battle = activeGroup ? game.battles[activeGroup.id] : undefined;
  if (!floor) return <div className="map-card"><p>This floor is not available.</p></div>;
  return <div className={`map-card ${onMove ? "group-map" : "host-map"}`}><div className="map-caption"><span><Map /> {onMove ? "Tap a neighboring tile to explore" : "Shared map · room details reveal on entry"}</span><span>FLOOR {floor.number}{floor.keyFound ? " · KEY FOUND" : ""}</span></div>
    <div className="dungeon-map" role="grid" aria-label={`Dungeon map floor ${floor.number}`} style={{ gridTemplateColumns: `repeat(${MAP_SIZE}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${MAP_SIZE}, minmax(0, 1fr))` }}>{floor.tiles.map((tile) => {
      const visible = tile.kind !== "hidden";
      const at = game.groups.filter((group) => group.stats.floor === floor.number && group.stats.x === tile.x && group.stats.y === tile.y);
      const adjacent = !!activeGroup && activeGroup.stats.floor === floor.number && Math.abs(tile.x - activeGroup.stats.x) + Math.abs(tile.y - activeGroup.stats.y) === 1;
      const canMove = !!onMove && adjacent && !battle && game.phase === "exploration" && !!activeGroup && activeGroup.stats.hp > 0 && !activeGroup.gameOver;
      const marker: MapMarkerKind | null = !visible ? null : tile.enemy ? (floor.defeated.includes(tile.id) ? "corpse" : "monster") : tile.kind === "entrance" ? "start" : tile.kind === "treasure" ? "chest" : tile.kind === "key" ? "key" : tile.kind === "exit" ? "exit" : tile.kind === "trap" ? "trap" : null;
      const cleared = visible && (floor.defeated.includes(tile.id) || floor.defeated.includes(`looted-${tile.id}`) || (tile.kind === "key" && floor.keyFound));
      return <button key={tile.id} role="gridcell" disabled={!canMove} onClick={() => onMove?.(tile.id)} className={`map-tile ${visible ? `tile-${tile.kind}` : "tile-hidden"} ${adjacent && onMove ? "tile-adjacent" : ""} ${at.length ? "tile-occupied" : ""} ${cleared ? "tile-cleared" : ""}`} style={{ gridColumn: tile.x + 1, gridRow: tile.y + 1 }} aria-label={visible ? `${tile.name}${tile.enemy ? floor.defeated.includes(tile.id) ? ", defeated monster" : ", monster" : ""}${cleared ? ", completed" : ""}` : "Unknown dungeon tile"} title={visible ? tile.name : "Unexplored"}>
        <span className={`tile-icon ${tile.enemy && floor.defeated.includes(tile.id) ? "tile-icon-corpse" : ""}`}>{marker && <MapMarker kind={marker} />}</span>
        {at.length > 0 && <span className="tile-groups">{at.map((group) => <PixelSprite key={group.id} characterClass={group.characterClass} color={group.stats.spriteColor} trimColor={group.characters[0]?.trimColor} colors={group.characters[0]?.partColors} appearance={group.characters[0]?.appearance} />)}</span>}
        {cleared && !(tile.enemy && floor.defeated.includes(tile.id)) && <span className="tile-cross" aria-hidden="true"><X /></span>}
      </button>;
    })}</div>
    <div className="map-legend"><span><MapMarker kind="chest" /> Treasure</span><span><MapMarker kind="monster" /> Encounter</span><span><MapMarker kind="key" /> Key</span><span><MapMarker kind="trap" /> Trap</span><span><MapMarker kind="exit" /> Stairs</span><span><PixelSprite characterClass="Warrior" color="#e85d4a" /> Party</span></div>
  </div>;
}

function PlayerMinimap({ floor, group, facing }: { floor: FloorMap; group: Group; facing: string }) {
  const tileSize = 12;
  const facingAngle = facing === "East" ? 90 : facing === "South" ? 180 : facing === "West" ? 270 : 0;
  return <section className="player-minimap" aria-label="Exploration minimap">
    <div className="player-minimap-heading"><Map aria-hidden="true" /><strong>MINIMAP</strong><span>F{floor.number}</span></div>
    <svg className="player-minimap-grid" viewBox={`0 0 ${MAP_SIZE * tileSize} ${MAP_SIZE * tileSize}`} role="img" aria-label={`Revealed map, facing ${facing}`}>
      <rect width={MAP_SIZE * tileSize} height={MAP_SIZE * tileSize} rx="3" className="minimap-background" />
      {floor.tiles.map((tile) => {
        const visible = tile.kind !== "hidden";
        const marker: MapMarkerKind | null = !visible ? null : tile.enemy ? (floor.defeated.includes(tile.id) ? "corpse" : "monster") : tile.kind === "entrance" ? "start" : tile.kind === "treasure" ? "chest" : tile.kind === "key" ? "key" : tile.kind === "exit" ? "exit" : tile.kind === "trap" ? "trap" : null;
        const cleared = visible && (floor.defeated.includes(tile.id)
          || floor.defeated.includes(`looted-${tile.id}`)
          || floor.defeated.includes(`trap-${tile.id}-${group.id}`)
          || (tile.kind === "key" && floor.keyFound));
        const x = tile.x * tileSize;
        const y = tile.y * tileSize;
        return <g key={tile.id} className={`minimap-tile ${visible ? `minimap-${tile.kind}` : "minimap-unseen"}`}>
          <rect x={x + 0.5} y={y + 0.5} width={tileSize - 1} height={tileSize - 1} rx="1" />
          {marker && <circle className={`minimap-marker minimap-marker-${marker}`} cx={x + tileSize / 2} cy={y + tileSize / 2} r="2.1" />}
          {cleared && !(tile.enemy && floor.defeated.includes(tile.id)) && <path className="minimap-cleared" d={`M${x + 2} ${y + 2}l6 6m0-6l-6 6`} />}
        </g>;
      })}
      <g className="minimap-player" transform={`translate(${(group.stats.x + 0.5) * tileSize} ${(group.stats.y + 0.5) * tileSize})`}>
        <circle r="5.2" />
        <path d="M0-11L-4-5L0-6.5L4-5Z" transform={`rotate(${facingAngle})`} />
      </g>
    </svg>
    <div className="player-minimap-status"><span>{group.stats.x + 1},{group.stats.y + 1}</span><span>Facing {facing}</span></div>
  </section>;
}

const MOVEMENT_DIRECTIONS = [
  { dx: 0, dy: -1, name: "North", icon: ChevronUp, position: "north" },
  { dx: 1, dy: 0, name: "East", icon: ChevronRight, position: "east" },
  { dx: 0, dy: 1, name: "South", icon: ChevronDown, position: "south" },
  { dx: -1, dy: 0, name: "West", icon: ChevronLeft, position: "west" },
];

function FirstPersonExplore({ game, group, floor, onMove, onFacingChange, error }: { game: GameState; group: Group; floor: FloorMap | undefined; onMove: (tile: string) => Promise<boolean>; onFacingChange: (facing: string) => void; error: string }) {
  const [facing, setFacing] = useState(() => MOVEMENT_DIRECTIONS.find((direction) =>
    floor?.tiles.some((tile) => tile.x === group.stats.x + direction.dx && tile.y === group.stats.y + direction.dy)) || MOVEMENT_DIRECTIONS[3]);
  const [mapOpen, setMapOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [lastAction, setLastAction] = useState("Ready to explore");
  const [motion, setMotion] = useState<{ kind: "forward" | "backward" | "turn-left" | "turn-right"; id: number } | null>(null);
  const [arrivalTile, setArrivalTile] = useState<Tile | null>(null);
  const motionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movementLock = useRef(false);
  useEffect(() => () => {
    if (motionTimer.current) clearTimeout(motionTimer.current);
  }, []);
  useEffect(() => onFacingChange(facing.name), [facing.name, onFacingChange]);
  if (!floor) return <div className="first-person-explore"><p>This floor is not available.</p></div>;
  const facingIndex = MOVEMENT_DIRECTIONS.findIndex((direction) => direction.name === facing.name);
  const reverseFacing = MOVEMENT_DIRECTIONS[(facingIndex + 2) % MOVEMENT_DIRECTIONS.length];
  const leftFacing = MOVEMENT_DIRECTIONS[(facingIndex + MOVEMENT_DIRECTIONS.length - 1) % MOVEMENT_DIRECTIONS.length];
  const rightFacing = MOVEMENT_DIRECTIONS[(facingIndex + 1) % MOVEMENT_DIRECTIONS.length];
  const target = floor.tiles.find((tile) =>
    tile.x === group.stats.x + facing.dx && tile.y === group.stats.y + facing.dy);
  const currentTile = floor.tiles.find((tile) =>
    tile.x === group.stats.x && tile.y === group.stats.y);
  const currentEncounter = currentTile && (
    (currentTile.enemy && game.battles[group.id]?.tileId === currentTile.id)
    || (currentTile.kind === "treasure" && floor.defeated.includes(`looted-${currentTile.id}`))
    || (currentTile.kind === "trap" && floor.defeated.includes(`trap-${currentTile.id}-${group.id}`))
    || (currentTile.kind === "key" && floor.keyFound)
    || (currentTile.kind === "exit" && floor.keyFound)
  ) ? currentTile : undefined;
  const isDefeatedMonster = (tile: Tile | null | undefined) => !!tile?.enemy && floor.defeated.includes(tile.id);
  const leftOpening = floor.tiles.some((tile) =>
    tile.x === group.stats.x + leftFacing.dx && tile.y === group.stats.y + leftFacing.dy);
  const rightOpening = floor.tiles.some((tile) =>
    tile.x === group.stats.x + rightFacing.dx && tile.y === group.stats.y + rightFacing.dy);
  const connections = floor.tiles.filter((tile) =>
    Math.abs(tile.x - group.stats.x) + Math.abs(tile.y - group.stats.y) === 1);
  const environment = currentTile?.kind === "room"
    ? "chamber"
    : connections.length <= 1 ? "dead-end" : connections.length >= 3 ? "junction" : "hallway";
  const environmentLabel = environment === "chamber" ? "Open chamber"
    : environment === "junction" ? "Dungeon junction"
      : environment === "dead-end" ? "Dead end" : "Narrow hallway";
  const targetVisible = target && target.kind !== "hidden";
  const targetCleared = !!target && (floor.defeated.includes(target.id)
    || floor.defeated.includes(`looted-${target.id}`)
    || floor.defeated.includes(`trap-${target.id}-${group.id}`)
    || (target.kind === "key" && floor.keyFound));
  const arrivalVisible = arrivalTile && !isDefeatedMonster(arrivalTile) && (arrivalTile.enemy || ["treasure", "trap", "key", "exit"].includes(arrivalTile.kind));
  const corpseTile = [arrivalTile, currentTile, target].find(isDefeatedMonster);
  const sceneTile = currentEncounter || (arrivalVisible ? arrivalTile : corpseTile || (targetVisible && !targetCleared ? target : undefined));
  const showingEncounter = !!currentEncounter || !!arrivalVisible;
  const sceneKind = isDefeatedMonster(sceneTile) ? "corpse" : sceneTile?.enemy ? "monster" : sceneTile?.kind === "treasure" ? "chest" : sceneTile?.kind || "";
  const sceneMonster = sceneTile?.enemy ? game.bestiary.find((monster) => monster.name === sceneTile.enemy) : undefined;
  const blocked = !!game.battles[group.id] || group.stats.hp <= 0 || group.gameOver || game.phase !== "exploration" || moving || movementLock.current;

  function playMotion(kind: "forward" | "backward" | "turn-left" | "turn-right") {
    if (motionTimer.current) clearTimeout(motionTimer.current);
    setMotion({ kind, id: Date.now() });
    motionTimer.current = setTimeout(() => setMotion(null), kind === "forward" || kind === "backward" ? 620 : 520);
  }

  async function move(direction: typeof MOVEMENT_DIRECTIONS[number], keepFacing = false) {
    if (!floor) return;
    const tile = floor.tiles.find((candidate) =>
      candidate.x === group.stats.x + direction.dx && candidate.y === group.stats.y + direction.dy);
    if (!tile || blocked) return;
    await moveTo(tile, keepFacing ? undefined : direction, keepFacing);
  }

  async function moveTo(tile: Tile, direction?: typeof MOVEMENT_DIRECTIONS[number], backward = false): Promise<boolean> {
    if (blocked || movementLock.current) return false;
    movementLock.current = true;
    setArrivalTile(null);
    if (direction) setFacing(direction);
    const movementLabel = backward ? `Moving backward · facing ${facing.name}` : `Moving forward · facing ${direction?.name || facing.name}`;
    setLastAction(movementLabel);
    playMotion(backward ? "backward" : "forward");
    setMoving(true);
    try {
      const moved = await onMove(tile.id);
      setLastAction(moved
        ? `${backward ? "Moved backward" : "Moved forward"} · facing ${backward ? facing.name : direction?.name || facing.name}`
        : `Could not move · facing ${facing.name}`);
      if (moved && (tile.enemy || ["treasure", "trap", "key", "exit"].includes(tile.kind))) setArrivalTile(tile);
      return moved;
    } finally {
      movementLock.current = false;
      setMoving(false);
    }
  }

  function turn(amount: number) {
    if (blocked) return;
    setArrivalTile(null);
    const nextFacing = MOVEMENT_DIRECTIONS[(facingIndex + amount + MOVEMENT_DIRECTIONS.length) % MOVEMENT_DIRECTIONS.length];
    playMotion(amount < 0 ? "turn-left" : "turn-right");
    setFacing(nextFacing);
    setLastAction(`Turned ${amount < 0 ? "left" : "right"} · facing ${nextFacing.name}`);
  }

  return <section className="first-person-explore" aria-label="First-person dungeon exploration">
    <div className="first-person-heading">
      <span><strong>FLOOR {floor.number}</strong><small>{floor.name || "The dungeon"} · Facing {facing.name}</small></span>
      <button className="text-button first-person-map-button" onClick={() => setMapOpen(true)}><Map /> View map</button>
    </div>
    <div className={`dungeon-view environment-${environment} ${motion ? `motion-${motion.kind}` : ""}`} role="img" aria-label={`${environmentLabel}. ${sceneTile?.name || (targetVisible ? target?.name : "Dark dungeon passage")} ahead`}>
      <div key={motion?.id ?? "still"} className="dungeon-view-motion">
      <div className="navigation-status" aria-live="polite"><span>{environmentLabel}</span><strong>{lastAction}</strong><b>Facing {facing.name}</b></div>
      <svg className="dungeon-view-scene" viewBox="0 0 800 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="dungeon-stone" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#526557" /><stop offset="1" stopColor="#293a32" />
          </linearGradient>
          <linearGradient id="dungeon-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#37473c" /><stop offset="1" stopColor="#1b2923" />
          </linearGradient>
        </defs>
        <rect width="800" height="420" fill="#0e1513" />
        <path d="M0 0H800L555 115H245Z" fill="#202b26" />
        <path d="M0 420H800L555 305H245Z" fill="url(#dungeon-ground)" />
        <path d="M0 0L245 115V305L0 420Z" fill="url(#dungeon-stone)" />
        <path d="M800 0L555 115V305L800 420Z" fill="#35473d" />
        <path d="M245 115H555V305H245Z" fill="#121b17" stroke="#66745b" strokeWidth="8" />
        <path d="M0 0L245 115M800 0L555 115M0 420L245 305M800 420L555 305" stroke="#78836a" strokeWidth="4" />
        <path d="M0 70L245 143M0 140L245 170M0 210H245M0 280L245 250M0 350L245 278M800 70L555 143M800 140L555 170M800 210H555M800 280L555 250M800 350L555 278" stroke="#26372f" strokeWidth="5" />
        <path d="M80 24L270 126M160 12L298 126M240 5L326 126M320 2L356 126M720 24L530 126M640 12L502 126M560 5L474 126M480 2L444 126" stroke="#415349" strokeWidth="3" />
        <path d="M80 396L270 294M160 408L298 294M240 415L326 294M320 418L356 294M720 396L530 294M640 408L502 294M560 415L474 294M480 418L444 294" stroke="#2b3e32" strokeWidth="3" />
        <path d="M52 0L67 30L59 42L78 69M734 0L719 26L728 45L709 67M182 0L194 24L186 41M618 0L605 21L613 39" fill="none" stroke="#65765a" strokeWidth="5" strokeLinecap="round" opacity=".8" />
        <path d="M0 178L22 168L31 183L49 174M800 171L779 162L770 178L751 168M0 330L26 319L35 335M800 325L776 312L766 328" fill="none" stroke="#80906a" strokeWidth="7" strokeLinecap="round" opacity=".75" />
        <path d="M104 87l9-8 7 5 9-12M696 88l-9-8-7 5-9-12M208 355l11-5 5 8 13-6M592 355l-11-5-5 8-13-6" fill="none" stroke="#354637" strokeWidth="4" strokeLinecap="round" />
        {environment === "hallway" && <>
          <path d="M0 28L67 24L82 42L0 51M800 30L733 24L718 43L800 53" fill="#56634a" opacity=".8" />
          <path d="M36 378l34-18 18 15-18 18ZM740 377l27-17 17 14-16 20Z" fill="#71805c" stroke="#29382d" strokeWidth="4" />
          <path d="M104 152l10 6m-6 7l8 5M694 151l-10 7m6 7l-8 5" stroke="#d5bb68" strokeWidth="3" opacity=".85" />
        </>}
        {environment === "junction" && <>
          <path d="M124 102L154 94L167 103L158 116L131 118ZM676 102L646 94L633 103L642 116L669 118Z" fill="#526146" stroke="#9b9565" strokeWidth="3" />
          <path d="M80 292q24-22 48 0M720 292q-24-22-48 0" fill="none" stroke="#9b8351" strokeWidth="5" opacity=".8" />
          <circle cx="106" cy="300" r="5" fill="#e4a45c" /><circle cx="694" cy="300" r="5" fill="#e4a45c" />
        </>}
        {environment === "dead-end" && <>
          <path d="M272 122L285 113L298 124L294 143L276 144ZM528 122L515 113L502 124L506 143L524 144Z" fill="#8b7852" stroke="#303d31" strokeWidth="4" />
          <path d="M320 110l12 7-8 8m144-15l-12 7 8 8" fill="none" stroke="#b78c5b" strokeWidth="3" />
        </>}
        {environment === "chamber" && <>
          <path d="M115 259l12-24 12 24M661 259l12-24 12 24" fill="#42533e" stroke="#9b9565" strokeWidth="3" />
          <path d="M111 263h34M657 263h34" stroke="#d4ad5d" strokeWidth="4" />
          <circle cx="128" cy="251" r="18" fill="#e6c478" opacity=".1" /><circle cx="674" cy="251" r="18" fill="#e6c478" opacity=".1" />
        </>}
        <path d="M280 132H520V288H280Z" fill="#202b26" stroke="#7b815e" strokeWidth="9" />
        <path d="M330 153H470V267H330Z" fill="#151e1a" stroke="#465849" strokeWidth="6" />
        <path d="M365 171H435V249H365Z" fill="#0b100e" stroke="#303c33" strokeWidth="5" />
        <path d="M280 180H520M280 235H520M330 192H470M330 228H470M365 197H435M365 223H435" stroke="#344238" strokeWidth="4" />
        {environment === "chamber" && <>
          <path d="M255 145L275 132L295 145V293L255 304ZM545 145L525 132L505 145V293L545 304Z" fill="#26372d" stroke="#8b805c" strokeWidth="5" />
          <path d="M263 155V290M537 155V290" stroke="#a39468" strokeWidth="3" opacity=".7" />
        </>}
        {environment === "junction" && <path d="M385 285H415M391 294H409" stroke="#d5bd75" strokeWidth="4" opacity=".75" />}
        {!target && <path d="M348 185L452 238M452 185L348 238" stroke="#a06e4d" strokeWidth="10" opacity=".8" />}
        {leftOpening && <>
          <path d="M18 157L57 137L97 155V292L18 321Z" fill="#111914" stroke="#b08c50" strokeWidth="5" />
          <path d="M29 166L61 150L86 163V281L29 302Z" fill="#080d0b" />
          <path d="M18 157L57 137L97 155M18 321L97 292" fill="none" stroke="#6b7958" strokeWidth="7" />
          <path d="M27 239H91" stroke="#77805d" strokeWidth="3" opacity=".65" />
        </>}
        {rightOpening && <>
          <path d="M782 157L743 137L703 155V292L782 321Z" fill="#111914" stroke="#b08c50" strokeWidth="5" />
          <path d="M771 166L739 150L714 163V281L771 302Z" fill="#080d0b" />
          <path d="M782 157L743 137L703 155M782 321L703 292" fill="none" stroke="#6b7958" strokeWidth="7" />
          <path d="M773 239H709" stroke="#77805d" strokeWidth="3" opacity=".65" />
        </>}
        <path d="M128 121L140 99L152 121M648 121L660 99L672 121" fill="#d4ae61" stroke="#76623d" strokeWidth="4" />
        <circle cx="140" cy="118" r="22" fill="#e6c478" opacity=".12" /><circle cx="660" cy="118" r="22" fill="#e6c478" opacity=".12" />
        <path d="M400 0V114M0 210H245M555 210H800" stroke="#a9a17a" strokeWidth="2" opacity=".28" />
        {sceneKind === "chest" && <g className="corridor-object corridor-chest" transform="translate(400 275) scale(1.45)">
          <ellipse cx="0" cy="27" rx="45" ry="10" fill="#050806" opacity=".7" />
          <path d="M-35 0H35V25H-35Z" fill="#754720" stroke="#e0ad55" strokeWidth="4" />
          <path d="M-35 0Q-35-18-18-18H18Q35-18 35 0Z" fill="#a86c2e" stroke="#f1ca6b" strokeWidth="4" />
          <path d="M-5-16V24M-35 7H35" stroke="#e0ad55" strokeWidth="5" />
          <path d="M-7-2H7V8H-7Z" fill="#f2d878" stroke="#754720" strokeWidth="2" />
          <path d="M-23-18Q0-37 23-18" fill="none" stroke="#ffe68a" strokeWidth="3" opacity=".8" />
        </g>}
        {sceneKind === "trap" && <g className="corridor-object corridor-trap" transform="translate(400 282) scale(1.35)">
          <ellipse cx="0" cy="15" rx="58" ry="16" fill="#080c0a" stroke="#dc8958" strokeWidth="5" />
          <ellipse cx="0" cy="15" rx="38" ry="9" fill="#202a25" stroke="#87563e" strokeWidth="3" />
          <path d="M-39 6L-29-19L-19 7M-14 2L0-27L13 4M16 6L31-18L39 10" fill="#d0c5a0" stroke="#614d3b" strokeWidth="4" strokeLinejoin="round" />
          <path d="M-52 13H52M0-31V-43M-47-8L-56-16M47-8L56-16" stroke="#efaa6b" strokeWidth="3" opacity=".9" />
        </g>}
        {sceneKind === "monster" && <g className="corridor-object corridor-monster" transform="translate(400 274) scale(1.35)">
          {sceneMonster?.appearance
            ? <svg x="-34" y="-63" width="68" height="78" viewBox="0 0 48 48"><MonsterSprite monster={sceneMonster} /></svg>
            : <>
              <ellipse cx="0" cy="23" rx="41" ry="11" fill="#050806" opacity=".75" />
              <path d="M-31 10L-37-17L-18-9L0-25L19-9L37-17L31 11L21 22H-21Z" fill="#7b493c" stroke="#e29665" strokeWidth="4" strokeLinejoin="round" />
              <path d="M-19-3L-11 3L-17 9M19-3L11 3L17 9" fill="#ffe17a" stroke="#211713" strokeWidth="3" strokeLinejoin="round" />
              <path d="M-9 17H9M-27-13L-23-30L-10-13M27-13L23-30L10-13" fill="#a65a43" stroke="#e29665" strokeWidth="3" strokeLinejoin="round" />
              <path d="M-40-5L-52-15M40-5L52-15" stroke="#c27657" strokeWidth="5" strokeLinecap="round" />
              <path d="M-8 16L-12 23M8 16L12 23" stroke="#f0dbb6" strokeWidth="3" />
            </>}
        </g>}
        {sceneKind === "corpse" && <g className="corridor-object corridor-corpse" transform="translate(400 293) rotate(-12) scale(1.5)">
          <ellipse cx="0" cy="18" rx="53" ry="11" fill="#050806" opacity=".8" />
          <path d="M-43 10L-34-1L-20 1L-10-6L7-3L18-9L38-2L45 8L31 17L8 14L-13 19L-34 16Z" fill="#493c35" stroke="#968273" strokeWidth="4" strokeLinejoin="round" />
          <path d="M-29 0L-35-15L-20-9L-13 2M28 0L36-14L20-8L14 3" fill="#564740" stroke="#867565" strokeWidth="3" />
          <path d="M-8 0l7 4m1-4l-7 4M23 3l4 4m0-4l-4 4" stroke="#b7a995" strokeWidth="2" />
          <path d="M-49 13L-32 8M-42 19L-27 15M35 13L49 8" stroke="#713d35" strokeWidth="4" opacity=".9" />
          <path d="M-5 4L2 10" stroke="#d1c4a7" strokeWidth="2" />
        </g>}
        {sceneKind === "key" && <g className="corridor-object corridor-key" transform="translate(400 270) scale(1.25)">
          <ellipse cx="0" cy="30" rx="28" ry="9" fill="#060907" opacity=".7" />
          <circle cx="0" cy="-3" r="19" fill="#d9b84d" stroke="#fff0a0" strokeWidth="5" />
          <circle cx="0" cy="-3" r="7" fill="#273329" />
          <path d="M0 15V39M0 29H12M0 36H9" stroke="#e5c75e" strokeWidth="7" strokeLinecap="square" />
        </g>}
        {sceneKind === "exit" && <g className="corridor-object corridor-exit" transform="translate(400 272) scale(1.25)">
          <path d="M-24 33V-25H22V33M-33 34H31" fill="#121a15" stroke="#dfc46d" strokeWidth="6" />
          <path d="M-14 30V-15H12V30Z" fill="#403c2b" stroke="#827b50" strokeWidth="3" />
          <circle cx="7" cy="8" r="2.5" fill="#ffe48c" />
          <path d="M-7-4H4M-2-10L4-4L-2 2" fill="none" stroke="#e7d387" strokeWidth="3" />
        </g>}
      </svg>
      <div className="dungeon-view-vignette" aria-hidden="true" />
      <div className="dungeon-view-caption">
        <span>{corpseTile ? `${corpseTile.name || "Monster"} · defeated` : arrivalVisible ? arrivalTile?.name : !target ? "A solid wall blocks this way" : targetVisible ? target?.name : "The passage disappears into darkness"}</span>
        {corpseTile && <small>Defeated monster · path clear</small>}
        {showingEncounter && <small>{sceneKind === "chest" ? "Chest opened" : sceneKind === "trap" ? "Trap triggered" : sceneKind === "key" ? "Key chamber reached" : sceneKind === "exit" ? "Stairway reached" : "Monster encounter"}</small>}
        {!showingEncounter && target?.enemy && !targetCleared && <small>Monster ahead</small>}
        {!showingEncounter && target?.kind === "treasure" && !targetCleared && <small>Treasure ahead</small>}
        {!showingEncounter && target?.kind === "key" && !targetCleared && <small>Key chamber ahead</small>}
        {!showingEncounter && target?.kind === "exit" && !targetCleared && <small>{floor.keyFound ? "Stairs ahead · key found" : "Stairs ahead · key required"}</small>}
        {!showingEncounter && target?.kind === "trap" && !targetCleared && <small>Watch your step</small>}
      </div>
      </div>
    </div>
    <div className="first-person-controls">
      <div className="dpad" aria-label="Dungeon movement controls">
        <button className="dpad-button dpad-north" type="button" aria-label={`Move forward ${facing.name}`} title={`Move forward (${facing.name})`} disabled={!target || blocked} onClick={() => void move(facing)}><ChevronUp aria-hidden="true" /></button>
        <button className="dpad-button dpad-west" type="button" aria-label="Turn left" title="Turn left" disabled={blocked} onClick={() => turn(-1)}><RotateCcw aria-hidden="true" /></button>
        <button className="dpad-button dpad-east" type="button" aria-label="Turn right" title="Turn right" disabled={blocked} onClick={() => turn(1)}><RotateCw aria-hidden="true" /></button>
        <button className="dpad-button dpad-south" type="button" aria-label={`Move backward ${reverseFacing.name}`} title={`Move backward (${reverseFacing.name})`} disabled={!floor.tiles.some((tile) => tile.x === group.stats.x + reverseFacing.dx && tile.y === group.stats.y + reverseFacing.dy) || blocked} onClick={() => void move(reverseFacing, true)}><ChevronDown aria-hidden="true" /></button>
        <span className="dpad-center" aria-hidden="true">✦</span>
      </div>
      <p className="first-person-hint" role={error ? "alert" : undefined}>{error || (moving ? "Moving…" : "▲ forward · ▼ back · ↶ ↷ turn")}</p>
    </div>
    {mapOpen && <div className="player-map-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMapOpen(false); }}>
      <section className="player-map-dialog" role="dialog" aria-modal="true" aria-label={`Dungeon map floor ${floor.number}`}>
        <button className="text-button player-map-close" onClick={() => setMapOpen(false)}><X /> Close map</button>
        <DungeonMap game={game} floorNumber={group.stats.floor} groupId={group.id} onMove={async (tile) => {
          if (movementLock.current) return;
          const destination = floor.tiles.find((candidate) => candidate.id === tile);
          const direction = destination && MOVEMENT_DIRECTIONS.find((candidate) =>
            destination.x === group.stats.x + candidate.dx && destination.y === group.stats.y + candidate.dy);
          setMapOpen(false);
          if (destination) await moveTo(destination, direction);
        }} />
      </section>
    </div>}
  </section>;
}

function GroupSummary({ group }: { group: Group }) {
  const escaped = group.stats.floor > 3;
  return <article className="group-summary"><span className="class-icon"><PixelSprite characterClass={group.characterClass} color={group.stats.spriteColor} trimColor={group.characters[0]?.trimColor} colors={group.characters[0]?.partColors} appearance={group.characters[0]?.appearance} /></span><div className="group-meta"><strong>{group.name}</strong><span>{group.characters.length} heroes · {group.gameOver ? "Game over" : escaped ? "Escaped" : `Floor ${group.stats.floor}`}</span><div className="health-track"><i style={{ width: `${Math.max(0, group.stats.hp / group.stats.maxHp * 100)}%` }} /></div><small>{group.stats.hp}/{group.stats.maxHp} HP · {group.stats.gold} gold · {group.characters.map((hero) => `${hero.name} ${hero.hp}/${hero.maxHp}`).join(" · ")}</small></div></article>;
}

function InfoPanel({ game, tab }: { game: GameState; tab: Tab }) {
  if (tab === "bestiary") return <div className="info-grid">{game.bestiary.map((beast) => <article className="info-card" key={beast.name}><span>{beast.appearance ? <MonsterSprite monster={beast} /> : beast.icon}</span><div><strong>{beast.name}{beast.boss ? " · Boss" : ""}</strong><p>{beast.description}</p><small>Damage {beast.damageMin}–{beast.damageMax} · Speed {beast.speed} · Bounty {beast.bounty} gold</small></div></article>)}</div>;
  if (tab === "items") return <div className="info-grid">{Object.entries(ITEM_LABELS).map(([item, label]) => <article className="info-card" key={item}><span>{item === "potion" ? "🧪" : item === "phoenix-feather" ? "🪶" : "💣"}</span><div><strong>{label}</strong><p>{item === "potion" ? "Restores up to 8 HP to one living hero." : item === "phoenix-feather" ? "Revives one fallen hero at half health." : "Deals 12 damage to a monster during battle."}</p></div></article>)}</div>;
  if (tab === "bounties") return <div className="info-grid">{game.bestiary.map((beast) => <article className="bounty-card" key={beast.name}><span>{beast.appearance ? <MonsterSprite monster={beast} /> : beast.icon} {beast.name}</span><strong>{beast.bounty} <small>gold</small></strong></article>)}</div>;
  return null;
}

function CreatureBook({ entries, mode, onClose }: { entries: BestiaryEntry[]; mode: "bestiary" | "bounties"; onClose: () => void }) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const selectedEntry = entries.find((entry) => entry.name === selectedName);
  const isBountyBook = mode === "bounties";
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  return <div className="bestiary-book-backdrop" onClick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className={`bestiary-book ${isBountyBook ? "bounty-book" : ""}`} role="dialog" aria-modal="true" aria-labelledby="bestiary-book-title">
      <header className="bestiary-book-header">
        <div><p className="eyebrow">Dungeon Delvers field guide</p><h2 id="bestiary-book-title">{selectedEntry ? selectedEntry.name : isBountyBook ? "Bounty Ledger" : "Bestiary"}</h2></div>
        <button className="bestiary-book-close" onClick={onClose} aria-label={`Close ${isBountyBook ? "bounty ledger" : "bestiary"} and return to the game`}><X /> Close</button>
      </header>
      {selectedEntry ? <div className="bestiary-entry-page">
        <button className="bestiary-back-button" onClick={() => setSelectedName(null)}><ChevronLeft /> {isBountyBook ? "All bounties" : "All creatures"}</button>
        <div className="bestiary-entry-art">{selectedEntry.appearance ? <MonsterSprite monster={selectedEntry} /> : <span>{selectedEntry.icon}</span>}</div>
        <div className="bestiary-entry-copy">
          <p className="eyebrow">{isBountyBook ? "Posted reward" : selectedEntry.boss ? "Dungeon boss" : selectedEntry.custom ? "Custom creature" : "Dungeon creature"}</p>
          <h3>{selectedEntry.name}</h3>
          <p className="bestiary-description">{selectedEntry.description}</p>
          {isBountyBook && <p className="bounty-book-reward"><Coins /><strong>{selectedEntry.bounty} gold</strong><span>Reward for defeating this creature</span></p>}
          {!isBountyBook && <div className="bestiary-entry-stats">
            <span><small>Damage</small><strong>{selectedEntry.damageMin}–{selectedEntry.damageMax}</strong></span>
            <span><small>Speed</small><strong>{selectedEntry.speed}</strong></span>
            <span><small>Bounty</small><strong>{selectedEntry.bounty} gold</strong></span>
          </div>}
        </div>
      </div> : <div className="bestiary-book-intro">
        <p>{isBountyBook ? "Select a posted bounty to see the reward and learn about your target. Close the ledger to return to your adventure." : "Select a creature to open its field-guide page. Close the book whenever you’re ready to return to your adventure."}</p>
        <div className="bestiary-index">{entries.map((entry) => <button className="bestiary-index-entry" key={entry.name} onClick={() => setSelectedName(entry.name)}>
          <span className="bestiary-index-art">{entry.appearance ? <MonsterSprite monster={entry} /> : entry.icon}</span>
          <span className="bestiary-index-copy"><strong>{entry.name}{entry.boss ? " · Boss" : ""}</strong><small>{entry.description}</small></span>
          {isBountyBook ? <span className="bounty-index-reward"><Coins />{entry.bounty} <small>gold</small></span> : <ChevronRight aria-hidden="true" />}
        </button>)}</div>
      </div>}
    </section>
  </div>;
}

function DiceRolls({ game, groupId }: { game: GameState; groupId?: string }) {
  const rolls = game.rolls.filter((roll) => !groupId || roll.groupId === groupId).slice(0, 4);
  if (!rolls.length) return null;
  return <section className="dice-rolls" aria-label="Recent dice rolls">{rolls.map((roll) => <article key={roll.id} className={`dice-result ${roll.success ? "success" : "failure"}`}>
    <span className="die-face">{roll.dice.length > 1 ? roll.dice.join(" · ") : roll.dice[0]}<small>d{roll.sides}</small></span>
    <span className="dice-result-text"><strong>{roll.label} · {roll.actor}</strong><small>{roll.label === "Attack damage bonus" ? `d3 ${roll.dice[0]} gives +${roll.total} damage` : roll.sides === 100 ? `${roll.dice.join(" · ")} rolled · hit on ${roll.target} or lower` : `${roll.dice.join(" + ")}${roll.modifier ? ` + ${roll.modifier}` : ""} = ${roll.total} · needed ${roll.target}`}</small></span>
    <b>{roll.label === "Attack damage bonus" ? `+${roll.total}` : roll.sides === 100 && roll.dice.length > 1 ? `${roll.total} HIT${roll.total === 1 ? "" : "S"}` : roll.success ? "SUCCESS" : "MISS"}</b>
  </article>)}</section>;
}

function InventoryPanel({ inventory, onSelect, compact = false, disabled = false }: { inventory: string[]; onSelect: (item: string) => void; compact?: boolean; disabled?: boolean }) {
  const itemCounts = inventory.reduce<Record<string, number>>((counts, item) => {
    counts[item] = (counts[item] || 0) + 1;
    return counts;
  }, {});
  return <section className={`inventory-panel ${compact ? "inventory-panel-compact" : ""}`}>
    <div className="inventory-heading"><h2><Package /> Inventory</h2><span>{inventory.length} carried</span></div>
    {inventory.length ? <div className="inventory-list">{Object.entries(itemCounts).map(([item, count]) => {
      const icon = item === "potion" ? <FlaskConical /> : item === "phoenix-feather" ? <Feather /> : <Bomb />;
      const description = item === "potion" ? "Restore up to 8 HP" : item === "phoenix-feather" ? "Revive a fallen hero" : "Deal 12 battle damage";
      return <button className="inventory-item-card" key={item} disabled={disabled} onClick={() => onSelect(item)} aria-label={`Use ${ITEM_LABELS[item] || item}${count > 1 ? `, ${count} available` : ""}`}>
        <span className="inventory-item-icon">{icon}</span>
        <span className="inventory-item-copy"><strong>{ITEM_LABELS[item] || item}</strong><small>{description}</small></span>
        {count > 1 && <b className="inventory-item-count">×{count}</b>}
      </button>;
    })}</div> : <p className="muted inventory-empty">Your inventory is empty. Explore to find supplies.</p>}
  </section>;
}

function InventoryUseDialog({ item, characters, battleEnemy, inBattle, activeHero, onUse, onClose }: { item: string; characters: Hero[]; battleEnemy?: string; inBattle: boolean; activeHero?: Hero; onUse: (item: string, targetCharacterId?: string) => void; onClose: () => void }) {
  const label = ITEM_LABELS[item] || item;
  const targets = item === "potion"
    ? characters.filter((hero) => hero.hp > 0 && hero.hp < hero.maxHp)
    : item === "phoenix-feather" ? characters.filter((hero) => hero.hp <= 0) : [];
  const usableOnTurn = !inBattle || !!activeHero || item === "phoenix-feather";
  const icon = item === "potion" ? <FlaskConical /> : item === "phoenix-feather" ? <Feather /> : <Bomb />;
  return <div className="inventory-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="inventory-use-dialog" role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title">
      <button className="inventory-dialog-close" onClick={onClose} aria-label="Close item selection"><X /></button>
      <span className="inventory-use-icon">{icon}</span>
      <p className="eyebrow">Choose a target</p>
      <h2 id="inventory-dialog-title">Use {label}</h2>
      {item === "bomb" ? inBattle && activeHero
        ? <button className="inventory-target-card inventory-target-enemy" onClick={() => onUse(item)}><Skull /><span><strong>{battleEnemy}</strong><small>Throw Bomb · deal 12 damage</small></span><ChevronRight /></button>
        : <p className="inventory-dialog-note">{inBattle ? "Wait for an available hero's turn to throw this Bomb." : "Bombs can only be used during a battle."}</p>
        : targets.length ? <div className="inventory-target-list">{targets.map((hero) => {
          const canUse = usableOnTurn && (item !== "potion" || hero.hp < hero.maxHp);
          return <button className="inventory-target-card" key={hero.id} disabled={!canUse} onClick={() => onUse(item, hero.id)}>
            <PixelSprite characterClass={hero.characterClass} color={hero.spriteColor} trimColor={hero.trimColor} colors={hero.partColors} appearance={hero.appearance} />
            <span><strong>{hero.name}</strong><small>{hero.hp <= 0 ? "Fallen · will revive at half HP" : `${hero.hp}/${hero.maxHp} HP · restore up to 8`}</small></span>
            <ChevronRight />
          </button>;
        })}</div> : <p className="inventory-dialog-note">{item === "potion" ? "There are no injured living heroes who need healing." : "There are no fallen heroes to revive."}</p>}
      {inBattle && !activeHero && item !== "phoenix-feather" && <p className="inventory-dialog-note">Wait for your next hero turn before using an item.</p>}
      <button className="text-button inventory-cancel" onClick={onClose}>Cancel</button>
    </section>
  </div>;
}

function BattleResultDialog({ outcome, onClose }: { outcome: BattleEnd; onClose: () => void }) {
  const victory = outcome.result === "victory";
  const escaped = outcome.result === "escaped";
  return <div className="battle-result-backdrop">
    <section className={`battle-result-dialog ${victory ? "battle-result-victory" : escaped ? "battle-result-escaped" : "battle-result-defeat"}`} role="dialog" aria-modal="true" aria-labelledby="battle-result-title">
      <span className="battle-result-icon">{victory ? "🏆" : escaped ? <DoorOpen /> : "☠"}</span>
      <p className="eyebrow">{victory ? "Victory" : escaped ? "Retreated" : "Defeat"}</p>
      <h2 id="battle-result-title">{victory ? `${outcome.enemy} defeated!` : escaped ? "You escaped!" : "Your party has fallen."}</h2>
      <p>{victory ? `Your party won the battle${outcome.gold ? ` and earned ${outcome.gold} gold` : ""}.` : escaped ? `Your party escaped from ${outcome.enemy} and can continue exploring.` : `Your party was defeated by ${outcome.enemy}. The expedition is over.`}</p>
      <button className="primary big" onClick={onClose}>{victory ? "Continue" : escaped ? "Return to dungeon" : "View results"}<ChevronRight /></button>
    </section>
  </div>;
}

function BattleCard({ game, group, onAction, host = false }: { game: GameState; group?: Group; onAction: (action: string, details?: Record<string, string>) => void; host?: boolean }) {
  const battle = group ? game.battles[group.id] : undefined;
  if (!battle || !group) return null;
  const initiativeOrder = battleTurnOrder(group, battle);
  function act(move: string, characterId: string) { if (!host) onAction("battle", { move, characterId }); }
  return <section className="battle-card"><p className="eyebrow">Floor {battle.floor} {game.bestiary.find((beast) => beast.name === battle.enemy)?.boss ? "boss" : ""} encounter · {group.name}</p><div className="enemy-heading"><span>{game.bestiary.find((beast) => beast.name === battle.enemy)?.icon || "👾"}</span><div><h2>{battle.enemy}</h2><div className="health-track enemy"><i style={{ width: `${Math.max(0, battle.hp / battle.maxHp * 100)}%` }} /></div><small>{battle.hp} / {battle.maxHp} HP</small></div></div>
    <p className="battle-help">{initiativeOrder.map((actorId) => {
      if (actorId === MONSTER_TURN_ID) return `${battle.enemy} (SPD ${battle.speed})`;
      const hero = group.characters.find((character) => character.id === actorId);
      return hero ? `${hero.name} (SPD ${hero.speed})` : "";
    }).filter(Boolean).join(" → ")}</p>
    <div className="hero-turn-list">{[...group.characters].sort((first, second) => initiativeOrder.indexOf(first.id) - initiativeOrder.indexOf(second.id)).map((hero) => {
      const acted = battle.actedCharacterIds.includes(hero.id);
      const canAct = !host && hero.hp > 0 && !acted;
      return <article className={`hero-turn ${hero.hp <= 0 ? "hero-fallen" : acted ? "hero-acted" : ""}`} key={hero.id}>
        <div className="hero-turn-heading"><PixelSprite characterClass={hero.characterClass} color={hero.spriteColor} trimColor={hero.trimColor} colors={hero.partColors} appearance={hero.appearance} /><span><strong>{initiativeOrder.indexOf(hero.id) + 1}. {hero.name}</strong><small>{hero.characterClass} · {hero.hp}/{hero.maxHp} HP · Speed {hero.speed} · {hero.hp <= 0 ? "Fallen" : acted ? "Acted" : "Ready"}</small></span></div>
        {canAct && <div className="battle-actions">
          <button onClick={() => act("attack", hero.id)}><Swords /> Attack</button>
          {hero.characterClass === "Warrior" && <button onClick={() => act("guard", hero.id)}><Shield /> Guard</button>}
          {hero.characterClass === "Thief" && <button onClick={() => act("steal", hero.id)}>🪙 Mug</button>}
          {hero.characterClass === "Archer" && <button onClick={() => act("double", hero.id)}>🏹 Dual shot</button>}
          {hero.characterClass === "Mage" && <button onClick={() => act("heal", hero.id)}>✨ Heal</button>}
          <button onClick={() => act("run", hero.id)}><DoorOpen /> Run</button>
        </div>}
      </article>;
    })}</div>
  </section>;
}

type StatRoll = { dice: number[]; value: number };
function rollAbility(): StatRoll {
  const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => a - b);
  return { dice, value: dice[1] + dice[2] + dice[3] };
}
type StatKey = "damage" | "dexterity" | "speed";
const STAT_LABELS: Record<StatKey, string> = { damage: "Damage", dexterity: "Dexterity", speed: "Speed" };
type HeroDraft = { name: string; characterClass: CharacterClass; rolls: StatRoll[] | null; assignments: Record<StatKey, number>; spriteColor: string; trimColor: string; partColors: PartColors; appearance: BodyParts; designId: string; designStats: CharacterDesignStats | null };
function createHeroDraft(index: number): HeroDraft {
  const spriteColor = SPRITE_COLORS[(index - 1) % SPRITE_COLORS.length];
  return { name: `Hero ${index}`, characterClass: "Warrior", rolls: null, assignments: { damage: 0, dexterity: 1, speed: 2 }, spriteColor, trimColor: CREATOR_COLORS[7], partColors: defaultPartColors(spriteColor), appearance: defaultBodyParts("character", "Warrior"), designId: "", designStats: null };
}
function createRandomHeroDraft(index: number): HeroDraft {
  const pick = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)];
  const characterClass = pick(CHARACTER_CLASSES);
  const parts = BODY_PART_OPTIONS.character[characterClass];
  const spriteColor = pick(CREATOR_COLORS);
  const partColors = {
    head: pick(CREATOR_COLORS),
    torso: pick(CREATOR_COLORS),
    arms: pick(CREATOR_COLORS),
    legs: pick(CREATOR_COLORS),
    tail: pick(CREATOR_COLORS),
    wings: pick(CREATOR_COLORS),
  };
  return {
    name: `Random ${characterClass} ${index}`,
    characterClass,
    rolls: [rollAbility(), rollAbility(), rollAbility()],
    assignments: { damage: 0, dexterity: 1, speed: 2 },
    spriteColor,
    trimColor: CREATOR_COLORS[7],
    partColors,
    appearance: { head: pick(parts.head), torso: pick(parts.torso), arms: pick(parts.arms), legs: pick(parts.legs) },
    designId: "",
    designStats: null,
  };
}

function HowToPlayDialog({ onClose }: { onClose: () => void }) {
  return <div className="how-to-play-backdrop">
    <section className="how-to-play-dialog" role="dialog" aria-modal="true" aria-labelledby="how-to-play-title">
      <p className="eyebrow">Your adventure begins</p>
      <h2 id="how-to-play-title">How to explore the dungeon</h2>
      <p className="how-to-play-intro">Work together, explore one step at a time, and help your party reach the stairs.</p>
      <div className="how-to-play-grid">
        <article><span aria-hidden="true">🧭</span><div><strong>Explore</strong><p>Tap a neighboring tile to move. Rooms reveal their contents when you enter. Every party explores separately, but discoveries are shared.</p></div></article>
        <article><span aria-hidden="true">🗝️</span><div><strong>Find the key</strong><p>Search each floor for its key, then find the stairs to continue. Clear all three floors to finish the expedition.</p></div></article>
        <article><span aria-hidden="true">⚔️</span><div><strong>Battle together</strong><p>Each living hero takes one action per round before the monster attacks. Use your class abilities, or run if you need to escape.</p></div></article>
        <article><span aria-hidden="true">🎒</span><div><strong>Watch your step</strong><p>Traps call for a d20 + Speed roll of 15 or more. Chests may hold gold, healing potions, a Phoenix Feather, or bombs.</p></div></article>
      </div>
      <button className="primary big" onClick={onClose}>Start exploring <ChevronRight /></button>
    </section>
  </div>;
}

function GroupScreen({ code, game, playerId, designs, designError, onAction, error }: { code: string; game: GameState | null; playerId: string; designs: SavedDesign[]; designError: string; onAction: (action: string, details?: Record<string, string>) => Promise<GameApiResponse | undefined>; error: string }) {
  const [name, setName] = useState("");
  const [explorationFacing, setExplorationFacing] = useState("North");
  const [tab, setTab] = useState<Tab>("map");
  const [joining, setJoining] = useState(false);
  const [trapRolls, setTrapRolls] = useState<DiceRoll[] | null>(null);
  const [chestReward, setChestReward] = useState<ChestReward | null>(null);
  const [battleEffect, setBattleEffect] = useState<BattleEffect | null>(null);
  const [monsterAttack, setMonsterAttack] = useState<MonsterAttack | null>(null);
  const [battleSequenceBusy, setBattleSequenceBusy] = useState(false);
  const [battleEnd, setBattleEnd] = useState<BattleEnd | null>(null);
  const [lastBattle, setLastBattle] = useState<Battle | null>(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<string | null>(null);
  const [creatureBook, setCreatureBook] = useState<"bestiary" | "bounties" | null>(null);
  const closeCreatureBook = useCallback(() => setCreatureBook(null), []);
  const [battleAdvanceRetry, setBattleAdvanceRetry] = useState(0);
  const monsterAttackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const battleSequenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monsterTurnRequest = useRef<string | null>(null);
  const performBattleActionRef = useRef<((action: string, details?: Record<string, string>) => Promise<GameApiResponse | undefined>) | null>(null);
  const [roster, setRoster] = useState<HeroDraft[]>([createHeroDraft(1)]);
  const [selectedHero, setSelectedHero] = useState(0);
  const activeDraft = roster[selectedHero] || roster[0];
  const group = game?.groups.find((candidate) => candidate.id === playerId);
  const groupBattle = group && game ? game.battles[group.id] : undefined;
  const canJoin = !game || (game.phase === "lobby" && game.groups.length < MAX_GROUPS);
  const introKey = group ? `dungeon_intro_${code}_${group.id}` : null;
  const introSeen = useStoredValue(introKey, true);
  useEffect(() => {
    if (!battleEffect) return;
    const timer = window.setTimeout(() => setBattleEffect(null), 1050);
    return () => window.clearTimeout(timer);
  }, [battleEffect]);
  useEffect(() => {
    if (!monsterAttack) return;
    const timer = window.setTimeout(() => setMonsterAttack(null), 1300);
    return () => window.clearTimeout(timer);
  }, [monsterAttack]);
  useEffect(() => () => {
    if (monsterAttackTimer.current) clearTimeout(monsterAttackTimer.current);
    if (battleSequenceTimer.current) clearTimeout(battleSequenceTimer.current);
  }, []);
  function queueMonsterAttack(attack: MonsterAttack, delay: number) {
    if (monsterAttackTimer.current) clearTimeout(monsterAttackTimer.current);
    if (battleSequenceTimer.current) clearTimeout(battleSequenceTimer.current);
    setSelectedInventoryItem(null);
    setBattleSequenceBusy(true);
    monsterAttackTimer.current = setTimeout(() => {
      setMonsterAttack(attack);
      monsterAttackTimer.current = null;
    }, delay);
    battleSequenceTimer.current = setTimeout(() => {
      setBattleSequenceBusy(false);
      battleSequenceTimer.current = null;
    }, delay + 1350);
  }
  function updateDraft(changes: Partial<HeroDraft>) {
    setRoster((current) => current.map((hero, index) => index === selectedHero ? { ...hero, ...changes } : hero));
  }
  function chooseCharacterDesign(designId: string) {
    const design = designs.find((entry): entry is CharacterDesign => entry.id === designId && entry.kind === "character");
    if (design) {
      updateDraft({
      name: design.name,
      characterClass: design.characterClass,
      spriteColor: design.color,
      trimColor: design.trimColor,
      partColors: design.colors,
      appearance: design.parts,
      designId: design.id,
      designStats: design.stats,
      rolls: null,
      });
      return;
    }
    updateDraft({
      name: `Hero ${selectedHero + 1}`,
      characterClass: "Warrior",
      spriteColor: SPRITE_COLORS[selectedHero % SPRITE_COLORS.length],
      trimColor: CREATOR_COLORS[7],
      partColors: defaultPartColors(SPRITE_COLORS[selectedHero % SPRITE_COLORS.length]),
      appearance: defaultBodyParts("character", "Warrior"),
      designId: "",
      designStats: null,
      rolls: null,
    });
  }
  function rollStats() {
    updateDraft({ rolls: [rollAbility(), rollAbility(), rollAbility()], assignments: { damage: 0, dexterity: 1, speed: 2 }, designStats: null, designId: "" });
  }
  function assign(stat: StatKey, value: number) {
    setRoster((current) => current.map((hero, index) => {
      if (index !== selectedHero) return hero;
      const replaced = Object.entries(hero.assignments).find(([key, assigned]) => key !== stat && assigned === value);
      if (replaced) return { ...hero, assignments: { ...hero.assignments, [replaced[0]]: hero.assignments[stat], [stat]: value } };
      return { ...hero, assignments: { ...hero.assignments, [stat]: value } };
    }));
  }
  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (roster.some((hero) => !hero.name.trim() || (!hero.rolls && !hero.designStats))) return;
    setJoining(true);
    try {
      await onAction("join", {
        name, characters: JSON.stringify(roster.map((hero) => ({
          name: hero.name, characterClass: hero.characterClass, spriteColor: hero.spriteColor, trimColor: hero.trimColor, partColors: hero.partColors, appearance: hero.appearance,
          damage: hero.designStats?.damage ?? hero.rolls![hero.assignments.damage].value,
          dexterity: hero.designStats?.dexterity ?? hero.rolls![hero.assignments.dexterity].value,
          speed: hero.designStats?.speed ?? hero.rolls![hero.assignments.speed].value,
        }))),
      });
    } finally { setJoining(false); }
  }
  async function moveToTile(tile: string): Promise<boolean> {
    const result = await onAction("move", { tile });
    if (result?.trapRolls) setTrapRolls(result.trapRolls);
    if (result?.chestReward) setChestReward(result.chestReward);
    if (result?.monsterAttack) queueMonsterAttack(result.monsterAttack, 450);
    return !!result?.state;
  }
  async function performBattleAction(action: string, details: Record<string, string> = {}) {
    const previousBattle = group && game ? game.battles[group.id] : undefined;
    if (previousBattle) setLastBattle(previousBattle);
    const result = await onAction(action, details);
    if (result?.battleEffect) setBattleEffect(result.battleEffect);
    if (result?.monsterAttack) queueMonsterAttack(result.monsterAttack, result.battleEffect ? 1100 : 450);
    if (result?.battleEnd) {
      setBattleEnd(result.battleEnd);
      if (result.battleEnd.result === "victory" && previousBattle) setLastBattle({ ...previousBattle, hp: 0 });
    }
    return result;
  }
  useEffect(() => {
    performBattleActionRef.current = performBattleAction;
  });
  useEffect(() => {
    if (!group || !groupBattle || !group.characters.some((hero) => hero.hp > 0)) {
      monsterTurnRequest.current = null;
      return;
    }
    const nextActor = nextBattleActor(group, groupBattle);
    if (nextActor !== MONSTER_TURN_ID && nextActor !== undefined) {
      monsterTurnRequest.current = null;
      return;
    }
    if (battleSequenceBusy) return;
    const performAction = performBattleActionRef.current;
    if (!performAction) return;
    const turnKey = `${group.id}:${groupBattle.tileId}:${groupBattle.actedCharacterIds.join(",")}:${battleAdvanceRetry}`;
    if (monsterTurnRequest.current === turnKey) return;
    monsterTurnRequest.current = turnKey;
    setBattleSequenceBusy(true);
    void performAction("advance-battle").then((result) => {
      if (!result?.monsterAttack) setBattleSequenceBusy(false);
    });
  }, [group, groupBattle, battleSequenceBusy, battleAdvanceRetry]);
  function retryMonsterTurn() {
    setBattleAdvanceRetry((current) => current + 1);
  }
  if (!playerId || (game && !group)) {
    if (!canJoin) return <section className="group-join"><Brand /><p className="eyebrow">Expedition {code}</p><h1>{game?.phase !== "lobby" ? "The expedition has started." : "All groups are full."}</h1><p className="muted">{game?.phase !== "lobby" ? "This expedition no longer accepts new groups." : `This dungeon has reached its limit of ${MAX_GROUPS} groups.`}</p></section>;
    return <section className="group-join group-join-form">
    <Brand /><p className="eyebrow">Expedition {code}</p><h1>Build your<br /><em>party.</em></h1>{designError && <p className="error" role="alert">{designError}</p>}
    <form onSubmit={join}>
      <div className="party-identity">
        <label htmlFor="group-name">Group name</label><input id="group-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="e.g. The Brave Badgers" autoComplete="off" />
        {designs.some((design) => design.kind === "character") && <label className="saved-hero-field" htmlFor="hero-design">Choose a saved hero<select id="hero-design" value={activeDraft.designId} onChange={(event) => chooseCharacterDesign(event.target.value)}><option value="">Create a new hero</option>{designs.filter((design): design is CharacterDesign => design.kind === "character").map((design) => <option key={design.id} value={design.id}>{design.name} · {design.characterClass}</option>)}</select></label>}
        <section className="roster-builder"><div className="roster-heading"><p className="form-label">Party members · {roster.length}/4</p><button type="button" className="roll-button" disabled={roster.length >= 4} onClick={() => { setRoster((current) => [...current, createHeroDraft(current.length + 1)]); setSelectedHero(roster.length); }}>+ Add hero</button></div>
          <button type="button" className="random-hero-button" onClick={() => updateDraft(createRandomHeroDraft(selectedHero + 1))}>🎲 Choose a random hero</button>
          <div className="roster-tabs">{roster.map((hero, index) => <button type="button" key={index} className={index === selectedHero ? "selected" : ""} onClick={() => setSelectedHero(index)}>{hero.name || `Hero ${index + 1}`}</button>)}</div>
          <label htmlFor="hero-name">Character name</label><input id="hero-name" value={activeDraft.name} onChange={(event) => updateDraft({ name: event.target.value })} maxLength={24} autoComplete="off" />
          {roster.length > 1 && <button type="button" className="text-button danger" onClick={() => { setRoster((current) => current.filter((_, index) => index !== selectedHero)); setSelectedHero(Math.max(0, selectedHero - 1)); }}>Remove this hero</button>}
        </section>
      </div>
      <div className="party-class-choice">
        <p className="form-label">Choose {activeDraft.name || "this hero"}’s class</p><div className="class-picker">{CLASSES.map((item) => <button type="button" key={item.name} aria-pressed={activeDraft.characterClass === item.name} onClick={() => updateDraft({ characterClass: item.name, appearance: defaultBodyParts("character", item.name), partColors: defaultPartColors(activeDraft.spriteColor), designId: "", designStats: null, rolls: null })} className={activeDraft.characterClass === item.name ? "selected" : ""}><PixelSprite characterClass={item.name} color={activeDraft.spriteColor} trimColor={activeDraft.trimColor} colors={defaultPartColors(activeDraft.spriteColor)} appearance={defaultBodyParts("character", item.name)} /><strong>{item.name} · {item.hp} HP</strong><small>{item.description}</small></button>)}</div>
      </div>
      <section className="creator-stats"><div className="creator-heading"><div><p className="form-label">{activeDraft.designStats ? `${activeDraft.name || "Hero"}’s saved stats` : `Roll ${activeDraft.name || "this hero"}’s stats`}</p><small>{activeDraft.designStats ? "These stats are part of the selected character design." : "Roll 4d6, drop the lowest die, then assign each result."}</small></div>{!activeDraft.designStats && <button type="button" className="roll-button" onClick={rollStats}>🎲 {activeDraft.rolls ? "Reroll" : "Roll stats"}</button>}</div>
        {activeDraft.designStats ? <div className="design-stat-summary party-design-stats"><span>Damage {activeDraft.designStats.damage}</span><span>Dexterity {activeDraft.designStats.dexterity}</span><span>Speed {activeDraft.designStats.speed}</span></div> : activeDraft.rolls ? <><div className="stat-roll-cards">{activeDraft.rolls.map((roll, index) => <div className="stat-roll-card" key={`${index}-${roll.value}`}><small>4D6 · DROP LOWEST</small><span className="stat-dice">{roll.dice.map((die, dieIndex) => <i key={dieIndex} className={dieIndex === 0 ? "drop-die" : ""}>{die}</i>)}</span><strong>{roll.value}</strong></div>)}</div><div className="stat-assignments">{(["damage", "dexterity", "speed"] as StatKey[]).map((stat) => <label key={stat}>{STAT_LABELS[stat]}<select value={activeDraft.assignments[stat]} onChange={(event) => assign(stat, Number(event.target.value))}>{activeDraft.rolls!.map((roll, index) => <option key={`${index}-${roll.value}`} value={index}>Roll {index + 1} · {roll.value}</option>)}</select></label>)}</div></> : <p className="muted roll-prompt">Tap “Roll stats” to get this hero’s three values.</p>}
      </section>
      <section className="sprite-picker"><div><p className="form-label">Choose this hero’s primary color</p><small>Distinct colors make each hero easy to identify.</small></div><div className="sprite-options">{SPRITE_COLORS.map((color) => <button type="button" key={color} aria-label={`Choose sprite color ${color}`} aria-pressed={activeDraft.spriteColor === color} className={activeDraft.spriteColor === color ? "selected" : ""} onClick={() => updateDraft({ spriteColor: color })}><PixelSprite characterClass={activeDraft.characterClass} color={color} trimColor={activeDraft.trimColor} colors={activeDraft.partColors} appearance={activeDraft.appearance} /></button>)}</div></section>
      <button className="primary big" disabled={joining || !name.trim() || roster.some((hero) => !hero.name.trim() || (!hero.rolls && !hero.designStats)) || new Set(roster.map((hero) => hero.name.trim().toLowerCase())).size !== roster.length}>{joining ? "Joining…" : "Join party"}<ChevronRight /></button></form>{error && <p className="error">{error}</p>}
  </section>;
  }
  if (!game || !group) return <section className="group-join"><Brand /><p className="eyebrow">Room {code}</p><h1>Finding your party…</h1></section>;
  const battleView = groupBattle || (battleEnd ? lastBattle : null);
  const nextBattleActorId = groupBattle ? nextBattleActor(group, groupBattle) : undefined;
  const activeBattleHero = groupBattle && nextBattleActorId !== MONSTER_TURN_ID
    ? group.characters.find((hero) => hero.id === nextBattleActorId)
    : undefined;
  async function useInventoryItem(item: string, targetCharacterId?: string) {
    const result = await performBattleAction("item", {
      item,
      ...(targetCharacterId ? { targetCharacterId } : {}),
      ...(groupBattle && activeBattleHero ? { characterId: activeBattleHero.id } : {}),
    });
    if (result) setSelectedInventoryItem(null);
  }
  if ((groupBattle && !group.gameOver) || (battleEnd && battleView)) return <>
    <BattleScreen game={game} group={group} battle={battleView!} battleEffect={battleEffect} monsterAttack={monsterAttack} sequenceBusy={battleSequenceBusy} onAction={performBattleAction} onOpenInventory={setSelectedInventoryItem} onRetryMonsterTurn={retryMonsterTurn} error={error} />
    {selectedInventoryItem && <InventoryUseDialog item={selectedInventoryItem} characters={group.characters} battleEnemy={battleView?.enemy} inBattle activeHero={activeBattleHero} onUse={useInventoryItem} onClose={() => setSelectedInventoryItem(null)} />}
    {battleEnd && !battleEffect && !monsterAttack && !battleSequenceBusy && <BattleResultDialog outcome={battleEnd} onClose={() => { setBattleEnd(null); setLastBattle(null); }} />}
  </>;
  const floor = game.floors.find((candidate) => candidate.number === group.stats.floor);
  const foundFloor = game.floors.find((candidate) => candidate.keyFound);
  const escaped = group.stats.floor > 3;
  const activelyExploring = game.phase === "exploration" && !groupBattle && !group.gameOver && !escaped;
  return <section className={`group-screen ${activelyExploring ? "group-playing" : ""}`}>
    <header className="group-topbar"><Brand /><span className="floor-chip">{group.gameOver ? "Game over" : game.phase === "lobby" ? "Party lobby" : escaped ? "Escaped!" : `Floor ${group.stats.floor} of 3`}</span><span className="group-level">{group.characters.length} HEROES</span></header>
    <div className="group-content">    <div className="group-welcome"><span className="class-icon large"><PixelSprite characterClass={group.characterClass} color={group.stats.spriteColor} trimColor={group.characters[0]?.trimColor} colors={group.characters[0]?.partColors} appearance={group.characters[0]?.appearance} /></span><div><p className="eyebrow">{group.characters.map((hero) => hero.name).join(" · ")} · {group.name}</p><h1>{group.gameOver ? "Your expedition ends here." : game.phase === "lobby" ? "Your party is ready." : escaped ? "You made it out!" : game.phase === "complete" ? "Dungeon cleared!" : groupBattle ? "Stand your ground!" : "Into the unknown."}</h1></div></div>
      {foundFloor && <div className="key-found-banner"><KeyRound /> Floor {foundFloor.number} key found! The stairway is unlocked.</div>}
      <div className="stat-strip"><span><Heart /> {group.stats.hp}/{group.stats.maxHp} HP</span><span>⚔ {group.stats.damage} DMG</span><span>◎ {group.stats.dexterity} DEX</span><span>➤ {group.stats.speed} SPD</span><span>🪙 {group.stats.gold}</span><span>🗝 {foundFloor ? `F${foundFloor.number} key found` : "Key missing"}</span></div>
      {game.phase === "lobby" ? <div className="waiting-panel"><span>⌛</span><h2>Waiting for the host</h2><p>Keep this screen open. Your host will start the expedition when the groups are ready.</p></div> :
        group.gameOver ? <div className="game-over-panel"><span>☠</span><p className="eyebrow">Expedition over</p><h2>Your party has fallen</h2><p>Your group has no living heroes or Phoenix Feathers. The other groups can continue their expedition.</p><div className="fallen-roster">{group.characters.map((hero) => <span key={hero.id}>{hero.name} · {hero.hp}/{hero.maxHp} HP</span>)}</div></div> :
        escaped ? <div className="waiting-panel"><span>🏆</span><h2>Party escaped!</h2><p>Your party made it out with {group.stats.gold} gold. The other parties can keep exploring.</p></div> :
        game.phase === "complete" ? <div className="waiting-panel"><span>🏆</span><h2>Quest complete!</h2><p>Well explored, {group.name}. Your party earned {group.stats.gold} gold.</p></div> :
        <div className="group-exploration">
          <div className="group-exploration-main">
            <div className="tab-bar mobile-tabs" role="tablist" aria-label="Your adventurer pages">{tabOptions.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={id === "bestiary" || id === "bounties" ? creatureBook === id : tab === id} className={id === "bestiary" || id === "bounties" ? creatureBook === id ? "active" : "" : tab === id ? "active" : ""} onClick={() => {
              if (id === "bestiary" || id === "bounties") {
                setTab("map");
                setCreatureBook(id);
              } else setTab(id);
            }}><Icon />{label}</button>)}</div>
            {tab === "map" ? <><FirstPersonExplore key={group.stats.floor} game={game} group={group} floor={floor} onMove={moveToTile} onFacingChange={setExplorationFacing} error={error} />{groupBattle && <BattleCard game={game} group={group} onAction={onAction} />}</> : <InfoPanel game={game} tab={tab} />}
          </div>
          <aside className="group-exploration-side">
            <DiceRolls game={game} groupId={group.id} />
            {floor && <PlayerMinimap floor={floor} group={group} facing={explorationFacing} />}
            <InventoryPanel inventory={group.stats.inventory} onSelect={setSelectedInventoryItem} />
            <div className="group-log">{game.feed.slice(0, 3).map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}</div>
          </aside>
        </div>}
      {error && <p className="error">{error}</p>}
      </div>
      {creatureBook && typeof document !== "undefined" && createPortal(<CreatureBook entries={game.bestiary} mode={creatureBook} onClose={closeCreatureBook} />, document.body)}
      {game.phase === "exploration" && !introSeen && <HowToPlayDialog onClose={() => {
        if (introKey) saveStoredValue(introKey, "seen", true);
      }} />}
      {trapRolls && <TrapEncounterDialog key={trapRolls.map((roll) => roll.id).join("-")} rolls={trapRolls} onClose={() => setTrapRolls(null)} />}
    {chestReward && <ChestRewardDialog key={chestReward.id} reward={chestReward} onClose={() => setChestReward(null)} />}
    {selectedInventoryItem && <InventoryUseDialog item={selectedInventoryItem} characters={group.characters} inBattle={false} onUse={useInventoryItem} onClose={() => setSelectedInventoryItem(null)} />}
    {battleEnd && !battleEffect && !monsterAttack && !battleSequenceBusy && <BattleResultDialog outcome={battleEnd} onClose={() => { setBattleEnd(null); setLastBattle(null); }} />}
  </section>;
}

const CHEST_REWARD_OPTIONS = ["gold", "potion", "phoenix-feather", "bomb"] as const;
function ChestRewardDialog({ reward, onClose }: { reward: ChestReward; onClose: () => void }) {
  const rewardKey = reward.kind === "gold" ? "gold" : reward.item || "potion";
  const [preview, setPreview] = useState<string>(() => CHEST_REWARD_OPTIONS[Math.floor(Math.random() * CHEST_REWARD_OPTIONS.length)]);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let step = 0;
    let timer = 0;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      step++;
      if (step >= 16) {
        setPreview(rewardKey);
        setSettled(true);
        return;
      }
      setPreview(CHEST_REWARD_OPTIONS[Math.floor(Math.random() * CHEST_REWARD_OPTIONS.length)]);
      timer = window.setTimeout(tick, 45 + step * 16);
    }
    timer = window.setTimeout(tick, 45);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reward.id, rewardKey]);
  const rewardLabel = rewardKey === "gold" ? `${reward.amount} gold` : ITEM_LABELS[rewardKey] || rewardKey;
  const previewLabel = preview === "gold" ? "Gold" : ITEM_LABELS[preview] || preview;
  const rewardIcon = preview === "gold" ? <Coins /> : preview === "potion" ? <FlaskConical /> : preview === "phoenix-feather" ? <Feather /> : <Bomb />;
  return <div className="chest-dialog-backdrop">
    <section className="chest-dialog" role="dialog" aria-modal="true" aria-labelledby="chest-dialog-title">
      <span className="chest-dialog-icon"><PackageOpen /></span>
      <p className="eyebrow">Treasure discovered</p>
      <h2 id="chest-dialog-title">{settled ? "The chest contained…" : "Opening the chest…"}</h2>
      <div className={`chest-reward-reel ${settled ? "settled" : "rolling"}`} aria-live="polite">
        <span className="chest-reward-icon">{rewardIcon}</span>
        <strong>{settled ? rewardLabel : previewLabel}</strong>
        {!settled && <small>Searching for treasure…</small>}
      </div>
      {settled && <p className="chest-reward-note">{rewardKey === "gold" ? "Added to your group's gold." : "Added to your party items."}</p>}
      <button className="primary big" onClick={onClose} disabled={!settled}>{settled ? "Continue" : "Revealing…"}</button>
    </section>
  </div>;
}

function TrapEncounterDialog({ rolls, onClose }: { rolls: DiceRoll[]; onClose: () => void }) {
  const dieResult = rolls[0]?.dice[0] ?? 1;
  const rollIds = rolls.map((roll) => roll.id).join("-");
  const [face, setFace] = useState(() => Math.floor(Math.random() * 20) + 1);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let step = 0;
    let timer = 0;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      step++;
      if (step >= 14) {
        setFace(dieResult);
        setSettled(true);
        return;
      }
      setFace(Math.floor(Math.random() * 20) + 1);
      timer = window.setTimeout(tick, 40 + step * 18);
    }
    timer = window.setTimeout(tick, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rollIds, dieResult]);
  return <div className="trap-dialog-backdrop">
    <section className="trap-dialog" role="dialog" aria-modal="true" aria-labelledby="trap-dialog-title">
      <span className="trap-dialog-icon"><TriangleAlert /></span>
      <p className="eyebrow">Danger underfoot</p>
      <h2 id="trap-dialog-title">You triggered a trap!</h2>
      <p className="muted">Every living hero rolls separately. Add each hero’s Speed to their d20.</p>
      <div className={`trap-die ${settled ? "settled" : "rolling"}`} aria-hidden="true">{face}<small>d20</small></div>
      {settled ? <>
        <div className="trap-party-rolls" role="status">{rolls.map((roll) => <article className={`trap-party-roll ${roll.success ? "success" : "failure"}`} key={roll.id}>
          <strong>{roll.actor}</strong><span>d20 {roll.dice[0]} + Speed {roll.modifier} = <b>{roll.total}</b></span>
          <em>{roll.success ? "Dodged" : "−4 HP"}</em>
        </article>)}</div>
        <p className={`trap-outcome ${rolls.every((roll) => roll.success) ? "success" : "failure"}`}>{rolls.filter((roll) => roll.success).length} of {rolls.length} heroes dodged · target 15</p>
      </> : <p className="trap-rolling-label" aria-live="polite">Rolling for all {rolls.length} heroes…</p>}
      <button className="primary big" onClick={onClose} disabled={!settled}>{settled ? "Continue" : "Rolling…"}</button>
    </section>
  </div>;
}
