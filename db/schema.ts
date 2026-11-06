import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  teacherToken: text("teacher_token").notNull(),
  phase: text("phase").notNull().default("lobby"),
  gameState: text("game_state").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("idx_rooms_updated_at").on(table.updatedAt)]);

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  roomCode: text("room_code").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull().default("Warrior"),
  characterState: text("character_state").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_players_room_code").on(table.roomCode)]);

export const mapTemplates = sqliteTable("map_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tiles: text("tiles").notNull(),
  starts: text("starts").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_map_templates_created_at").on(table.createdAt)]);

export const creatureDesigns = sqliteTable("creature_designs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  characterClass: text("character_class"),
  color: text("color").notNull(),
  trimColor: text("trim_color").notNull().default("#d7d1c7"),
  colors: text("colors").notNull().default("{}"),
  parts: text("parts").notNull(),
  stats: text("stats").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_creature_designs_kind_created_at").on(table.kind, table.createdAt)]);
