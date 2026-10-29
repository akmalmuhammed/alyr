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
        "{name} already has {n} in stock. The count is noted.",
        "«{name}» لديه {n} في المخزون بالفعل. تم تسجيل الجرد.",
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
        "No item is called \"{query}\". Check the spelling, or look in the Catalog.",
        "لا يوجد صنف باسم «{query}». تأكد من الكتابة، أو راجع الكتالوج.",
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
        "Send the stock as a number, for example: stock {name} 20 (or 12.5 for an item sold by "
        "weight or volume)",
        "أرسل المخزون كرقم، مثلاً: مخزون {name} 20 (أو 12.5 للأصناف التي تُباع بالوزن أو الحجم)",
    ),
    "stock_whole_only": (
        "{name} is counted in whole numbers. Send a whole number, for example: stock {name} 20",
        "«{name}» يُعدّ بأعداد صحيحة. أرسل عدداً صحيحاً، مثلاً: مخزون {name} 20",
    ),
    "bad_price_number": (
        "That price could not be read. Send it in riyals, for example: price {name} 12.5",
        "تعذّرت قراءة السعر. أرسله بالريال، مثلاً: سعر {name} 12.5",
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
        "{name} could not be changed: {why}",
        "تعذّر تغيير «{name}»: {why}",
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
        "It could not be undone: {name} was changed again since. Look in the Catalog.",
        "تعذّر التراجع: تغيّر «{name}» بعد ذلك. راجع الكتالوج.",
    ),
    "undo_short": (
        "It could not be undone: some of {name} was sold since, so putting the count back "
        "would be wrong. It has {n} now.",
        "تعذّر التراجع: بِيع جزء من «{name}» بعد ذلك، وإعادة الكمية قد تكون خاطئة. "
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
        "That photo did not come through. Please send it again.",
        "تعذّر تحميل الصورة. أرسلها مرة أخرى من فضلك.",
    ),
    "photo_not_image": (
        "Only photos (JPEG or PNG) can be used. Please send the picture as a photo.",
        "تُقبل الصور فقط (JPEG أو PNG). أرسل الصورة كصورة.",
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
        "We can message you once when {name} is back in stock. By saying yes you agree to "
        "get that one message from {shop} on WhatsApp. It is not a subscription and "
        "nothing else will be sent. Send STOP at any time to cancel it.",
        "يمكننا مراسلتك مرة واحدة عند توفر «{name}». بالموافقة فإنك توافق على تلقي هذه "
        "الرسالة الواحدة من {shop} عبر واتساب. وهي ليست اشتراكاً ولن يُرسل لك غيرها. "
        "أرسل «إيقاف» في أي وقت لإلغائها.",
    ),
    "notify_done": (
        "Done. We will message you once when {name} is back.",
        "تم. سنراسلك مرة واحدة عند توفر «{name}».",
    ),
    "notify_already": (
        "You are already on the list for {name}. We will message you once when it is back.",
        "أنت مسجّل بالفعل لـ«{name}». سنراسلك مرة واحدة عند توفره.",
    ),
    "notify_declined": (
        "No problem. We will not message you about {name}.",
        "لا مشكلة. لن نراسلك بخصوص «{name}».",
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
    # ── customers: ordering by code, link or name (ALY-136) ─────────────────────────
    # A line that starts with a Latin letter or a digit in an Arabic sentence opens with
    # U+200F so it reads right to left.
    "card_code": ("Item code {number}", "‏كود الصنف {number}"),
    "button_confirm": ("Confirm", "تأكيد"),
    "button_change": ("Change", "تغيير"),
    "button_place": ("Place order", "إتمام الطلب"),
    "button_account": ("On my account", "على حسابي"),
    "button_clear": ("Empty order", "تفريغ الطلب"),
    "button_name": ("Search by name", "البحث بالاسم"),
    "button_person": ("Talk to a person", "التحدث مع موظف"),
    "check_head": (
        "Please check your order from {shop}:", "راجع طلبك من {shop}:"
    ),
    "check_ask": (
        "Tap Confirm to add this to your order.", "اضغط تأكيد لإضافته إلى طلبك."
    ),
    "check_ask_many": (
        "Tap Confirm to add these to your order.", "اضغط تأكيد لإضافتها إلى طلبك."
    ),
    "line_qty": ("{qty} x {name} - {price}", "‏{qty} x {name} - {price}"),
    "line_one": ("{qty} x {price} = {total}", "‏{qty} x {price} = {total}"),
    "total": ("Total: {total}", "الإجمالي: {total}"),
    "draft_head": ("Your order from {shop}:", "طلبك من {shop}:"),
    "draft_added": ("Added to your order.", "تمت الإضافة إلى طلبك."),
    # Discount codes in the draft (ALY-150).
    "draft_items": ("Items: {total}", "الأصناف: {total}"),
    "draft_discount": ("Discount{label}: -{amount}", "خصم{label}: -{amount}"),
    "coupon_note": ("Code {coupon}: {reason}", "الرمز {coupon}: {reason}"),
    "coupon_added": (
        "Code {coupon} added: {text}.", "تمت إضافة الرمز {coupon}: {text}."
    ),
    "coupon_saved": (
        "Code {coupon} saved: {text}. Add items and it comes off your total.",
        "تم حفظ الرمز {coupon}: {text}. أضف أصنافاً ويُخصم من إجمالي طلبك.",
    ),
    "coupon_how": (
        "Send the code like this: coupon RAMADAN10",
        "أرسل الرمز هكذا: كوبون RAMADAN10",
    ),
    # Pickup or delivery in the draft (ALY-150).
    "fulfil_ask": ("Pickup or delivery?", "استلام أو توصيل؟"),
    "button_pickup": ("Pickup", "استلام"),
    "button_delivery": ("Delivery", "توصيل"),
    "zone_ask": (
        "Where should we deliver? Choose your area.", "إلى أين نوصّل؟ اختر منطقتك."
    ),
    "address_ask": (
        "Send the delivery address as a message: area, street, house or building.",
        "أرسل عنوان التوصيل كرسالة: المنطقة والشارع والمنزل أو المبنى.",
    ),
    "draft_pickup": ("Pickup from the shop", "استلام من المتجر"),
    "draft_delivery": ("Delivery to {zone}: {fee}", "التوصيل إلى {zone}: {fee}"),
    "draft_delivery_flat": ("Delivery: {fee}", "التوصيل: {fee}"),
    "draft_address": ("Address: {address}", "العنوان: {address}"),
    "draft_when": ("Delivery day: {when}", "موعد التوصيل: {when}"),
    "draft_how": (
        "To change, reply pickup or delivery.", "للتغيير أرسل: استلام أو توصيل."
    ),
    "free_word": ("free", "مجاني"),
    "coupon_total_changed": (
        "Your total is now {total}. Check it, then tap Place order.",
        "أصبح إجمالي طلبك {total}. راجعه ثم اضغط إتمام الطلب.",
    ),
    "draft_more": (
        "Send another code, link or name to add more, or tap Place order.",
        "أرسل رمزاً أو رابطاً أو اسماً آخر للإضافة، أو اضغط إتمام الطلب.",
    ),
    "draft_more_account": (
        "Send another code, link or name to add more, or place the order: pay by link or put "
        "it on your account.",
        "أرسل رمزاً أو رابطاً أو اسماً آخر للإضافة، أو أتمّ الطلب: الدفع برابط أو على حسابك.",
    ),
    "draft_empty": (
        "Your order is empty. Send an item code, a link from our page, or a name to start.",
        "طلبك فارغ. أرسل رمز صنف أو رابطاً من صفحتنا أو اسماً لتبدأ.",
    ),
    "draft_cleared": (
        "Done. Your order is empty again.", "تم. أصبح طلبك فارغاً من جديد."
    ),
    "draft_full": (
        "Your order already has {n} items, the most we can hold here. Place it first, or "
        "order the rest on our page: {link}",
        "طلبك يحتوي على {n} صنفاً، وهذا أقصى ما نستطيع حفظه هنا. أتمّه أولاً، أو اطلب الباقي "
        "من صفحتنا: {link}",
    ),
    "change_ok": (
        "No problem. Send the code, link or name of the item you want instead.",
        "لا مشكلة. أرسل رمز الصنف الذي تريده أو رابطه أو اسمه.",
    ),
    "change_ok_again": (
        "No problem. Send the code, link or name of the item you want instead, or say "
        "\"same as last time\".",
        "لا مشكلة. أرسل رمز الصنف الذي تريده أو رابطه أو اسمه، أو قل «نفس الطلب السابق».",
    ),
    "question_expired": (
        "That question has run out. Send the code again to see it.",
        "انتهت صلاحية هذا السؤال. أرسل الرمز مرة أخرى لتراه.",
    ),
    "variant_ask": (
        "Which one of {name} would you like?", "أي خيار من «{name}» تريد؟"
    ),
    "needs_choices": (
        "{name} has choices to make (a size or extras). Open it here and pick: {link}",
        "«{name}» له خيارات يجب اختيارها (مقاس أو إضافات). افتحه من هنا واختر: {link}",
    ),
    "not_found": (
        "We could not find {what} in {shop}. Check the number on the shop's page, or search "
        "by name.",
        "لم نجد {what} في {shop}. تأكد من الرقم في صفحة المتجر، أو ابحث بالاسم.",
    ),
    "not_found_what_code": ("code {number}", "‏الكود {number}"),
    "not_found_what_sku": ("{sku}", "‏{sku}"),
    "not_found_what_link": ("that item", "هذا الصنف"),
    "not_found_what_category": ("that category", "هذا القسم"),
    "not_found_other_shop": (
        "That link is for another shop, so we cannot use it here. Send a code or a link from "
        "{shop}'s page.",
        "هذا الرابط لمتجر آخر فلا نستطيع استخدامه هنا. أرسل رمزاً أو رابطاً من صفحة {shop}.",
    ),
    "search_by_name": (
        "Send the name of the item, for example: {example}",
        "أرسل اسم الصنف، مثلاً: {example}",
    ),
    "too_many_misses": (
        "That is a lot of codes we could not find. A person from {shop} will look at this and "
        "reply here.",
        "هذه رموز كثيرة لم نجدها. سيراجع أحد موظفي {shop} الأمر ويرد عليك هنا.",
    ),
    "cut_short": (
        "We read the first {n} items of your message. Send the rest in another message.",
        "قرأنا أول {n} من الأصناف في رسالتك. أرسل الباقي في رسالة أخرى.",
    ),
    "person": (
        "Thank you. A person from {shop} will read this and reply here.",
        "شكراً لك. سيقرأ أحد موظفي {shop} رسالتك ويرد عليك هنا.",
    ),
    "person_unreadable": (
        "Thank you, we received it. A person from {shop} will look at it and reply here.",
        "شكراً لك، استلمنا رسالتك. سيطلع عليها أحد موظفي {shop} ويرد عليك هنا.",
    ),
    "category_head": (
        "These are some of the items in {category} at {shop}. Pick one to see its photo and "
        "price, or see them all here: {link}",
        "هذه بعض أصناف قسم {category} في {shop}. اختر صنفاً لترى صورته وسعره، أو شاهدها كلها "
        "من هنا: {link}",
    ),
    "category_empty": (
        "There is nothing to order in {category} right now. Here is our page: {link}",
        "لا يوجد ما يمكن طلبه في قسم {category} حالياً. هذه صفحتنا: {link}",
    ),
    "same_none": (
        "You have not ordered from {shop} before, so there is nothing to repeat. Send a code, "
        "a link or a name.",
        "لم تطلب من {shop} من قبل، فلا يوجد ما يُكرَّر. أرسل رمزاً أو رابطاً أو اسماً.",
    ),
    "same_left_out": (
        "Not included, because it is not available now: {names}",
        "لم نضفه لعدم توفره الآن: {names}",
    ),
    "orders_off": (
        "This shop does not take orders in the chat yet. Here is how to see the item: ask the "
        "shop, or open its page.",
        "هذا المتجر لا يستقبل الطلبات في المحادثة. اسأل المتجر أو افتح صفحته.",
    ),
    "order_refused": ("{reason}", "{reason}"),
    "price_changed_note": (
        "The price of {name} changed from {old} to {new}.",
        "تغيّر سعر «{name}» من {old} إلى {new}.",
    ),
    "gone_note": ("{reason} I took it off your order.", "{reason} أزلته من طلبك."),
    "check_changed": (
        "Please check again before you confirm.", "راجع الطلب مرة أخرى قبل التأكيد."
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
