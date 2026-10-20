"""The QR encoder behind the payment link on an invoice (ALY-141).

Python cannot decode a code without a heavy library, so the proof is in two halves. Here: the
structure the standard fixes (finder patterns, timing, a format word that is a valid BCH code, the
error-correction codewords of every block) and that the matrices the web's decode test reads are
exactly the ones this encoder makes now. There: `apps/web/.../qrDocument.test.mjs` reads each of
those matrices back with jsQR, an independent decoder, and the text must come out byte for byte.
"""

import json
import os
from pathlib import Path

import pytest

from alyr.core import qr

VECTORS = Path(__file__).resolve().parents[2] / "web/app/(product)/_workspace/qrVectors.json"

LINKS = [
    "https://alyr.qa/pay/x",
    "https://alyr.qa/pay/0a1f0000-0000-4000-8000-00000000cafe/0a1f0000-0000-4000-8000-00000000beef",
    "http://localhost:3181/pay/3f2504e0-4f89-41d3-9a0c-0305e82c3301/9b2c4e66-1c0d-4c34-8f5a-d1f0a4b0e6aa",
    "https://pay.example.test/p/" + "a" * 60,
    "https://pay.example.test/p/" + "Z9" * 70,
    "https://pay.example.test/" + "q" * 150,
    "WIFI:T:WPA;S:x;;",
    "1",
    "",
]
# Every version the encoder makes, at the length that just fills it and just overflows the one
# before.
for _v in range(1, qr.MAX_VERSION + 1):
    LINKS.append("k" * qr.capacity(_v))               # exactly fills this version
    LINKS.append("j" * (qr.capacity(_v) - 1))         # one byte short of it


def finder(m, x, y):
    """The 7 x 7 finder pattern whose top-left module is (x, y)."""
    for dy in range(7):
        for dx in range(7):
            ring = max(abs(dx - 3), abs(dy - 3))
            assert m[y + dy][x + dx] == (ring != 2), (x, y, dx, dy)


def read_format(m):
    n = len(m)
    first = ([m[i][8] for i in range(6)] + [m[7][8], m[8][8], m[8][7]]
             + [m[8][14 - i] for i in range(9, 15)])
    second = [m[8][n - 1 - i] for i in range(8)] + [m[n - 15 + i][8] for i in range(8, 15)]
    to_int = lambda bits: sum(int(b) << i for i, b in enumerate(bits))  # noqa: E731
    return to_int(first), to_int(second)


def bch_ok(word):
    """A format word is data (5 bits) and ten check bits: after taking the mask off, dividing by
    the generator leaves nothing."""
    word ^= 0x5412
    rem = word
    for i in range(14, 9, -1):
        if rem >> i & 1:
            rem ^= 0x537 << (i - 10)
    return rem == 0


@pytest.mark.parametrize("text", LINKS)
def test_the_structure_the_standard_fixes(text):
    m = qr.encode(text)
    n = len(m)
    assert all(len(row) == n for row in m) and (n - 17) % 4 == 0 and 21 <= n <= 57
    finder(m, 0, 0)
    finder(m, n - 7, 0)
    finder(m, 0, n - 7)
    for i in range(8, n - 8):                                   # timing patterns
        assert m[6][i] == (i % 2 == 0) and m[i][6] == (i % 2 == 0)
    assert m[n - 8][8] is True                                   # the always-dark module
    first, second = read_format(m)
    assert first == second and bch_ok(first)                     # both copies, a valid word
    assert (first ^ 0x5412) >> 13 == 0                           # error correction level M
    mask = ((first ^ 0x5412) >> 10) & 7
    assert 0 <= mask < 8


@pytest.mark.parametrize("version", range(1, qr.MAX_VERSION + 1))
def test_every_block_is_a_codeword_of_the_reed_solomon_code(version):
    text = "k" * qr.capacity(version)
    words = qr._codewords(text.encode(), version)
    groups, ec = qr._BLOCKS[version]
    sizes = [size for count, size in groups for _ in range(count)]
    assert len(words) == sum(sizes) + ec * len(sizes)
    # Undo the interleave and check each block divides cleanly.
    data_total = sum(sizes)
    data, check = words[:data_total], words[data_total:]
    blocks = [[] for _ in sizes]
    at = 0
    for i in range(max(sizes)):
        for b, size in enumerate(sizes):
            if i < size:
                blocks[b].append(data[at])
                at += 1
    for b, block in enumerate(blocks):
        tail = [check[i * len(sizes) + b] for i in range(ec)]
        assert qr.remainder(block + tail, ec) == [0] * ec, (version, b)


def test_the_capacities_are_the_standards():
    assert [qr.capacity(v) for v in range(1, 11)] == [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]


def test_a_link_too_long_for_the_largest_code_is_refused_not_cut():
    with pytest.raises(qr.QrError):
        qr.encode("x" * (qr.capacity(qr.MAX_VERSION) + 1))


def test_the_same_link_is_the_same_code_every_time():
    assert qr.encode(LINKS[1]) == qr.encode(LINKS[1])


def test_the_web_decoder_reads_the_matrices_this_encoder_makes():
    """`qrVectors.json` is what `qrDocument.test.mjs` decodes with jsQR. It must be what this
    encoder makes today, so a change to the encoder is read back by the independent decoder, not
    only by this file."""
    found = [{"text": text, "rows": qr.rows(text)} for text in LINKS if text]
    if os.environ.get("ALYR_UPDATE_VECTORS") == "1":
        VECTORS.write_text(json.dumps(found, indent=0) + "\n", encoding="utf-8")
    assert json.loads(VECTORS.read_text(encoding="utf-8")) == found
