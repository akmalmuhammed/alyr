"""ALYR's own outreach engine (ALY-310, specs/065-outreach-engine, D-152): find businesses and
the right person's work email, research them, draft a message with its sources, the founder
approves, the send gateway sends from a dedicated mailbox, follow-ups until a reply.

Agents propose, deterministic code disposes: the model researches, drafts, criticises and reads
replies (`llm.py`, no tools, structured output); only `gateway.py`, plain code with eleven checks,
can send. This is ALYR's own selling: no shop, no shop's customer and no WhatsApp is involved.
"""
