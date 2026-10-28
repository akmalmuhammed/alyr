# The sales demo: salons, barbers and booking businesses

The second in-shop demo, after the bakery one (`docs/sales/demo-bakery.md`, ALY-263). It uses the same scene engine, controls, decisions and tone rules; only the words, data and three scenes change.

**Who it's for:**
- women's salons, barbers, nail and lash studios, spas and massage;
- home services that book visits (AC, cleaning, repairs).

Clinics are left out until the lawyer's view on health data (`alyr-design/honesty.md`). Built at `/demo/salon` after `/demo/bakery` merges.

## Decided (same as the bakery demo)

- **Format:** the founder's laptop; English first with Arabic one tap away; no price; ends on booking a check-up.
- **Bundle shown as "Set up by ALYR":** the Google Business Profile, and a review request after each visit.
- **Tone:** confident, specific, a real night in a real shop.
- **WhatsApp line:** "Works on WhatsApp, the app your customers already use."

## The honest limit, and what the demo does about it

Bookings today takes **one customer at a time per business**:
- no parallel chairs or staff (ALY-27);
- no deposits;
- no walk-ins or moves from the screen.

The founder decides how the demo handles this (see the open question below). Until he does, every scene below is written for what is true today, and the multi-chair beats are marked **[needs ALY-27]**.

## The script

### 1. Their salon (0:00)
- **Screen:** "[Their salon]. Wedding season. Saturday, 10:34 pm." Under it: "9 unread chats. 3 of them ask the same thing: what time is free tomorrow?"
- **Says:** "Let me show you tomorrow, booked while you slept."

### 2. Where the chairs go empty (1:00)
- **Three numbers, theirs:** booking requests a day, no-shows a week, the average visit value. The result: "About QAR [x] a month in empty chairs", labelled "your estimate", with the formula shown on tap.
- **Ten pain cards, in their words:**
  - "'What time is free?' 30 times a day."
  - "She didn't come, and I turned two people away for that slot."
  - "They ask at 11 pm. I answer at 10 am. They booked somewhere else."
  - "'How much is keratin?' again and again."
  - "Two girls booked for the same time." **[needs ALY-27 for several chairs]**
  - "I never know who to remind."
  - "I can't see which service makes me money."
  - "Regulars forget to come back after six weeks."
  - "Nobody finds me on Google."
  - "I'm on a job and can't answer the phone" (home services).

### 3. The booking that would have been lost (3:00)
Split screen: the customer's phone and the owner's Bookings screen.
- **10:41 pm:** "Is there anything tomorrow for blow-dry and nails?"
- **Two seconds later:** the services with prices and lengths, and the booking page with the free times.
- She picks 5:00 pm, and the booking is confirmed at once. The day view fills in; a later request for 5:00 pm sees only the next free time.
- **Says:** "You didn't answer a single message. The booking is in, and the next person can't take that time."

### 4. No-shows, handled (6:00)
- **3:00 pm:** the reminder goes 2 hours before.
- **The customer:** "my booking", then **Move**. She moves to 6:00 pm herself, and the 5:00 pm slot is free for someone else.
- **After the visit:** the team marks Came / Didn't come, and the week's no-show count shows on the owner's home.
- **Says:** "A reminder at 3 pm costs you nothing, and it's the difference between a full chair and an empty one."
- **Labels:** deposits are not shown (not built). If the founder chooses to build them first, a deposit beat goes here.

### 5. Their pains, solved (8:00)
Only the cards they tapped, each a before/after card:
- **Prices:** "How much is keratin?" gets the price list as an answer in the chat (Shelf, as Products).
- **Retail:** a shampoo sells and its stock drops (Shelf).
- **Who did what:** each booking has one person responsible, plus a per-person report: bookings, came, no-shows (team accountability, D-028).
- **Receipts:** a receipt after the visit, in Arabic and English (Docs).
- **Home services:**
  - a quote for the AC service becomes an invoice after the visit (Docs);
  - while the technician is on a job, the inbox keeps the customer answered.
- **"Regulars forget to come back":** shown as **Coming**: it needs customers' marketing permission (ALY-44). The demo says so honestly, or leaves the card out.

### 6. One visit, the whole business (10:00): the products working together
One booking travels through:
- **Bookings:** time, reminder, move, came or didn't.
- **Chat:** questions, prices, the inbox for the team.
- **Shelf:** the service list and retail stock.
- **Docs:** receipt, quote, invoice.
- **Accounts:** corporate clients, for example a hotel's staff or an office's monthly AC contract, on credit with reminders.
- **Agent:** today's bookings, no-shows, the best service, and Sunday's report.

Then before and after:
- **Before:** the appointment book, WhatsApp, Instagram DMs, a notes app for prices, calculator receipts.
- **After:** one workspace.

Then "it grows with you": a second branch, staff roles, more products when needed, the monthly review.

### 7. Be found (11:30): Set up by ALYR
"Salon near me" brings up their Google listing with a **Book** button that opens their booking page. After the visit, one message: "Thank you, Reem. A 10-second review helps us a lot." A review appears.

### 8. Their Sunday (12:45)
The report card for their week (sample week, labelled): bookings, came, no-shows, the best service. Then the Agent home.

### 9. How we work, and next step (13:30)
The same as the bakery demo:
- four steps;
- objections, one tap each;
- a QR code to a test line;
- "Book your check-up".

## Open question for the founder

Several chairs at once (ALY-27) and deposits decide how strong this demo is for real salons. The options:
1. **Build ALY-27 and deposits first,** then run this demo for every salon.
2. **Run it now for single-chair and solo businesses** (barbers, nail and lash artists, home salons, massage, technicians), and build ALY-27 next.
3. **Show several chairs labelled "Coming"** and sell to salons now.
