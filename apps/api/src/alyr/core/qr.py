"""A small QR code encoder for a payment link (ALY-141).

A document's payment QR is drawn into the PDF by the document engine, which has no network and
no image of its own to fetch, so the code is made here, in plain Python, from a link. It is a
deliberately narrow encoder: byte mode (the link's ASCII), error correction M, versions 1 to 10
(up to 213 bytes), which is every payment link and keeps the code easy to scan at 22 mm. Nothing
here is cleverer than the standard (ISO/IEC 18004): Reed-Solomon over GF(256), the eight masks
and the four penalty rules.

It is proved by reading its output back with an independent decoder: `qrVectors.json` holds the
matrices this module makes for a list of links, `tests/test_qr.py` checks the file is exactly what
this module makes now, and `apps/web/.../qr.test.mjs`' sibling test decodes every one of them with
jsQR (the decoder the Catalog's QR codes are already checked with). A code that looks right and
does not scan fails there.

Rules from the print skill (`alyr-print`) that apply to the paper: dark modules on a white
ground, never inverted, a quiet zone of four modules (drawn by the layout, not here), error
correction M.
"""

# (blocks, data codewords per block) groups, and error-correction codewords per block, at level
# M, for versions 1 to 10 (ISO/IEC 18004 table 9).
_BLOCKS: dict[int, tuple[tuple[tuple[int, int], ...], int]] = {
    1: (((1, 16),), 10),
    2: (((1, 28),), 16),
    3: (((1, 44),), 26),
    4: (((2, 32),), 18),
    5: (((2, 43),), 24),
    6: (((4, 27),), 16),
    7: (((4, 31),), 18),
    8: (((2, 38), (2, 39)), 22),
    9: (((3, 36), (2, 37)), 22),
    10: (((4, 43), (1, 44)), 26),
}
# Centres of the alignment patterns.
_ALIGNMENT: dict[int, tuple[int, ...]] = {
    1: (), 2: (6, 18), 3: (6, 22), 4: (6, 26), 5: (6, 30), 6: (6, 34), 7: (6, 22, 38),
    8: (6, 24, 42), 9: (6, 26, 46), 10: (6, 28, 50),
}
MAX_VERSION = 10
QUIET = 4


class QrError(ValueError):
    """The text does not fit the largest code this encoder makes."""


def _data_codewords(version: int) -> int:
    return sum(count * size for count, size in _BLOCKS[version][0])


def capacity(version: int) -> int:
    """How many bytes version `version` carries (byte mode, level M)."""
    header = 4 + (8 if version < 10 else 16)
    return (_data_codewords(version) * 8 - header) // 8


# ── Reed-Solomon over GF(256), primitive polynomial 0x11D ────────────────────────────────

_EXP = [0] * 512
_LOG = [0] * 256


def _tables() -> None:
    x = 1
    for i in range(255):
        _EXP[i] = x
        _LOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        _EXP[i] = _EXP[i - 255]


_tables()


def _mul(a: int, b: int) -> int:
    return 0 if a == 0 or b == 0 else _EXP[_LOG[a] + _LOG[b]]


def _generator(degree: int) -> list[int]:
    """The product of (x - alpha^i) for i below `degree`, highest power first, without the
    leading 1."""
    poly = [1]
    for i in range(degree):
        nxt = [0] * (len(poly) + 1)
        for j, c in enumerate(poly):
            nxt[j] ^= c
            nxt[j + 1] ^= _mul(c, _EXP[i])
        poly = nxt
    return poly[1:]


def remainder(data: list[int], degree: int) -> list[int]:
    """The error-correction codewords of `data`."""
    gen = _generator(degree)
    rest = [0] * degree
    for byte in data:
        factor = byte ^ rest[0]
        rest = rest[1:] + [0]
        for i, g in enumerate(gen):
            rest[i] ^= _mul(g, factor)
    return rest


# ── the bit stream ───────────────────────────────────────────────────────────────────────


def _bits(data: bytes, version: int) -> list[int]:
    bits: list[int] = []

    def put(value: int, length: int) -> None:
        bits.extend((value >> (length - 1 - i)) & 1 for i in range(length))

    put(0b0100, 4)                                    # byte mode
    put(len(data), 8 if version < 10 else 16)
    for byte in data:
        put(byte, 8)
    total = _data_codewords(version) * 8
    put(0, min(4, total - len(bits)))                 # terminator
    put(0, -len(bits) % 8)
    pad = 0
    while len(bits) < total:
        put((0xEC, 0x11)[pad % 2], 8)
        pad += 1
    return bits


def _codewords(data: bytes, version: int) -> list[int]:
    bits = _bits(data, version)
    words = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    groups, ec = _BLOCKS[version]
    blocks, at = [], 0
    for count, size in groups:
        for _ in range(count):
            blocks.append(words[at:at + size])
            at += size
    checks = [remainder(block, ec) for block in blocks]
    out: list[int] = []
    for i in range(max(len(b) for b in blocks)):
        out.extend(b[i] for b in blocks if i < len(b))
    for i in range(ec):
        out.extend(c[i] for c in checks)
    return out


# ── the matrix ───────────────────────────────────────────────────────────────────────────


class _Grid:
    def __init__(self, version: int) -> None:
        self.size = 17 + 4 * version
        self.version = version
        self.dark = [[False] * self.size for _ in range(self.size)]
        self.fixed = [[False] * self.size for _ in range(self.size)]
        self._patterns()

    def put(self, x: int, y: int, dark: bool) -> None:
        self.dark[y][x] = dark
        self.fixed[y][x] = True

    def _patterns(self) -> None:
        n = self.size
        for i in range(n):
            self.put(6, i, i % 2 == 0)
            self.put(i, 6, i % 2 == 0)
        for cx, cy in ((3, 3), (n - 4, 3), (3, n - 4)):
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    x, y = cx + dx, cy + dy
                    if 0 <= x < n and 0 <= y < n:
                        self.put(x, y, max(abs(dx), abs(dy)) not in (2, 4))
        centres = _ALIGNMENT[self.version]
        for i, cy in enumerate(centres):
            for j, cx in enumerate(centres):
                if (i == 0 and j == 0) or (i == 0 and j == len(centres) - 1) \
                        or (i == len(centres) - 1 and j == 0):
                    continue
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        self.put(cx + dx, cy + dy, max(abs(dx), abs(dy)) != 1)
        self._format(0)       # reserve the format areas; the real bits come with the mask
        if self.version >= 7:
            rem = self.version
            for _ in range(12):
                rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
            bits = self.version << 12 | rem
            for i in range(18):
                bit = bool((bits >> i) & 1)
                a, b = n - 11 + i % 3, i // 3
                self.put(a, b, bit)
                self.put(b, a, bit)

    def _format(self, mask: int) -> None:
        n = self.size
        data = (0b00 << 3) | mask                      # level M is 00
        rem = data
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        bits = (data << 10 | rem) ^ 0x5412

        def bit(i: int) -> bool:
            return bool((bits >> i) & 1)

        for i in range(6):
            self.put(8, i, bit(i))
        self.put(8, 7, bit(6))
        self.put(8, 8, bit(7))
        self.put(7, 8, bit(8))
        for i in range(9, 15):
            self.put(14 - i, 8, bit(i))
        for i in range(8):
            self.put(n - 1 - i, 8, bit(i))
        for i in range(8, 15):
            self.put(8, n - 15 + i, bit(i))
        self.put(8, n - 8, True)                       # always dark

    def place(self, words: list[int]) -> None:
        n, i = self.size, 0
        total = len(words) * 8
        for right in range(n - 1, 0, -2):
            if right <= 6:
                right -= 1
            for vert in range(n):
                for j in range(2):
                    x = right - j
                    y = n - 1 - vert if (right + 1) & 2 == 0 else vert
                    if not self.fixed[y][x] and i < total:
                        self.dark[y][x] = bool((words[i >> 3] >> (7 - (i & 7))) & 1)
                        i += 1


_MASKS = (
    lambda x, y: (x + y) % 2 == 0,
    lambda x, y: y % 2 == 0,
    lambda x, y: x % 3 == 0,
    lambda x, y: (x + y) % 3 == 0,
    lambda x, y: (x // 3 + y // 2) % 2 == 0,
    lambda x, y: x * y % 2 + x * y % 3 == 0,
    lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
    lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0,
)


def _penalty(m: list[list[bool]]) -> int:
    n = len(m)
    score = 0
    lines = [row for row in m] + [[m[y][x] for y in range(n)] for x in range(n)]
    for line in lines:                                  # rule 1: runs of five or more
        run = 1
        for a, b in zip(line, line[1:], strict=False):
            run = run + 1 if a == b else 1
            if run == 5:
                score += 3
            elif run > 5:
                score += 1
    for y in range(n - 1):                              # rule 2: 2 x 2 blocks
        for x in range(n - 1):
            if m[y][x] == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                score += 3
    pattern_a = [True, False, True, True, True, False, True, False, False, False, False]
    pattern_b = pattern_a[::-1]
    for line in lines:                                  # rule 3: finder-like patterns
        for i in range(n - 10):
            window = line[i:i + 11]
            if window == pattern_a or window == pattern_b:
                score += 40
    dark = sum(row.count(True) for row in m)            # rule 4: balance of dark and light
    total = n * n
    score += 10 * ((abs(dark * 20 - total * 10) + total - 1) // total - 1)
    return score


def encode(text: str) -> list[list[bool]]:
    """The code for `text` as rows of modules, True for dark, without a quiet zone."""
    data = text.encode("utf-8")
    for version in range(1, MAX_VERSION + 1):
        if len(data) <= capacity(version):
            break
    else:
        raise QrError(f"{len(data)} bytes do not fit a code of version {MAX_VERSION}")
    words = _codewords(data, version)
    best: tuple[int, list[list[bool]]] | None = None
    for mask, rule in enumerate(_MASKS):
        grid = _Grid(version)
        grid.place(words)
        n = grid.size
        for y in range(n):
            for x in range(n):
                if not grid.fixed[y][x] and rule(x, y):
                    grid.dark[y][x] = not grid.dark[y][x]
        grid._format(mask)
        score = _penalty(grid.dark)
        if best is None or score < best[0]:
            best = (score, grid.dark)
    assert best is not None
    return best[1]


def rows(text: str) -> list[str]:
    """The code as strings of 1 (dark) and 0 (light), one per row: the form the test vectors
    take."""
    return ["".join("1" if d else "0" for d in row) for row in encode(text)]
