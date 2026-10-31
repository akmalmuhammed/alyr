"""The conversations people had with the shop that were not just an order: questions about
prices and hours, "is it ready", a change to an order, a complaint that was put right, a
catering enquiry that became a job, a photo of a cake to copy, a voice note, a customer who
asked to stop (spec 063).

Each conversation is written once, in both languages, and played in the language the customer
writes. Four of them are waiting for an answer right now, so the ALYR Agent's "Needs you now"
list has real items and the home screen has something to say. One customer asked us to stop
messaging them: the shop said it would, and the inbox shows the opt-out.

The order messages (the link, "received", "ready") are written by the story already; these sit
beside them, on their own days.
"""

from dataclasses import dataclass
from datetime import timedelta

from alyr.core import consent
from alyr.demo import tiles
from alyr.seed_into_business.context import Run

# The "photo" a customer sent: a small drawn card of a cake, made here and nowhere else.
_PHOTO = tiles.tile("customer-photo:unicorn-cake", "cake", 320)


@dataclass(frozen=True)
class Turn:
    who: str  # "c" the customer, or a team key: faisal, noura, rashid, dina
    en: str
    ar: str
    kind: str = "text"  # text | image | audio
    gap: int = 3  # minutes after the turn before


@dataclass(frozen=True)
class Chat:
    customer: str
    ago: int  # minutes before now that the conversation began
    state: str  # waiting | answered | closed
    turns: tuple
    assigned: str | None = None
    outcome: str = ""  # sold | booked | answered | lost
    reason: str = ""
    note: str = ""
    stop: bool = False


C = "c"
H = 60
D = 24 * 60

CHATS = (
    # ── waiting for an answer right now ───────────────────────────────────────────────────
    Chat("Lina F.", 12, "waiting", (
        Turn(C, "Hi! How much is the 2 kg chocolate celebration cake? Can I collect it on Friday?",
             "السلام عليكم، كم سعر كيكة الشوكولاتة 2 كغ؟ وهل أقدر أستلمها يوم الجمعة؟"),)),
    Chat("هند ر.", 35, "waiting", (
        Turn(C, "Hello, is my order ready?", "السلام عليكم، طلبي جاهز؟"),), assigned="faisal"),
    Chat("Tariq Z.", 100, "waiting", (
        Turn(C, "Hello, we need breakfast for about 40 people next Thursday at our office in "
                "West Bay. Could you send a quote?",
             "السلام عليكم، نحتاج فطور لحوالي 40 شخصاً يوم الخميس القادم في مكتبنا بالخليج "
             "الغربي. ممكن ترسلون عرض سعر؟"),), assigned="dina"),
    Chat("Priya N.", 180, "waiting", (
        Turn(C, "Could I move my pickup to 6 pm today instead of 4?",
             "ممكن أغيّر وقت الاستلام اليوم إلى 6 مساءً بدل 4؟"),), assigned="rashid"),
    # ── answered, still open ──────────────────────────────────────────────────────────────
    Chat("Rania H.", 5 * H, "answered", (
        Turn(C, "Do the almond croissants have nuts? My son is allergic to peanuts.",
             "هل كرواسون اللوز فيه مكسرات؟ ابني عنده حساسية من الفول السوداني."),
        Turn("noura", "Almond croissants contain almonds but no peanuts. We bake in the same "
                      "kitchen as products with peanuts, so I would not call it safe for a "
                      "severe allergy. The plain butter croissant is the safest choice.",
             "كرواسون اللوز فيه لوز وليس فيه فول سوداني، لكننا نخبز في المطبخ نفسه مع منتجات "
             "فيها فول سوداني، فلا أنصح به لحساسية شديدة. كرواسون الزبدة هو الأسلم.", gap=6),
        Turn(C, "Thank you for being honest, I will take the butter ones.",
             "شكراً على صراحتك، سآخذ كرواسون الزبدة.", gap=5)), assigned="noura",
         outcome="answered"),
    Chat("Omar K.", 3 * H, "answered", (
        Turn(C, "Please add 6 croissants to my order", "ضيفوا 6 كرواسون على طلبي لو سمحتوا"),
        Turn("faisal", "Done, added. It comes to QAR 42 more. See you at pickup!",
             "تمت الإضافة، المبلغ 42 ريالاً. بانتظارك عند الاستلام!", gap=2),
        Turn(C, "Perfect, thank you", "تمام، شكراً")), assigned="faisal"),
    Chat("خالد ف.", 14 * H, "answered", (
        Turn(C, "Can the order arrive before 8 am tomorrow? Delivery to Al Sadd.",
             "هل يمكن أن يصل الطلب قبل الساعة 8 صباحاً غداً؟ التوصيل إلى السد.", kind="text"),
        Turn("rashid", "Yes, we start delivering at 7:30. I have put your order first.",
             "نعم، نبدأ التوصيل 7:30. وضعت طلبك أولاً.", gap=420)), assigned="rashid"),
    Chat("جواهر ك.", 1 * D, "answered", (
        Turn(C, "Voice message 0:14", "رسالة صوتية 0:14", kind="audio"),
        Turn("faisal", "Got your voice note. Is it for delivery to the Pearl? Please send the "
                       "tower name and I will arrange it.",
             "وصلتنا رسالتك الصوتية. هل الطلب توصيل إلى اللؤلؤة؟ أرسلي اسم البرج وأرتّب لك.",
             gap=9),
        Turn(C, "Yes, Tower 14, Porto Arabia. Thank you!",
             "أيوه، برج 14، بورتو أرابيا. شكراً!", gap=4)), assigned="faisal"),
    # ── closed, with how it ended ─────────────────────────────────────────────────────────
    Chat("Sara M.", 2 * D, "closed", (
        Turn(C, "Hi, the writing on my daughter's cake was spelled wrong. It said Hapy Birthday.",
             "السلام عليكم، الكتابة على كيكة ابنتي فيها خطأ إملائي."),
        Turn("rashid", "I am so sorry, Sara. That should never have left the kitchen. I can "
                       "make a new cake today and deliver it to you free, and I have refunded "
                       "the writing. Does 5 pm work?",
             "نعتذر منك جداً. ما كان يجب أن تخرج هكذا. سنعمل كيكة جديدة اليوم ونوصّلها لك "
             "مجاناً. هل الساعة 5 مناسبة؟", gap=12),
        Turn(C, "Thank you, that is very kind. 5 pm is perfect.",
             "شكراً، هذا لطف منكم. الساعة 5 مناسبة.", gap=8),
        Turn("rashid", "It is on its way to the kitchen. Thank you for telling us.",
             "بدأنا بتجهيزها. شكراً لإخبارنا.", gap=3)), assigned="rashid",
         outcome="answered",
         note="Wrong spelling on the cake. New cake delivered free, writing refunded. "
              "Noura to double-check inscriptions before boxing."),
    Chat("Pearl Dental Clinic", 4 * D, "closed", (
        Turn(C, "Please add lunch boxes for Thursday, 24 of them, same as last time.",
             "ضيفوا وجبات غداء ليوم الخميس، 24 وجبة، مثل المرة السابقة."),
        Turn("dina", "Confirmed, 24 corporate lunch boxes for Thursday at 12:30. The invoice "
                     "follows on your account.",
             "تم تأكيد 24 وجبة غداء للشركات يوم الخميس 12:30. والفاتورة على حسابكم.", gap=7),
        Turn(C, "Great, thank you Dina.", "ممتاز، شكراً دينا.", gap=3)), assigned="dina",
         outcome="sold"),
    Chat("Maya T.", 3 * D, "closed", (
        Turn(C, "Can you make something like this for my daughter's birthday? 20 guests, "
                "next Saturday.",
             "ممكن تسوون شيء مثل هذا لعيد ميلاد بنتي؟ 20 ضيف، السبت القادم.", kind="image"),
        Turn("noura", "Yes, we can! The unicorn horn and the pastel flowers are simple for us. "
                      "Let us book a design fitting so we agree the flavours and the size.",
             "أكيد! القرن والورود الباستيل سهلة علينا. نحجز جلسة تصميم لنتفق على النكهات "
             "والحجم.", gap=15),
        Turn(C, "Booked for tomorrow at 4. See you then!",
             "حجزت بكرة الساعة 4. نشوفكم!", gap=6)), assigned="noura", outcome="booked"),
    Chat("James O.", 6 * D, "closed", (
        Turn(C, "Do you deliver to Lusail?", "Do you deliver to Lusail?"),
        Turn("faisal", "Yes. Delivery to Lusail is QAR 25, and free for orders over QAR 150.",
             "نعم. التوصيل إلى لوسيل 25 ريالاً، ومجاني للطلبات فوق 150 ريالاً.", gap=5)),
         assigned="faisal", outcome="answered"),
    Chat("أمل ج.", 8 * D, "closed", (
        Turn(C, "Are you open on Friday morning?", "تفتحون صباح الجمعة؟"),
        Turn("faisal", "On Friday we open at 1 pm. Saturday to Thursday from 6:30 am.",
             "الجمعة نفتح الساعة 1 ظهراً. من السبت إلى الخميس من 6:30 صباحاً.", gap=2)),
         assigned="faisal", outcome="answered"),
    Chat("Noor A.", 2 * D + 5 * H, "closed", (
        Turn(C, "Is the sourdough baked today?", "Is the sourdough baked today?"),
        Turn("faisal", "Yes, it came out at 6:30 this morning. I will keep one for you.",
             "نعم، طلع من الفرن 6:30 هذا الصباح. سأحجز لك رغيفاً.", gap=2),
        Turn(C, "Thank you!", "شكراً!", gap=1)), assigned="faisal", outcome="sold"),
    Chat("Grace L.", 5 * D, "closed", (
        Turn(C, "How much for 30 cupcakes?", "How much for 30 cupcakes?"),
        Turn("noura", "Cupcakes come in boxes of 6 at QAR 42, so 30 is 5 boxes, QAR 210. With "
                      "two days' notice we can do a custom flavour.",
             "الكب كيك في علب من 6 بسعر 42 ريالاً، فـ 30 قطعة 5 علب بـ 210 ريالات. ونقدر نعمل "
             "نكهة خاصة بإشعار يومين.", gap=7),
        Turn(C, "That is a bit more than I planned, I will think about it.",
             "That is a bit more than I planned, I will think about it.", gap=20)),
         assigned="noura", outcome="lost", reason="price"),
    Chat("Sophie T.", 3 * D + 2 * H, "closed", (
        Turn(C, "Please stop sending me messages.", "Please stop sending me messages."),
        Turn("rashid", "Understood, Sophie. We will not message you again. Thank you for "
                       "having visited us.",
             "Understood, Sophie. We will not message you again. Thank you for having visited "
             "us.", gap=10)), assigned="rashid", outcome="answered", stop=True),
    Chat("Marina Tower Offices", 3 * D, "closed", (
        Turn(C, "Could you send us a statement for this month, please?",
             "Could you send us a statement for this month, please?"),
        Turn("dina", "Of course. The statement of account is on its way to you now.",
             "Of course. The statement of account is on its way to you now.", gap=12)),
         assigned="dina", outcome="answered"),
    Chat("Bluebird Events", 2 * D, "answered", (
        Turn(C, "We will pay the open invoices by Sunday. Apologies for the delay.",
             "We will pay the open invoices by Sunday. Apologies for the delay."),
        Turn("dina", "Thank you, noted until Sunday. I will check again on Monday morning.",
             "Thank you, noted until Sunday. I will check again on Monday morning.", gap=25)),
         assigned="dina", outcome="answered"),
    Chat("Elena G.", 4 * D, "closed", (
        Turn(C, "Hi! Do you have a slot for a cake tasting this Saturday?",
             "Hi! Do you have a slot for a cake tasting this Saturday?"),
        Turn("faisal", "Yes! Here is the booking page, pick any free time. The tasting is QAR "
                       "75 and a QAR 25 deposit holds your slot.",
             "Yes! Here is the booking page, pick any free time. The tasting is QAR 75 and a "
             "QAR 25 deposit holds your slot.", gap=4),
        Turn(C, "Booked, thank you.", "Booked, thank you.", gap=9)), assigned="faisal",
         outcome="booked"),
    Chat("ريم و.", 1 * D + 6 * H, "closed", (
        Turn(C, "Thank you, the cake was wonderful!", "شكراً، الكيكة كانت رائعة!"),
        Turn("hessa", "You are welcome! We hope to see you again soon.",
             "العفو! نتمنى أن نراك قريباً.", gap=30)), assigned="faisal", outcome="answered"),
    Chat("Hassan D.", 7 * D, "closed", (
        Turn(C, "هل عندكم خيارات نباتية؟", "هل عندكم خيارات نباتية؟"),
        Turn("faisal", "Yes: za'atar manousheh, spinach fatayer, the sourdough and the "
                       "multigrain loaf are vegetarian. Vegan: sourdough and za'atar.",
             "نعم: مناقيش الزعتر وفطاير السبانخ والعجين المخمّر ورغيف الحبوب نباتية. والنباتي "
             "الصرف: العجين المخمّر والزعتر.", gap=6)), assigned="faisal",
         outcome="answered"),
)
def chats() -> tuple:
    return CHATS


async def plan(run: Run, story) -> int:
    """Put every conversation into the story's messages and activity; return how many."""
    names = {m_key: run.names[email] for m_key, email in run.emails.items()}
    people = run.people
    waiting_ids = set()
    story.notes = []
    story.stops = []
    story.chat_state = {}
    for chat in chats():
        person = people.get(chat.customer)
        if person is None:
            continue
        lang = person.customer.lang
        start = story.now - timedelta(minutes=chat.ago)
        if start <= person.first_seen:
            start = person.first_seen + timedelta(hours=2)
        at = start
        last_staff = None
        for i, turn in enumerate(chat.turns):
            at = at + timedelta(minutes=turn.gap if i else 0)
            body = turn.ar if lang == "ar" else turn.en
            if turn.who == C:
                payload = {}
                if turn.kind == "audio":
                    payload = {"duration": 14}
                if turn.kind == "image":
                    payload = {"caption": True}
                story.say(person, at, "in", turn.kind, body, payload)
                if turn.kind == "image":
                    story.photo_for = getattr(story, "photo_for", [])
                    story.photo_for.append((person.id, at))
            else:
                user_id = run.staff[turn.who]
                story.messages.append(
                    (person.id, "out", "text", body, {}, at, "read", names[turn.who], user_id))
                last_staff = turn.who
        if chat.note:
            story.notes.append((person.id, chat.note, run.staff["rashid"], names["rashid"],
                                at + timedelta(minutes=2)))
        if chat.outcome and chat.state != "waiting":
            detail = {"outcome": chat.outcome} | ({"reason": chat.reason} if chat.reason else {})
            closer = chat.turns[-1].who if chat.turns[-1].who != C else (last_staff or "faisal")
            story.log("conversation", person.id, person, "closed",
                      at + timedelta(minutes=8), run.emails[closer], detail)
        if chat.assigned:
            story.chat_assigned = getattr(story, "chat_assigned", {})
            story.chat_assigned[person.id] = run.staff[chat.assigned]
        if chat.stop:
            story.stops.append((person.id, at - timedelta(minutes=chat.turns[-1].gap)))
        story.chat_state[person.id] = (chat.state, at)
        if chat.state == "waiting":
            waiting_ids.add(person.id)
            # Nothing the shop said to this customer after they wrote: they are waiting.
            story.messages[:] = [
                m for m in story.messages
                if not (m[0] == person.id and m[5] > start)
                or (m[1] == "in" and m[5] == start)
            ]
    return len(story.chat_state)


async def finish(run: Run, conn, story) -> None:
    """After the story's bulk writes: who looks after each conversation, which are open and
    unread, the internal notes, the photo a customer sent, and the customer who stopped."""
    for contact_id, (state, at) in story.chat_state.items():
        if state == "waiting":
            await conn.execute(
                "update contacts set inbox_status = 'open', inbox_read_at = "
                "last_inbound_at - interval '1 minute' where id = $1", contact_id)
        elif state == "answered":
            await conn.execute(
                "update contacts set inbox_status = 'open', inbox_read_at = $2 where id = $1",
                contact_id, at)
        else:
            await conn.execute(
                "update contacts set inbox_status = 'closed', inbox_read_at = $2 where id = $1",
                contact_id, at + timedelta(minutes=10))
    for contact_id, user_id in getattr(story, "chat_assigned", {}).items():
        await conn.execute("update contacts set assigned_to = $2 where id = $1",
                           contact_id, user_id)
    for contact_id, body, author, author_name, at in story.notes:
        await conn.execute(
            "insert into inbox_notes (contact_id, body, author_id, author_name, created_at) "
            "values ($1, $2, $3, $4, $5)", contact_id, body, author, author_name, at)
    for contact_id, at in getattr(story, "photo_for", []):
        message_id = await conn.fetchval(
            "select id from messages where contact_id = $1 and created_at = $2 and "
            "direction = 'in' and kind = 'image'", contact_id, at)
        if message_id:
            await conn.execute(
                "insert into message_media (message_id, content_type, data) "
                "values ($1, 'image/png', $2)", message_id, _PHOTO)
    for contact_id, at in story.stops:
        await consent.record(conn, contact_id, "service", "revoked", "customer_stop",
                             "stop messaging")
        story.revoked = getattr(story, "revoked", []) + [(contact_id, at)]
