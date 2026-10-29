"""Market lists and symbol search for the desktop's symbol picker.

Both come from Yahoo Finance, the default data vendor, so every symbol the
picker offers is one the analysis can actually fetch. Yahoo's screener has no
paging for its predefined crypto list, so each market returns one page: the
largest names by market cap.

Like ``asset_type``, this lives outside ``cli`` so the packaged sidecar can
import it without the CLI's dependencies.
"""

from __future__ import annotations

from typing import Any

from tradingagents.asset_type import CRYPTO_SUFFIXES

MARKETS = ("us", "crypto", "hk", "cn")
LIST_SIZE = 50
SEARCH_SIZE = 25

_US_EXCHANGES = ("NMS", "NYQ", "NGM", "NCM", "ASE")
_CN_EXCHANGES = ("SHH", "SHZ")
_TRADABLE_TYPES = ("EQUITY", "ETF")
_CRYPTO_SCREEN = "all_cryptocurrencies_us"


def _check_market(market: Any) -> str:
    if market not in MARKETS:
        raise ValueError(f"unknown market {market!r}; expected one of {', '.join(MARKETS)}")
    return market


def belongs_to(market: str, quote: dict) -> bool:
    """True when a Yahoo quote is something the picker should list under ``market``."""
    symbol = str(quote.get("symbol") or "")
    quote_type = quote.get("quoteType")
    if market == "crypto":
        return quote_type == "CRYPTOCURRENCY" and symbol.endswith(CRYPTO_SUFFIXES)
    if quote_type not in _TRADABLE_TYPES:
        return False
    if market == "hk":
        return symbol.endswith(".HK")
    if market == "cn":
        return symbol.endswith((".SS", ".SZ"))
    return quote.get("exchange") in _US_EXCHANGES


def _item(quote: dict) -> dict:
    symbol = str(quote["symbol"])
    return {
        "symbol": symbol,
        "name": quote.get("shortName")
        or quote.get("longName")
        or quote.get("shortname")
        or quote.get("longname")
        or symbol,
        "exchange": quote.get("fullExchangeName") or quote.get("exchDisp") or quote.get("exchange"),
        "currency": quote.get("currency"),
        "price": quote.get("regularMarketPrice"),
        "changePercent": quote.get("regularMarketChangePercent"),
        "marketCap": quote.get("marketCap"),
    }


def _screen(market: str) -> list[dict]:
    import yfinance as yf
    from yfinance import EquityQuery

    if market == "crypto":
        result = yf.screen(_CRYPTO_SCREEN, count=LIST_SIZE)
    else:
        exchanges = _CN_EXCHANGES if market == "cn" else _US_EXCHANGES
        query = (
            EquityQuery("eq", ["region", "hk"])
            if market == "hk"
            else EquityQuery("is-in", ["exchange", *exchanges])
        )
        result = yf.screen(query, sortField="intradaymarketcap", sortAsc=False, size=LIST_SIZE)
    return list(result.get("quotes") or [])


def market_list(market: Any) -> dict:
    """One page of the largest names in ``market``, as a ``market_list`` event."""
    market = _check_market(market)
    items = [_item(quote) for quote in _screen(market) if belongs_to(market, quote)]
    return {"v": 1, "type": "market_list", "market": market, "items": items}


def symbol_search(market: Any, query: Any) -> dict:
    """Yahoo symbol search narrowed to ``market``, as a ``symbol_search`` event."""
    market = _check_market(market)
    text = str(query or "").strip()
    items: list[dict] = []
    if text:
        import yfinance as yf

        quotes = yf.Search(
            text, max_results=SEARCH_SIZE, news_count=0, lists_count=0, enable_fuzzy_query=True
        ).quotes
        items = [_item(quote) for quote in quotes if quote.get("symbol") and belongs_to(market, quote)]
    return {"v": 1, "type": "symbol_search", "market": market, "query": text, "items": items}
