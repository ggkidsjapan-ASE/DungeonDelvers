#!/usr/bin/env python3
"""Generates the pixel-art dungeon assets in public/ui. Run: python3 scripts/generate-ui-art.py

Uses only the standard library and a fixed seed, so the output is repeatable.
"""
import math
import os
import random
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "ui")
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def clamp(value):
    return max(0, min(255, int(value)))


def save_png(name, width, height, pixels):
    """pixels is a list of (r, g, b, a) tuples in rows."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixels[y * width + x])

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    with open(os.path.join(OUT, name), "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def stone_blocks(width, height, block_w, block_h, seed, base=38):
    """Returns brightness values for a tile of uneven stone blocks with dark mortar."""
    rng = random.Random(seed)
    tones = {}
    values = [0.0] * (width * height)
    for y in range(height):
        row = y // block_h
        offset = (row % 2) * block_w // 2
        for x in range(width):
            column = ((x + offset) % width) // block_w
            key = (row, column)
            if key not in tones:
                tones[key] = base + rng.randint(-9, 9)
            local_x = (x + offset) % width % block_w
            local_y = y % block_h
            if local_y == 0 or local_x == 0:
                value = 5
            elif local_y == 1 or local_x == 1:
                value = tones[key] + 15
            elif local_y == block_h - 1 or local_x == block_w - 1:
                value = tones[key] - 15
            else:
                value = tones[key] + rng.randint(-5, 5)
                if rng.random() < 0.012:
                    value -= 18
            values[y * width + x] = value
    return values


def cold(value):
    return (clamp(value * 0.98), clamp(value * 0.97), clamp(value * 1.06), 255)


def make_textures():
    wall = stone_blocks(128, 128, 32, 16, 11, base=30)
    save_png("stone-wall.png", 128, 128, [cold(value) for value in wall])

    slab = random.Random(21)
    panel = []
    for y in range(64):
        for x in range(64):
            value = 17 + slab.randint(-3, 3)
            if slab.random() < 0.01:
                value -= 6
            panel.append((clamp(value * 1.0), clamp(value * 0.97), clamp(value * 0.97), 255))
    save_png("panel-stone.png", 64, 64, panel)

    floor = stone_blocks(32, 32, 16, 16, 31, base=46)
    save_png("floor-tile.png", 32, 32, [cold(value) for value in floor])


def make_frame():
    """A riveted iron band for CSS border-image: 30px tile, 10px slice, transparent centre."""
    size = 30
    band = 10
    rng = random.Random(41)
    pixels = []
    for y in range(size):
        for x in range(size):
            edge = min(x, y, size - 1 - x, size - 1 - y)
            if edge >= band:
                pixels.append((0, 0, 0, 0))
                continue
            if edge == 0 or edge == band - 1:
                pixels.append((3, 3, 4, 255))
                continue
            value = 46 + rng.randint(-5, 5)
            if edge == 1:
                value += 26
            if edge == band - 2:
                value -= 16
            pixels.append((clamp(value), clamp(value), clamp(value * 1.06), 255))
    for cx, cy in ((4, 4), (size - 5, 4), (4, size - 5), (size - 5, size - 5)):
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if abs(dx) + abs(dy) > 3:
                    continue
                shade = 112 if dx + dy < 0 else 60 if dx + dy == 0 else 26
                pixels[(cy + dy) * size + cx + dx] = (shade, shade, clamp(shade * 1.05), 255)
    save_png("frame.png", size, size, pixels)


FLAME = {"R": (168, 40, 14, 255), "O": (232, 104, 26, 255), "Y": (250, 188, 66, 255), "W": (255, 238, 170, 255), "I": (58, 58, 64, 255), "i": (26, 26, 30, 255), "H": (108, 108, 116, 255), "B": (70, 44, 26, 255), "b": (40, 24, 14, 255), "K": (0, 0, 0, 255)}
TORCH_FRAMES = [
    ["......R.........", ".....RO.........", "....RROO........", "....ROOYR.......", "...RROYYO.......", "...ROYYWYO......", "...ROYWWYO......", "....OYWWO.......", "....RYYYR.......", ".....BBB........"],
    [".........R......", "........OR......", ".......ROOR.....", "......ROYOR.....", "......OYYOR.....", ".....OYWYYR.....", ".....OYWWYOR....", ".....OYWWYO.....", "......RYYR......", "......BBB......."],
    ["........R.......", ".......ROR......", "......ROOR......", ".....ROYYOR.....", ".....OYYYOR.....", "....ROYWYYOR....", "....ROYWWYOR....", ".....OYWWYO.....", "......RYYYR.....", "......BBB......."],
    [".......R........", "......RO........", "......ROO.......", ".....ROYOR......", ".....OYYOR......", "....ROYWYOR.....", ".....OYWWYO.....", ".....OYWYO......", "......YYYR......", "......BBB......."],
]
TORCH_BODY = ["......BBBB......", "......BbBB......", ".....IIIIII.....", "....IHIIIIII....", ".....IiiiiI.....", "......BbBB......", "......BbBB......", "......BbBB......", ".....IIIIII.....", "......iiii......", ".......BB.......", ".......Bb.......", ".......Bb.......", ".......bb......."]


def make_torch():
    """Four-frame sprite sheet; each frame is 16 x 24."""
    width, height = 64, 24
    pixels = [(0, 0, 0, 0)] * (width * height)
    for frame, rows in enumerate(TORCH_FRAMES):
        for y, row in enumerate(rows + TORCH_BODY[:14]):
            for x, char in enumerate(row):
                if char != "." and y < height:
                    pixels[y * width + frame * 16 + x] = FLAME[char]
    save_png("torch.png", width, height, pixels)


def make_gate():
    """A stone arch with an iron portcullis over black stairs going down."""
    width, height = 120, 150
    rng = random.Random(51)
    stone = stone_blocks(width, height, 14, 9, 52, base=44)
    pixels = [(0, 0, 0, 0)] * (width * height)
    cx, spring, outer, inner = 60, 62, 58, 40
    for y in range(height):
        for x in range(width):
            dx = x - cx
            if y < spring:
                radius = math.hypot(dx, spring - y)
            else:
                radius = abs(dx)
            if radius > outer:
                continue
            if radius >= inner:
                value = stone[y * width + x]
                depth = (radius - inner) / (outer - inner)
                value = value * (0.72 + 0.5 * depth)
                if radius < inner + 2:
                    value = 8
                pixels[y * width + x] = cold(value)
                continue
            # The dark passage: stairs catch a little firelight, fading into black.
            value = 2
            if y > 96:
                step = (y - 96) // 7
                if (y - 96) % 7 < 2:
                    value = 40 - (9 - step) * 3
                else:
                    value = 14 + step * 2
            warm = max(0.0, (y - 74) / 76)
            pixels[y * width + x] = (clamp(value * (1 + warm)), clamp(value * (0.72 + warm * 0.2)), clamp(value * 0.5), 255)
    for x in range(cx - 39, cx + 40):
        for y in range(spring - 42, 92):
            dx = x - cx
            radius = math.hypot(dx, spring - y) if y < spring else abs(dx)
            if radius >= inner - 1:
                continue
            on_bar = (x - cx + 40) % 13 in (0, 1, 2)
            on_rail = (y - spring + 42) % 18 in (0, 1)
            if on_bar or on_rail:
                edge = (x - cx + 40) % 13 == 0 or (y - spring + 42) % 18 == 0
                value = 96 if edge else 48
                pixels[y * width + x] = (value, value, clamp(value * 1.08), 255)
    for tip in range(cx - 39, cx + 40, 13):
        for rise in range(5):
            for x in range(tip + rise // 2, tip + 3 - rise // 2):
                pixels[(92 + rise) * width + x] = (58, 58, 64, 255)
    for y in range(spring - outer, spring - outer + 8):
        for x in range(cx - 7, cx + 8):
            if abs(x - cx) + (y - (spring - outer)) // 2 < 8:
                value = 70 + rng.randint(-6, 6)
                pixels[y * width + x] = cold(value)
    save_png("gate.png", width, height, pixels)


# First-person views: a small raycaster, lit by torches, posterised and dithered like an old RPG.
WALL_TEXTURE = stone_blocks(64, 64, 32, 16, 61, base=78)
FLOOR_TEXTURE = stone_blocks(64, 64, 32, 32, 62, base=62)
CEILING_TEXTURE = stone_blocks(64, 64, 32, 32, 63, base=30)


def render(name, open_cells, lights, camera=(0.5, 0.15), sconces=(), width=320, height=168):
    fov = math.tan(math.radians(33))
    pixels = []
    columns = []
    for screen_x in range(width):
        ray_x = ((screen_x + 0.5) / width * 2 - 1) * fov
        ray_y = 1.0
        map_x, map_y = math.floor(camera[0]), math.floor(camera[1])
        step_x = 1 if ray_x > 0 else -1
        step_y = 1
        delta_x = abs(1 / ray_x) if ray_x else 1e9
        delta_y = 1.0
        side_x = ((map_x + 1 - camera[0]) if ray_x > 0 else (camera[0] - map_x)) * delta_x
        side_y = (map_y + 1 - camera[1]) * delta_y
        side = 0
        for _ in range(40):
            if side_x < side_y:
                side_x += delta_x
                map_x += step_x
                side = 0
            else:
                side_y += delta_y
                map_y += step_y
                side = 1
            if (map_x, map_y) not in open_cells:
                break
        dist = (side_x - delta_x) if side == 0 else (side_y - delta_y)
        dist = max(dist, 0.001)
        hit_x = camera[0] + ray_x * dist
        hit_y = camera[1] + ray_y * dist
        columns.append((dist, side, hit_x, hit_y, ray_x))

    def light_at(px, py, pz):
        red = green = blue = 0.0
        for lx, ly, lz, power in lights:
            distance2 = (px - lx) ** 2 + (py - ly) ** 2 + (pz - lz) ** 2
            amount = power / (0.28 + distance2 * 1.5)
            red += amount * 1.0
            green += amount * 0.56
            blue += amount * 0.26
        return red + 0.012, green + 0.012, blue + 0.02

    half = height / 2
    scale = width / (2 * fov) * (height / (width / 1.905)) * 0.82
    for y in range(height):
        for x in range(width):
            dist, side, hit_x, hit_y, ray_x = columns[x]
            line = scale / dist
            top = half - line * 0.5
            bottom = half + line * 0.5
            if top <= y < bottom:
                pz = 1 - (y - top) / max(line, 1)
                along = hit_y if side == 0 else hit_x
                tex_x = int(along * 64) % 64
                tex_y = int(pz * 64) % 64
                value = WALL_TEXTURE[tex_y * 64 + tex_x]
                nudge = 0.06
                if side == 0:
                    px, py = hit_x - (nudge if ray_x > 0 else -nudge), hit_y
                else:
                    px, py = hit_x, hit_y - nudge
                emit = None
                for sx, sy in sconces:
                    if side == 0 and abs(hit_x - sx) < 0.02:
                        offset = hit_y - sy
                        lift = pz - 0.6
                        if abs(offset) < 0.17 - lift * 0.9 and -0.05 < lift < 0.15:
                            emit = (255, 200, 92) if abs(offset) < 0.07 else (232, 104, 26)
                        elif abs(offset) < 0.05 and -0.17 < lift <= -0.05:
                            emit = (46, 30, 20)
                if emit:
                    color = emit
                else:
                    r, g, b = light_at(px, py, pz)
                    shade = value * (0.8 if side == 0 else 1.0)
                    color = (shade * r, shade * g, shade * b)
            else:
                is_floor = y >= bottom
                offset = (y + 0.5 - half) if is_floor else (half - y - 0.5)
                depth = (scale * 0.5) / max(offset, 0.5)
                px = camera[0] + ray_x * depth
                py = camera[1] + depth
                texture = FLOOR_TEXTURE if is_floor else CEILING_TEXTURE
                value = texture[(int(py * 64) % 64) * 64 + int(px * 64) % 64]
                pz = 0.0 if is_floor else 1.0
                r, g, b = light_at(px, py, pz)
                color = (value * r, value * g, value * b)
            threshold = (BAYER[y % 4][x % 4] / 16 - 0.5) * 11
            pixels.append(tuple(clamp((clamp(channel + threshold) // 10) * 10) for channel in color) + (255,))
    save_png(name, width, height, pixels)


def make_corridors():
    for ahead in (0, 1):
        for left in (0, 1):
            for right in (0, 1):
                # The camera stands back in the previous cell, so openings beside the current cell are visible.
                cells = {(0, -1), (0, 0)}
                if ahead:
                    cells |= {(0, 1), (0, 2), (0, 3), (0, 4), (0, 5)}
                if left:
                    cells |= {(-1, 0), (-2, 0), (-3, 0)}
                if right:
                    cells |= {(1, 0), (2, 0), (3, 0)}
                lights = [(0.5, -0.25, 0.6, 0.34)]
                sconces = []
                if ahead:
                    side_x = 1.0 if not right else 0.0
                    lights.append((side_x + (-0.16 if side_x else 0.16), 1.6, 0.62, 0.5))
                    sconces.append((side_x, 1.6))
                else:
                    lights.append((0.5, 0.45, 0.62, 0.3))
                render(f"corridor-{ahead}{left}{right}.png", cells, lights, camera=(0.5, -0.62), sconces=sconces)
    room = {(x, y) for x in range(-2, 3) for y in range(0, 3)}
    render("battle-room.png", room, [(-1.1, 2.55, 0.72, 0.7), (2.1, 2.55, 0.72, 0.7), (0.5, 1.1, 0.25, 0.28)], camera=(0.5, 0.05), width=320, height=200)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    make_textures()
    make_frame()
    make_torch()
    make_gate()
    make_corridors()
