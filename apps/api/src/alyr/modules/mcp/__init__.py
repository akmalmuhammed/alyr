"""The MCP connector (specs/067-mcp-connector, D-170): an owner's own Claude or ChatGPT calls the
same actions the workspace and WhatsApp use.

Nothing in this package calls a model or any outside service: the owner's app calls ALYR, never
the other way round (a test fails if an HTTP client or a model provider is named here). The one
outside read, an app's own metadata document, goes through `connect/ssrf.py`.
"""
