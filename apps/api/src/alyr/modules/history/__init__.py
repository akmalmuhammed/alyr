"""A shop's past visits, read from a file its other system exported (D-197, D-198, spec 070).

For a business that keeps its appointments and sales somewhere else, ALYR Insights has nothing to
read: every Agent rule, the weekly report and the MCP read tools read the booking engine's own
tables. This package is the way a person at ALYR puts a file of past visits into those tables, so
the same rules read real numbers. It is not a way to take bookings and it never contacts anyone.

* `plan.py` is the pure half: a sheet and a mapping of columns in, visits and problems out, with
  row numbers, in English and Arabic. It touches no database.
* `imports.py` is the half that needs one: the preview (what would be made, what exists), the
  hash-checked apply in one transaction, the undo of a whole import, and the "data from" fact.
* `words.py` holds every sentence a person reads, in both languages.

What an import makes: `services`, `booking_resources` (the stylists, when the file names them),
`contacts` and `bookings`, all marked by `history_import_id`. Only visits that are over, with a
final state (came, did not come, cancelled). Nothing is queued for any of it: no message, reminder,
review request, consent record, job or event.
"""
