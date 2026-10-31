"""The message templates ALYR sends when a customer's 24-hour window is closed.

Inside the window a module's own wording goes out as an ordinary message. Outside it
Meta only delivers a template whose wording it has approved in advance, with numbered
blanks filled in at send time. This file is that fixed wording, in English and Arabic.

Meta's rules the wording follows: a blank cannot be the first or last thing in the text,
a value cannot contain a line break, each name must exist in every language we send,
and the text must be long enough for its blanks (Meta refuses about three blanks in
fewer than ten other words).

`python -m alyr.templates_sync` creates any of these that Meta does not have yet.
The Arabic has not been reviewed by a native speaker (ALY-66).
"""

from dataclasses import dataclass
from uuid import UUID

from alyr.channels.base import OutboundMessage


@dataclass(frozen=True)
class Template:
    category: str
    en: str
    ar: str
    # What each blank holds, in order. Used as the sample values Meta asks for at review.
    samples: tuple[str, ...]
    # "image" when the template opens with an image header, filled at send time with an
    # image uploaded through the Media API; "document" when it opens with a PDF (a receipt),
    # uploaded the same way. Meta asks for a sample image or document at review:
    # `header_sample` names it, relative to this repository's root, `{lang}` for en or ar. For a
    # document header only its file name matters: the sample is drawn by the documents engine
    # (`alyr.document_samples`), not kept in the repository.
    header: str = ""
    header_sample: str = ""
    # Sample values in Arabic for the Arabic template, when they differ.
    samples_ar: tuple[str, ...] = ()
    # A marketing template the customer asked for on narrower terms than marketing in general
    # names its consent purpose here (`core/consent.py`). The outbound layer then sends it
    # to customers who hold that consent, and not to those who only agreed to marketing.
    consent: str = ""
    # Written but not yet submitted to Meta, and not to be until the founder says so: the reason
    # in one line. The back office shows such a template as a draft held back and will not submit
    # it (`core/whatsapp_templates.py`); `templates_sync --create` still would, so it is not run
    # for these. Taking the hold off is the founder's go, written as deleting `held=HELD`.
    held: str = ""


HELD = "written, not submitted: waiting for the founder's go"


CATALOGUE: dict[str, Template] = {
    # Three tones, chosen by the age of the debt: gentle, then firm, then final.
    "payment_reminder": Template(
        "utility",
        "A friendly reminder from {{1}}: your account has {{2}} due, and the oldest unpaid "
        "purchase was {{3}} days ago. You can pay here: {{4}} . Thank you.",
        "تذكير ودي من {{1}}: على حسابك مبلغ {{2}}، وأقدم فاتورة غير مدفوعة مضى عليها {{3}} يوماً. "
        "يمكنك الدفع من هنا: {{4}} . شكراً لك.",
        ("Al Noor Electricals", "QAR 1,850", "41", "https://app.alyr.online/pay/al-noor?t=Ab3dE.f9Gh"),
    ),
    "payment_reminder_overdue": Template(
        "utility",
        "Reminder from {{1}}: {{2}} on your account is now overdue. The oldest unpaid "
        "purchase was {{3}} days ago. You can pay here: {{4}} . Thank you.",
        "تذكير من {{1}}: مبلغ {{2}} على حسابك متأخر السداد، وأقدم فاتورة غير مدفوعة مضى عليها "
        "{{3}} يوماً. يمكنك الدفع من هنا: {{4}} . شكراً لك.",
        ("Al Noor Electricals", "QAR 1,850", "72", "https://app.alyr.online/pay/al-noor?t=Ab3dE.f9Gh"),
    ),
    "payment_reminder_final": Template(
        "utility",
        "Final notice from {{1}}: {{2}} on your account has been overdue for more than 90 "
        "days, and the oldest unpaid purchase was {{3}} days ago. Please pay here or contact "
        "us today: {{4}} . Thank you.",
        "إشعار أخير من {{1}}: مبلغ {{2}} على حسابك متأخر منذ أكثر من 90 يوماً، وأقدم فاتورة غير "
        "مدفوعة مضى عليها {{3}} يوماً. نرجو السداد من هنا أو التواصل معنا اليوم: {{4}} . شكراً لك.",
        ("Al Noor Electricals", "QAR 2,500", "118", "https://app.alyr.online/pay/al-noor?t=Ab3dE.f9Gh"),
    ),
    # The same three for a shop that takes no money online yet (ALY-271): no link, and the
    # last blank says how the shop is paid ("You can pay us by cash or bank transfer, ...").
    "payment_reminder_offline": Template(
        "utility",
        "A friendly reminder from {{1}}: your account has {{2}} due, and the oldest unpaid "
        "purchase was {{3}} days ago. {{4}} Thank you.",
        "تذكير ودي من {{1}}: على حسابك مبلغ {{2}}، وأقدم فاتورة غير مدفوعة مضى عليها {{3}} يوماً. "
        "{{4}} شكراً لك.",
        ("Al Noor Electricals", "QAR 1,850", "41",
         "You can pay us by cash or bank transfer, and we will record it on your account."),
        samples_ar=("النور للكهربائيات", "QAR 1,850", "41",
                    "يمكنك الدفع لنا نقداً أو تحويل بنكي، وسنسجّل الدفعة في حسابك."),
    ),
    "payment_reminder_overdue_offline": Template(
        "utility",
        "Reminder from {{1}}: {{2}} on your account is now overdue. The oldest unpaid "
        "purchase was {{3}} days ago. {{4}} Thank you.",
        "تذكير من {{1}}: مبلغ {{2}} على حسابك متأخر السداد، وأقدم فاتورة غير مدفوعة مضى عليها "
        "{{3}} يوماً. {{4}} شكراً لك.",
        ("Al Noor Electricals", "QAR 1,850", "72",
         "You can pay us by cash or bank transfer, and we will record it on your account."),
        samples_ar=("النور للكهربائيات", "QAR 1,850", "72",
                    "يمكنك الدفع لنا نقداً أو تحويل بنكي، وسنسجّل الدفعة في حسابك."),
    ),
    "payment_reminder_final_offline": Template(
        "utility",
        "Final notice from {{1}}: {{2}} on your account has been overdue for more than 90 "
        "days, and the oldest unpaid purchase was {{3}} days ago. Please pay or contact us "
        "today. {{4}} Thank you.",
        "إشعار أخير من {{1}}: مبلغ {{2}} على حسابك متأخر منذ أكثر من 90 يوماً، وأقدم فاتورة غير "
        "مدفوعة مضى عليها {{3}} يوماً. نرجو السداد أو التواصل معنا اليوم. {{4}} شكراً لك.",
        ("Al Noor Electricals", "QAR 2,500", "118",
         "You can pay us by cash or bank transfer, and we will record it on your account."),
        samples_ar=("النور للكهربائيات", "QAR 2,500", "118",
                    "يمكنك الدفع لنا نقداً أو تحويل بنكي، وسنسجّل الدفعة في حسابك."),
    ),
    "entry_recorded": Template(
        "utility",
        "Update from {{1}}: we recorded {{2}} of {{3}} on your account. "
        "Your balance is now {{4}}. Thank you.",
        "تحديث من {{1}}: سجّلنا {{2}} بمبلغ {{3}} على حسابك. رصيدك الآن {{4}}. شكراً لك.",
        ("Al Noor Electricals", "a credit purchase", "QAR 450", "QAR 2,300"),
    ),
    "payment_received_order": Template(
        "utility",
        "We received {{1}} for order {{2}}. Thank you.",
        "استلمنا {{1}} عن الطلب رقم {{2}}. شكراً لك.",
        ("QAR 179", "1001"),
    ),
    "payment_received_account": Template(
        "utility",
        "We received your payment of {{1}}. Your balance is now {{2}}. Thank you.",
        "استلمنا دفعتك بمبلغ {{1}}. رصيدك الآن {{2}}. شكراً لك.",
        ("QAR 500", "QAR 1,350"),
    ),
    "order_received_pay": Template(
        "utility",
        "Order {{1}} received: {{2}}. The total is {{3}}. You can pay here: {{4}} . Thank you.",
        "تم استلام الطلب رقم {{1}}: {{2}}. الإجمالي {{3}}. يمكنك الدفع من هنا: {{4}} . شكراً لك.",
        ("1001", "1 x Breaker 16 A, 1 x Cable 1.5 mm", "QAR 179", "https://app.alyr.online/pay/al-noor?t=Ab3dE.f9Gh"),
    ),
    "order_received_later": Template(
        "utility",
        "Order {{1}} received: {{2}}. The total is {{3}}. {{4}} Thank you.",
        "تم استلام الطلب رقم {{1}}: {{2}}. الإجمالي {{3}}. {{4}} شكراً لك.",
        ("1001", "1 x Honey cake, 2 x Date maamoul", "QAR 179", "Pay by cash or bank transfer "
         "when you collect."),
    ),
    "order_received_account": Template(
        "utility",
        "Order {{1}} received: {{2}}. The total of {{3}} is on your account, "
        "and your balance is now {{4}}. Thank you.",
        "تم استلام الطلب رقم {{1}}: {{2}}. تم تسجيل الإجمالي {{3}} على حسابك، "
        "ورصيدك الآن {{4}}. شكراً لك.",
        ("1001", "1 x Breaker 16 A, 1 x Cable 1.5 mm", "QAR 179", "QAR 2,029"),
    ),
    "order_confirmed": Template(
        "utility",
        "Your order {{1}} is confirmed. We will message you when it is ready.",
        "تم تأكيد طلبك رقم {{1}}. سنراسلك عندما يصبح جاهزاً.",
        ("1001",),
    ),
    "order_ready": Template(
        "utility",
        "Your order {{1}} is ready for collection. See you soon.",
        "طلبك رقم {{1}} جاهز للاستلام. بانتظارك.",
        ("1001",),
    ),
    # The same moment for an order the shop delivers: nobody comes to collect it.
    "order_ready_delivery": Template(
        "utility",
        "Your order {{1}} is ready for delivery. Thank you.",
        "طلبك رقم {{1}} جاهز للتوصيل. شكراً لك.",
        ("1001",),
    ),
    "order_done": Template(
        "utility",
        "Your order {{1}} is complete. Thank you.",
        "تم إنجاز طلبك رقم {{1}}. شكراً لك.",
        ("1001",),
    ),
    "order_cancelled": Template(
        "utility",
        "Your order {{1}} has been cancelled. Message us if this is not what you expected.",
        "تم إلغاء طلبك رقم {{1}}. راسلنا إن لم يكن هذا ما توقعته.",
        ("1001",),
    ),
    "booking_confirmed": Template(
        "utility",
        "Booking {{1}} is confirmed at {{2}}: {{3}}, {{4}}. To cancel, send us a message.",
        "تم تأكيد حجزك رقم {{1}} لدى {{2}}. الخدمة المحجوزة هي {{3}} والموعد هو {{4}}. "
        "إذا أردت إلغاء الحجز راسلنا هنا في أي وقت.",
        ("101", "Al Noor Electricals", "Lighting consultation", "Tue 13 Oct, 8:30 AM"),
    ),
    "booking_cancelled": Template(
        "utility",
        "Booking {{1}} on {{2}} has been cancelled. Send us a message to book again.",
        "تم إلغاء الحجز رقم {{1}} بتاريخ {{2}}. راسلنا لحجز موعد جديد.",
        ("101", "Tue 13 Oct, 8:30 AM"),
    ),
    "booking_moved": Template(
        "utility",
        "Booking {{1}} has been moved to {{2}}. See you then.",
        "تم تغيير موعد الحجز رقم {{1}} إلى {{2}}. بانتظارك.",
        ("101", "Wed 14 Oct, 4:00 PM"),
    ),
    # Deposits and the review request (ALY-27, D-084, spec 033). Written, NOT submitted to
    # Meta: that is the founder's go, and `templates_sync --create` is not to be run for these
    # until he says so. The person or chair a booking is with rides inside the blank that
    # holds the service or the time, so the approved booking templates above do not change.
    # The Arabic is a draft until ALY-66.
    "booking_deposit_due": Template(
        "utility",
        "Booking {{1}} at {{2}}: {{3}}. Please pay the deposit of {{4}} within {{5}} minutes "
        "to keep this time: {{6}} . The shop's rule for the deposit is on the payment page.",
        "حجزك رقم {{1}} لدى {{2}}: {{3}}. نرجو دفع العربون {{4}} خلال {{5}} دقيقة للاحتفاظ "
        "بهذا الموعد: {{6}} . سياسة المحل للعربون موضحة في صفحة الدفع.",
        ("105", "Dafira Salon", "Hair colour with Reem, Thu 30 Oct, 5:00 PM", "QAR 50", "30",
         "https://app.alyr.online/pay/dafira?t=Ab3dE.f9Gh"),
        samples_ar=("105", "صالون ضفيرة", "صبغة شعر مع ريم، 30/10 17:00", "50 ر.ق", "30",
                    "https://app.alyr.online/pay/dafira?t=Ab3dE.f9Gh"),
        held=HELD,
    ),
    "booking_deposit_paid": Template(
        "utility",
        "We received the deposit of {{1}} for booking {{2}}. Your visit is confirmed: {{3}}. "
        "See you then.",
        "استلمنا العربون {{1}} للحجز رقم {{2}}. تم تأكيد موعدك: {{3}}. بانتظارك.",
        ("QAR 50", "105", "Hair colour with Reem, Thu 30 Oct, 5:00 PM"),
        samples_ar=("50 ر.ق", "105", "صبغة شعر مع ريم، 30/10 17:00"),
        held=HELD,
    ),
    "booking_released": Template(
        "utility",
        "Booking {{1}} ({{2}}) was released because the deposit was not paid in time. "
        "Nothing was charged. Send us a message to book again.",
        "أُلغي الحجز رقم {{1}} ({{2}}) لأن العربون لم يُدفع في الوقت المحدد. لم يُخصم أي مبلغ. "
        "راسلنا لحجز موعد جديد.",
        ("105", "Thu 30 Oct, 5:00 PM"),
        samples_ar=("105", "30/10 17:00"),
        held=HELD,
    ),
    "booking_cancelled_deposit": Template(
        "utility",
        "Booking {{1}} ({{2}}) has been cancelled. {{3}} Send us a message to book again.",
        "تم إلغاء الحجز رقم {{1}} ({{2}}). {{3}} راسلنا لحجز موعد جديد.",
        ("105", "Thu 30 Oct, 5:00 PM", "The shop will refund your deposit of QAR 50."),
        samples_ar=("105", "30/10 17:00", "سيرد المحل إليك العربون 50 ر.ق."),
        held=HELD,
    ),
    # Asked after one named visit or order, with no offer in it: Meta's guidelines (checked 29
    # Oct 2026) approve a feedback request as utility only when it names the order or
    # interaction and has nothing promotional. Every customer gets the same words: there is
    # no "were you happy?" first (no review gating, D-084).
    "review_request": Template(
        "utility",
        "Thank you for {{1}} at {{2}}. If you have a minute, you can leave a review here: "
        "{{3}} . You can also reply to this message.",
        "شكراً لك على {{1}} لدى {{2}}. إن كان لديك دقيقة، يمكنك كتابة تقييم من هنا: {{3}} . "
        "ويمكنك أيضاً الرد على هذه الرسالة.",
        ("your visit on Thu 30 Oct", "Dafira Salon", "https://g.page/r/example/review"),
        samples_ar=("زيارتك يوم 30/10", "صالون ضفيرة", "https://g.page/r/example/review"),
        held=HELD,
    ),
    # The owner's weekly result report (D-030). Inside the window the whole report goes
    # as a plain message; outside it, this one line, and REPORT brings the rest.
    "weekly_report": Template(
        "utility",
        "Your ALYR weekly report for {{1}}, {{2}}: {{3}}. "
        "Send REPORT to read the whole report here.",
        "تقريرك الأسبوعي من ALYR لـ {{1}}، {{2}}: {{3}}. أرسل «تقرير» لقراءة التقرير كاملاً هنا.",
        (
            "Al Noor Electricals", "11 to 17 Oct",
            "QAR 4,300 collected; 38 orders worth QAR 5,640; 41 visits, 3 no-shows",
        ),
    ),
    # The report card (ALY-99): the same report as a branded image with a short text.
    # Sent outside the window once Meta has approved it and ALYR_REPORT_CARD_TEMPLATE is
    # on; until then "weekly_report" above is the fallback. Inside the window the card goes
    # as an ordinary image with the text under it, so no approval is needed there.
    "weekly_report_card": Template(
        "utility",
        "Your ALYR weekly report for {{1}}, {{2}}. {{3}} By product: {{4}}. "
        "Next step: {{5}}. The card above shows each day beside the same day the week before. "
        "Send REPORT to get this report again.",
        "تقريرك الأسبوعي من ALYR لـ {{1}}، {{2}}. {{3}} حسب المنتج: {{4}}. "
        "الخطوة التالية: {{5}}. البطاقة أعلاه تعرض كل يوم بجانب اليوم نفسه من الأسبوع الذي قبله. "
        "أرسل «تقرير» لتصلك هذه الرسالة مرة أخرى.",
        # The fictional Qirfa Bakery's report for 4 to 10 October (`alyr.report_samples`).
        (
            "Qirfa Bakery", "4–10 Oct",
            "Last week: 68 orders, QAR 12,005. Orders up 1%, sales up 1% on the week before.",
            "ALYR Chat: 68 orders, QAR 12,005 · ALYR Bookings: 3 visits, 0 no-shows · "
            "ALYR Accounts: QAR 13,894 owed by 6 customers",
            "Send reminders: QAR 3,501 owed 30+ days, not reminded in 7 days (rule · owed "
            "30+ days, no promise, no reminder in 7 days · 2 customers)",
        ),
        header="image",
        header_sample="apps/web/app/_agent/samples/report/bakery.{lang}.png",
        samples_ar=(
            "مخبز قرفة", "4–10 أكتوبر",
            "الأسبوع الماضي: 68 طلباً، 12,005 ر.ق. الطلبات أكثر بـ1%، والمبيعات أكثر بـ1% "
            "عن الأسبوع الذي قبله.",
            "ALYR Chat: 68 طلباً، 12,005 ر.ق · ALYR Bookings: 3 زيارات، والغياب 0 · "
            "ALYR Accounts: 13,894 ر.ق مستحقة، و6 عملاء لم يسددوا بعد",
            "أرسل التذكيرات: 3,501 ر.ق مستحقة منذ 30 يوماً أو أكثر، دون تذكير منذ 7 أيام "
            "(القاعدة · مستحق منذ 30 يوماً أو أكثر، دون وعد ودون تذكير خلال 7 أيام · عميلان)",
        ),
    ),
    "booking_reminder": Template(
        "utility",
        "Reminder: booking {{1}} at {{2}} is at {{3}}. See you soon.",
        "تذكير بموعدك: الحجز رقم {{1}} لدى {{2}} موعده {{3}}. "
        "نرجو الحضور في الوقت المحدد، وبانتظارك.",
        ("101", "Al Noor Electricals", "Tue 13 Oct, 8:30 AM"),
    ),
    # The Catalog on WhatsApp (ALY-106). Four tell the shop's own managers something about
    # their stock or money (utility: an account alert for the account holder); one tells a
    # customer an item they asked about is back. That one is MARKETING, see below.
    "stock_low": Template(
        "utility",
        "Low stock at {{1}}: {{2}} has only {{3}} left. You can update the count in the "
        "Catalog or by message.",
        "تنبيه مخزون في {{1}}: الصنف {{2}} على وشك النفاد، والمتبقي {{3}} فقط. "
        "يمكنك تحديث الكمية من الكتالوج أو برسالة.",
        ("Al Noor Electricals", "Cable 2.5 mm", "3"),
    ),
    "stock_sold_out": Template(
        "utility",
        "Sold out at {{1}}: {{2}} has just run out, so customers cannot order it until "
        "you add stock.",
        "نفد من {{1}} الصنف {{2}} الآن، ولا يستطيع العملاء طلبه حتى تضيف كمية جديدة.",
        ("Al Noor Electricals", "Cable 2.5 mm"),
    ),
    # The owner is told a refund is theirs to make: ALYR never holds the shop's money.
    "refund_due": Template(
        "utility",
        "Refund due at {{1}}: order {{2}} for {{3}} was cancelled after the customer paid. "
        "Please refund it from your own payment account, as ALYR never holds your money.",
        "استرداد مستحق في {{1}}: تم إلغاء الطلب رقم {{2}} بمبلغ {{3}} بعد أن دفع العميل. "
        "يرجى رد المبلغ من حسابك للدفع، فـ ALYR لا تحتفظ بأموالك.",
        ("Al Noor Electricals", "1001", "QAR 179"),
    ),
    "refund_due_late": Template(
        "utility",
        "Refund due at {{1}}: a payment of {{2}} reached order {{3}} after its payment link "
        "expired and the order was cancelled. Please refund it from your own payment account.",
        "استرداد مستحق في {{1}}: وصلت دفعة بمبلغ {{2}} للطلب رقم {{3}} بعد انتهاء رابط الدفع "
        "وإلغاء الطلب. يرجى ردها من حسابك للدفع.",
        ("Al Noor Electricals", "QAR 179", "1001"),
    ),
    # A new order, to the staff numbers the owner marked for it (D-079). {{4}} is what the
    # order holds and how it goes: "2 x Croissant, 1 x Latte. Pickup · Not paid yet".
    "order_new_staff": Template(
        "utility",
        "New order at {{1}}: order {{2}} for {{3}}. {{4}}. Open ALYR to confirm it.",
        "طلب جديد في {{1}}: الطلب رقم {{2}} بمبلغ {{3}}. {{4}}. افتح ALYR لتأكيده.",
        ("Al Noor Electricals", "1001", "QAR 179",
         "2 x Breaker 16 A, 1 x Cable 1.5 mm. Pickup · Not paid yet"),
        samples_ar=("النور للكهربائيات", "1001", "179 ر.ق",
                    "2 x قاطع 16 أمبير، 1 x كابل 1.5 مم. استلام من المتجر · لم يُدفع بعد"),
    ),
    "draft_added": Template(
        "utility",
        "New item draft at {{1}}: {{2}} sent a photo for {{3}}. Open the Catalog to check "
        "it and put it on sale.",
        "مسودة صنف جديد في {{1}}: أرسل {{2}} صورة لـ{{3}}. افتح الكتالوج لمراجعتها وطرحها للبيع.",
        ("Al Noor Electricals", "Yusuf", "Mixed grill"),
    ),
    # "Tell me when it is back". Meta's template guidelines (checked 18 Oct 2026) say utility
    # templates must be non-promotional, and list "a saved search found a match" among the
    # retargeting examples that are "marketing even if requested by users". An item back in
    # stock is the nearest thing, so it is filed as marketing, outside the 24-hour window only
    # (inside it is an ordinary message and needs no template, watches.py). It goes only to a
    # customer who asked to be told and agreed to that one message: the narrow consent
    # `back_in_stock`, never general marketing consent (core/consent.py).
    "back_in_stock": Template(
        "marketing",
        "Good news from {{1}}: {{2}} is back in stock, as you asked. You can order here: "
        "{{3}} . Send STOP to stop these updates.",
        "أخبار سارة من {{1}}: عاد «{{2}}» إلى المخزون كما طلبت. يمكنك الطلب من هنا: {{3}} . "
        "أرسل «إيقاف» لإيقاف هذه الرسائل.",
        ("Al Noor Electricals", "Cable 2.5 mm", "https://app.alyr.online/s/al-noor?t=a"),
        consent="back_in_stock",
    ),
    # Documents (ALY-139, D-042). The receipt, invoice or credit note itself is the header, as
    # a PDF; the words only say what it is and who it is from, so they read complete without
    # the file and stay non-promotional (a document about something the customer bought or
    # owes is utility). Inside the 24-hour window the same PDF goes as an ordinary document
    # message with a caption (`modules/documents/delivery.py`), which needs no template.
    # Written, NOT submitted to Meta: that is the founder's go, and `templates_sync --create`
    # is not to be run for these until he says so. `document_receipt` also carries a deposit
    # receipt. The Arabic is a draft until ALY-66.
    "document_receipt": Template(
        "utility",
        "Your receipt {{1}} from {{2}} for {{3}} is attached as a PDF. "
        "You can also open it online: {{4}} . Thank you.",
        "إيصالك رقم {{1}} من {{2}} بمبلغ {{3}} مرفق بصيغة PDF. "
        "يمكنك أيضاً فتحه عبر الإنترنت: {{4}} . شكراً لك.",
        ("RC-0042", "Qirfa Bakery", "QAR 127.00", "https://app.alyr.online/d/qirfa?t=a"),
        header="document",
        header_sample="documents/receipt.{lang}.pdf",
        samples_ar=("RC-0042", "مخبز قرفة", "127.00 ر.ق", "https://app.alyr.online/d/qirfa?t=a"),
        held=HELD,
    ),
    "document_invoice": Template(
        "utility",
        "Your invoice {{1}} from {{2}} for {{3}} is attached as a PDF. "
        "You can also open it online: {{4}} . Thank you.",
        "فاتورتك رقم {{1}} من {{2}} بمبلغ {{3}} مرفقة بصيغة PDF. "
        "يمكنك أيضاً فتحها عبر الإنترنت: {{4}} . شكراً لك.",
        ("INV-0017", "Qirfa Bakery", "QAR 540.00", "https://app.alyr.online/d/qirfa?t=a"),
        header="document",
        header_sample="documents/invoice.{lang}.pdf",
        samples_ar=("INV-0017", "مخبز قرفة", "540.00 ر.ق", "https://app.alyr.online/d/qirfa?t=a"),
        held=HELD,
    ),
    # Not in the brief's two: a refund or a cancelled sale sends a credit note, and "your
    # receipt" would be the wrong word for it outside the window.
    "document_credit_note": Template(
        "utility",
        "Credit note {{1}} from {{2}} for {{3}} is attached as a PDF. It cancels a document "
        "we issued before. You can also open it online: {{4}} . Thank you.",
        "إشعار دائن رقم {{1}} من {{2}} بمبلغ {{3}} مرفق بصيغة PDF، وهو يلغي مستنداً أصدرناه "
        "سابقاً. يمكنك أيضاً فتحه عبر الإنترنت: {{4}} . شكراً لك.",
        ("CN-0003", "Qirfa Bakery", "QAR 127.00", "https://app.alyr.online/d/qirfa?t=a"),
        header="document",
        header_sample="documents/credit_note.{lang}.pdf",
        samples_ar=("CN-0003", "مخبز قرفة", "127.00 ر.ق", "https://app.alyr.online/d/qirfa?t=a"),
        held=HELD,
    ),
}


def clean(value: object) -> str:
    """Make a value safe for a template blank: one line, no runs of spaces."""
    return " ".join(str(value).split())


def render(name: str, lang: str, params: list[str] | tuple[str, ...]) -> str | None:
    """The exact text the customer receives for this template, or None if the name is
    not in the catalogue."""
    template = CATALOGUE.get(name)
    if template is None:
        return None
    text = template.ar if lang == "ar" else template.en
    for index, value in enumerate(params, start=1):
        text = text.replace("{{" + str(index) + "}}", clean(value))
    return text


def notice(
    to: UUID, name: str, lang: str, body: str, *params: object, image: bytes = b"",
    document: bytes = b"", filename: str = "", document_id: UUID | None = None,
) -> OutboundMessage:
    """A notice to a customer who may have last written more than 24 hours ago.

    `body` is the module's own wording, used while the window is open. `params` fill
    the template's blanks, used when it is closed. With an `image`, the notice inside the
    window is that image with `body` under it; outside it, the image fills the
    template's image header, and is left out if the template has none. A `document` (a PDF
    with its `filename`) goes the same way: a document message with `body` as its caption
    inside the window, the template's document header outside it. `document_id` names the
    issued document the PDF is, so it is not stored a second time."""
    template = CATALOGUE[name]
    if len(params) != len(template.samples):
        raise ValueError(f"{name} takes {len(template.samples)} values, got {len(params)}")
    return OutboundMessage(
        to=to, kind="template", body=body, template_name=name,
        template_category=template.category,  # type: ignore[arg-type]
        template_params=tuple(clean(value) for value in params),
        lang="ar" if lang == "ar" else "en", image=image, document=document, filename=filename,
        document_id=document_id,
    )
