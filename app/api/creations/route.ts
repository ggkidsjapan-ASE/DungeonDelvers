import { env } from "cloudflare:workers";
import { CHARACTER_CLASSES, CREATOR_COLORS, DEFAULT_CHARACTER_STATS, DEFAULT_MONSTER_STATS, defaultPartColors, type CharacterClass, type CharacterDesignStats, type CreatorKind, type DesignInput, type MonsterDesignStats, type PartColors, type SavedDesign, validBodyParts } from "../../creations";

const BUILT_IN_MONSTERS = ["Mossling", "Cave Bat", "Stone Golem", "Ember Dragon", "Abyssal Warden", "Frost Wyrm"];

function database() {
  if (!env.DB) throw new Error("Game storage is temporarily unavailable.");
  return env.DB;
}

function errorResponse(error: unknown) {
  console.error("Dungeon creator error", error);
  return Response.json({ error: "The design library is temporarily unavailable. Please try again." }, { status: 500 });
}

function isCharacterStats(value: unknown): value is CharacterDesignStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return ["damage", "dexterity", "speed"].every((key) => Number.isInteger(stats[key]) && Number(stats[key]) >= 3 && Number(stats[key]) <= 18);
}

function isMonsterStats(value: unknown): value is MonsterDesignStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return Number.isInteger(stats.damageMin) && Number(stats.damageMin) >= 1 && Number(stats.damageMin) <= 18
    && Number.isInteger(stats.damageMax) && Number(stats.damageMax) >= Number(stats.damageMin) && Number(stats.damageMax) <= 36
    && Number.isInteger(stats.speed) && Number(stats.speed) >= 3 && Number(stats.speed) <= 18
    && Number.isInteger(stats.bounty) && Number(stats.bounty) >= 0 && Number(stats.bounty) <= 100;
}

function isPartColors(value: unknown, kind: CreatorKind): value is PartColors {
  if (!value || typeof value !== "object") return false;
  const colors = value as Record<string, unknown>;
  const keys = kind === "character" ? ["head", "torso", "arms", "legs"] : ["head", "torso", "arms", "legs", "tail", "wings"];
  return keys.every((key) => typeof colors[key] === "string" && CREATOR_COLORS.includes(colors[key] as typeof CREATOR_COLORS[number]));
}

function validateDesign(value: unknown): DesignInput | string {
  if (!value || typeof value !== "object") return "Design details are required.";
  const input = value as Record<string, unknown>;
  if (input.kind !== "character" && input.kind !== "monster") return "Choose a character or monster creator.";
  const kind = input.kind as CreatorKind;
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ").slice(0, 24) : "";
  if (!name) return "Enter a name for your design.";
  if (typeof input.color !== "string" || !CREATOR_COLORS.includes(input.color as typeof CREATOR_COLORS[number])) return "Choose a valid design color.";
  if (typeof input.trimColor !== "string" || !CREATOR_COLORS.includes(input.trimColor as typeof CREATOR_COLORS[number])) return "Choose a valid trim color.";
  if (!isPartColors(input.colors, kind)) return "Choose a valid color for every body part.";
  if (kind === "character") {
    if (typeof input.characterClass !== "string" || !CHARACTER_CLASSES.includes(input.characterClass as CharacterClass)) return "Choose a character class.";
    if (!validBodyParts(input.parts, kind, input.characterClass as CharacterClass)) return "Choose valid class-specific body parts for this design.";
    if (!isCharacterStats(input.stats)) return "Roll valid character stats before saving this design.";
    return { kind, name, characterClass: input.characterClass as CharacterClass, color: input.color, trimColor: input.trimColor, colors: input.colors, parts: input.parts, stats: input.stats };
  }
  if (!validBodyParts(input.parts, kind)) return "Choose valid body parts for this monster.";
  if (!isMonsterStats(input.stats)) return "Roll valid monster stats before saving this design.";
  return { kind, name, color: input.color, trimColor: input.trimColor, colors: input.colors, parts: input.parts, stats: input.stats };
}

export async function GET() {
  try {
    const result = await database().prepare(
      "SELECT id, kind, name, character_class, color, trim_color, colors, parts, stats FROM creature_designs ORDER BY created_at DESC, name"
    ).all<{ id: string; kind: CreatorKind; name: string; character_class: CharacterClass | null; color: string; trim_color: string; colors: string; parts: string; stats: string }>();
    const designs: SavedDesign[] = result.results.map((row) => {
      const stats: unknown = JSON.parse(row.stats || "{}");
      const parsedColors: unknown = JSON.parse(row.colors || "{}");
      const characterClass = CHARACTER_CLASSES.find((entry) => entry === row.character_class) || "Warrior";
      return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        color: row.color,
        trimColor: row.trim_color || "#d7d1c7",
        colors: isPartColors(parsedColors, row.kind) ? parsedColors : defaultPartColors(row.color),
        parts: JSON.parse(row.parts) as SavedDesign["parts"],
        stats: row.kind === "character"
          ? isCharacterStats(stats) ? stats : DEFAULT_CHARACTER_STATS[characterClass]
          : isMonsterStats(stats) ? stats : DEFAULT_MONSTER_STATS,
        ...(row.kind === "character" ? { characterClass } : {}),
      } as SavedDesign;
    });
    return Response.json({ designs }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown; design?: unknown };
    const design = validateDesign(body.design);
    if (typeof design === "string") return Response.json({ error: design }, { status: 400 });
    const id = typeof body.id === "string" && /^[\da-f-]{36}$/i.test(body.id) ? body.id : crypto.randomUUID();
    const db = database();
    const existing = await db.prepare("SELECT kind FROM creature_designs WHERE id = ?").bind(id).first<{ kind: CreatorKind }>();
    if (existing && existing.kind !== design.kind) return Response.json({ error: "A saved design cannot change its creator type." }, { status: 409 });
    if (design.kind === "monster") {
      if (BUILT_IN_MONSTERS.some((name) => name.toLowerCase() === design.name.toLowerCase())) return Response.json({ error: "Choose a name different from the built-in monsters." }, { status: 409 });
      const duplicate = await db.prepare("SELECT id FROM creature_designs WHERE kind = 'monster' AND lower(name) = lower(?) AND id <> ? LIMIT 1").bind(design.name, id).first<{ id: string }>();
      if (duplicate) return Response.json({ error: "A saved monster already uses that name." }, { status: 409 });
    }
    await database().prepare(
      "INSERT INTO creature_designs (id, kind, name, character_class, color, trim_color, colors, parts, stats, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, character_class = excluded.character_class, color = excluded.color, trim_color = excluded.trim_color, colors = excluded.colors, parts = excluded.parts, stats = excluded.stats"
    ).bind(id, design.kind, design.name, design.kind === "character" ? design.characterClass : null, design.color, design.trimColor, JSON.stringify(design.colors), JSON.stringify(design.parts), JSON.stringify(design.stats), Date.now()).run();
    return Response.json({ design: { id, ...design } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string" || !/^[\da-f-]{36}$/i.test(body.id)) return Response.json({ error: "Choose a valid saved design to delete." }, { status: 400 });
    const result = await database().prepare("DELETE FROM creature_designs WHERE id = ?").bind(body.id).run();
    if (!result.meta.changes) return Response.json({ error: "This saved design no longer exists." }, { status: 404 });
    return Response.json({ deleted: body.id });
  } catch (error) { return errorResponse(error); }
}
