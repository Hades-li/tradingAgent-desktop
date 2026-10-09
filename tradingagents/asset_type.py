"""Asset-type detection for the desktop sidecar.

Upstream keeps this inside ``cli.prompts``, which the packaged sidecar must not
import (it would drag rich / typer / questionary into the bundle). The rule is
the same one the CLI applies.
"""

from tradingagents.dataflows.symbols import normalize_symbol

# Canonical-symbol suffixes that mark a crypto pair. Classification runs on the
# normalized symbol so BTCUSD and BTC-USDT both read as crypto (#981/#982),
# matching what the data path will actually fetch.
CRYPTO_SUFFIXES = ("-USD", "-USDT", "-USDC", "-BTC", "-ETH")


def detect_asset_type(raw: str) -> str:
    """Classify a ticker as ``"crypto"`` or ``"stock"``."""
    return "crypto" if normalize_symbol(raw).endswith(CRYPTO_SUFFIXES) else "stock"
