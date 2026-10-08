"""Draws the app icons (a white check mark on the app's blue) with no image libraries.

Run from the repository folder:  python3 scripts/make-icons.py
It writes the PNG files into icons/. They are committed, so you only need this to change the design.
"""
import math
import struct
import zlib

BLUE = (0x2B, 0x5A, 0x87)  # the app's accent colour
WHITE = (0xFF, 0xFF, 0xFF)


def write_png(path, size, pixel):
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter type 0 for each row
        for x in range(size):
            row += bytes(pixel(x, y))
        rows.append(bytes(row))

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def distance_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def icon(size, rounded, glyph_scale):
    """A check mark on a 512-unit grid, smoothed by sampling 3 x 3 points per pixel."""
    points = [(150, 268), (222, 342), (364, 176)]
    centre = 256
    points = [(centre + (x - centre) * glyph_scale, centre + (y - centre) * glyph_scale) for x, y in points]
    half_stroke = 23 * glyph_scale
    corner = 112 if rounded else 0

    def inside_background(gx, gy):
        if not rounded:
            return True
        x, y = min(gx, 512 - gx), min(gy, 512 - gy)
        if x >= corner or y >= corner:
            return True
        return math.hypot(corner - x, corner - y) <= corner

    def pixel(x, y):
        n = 3
        background = glyph = 0
        for sy in range(n):
            for sx in range(n):
                gx = (x + (sx + 0.5) / n) * 512 / size
                gy = (y + (sy + 0.5) / n) * 512 / size
                if inside_background(gx, gy):
                    background += 1
                    d = min(distance_to_segment(gx, gy, *points[0], *points[1]),
                            distance_to_segment(gx, gy, *points[1], *points[2]))
                    if d <= half_stroke:
                        glyph += 1
        if background == 0:
            return (0, 0, 0, 0)
        mix = glyph / background
        colour = tuple(round(BLUE[i] * (1 - mix) + WHITE[i] * mix) for i in range(3))
        return colour + (round(255 * background / (n * n)),)

    return pixel


if __name__ == '__main__':
    write_png('icons/icon-192.png', 192, icon(192, True, 1.0))
    write_png('icons/icon-512.png', 512, icon(512, True, 1.0))
    # Maskable: full-bleed background, with the check mark kept inside the central safe zone.
    write_png('icons/icon-maskable-512.png', 512, icon(512, False, 0.78))
    write_png('icons/apple-touch-icon.png', 180, icon(180, False, 0.9))
    print('Wrote icons/icon-192.png, icon-512.png, icon-maskable-512.png and apple-touch-icon.png')
