#!/usr/bin/env python3
"""Generate placeholder Hearth PWA icons (slate background + indigo frame/square).

Pure-stdlib PNG writer — no Pillow required. Deterministic output; safe to
re-run. Phase 3 replaces these with real brand artwork.
"""

import os
import struct
import zlib

SLATE = (15, 23, 42, 255)    # #0f172a background
INDIGO = (99, 102, 241, 255)  # #6366f1 accent


def chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def make_icon(size: int, bg=SLATE, fg=INDIGO) -> bytes:
    frame = max(2, size // 16)          # outer border thickness
    inner = size // 4                   # inset of the centered square
    scanlines = bytearray()
    for y in range(size):
        scanlines.append(0)  # filter type 0
        for x in range(size):
            in_frame = x < frame or x >= size - frame or y < frame or y >= size - frame
            in_square = inner <= x < size - inner and inner <= y < size - inner
            px = fg if (in_frame or in_square) else bg
            scanlines += bytes(px)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(scanlines), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in (192, 512):
        path = os.path.join(out_dir, f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(make_icon(size))
        print(f"wrote {path} ({size}x{size}, {os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
