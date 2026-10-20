"""What the connected-mode API says when it refuses, in English and Arabic together so the Arabic
can be read in one pass (ALY-66: a draft until a native speaker has been through it).

A developer reads the English `detail` and programs against the `code`; a shop owner reading a
CSV preview or the settings screen reads whichever language the screen is in. Modern Standard
Arabic, Western digits, product names and field names stay Latin.
"""

from alyr.catalog import Text
from alyr.modules.documents.errors import DocumentError


class ConnectError(DocumentError):
    """A refusal of the connected-mode API. A `DocumentError` in every way that matters (the
    app's one handler answers it with `detail`, `code`, `message_ar` and whatever `extra` says),
    with its words kept here."""

    def __init__(self, code: str, status: int = 422, **extra: object) -> None:
        self.code, self.status, self.extra = code, status, extra
        self.en = ERRORS[code].en
        self.ar = ERRORS[code].ar
        Exception.__init__(self, self.en)


ERRORS: dict[str, Text] = {
    # ── Keys ─────────────────────────────────────────────────────────────────────────────
    "key_missing": Text(
        "Send your API key in the Authorization header: Authorization: Bearer <key>.",
        "أرسل مفتاح الواجهة في ترويسة Authorization بالصيغة: Authorization: Bearer <key>.",
    ),
    "key_invalid": Text(
        "That API key is not valid.", "مفتاح الواجهة هذا غير صالح.",
    ),
    "key_revoked": Text(
        "That API key has been revoked. Ask the shop for a new one.",
        "أُلغي مفتاح الواجهة هذا. اطلب من المتجر مفتاحاً جديداً.",
    ),
    "scope_missing": Text(
        "This API key is not allowed to do that. The shop can make a key with the right scope.",
        "لا يسمح مفتاح الواجهة هذا بهذا الإجراء. يمكن للمتجر إنشاء مفتاح بالصلاحية المناسبة.",
    ),
    "rate_limited": Text(
        "Too many requests for this key. Wait for the number of seconds in Retry-After, then "
        "try again.",
        "عدد الطلبات لهذا المفتاح كبير جداً. انتظر عدد الثواني في ترويسة Retry-After ثم "
        "أعد المحاولة.",
    ),
    "module_off": Text(
        "Documents are not switched on for this shop.", "المستندات غير مفعّلة لهذا المتجر.",
    ),
    "terms_not_accepted": Text(
        "Before connecting another system, the owner or an admin must read and accept the "
        "connected sales terms in the document settings.",
        "قبل ربط نظام آخر، على المالك أو المشرف قراءة شروط المبيعات المرتبطة وقبولها من "
        "إعدادات المستندات.",
    ),
    "key_name_needed": Text(
        "Give the key a name so the shop can tell its keys apart, up to 60 characters.",
        "أعطِ المفتاح اسماً يميّزه عن غيره، بحد أقصى 60 حرفاً.",
    ),
    "scope_unknown": Text(
        "A key's scopes are sales:write, documents:read and webhooks.",
        "صلاحيات المفتاح هي sales:write و documents:read و webhooks.",
    ),
    "too_many_keys": Text(
        "A shop can have 10 active keys. Revoke one that is no longer used.",
        "يمكن لكل متجر 10 مفاتيح فعّالة. ألغِ مفتاحاً لم يعد مستخدماً.",
    ),
    "key_not_found": Text("There is no such key.", "لا يوجد مفتاح بهذا الرقم."),
    "rate_limit_invalid": Text(
        "The rate limit is between 1 and 1,000 requests a minute.",
        "حد الطلبات بين 1 و1000 طلب في الدقيقة.",
    ),
    # ── A sale ───────────────────────────────────────────────────────────────────────────
    "idempotency_key_needed": Text(
        "Send an Idempotency-Key header (8 to 120 letters, digits, dashes, dots, colons or "
        "underscores). Use the same key to retry the same sale.",
        "أرسل ترويسة Idempotency-Key (من 8 إلى 120 حرفاً أو رقماً أو شرطة أو نقطة أو نقطتين "
        "أو شرطة سفلية). استخدم المفتاح نفسه لإعادة محاولة البيع نفسه.",
    ),
    "idempotency_key_reused": Text(
        "That Idempotency-Key was already used for a different sale. Use a new key for a new "
        "sale, or send the original body again.",
        "سبق استخدام مفتاح Idempotency-Key هذا لعملية بيع مختلفة. استخدم مفتاحاً جديداً لعملية "
        "بيع جديدة، أو أعد إرسال الطلب الأصلي نفسه.",
    ),
    "sale_exists": Text(
        "ALYR already has a different sale with this external_sale_id and kind. A sale is on "
        "paper once.",
        "لدى ALYR عملية بيع مختلفة بالمعرّف external_sale_id والنوع نفسيهما. تُسجَّل كل عملية "
        "بيع على الورق مرة واحدة.",
    ),
    "sale_not_found": Text(
        "ALYR has no such sale.", "لا توجد لدى ALYR عملية بيع بهذا المعرّف.",
    ),
    "kind_not_for_connect": Text(
        "A connected sale is a receipt, invoice, quote, proforma invoice, delivery note, credit "
        "note or deposit receipt.",
        "عملية البيع المرتبطة إيصال أو فاتورة أو عرض سعر أو فاتورة أولية أو إشعار تسليم أو "
        "إشعار دائن أو إيصال عربون.",
    ),
    "external_number_needed": Text(
        "Your shop's other system numbers this kind of document, so send its number in "
        "external_document_number.",
        "يتولى نظام متجرك الآخر ترقيم هذا النوع من المستندات، لذلك أرسل رقمه في "
        "external_document_number.",
    ),
    "external_number_invalid": Text(
        "A document number is up to 80 characters: letters, digits, spaces and . _ / # : -",
        "رقم المستند حتى 80 حرفاً: أحرف وأرقام ومسافات والرموز . _ / # : -",
    ),
    "number_taken": Text(
        "A document with this number already exists in this shop. Numbers are never reused.",
        "يوجد مستند بهذا الرقم في هذا المتجر. لا يُعاد استخدام الأرقام.",
    ),
    "phone_invalid": Text(
        "The customer's phone number must be in international format, for example "
        "+97455550123.",
        "يجب أن يكون رقم هاتف العميل بالصيغة الدولية، مثل +97455550123.",
    ),
    "totals_mismatch": Text(
        "The totals you sent do not match the lines. ALYR works the total out from the lines "
        "and accepts a difference of at most one minor unit per line.",
        "المجاميع المرسلة لا تطابق البنود. تحسب ALYR الإجمالي من البنود وتقبل فرقاً لا يزيد "
        "على وحدة صغرى واحدة لكل بند.",
    ),
    "receipt_needs_payment": Text(
        "A receipt is for money already paid in full: send payment with the full amount, or "
        "send an invoice for an unpaid sale.",
        "الإيصال عن مبلغ مدفوع بالكامل: أرسل دفعة بالمبلغ كاملاً، أو أرسل فاتورة لعملية بيع "
        "غير مدفوعة.",
    ),
    "payment_not_for_kind": Text(
        "This kind of document does not record a payment.",
        "لا يسجّل هذا النوع من المستندات دفعة.",
    ),
    "payment_too_big": Text(
        "The payment is more than the total.", "الدفعة أكثر من الإجمالي.",
    ),
    "rounding_invalid": Text(
        "totals.rounding_minor is between -1000 and 1000.",
        "totals.rounding_minor بين -1000 و1000.",
    ),
    "currency_not_supported": Text(
        "That currency is not supported here. Use QAR, SAR, AED, OMR, KWD, BHD or USD.",
        "هذه العملة غير مدعومة هنا. استخدم QAR أو SAR أو AED أو OMR أو KWD أو BHD أو USD.",
    ),
    "sold_at_invalid": Text(
        "sold_at must be a date and time that is not in the future and not older than two "
        "years.",
        "يجب أن يكون sold_at تاريخاً ووقتاً ليسا في المستقبل ولا أقدم من سنتين.",
    ),
    "credits_sale_needed": Text(
        "A credit note names the sale it credits in credits_sale_id and gives a reason.",
        "يذكر الإشعار الدائن عملية البيع التي يلغيها في credits_sale_id ويذكر السبب.",
    ),
    "credited_sale_unknown": Text(
        "ALYR has not received the sale this credit note refers to. Send the original sale "
        "first.",
        "لم تستلم ALYR عملية البيع التي يشير إليها هذا الإشعار الدائن. أرسل عملية البيع الأصلية "
        "أولاً.",
    ),
    "credited_sale_not_creditable": Text(
        "That sale cannot be credited: it is not an issued receipt, invoice or deposit receipt, "
        "or it was already cancelled.",
        "لا يمكن إلغاء عملية البيع هذه: ليست إيصالاً أو فاتورة أو إيصال عربون صادراً، أو أُلغيت "
        "من قبل.",
    ),
    "credit_not_in_this_currency": Text(
        "A credit note must be in the currency of the sale it credits.",
        "يجب أن يكون الإشعار الدائن بعملة عملية البيع التي يلغيها.",
    ),
    "customer_name_needed": Text(
        "This kind of document needs the customer's name or company.",
        "يحتاج هذا النوع من المستندات إلى اسم العميل أو شركته.",
    ),
    "branch_unknown": Text(
        "There is no such branch, or it is switched off.", "لا يوجد فرع بهذا الاسم، أو أنه موقوف.",
    ),
    "body_too_large": Text(
        "The request is larger than 512 KB.", "حجم الطلب أكبر من 512 كيلوبايت.",
    ),
    "document_not_found": Text("There is no such document.", "لا يوجد مستند بهذا الرقم."),
    # ── Webhooks ─────────────────────────────────────────────────────────────────────────
    "webhook_url_invalid": Text(
        "A webhook address is an https:// address with a domain name.",
        "عنوان الخطاف عنوان https:// يحتوي على اسم نطاق.",
    ),
    "webhook_url_blocked": Text(
        "That address points inside a private network, to this machine, or to a reserved "
        "address. ALYR only sends to public addresses.",
        "يشير هذا العنوان إلى شبكة خاصة أو إلى هذا الجهاز أو إلى عنوان محجوز. ترسل ALYR إلى "
        "العناوين العامة فقط.",
    ),
    "webhook_url_unresolved": Text(
        "ALYR could not find that address. Check the domain name.",
        "تعذّر على ALYR العثور على هذا العنوان. تحقق من اسم النطاق.",
    ),
    "webhook_events_invalid": Text(
        "Choose at least one of document.issued, document.delivered, document.failed, "
        "document.cancelled and payment.recorded.",
        "اختر واحداً على الأقل من document.issued و document.delivered و document.failed و "
        "document.cancelled و payment.recorded.",
    ),
    "webhook_not_found": Text("There is no such webhook.", "لا يوجد خطاف بهذا الرقم."),
    "too_many_webhooks": Text(
        "A shop can have 10 webhook addresses.", "يمكن لكل متجر 10 عناوين خطّافات.",
    ),
    # ── CSV import of sales ──────────────────────────────────────────────────────────────
    "import_not_found": Text("There is no such import.", "لا يوجد استيراد بهذا الرقم."),
    "import_not_preview": Text(
        "This import was already applied or undone.", "طُبّق هذا الاستيراد أو تُرك من قبل.",
    ),
    "import_changed": Text(
        "The preview you saw is not the one being applied. Upload the file again.",
        "المعاينة التي رأيتها ليست التي تُطبَّق. ارفع الملف مجدداً.",
    ),
    "import_has_errors": Text(
        "Some rows have problems. Fix the file and upload it again, or apply only after every "
        "row is correct.",
        "في بعض الصفوف مشكلات. أصلح الملف وارفعه مجدداً، ولا تطبّق قبل أن تصحّ كل الصفوف.",
    ),
    "import_empty": Text(
        "The file has no sales in it.", "لا توجد عمليات بيع في هذا الملف.",
    ),
    "import_too_big": Text(
        "A file can hold up to 200 sales and 2,000 rows. Split it into smaller files.",
        "يتسع الملف لـ 200 عملية بيع و2000 صف على الأكثر. قسّمه إلى ملفات أصغر.",
    ),
    "import_nothing_to_undo": Text(
        "There is no import to undo.", "لا يوجد استيراد للتراجع عنه.",
    ),
    "import_not_latest": Text(
        "Only the newest import can be undone.", "يمكن التراجع عن أحدث استيراد فقط.",
    ),
    "import_already_sent": Text(
        "This import cannot be undone: some of its documents were already sent to customers.",
        "لا يمكن التراجع عن هذا الاستيراد: أُرسل بعض مستنداته إلى العملاء بالفعل.",
    ),
    "import_not_undoable": Text(
        "This import cannot be undone: ALYR numbered some of its documents, or it cancelled "
        "other documents. Issued paper is never taken back; cancel any of it with a credit note.",
        "لا يمكن التراجع عن هذا الاستيراد: رقّمت ALYR بعض مستنداته، أو ألغى مستندات أخرى. "
        "لا يُسحب المستند الصادر أبداً؛ ألغِ ما تريد بإشعار دائن.",
    ),
    "template_name_invalid": Text(
        "Give the saved mapping a name of up to 60 characters.",
        "أعطِ ربط الأعمدة المحفوظ اسماً بحد أقصى 60 حرفاً.",
    ),
    "template_not_found": Text(
        "There is no such saved mapping.", "لا يوجد ربط أعمدة محفوظ بهذا الاسم.",
    ),
}
