"""Words of the Google Places live read (Discovery 2.0, workstream F), in English and Arabic.

Merged into `words.ERRORS` and read by `words.evidence_view`, so the wording tests see them. The
Arabic is a careful draft for the native reviewer (ALY-66).
"""

# Next to every piece of evidence read on Google's public listing: Google's terms ask for the
# "Google Maps" attribution on anything from the Places API (research R6 section 2.1).
PLACES_NOTE = ("Google Maps, read live", "Google Maps، قراءة مباشرة")

ERRORS: dict[str, tuple[str, str]] = {
    "place_link_short": (
        "This is a short link. Open it, then copy the full address from the browser's address "
        "bar, or paste the place ID.",
        "هذا رابط مختصر. افتحه ثم انسخ العنوان الكامل من شريط العنوان في المتصفح، أو الصق "
        "معرّف المكان.",
    ),
    "place_link_bad": (
        "ALYR could not find a place ID in this. Paste a Google Maps link that holds one, or the "
        "place ID itself (it often starts with ChIJ).",
        "لم تجد ALYR معرّف مكان في هذا. الصق رابط خرائط Google يتضمّن معرّف المكان، أو المعرّف "
        "نفسه (يبدأ غالباً بـ ChIJ).",
    ),
}

# The run log's line for the step (English, like every step summary).
STEP = {
    "connector.places": "Read {read} live on Google Maps.",
    "connector.places.missed": "Read {read} live on Google Maps; {missed} could not be read.",
}
