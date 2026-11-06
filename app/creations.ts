export type CharacterClass = "Warrior" | "Thief" | "Archer" | "Mage";
export type CreatorKind = "character" | "monster";
export type BodyParts = { head: string; torso: string; arms: string; legs: string; tail?: string; wings?: string };
export type PartColors = { head: string; torso: string; arms: string; legs: string; tail?: string; wings?: string };
export type CharacterDesignStats = { damage: number; dexterity: number; speed: number };
export type MonsterDesignStats = { damageMin: number; damageMax: number; speed: number; bounty: number };
export type CharacterDesign = { id: string; kind: "character"; name: string; characterClass: CharacterClass; color: string; trimColor: string; colors: PartColors; parts: BodyParts; stats: CharacterDesignStats };
export type MonsterDesign = { id: string; kind: "monster"; name: string; color: string; trimColor: string; colors: PartColors; parts: BodyParts; stats: MonsterDesignStats };
export type SavedDesign = CharacterDesign | MonsterDesign;
export type DesignInput = Omit<CharacterDesign, "id"> | Omit<MonsterDesign, "id">;

export const CREATOR_COLORS = ["#e85d4a", "#e6a23c", "#58a86b", "#4c9ad1", "#9d70d6", "#db75a3", "#a6c36f", "#d7d1c7"] as const;
export const CHARACTER_CLASSES: CharacterClass[] = ["Warrior", "Thief", "Archer", "Mage"];
export const DEFAULT_CHARACTER_STATS: Record<CharacterClass, CharacterDesignStats> = {
  Warrior: { damage: 12, dexterity: 10, speed: 8 },
  Thief: { damage: 10, dexterity: 13, speed: 15 },
  Archer: { damage: 12, dexterity: 15, speed: 11 },
  Mage: { damage: 11, dexterity: 12, speed: 9 },
};
export const DEFAULT_MONSTER_STATS: MonsterDesignStats = { damageMin: 2, damageMax: 5, speed: 8, bounty: 10 };
export function defaultPartColors(color: string = CREATOR_COLORS[0]): PartColors {
  return { head: color, torso: color, arms: color, legs: color, tail: color, wings: color };
}
export const BODY_PART_OPTIONS: {
  character: Record<CharacterClass, Record<"head" | "torso" | "arms" | "legs", string[]>>;
  monster: Record<"head" | "torso" | "arms" | "legs" | "tail" | "wings", string[]>;
} = {
  character: {
    Warrior: { head: ["hair", "helmet", "great-helm"], torso: ["tunic", "plate", "chainmail", "full-plate"], arms: ["sleeves", "gauntlets", "plate-gauntlets"], legs: ["trousers", "greaves", "boots", "plate-greaves"] },
    Thief: { head: ["hair", "hood", "mask"], torso: ["tunic", "vest", "cloak", "leather"], arms: ["sleeves", "gloves", "bracers"], legs: ["trousers", "boots", "leather-boots"] },
    Archer: { head: ["hair", "hood", "headband", "robin-hood-hat"], torso: ["tunic", "vest", "forest-cloak", "leather"], arms: ["sleeves", "bracers", "archer-bracers"], legs: ["trousers", "boots", "forest-boots"] },
    Mage: { head: ["hair", "hood", "wizard-hat", "circlet"], torso: ["tunic", "cloak", "robe"], arms: ["sleeves", "wide-sleeves", "gloves"], legs: ["trousers", "boots", "robe-hem"] },
  },
  monster: {
    head: ["beast", "horned", "skull", "slime", "dragon", "eyestalks"],
    torso: ["scaled", "furred", "stone", "slime-body", "armored", "spectral"],
    arms: ["claws", "talons", "paws", "stone-arms", "tentacles"],
    legs: ["talons", "hooves", "paws", "stone-legs", "coiled"],
    tail: ["none", "spiked", "serpent", "flame", "clubbed"],
    wings: ["none", "bat", "feathered", "dragon"],
  },
};

export function defaultBodyParts(kind: CreatorKind, characterClass: CharacterClass = "Warrior"): BodyParts {
  if (kind === "monster") return { head: "beast", torso: "scaled", arms: "claws", legs: "talons", tail: "none", wings: "none" };
  const parts: Record<CharacterClass, BodyParts> = {
    Warrior: { head: "great-helm", torso: "full-plate", arms: "plate-gauntlets", legs: "plate-greaves" },
    Thief: { head: "hood", torso: "leather", arms: "gloves", legs: "leather-boots" },
    Archer: { head: "headband", torso: "forest-cloak", arms: "archer-bracers", legs: "forest-boots" },
    Mage: { head: "wizard-hat", torso: "robe", arms: "wide-sleeves", legs: "robe-hem" },
  };
  return parts[characterClass];
}

export function validBodyParts(value: unknown, kind: CreatorKind, characterClass: CharacterClass = "Warrior"): value is BodyParts {
  if (!value || typeof value !== "object") return false;
  const parts = value as Record<string, unknown>;
  const keys = kind === "monster" ? ["head", "torso", "arms", "legs", "tail", "wings"] : ["head", "torso", "arms", "legs"];
  const options = kind === "monster" ? BODY_PART_OPTIONS.monster : BODY_PART_OPTIONS.character[characterClass];
  return keys.every((key) => typeof parts[key] === "string" && options[key as keyof typeof options].includes(parts[key] as string));
}
