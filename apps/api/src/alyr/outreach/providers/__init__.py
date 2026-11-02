"""The engine's outside services, one interface each, chosen from the settings.

On a developer machine (`ALYR_ENV=local`, which the tests set) every provider is its simulator,
whatever keys a `.env` holds: the test suite never touches the network. Anywhere else a provider
whose settings are missing is closed: it refuses every call and never falls back to a simulator,
so nothing is ever pretended to have been sent or found.
"""

from dataclasses import dataclass

from alyr.config import Settings
from alyr.outreach.providers.finder import ClosedFinder, HunterFinder, SimulatedFinder
from alyr.outreach.providers.llm import AnthropicLLM, ClosedLLM, SimulatedLLM
from alyr.outreach.providers.mailbox import Server, SimulatedMailbox, SmtpImapMailbox
from alyr.outreach.providers.search import (
    ClosedPlaces,
    ClosedSearch,
    ExaSearch,
    GooglePlaces,
    SimulatedPlaces,
    SimulatedSearch,
)
from alyr.outreach.providers.web import (
    ClosedFirecrawl,
    DirectFetcher,
    FirecrawlFetcher,
    SimulatedWeb,
    Web,
)


@dataclass
class Providers:
    llm: object
    search: object
    places: object
    finder: object
    web: object
    firecrawl: object
    mailbox: object
    simulated: bool


def smtp_server(s: Settings) -> Server | None:
    if s.outreach_smtp_host and s.outreach_smtp_user and s.outreach_smtp_password:
        return Server(s.outreach_smtp_host, s.outreach_smtp_port, s.outreach_smtp_user,
                      s.outreach_smtp_password)
    return None


def imap_server(s: Settings) -> Server | None:
    if s.outreach_imap_host and s.outreach_imap_user and s.outreach_imap_password:
        return Server(s.outreach_imap_host, s.outreach_imap_port, s.outreach_imap_user,
                      s.outreach_imap_password)
    return None


def build(settings: Settings) -> Providers:
    if settings.env == "local":
        web = SimulatedWeb()
        return Providers(SimulatedLLM(), SimulatedSearch(), SimulatedPlaces(), SimulatedFinder(),
                         web, ClosedFirecrawl(), SimulatedMailbox(), True)
    firecrawl = (FirecrawlFetcher(settings.firecrawl_api_key) if settings.firecrawl_api_key
                 else ClosedFirecrawl())
    return Providers(
        llm=AnthropicLLM(settings.anthropic_api_key) if settings.anthropic_api_key
        else ClosedLLM(),
        search=ExaSearch(settings.exa_api_key) if settings.exa_api_key else ClosedSearch(),
        places=GooglePlaces(settings.google_places_api_key) if settings.google_places_api_key
        else ClosedPlaces(),
        finder=HunterFinder(settings.hunter_api_key) if settings.hunter_api_key
        else ClosedFinder(),
        web=Web(DirectFetcher(),
                firecrawl if settings.firecrawl_api_key else None),
        firecrawl=firecrawl,
        mailbox=SmtpImapMailbox(smtp_server(settings), imap_server(settings)),
        simulated=False,
    )
