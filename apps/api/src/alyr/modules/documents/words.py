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
    # Beside the payment QR code of an invoice that has a payment link (ALY-141).
    "pay_scan": Text("Scan to pay online", "امسح الرمز للدفع إلكترونياً"),
    "preview": Text("Preview", "معاينة"),
    "of": Text("of", "من"),
}

UNITS: dict[str, Text] = {
    "piece": Text("pc", "قطعة"),
    "kg": Text("kg", "كغ"),
    "g": Text("g", "غ"),
    "l": Text("l", "لتر"),
    "m": Text("m", "متر"),
    "ml": Text("ml", "مل"),
    "tola": Text("tola", "تولة"),
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
    # A document the shop's own system numbered and ALYR only delivers (ALY-142).
    "external": Text(
        "Issued by the seller's own system, which gave it the number above. Delivered by ALYR.",
        "صدر عن نظام البائع نفسه الذي منحه الرقم أعلاه، وتتولى ALYR إيصاله فقط.",
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
    # ── Documents from sales, payments recorded by hand, and delivery (ALY-139) ──────────
    "send_mode_invalid": Text(
        "Choose to send documents automatically, or only when staff press send.",
        "اختر إرسال المستندات تلقائيًا، أو عند ضغط الموظف على زر الإرسال فقط.",
    ),
    "payment_not_allowed": Text(
        "Only the owner or an admin can record a payment. Ask them, or ask them to let the "
        "team record payments in the document settings.",
        "يقتصر تسجيل الدفعات على المالك أو المشرف. اطلب منهما ذلك، أو اطلب السماح للفريق "
        "بتسجيل الدفعات من إعدادات المستندات.",
    ),
    "source_not_found": Text(
        "There is no such order, booking, invoice or customer in this shop.",
        "لا يوجد طلب أو حجز أو فاتورة أو عميل بهذا الرقم في هذا المتجر.",
    ),
    "already_paid": Text(
        "This order is already paid.", "هذا الطلب مدفوع بالفعل."
    ),
    "order_cancelled": Text(
        "This order was cancelled, so it cannot be paid.",
        "أُلغي هذا الطلب، لذلك لا يمكن دفعه.",
    ),
    "order_on_account": Text(
        "This order is on the customer's credit account. Record the payment against its "
        "invoice or against the customer's balance instead.",
        "هذا الطلب مسجّل على حساب العميل الآجل. سجّل الدفعة على فاتورته أو على رصيد العميل.",
    ),
    "booking_cancelled": Text(
        "This booking was cancelled, so it cannot be paid.",
        "أُلغي هذا الحجز، لذلك لا يمكن دفعه.",
    ),
    "invoice_not_payable": Text(
        "Only an issued invoice that has not been cancelled can be paid.",
        "لا يمكن الدفع إلا عن فاتورة صادرة لم تُلغَ.",
    ),
    "amount_must_match": Text(
        "A payment for an order must be the whole total of the order.",
        "يجب أن تكون الدفعة عن الطلب بكامل إجماليه.",
    ),
    "amount_needed": Text(
        "Say how much was paid.", "اذكر المبلغ المدفوع."
    ),
    "amount_exceeds": Text(
        "That is more than is still owed.", "هذا المبلغ أكبر من المتبقي."
    ),
    "nothing_owed": Text(
        "Nothing is owed here, so there is nothing to pay.",
        "لا يوجد مبلغ مستحق هنا، فلا شيء يُدفع.",
    ),
    "receipt_unpaid": Text(
        "A receipt is for money that has been paid, and this order is not paid yet. Record "
        "the payment, or issue an invoice.",
        "يصدر الإيصال عن مبلغ مدفوع، وهذا الطلب غير مدفوع بعد. سجّل الدفعة، أو أصدر فاتورة.",
    ),
    "kind_not_for_sale": Text(
        "From an order or a booking you can issue an invoice, or a receipt once it is paid.",
        "يمكن إصدار فاتورة من الطلب أو الحجز، أو إيصال بعد دفعه.",
    ),
    "no_recipient": Text(
        "There is no WhatsApp number or email address to send this to. Type one.",
        "لا يوجد رقم واتساب أو بريد إلكتروني لإرسال المستند إليه. اكتب أحدهما.",
    ),
    "email_invalid": Text(
        "That email address is not valid.", "عنوان البريد الإلكتروني هذا غير صالح."
    ),
    "phone_invalid": Text(
        "That phone number is not valid. Write it with the country code.",
        "رقم الهاتف هذا غير صالح. اكتبه مع رمز الدولة.",
    ),
    "document_voided": Text(
        "This document has been cancelled by a credit note. Send the credit note instead.",
        "أُلغي هذا المستند بإشعار دائن. أرسل الإشعار الدائن بدلًا منه.",
    ),
    # ── Connected mode: who numbers what (ALY-142) ───────────────────────────────────────
    "external_authority": Text(
        "This kind of document is numbered by the shop's other system, so ALYR does not issue "
        "it. Change who numbers it in the connection settings, or issue it in the other system "
        "and send it to ALYR.",
        "يتولى نظام المتجر الآخر ترقيم هذا النوع من المستندات، لذلك لا تُصدره ALYR. غيّر من "
        "يتولى الترقيم من إعدادات الربط، أو أصدره في النظام الآخر وأرسله إلى ALYR.",
    ),
    "authority_number_clash": Text(
        "ALYR cannot take over numbering yet: a document from your other system already has a "
        "number that ALYR's own counter would reach. Change the prefix of the ALYR series first.",
        "لا يمكن لـ ALYR تولّي الترقيم الآن: لدى مستند من نظامك الآخر رقم قد يصل إليه عدّاد "
        "ALYR. غيّر بادئة سلسلة ALYR أولاً.",
    ),
    "document_withdrawn": Text(
        "This document was withdrawn: it was imported by mistake and never sent.",
        "سُحب هذا المستند: استُورد عن طريق الخطأ ولم يُرسل.",
    ),
    # ── The workspace screens (ALY-146) ──────────────────────────────────────────────────
    "filter_invalid": Text(
        "That filter is not one the list knows.", "هذا المرشّح غير معروف في القائمة."
    ),
    "date_range_invalid": Text(
        "The end date is before the start date.", "تاريخ النهاية قبل تاريخ البداية."
    ),
    "cursor_invalid": Text(
        "That page marker is not valid. Reload the list.",
        "علامة الصفحة هذه غير صالحة. أعد تحميل القائمة.",
    ),
    "no_public_link": Text(
        "This shop has no public address yet, so a link to the document cannot be made.",
        "ليس لهذا المتجر عنوان عام بعد، لذلك لا يمكن إنشاء رابط للمستند.",
    ),
    "page_unknown": Text(
        "The document does not have that page.", "ليس للمستند هذه الصفحة."
    ),
    "settings_override_invalid": Text(
        "The preview can only try out the look of the document, not the shop's other settings.",
        "تقتصر المعاينة على تجربة شكل المستند، لا إعدادات المتجر الأخرى.",
    ),
    # ── Standalone mode: customers and saved lines (ALY-141) ─────────────────────────────
    "customer_needs_name": Text(
        "Give the customer a name, in English or Arabic, or a company.",
        "اكتب اسم العميل بالعربية أو الإنجليزية، أو اسم الشركة.",
    ),
    "customer_needs_phone": Text(
        "A saved customer needs a phone number: it is how they are found again and how a "
        "document reaches them. For a one-off customer, type the name on the document and do "
        "not save them.",
        "يحتاج العميل المحفوظ إلى رقم هاتف: به يُعثر عليه مرة أخرى وبه يصله المستند. للعميل "
        "العابر اكتب اسمه على المستند دون حفظه.",
    ),
    "customer_not_found": Text(
        "There is no such customer in this shop.", "لا يوجد عميل بهذا الاسم في هذا المتجر."
    ),
    "phone_taken": Text(
        "Another customer already has that phone number.",
        "يوجد عميل آخر بهذا الرقم.",
    ),
    "phone_is_staff": Text(
        "That number belongs to someone on the team, not to a customer.",
        "هذا الرقم لأحد أعضاء الفريق وليس لعميل.",
    ),
    "saved_line_needs_text": Text(
        "Give the line a name, in English or Arabic.", "اكتب اسمًا للبند بالعربية أو الإنجليزية."
    ),
    "saved_line_not_found": Text(
        "There is no such saved line.", "لا يوجد بند محفوظ بهذا الاسم."
    ),
    "saved_lines_full": Text(
        "The list of saved lines is full (500). Remove some you no longer use.",
        "قائمة البنود المحفوظة ممتلئة (500). احذف بعض ما لم تعد تستخدمه.",
    ),
    "quick_empty": Text(
        "Write what you are invoicing, for example: AC repair 500 for Ahmed 5551 2345.",
        "اكتب ما تحاسب عليه، مثلًا: صيانة مكيف 500 لأحمد 55512345.",
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
