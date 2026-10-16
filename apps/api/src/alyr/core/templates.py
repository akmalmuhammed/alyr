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


CATALOGUE: dict[str, Template] = {
    # Three tones, chosen by the age of the debt: gentle, then firm, then final.
    "payment_reminder": Template(
        "utility",
        "A friendly reminder from {{1}}: your account has {{2}} due, and the oldest unpaid "
        "purchase was {{3}} days ago. You can pay here: {{4}} . Thank you.",
        "تذكير ودي من {{1}}: على حسابك مبلغ {{2}}، وأقدم فاتورة غير مدفوعة مضى عليها {{3}} يوماً. "
        "يمكنك الدفع من هنا: {{4}} . شكراً لك.",
        ("Al Noor Electricals", "QAR 1,850", "41", "https://app.alyr.online/pay/a/b"),
    ),
    "payment_reminder_overdue": Template(
        "utility",
        "Reminder from {{1}}: {{2}} on your account is now overdue. The oldest unpaid "
        "purchase was {{3}} days ago. You can pay here: {{4}} . Thank you.",
        "تذكير من {{1}}: مبلغ {{2}} على حسابك متأخر السداد، وأقدم فاتورة غير مدفوعة مضى عليها "
        "{{3}} يوماً. يمكنك الدفع من هنا: {{4}} . شكراً لك.",
        ("Al Noor Electricals", "QAR 1,850", "72", "https://app.alyr.online/pay/a/b"),
    ),
    "payment_reminder_final": Template(
        "utility",
        "Final notice from {{1}}: {{2}} on your account has been overdue for more than 90 "
        "days, and the oldest unpaid purchase was {{3}} days ago. Please pay here or contact "
        "us today: {{4}} . Thank you.",
        "إشعار أخير من {{1}}: مبلغ {{2}} على حسابك متأخر منذ أكثر من 90 يوماً، وأقدم فاتورة غير "
        "مدفوعة مضى عليها {{3}} يوماً. نرجو السداد من هنا أو التواصل معنا اليوم: {{4}} . شكراً لك.",
        ("Al Noor Electricals", "QAR 2,500", "118", "https://app.alyr.online/pay/a/b"),
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
        ("1001", "1 x Breaker 16 A, 1 x Cable 1.5 mm", "QAR 179", "https://app.alyr.online/pay/a/b"),
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
    "booking_reminder": Template(
        "utility",
        "Reminder: booking {{1}} at {{2}} is at {{3}}. See you soon.",
        "تذكير بموعدك: الحجز رقم {{1}} لدى {{2}} موعده {{3}}. "
        "نرجو الحضور في الوقت المحدد، وبانتظارك.",
        ("101", "Al Noor Electricals", "Tue 13 Oct, 8:30 AM"),
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


def notice(to: UUID, name: str, lang: str, body: str, *params: object) -> OutboundMessage:
    """A notice to a customer who may have last written more than 24 hours ago.

    `body` is the module's own wording, used while the window is open. `params` fill
    the template's blanks, used when it is closed."""
    template = CATALOGUE[name]
    if len(params) != len(template.samples):
        raise ValueError(f"{name} takes {len(template.samples)} values, got {len(params)}")
    return OutboundMessage(
        to=to, kind="template", body=body, template_name=name,
        template_category=template.category,  # type: ignore[arg-type]
        template_params=tuple(clean(value) for value in params),
        lang="ar" if lang == "ar" else "en",
    )
