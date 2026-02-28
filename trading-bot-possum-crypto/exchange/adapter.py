"""
Possum Crypto -- Exchange Adapter
Kraken implementation via ccxt. Abstract interface so exchange is swappable.

All public data endpoints (OHLCV, ticker, order book) work without API keys.
Private endpoints (create_order, fetch_balance) need keys but only used when DRY_RUN=False.
"""

import logging

import ccxt
import pandas as pd

logger = logging.getLogger("possum.crypto.exchange")


class ExchangeAdapter:
    """Abstract exchange interface. Kraken implementation via ccxt."""

    def __init__(self, api_key: str = "", api_secret: str = ""):
        config = {
            "enableRateLimit": True,  # ccxt handles Kraken rate limiting
        }
        if api_key and api_secret:
            config["apiKey"] = api_key
            config["secret"] = api_secret

        self.exchange = ccxt.kraken(config)
        self.exchange_id = "kraken"
        logger.info(
            "Exchange adapter initialized: %s (auth=%s)",
            self.exchange_id, bool(api_key),
        )

    def fetch_ohlcv(
        self, symbol: str, timeframe: str = "1h", limit: int = 200,
    ) -> pd.DataFrame:
        """Get OHLCV candles as a pandas DataFrame.

        Returns DataFrame with columns: timestamp, open, high, low, close, volume
        Sorted by timestamp ascending.
        """
        raw = self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
        df = pd.DataFrame(
            raw, columns=["timestamp", "open", "high", "low", "close", "volume"],
        )
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df = df.sort_values("timestamp").reset_index(drop=True)
        return df

    def fetch_ticker(self, symbol: str) -> dict:
        """Get current price, bid/ask, volume.

        Returns dict with keys: last, bid, ask, high, low, volume, change_pct
        """
        ticker = self.exchange.fetch_ticker(symbol)
        return {
            "symbol": symbol,
            "last": ticker.get("last"),
            "bid": ticker.get("bid"),
            "ask": ticker.get("ask"),
            "high": ticker.get("high"),
            "low": ticker.get("low"),
            "volume": ticker.get("baseVolume"),
            "quote_volume": ticker.get("quoteVolume"),
            "change_pct": ticker.get("percentage"),
            "vwap": ticker.get("vwap"),
        }

    def fetch_order_book(self, symbol: str, limit: int = 20) -> dict:
        """Get order book depth."""
        return self.exchange.fetch_order_book(symbol, limit)

    def create_order(
        self, symbol: str, side: str, amount: float, price: float | None = None,
    ) -> dict:
        """Place order. Market order if price is None, limit order otherwise."""
        if price:
            return self.exchange.create_limit_order(symbol, side, amount, price)
        return self.exchange.create_market_order(symbol, side, amount)

    def fetch_balance(self) -> dict:
        """Get account balances."""
        balance = self.exchange.fetch_balance()
        return {
            "total": balance.get("total", {}),
            "free": balance.get("free", {}),
            "used": balance.get("used", {}),
        }

    def fetch_my_trades(self, symbol: str | None = None, limit: int = 50) -> list:
        """Get recent trades for logging."""
        return self.exchange.fetch_my_trades(symbol, limit=limit)


# Module-level singleton
_adapter: ExchangeAdapter | None = None


def get_exchange() -> ExchangeAdapter:
    global _adapter
    if _adapter is None:
        from config import get_config
        cfg = get_config()
        _adapter = ExchangeAdapter(
            api_key=cfg.kraken.api_key,
            api_secret=cfg.kraken.api_secret,
        )
    return _adapter
