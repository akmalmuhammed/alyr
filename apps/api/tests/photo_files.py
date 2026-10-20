"""Made-up photos for the photo tests (ALY-103). Everything is drawn here: no real picture,
no downloaded file, and nothing that belongs to anyone."""

import io
import struct
import zlib

from PIL import Image, ImageDraw

# A recognisable made-up location (not a real person's) and camera, to prove they are removed.
CAMERA = "FakeCam"
MODEL = "Model X"
LATITUDE = (25.0, 17.0, 6.0)
LONGITUDE = (51.0, 31.0, 48.0)


def drawing(width: int = 640, height: int = 480, seed: int = 1, mode: str = "RGB") -> Image.Image:
    """A flat colour with a few shapes. A different seed gives different bytes."""
    colour = ((seed * 53) % 256, (seed * 97) % 256, (seed * 29) % 256)
    image = Image.new("RGB", (width, height), colour)
    paint = ImageDraw.Draw(image)
    paint.ellipse(
        (width // 5, height // 5, width * 4 // 5, height * 4 // 5),
        fill=(255 - colour[0], 255 - colour[1], 255 - colour[2]),
    )
    paint.rectangle((0, 0, width // 6, height // 6), fill=(10 * seed % 256, 120, 200))
    return image.convert(mode) if mode != "RGB" else image


def encode(image: Image.Image, fmt: str = "JPEG", **options) -> bytes:
    out = io.BytesIO()
    image.save(out, fmt, **options)
    return out.getvalue()


def photo(
    width: int = 640, height: int = 480, seed: int = 1, fmt: str = "JPEG", **options
) -> bytes:
    if fmt == "JPEG":
        options.setdefault("quality", 85)
    return encode(drawing(width, height, seed), fmt, **options)


def located(width: int = 640, height: int = 480, orientation: int = 1, seed: int = 1) -> bytes:
    """A JPEG with a location, a camera and an orientation in its metadata."""
    exif = Image.Exif()
    exif[0x010F] = CAMERA
    exif[0x0110] = MODEL
    exif[0x0112] = orientation
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2], gps[3], gps[4] = "N", LATITUDE, "E", LONGITUDE
    return encode(drawing(width, height, seed), "JPEG", exif=exif, quality=85)


def png_header_only(width: int, height: int) -> bytes:
    """The start of a PNG that claims a size and carries no picture: enough for a program
    to read the size, nothing to decode. What a decompression bomb looks like."""

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(
            ">I", zlib.crc32(kind + body)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"\x00"))
        + chunk(b"IEND", b"")
    )


def with_jpeg_comment(data: bytes, text: bytes) -> bytes:
    """The same JPEG with a comment segment (COM) holding `text`, right after its start."""
    segment = b"\xff\xfe" + struct.pack(">H", len(text) + 2) + text
    return data[:2] + segment + data[2:]


def png_with_text(image: Image.Image, key: str, text: str) -> bytes:
    from PIL.PngImagePlugin import PngInfo

    info = PngInfo()
    info.add_text(key, text)
    return encode(image, "PNG", pnginfo=info)
