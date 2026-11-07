"""Discovery: how customers find a business, checked by rules (spec 065, D-160, ALY-316).

Phase 1 reads, scores and explains. It changes nothing outside ALYR, sends nothing (it never
calls `Outbound`) and calls no model: findings come from rules anyone can read
(`rules.py`), the way the Agent's insights do (D-035). The actions (`actions.py`) are the one
door; the workspace routes (`routes/discovery.py`) are a thin layer over them, and WhatsApp and
the MCP connector call the same actions later.

Modules: `connectors/` (where the facts come from), `engine.py` (a run, step by step),
`rules.py` (the twelve rules), `scoring.py` (the arithmetic), `words.py` (English and Arabic).
"""

KEY = "discovery"
