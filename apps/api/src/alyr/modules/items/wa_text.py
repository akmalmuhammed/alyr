"""Every word the Catalog says on WhatsApp, in English and Arabic, in one place (ALY-106).

Staff get confirmations, questions and help; customers get item cards and the
back-in-stock conversation; the shop's managers get alerts. Keeping them together lets
the Arabic be read in one sitting by a native reviewer (ALY-66): until then it is a draft.

A sentence is looked up by its code and filled from the details given. A detail that is
missing leaves a gap rather than breaking the message. `{name}` is always an item (or a
size) already in the language of the sentence; use `shown` to pick it.
"""

# code: (English, Arabic)
WORDS: dict[str, tuple[str, str]] = {
    # ── staff: what was done ────────────────────────────────────────────────────────
    "sold_out_done": (
        "Done: {name} is now sold out. Customers cannot order it.",
        "تم: نفد «{name}». لا يستطيع العملاء طلبه.",
    ),
    "sold_out_variant_done": (
        "Done: {name} is now at 0 in stock, so customers cannot order that choice.",
        "تم: أصبح «{name}» صفراً في المخزون، فلا يستطيع العملاء طلب هذا الاختيار.",
    ),
    "back_done": (
        "Done: {name} is back on. Customers can order it.",
        "تم: عاد «{name}» للبيع. يستطيع العملاء طلبه.",
    ),
    "back_no_stock": (
        "{name} is switched back on, but none is in stock, so customers still cannot order "
        "it. Add stock with: stock {name} 10",
        "أُعيد تشغيل «{name}» لكن لا توجد كمية في المخزون، فما زال العملاء لا يستطيعون "
        "طلبه. أضف كمية بهذه الرسالة: مخزون {name} 10",
    ),
    "back_variant_needs_number": (
        "How many {name} are there? Send for example: stock {name} 10",
        "كم عدد «{name}»؟ أرسل مثلاً: مخزون {name} 10",
    ),
    "already_sold_out": (
        "{name} was already sold out. Nothing changed.",
        "«{name}» نافد بالفعل. لم يتغير شيء.",
    ),
    "already_back": (
        "{name} was already on sale. Nothing changed.",
        "«{name}» معروض للبيع بالفعل. لم يتغير شيء.",
    ),
    "stock_done": (
        "Done: {name} now has {n} in stock (it was {before}).",
        "تم: أصبح لدى «{name}» {n} في المخزون (كان {before}).",
    ),
    "stock_same": (
        "{name} already has {n} in stock. I noted the count.",
        "«{name}» لديه {n} في المخزون بالفعل. سجّلتُ الجرد.",
    ),
    "price_done": (
        "Done: {name} now costs {price} (it was {before}).",
        "تم: أصبح سعر «{name}» {price} (كان {before}).",
    ),
    "price_same": (
        "{name} already costs {price}. Nothing changed.",
        "سعر «{name}» هو {price} بالفعل. لم يتغير شيء.",
    ),
    # ── staff: questions and refusals ───────────────────────────────────────────────
    "choose": (
        "Which one did you mean?\n{options}\nReply with the number.",
        "أي واحد تقصد؟\n{options}\nأرسل الرقم.",
    ),
    "choose_more": (
        "There are more than 10 matches for \"{query}\". Send a little more of the name.",
        "هناك أكثر من 10 نتائج لـ«{query}». أرسل جزءاً أكبر من الاسم.",
    ),
    "choose_expired": (
        "I no longer have that question. Send the message again.",
        "لم يعد هذا السؤال قائماً. أرسل الرسالة مرة أخرى.",
    ),
    "none_found": (
        "I could not find an item called \"{query}\". Check the spelling, or look in the "
        "Catalog.",
        "لم أجد صنفاً باسم «{query}». تأكد من الكتابة، أو راجع الكتالوج.",
    ),
    "no_name": (
        "Which item? For example: {example}",
        "أي صنف؟ مثلاً: {example}",
    ),
    "no_number_stock": (
        "How many are in stock? For example: stock {name} 20",
        "كم الكمية في المخزون؟ مثلاً: مخزون {name} 20",
    ),
    "no_number_price": (
        "What is the new price? For example: price {name} 12",
        "ما السعر الجديد؟ مثلاً: سعر {name} 12",
    ),
    "bad_stock_number": (
        "Send the stock as a whole number, for example: stock {name} 20",
        "أرسل المخزون كرقم صحيح، مثلاً: مخزون {name} 20",
    ),
    "bad_price_number": (
        "I could not read that price. Send it in riyals, for example: price {name} 12.5",
        "لم أستطع قراءة السعر. أرسله بالريال، مثلاً: سعر {name} 12.5",
    ),
    "price_too_big": (
        "That price is too high. The most is QAR 1,000,000.",
        "هذا السعر مرتفع جداً. الحد الأقصى 1,000,000 ريال.",
    ),
    "not_counted": (
        "{name} is not counted in stock: it only has a sold out switch. To count it, change "
        "how it runs out in the Catalog.",
        "«{name}» لا يُحسب بالكمية، بل له مفتاح نفاد فقط. لعدّه غيّر طريقة نفاده من الكتالوج.",
    ),
    "no_switch": (
        "{name} is always available, so it has no sold out switch.",
        "«{name}» متاح دائماً، ولذلك ليس له مفتاح نفاد.",
    ),
    "not_live": (
        "{name} is not on sale yet (it is a {status}), so I left it alone.",
        "«{name}» غير معروض للبيع بعد ({status})، لذلك تركته كما هو.",
    ),
    "status_draft": ("draft", "مسودة"),
    "status_hidden": ("hidden item", "صنف مخفي"),
    "status_archived": ("archived item", "صنف مؤرشف"),
    "cannot_change": (
        "I could not change {name}: {why}",
        "لم أستطع تغيير «{name}»: {why}",
    ),
    # ── staff: undo ────────────────────────────────────────────────────────────────
    "undo_button": ("Undo", "تراجع"),
    "undone_switch_off": (
        "Undone: {name} is sold out again.",
        "تم التراجع: «{name}» نافد من جديد.",
    ),
    "undone_switch_on": (
        "Undone: {name} is back on sale.",
        "تم التراجع: «{name}» عاد للبيع.",
    ),
    "undone_stock": (
        "Undone: {name} now has {n} in stock.",
        "تم التراجع: أصبح لدى «{name}» {n} في المخزون.",
    ),
    "undone_price": (
        "Undone: {name} costs {price} again.",
        "تم التراجع: سعر «{name}» عاد إلى {price}.",
    ),
    "undone_on_sale": (
        "Undone: {name} is a draft again, not on sale.",
        "تم التراجع: «{name}» عاد مسودة وغير معروض للبيع.",
    ),
    "undone_draft": (
        "Undone: the draft is removed. The photo is still in the Catalog's photos.",
        "تم التراجع: حُذفت المسودة. الصورة ما زالت في صور الكتالوج.",
    ),
    "undo_nothing": (
        "There is nothing to undo.",
        "لا يوجد ما يمكن التراجع عنه.",
    ),
    "undo_already": (
        "That change was already undone.",
        "تم التراجع عن هذا التغيير من قبل.",
    ),
    "undo_changed": (
        "I could not undo it: {name} was changed again since. Look in the Catalog.",
        "لم أستطع التراجع: تغيّر «{name}» بعد ذلك. راجع الكتالوج.",
    ),
    "undo_short": (
        "I could not undo it: some of {name} was sold since, so putting the count back "
        "would be wrong. It has {n} now.",
        "لم أستطع التراجع: بِيع جزء من «{name}» بعد ذلك، وإعادة الكمية قد تكون خاطئة. "
        "لديه الآن {n}.",
    ),
    # ── staff: photos ───────────────────────────────────────────────────────────────
    "draft_saved": (
        "Saved as a draft: {summary}. It is not on sale until an owner confirms it.",
        "حُفظت كمسودة: {summary}. لن تُعرض للبيع حتى يؤكدها المالك.",
    ),
    "draft_saved_ask": (
        "Saved as a draft: {summary}. Put it on sale?",
        "حُفظت كمسودة: {summary}. هل تعرضها للبيع؟",
    ),
    "draft_incomplete": (
        "Saved the photo as a draft with {missing}. Finish it in the Catalog.",
        "حُفظت الصورة كمسودة {missing}. أكملها من الكتالوج.",
    ),
    "draft_summary": ("{name}, {price}", "{name}، {price}"),
    "no_name_yet": ("no name", "بلا اسم"),
    "no_price_yet": ("no price", "بلا سعر"),
    "missing_name_and_price": (
        "no name and no price yet", "بلا اسم وبلا سعر بعد"
    ),
    "missing_name": ("no name yet", "بلا اسم بعد"),
    "missing_price": ("no price yet", "بلا سعر بعد"),
    "put_on_sale": ("Put on sale", "اعرضها للبيع"),
    "on_sale_done": (
        "Done: {name} is on sale at {price}.",
        "تم: «{name}» معروض للبيع بسعر {price}.",
    ),
    "on_sale_needs_arabic": (
        "{name} needs its Arabic name before it can go on sale (Qatar's consumer law asks "
        "for Arabic). Add it in the Catalog.",
        "«{name}» يحتاج اسمه العربي قبل عرضه للبيع (قانون المستهلك في قطر يطلب العربية). "
        "أضفه من الكتالوج.",
    ),
    "on_sale_needs_details": (
        "{name} needs a name and a price before it can go on sale. Add them in the Catalog.",
        "«{name}» يحتاج اسماً وسعراً قبل عرضه للبيع. أضفهما من الكتالوج.",
    ),
    "on_sale_owner_only": (
        "Only an owner can put an item on sale. It stays a draft in the Catalog.",
        "المالك فقط يستطيع عرض الصنف للبيع. يبقى مسودة في الكتالوج.",
    ),
    "photo_already": (
        "That photo is already on {name}.",
        "هذه الصورة موجودة بالفعل على «{name}».",
    ),
    "photo_failed": (
        "I could not get that photo. Please send it again.",
        "لم أستطع تحميل الصورة. أرسلها مرة أخرى من فضلك.",
    ),
    "photo_not_image": (
        "I can only use photos (JPEG or PNG). Please send the picture as a photo.",
        "أستطيع استخدام الصور فقط (JPEG أو PNG). أرسل الصورة كصورة.",
    ),
    "photo_cap": (
        "The shop cannot hold more items or photos right now. Nothing was deleted. "
        "Remove some in the Catalog.",
        "لا يستطيع المتجر حفظ المزيد من الأصناف أو الصور الآن. لم يُحذف شيء. احذف بعضها "
        "من الكتالوج.",
    ),
    # ── staff: help ─────────────────────────────────────────────────────────────────
    "help": (
        "What I understand:\n"
        "- sold out shawarma\n"
        "- back shawarma\n"
        "- stock abaya black M 5\n"
        "- price shawarma 12\n"
        "- undo\n"
        "Send a photo with the name and price as its caption to add a draft item.",
        "ما أفهمه:\n"
        "- نفذ شاورما\n"
        "- رجع شاورما\n"
        "- مخزون عباية أسود M 5\n"
        "- سعر شاورما 12\n"
        "- تراجع\n"
        "أرسل صورة مع الاسم والسعر في التعليق لإضافة صنف كمسودة.",
    ),
    "help_example": ("sold out shawarma", "نفذ شاورما"),
    # ── customers: an item in the chat ──────────────────────────────────────────────
    "card_price": ("{price}", "{price}"),
    "card_from": ("from {price}", "ابتداءً من {price}"),
    "card_was": ("(was {was})", "(كان {was})"),
    "card_choices": ("Choices: {list}", "الخيارات: {list}"),
    "card_left": ("Only {n} left", "المتبقي {n} فقط"),
    "card_sold_out": (
        "Sold out right now.", "نفد حالياً."
    ),
    "card_off": (
        "Not available right now.", "غير متاح حالياً."
    ),
    "card_when": (
        "You can order it again {when}.", "يمكنك طلبه مجدداً {when}."
    ),
    "card_closed": (
        "It cannot be ordered right now.", "لا يمكن طلبه حالياً."
    ),
    "button_order": ("Order", "اطلب"),
    "button_notify": ("Tell me when back", "أخبرني عند توفره"),
    "button_yes": ("Yes, tell me", "نعم، أخبرني"),
    "button_no": ("No thanks", "لا شكراً"),
    "menu_body": (
        "Here is our menu from {shop}. Pick an item to see its photo and price, or order "
        "everything here: {link}",
        "هذه قائمة {shop}. اختر صنفاً لترى صورته وسعره، أو اطلب كل شيء من هنا: {link}",
    ),
    "menu_body_more": (
        "Here are some items from {shop}. Pick one to see its photo and price, or see the "
        "whole menu and order here: {link}",
        "هذه بعض أصناف {shop}. اختر صنفاً لترى صورته وسعره، أو شاهد القائمة كاملة واطلب "
        "من هنا: {link}",
    ),
    "menu_pick": ("Choose an item", "اختر صنفاً"),
    "several_match": (
        "A few items match. Pick one to see its photo and price.",
        "هناك عدة أصناف مطابقة. اختر واحداً لترى صورته وسعره.",
    ),
    # ── customers: tell me when it is back ──────────────────────────────────────────
    "notify_ask": (
        "I can message you once when {name} is back in stock. By saying yes you agree to "
        "get that one message from {shop} on WhatsApp. It is not a subscription and "
        "nothing else will be sent. Send STOP at any time to cancel it.",
        "يمكنني مراسلتك مرة واحدة عند توفر «{name}». بالموافقة فإنك توافق على تلقي هذه "
        "الرسالة الواحدة من {shop} عبر واتساب. وهي ليست اشتراكاً ولن يُرسل لك غيرها. "
        "أرسل «إيقاف» في أي وقت لإلغائها.",
    ),
    "notify_done": (
        "Done. I will message you once when {name} is back.",
        "تم. سأراسلك مرة واحدة عند توفر «{name}».",
    ),
    "notify_already": (
        "You are already on the list for {name}. I will message you once when it is back.",
        "أنت مسجّل بالفعل لـ«{name}». سأراسلك مرة واحدة عند توفره.",
    ),
    "notify_declined": (
        "No problem. I will not message you about {name}.",
        "لا مشكلة. لن أراسلك بخصوص «{name}».",
    ),
    "notify_in_stock": (
        "{name} is available now. You can order it here: {link}",
        "«{name}» متوفر الآن. يمكنك طلبه من هنا: {link}",
    ),
    "notify_opted_out": (
        "You asked us to stop messages from {shop}. Send START if you would like updates "
        "again, then ask me once more.",
        "طلبتَ إيقاف رسائل {shop}. أرسل «اشترك» إن أردت تلقي التحديثات، ثم اطلب مني مرة "
        "أخرى.",
    ),
    "notify_unknown": (
        "Which item should I tell you about? Send its name, for example: tell me when "
        "{example} is back",
        "عن أي صنف أخبرك؟ أرسل اسمه، مثلاً: أخبرني عند توفر {example}",
    ),
    "back_in_stock": (
        "Good news from {shop}: {name} is back in stock, as you asked. You can order here: "
        "{link}",
        "أخبار سارة من {shop}: عاد «{name}» إلى المخزون كما طلبت. يمكنك الطلب من هنا: {link}",
    ),
    # ── managers: alerts ────────────────────────────────────────────────────────────
    "alert_low": (
        "Low stock: {name} has only {left} left.",
        "مخزون منخفض: «{name}» المتبقي منه {left} فقط.",
    ),
    "alert_sold_out": (
        "Sold out: {name} has just run out, so customers cannot order it.",
        "نفد: «{name}» نفد للتو، فلا يستطيع العملاء طلبه.",
    ),
    "alert_refund": (
        "Refund due: order {number} for {amount} was cancelled after the customer paid. "
        "The refund is yours to make from your own payment account: ALYR never holds money.",
        "استرداد مستحق: أُلغي الطلب رقم {number} بمبلغ {amount} بعد أن دفع العميل. "
        "الاسترداد عليك من حسابك للدفع، فـ ALYR لا تحتفظ بالأموال.",
    ),
    "alert_refund_late": (
        "Refund due: a payment of {amount} arrived for order {number} after its payment "
        "link expired and the order was cancelled. The refund is yours to make from your "
        "own payment account: ALYR never holds money.",
        "استرداد مستحق: وصلت دفعة بمبلغ {amount} للطلب رقم {number} بعد انتهاء رابط الدفع "
        "وإلغاء الطلب. الاسترداد عليك من حسابك للدفع، فـ ALYR لا تحتفظ بالأموال.",
    ),
    "alert_draft": (
        "{who} sent a photo for a new item: {summary}. Check it in the Catalog and put it "
        "on sale.",
        "أرسل {who} صورة لصنف جديد: {summary}. راجعه في الكتالوج واعرضه للبيع.",
    ),
    "alert_left_each": ("{variant}: {n}", "{variant}: {n}"),
}


class _Blank(dict):
    """A sentence still reads if a detail is missing."""

    def __missing__(self, key: str) -> str:
        return ""


def lang_of(lang: str) -> str:
    return "ar" if lang == "ar" else "en"


def say(code: str, lang: str, **details: object) -> str:
    english, arabic = WORDS[code]
    return (arabic if lang_of(lang) == "ar" else english).format_map(_Blank(details))


def shown(names: dict, lang: str, key: str = "name") -> str:
    """An item's (or size's) name in the language of the sentence, falling back to the
    other language when the shop has not written this one."""
    english, arabic = names.get(key, ""), names.get(f"{key}_ar", "")
    return (arabic or english) if lang_of(lang) == "ar" else (english or arabic)
