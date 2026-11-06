// Every item a party can carry. Prices apply when buying from the merchant, and the server checks them.
export type ItemId = "potion" | "party-tonic" | "smoke-bomb" | "bomb" | "phoenix-feather";
export type ItemInfo = { name: string; description: string; effect: string; price: number; merchantLine: string };

export const ITEMS: Record<ItemId, ItemInfo> = {
  potion: { name: "Healing Potion", description: "Restore up to 8 HP", effect: "Restores up to 8 HP to one living hero.", price: 15, merchantLine: "Brewed it myself. Mostly herbs." },
  "party-tonic": { name: "Party Tonic", description: "Restore 5 HP to every living hero", effect: "Restores up to 5 HP to every living hero at once.", price: 30, merchantLine: "One sip each, and share nicely." },
  "smoke-bomb": { name: "Smoke Bomb", description: "Escape a battle for certain", effect: "Escapes from a battle without fail. The monster stays where it is.", price: 40, merchantLine: "Throw it and run. Do not wait to watch." },
  bomb: { name: "Bomb", description: "Deal 12 battle damage", effect: "Deals 12 damage to a monster during battle.", price: 50, merchantLine: "Careful with that one. Point it away from me." },
  "phoenix-feather": { name: "Phoenix Feather", description: "Revive a fallen hero", effect: "Revives one fallen hero at half health.", price: 100, merchantLine: "My rarest stock. It has saved many a fool." },
};
export const SHOP_ITEMS = (Object.keys(ITEMS) as ItemId[]).sort((first, second) => ITEMS[first].price - ITEMS[second].price);
export function isItemId(value: string): value is ItemId { return Object.hasOwn(ITEMS, value); }
export const PARTY_TONIC_HEAL = 5;
