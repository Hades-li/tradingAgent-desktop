"""The symbol picker's market lists and search, with Yahoo stubbed out."""

import unittest
from unittest import mock

from tradingagents import market_catalog


def quote(symbol, quote_type="EQUITY", exchange="NMS", **extra):
    return {"symbol": symbol, "quoteType": quote_type, "exchange": exchange, **extra}


class MarketListTest(unittest.TestCase):
    def test_equity_markets_screen_by_market_cap(self):
        quotes = [quote("NVDA", shortName="NVIDIA", regularMarketPrice=1.5, marketCap=9)]
        with mock.patch("yfinance.screen", return_value={"quotes": quotes}) as screen:
            payload = market_catalog.market_list("us")
        kwargs = screen.call_args.kwargs
        self.assertEqual(kwargs["sortField"], "intradaymarketcap")
        self.assertFalse(kwargs["sortAsc"])
        self.assertEqual(kwargs["size"], market_catalog.LIST_SIZE)
        self.assertEqual(payload["type"], "market_list")
        self.assertEqual(payload["items"][0]["symbol"], "NVDA")
        self.assertEqual(payload["items"][0]["name"], "NVIDIA")
        self.assertEqual(payload["items"][0]["price"], 1.5)

    def test_crypto_uses_the_predefined_list_and_drops_non_usd_pairs(self):
        quotes = [
            quote("BTC-USD", "CRYPTOCURRENCY", "CCC"),
            quote("BTC-EUR", "CRYPTOCURRENCY", "CCC"),
        ]
        with mock.patch("yfinance.screen", return_value={"quotes": quotes}) as screen:
            payload = market_catalog.market_list("crypto")
        self.assertEqual(screen.call_args.args[0], "all_cryptocurrencies_us")
        self.assertEqual([item["symbol"] for item in payload["items"]], ["BTC-USD"])

    def test_unknown_market_is_rejected(self):
        with self.assertRaises(ValueError):
            market_catalog.market_list("moon")


class SymbolSearchTest(unittest.TestCase):
    def search(self, market, quotes, query="x"):
        with mock.patch("yfinance.Search") as search:
            search.return_value.quotes = quotes
            return market_catalog.symbol_search(market, query)

    def test_results_are_narrowed_to_the_market(self):
        quotes = [
            quote("0700.HK", exchange="HKG", shortname="TENCENT"),
            quote("TCEHY", exchange="PNK"),
            quote("600519.SS", exchange="SHH"),
            quote("AAPL"),
            quote("AAPL=F", "FUTURE", "CME"),
        ]
        self.assertEqual([i["symbol"] for i in self.search("hk", quotes)["items"]], ["0700.HK"])
        self.assertEqual([i["symbol"] for i in self.search("cn", quotes)["items"]], ["600519.SS"])
        self.assertEqual([i["symbol"] for i in self.search("us", quotes)["items"]], ["AAPL"])
        self.assertEqual(self.search("hk", quotes)["items"][0]["name"], "TENCENT")

    def test_blank_query_does_not_hit_the_network(self):
        with mock.patch("yfinance.Search") as search:
            payload = market_catalog.symbol_search("us", "   ")
        search.assert_not_called()
        self.assertEqual(payload["items"], [])


if __name__ == "__main__":
    unittest.main()
