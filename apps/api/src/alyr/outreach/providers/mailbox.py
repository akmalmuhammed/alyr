"""The outreach mailbox: SMTP to send, IMAP to read replies (Python's standard library, run in a
thread so the event loop never waits on a mail server), and a simulator.

Only the send gateway calls `send`. The mailbox is a dedicated one on a domain of its own, never
alyr.qa (D-152). Google Workspace with an app password is the recommended host
(docs/runbooks/outreach-setup.md); Microsoft 365 needs OAuth for SMTP and is not supported here.

What a failed send means matters, because a message must never go twice:
- `NotSent`: the server definitely did not take it (could not connect or sign in, or answered
  with a 4xx or 5xx code to the sender, a recipient or the data). `permanent` is a 5xx.
- `Uncertain`: the connection broke while the message was being handed over. It may have gone;
  the gateway keeps it claimed and never sends it again.
"""

import asyncio
import imaplib
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage

from alyr.outreach.providers.llm import NotConfigured

TIMEOUT = 30


class NotSent(Exception):
    def __init__(self, reason: str, permanent: bool = False) -> None:
        super().__init__(reason)
        self.permanent = permanent


class Uncertain(Exception):
    pass


class MailboxError(Exception):
    pass


@dataclass(frozen=True)
class Server:
    host: str
    port: int
    user: str
    password: str


def _smtp_send(server: Server, message: EmailMessage) -> None:
    context = ssl.create_default_context()
    try:
        if server.port == 465:
            smtp = smtplib.SMTP_SSL(server.host, server.port, timeout=TIMEOUT, context=context)
        else:
            smtp = smtplib.SMTP(server.host, server.port, timeout=TIMEOUT)
            smtp.starttls(context=context)
        smtp.login(server.user, server.password)
    except (OSError, smtplib.SMTPException) as error:
        raise NotSent(f"could not sign in: {type(error).__name__}") from error
    try:
        try:
            smtp.send_message(message)
        except smtplib.SMTPRecipientsRefused as error:
            codes = [code for code, _ in error.recipients.values()]
            raise NotSent(f"recipient refused {codes}", permanent=all(c >= 500 for c in codes)) \
                from error
        except (smtplib.SMTPSenderRefused, smtplib.SMTPDataError) as error:
            raise NotSent(f"refused {error.smtp_code}", permanent=error.smtp_code >= 500) \
                from error
        except (OSError, smtplib.SMTPException) as error:
            raise Uncertain(f"broke while sending: {type(error).__name__}") from error
    finally:
        try:
            smtp.quit()
        except Exception:  # noqa: BLE001 - the message is already decided
            pass


def _smtp_login(server: Server) -> str:
    context = ssl.create_default_context()
    if server.port == 465:
        smtp = smtplib.SMTP_SSL(server.host, server.port, timeout=TIMEOUT, context=context)
    else:
        smtp = smtplib.SMTP(server.host, server.port, timeout=TIMEOUT)
        smtp.starttls(context=context)
    try:
        smtp.login(server.user, server.password)
    finally:
        smtp.quit()
    return "signed in; nothing sent"


def _imap(server: Server) -> imaplib.IMAP4_SSL:
    box = imaplib.IMAP4_SSL(server.host, server.port, timeout=TIMEOUT,
                            ssl_context=ssl.create_default_context())
    box.login(server.user, server.password)
    box.select("INBOX")
    return box


def _imap_unseen(server: Server, limit: int) -> list[tuple[str, bytes]]:
    box = _imap(server)
    try:
        status, data = box.uid("search", None, "UNSEEN")
        if status != "OK":
            raise MailboxError("search failed")
        found = []
        for uid in (data[0] or b"").split()[:limit]:
            status, parts = box.uid("fetch", uid, "(BODY.PEEK[])")
            if status == "OK" and parts and isinstance(parts[0], tuple):
                found.append((uid.decode(), parts[0][1]))
        return found
    finally:
        box.logout()


def _imap_mark_seen(server: Server, uids: list[str]) -> None:
    if not uids:
        return
    box = _imap(server)
    try:
        box.uid("store", ",".join(uids), "+FLAGS", r"(\Seen)")
    finally:
        box.logout()


def _imap_count(server: Server) -> str:
    box = _imap(server)
    try:
        _, data = box.uid("search", None, "UNSEEN")
        return f"signed in; {len((data[0] or b'').split())} unread"
    finally:
        box.logout()


class SmtpImapMailbox:
    name = "smtp"

    def __init__(self, smtp: Server | None, imap: Server | None) -> None:
        self._smtp = smtp
        self._imap = imap

    async def send(self, message: EmailMessage) -> None:
        if self._smtp is None:
            raise NotSent("SMTP is not configured")
        await asyncio.to_thread(_smtp_send, self._smtp, message)

    async def test_smtp(self) -> str:
        if self._smtp is None:
            raise NotConfigured("the SMTP settings are not all set")
        return await asyncio.to_thread(_smtp_login, self._smtp)

    async def unseen(self, limit: int = 50) -> list[tuple[str, bytes]]:
        if self._imap is None:
            raise NotConfigured("the IMAP settings are not all set")
        return await asyncio.to_thread(_imap_unseen, self._imap, limit)

    async def mark_seen(self, uids: list[str]) -> None:
        if self._imap is not None:
            await asyncio.to_thread(_imap_mark_seen, self._imap, uids)

    async def test_imap(self) -> str:
        if self._imap is None:
            raise NotConfigured("the IMAP settings are not all set")
        return await asyncio.to_thread(_imap_count, self._imap)


@dataclass
class SimulatedMailbox:
    """Keeps what was sent (`sent`) and serves what a test put in `inbox` (uid, raw bytes).
    `fail_next` makes the next send raise the given exception."""

    name: str = "simulator"
    sent: list[EmailMessage] = field(default_factory=list)
    inbox: list[tuple[str, bytes]] = field(default_factory=list)
    seen: set[str] = field(default_factory=set)
    fail_next: Exception | None = None
    logins: int = 0

    async def send(self, message: EmailMessage) -> None:
        if self.fail_next is not None:
            error, self.fail_next = self.fail_next, None
            raise error
        self.sent.append(message)

    async def test_smtp(self) -> str:
        self.logins += 1
        return "simulator; nothing sent"

    async def unseen(self, limit: int = 50) -> list[tuple[str, bytes]]:
        return [(uid, raw) for uid, raw in self.inbox if uid not in self.seen][:limit]

    async def mark_seen(self, uids: list[str]) -> None:
        self.seen.update(uids)

    async def test_imap(self) -> str:
        self.logins += 1
        return f"simulator; {len(await self.unseen())} unread"
