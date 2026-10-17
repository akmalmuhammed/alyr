"""Checking an uploaded photo and making it safe to publish (D-039, ALY-103).

Every upload is judged by what it contains, never by its name or the type the browser
claims. Only JPEG, PNG and WebP photos pass. The picture is decoded and drawn again from
its pixels into a new image, so nothing else in the file survives: not the location, the
camera or the owner's name in the metadata, and not any code hidden after the picture.
Three WebP sizes come out, and nothing is ever served as it was uploaded.

`process` is plain CPU work with no database or store: callers run it in a thread.
"""

import io
import re
import struct
from dataclasses import dataclass
from functools import lru_cache

from PIL import Image, ImageCms, ImageOps

SIZES = (320, 800, 1600)  # long side in pixels; the largest is also the biggest we keep
FORMATS = ("JPEG", "PNG", "WEBP")
WEBP_QUALITY = 80
# Metadata containers a WebP can carry. None may appear in what we publish.
FORBIDDEN_CHUNKS = {"EXIF", "XMP ", "ICCP"}


class MetadataSurvived(Exception):
    """Encoding left metadata in a published file. A bug in this module, never a bad upload."""


class PhotoRefused(Exception):
    """A photo, or a request about photos, that ALYR will not accept, with words for the
    owner in English and Arabic (the Arabic is a draft until ALY-66 reviews it).
    `status` is the HTTP status a route answers with; `extra` is shown to the client."""

    def __init__(self, code: str, en: str, ar: str, status: int = 422, **extra: object) -> None:
        super().__init__(en)
        self.code, self.en, self.ar, self.status, self.extra = code, en, ar, status, extra


@dataclass(frozen=True)
class Variant:
    width: int
    height: int
    data: bytes

    @property
    def long_side(self) -> int:
        return max(self.width, self.height)


def sniff(data: bytes) -> str | None:
    """The format the first bytes say this is, or None."""
    if data.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return None


# A file that starts as markup (SVG, HTML, XML), allowing a byte-order mark and spaces.
_MARKUP = re.compile(rb"\A(?:\xef\xbb\xbf|\xff\xfe|\xfe\xff)?\s*<")
# Words that mean a file is trying to be a web page or a script as well as a picture.
# Re-encoding would drop them anyway; refusing says so out loud (defence in depth).
_ACTIVE = re.compile(
    rb"<\s*script|<\?php|<\s*html|<\s*iframe|<\s*svg[\s>:/]|<!doctype\s+html|javascript:",
    re.IGNORECASE,
)


def riff_chunks(data: bytes) -> list[str]:
    """The chunk names of a WebP file, in order (RIFF container)."""
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("not a WebP file")
    chunks, pos = [], 12
    while pos + 8 <= len(data):
        chunks.append(data[pos:pos + 4].decode("ascii", "replace"))
        (size,) = struct.unpack_from("<I", data, pos + 4)
        pos += 8 + size + (size & 1)
    return chunks


def _refuse_damaged() -> PhotoRefused:
    return PhotoRefused(
        "photo_damaged",
        "This photo is damaged or incomplete. Take or choose it again.",
        "هذه الصورة تالفة أو غير مكتملة. التقطها أو اخترها من جديد.",
    )


def _check(data: bytes, max_pixels: int) -> Image.Image:
    """Everything that can be decided from the file's first bytes and header, before any
    picture data is decoded. Returns the opened (not yet decoded) image."""
    if not data:
        raise PhotoRefused(
            "photo_empty", "No photo was received. Choose a photo and try again.",
            "لم تصل أي صورة. اختر صورة وحاول مرة أخرى.",
        )
    if _MARKUP.match(data):
        raise PhotoRefused(
            "photo_markup",
            "SVG files and web pages can't be used as photos. Choose a JPEG, PNG or WebP photo.",
            "لا يمكن استخدام ملفات SVG أو صفحات الويب كصور. اختر صورة بصيغة JPEG أو PNG أو WebP.",
            status=415,
        )
    kind = sniff(data)
    if kind is None:
        raise PhotoRefused(
            "photo_type",
            "This file isn't a JPEG, PNG or WebP photo. Choose a photo in one of those formats.",
            "هذا الملف ليس صورة بصيغة JPEG أو PNG أو WebP. اختر صورة بإحدى هذه الصيغ.",
            status=415,
        )
    if _ACTIVE.search(data):
        raise PhotoRefused(
            "photo_active",
            "This file contains hidden code, so it can't be used. Take or choose the photo again.",
            "يحتوي هذا الملف على شيفرة مخفية، لذلك لا يمكن استخدامه. "
            "التقط الصورة أو اخترها من جديد.",
            status=415,
        )
    try:
        image = Image.open(io.BytesIO(data), formats=FORMATS)
    except Image.DecompressionBombError as error:
        # Pillow refuses, before decoding, a header that claims twice its own limit.
        limit = f"{max_pixels / 1_000_000:.0f}"
        raise PhotoRefused(
            "photo_pixels",
            f"This photo is far larger than the {limit} megapixel limit. Choose a smaller photo.",
            f"هذه الصورة أكبر بكثير من الحد الأقصى وهو {limit} ميغابكسل. اختر صورة أصغر.",
            status=413, limit_megapixels=float(limit),
        ) from error
    except Exception as error:  # noqa: BLE001 - a hostile file can fail in any way
        raise _refuse_damaged() from error
    # Many phones save a JPEG that carries a second picture (a preview, a depth or HDR
    # map); Pillow calls that MPO. It is a JPEG, and its first picture is the photo.
    same = image.format == kind or (kind == "JPEG" and image.format == "MPO")
    if not same:
        raise PhotoRefused(
            "photo_type", "This file isn't what it says it is.",
            "هذا الملف ليس من النوع الذي يدّعيه.", status=415,
        )
    width, height = image.size
    if width < 1 or height < 1:
        raise _refuse_damaged()
    if width * height > max_pixels:
        megapixels = f"{width * height / 1_000_000:.1f}"
        limit = f"{max_pixels / 1_000_000:.0f}"
        raise PhotoRefused(
            "photo_pixels",
            f"This photo is {megapixels} megapixels; the limit is {limit}. Choose a smaller photo.",
            f"تبلغ دقة هذه الصورة {megapixels} ميغابكسل والحد الأقصى {limit}. اختر صورة أصغر.",
            status=413, megapixels=float(megapixels), limit_megapixels=float(limit),
        )
    if image.format != "MPO" and (
        getattr(image, "is_animated", False) or getattr(image, "n_frames", 1) > 1
    ):
        raise PhotoRefused(
            "photo_animated",
            "Animated images can't be used as photos. Choose a single photo.",
            "لا يمكن استخدام الصور المتحركة. اختر صورة واحدة.",
        )
    return image


@lru_cache
def _srgb() -> ImageCms.ImageCmsProfile:
    return ImageCms.createProfile("sRGB")


def _to_srgb(image: Image.Image, icc: bytes | None) -> Image.Image:
    """RGB or RGBA in the sRGB colour space, so a phone's wide-gamut photo does not look
    dull once its profile is dropped."""
    if image.mode == "P":
        image = image.convert("RGBA" if "transparency" in image.info else "RGB")
    elif image.mode in ("PA", "LA", "La"):
        image = image.convert("RGBA")
    elif image.mode not in ("RGB", "RGBA", "CMYK"):
        image = image.convert("RGB")
    alpha = image.getchannel("A") if image.mode == "RGBA" else None
    colour = image.convert("RGB") if image.mode == "RGBA" else image
    converted = False
    if icc:
        try:
            colour = ImageCms.profileToProfile(
                colour, ImageCms.ImageCmsProfile(io.BytesIO(icc)), _srgb(), outputMode="RGB"
            )
            converted = True
        except Exception:  # noqa: BLE001 - a broken profile must not fail the upload
            converted = False
    if not converted and colour.mode != "RGB":
        colour = colour.convert("RGB")
    if alpha is not None:
        colour.putalpha(alpha)
    return colour


def _webp(image: Image.Image) -> bytes:
    """Encode from a brand-new image made of the pixels alone, then prove that no
    metadata container came along."""
    clean = Image.frombytes(image.mode, image.size, image.tobytes())
    out = io.BytesIO()
    clean.save(out, "WEBP", quality=WEBP_QUALITY, method=4)
    data = out.getvalue()
    if FORBIDDEN_CHUNKS & set(riff_chunks(data)):
        raise MetadataSurvived("metadata survived re-encoding")
    return data


def process(data: bytes, max_pixels: int) -> list[Variant]:
    """Check an upload and return its WebP sizes, smallest first.

    The sizes are the long side at 320, 800 and 1,600 pixels, never enlarged: a photo
    whose long side is 600 comes out as 320 and 600. Raises `PhotoRefused`.
    """
    image = _check(data, max_pixels)
    master_side = SIZES[-1]
    try:
        width, height = image.size
        if image.format in ("JPEG", "MPO"):
            # Decode a big JPEG at 1/2, 1/4 or 1/8 size: far less memory, far faster.
            factor = 1
            while factor < 8 and max(width, height) // (factor * 2) >= master_side:
                factor *= 2
            if factor > 1:
                image.draft(None, (width // factor, height // factor))
        image.load()
        icc = image.info.get("icc_profile")
        image = ImageOps.exif_transpose(image)  # turn it upright, then metadata is moot
        if max(image.size) > master_side:
            image.thumbnail((master_side, master_side), Image.Resampling.LANCZOS)
        master = _to_srgb(image, icc)
        long_side = max(master.size)
        variants = []
        for size in [s for s in SIZES if s < long_side] + [long_side]:
            frame = master
            if size < long_side:
                frame = master.copy()
                frame.thumbnail((size, size), Image.Resampling.LANCZOS)
            variants.append(Variant(frame.width, frame.height, _webp(frame)))
        return variants
    except (PhotoRefused, MetadataSurvived):
        raise
    except Exception as error:  # noqa: BLE001 - truncated, corrupt or hostile data
        raise _refuse_damaged() from error
