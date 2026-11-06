import { env } from "cloudflare:workers";

const MAP_SIZE = 13;
const TILE_KINDS = new Set(["corridor", "room", "treasure", "key", "exit", "trap"]);
const MONSTERS = new Set(["Mossling", "Cave Bat", "Stone Golem"]);
type MapTile = { id: string; name: string; x: number; y: number; kind: string; enemy?: string };
function normalizeTile(tile: MapTile): MapTile {
  return tile.kind === "room" ? { ...tile, kind: "corridor" } : tile;
}

function database() {
  if (!env.DB) throw new Error("Game storage is temporarily unavailable.");
  return env.DB;
}

function validateMap(value: unknown): { name: string; tiles: MapTile[]; starts: string[] } | string {
  if (!value || typeof value !== "object") return "Map details are required.";
  const input = value as { name?: unknown; tiles?: unknown; starts?: unknown };
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  if (!name) return "Enter a name for your map.";
  if (!Array.isArray(input.tiles) || input.tiles.length < 3 || input.tiles.length > MAP_SIZE * MAP_SIZE) {
    return "Your map needs at least three tiles and cannot exceed the 13 × 13 grid.";
  }

  const coordinates = new Set<string>();
  const tiles: MapTile[] = [];
  for (const value of input.tiles) {
    if (!value || typeof value !== "object") return "The map contains an invalid tile.";
    const tile = value as { x?: unknown; y?: unknown; kind?: unknown; enemy?: unknown };
    if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y) || (tile.x as number) < 0 || (tile.x as number) >= MAP_SIZE || (tile.y as number) < 0 || (tile.y as number) >= MAP_SIZE) {
      return "Map tiles must be inside the 13 × 13 grid.";
    }
    if (typeof tile.kind !== "string" || !TILE_KINDS.has(tile.kind)) return "The map contains an unsupported tile.";
    const x = tile.x as number;
    const y = tile.y as number;
    const coordinate = `${x},${y}`;
    if (coordinates.has(coordinate)) return "The map contains duplicate tiles.";
    coordinates.add(coordinate);
    if (tile.enemy !== undefined && (typeof tile.enemy !== "string" || !MONSTERS.has(tile.enemy))) return "Choose a monster from the bestiary.";
    if (tile.kind === "exit" && tile.enemy) return "The exit cannot also contain a monster.";
    if ((tile.kind === "treasure" || tile.kind === "trap") && tile.enemy) return "Place monsters, chests, and traps on separate tiles.";
    tiles.push({
      id: `1-${x}-${y}`, name: tile.enemy ? `${tile.enemy} Den` : tile.kind === "treasure" ? "Forgotten Chest" : tile.kind === "key" ? "Key Chamber" : tile.kind === "exit" ? "Stairway" : tile.kind === "trap" ? "Hidden Trap" : "Stone Passage",
      x, y, kind: tile.kind === "room" ? "corridor" : tile.kind, ...(typeof tile.enemy === "string" ? { enemy: tile.enemy } : {}),
    });
  }

  const starts = Array.isArray(input.starts) && input.starts.every((start) => typeof start === "string") ? input.starts as string[] : [];
  if (!starts.length || new Set(starts).size !== starts.length || starts.some((start) => !tiles.some((tile) => tile.id === start && tile.kind === "corridor" && !tile.enemy))) {
    return "Place at least one starting point on a path tile without a monster.";
  }
  if (tiles.filter((tile) => tile.kind === "key").length !== 1) return "Place exactly one key tile.";
  if (tiles.filter((tile) => tile.kind === "exit").length !== 1) return "Place exactly one exit tile.";

  const reached = new Set<string>();
  const pending = [tiles[0]];
  while (pending.length) {
    const tile = pending.pop()!;
    if (reached.has(tile.id)) continue;
    reached.add(tile.id);
    for (const neighbor of tiles) {
      if (!reached.has(neighbor.id) && Math.abs(tile.x - neighbor.x) + Math.abs(tile.y - neighbor.y) === 1) pending.push(neighbor);
    }
  }
  if (reached.size !== tiles.length) return "Connect every tile with a path so the whole map can be explored.";
  return { name, tiles, starts };
}

function errorResponse(error: unknown) {
  console.error("Dungeon map error", error);
  return Response.json({ error: "The map library is temporarily unavailable. Please try again." }, { status: 500 });
}

export async function GET() {
  try {
    const result = await database().prepare("SELECT id, name, tiles, starts FROM map_templates ORDER BY created_at DESC, name").all<{ id: string; name: string; tiles: string; starts: string }>();
    return Response.json({
      maps: result.results.map((map) => ({
        id: map.id, name: map.name, tiles: (JSON.parse(map.tiles) as MapTile[]).map(normalizeTile), starts: JSON.parse(map.starts) as string[],
      })),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown; map?: unknown };
    const map = validateMap(body.map);
    if (typeof map === "string") return Response.json({ error: map }, { status: 400 });
    const id = typeof body.id === "string" && /^[\da-f-]{36}$/i.test(body.id) ? body.id : crypto.randomUUID();
    await database().prepare(
      "INSERT INTO map_templates (id, name, tiles, starts, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, tiles = excluded.tiles, starts = excluded.starts"
    ).bind(id, map.name, JSON.stringify(map.tiles), JSON.stringify(map.starts), Date.now()).run();
    return Response.json({ map: { id, ...map } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string" || !/^[\da-f-]{36}$/i.test(body.id)) {
      return Response.json({ error: "Choose a valid saved map to delete." }, { status: 400 });
    }
    const result = await database().prepare("DELETE FROM map_templates WHERE id = ?").bind(body.id).run();
    if (!result.meta.changes) return Response.json({ error: "This saved map no longer exists." }, { status: 404 });
    return Response.json({ deleted: body.id });
  } catch (error) { return errorResponse(error); }
}
