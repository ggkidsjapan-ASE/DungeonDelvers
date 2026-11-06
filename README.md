# Dungeon Delvers

Dungeon Delvers is a cooperative classroom dungeon adventure. A host opens an expedition and displays the shared dungeon board. Up to eight student groups join from their own devices, build parties of up to four heroes, and explore the same three-floor dungeon at their own pace.

## Play online

Open [Dungeon Delvers](https://dungeon-divers.ggkids-japan-428.workers.dev/) to host an expedition or use a room link from your host. No student accounts are required.

## Goal of the game

Each group explores three floors, finds each floor's key, and reaches the stairway to descend. On the final floor, defeat the boss to claim the key and escape through the exit. A group that escapes has finished its run; the other groups can continue. The expedition ends when every group has escaped or been defeated.

Discoveries are shared on the host's map, while each group has its own location, heroes, health, gold, and inventory. Groups can explore simultaneously, but only one group can fight a particular monster at a time.

## Hosting an expedition

1. On the home page, optionally choose a saved map. You can also open the Map Maker, Character Creator, or Monster Creator before play.
2. Select **Host an expedition**. A room code and QR code appear on the host screen.
3. Have each group scan the QR code or open the join link. If the QR code is unavailable, use **Copy join link** on the host screen; the room code is part of that link.
4. Each group creates its name and selects one to four heroes. The host screen shows which groups have joined.
5. Select **Enter the dungeon** when everyone is ready.
6. Keep the host screen open to follow the shared map, party health, active battles, dice rolls, and expedition log.

There can be up to eight groups of up to four heroes in one expedition, for a maximum of 32 heroes. A group can join only while the host is in the lobby. **Return to lobby** resets the expedition's floor progress, group gold, hero levels, and inventory, then lets the host start again with the same room and groups.

## Joining and building a party

Give your group a name, then create one to four heroes:

- Choose a class, set a hero name, and select a sprite color.
- Choose a saved character design, make a new hero, or use **Choose a random hero**.
- For a new hero, roll stats and assign the three results to Damage, Accuracy, and Speed. Each result is 2d6 + 3, so every stat is between 5 and 15. Damage is how hard attacks hit, Accuracy is the chance to land an attack, and Speed dodges traps and monster attacks and decides who acts first. Reroll if you want, then assign each result to a different stat.
- Saved character designs use their saved stats, capped to the 5–15 range. Changing a selected hero's class clears the design and its stats, so roll new stats before joining.
- Each hero needs a unique name within the group.

Every hero starts with full class-based HP, regardless of their rolled stats:

| Class | Starting HP | Class ability |
| --- | ---: | --- |
| Warrior | 25 | **Guard** to reduce the next hit against the guarding hero. |
| Thief | 15 | **Mug** a monster for 8 gold while dealing damage. |
| Archer | 15 | **Dual shot** fires two independently checked arrows. |
| Mage | 20 | **Heal** a living ally of your choice. |

All parties begin with two Healing Potions and one Phoenix Feather. Hero stats affect battle and traps; a hero's class determines their starting HP and class ability.

## Exploring

The player screen shows a first-person view, movement controls, a minimap, party status, inventory, and recent events.

- Use the directional pad to move forward or backward and turn left or right. You can also open the larger map and move to an adjacent tile from there.
- Only neighboring tiles are reachable in one move. The minimap reveals nearby paths; entering a tile reveals its contents.
- Each group explores independently. The host board tracks parties and shared discoveries. Defeated monsters remain marked as corpses.
- Find the floor key before descending. Your group can stand on the exit before finding the key, but must return to it after the key is found to continue.
- The Bestiary and Bounties buttons open book-style overlays. Select an entry to read it, then close the book to return to the game. The player-side Items tab explains the available items.

### Floors, keys, and monsters

Floor 3 is always one of five large built-in mazes (`app/boss-floors.ts`), chosen at random: The Coiled Descent, The Serpent Galleries, The Hollow Warrens, The Winding Catacombs, or The Sundered Halls. They hold more monsters and traps than other floors, and the exit can only be reached through the boss. Floors 1 and 2 use generated layouts unless saved custom maps are available. The host can select a map to guarantee it is used on floor 1. Up to two saved maps may be used across those floors; if the host selects none, maps are chosen randomly. A key chamber in a generated floor is guarded by a random monster from the library; custom maps have a key tile without a required guardian. The third floor is a randomly selected boss dungeon with a chest, a trap, a regular monster, a boss, and the exit.

All regular monsters come from the saved Monster Creator library; if the library is empty, rooms are empty and keys are unguarded. The final floor uses one of five hand-drawn bosses: The Hollow King, Maw of Greed, The Unblinking, Cinderheart, or Gloomfang Bloom. In the Bestiary, each creature's entry includes its description, damage range, Speed, and bounty. The Bounty Ledger focuses on the reward rather than repeating the monster's combat stats.

### Traps and treasure

- Each living hero rolls separately when the group triggers a trap: **d20 + Speed**. A total of **20 or higher** dodges it; otherwise that hero takes **4 damage**. Each group triggers a given trap once.
- A chest gives one random reward: **10–25 gold**, a Healing Potion, a Phoenix Feather, or a Bomb.

## Battles

Entering an undefeated monster's tile starts a battle for that group. The battle screen shows the monster's health, damage range, Speed, party health, initiative order, and available actions.

1. Turns are ordered by Speed, fastest first. Each living hero and the monster gets one turn per round; the monster may act before some heroes if its Speed is higher.
2. On a hero's turn, choose **Attack**, the class ability, **Guard** (Warrior only), or **Run**. Heroes who are waiting for their initiative turn cannot act yet.
3. Attacks use Accuracy to determine hit chance: **50% + 3% for each point of Accuracy above 10**, with a minimum of 35% and maximum of 90%. A successful basic attack deals 65% of the hero's Damage stat, rounded down, plus a random 0–2 damage.
4. When the monster's turn arrives, it attacks a living hero (a boss also strikes up to two more). Each target has a **Speed × 3%** chance to dodge it and take no damage (15% at Speed 5, 30% at Speed 10, 45% at Speed 15). Guard reduces the next hit by 2 damage.
5. Defeating a monster awards its bounty as group gold and XP to the hero who lands the final blow. A hero levels up at 20 XP per current level; each level adds 1 maximum HP, Damage, Accuracy, and Speed. Damage cannot exceed 20; Accuracy and Speed cannot exceed 18.

Class abilities:

- **Warrior — Guard:** brace to reduce the next incoming hit by 2 additional damage.
- **Thief — Mug:** gain 8 gold and deal damage equal to half the Thief's Damage stat, rounded down (minimum 1).
- **Archer — Dual shot:** fire two arrows; each arrow has its own hit check and deals 65% of the Archer's Damage stat, rounded down (minimum 1).
- **Mage — Heal:** choose a living, injured ally and restore up to 5 HP. It deals no damage.

**Running** has a **10%** chance to work (d100, 10 or lower) and returns the party to the tile they came from; otherwise the hero's turn is spent and the battle continues. The monster stays on its tile, so stepping back onto it starts a new battle against a monster at full health.

Regular monsters scale with group size: 12 HP and 0.75× damage against one hero, 20 HP and 1× against two, 35 HP and 1.25× against three, and 50 HP and 1.75× against four. Their hits never exceed 10 damage, so they cannot take out a healthy hero in one blow. Bosses do not scale: they always have 90 HP and their listed damage, and each attack strikes up to three heroes, with each hero rolling their own damage and dodge. The battle screen shows the actual damage; saved monster designs and the Bestiary keep their original values. Monsters use their own Speed.

## Items, defeat, and rewards

Inventory belongs to the group and can be opened from the player screen:

| Item | Merchant price | Effect |
| --- | ---: | --- |
| Healing Potion | 15 gold | Restore up to 8 HP to one living hero. |
| Party Tonic | 30 gold | Restore up to 5 HP to every living hero. |
| Smoke Bomb | 40 gold | Escape from a battle without fail. The monster stays on its tile. |
| Bomb | 50 gold | Deal 12 damage to a monster during battle. |
| Phoenix Feather | 100 gold | Revive one fallen hero at half of their maximum HP. |

The merchant is in the side panel while exploring. Groups can trade with him at any time outside a battle, spending their own gold. Prices are set in `app/items.ts`.

Potions, Party Tonics, and Phoenix Feathers can be used outside battle when their target is valid; Bombs and Smoke Bombs can only be used during battle. In battle, a Potion, Party Tonic, or Bomb uses the active hero's turn. A Phoenix Feather can revive a fallen hero even when it is not a living hero's turn. A group is defeated only when all of its heroes are down and it has no Phoenix Feather left. Other groups are unaffected and can carry on.

Monster bounties award gold on victory; chests can add gold or items. Gold is tracked per group and contributes to the expedition total, so gold spent at the merchant no longer counts towards it.

## Workshop: saved content

Workshop libraries are available from the home page. Maps and designs are shared by everyone using the same game deployment.

### Map Maker

Create a connected map on a 13 × 13 grid using the path, start, monster, chest, trap, key, exit, and erase tools.

- Every path tile is walkable. Connected clusters of path tiles form rooms; no separate room brush is needed.
- A valid map must have connected tiles, at least one starting point on an unoccupied path tile, exactly one key, and exactly one exit.
- Place monsters, chests, and traps on separate tiles. The map's monster brush offers monsters from the library. If a placed monster is later deleted, starting a game swaps in another library monster.
- Save, edit, select, or delete maps in the library. A selected map is guaranteed to be floor 1 in the next expedition. Up to one additional saved map may be randomly used on floor 2; if no map is selected, saved maps may be randomly used on either floor.

### Character Creator

Create class-specific characters for students to select when forming a party. Choose a class, name, head, torso, arms, legs, and colors, then roll and assign Damage, Accuracy, and Speed. Character body-part choices differ by class; for example, Warriors can wear plate armor and Archers can wear a feathered Robin Hood–style hat. Each part can be colored independently. Saved designs retain their appearance and rolled stats until edited.

### Monster Creator

Assemble a monster from head, torso, arms, legs, tail, and wings. Choose each part's color, then roll the monster's damage range, Speed, and bounty. The damage range uses one d6 for minimum damage and two d6 added together for maximum damage; Speed is 3d6 and bounty is 5 × 2d6. Saved creatures are added to the Bestiary and can appear as regular monsters in future procedurally generated encounters. They do not replace the built-in boss encounters.

## Music and interface

Use the music controls at the top of the screen to play or pause the background music and switch between the **Dungeon** and **Rune** tracks. The audio files are in `public/music/`.

## Saving and privacy

- The expedition room, group progress, saved maps, and saved designs are stored in the game's database.
- The host's browser stores its room identity, and each player group is remembered in its browser tab. Keep the host browser and player tabs open during play; refreshing a player page in the same tab preserves that group's identity. A new player tab has a separate identity.
- Rooms inactive for more than 24 hours may be cleaned up when a new expedition is created.
- No student accounts are required. Group and hero names are visible to the other participants in the room; use classroom-appropriate display names and avoid personal information.
- Saved maps and designs are shared within the deployment's library. The creator library is not an individual student account or private workspace.
- Deleting a saved map or design requires the delete key. The server checks it against a SHA-256 hash in `app/delete-key.ts`, which also explains how to change the key.

## Run locally in a classroom

The hosted site above can be used on devices with internet access. To run a local copy, the host computer and student devices must be on the same Wi-Fi network.

### Windows

1. Install Node.js 22.13 or newer on the host computer.
2. Double-click `START_GAME.bat`.
3. On first launch, the script installs dependencies, builds the game, and prepares a local database. This can take several minutes.
4. Keep the command window open. Use the classroom address printed in that window on student devices. If Windows Firewall asks, allow access on private networks.

### macOS

1. Install Node.js 22.13 or newer on the host computer.
2. Double-click `START_GAME.command`. If macOS blocks it, allow the script to run in Privacy & Security settings.
3. On first launch, the script installs dependencies, builds the game, and prepares a local database. This can take several minutes.
4. Keep the Terminal window open and use the displayed classroom address on student devices.

If devices on the same Wi-Fi cannot open the local address, the school network may prevent device-to-device connections. Test before class; a private hotspot is a possible backup.

## Deploy changes to Cloudflare

The Cloudflare login is stored on your computer, not in the project ZIP. On a new Windows computer, install Node.js 22.13 or newer, unzip the project, then double-click `SETUP_AND_DEPLOY.bat`. The script installs project dependencies, opens the Cloudflare browser login if needed, then builds and deploys the app. Sign in to the Cloudflare account that owns the existing Dungeon Delvers deployment when prompted.

After the first run, double-clicking the same file again repeats the setup check and deploys your latest changes.

The production database ID is configured in `scripts/deploy-cloudflare.mjs`. The script targets the existing Cloudflare account, Worker, and database; it does not create a new Cloudflare project or apply database migrations. If you are deploying under a different Cloudflare account, that account needs its own Worker and D1 database setup before deployment.

### Developer commands

This project uses Node.js 22.13+, pnpm 11.25, vinext, and Wrangler. Useful commands from the project directory:

```text
pnpm install
pnpm dev
pnpm build
pnpm lint
```

The classroom launch scripts run Wrangler locally with a persistent local D1 database. The production build is deployed as a Cloudflare Worker.
