import { env } from "cloudflare:workers";
import { CREATOR_COLORS, DEFAULT_MONSTER_STATS, RUN_ESCAPE_CHANCE, TRAP_DODGE_TARGET, clampCharacterStat, dodgeChance, defaultBodyParts, defaultPartColors, type BodyParts, type MonsterDesignStats, type PartColors, validBodyParts } from "../../creations";
import { BOSSES } from "../../bosses";

type GamePhase = "lobby" | "exploration" | "complete";
type CharacterClass = "Warrior" | "Thief" | "Archer" | "Mage";
type TileKind = "entrance" | "corridor" | "room" | "treasure" | "key" | "exit" | "trap";
type Tile = { id: string; name: string; x: number; y: number; kind: TileKind; enemy?: string };
type PublicTile = Omit<Tile, "name" | "kind" | "enemy"> & { name?: string; kind: TileKind | "hidden"; enemy?: string };
type Battle = { groupId: string; floor: number; tileId: string; enemy: string; hp: number; maxHp: number; damageMin: number; damageMax: number; speed: number; actedCharacterIds: string[]; retreatTileId?: string; targetCount?: number };
type FloorState = { number: number; name?: string; tiles: Tile[]; starts: string[]; revealed: string[]; defeated: string[]; keyFound: boolean };
type MonsterData = { name: string; icon: string; description: string; bounty: number; damageMin: number; damageMax: number; speed: number; boss?: boolean; color?: string; trimColor?: string; colors?: PartColors; appearance?: BodyParts; custom?: boolean };
type DungeonState = { floors: FloorState[]; battles: Record<string, Battle>; feed: string[]; rolls: DiceRoll[]; bestiary: MonsterData[] };
type CharacterState = { level: number; xp: number; hp: number; maxHp: number; damage: number; dexterity: number; speed: number; gold: number; floor: number; x: number; y: number; hasKey: boolean; inventory: string[]; guarding: boolean; spriteColor: string };
type Hero = { id: string; name: string; characterClass: CharacterClass; icon: string; level: number; xp: number; hp: number; maxHp: number; damage: number; dexterity: number; speed: number; guarding: boolean; spriteColor: string; trimColor?: string; partColors?: PartColors; appearance: BodyParts };
type Group = { id: string; name: string; characterClass: CharacterClass; icon: string; stats: CharacterState; characters: Hero[]; gameOver: boolean };
type DiceRoll = { id: string; groupId: string; actor: string; label: string; dice: number[]; modifier: number; total: number; target: number; success: boolean; sides: number; createdAt: number };
type ChestReward = { id: string; kind: "gold" | "item"; amount?: number; item?: string };
type BattleEffect = { id: string; actorId: string; actorName: string; characterClass: CharacterClass; kind: "sword-slash" | "arrow-volley" | "dagger-strike" | "magic-blast" | "bomb-blast"; hit: boolean; damage: number; healed?: number };
type MonsterHit = { targetId: string; targetName: string; damage: number; dodged: boolean; dodgeRoll: number; dodgeChance: number };
type MonsterAttack = { id: string; hits: MonsterHit[] };
type BattleEnd = { id: string; result: "victory" | "defeat" | "escaped"; enemy: string; gold?: number };
type RoomRow = { code: string; teacher_token: string; phase: string; game_state: string; updated_at: number };
type PlayerRow = { id: string; name: string; role: string; character_state: string };
type MapTemplate = { id: string; name: string; tiles: Tile[]; starts: string[] };
type Room = { code: string; teacherToken: string; phase: GamePhase; state: DungeonState; groups: Group[]; revision: number };

const MAP_SIZE = 13;
const FLOOR_COUNT = 3;
const MONSTER_TURN_ID = "__monster__";
// Regular monster strength by party size (1 to 4 heroes). A monster attacks once a round however many heroes it
// faces, so larger parties need harder hits as well as more monster HP to feel any danger.
const MONSTER_SCALING = [{ hp: 12, damage: 0.75 }, { hp: 20, damage: 1 }, { hp: 35, damage: 1.25 }, { hp: 50, damage: 1.75 }];
// The weakest hero has 15 HP, so a regular monster can never take out a healthy hero with one hit.
const MAX_MONSTER_HIT = 10;
// Bosses are built for a party of four whatever the party size: their attacks hit several heroes at once.
const BOSS_HP = 90;
const BOSS_ATTACK_TARGETS = 3;
const SPRITE_COLORS: readonly string[] = CREATOR_COLORS;
const CLASS_DATA: Record<CharacterClass, { icon: string; hp: number; damage: number; dexterity: number; speed: number }> = {
  Warrior: { icon: "🛡️", hp: 25, damage: 12, dexterity: 10, speed: 8 },
  Thief: { icon: "🗡️", hp: 15, damage: 10, dexterity: 13, speed: 15 },
  Archer: { icon: "🏹", hp: 15, damage: 12, dexterity: 15, speed: 11 },
  Mage: { icon: "🔮", hp: 20, damage: 11, dexterity: 12, speed: 9 },
};
const DEFAULT_FEED = ["The parties gather at their separate dungeon entrances."];
const MAX_GROUP_CHARACTERS = 4;
const MAX_GROUPS = 8;
// Shared across all groups, so these scale with the group limit to keep each group's recent history visible.
const MAX_ROLL_HISTORY = MAX_GROUPS * MAX_GROUP_CHARACTERS;
const MAX_FEED_LINES = MAX_GROUPS * 3;

function database() {
  if (!env.DB) throw new Error("Game storage is temporarily unavailable.");
  return env.DB;
}
function validMonsterDesignStats(value: unknown): value is MonsterDesignStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return Number.isInteger(stats.damageMin) && Number(stats.damageMin) >= 1 && Number(stats.damageMin) <= 18
    && Number.isInteger(stats.damageMax) && Number(stats.damageMax) >= Number(stats.damageMin) && Number(stats.damageMax) <= 36
    && Number.isInteger(stats.speed) && Number(stats.speed) >= 3 && Number(stats.speed) <= 18
    && Number.isInteger(stats.bounty) && Number(stats.bounty) >= 0 && Number(stats.bounty) <= 100;
}
function id() { return crypto.randomUUID().replaceAll("-", "").slice(0, 12); }
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}
// All monsters come from the saved library, which can be small or empty. A floor with no
// monster to place simply has an open room, and an unguarded key can be picked up.
function pickMonster(monsters: MonsterData[]): MonsterData | undefined {
  return monsters[Math.floor(Math.random() * monsters.length)];
}
function createFloor(number: number, monsters: MonsterData[]): FloorState {
  const paths = Array.from({ length: MAP_SIZE }, () => Array<boolean>(MAP_SIZE).fill(false));
  const visited = new Set<string>();
  const directions = [[0, -2], [2, 0], [0, 2], [-2, 0]];
  const stack: [number, number][] = [[1, 1]];
  paths[1][1] = true;
  visited.add("1,1");
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = shuffle(directions.map(([dx, dy]) => [x + dx, y + dy] as [number, number])
      .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < MAP_SIZE - 1 && ny < MAP_SIZE - 1 && !visited.has(`${nx},${ny}`)));
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = options[0];
    paths[ny][nx] = true;
    paths[(y + ny) / 2][(x + nx) / 2] = true;
    visited.add(`${nx},${ny}`);
    stack.push([nx, ny]);
  }

  const nodes = shuffle(Array.from({ length: (MAP_SIZE - 1) / 2 }, (_, row) =>
    Array.from({ length: (MAP_SIZE - 1) / 2 }, (_, column) => [column * 2 + 1, row * 2 + 1] as [number, number])).flat());
  const nodeKey = (point: [number, number]) => `${number}-${point[0]}-${point[1]}`;
  const special = nodes.filter(([x, y]) => !(x === 1 && y === 1));
  const exit = special.pop()!;
  const key = special.pop()!;
  const treasure = special.pop()!;
  const monsterCount = 4;
  const monsterPoints = special.splice(0, monsterCount);
  const tiles: Tile[] = [];
  for (let y = 1; y < MAP_SIZE - 1; y++) {
    for (let x = 1; x < MAP_SIZE - 1; x++) {
      if (!paths[y][x]) continue;
      const point: [number, number] = [x, y];
      const isNode = x % 2 === 1 && y % 2 === 1;
      let kind: TileKind = isNode ? "room" : "corridor";
      let name = isNode ? "Unknown chamber" : "Stone passage";
      let enemy: string | undefined;
      if (x === exit[0] && y === exit[1]) {
        kind = "exit";
        name = "Stairway";
      } else if (x === key[0] && y === key[1]) {
        kind = "key";
        enemy = pickMonster(monsters)?.name;
        name = enemy ? "Guardian's Chamber" : "Key Chamber";
      } else if (x === treasure[0] && y === treasure[1]) {
        kind = "treasure";
        name = "Forgotten Cache";
      } else if (monsterPoints.some(([mx, my]) => x === mx && y === my)) {
        enemy = pickMonster(monsters)?.name;
        if (enemy) name = "Echoing Den";
      }
      tiles.push({ id: nodeKey(point), name, x, y, kind, ...(enemy ? { enemy } : {}) });
    }
  }
  const starts = shuffle(tiles.filter((tile) => tile.kind === "room").map((tile) => tile.id));
  return { number, tiles, starts, revealed: [], defeated: [], keyFound: false };
}
function makeFloor(number: number, name: string, tiles: Tile[], starts: string[]): FloorState {
  return { number, name, tiles, starts, revealed: [], defeated: [], keyFound: false };
}
function normalizeMapTile(tile: Tile): Tile {
  return tile.kind === "room" ? { ...tile, kind: "corridor" } : tile;
}
function createBossFloor(monsters: MonsterData[]): FloorState {
  const boss = BOSSES[Math.floor(Math.random() * BOSSES.length)];
  const variants = [
    {
      name: "The Ember Vault",
      path: [[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6],
        [3, 4], [4, 4], [5, 4], [3, 5], [4, 5], [5, 5], [8, 5], [8, 4]],
      chest: [3, 4], trap: [8, 5], monster: [5, 4], bossAt: [10, 6], exit: [11, 6], start: [1, 6],
    },
    {
      name: "The Shattered Deep",
      path: [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2],
        [3, 3], [3, 4], [3, 5], [4, 3], [4, 4], [4, 5], [7, 3], [8, 3], [9, 3], [8, 4]],
      chest: [4, 4], trap: [7, 3], monster: [9, 3], bossAt: [10, 2], exit: [11, 2], start: [1, 2],
    },
    {
      name: "The Frozen Labyrinth",
      path: [[1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [5, 9], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
        [2, 8], [3, 8], [4, 8], [2, 9], [3, 9], [4, 9], [8, 7], [8, 6]],
      chest: [3, 8], trap: [8, 7], monster: [4, 8], bossAt: [10, 8], exit: [11, 8], start: [1, 10],
    },
  ];
  const variant = variants[Math.floor(Math.random() * variants.length)];
  const guardian = pickMonster(monsters)?.name;
  const special = new Map<string, Pick<Tile, "kind" | "name" | "enemy">>([
    [variant.chest.join(","), { kind: "treasure", name: "Forgotten Cache" }],
    [variant.trap.join(","), { kind: "trap", name: "Hidden Trap" }],
    [variant.monster.join(","), { kind: "room", name: guardian ? "Guardian's Den" : "Silent Den", ...(guardian ? { enemy: guardian } : {}) }],
    [variant.bossAt.join(","), { kind: "key", name: `Lair of ${boss.name}`, enemy: boss.name }],
    [variant.exit.join(","), { kind: "exit", name: "Final Stairway" }],
    [variant.start.join(","), { kind: "room", name: "Dungeon Entrance" }],
  ]);
  const tiles = variant.path.map(([x, y]): Tile => {
    const detail = special.get(`${x},${y}`);
    return {
      id: `3-${x}-${y}`, name: detail?.name ?? "Stone Passage", x, y,
      kind: detail?.kind ?? "corridor", ...(detail?.enemy ? { enemy: detail.enemy } : {}),
    };
  });
  return makeFloor(3, variant.name, tiles, [`3-${variant.start[0]}-${variant.start[1]}`]);
}
// Saved maps can name monsters that no longer exist, so those tiles get a current library monster.
function withLibraryMonsters(tile: Tile, monsters: MonsterData[]): Tile {
  if (!tile.enemy || monsters.some((monster) => monster.name === tile.enemy)) return tile;
  const enemy = pickMonster(monsters)?.name;
  if (enemy) return { ...tile, enemy, name: `${enemy} Den` };
  const emptied = { ...tile, name: "Stone Passage" };
  delete emptied.enemy;
  return emptied;
}
function createDungeon(templates: Pick<MapTemplate, "name" | "tiles" | "starts">[] = [], customMonsters: MonsterData[] = []): DungeonState {
  const floors = [createFloor(1, customMonsters), createFloor(2, customMonsters), createBossFloor(customMonsters)];
  templates.slice(0, 2).forEach((template, index) => {
    floors[index] = makeFloor(index + 1, template.name, template.tiles.map((tile) => withLibraryMonsters(tile, customMonsters)), template.starts);
  });
  const bosses: MonsterData[] = BOSSES.map(({ name, icon, description, bounty, damageMin, damageMax, speed, boss }) => ({ name, icon, description, bounty, damageMin, damageMax, speed, boss }));
  return { floors, battles: {}, feed: [...DEFAULT_FEED], rolls: [], bestiary: [...customMonsters, ...bosses] };
}
function resetDungeon(state: DungeonState): DungeonState {
  return {
    floors: state.floors.map((floor) => ({
      ...floor,
      tiles: floor.tiles.map((tile) => tile.kind === "entrance"
        ? { ...tile, kind: floor.name ? "corridor" : "room", name: floor.name ? "Stone Passage" : "Unknown chamber" }
        : tile),
      revealed: [], defeated: [], keyFound: false,
    })),
    battles: {}, feed: [...DEFAULT_FEED], rolls: [], bestiary: state.bestiary ?? [],
  };
}
function parseCharacter(raw: string, role: string): CharacterState {
  const className = (Object.keys(CLASS_DATA) as CharacterClass[]).find((name) => name === role) || "Warrior";
  const base = CLASS_DATA[className];
  const saved = JSON.parse(raw || "{}") as Partial<CharacterState> & { strength?: number };
  const maxHp = Math.min(base.hp, Math.max(1, saved.maxHp ?? base.hp));
  return {
    level: saved.level ?? 1, xp: saved.xp ?? 0, hp: Math.min(maxHp, saved.hp ?? maxHp), maxHp,
    damage: saved.damage ?? saved.strength ?? base.damage, dexterity: saved.dexterity ?? base.dexterity, speed: saved.speed ?? base.speed,
    gold: saved.gold ?? 0, floor: saved.floor ?? 1, x: saved.x ?? 1, y: saved.y ?? 1,
    hasKey: saved.hasKey ?? false, inventory: saved.inventory ?? ["potion", "potion", "phoenix-feather"],
    guarding: saved.guarding ?? false, spriteColor: saved.spriteColor ?? SPRITE_COLORS[0],
  };
}
function parseDungeon(raw: string): DungeonState {
  const saved = JSON.parse(raw || "{}") as Partial<DungeonState>;
  if (saved.floors?.length) return {
    ...saved, floors: saved.floors,
    bestiary: saved.bestiary ?? [],
    battles: Object.fromEntries(Object.entries(saved.battles ?? {}).map(([groupId, battle]) => {
      const legacy = battle as Battle & { attack?: number };
      const monster = saved.bestiary?.find((entry) => entry.name === battle.enemy);
      return [groupId, {
        ...battle,
        damageMin: battle.damageMin ?? Math.max(1, (legacy.attack ?? 4) - 2),
        damageMax: battle.damageMax ?? legacy.attack ?? monster?.damageMax ?? 6,
        speed: battle.speed ?? monster?.speed ?? 8,
        actedCharacterIds: battle.actedCharacterIds ?? [],
      }];
    })),
    feed: saved.feed ?? [...DEFAULT_FEED], rolls: saved.rolls ?? [],
  };
  const legacy = saved as Partial<FloorState> & { floor?: number; revealed?: string[]; defeated?: string[]; keyFound?: boolean; feed?: string[] };
  const migrated = createDungeon();
  const current = migrated.floors[Math.max(0, Math.min(FLOOR_COUNT - 1, (legacy.floor ?? 1) - 1))];
  current.revealed = legacy.revealed?.length ? legacy.revealed.filter((tile) => current.tiles.some(({ id: tileId }) => tileId === tile)) : current.revealed;
  current.defeated = legacy.defeated ?? [];
  current.keyFound = legacy.keyFound ?? false;
  migrated.feed = legacy.feed ?? migrated.feed;
  return migrated;
}
function floorFor(room: Room, number: number) { return room.state.floors[number - 1]; }
function addFeed(state: DungeonState, message: string) { state.feed = [message, ...state.feed].slice(0, MAX_FEED_LINES); }
function addRoll(state: DungeonState, roll: Omit<DiceRoll, "id" | "createdAt">): DiceRoll {
  const result = { ...roll, id: id(), createdAt: Date.now() };
  state.rolls = [result, ...state.rolls].slice(0, MAX_ROLL_HISTORY);
  return result;
}
function livingCharacters(group: Group) { return group.characters.filter((character) => character.hp > 0); }
function refreshGroupStats(group: Group) {
  const characters = group.characters;
  group.stats.hp = characters.reduce((total, character) => total + character.hp, 0);
  group.stats.maxHp = characters.reduce((total, character) => total + character.maxHp, 0);
  group.stats.damage = characters.reduce((total, character) => total + character.damage, 0);
  group.stats.dexterity = characters.length ? Math.round(characters.reduce((total, character) => total + character.dexterity, 0) / characters.length) : 0;
  group.stats.speed = characters.length ? Math.round(characters.reduce((total, character) => total + character.speed, 0) / characters.length) : 0;
  group.stats.level = characters.length ? Math.max(...characters.map((character) => character.level)) : 1;
  group.stats.xp = characters.reduce((total, character) => total + character.xp, 0);
  group.stats.guarding = characters.some((character) => character.guarding);
  group.stats.spriteColor = characters[0]?.spriteColor || SPRITE_COLORS[0];
  group.characterClass = characters[0]?.characterClass || "Warrior";
  group.icon = CLASS_DATA[group.characterClass].icon;
}
function checkGameOver(room: Room, group: Group) {
  refreshGroupStats(group);
  if (!livingCharacters(group).length && !group.stats.inventory.includes("phoenix-feather")) {
    group.gameOver = true;
    delete room.state.battles[group.id];
    addFeed(room.state, `${group.name} is out of Phoenix Feathers. Their expedition is over.`);
  }
}
function monsterAttack(group: Group, battle: Battle, fallback: Hero): MonsterAttack {
  const target = livingCharacters(group).find((hero) => hero.guarding)
    || (fallback.hp > 0 ? fallback : livingCharacters(group).sort((first, second) => second.speed - first.speed)[0]);
  if (!target) throw new Error("Monster turn has no living target.");
  const others = livingCharacters(group).filter((hero) => hero.id !== target.id).sort(() => Math.random() - 0.5);
  const targets = [target, ...others].slice(0, battle.targetCount ?? 1);
  // Every hero rolls their own damage and dodge.
  const hits = targets.map((hero): MonsterHit => {
    const rolledDamage = battle.damageMin + Math.floor(Math.random() * (battle.damageMax - battle.damageMin + 1));
    const chance = dodgeChance(hero.speed);
    const dodgeRoll = Math.floor(Math.random() * 100) + 1;
    const dodged = dodgeRoll <= chance;
    const damage = dodged ? 0 : Math.max(1, rolledDamage - (hero.guarding ? 2 : 0));
    hero.guarding = false;
    hero.hp = Math.max(0, hero.hp - damage);
    return { targetId: hero.id, targetName: hero.name, damage, dodged, dodgeRoll, dodgeChance: chance };
  });
  return { id: id(), hits };
}
function describeMonsterAttack(group: Group, enemy: string, attack: MonsterAttack) {
  const results = attack.hits.map((hit) => hit.dodged ? `${hit.targetName} dodges` : `${hit.targetName} takes ${hit.damage}`);
  const fallen = attack.hits.filter((hit) => group.characters.find((hero) => hero.id === hit.targetId)?.hp === 0).map((hit) => `${hit.targetName} falls.`);
  return [`${enemy.startsWith("The ") ? enemy : `The ${enemy}`} attacks: ${results.join(", ")}.`, ...fallen].join(" ");
}
function battleTurnOrder(group: Group, battle: Battle) {
  return [
    ...livingCharacters(group).map((hero) => ({ id: hero.id, speed: hero.speed })),
    { id: MONSTER_TURN_ID, speed: battle.speed },
  ].sort((first, second) => second.speed - first.speed).map((actor) => actor.id);
}
function nextBattleActor(group: Group, battle: Battle) {
  return battleTurnOrder(group, battle).find((actorId) => !battle.actedCharacterIds.includes(actorId));
}
function completeBattleRound(group: Group, battle: Battle) {
  if (battleTurnOrder(group, battle).every((actorId) => battle.actedCharacterIds.includes(actorId))) {
    battle.actedCharacterIds = [];
  }
}
function encounterFor(tile: Tile, floorNumber: number, partySize: number, monsters: MonsterData[]): Battle {
  const monster = monsters.find((entry) => entry.name === tile.enemy);
  if (!monster) throw new Error(`No bestiary entry found for ${tile.enemy}.`);
  const scale = MONSTER_SCALING[Math.min(Math.max(partySize, 1), MONSTER_SCALING.length) - 1];
  const maxHp = monster.boss ? BOSS_HP : scale.hp;
  const scaledDamage = (damage: number) => monster.boss ? damage : Math.min(MAX_MONSTER_HIT, Math.max(1, Math.round(damage * scale.damage)));
  return {
    groupId: "", floor: floorNumber, tileId: tile.id, enemy: monster.name,
    maxHp, hp: maxHp,
    damageMin: scaledDamage(monster.damageMin), damageMax: scaledDamage(monster.damageMax), speed: monster.speed,
    targetCount: monster.boss ? BOSS_ATTACK_TARGETS : 1,
    actedCharacterIds: [],
  };
}
function resolveBattleVictory(room: Room, group: Group, battle: Battle, character: Hero, message: string) {
  const reward = room.state.bestiary.find((entry) => entry.name === battle.enemy)?.bounty ?? 10;
  group.stats.gold += reward;
  character.xp += reward;
  if (character.xp >= character.level * 20) {
    character.xp -= character.level * 20;
    character.level++;
    const hpCap = CLASS_DATA[character.characterClass].hp;
    character.maxHp = Math.min(hpCap + character.level - 1, character.maxHp + 1);
    character.hp = Math.min(character.maxHp, character.hp + 1);
    character.damage = Math.min(20, character.damage + 1);
    character.dexterity = Math.min(18, character.dexterity + 1);
    character.speed = Math.min(18, character.speed + 1);
    message += ` Level up! ${character.name} reached level ${character.level}.`;
  }
  const floor = floorFor(room, battle.floor);
  floor.defeated.push(battle.tileId);
  const defeatedTile = floor.tiles.find((tile) => tile.id === battle.tileId);
  if (defeatedTile?.kind === "key") {
    floor.keyFound = true;
    group.stats.hasKey = true;
    message += defeatedTile.enemy && room.state.bestiary.some((entry) => entry.name === defeatedTile.enemy && entry.boss)
      ? ` The final guardian is defeated, and ${group.name} claims the floor key!`
      : " The floor key is yours!";
  }
  delete room.state.battles[group.id];
  refreshGroupStats(group);
  addFeed(room.state, `${message} ${battle.enemy} defeated. +${reward} gold.`);
  return reward;
}
function charactersFromSaved(raw: string, role: string, fallbackName: string, fallbackColor: string): Hero[] {
  const saved = JSON.parse(raw || "{}") as Partial<CharacterState> & { characters?: Hero[] };
  if (Array.isArray(saved.characters) && saved.characters.length) {
    return saved.characters.slice(0, MAX_GROUP_CHARACTERS).map((character) => {
      const characterClass = (Object.keys(CLASS_DATA) as CharacterClass[]).find((name) => name === character.characterClass) || "Warrior";
      const base = CLASS_DATA[characterClass];
      return {
        id: character.id || id(), name: character.name || `${fallbackName} Hero`, characterClass, icon: base.icon,
        level: character.level ?? 1, xp: character.xp ?? 0, maxHp: Math.max(1, character.maxHp ?? base.hp),
        hp: Math.max(0, Math.min(character.hp ?? base.hp, character.maxHp ?? base.hp)),
        damage: character.damage ?? base.damage, dexterity: character.dexterity ?? base.dexterity,
        speed: character.speed ?? base.speed, guarding: character.guarding ?? false, spriteColor: character.spriteColor || fallbackColor, trimColor: character.trimColor || "#d7d1c7", partColors: character.partColors || defaultPartColors(character.spriteColor || fallbackColor),
        appearance: validBodyParts(character.appearance, "character", characterClass) ? character.appearance : defaultBodyParts("character", characterClass),
      };
    });
  }
  const characterClass = (Object.keys(CLASS_DATA) as CharacterClass[]).find((name) => name === role) || "Warrior";
  const legacy = parseCharacter(raw, role);
  return [{
    id: id(), name: fallbackName, characterClass, icon: CLASS_DATA[characterClass].icon, level: legacy.level, xp: legacy.xp,
    hp: legacy.hp, maxHp: legacy.maxHp, damage: legacy.damage, dexterity: legacy.dexterity, speed: legacy.speed,
    guarding: legacy.guarding, spriteColor: legacy.spriteColor || fallbackColor, trimColor: "#d7d1c7", partColors: defaultPartColors(legacy.spriteColor || fallbackColor), appearance: defaultBodyParts("character", characterClass),
  }];
}
function createHeroes(input: unknown): Hero[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_GROUP_CHARACTERS) return null;
  const heroes: Hero[] = [];
  for (const value of input) {
    if (!value || typeof value !== "object") return null;
    const draft = value as Record<string, unknown>;
    const characterClass = (Object.keys(CLASS_DATA) as CharacterClass[]).find((name) => name === draft.characterClass);
    const name = typeof draft.name === "string" ? draft.name.trim().replace(/\s+/g, " ").slice(0, 24) : "";
    const damage = Number(draft.damage);
    const dexterity = Number(draft.dexterity);
    const speed = Number(draft.speed);
    const trimColor = String(draft.trimColor || "#d7d1c7");
    const partColors = draft.partColors && typeof draft.partColors === "object" ? draft.partColors as PartColors : defaultPartColors(String(draft.spriteColor));
    if (!name || !characterClass || !SPRITE_COLORS.includes(String(draft.spriteColor)) || !SPRITE_COLORS.includes(trimColor)
      || ["head", "torso", "arms", "legs"].some((part) => !SPRITE_COLORS.includes(String(partColors[part as keyof PartColors])))
      || !validBodyParts(draft.appearance, "character", characterClass)
      || [damage, dexterity, speed].some((stat) => !Number.isInteger(stat) || stat < 3 || stat > 18)
    ) return null;
    const base = CLASS_DATA[characterClass];
    heroes.push({
      id: id(), name, characterClass, icon: base.icon, level: 1, xp: 0, hp: base.hp, maxHp: base.hp,
      damage: clampCharacterStat(damage), dexterity: clampCharacterStat(dexterity), speed: clampCharacterStat(speed), guarding: false, spriteColor: String(draft.spriteColor), trimColor, partColors, appearance: draft.appearance,
    });
  }
  if (new Set(heroes.map((hero) => hero.name.toLowerCase())).size !== heroes.length) return null;
  return heroes;
}
function storedGroupStats(group: Group): CharacterState & { characters: Hero[]; gameOver: boolean } {
  return { ...group.stats, characters: group.characters, gameOver: group.gameOver };
}
function spawnGroup(room: Room, group: Group, floorNumber: number) {
  const floor = floorFor(room, floorNumber);
  const occupied = new Set(room.groups.filter((other) => other.id !== group.id && other.stats.floor === floorNumber).map((other) => `${other.stats.x},${other.stats.y}`));
  const start = floor.starts.map((tileId) => floor.tiles.find((tile) => tile.id === tileId))
    .find((tile) => tile && !tile.enemy && !occupied.has(`${tile.x},${tile.y}`) && (!floor.revealed.includes(tile.id) || floor.starts.includes(tile.id) || tile.kind === "room"));
  const tile = start
    ?? floor.tiles.find((candidate) => candidate.kind === "room" && !candidate.enemy && !occupied.has(`${candidate.x},${candidate.y}`))
    ?? floor.tiles.find((candidate) => candidate.kind === "corridor" && !candidate.enemy && !occupied.has(`${candidate.x},${candidate.y}`))
    // Small custom maps can have fewer open tiles than groups, so groups share a start rather than failing to join.
    ?? floor.starts.map((tileId) => floor.tiles.find((candidate) => candidate.id === tileId)).find((candidate) => candidate && !candidate.enemy);
  if (!tile) throw new Error(`No open starting tile on floor ${floorNumber}.`);
  tile.kind = "entrance";
  tile.name = "Party Entrance";
  group.stats.floor = floorNumber;
  group.stats.x = tile.x;
  group.stats.y = tile.y;
  group.stats.hasKey = false;
  if (!floor.revealed.includes(tile.id)) floor.revealed.push(tile.id);
}
async function loadRoom(code: string): Promise<Room | null> {
  const db = database();
  const row = await db.prepare("SELECT code, teacher_token, phase, game_state, updated_at FROM rooms WHERE code = ?").bind(code).first<RoomRow>();
  if (!row) return null;
  const result = await db.prepare("SELECT id, name, role, character_state FROM players WHERE room_code = ? ORDER BY created_at, id").bind(code).all<PlayerRow>();
  const state = parseDungeon(row.game_state);
  const groups = result.results.map((player) => {
    const characterClass = (Object.keys(CLASS_DATA) as CharacterClass[]).find((name) => name === player.role) || "Warrior";
    const stats = parseCharacter(player.character_state, player.role);
    const saved = JSON.parse(player.character_state || "{}") as { gameOver?: boolean };
    const group: Group = {
      id: player.id, name: player.name, characterClass, icon: CLASS_DATA[characterClass].icon, stats,
      characters: charactersFromSaved(player.character_state, player.role, player.name, stats.spriteColor),
      gameOver: saved.gameOver ?? false,
    };
    refreshGroupStats(group);
    return group;
  });
  for (const group of groups) {
    const battle = state.battles[group.id];
    const monster = battle && state.bestiary.find((entry) => entry.name === battle.enemy);
    const regularMonsterHp = [15, 20, 30, 40][Math.min(Math.max(group.characters.length, 1), MAX_GROUP_CHARACTERS) - 1];
    if (battle && monster?.boss && battle.maxHp === regularMonsterHp) {
      battle.maxHp = regularMonsterHp * 2;
      battle.hp = Math.min(battle.maxHp, battle.hp + regularMonsterHp);
    }
  }
  const room: Room = {
    code: row.code, teacherToken: row.teacher_token,
    phase: row.phase === "lobby" ? "lobby" : groups.length && groups.every((group) => group.stats.floor > FLOOR_COUNT || group.gameOver) ? "complete" : "exploration",
    state, groups, revision: row.updated_at,
  };
  for (const group of groups) {
    if (group.stats.floor <= FLOOR_COUNT && !floorFor(room, group.stats.floor).tiles.some((tile) => tile.x === group.stats.x && tile.y === group.stats.y)) {
      spawnGroup(room, group, group.stats.floor);
    }
  }
  return room;
}
function publicState(room: Room, viewer: { host?: boolean; playerId?: string } = {}) {
  return {
    code: room.code, phase: room.phase, floors: room.state.floors.map((floor) => {
      const known = new Set(floor.revealed);
      const seenTiles = floor.tiles.filter((tile) => known.has(tile.id));
      for (const seen of seenTiles) {
        for (const tile of floor.tiles) {
          if (Math.abs(seen.x - tile.x) + Math.abs(seen.y - tile.y) === 1) known.add(tile.id);
        }
      }
      return {
        number: floor.number, name: floor.name, revealed: floor.revealed, keyFound: floor.keyFound,
          defeated: floor.defeated,
        tiles: floor.tiles.filter((tile) => known.has(tile.id)).map((tile): PublicTile => floor.revealed.includes(tile.id)
          ? { ...tile }
          : { id: tile.id, x: tile.x, y: tile.y, kind: "hidden" }),
      };
    }),
    battles: viewer.host ? room.state.battles : viewer.playerId && room.state.battles[viewer.playerId] ? { [viewer.playerId]: room.state.battles[viewer.playerId] } : {},
    feed: room.state.feed, rolls: room.state.rolls, groups: room.groups,
    bestiary: room.state.bestiary.map(({ name, icon, description, bounty, damageMin, damageMax, speed, boss, color, trimColor, colors, appearance, custom }) => ({
      name, icon, description, bounty, damageMin, damageMax, speed,
      ...(boss ? { boss: true } : {}),
      ...(color && appearance ? { color, trimColor, colors, appearance } : {}),
      ...(custom ? { custom: true } : {}),
    })),
  };
}
function errorResponse(error: unknown) {
  console.error("Dungeon Expedition error", error);
  return Response.json({ error: "The expedition lost its connection. Please try again." }, { status: 500 });
}
// Every action rewrites the whole room, so a write based on a stale read would erase another group's action.
// updated_at doubles as a revision: a write only applies if the room is unchanged since it was read, otherwise the action reruns.
class RoomConflict extends Error {}
const ROOM_UNCHANGED = "EXISTS (SELECT 1 FROM rooms WHERE code = ? AND updated_at = ?)";
const MAX_ACTION_ATTEMPTS = 12;
function nextRevision(room: Room) { return Math.max(Date.now(), room.revision + 1); }
async function saveRoom(room: Room) {
  const db = database();
  if (room.phase !== "lobby" && room.groups.length && room.groups.every((group) => group.stats.floor > FLOOR_COUNT || group.gameOver)) room.phase = "complete";
  const revision = nextRevision(room);
  const results = await db.batch([
    ...room.groups.map((group) => db.prepare(`UPDATE players SET role = ?, character_state = ? WHERE id = ? AND room_code = ? AND ${ROOM_UNCHANGED}`).bind(group.characterClass, JSON.stringify(storedGroupStats(group)), group.id, room.code, room.code, room.revision)),
    // Runs last because it changes the revision the statements above check.
    db.prepare("UPDATE rooms SET phase = ?, game_state = ?, updated_at = ? WHERE code = ? AND updated_at = ?").bind(room.phase, JSON.stringify(room.state), revision, room.code, room.revision),
  ]);
  if (!results[results.length - 1].meta.changes) throw new RoomConflict();
  room.revision = revision;
}
function hitChance(dexterity: number) { return Math.max(35, Math.min(90, 50 + (dexterity - 10) * 3)); }
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const room = await loadRoom((url.searchParams.get("room") || "").toUpperCase());
    if (!room) return Response.json({ error: "Expedition not found." }, { status: 404 });
    const teacherToken = url.searchParams.get("teacherToken");
    const playerId = url.searchParams.get("playerId") || undefined;
    return Response.json(publicState(room, { host: teacherToken === room.teacherToken, playerId }), { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, string>;
    for (let attempt = 0; attempt < MAX_ACTION_ATTEMPTS; attempt++) {
      try {
        return await handleAction(body);
      } catch (error) {
        if (!(error instanceof RoomConflict)) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 40 * (attempt + 1)));
      }
    }
    return Response.json({ error: "The dungeon is very busy. Please try that again." }, { status: 503 });
  } catch (error) { return errorResponse(error); }
}

async function handleAction(body: Record<string, string>): Promise<Response> {
    const db = database();
    if (body.action === "create") {
      const savedCreatures = await db.prepare("SELECT id, name, color, trim_color, colors, parts, stats FROM creature_designs WHERE kind = 'monster' ORDER BY created_at DESC").all<{ id: string; name: string; color: string; trim_color: string; colors: string; parts: string; stats: string }>();
      const customMonsters: MonsterData[] = savedCreatures.results.map((design) => {
        const parsedStats: unknown = JSON.parse(design.stats || "{}");
        const stats = validMonsterDesignStats(parsedStats) ? parsedStats : DEFAULT_MONSTER_STATS;
        return {
          name: design.name,
          icon: "👾",
          description: "A student-designed creature lurking in the dungeon.",
          ...stats,
          color: design.color,
          trimColor: design.trim_color || "#d7d1c7",
          colors: JSON.parse(design.colors || "{}") as PartColors,
          appearance: JSON.parse(design.parts) as BodyParts,
          custom: true,
        };
      });
      const savedMaps = await db.prepare("SELECT id, name, tiles, starts FROM map_templates").all<{ id: string; name: string; tiles: string; starts: string }>();
      const savedMapRows = savedMaps.results;
      const selectedMap = body.mapId ? savedMapRows.find((map) => map.id === body.mapId) : undefined;
      if (body.mapId && !selectedMap) return Response.json({ error: "That custom map could not be found." }, { status: 404 });
      const otherMaps = shuffle(savedMapRows.filter((map) => map.id !== selectedMap?.id).map((savedMap) => ({
        name: savedMap.name,
        tiles: (JSON.parse(savedMap.tiles) as Tile[]).map(normalizeMapTile),
        starts: JSON.parse(savedMap.starts) as string[],
      })));
      const templates = [
        ...(selectedMap ? [{
          name: selectedMap.name,
          tiles: (JSON.parse(selectedMap.tiles) as Tile[]).map(normalizeMapTile),
          starts: JSON.parse(selectedMap.starts) as string[],
        }] : []),
        ...otherMaps,
      ].slice(0, 2);
      const now = Date.now();
      await db.prepare("DELETE FROM rooms WHERE updated_at < ?").bind(now - 24 * 60 * 60 * 1000).run();
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const teacherToken = id();
        try {
          await db.prepare("INSERT INTO rooms (code, teacher_token, phase, game_state, created_at, updated_at) VALUES (?, ?, 'lobby', ?, ?, ?)").bind(code, teacherToken, JSON.stringify(createDungeon(templates, customMonsters)), now, now).run();
          const room = await loadRoom(code);
          return Response.json({ code, teacherToken, state: publicState(room!) });
        } catch (error) { if (attempt === 4) throw error; }
      }
    }
    const code = (body.room || "").toUpperCase();
    const room = await loadRoom(code);
    if (!room) return Response.json({ error: "That expedition is no longer open." }, { status: 404 });
    if (body.action === "join") {
      if (room.phase !== "lobby") return Response.json({ error: "This expedition has already started." }, { status: 409 });
      if (room.groups.length >= MAX_GROUPS) return Response.json({ error: `This dungeon already has its maximum of ${MAX_GROUPS} groups.` }, { status: 409 });
      const name = (body.name || "").trim().replace(/\s+/g, " ").slice(0, 24);
      if (!name) return Response.json({ error: "Enter a group name." }, { status: 400 });
      let inputCharacters: unknown;
      try { inputCharacters = JSON.parse(body.characters || "null"); } catch { inputCharacters = null; }
      const characters = createHeroes(inputCharacters);
      if (!characters) return Response.json({ error: "Add 1–4 named characters, choose each class and color, and assign their three stats." }, { status: 400 });
      const characterClass = characters[0].characterClass;
      if (room.groups.some((group) => group.name.toLowerCase() === name.toLowerCase())) return Response.json({ error: "That group name is already taken." }, { status: 409 });
      const first = characters[0];
      const stats: CharacterState = {
        level: 1, xp: 0, hp: 0, maxHp: 0, damage: 0, dexterity: 0, speed: 0,
        gold: 0, floor: 1, x: 1, y: 1, hasKey: false,
        inventory: ["potion", "potion", "phoenix-feather"], guarding: false, spriteColor: first.spriteColor,
      };
      stats.spriteColor = first.spriteColor;
      const player: Group = { id: id(), name, characterClass, icon: CLASS_DATA[characterClass].icon, stats, characters, gameOver: false };
      refreshGroupStats(player);
      room.groups.push(player);
      spawnGroup(room, player, 1);
      const revision = nextRevision(room);
      const results = await db.batch([
        db.prepare(`INSERT INTO players (id, room_code, name, role, character_state, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE ${ROOM_UNCHANGED}`).bind(player.id, code, player.name, characterClass, JSON.stringify(storedGroupStats(player)), Date.now(), code, room.revision),
        db.prepare("UPDATE rooms SET game_state = ?, updated_at = ? WHERE code = ? AND updated_at = ?").bind(JSON.stringify(room.state), revision, code, room.revision),
      ]);
      if (!results[results.length - 1].meta.changes) throw new RoomConflict();
      return Response.json({ playerId: player.id, state: publicState(room, { playerId: player.id }) });
    }
    if (body.action === "start" || body.action === "reset") {
      if (body.teacherToken !== room.teacherToken) return Response.json({ error: "Host control not recognized." }, { status: 403 });
      if (body.action === "start") {
        if (!room.groups.length) return Response.json({ error: "At least one group must join first." }, { status: 400 });
        room.phase = "exploration";
        addFeed(room.state, "The expedition begins. Each party explores at its own pace.");
      } else {
        room.phase = "lobby";
        room.state = resetDungeon(room.state);
        for (const group of room.groups) {
          group.gameOver = false;
          group.characters = group.characters.map((hero) => ({
            ...hero, level: 1, xp: 0, hp: hero.maxHp, guarding: false,
          }));
          group.stats.level = 1;
          group.stats.xp = 0;
          group.stats.gold = 0;
          group.stats.inventory = ["potion", "potion", "phoenix-feather"];
          group.stats.hasKey = false;
          refreshGroupStats(group);
          spawnGroup(room, group, 1);
        }
      }
      await saveRoom(room);
      return Response.json({ state: publicState(room, { host: true }) });
    }
    const group = room.groups.find((candidate) => candidate.id === body.playerId);
    if (!group) return Response.json({ error: "Group not found. Rejoin using the expedition code." }, { status: 404 });
    if (group.gameOver) return Response.json({ error: "Your party's expedition is over." }, { status: 409 });
    const battle = room.state.battles[group.id];
    if (body.action === "move") {
      if (room.phase !== "exploration") return Response.json({ error: "The expedition is not exploring yet." }, { status: 409 });
      if (group.stats.floor > FLOOR_COUNT) return Response.json({ error: "Your party has already escaped the dungeon." }, { status: 409 });
      if (group.stats.hp <= 0) return Response.json({ error: "Your group needs a Phoenix Feather before it can explore." }, { status: 409 });
      if (battle) return Response.json({ error: "Finish your group's battle before moving." }, { status: 409 });
      const floor = floorFor(room, group.stats.floor);
      const tile = floor.tiles.find((candidate) => candidate.id === body.tile);
      if (!tile || Math.abs(tile.x - group.stats.x) + Math.abs(tile.y - group.stats.y) !== 1) return Response.json({ error: "That tile is not next to your group." }, { status: 400 });
      let trapRolls: DiceRoll[] | undefined;
      let chestReward: ChestReward | undefined;
      let monsterAttackEffect: MonsterAttack | undefined;
      const cameFrom = floor.tiles.find((candidate) => candidate.x === group.stats.x && candidate.y === group.stats.y);
      group.stats.x = tile.x;
      group.stats.y = tile.y;
      if (!floor.revealed.includes(tile.id)) floor.revealed.push(tile.id);
      if (tile.kind === "exit" && floor.keyFound) {
        group.stats.floor++;
        group.stats.hasKey = false;
        if (group.stats.floor > FLOOR_COUNT) addFeed(room.state, `${group.name} escaped the dungeon!`);
        else {
          spawnGroup(room, group, group.stats.floor);
          addFeed(room.state, `${group.name} descended to floor ${group.stats.floor}.`);
        }
        if (room.groups.every((member) => member.stats.floor > FLOOR_COUNT || member.gameOver)) room.phase = "complete";
      } else if (tile.kind === "exit") {
        addFeed(room.state, `${group.name} found the stairs, but the floor key is still missing.`);
      } else if (tile.kind === "treasure" && !floor.defeated.includes(`looted-${tile.id}`)) {
        floor.defeated.push(`looted-${tile.id}`);
        const rewards: ChestReward[] = [
          { id: "gold", kind: "gold", amount: 10 + Math.floor(Math.random() * 16) },
          { id: "potion", kind: "item", item: "potion" },
          { id: "phoenix-feather", kind: "item", item: "phoenix-feather" },
          { id: "bomb", kind: "item", item: "bomb" },
        ];
        const reward = rewards[Math.floor(Math.random() * rewards.length)];
        chestReward = { ...reward, id: id() };
        if (reward.kind === "gold") {
          group.stats.gold += reward.amount!;
          addFeed(room.state, `${group.name} opened a chest and found ${reward.amount} gold!`);
        } else {
          group.stats.inventory.push(reward.item!);
          const rewardName = reward.item === "potion" ? "a Healing Potion" : reward.item === "phoenix-feather" ? "a Phoenix Feather" : "a Bomb";
          addFeed(room.state, `${group.name} opened a chest and found ${rewardName}!`);
        }
      } else if (tile.kind === "key" && !floor.keyFound && !tile.enemy) {
        group.stats.hasKey = true;
        floor.keyFound = true;
        addFeed(room.state, `${group.name} found the floor key.`);
      } else if (tile.enemy && !floor.defeated.includes(tile.id)) {
        if (Object.values(room.state.battles).some((active) => active.floor === floor.number && active.tileId === tile.id)) {
          return Response.json({ error: "Another party is already facing this monster." }, { status: 409 });
        }
        const encounter = encounterFor(tile, floor.number, group.characters.length, room.state.bestiary);
        room.state.battles[group.id] = { ...encounter, groupId: group.id, retreatTileId: cameFrom?.id };
        addFeed(room.state, `${group.name} encountered a ${encounter.enemy}!`);
        const battle = room.state.battles[group.id];
        if (nextBattleActor(group, battle) === MONSTER_TURN_ID) {
          const firstHero = livingCharacters(group).sort((first, second) => second.speed - first.speed)[0];
          if (firstHero) {
            const attack = monsterAttack(group, battle, firstHero);
            battle.actedCharacterIds.push(MONSTER_TURN_ID);
            monsterAttackEffect = attack;
            addFeed(room.state, `Strikes first! ${describeMonsterAttack(group, battle.enemy, attack)}`);
            refreshGroupStats(group);
            checkGameOver(room, group);
            completeBattleRound(group, battle);
          }
        }
      } else if (tile.kind === "trap" && !floor.defeated.includes(`trap-${tile.id}-${group.id}`)) {
        const targets = livingCharacters(group);
        trapRolls = targets.map((target) => {
          const roll = Math.floor(Math.random() * 20) + 1;
          const total = roll + target.speed;
          const result = addRoll(room.state, { groupId: group.id, actor: target.name, label: "Trap evasion", dice: [roll], modifier: target.speed, total, target: TRAP_DODGE_TARGET, success: total >= TRAP_DODGE_TARGET, sides: 20 });
          if (total >= TRAP_DODGE_TARGET) {
            addFeed(room.state, `${target.name} spotted the trap and dodged it! (d20 ${roll} + Speed ${target.speed} = ${total}; needed ${TRAP_DODGE_TARGET}.)`);
          } else {
            const damage = 4;
            target.hp = Math.max(0, target.hp - damage);
            addFeed(room.state, `${target.name} failed to evade the trap and took ${damage} damage. (d20 ${roll} + Speed ${target.speed} = ${total}; needed ${TRAP_DODGE_TARGET}.)${target.hp === 0 ? ` ${target.name} falls.` : ""}`);
          }
          return result;
        });
        floor.defeated.push(`trap-${tile.id}-${group.id}`);
        refreshGroupStats(group);
        checkGameOver(room, group);
      } else if (tile.kind === "key" && floor.keyFound) {
        addFeed(room.state, `${group.name} explored the Guardian's Chamber.`);
      } else if (tile.kind !== "corridor" && tile.kind !== "entrance" && tile.kind !== "room" && tile.kind !== "trap") addFeed(room.state, `${group.name} explored ${tile.name}.`);
      await saveRoom(room);
      return Response.json({ state: publicState(room, { playerId: group.id }), ...(trapRolls ? { trapRolls } : {}), ...(chestReward ? { chestReward } : {}), ...(monsterAttackEffect ? { monsterAttack: monsterAttackEffect } : {}) });
    }
    if (body.action === "battle") {
      if (!battle) return Response.json({ error: "Your group is not in a battle." }, { status: 409 });
      const character = group.characters.find((candidate) => candidate.id === body.characterId);
      if (!character || character.hp <= 0) return Response.json({ error: "Choose a living character to take this turn." }, { status: 400 });
      if (battle.actedCharacterIds.includes(character.id)) return Response.json({ error: "That character has already acted this round." }, { status: 409 });
      if (nextBattleActor(group, battle) !== character.id) return Response.json({ error: "Wait for the faster party members and monster to take their turns first." }, { status: 409 });
      let message = "";
      let effectHit = true;
      let effectDamage = 0;
      let healedAmount: number | undefined;
      let battleEnd: BattleEnd | undefined;
      if (body.move === "guard") {
        if (character.characterClass !== "Warrior") return Response.json({ error: "Only a Warrior can guard." }, { status: 400 });
        character.guarding = true;
        message = `${character.name} braces for the next hit.`;
      } else if (body.move === "heal") {
        if (character.characterClass !== "Mage") return Response.json({ error: "Only a Mage can cast healing." }, { status: 400 });
        const target = group.characters.find((hero) => hero.id === body.targetCharacterId && hero.hp > 0);
        if (!target) return Response.json({ error: "Choose a living ally to heal." }, { status: 400 });
        const healed = Math.min(5, target.maxHp - target.hp);
        if (healed === 0) return Response.json({ error: `${target.name} is already at full health.` }, { status: 409 });
        target.hp += healed;
        healedAmount = healed;
        message = `${character.name} heals ${target.name} for ${healed} HP.`;
      } else if (body.move === "steal") {
        if (character.characterClass !== "Thief") return Response.json({ error: "Only a Thief can use this skill." }, { status: 400 });
        group.stats.gold += 8;
        effectDamage = Math.max(1, Math.floor(character.damage / 2));
        battle.hp -= effectDamage;
        message = `${character.name} mugs the monster for 8 gold!`;
      } else if (body.move === "double") {
        if (character.characterClass !== "Archer") return Response.json({ error: "Only an Archer can use this skill." }, { status: 400 });
        const damage = Math.max(1, Math.floor(character.damage * 0.65));
        const threshold = hitChance(character.dexterity);
        const dice = [Math.floor(Math.random() * 100) + 1, Math.floor(Math.random() * 100) + 1];
        const hits = dice.filter((roll) => roll <= threshold).length;
        effectHit = hits > 0;
        effectDamage = damage * hits;
        addRoll(room.state, { groupId: group.id, actor: character.name, label: "Dual shot", dice, modifier: 0, total: hits, target: threshold, success: hits > 0, sides: 100 });
        battle.hp -= effectDamage;
        message = hits ? `${character.name} lands ${hits} arrow${hits === 1 ? "" : "s"} for ${damage * hits} damage.` : `${character.name}'s arrows miss.`;
      } else if (body.move === "attack") {
        const threshold = hitChance(character.dexterity);
        const roll = Math.floor(Math.random() * 100) + 1;
        effectHit = roll <= threshold;
        addRoll(room.state, { groupId: group.id, actor: character.name, label: "Attack", dice: [roll], modifier: 0, total: roll, target: threshold, success: roll <= threshold, sides: 100 });
        if (!effectHit) message = `${character.name}'s attack misses.`;
        else {
          const bonusRoll = Math.floor(Math.random() * 3);
          addRoll(room.state, { groupId: group.id, actor: character.name, label: "Attack damage bonus", dice: [bonusRoll + 1], modifier: -1, total: bonusRoll, target: 0, success: true, sides: 3 });
          const damage = Math.max(1, Math.floor(character.damage * 0.65) + bonusRoll);
          effectDamage = damage;
          battle.hp -= damage;
          message = `${character.name} attacks for ${damage} damage.`;
        }
      } else if (body.move === "run") {
        const roll = Math.floor(Math.random() * 100) + 1;
        const escaped = roll <= RUN_ESCAPE_CHANCE;
        addRoll(room.state, { groupId: group.id, actor: character.name, label: "Escape", dice: [roll], modifier: 0, total: roll, target: RUN_ESCAPE_CHANCE, success: escaped, sides: 100 });
        if (escaped) {
          // Back to the tile they came from. The monster stays undefeated, so stepping back starts a new battle.
          const floor = floorFor(room, battle.floor);
          const previous = floor.tiles.find((tile) => tile.id === battle.retreatTileId)
            ?? floor.tiles.find((tile) => Math.abs(tile.x - group.stats.x) + Math.abs(tile.y - group.stats.y) === 1 && tile.kind !== "exit" && (!tile.enemy || floor.defeated.includes(tile.id)));
          if (previous) {
            group.stats.x = previous.x;
            group.stats.y = previous.y;
          }
          delete room.state.battles[group.id];
          addFeed(room.state, `${group.name} escaped the battle.`);
          battleEnd = { id: id(), result: "escaped", enemy: battle.enemy };
          await saveRoom(room);
          return Response.json({ state: publicState(room, { playerId: group.id }), battleEnd });
        }
        message = `${character.name} could not escape!`;
      } else return Response.json({ error: "Unknown battle action." }, { status: 400 });

      const effectKind = character.characterClass === "Warrior" ? "sword-slash"
        : character.characterClass === "Archer" ? "arrow-volley"
          : character.characterClass === "Thief" ? "dagger-strike" : "magic-blast";
      const battleEffect: BattleEffect | undefined = ["attack", "double", "heal", "steal"].includes(body.move)
        ? { id: id(), actorId: character.id, actorName: character.name, characterClass: character.characterClass, kind: effectKind, hit: effectHit, damage: effectDamage, ...(healedAmount !== undefined ? { healed: healedAmount } : {}) }
        : undefined;
      let monsterAttackEffect: MonsterAttack | undefined;
      battle.actedCharacterIds.push(character.id);
      if (battle.hp <= 0) {
        const reward = resolveBattleVictory(room, group, battle, character, message);
        battleEnd = { id: id(), result: "victory", enemy: battle.enemy, gold: reward };
      } else {
        if (nextBattleActor(group, battle) === MONSTER_TURN_ID) {
          const attack = monsterAttack(group, battle, character);
          monsterAttackEffect = attack;
          battle.actedCharacterIds.push(MONSTER_TURN_ID);
          message += ` ${describeMonsterAttack(group, battle.enemy, attack)}`;
          refreshGroupStats(group);
          checkGameOver(room, group);
          if (group.gameOver) battleEnd = { id: id(), result: "defeat", enemy: battle.enemy };
        }
        completeBattleRound(group, battle);
        if (!monsterAttackEffect && !battleEnd) {
          const turnsRemain = livingCharacters(group).filter((hero) => !battle.actedCharacterIds.includes(hero.id)).length;
          if (turnsRemain) message += ` ${turnsRemain} initiative turn(s) remain this round.`;
        }
        addFeed(room.state, message);
      }
      await saveRoom(room);
      return Response.json({ state: publicState(room, { playerId: group.id }), ...(battleEffect ? { battleEffect } : {}), ...(monsterAttackEffect ? { monsterAttack: monsterAttackEffect } : {}), ...(battleEnd ? { battleEnd } : {}) });
    }
    if (body.action === "advance-battle") {
      if (!battle) return Response.json({ error: "Your group is not in a battle." }, { status: 409 });
      const nextActor = nextBattleActor(group, battle);
      if (nextActor === undefined) {
        battle.actedCharacterIds = [];
        await saveRoom(room);
        return Response.json({ state: publicState(room, { playerId: group.id }) });
      }
      if (nextActor !== MONSTER_TURN_ID) return Response.json({ error: "It is not the monster's turn." }, { status: 409 });
      const firstHero = livingCharacters(group).sort((first, second) => second.speed - first.speed)[0];
      if (!firstHero) return Response.json({ error: "Revive a hero before the monster can attack." }, { status: 409 });
      const attack = monsterAttack(group, battle, firstHero);
      battle.actedCharacterIds.push(MONSTER_TURN_ID);
      refreshGroupStats(group);
      checkGameOver(room, group);
      const battleEnd: BattleEnd | undefined = group.gameOver ? { id: id(), result: "defeat", enemy: battle.enemy } : undefined;
      addFeed(room.state, describeMonsterAttack(group, battle.enemy, attack));
      completeBattleRound(group, battle);
      await saveRoom(room);
      return Response.json({ state: publicState(room, { playerId: group.id }), monsterAttack: attack, ...(battleEnd ? { battleEnd } : {}) });
    }
    if (body.action === "item") {
      let battleEnd: BattleEnd | undefined;
      let monsterAttackEffect: MonsterAttack | undefined;
      if (battle && battle.groupId !== group.id) return Response.json({ error: "Only your group can use an item during its battle." }, { status: 409 });
      const index = group.stats.inventory.indexOf(body.item);
      if (index < 0) return Response.json({ error: "That item is not in your inventory." }, { status: 400 });
      const actor = battle ? group.characters.find((hero) => hero.id === body.characterId && hero.hp > 0) : undefined;
      if (actor && battle?.actedCharacterIds.includes(actor.id)) return Response.json({ error: "That character has already acted this round." }, { status: 409 });
      if (battle && actor && nextBattleActor(group, battle) !== actor.id) return Response.json({ error: "Wait for the faster party members and monster to take their turns first." }, { status: 409 });
      if (battle && body.characterId && !actor) return Response.json({ error: "Choose a living character to use this item." }, { status: 400 });
      if (battle && body.item !== "phoenix-feather" && !actor) return Response.json({ error: "Wait for a hero's turn before using that item." }, { status: 409 });
      if (body.item === "bomb") {
        if (!battle) return Response.json({ error: "Bombs can only be used during a battle." }, { status: 409 });
        if (!actor) return Response.json({ error: "Choose a living character to throw the Bomb." }, { status: 400 });
        battle.hp = Math.max(0, battle.hp - 12);
        group.stats.inventory.splice(index, 1);
        battle.actedCharacterIds.push(actor.id);
        const battleEffect: BattleEffect = { id: id(), actorId: actor.id, actorName: actor.name, characterClass: actor.characterClass, kind: "bomb-blast", hit: true, damage: 12 };
        let message = `${actor.name} throws a Bomb for 12 damage!`;
        if (battle.hp <= 0) {
          const reward = resolveBattleVictory(room, group, battle, actor, message);
          battleEnd = { id: id(), result: "victory", enemy: battle.enemy, gold: reward };
        } else if (nextBattleActor(group, battle) === MONSTER_TURN_ID) {
          const attack = monsterAttack(group, battle, actor);
          monsterAttackEffect = attack;
          battle.actedCharacterIds.push(MONSTER_TURN_ID);
          refreshGroupStats(group);
          checkGameOver(room, group);
          if (group.gameOver) battleEnd = { id: id(), result: "defeat", enemy: battle.enemy };
          message += ` ${describeMonsterAttack(group, battle.enemy, attack)}`;
        }
        if (battle.hp > 0) completeBattleRound(group, battle);
        addFeed(room.state, message);
        await saveRoom(room);
        return Response.json({ state: publicState(room, { playerId: group.id }), battleEffect, ...(monsterAttackEffect ? { monsterAttack: monsterAttackEffect } : {}), ...(battleEnd ? { battleEnd } : {}) });
      }
      const target = group.characters.find((hero) => hero.id === body.targetCharacterId);
      if (body.item === "potion") {
        if (!target || target.hp <= 0) return Response.json({ error: "Choose a living character to receive the Healing Potion." }, { status: 400 });
        target.hp = Math.min(target.maxHp, target.hp + 8);
      } else if (body.item === "phoenix-feather") {
        if (!target || target.hp > 0) return Response.json({ error: "Choose a fallen character to revive with the Phoenix Feather." }, { status: 400 });
        target.hp = Math.ceil(target.maxHp / 2);
      } else return Response.json({ error: "That item cannot be used yet." }, { status: 400 });
      group.stats.inventory.splice(index, 1);
      refreshGroupStats(group);
      if (!livingCharacters(group).length && !group.stats.inventory.includes("phoenix-feather")) {
        checkGameOver(room, group);
        await saveRoom(room);
        return Response.json({ state: publicState(room, { playerId: group.id }) });
      }
      if (!battle) addFeed(room.state, `${group.name} used a ${body.item === "potion" ? "Healing Potion" : "Phoenix Feather"} on ${target.name}.`);
      if (battle) {
        if (actor) {
          battle.actedCharacterIds.push(actor.id);
          if (nextBattleActor(group, battle) === MONSTER_TURN_ID) {
            const attack = monsterAttack(group, battle, actor);
            monsterAttackEffect = attack;
            battle.actedCharacterIds.push(MONSTER_TURN_ID);
            refreshGroupStats(group);
            checkGameOver(room, group);
            if (group.gameOver) battleEnd = { id: id(), result: "defeat", enemy: battle.enemy };
            addFeed(room.state, `${group.name} used an item on ${target.name}. ${describeMonsterAttack(group, battle.enemy, attack)}`);
          } else addFeed(room.state, `${group.name} used an item on ${target.name}.`);
          completeBattleRound(group, battle);
        } else addFeed(room.state, `${group.name} used an item on ${target.name}.`);
      }
      await saveRoom(room);
      return Response.json({ state: publicState(room, { playerId: group.id }), ...(monsterAttackEffect ? { monsterAttack: monsterAttackEffect } : {}), ...(battleEnd ? { battleEnd } : {}) });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
}
