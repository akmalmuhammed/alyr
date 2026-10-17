"""Checking and cleaning an uploaded photo (D-039, ALY-103; plan scenario 23): by content,
never by name, and nothing but the picture comes out."""

import io
import os

import pytest
from PIL import Image, ImageCms

from alyr.core.images import FORBIDDEN_CHUNKS, PhotoRefused, process, riff_chunks, sniff
from photo_files import (
    CAMERA,
    LATITUDE,
    MODEL,
    drawing,
    encode,
    located,
    photo,
    png_header_only,
    png_with_text,
    with_jpeg_comment,
)

LIMIT = 40_000_000


def refused(data: bytes, max_pixels: int = LIMIT) -> PhotoRefused:
    with pytest.raises(PhotoRefused) as caught:
        process(data, max_pixels)
    return caught.value


def opened(variant) -> Image.Image:
    return Image.open(io.BytesIO(variant.data))


# ── what comes out ────────────────────────────────────────


def test_a_large_photo_comes_out_in_three_webp_sizes():
    variants = process(photo(4000, 3000), LIMIT)
    assert [v.long_side for v in variants] == [320, 800, 1600]
    for variant in variants:
        image = opened(variant)
        assert image.format == "WEBP"
        assert image.size == (variant.width, variant.height)
        assert abs(variant.width / variant.height - 4 / 3) < 0.01  # same shape at every size
    assert variants[0].data != variants[2].data
    assert len(variants[0].data) < len(variants[2].data)


def test_a_small_photo_is_never_enlarged():
    assert [v.long_side for v in process(photo(600, 450), LIMIT)] == [320, 600]
    assert [v.long_side for v in process(photo(200, 100), LIMIT)] == [200]
    # Exactly the largest size: three sizes, the biggest untouched.
    assert [v.long_side for v in process(photo(1600, 900), LIMIT)] == [320, 800, 1600]


def test_the_sizes_a_phone_loads_stay_small_even_for_a_noisy_photo():
    # Random noise is the worst case for compression, so no real photo comes out bigger.
    # The thumbnail and the page size are what a customer on slow mobile data waits for.
    noise = Image.frombytes("RGB", (3000, 2250), os.urandom(3000 * 2250 * 3))
    thumb, medium, large = (len(v.data) for v in process(encode(noise, "JPEG"), LIMIT))
    assert thumb < 40_000 and medium < 200_000 and large < 1_000_000


def test_a_portrait_photo_is_sized_by_its_long_side():
    variants = process(photo(3000, 4000), LIMIT)
    assert [v.long_side for v in variants] == [320, 800, 1600]
    assert all(v.height > v.width for v in variants)


def test_the_phone_is_turned_upright_before_its_orientation_is_dropped():
    # Orientation 6 means "rotate 90 degrees to view": a landscape file shown as portrait.
    variants = process(located(640, 480, orientation=6), LIMIT)
    assert variants[-1].height > variants[-1].width


def test_other_kinds_of_picture_come_out_as_webp():
    transparent = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
    transparent.paste(drawing(200, 150), (100, 75))
    for data in (
        encode(transparent, "PNG"),
        encode(drawing(400, 300).convert("P"), "PNG"),
        encode(drawing(400, 300).convert("L"), "JPEG"),
        encode(drawing(400, 300).convert("CMYK"), "JPEG"),
        encode(drawing(400, 300), "WEBP"),
    ):
        assert opened(process(data, LIMIT)[-1]).format == "WEBP"


def test_a_phone_jpeg_with_a_second_picture_inside_is_a_photo_not_an_animation():
    # Many phones add a preview or an HDR map to the file (Pillow calls this MPO). The
    # photo is the first picture; refusing these would refuse real photos.
    out = io.BytesIO()
    drawing(1200, 900, seed=1).save(
        out, "MPO", save_all=True, append_images=[drawing(300, 225, seed=2)]
    )
    assert Image.open(io.BytesIO(out.getvalue())).n_frames == 2
    variants = process(out.getvalue(), LIMIT)
    assert [v.long_side for v in variants] == [320, 800, 1200]
    assert variants[-1].width == 1200


def test_colour_profiles_are_applied_and_a_broken_one_does_not_stop_a_photo():
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    plain = drawing(500, 400, seed=6)
    with_profile = encode(plain, "JPEG", icc_profile=srgb, quality=95)
    result = opened(process(with_profile, LIMIT)[-1]).convert("RGB")
    # The same colours come out (within JPEG and WebP's rounding), and the profile itself is gone.
    for point in ((250, 200), (10, 10)):
        got, want = result.getpixel(point), plain.getpixel(point)
        assert all(abs(a - b) < 12 for a, b in zip(got, want, strict=True))
    assert "icc_profile" not in opened(process(with_profile, LIMIT)[-1]).info
    broken = encode(plain, "JPEG", icc_profile=b"this is not a colour profile")
    assert process(broken, LIMIT)


def test_a_transparent_cut_out_keeps_its_transparency():
    cut_out = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
    cut_out.paste(drawing(200, 150, seed=3), (100, 75))
    result = opened(process(encode(cut_out, "PNG"), LIMIT)[-1])
    assert result.mode == "RGBA"
    assert result.getpixel((5, 5))[3] == 0  # the corner is still clear
    assert result.getpixel((200, 150))[3] == 255


# ── location and camera data (scenario 23: "has a location in it") ──


def test_location_and_camera_data_are_removed_and_the_output_proves_it():
    source = located(1200, 900)
    # The upload really did carry them, so this test cannot pass by accident.
    sent = Image.open(io.BytesIO(source)).getexif()
    assert dict(sent.get_ifd(0x8825))[2] == LATITUDE
    assert sent[0x010F] == CAMERA and sent[0x0110] == MODEL

    for variant in process(source, LIMIT):
        again = opened(variant)
        assert dict(again.getexif()) == {}
        assert dict(again.getexif().get_ifd(0x8825)) == {}
        assert "exif" not in again.info and "xmp" not in again.info
        assert not FORBIDDEN_CHUNKS & set(riff_chunks(variant.data))
        assert CAMERA.encode() not in variant.data and b"Exif" not in variant.data


def test_text_and_profiles_in_a_png_do_not_survive_either():
    source = png_with_text(drawing(500, 400), "Author", "Fatima Al-Noor, 25.2860 N 51.5310 E")
    assert b"Fatima" in source
    for variant in process(source, LIMIT):
        assert b"Fatima" not in variant.data
        assert not FORBIDDEN_CHUNKS & set(riff_chunks(variant.data))


def test_ordinary_picture_metadata_does_not_trip_the_check_for_hidden_code():
    # XMP is XML, and many real photos carry it. It is dropped, and the photo is accepted.
    xmp = (
        b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/'
        b'02/22-rdf-syntax-ns#"><rdf:Description/></rdf:RDF></x:xmpmeta>'
    )
    variants = process(encode(drawing(500, 400), "JPEG", xmp=xmp), LIMIT)
    assert b"xmpmeta" not in variants[-1].data


# ── what is refused ───────────────────────────────────────

SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


@pytest.mark.parametrize(
    "data",
    [
        SVG,
        b'<?xml version="1.0"?>' + SVG,
        b"\xef\xbb\xbf  \n" + SVG,
        b"<!DOCTYPE html><html><body>not a photo</body></html>",
    ],
)
def test_svg_and_web_pages_are_refused(data):
    error = refused(data)
    assert (error.code, error.status) == ("photo_markup", 415)
    assert "SVG" in error.en and error.ar


def test_a_file_that_claims_to_be_a_picture_but_is_something_else_is_refused():
    # The name and the type the browser sends do not matter: the first bytes decide.
    for data in (
        b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n",
        b"PK\x03\x04" + b"\x00" * 60,  # a zip
        b"MZ\x90\x00" + b"\x00" * 60,  # a program
        b"GIF89a" + b"\x01\x00\x01\x00\x80\x00\x00" + b"\x00" * 20,  # a real GIF format
        b"just some text pretending to be a photo.jpg",
        bytes(range(256)),
    ):
        assert refused(data).code == "photo_type", data[:12]


def test_an_empty_upload_is_refused():
    assert refused(b"").code == "photo_empty"


def test_a_picture_with_code_hidden_in_it_is_refused():
    real = photo(300, 200)
    for polyglot in (
        with_jpeg_comment(real, b"<script>alert('hi')</script>"),
        real + b"<html><body onload=alert(1)></body></html>",
        real + b"<?php system($_GET['c']); ?>",
        real + b'<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>',
        png_with_text(drawing(300, 200), "Comment", "<SCRIPT SRC=//evil.example/x.js>"),
    ):
        error = refused(polyglot)
        assert (error.code, error.status) == ("photo_active", 415)
    # The same picture without the code is fine.
    assert process(real, LIMIT)


def test_a_damaged_or_cut_off_photo_is_refused():
    whole = photo(1200, 900)
    assert refused(whole[: len(whole) // 2]).code == "photo_damaged"
    assert refused(whole[:60]).code == "photo_damaged"
    assert refused(b"\xff\xd8\xff" + b"\x00" * 200).code == "photo_damaged"
    png = encode(drawing(600, 400), "PNG")
    assert refused(png[: len(png) // 2]).code == "photo_damaged"


def test_a_photo_with_too_many_pixels_is_refused_before_it_is_decoded():
    # 2,000 x 1,500 is three megapixels; with a limit of two it is refused...
    error = refused(photo(2000, 1500), max_pixels=2_000_000)
    assert (error.code, error.status) == ("photo_pixels", 413)
    assert error.extra["megapixels"] == 3.0 and "megapixels" in error.en and error.ar
    # ...and a file that only claims an enormous size is refused from its header, with no
    # picture data to decode: this is what a decompression bomb looks like.
    assert refused(png_header_only(7000, 7000)).code == "photo_pixels"
    assert refused(png_header_only(60000, 60000)).code == "photo_pixels"


def test_animated_images_are_refused():
    frames = [drawing(300, 200, seed=s) for s in (1, 2, 3)]
    webp = io.BytesIO()
    frames[0].save(webp, "WEBP", save_all=True, append_images=frames[1:], duration=100)
    apng = io.BytesIO()
    frames[0].save(apng, "PNG", save_all=True, append_images=frames[1:], duration=100)
    for data in (webp.getvalue(), apng.getvalue()):
        assert refused(data).code == "photo_animated"


def test_the_first_bytes_decide_the_type():
    assert sniff(photo(50, 50)) == "JPEG"
    assert sniff(encode(drawing(50, 50), "PNG")) == "PNG"
    assert sniff(encode(drawing(50, 50), "WEBP")) == "WEBP"
    assert sniff(SVG) is None
