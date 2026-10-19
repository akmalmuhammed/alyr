"""Every word a document says, in English and Arabic, kept together so the Arabic can be
reviewed in one read (ALY-66: it is a draft until a native speaker has been through it).

Formal Modern Standard Arabic (`alyr-design/arabic.md`): a document is not a chat. Western
digits everywhere. The currency comes after the amount (`money.written`). Product names and
"ALYR" stay Latin. Nothing here says "coming soon" or "beta": a document says what is true of
the paper in front of the reader.

Two kinds of text live here: what is printed on the paper (`LABELS`, `KIND_TITLES`, `UNITS`,
`PAYMENT_METHODS`, `NOTES`) and what the API says when it refuses something (`ERRORS`).
"""

from alyr.catalog import Text

# ── What a kind of document is called ─────────────────────────────────────────────────────
KIND_TITLES: dict[str, Text] = {
    "receipt": Text("Receipt", "إيصال"),
    "invoice": Text("Invoice", "فاتورة"),
    "quote": Text("Quotation", "عرض سعر"),
    "delivery_note": Text("Delivery note", "إشعار تسليم"),
    "statement": Text("Statement of account", "كشف حساب"),
    "credit_note": Text("Credit note", "إشعار دائن"),
    "deposit_receipt": Text("Deposit receipt", "إيصال عربون"),
    "proforma": Text("Proforma invoice", "فاتورة أولية"),
}
# An invoice that carries tax and a tax number says so. Never used while tax is off.
TAX_INVOICE = Text("Tax invoice", "فاتورة ضريبية")

# ── Labels on the page ────────────────────────────────────────────────────────────────────
LABELS: dict[str, Text] = {
    "number": Text("No.", "الرقم"),
    "date": Text("Date", "التاريخ"),
    "due_date": Text("Due date", "تاريخ الاستحقاق"),
    "valid_until": Text("Valid until", "صالح حتى"),
    "customer": Text("Customer", "العميل"),
    "deliver_to": Text("Deliver to", "المستلم"),
    "company": Text("Company", "الشركة"),
    "phone": Text("Phone", "الهاتف"),
    "tel": Text("Tel", "هاتف"),
    "email": Text("Email", "البريد الإلكتروني"),
    "address": Text("Address", "العنوان"),
    "registration": Text("Commercial registration", "السجل التجاري"),
    "customer_registration": Text("Registration no.", "رقم السجل"),
    "tax_id": Text("Tax ID", "الرقم الضريبي"),
    "licence": Text("Licence no.", "رقم الرخصة"),
    # The table.
    "item_no": Text("#", "م"),
    "description": Text("Description", "الوصف"),
    "sku": Text("SKU", "رمز الصنف"),
    "qty": Text("Qty", "الكمية"),
    "unit_price": Text("Unit price", "سعر الوحدة"),
    "discount": Text("Discount", "الخصم"),
    "tax": Text("Tax", "الضريبة"),
    "rounding": Text("Rounding", "تقريب"),
    "branch": Text("Branch", "الفرع"),
    "tax_rate": Text("Tax %", "نسبة الضريبة"),
    "line_total": Text("Total", "الإجمالي"),
    # The totals.
    "subtotal": Text("Subtotal", "المجموع الفرعي"),
    "total": Text("Total", "الإجمالي"),
    "paid": Text("Paid", "المدفوع"),
    "balance": Text("Balance due", "المتبقي"),
    "currency": Text("Currency", "العملة"),
    # The foot.
    "notes": Text("Notes", "ملاحظات"),
    "terms": Text("Terms", "الشروط والأحكام"),
    "bank": Text("Bank details", "بيانات الحساب المصرفي"),
    "signature": Text("Signature and stamp", "التوقيع والختم"),
    "payment": Text("Payment", "الدفع"),
    "reason": Text("Reason", "السبب"),
    "against": Text("Against", "بخصوص"),
    "page": Text("Page", "صفحة"),
    "code": Text("Document code", "رمز المستند"),
    "issued_with": Text("Issued with ALYR", "صدر عبر ALYR"),
    "preview": Text("Preview", "معاينة"),
    "of": Text("of", "من"),
}

UNITS: dict[str, Text] = {
    "piece": Text("pc", "قطعة"),
    "kg": Text("kg", "كغ"),
    "g": Text("g", "غ"),
    "l": Text("l", "لتر"),
    "m": Text("m", "متر"),
    "box": Text("box", "علبة"),
    "pack": Text("pack", "عبوة"),
    "portion": Text("portion", "حصة"),
    "hour": Text("hour", "ساعة"),
    "day": Text("day", "يوم"),
    "service": Text("service", "خدمة"),
}

PAYMENT_METHODS: dict[str, Text] = {
    "cash": Text("Cash", "نقدًا"),
    "card": Text("Card", "بطاقة"),
    "bank_transfer": Text("Bank transfer", "تحويل مصرفي"),
    "link": Text("Payment link", "رابط دفع"),
    "credit": Text("On account", "على الحساب"),
    "cheque": Text("Cheque", "شيك"),
    "other": Text("Other", "أخرى"),
}

# A seller without a commercial registration number issues receipts, and each says so.
NOTES: dict[str, Text] = {
    "unregistered": Text(
        "The seller has no commercial registration number on file. This document is a "
        "receipt and is not a tax invoice. ALYR does not give tax advice.",
        "لا يوجد رقم سجل تجاري مسجّل للبائع. هذا المستند إيصال وليس فاتورة ضريبية. "
        "لا تقدّم ALYR استشارات ضريبية.",
    ),
    "preview": Text(
        "Preview. This is not an issued document and has no number.",
        "معاينة. هذا المستند غير صادر وليس له رقم.",
    ),
}

# ── What the API says when it refuses ────────────────────────────────────────────────────
ERRORS: dict[str, Text] = {
    "module_off": Text(
        "Documents are not switched on for this shop.", "المستندات غير مفعّلة لهذا المتجر."
    ),
    "not_allowed": Text(
        "Only the owner or an admin can do this.", "يقتصر هذا على المالك أو المشرف."
    ),
    "cannot_issue": Text(
        "Only the owner or an admin can issue documents. Ask them, or ask them to let the "
        "team issue documents in the document settings.",
        "يقتصر إصدار المستندات على المالك أو المشرف. اطلب منهما ذلك، أو اطلب السماح للفريق "
        "بالإصدار من إعدادات المستندات.",
    ),
    "not_found": Text("There is no such document.", "لا يوجد مستند بهذا الرقم."),
    "not_a_draft": Text(
        "This document has been issued and can no longer be changed. To correct it, issue a "
        "credit note.",
        "صدر هذا المستند ولا يمكن تعديله. لتصحيحه أصدر إشعارًا دائنًا.",
    ),
    "already_issued": Text(
        "This document has already been issued.", "صدر هذا المستند من قبل."
    ),
    "key_reused": Text(
        "That idempotency key was already used for a different document.",
        "سبق استخدام مفتاح التكرار هذا لمستند آخر.",
    ),
    "key_needed": Text(
        "Send an Idempotency-Key header (8 to 80 letters, digits, dashes or dots) so a retry "
        "cannot issue the document twice.",
        "أرسل ترويسة Idempotency-Key (من 8 إلى 80 حرفًا أو رقمًا أو شرطة) حتى لا يصدر المستند "
        "مرتين عند إعادة المحاولة.",
    ),
    "key_invalid": Text(
        "The idempotency key must be 8 to 80 letters, digits, dashes, dots or colons.",
        "يجب أن يتكون مفتاح التكرار من 8 إلى 80 حرفًا أو رقمًا أو شرطة أو نقطة.",
    ),
    "quantity_invalid": Text(
        "A quantity must be more than zero, with at most three decimal places.",
        "يجب أن تكون الكمية أكبر من صفر، بثلاث منازل عشرية على الأكثر.",
    ),
    "no_lines": Text(
        "Add at least one line.", "أضف بندًا واحدًا على الأقل."
    ),
    "too_many_lines": Text(
        "A document can have at most 200 lines.", "يتسع المستند لـ 200 بند على الأكثر."
    ),
    "line_needs_text": Text(
        "Every line needs a description, in English or in Arabic.",
        "يلزم لكل بند وصف بالإنجليزية أو بالعربية.",
    ),
    "discount_too_big": Text(
        "A discount cannot be more than the line it is taken from.",
        "لا يجوز أن يزيد الخصم على قيمة البند.",
    ),
    "amount_too_big": Text(
        "That amount is too large.", "هذا المبلغ كبير جدًا."
    ),
    "tax_off": Text(
        "Tax is switched off for this shop. Turn it on in the document settings to add it "
        "to a line.",
        "الضريبة غير مفعّلة لهذا المتجر. فعّلها من إعدادات المستندات لإضافتها إلى بند.",
    ),
    "currency_unknown": Text(
        "A document can be in QAR, SAR, AED, OMR, KWD, BHD or USD.",
        "يمكن إصدار المستند بالريال القطري أو السعودي أو الدرهم الإماراتي أو الريال "
        "العماني أو الدينار الكويتي أو البحريني أو الدولار.",
    ),
    "customer_needed": Text(
        "This kind of document needs the customer's name.",
        "يحتاج هذا النوع من المستندات إلى اسم العميل.",
    ),
    "seller_needed": Text(
        "Add the shop's name in the document settings before issuing.",
        "أضف اسم المتجر في إعدادات المستندات قبل الإصدار.",
    ),
    # Friendly on purpose: the shop did nothing wrong. Whether an unregistered seller may issue
    # an invoice at all is a question for the lawyer (ALY-51, spec 011); until it is answered
    # the safe choice is a receipt, and the words must not read as a verdict on the shop.
    "registration_needed": Text(
        "To issue an invoice, we need your shop's commercial registration (CR) number. "
        "You can add it in your document settings. In the meantime you can issue a receipt, "
        "which does not need one.",
        "لإصدار فاتورة نحتاج إلى رقم السجل التجاري لمتجرك. يمكنك إضافته من إعدادات المستندات. "
        "وفي الأثناء يمكنك إصدار إيصال، فهو لا يحتاج إلى هذا الرقم.",
    ),
    "payment_needed": Text(
        "A receipt is issued for money that has been paid in full. Add the payment, or "
        "issue an invoice instead.",
        "يصدر الإيصال عن مبلغ مدفوع بالكامل. أضف الدفعة، أو أصدر فاتورة بدلًا منه.",
    ),
    "deposit_needed": Text(
        "A deposit receipt needs the amount received.",
        "يحتاج إيصال العربون إلى المبلغ المستلم.",
    ),
    "overpaid": Text(
        "The payments are more than the total.", "المدفوعات أكثر من الإجمالي."
    ),
    "total_zero": Text(
        "The total must be more than zero.", "يجب أن يكون الإجمالي أكبر من صفر."
    ),
    "arabic_required": Text(
        "A document for a consumer in Qatar must have Arabic on it. Choose Arabic with "
        "English, English with Arabic, or Arabic only.",
        "يجب أن يتضمن المستند الموجّه إلى مستهلك في قطر اللغة العربية. اختر العربية مع "
        "الإنجليزية، أو الإنجليزية مع العربية، أو العربية فقط.",
    ),
    "layout_unknown": Text(
        "Choose A4, A5 or thermal 80 mm.", "اختر A4 أو A5 أو الحراري 80 ملم."
    ),
    "kind_unknown": Text("Unknown kind of document.", "نوع المستند غير معروف."),
    "credit_needs_reason": Text(
        "Say why the credit note is issued.", "اذكر سبب إصدار الإشعار الدائن."
    ),
    "cannot_credit": Text(
        "Only an issued invoice, receipt or deposit receipt can be credited.",
        "لا يمكن إصدار إشعار دائن إلا عن فاتورة أو إيصال أو إيصال عربون صادر.",
    ),
    "credit_too_big": Text(
        "The credit notes would add up to more than the document they cancel.",
        "مجموع الإشعارات الدائنة سيزيد على المستند الذي تلغيه.",
    ),
    "already_void": Text(
        "This document has already been cancelled by a credit note.",
        "أُلغي هذا المستند بإشعار دائن من قبل.",
    ),
    "prefix_invalid": Text(
        "A prefix is 1 to 8 capital letters or digits.", "البادئة من 1 إلى 8 أحرف لاتينية كبيرة أو أرقام."
    ),
    "prefix_taken": Text(
        "Another numbering series already uses that prefix.", "تستخدم سلسلة ترقيم أخرى هذه البادئة."
    ),
    "colour_invalid": Text(
        "The colour must be six hexadecimal digits after a hash sign.",
        "يجب أن يتكون اللون من ستة أرقام سداسية عشرية بعد علامة #.",
    ),
    "colour_too_light": Text(
        "That colour is too light to print on white. Choose a darker one.",
        "هذا اللون فاتح جدًا للطباعة على الورق الأبيض. اختر لونًا أغمق.",
    ),
    "text_too_long": Text("That text is too long.", "هذا النص طويل جدًا."),
    "image_too_big": Text(
        "The picture is too large. Use one under 2 MB.", "الصورة كبيرة جدًا. استخدم صورة أقل من 2 ميغابايت."
    ),
    "no_payments_here": Text(
        "This kind of document does not record a payment.",
        "لا يسجّل هذا النوع من المستندات دفعة.",
    ),
    "series_year_behind": Text(
        "This numbering series has already moved on to a later year.",
        "انتقلت سلسلة الترقيم هذه إلى سنة لاحقة.",
    ),
    "branch_unknown": Text(
        "There is no such branch, or it is switched off.", "لا يوجد فرع بهذا الاسم، أو أنه موقوف."
    ),
    "code_taken": Text(
        "Another branch already uses that code.", "يستخدم فرع آخر هذا الرمز."
    ),
    "code_invalid": Text(
        "A branch code is 1 to 4 capital letters or digits.",
        "رمز الفرع من 1 إلى 4 أحرف لاتينية كبيرة أو أرقام.",
    ),
    "branch_main": Text(
        "The main branch is the shop itself: it cannot be switched off or given a code.",
        "الفرع الرئيسي هو المتجر نفسه: لا يمكن إيقافه ولا إعطاؤه رمزًا.",
    ),
    "rounding_invalid": Text(
        "Cash rounding is off, or to the nearest 5, 10, 25, 50 or 100 minor units.",
        "التقريب النقدي موقوف، أو إلى أقرب 5 أو 10 أو 25 أو 50 أو 100 من أصغر وحدة.",
    ),
    "series_unknown": Text("There is no such numbering series.", "لا توجد سلسلة ترقيم بهذا الاسم."),
    "image_invalid": Text(
        "Use a JPEG, PNG or WebP picture.", "استخدم صورة بصيغة JPEG أو PNG أو WebP."
    ),
    "credit_note_route": Text(
        "A credit note is made from the document it cancels. Open that document and choose "
        "credit note.",
        "يصدر الإشعار الدائن من المستند الذي يلغيه. افتح ذلك المستند واختر إشعارًا دائنًا.",
    ),
    "credit_needs_lines": Text(
        "Part of this document has already been credited. List what this credit note covers.",
        "سبق إصدار إشعار دائن عن جزء من هذا المستند. اذكر البنود التي يشملها هذا الإشعار.",
    ),
    "not_issued": Text(
        "This document has not been issued yet, so it has no PDF. Preview it instead.",
        "لم يصدر هذا المستند بعد، لذلك لا يوجد له ملف PDF. استخدم المعاينة.",
    ),
    "preview_needs_input": Text(
        "Send a draft to preview, or ask for the sample.",
        "أرسل مسودة لمعاينتها، أو اطلب النموذج.",
    ),
}


def say(table: dict[str, Text], key: str, lang: str) -> str:
    return table[key].get(lang)


# ── Months, for dates written out the way a document writes them ─────────────────────────
MONTHS_EN = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MONTHS_AR = ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس",
             "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر")

# ── Things a document can be missing without being refused (the API lists them) ──────────
WARNINGS: dict[str, Text] = {
    "arabic_not_main": Text(
        "This document leads in English. For a consumer in Qatar the ministry's circular is "
        "reported to ask for Arabic as the main language, so Arabic first is the safe choice.",
        "تبدأ هذه الوثيقة بالإنجليزية. يُنقل أن تعميم الوزارة يطلب أن تكون العربية اللغة "
        "الرئيسية للمستهلك في قطر، لذا فتقديم العربية أولًا هو الخيار الأسلم.",
    ),
    "line_missing_arabic": Text(
        "Some lines have no Arabic description. They will show in English on the Arabic side.",
        "بعض البنود ليس لها وصف بالعربية. ستظهر بالإنجليزية في الجانب العربي.",
    ),
    "seller_missing_arabic": Text(
        "The shop's name has no Arabic spelling in the document settings.",
        "ليس لاسم المتجر كتابة بالعربية في إعدادات المستندات.",
    ),
    "terms_missing_arabic": Text(
        "The notes or terms have English text but no Arabic.",
        "الملاحظات أو الشروط لها نص بالإنجليزية وليس بالعربية.",
    ),
}
