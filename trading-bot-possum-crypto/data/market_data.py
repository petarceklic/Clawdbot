"""
Possum Crypto -- Market Data Fetcher
Fetches OHLCV bars and ticker data from Kraken via the exchange adapter.
"""

import logging

import pandas as pd

from exchange.adapter import get_exchange

logger = logging.getLogger("possum.crypto.market_data")


def fetch_ohlcv(symbol: str, timeframe: str = "1h", limit: int = 200) -> pd.DataFrame:
    """Fetch OHLCV candles for a symbol.

    Returns DataFrame with: timestamp, open, high, low, close, volume
    """
    exchange = get_exchange()
    df = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    logger.info(
        "Fetched %d %s candles for %s (latest: %s)",
        len(df), timeframe, symbol,
        df["timestamp"].iloc[-1] if len(df) > 0 else "N/A",
    )
    return df


def fetch_ticker(symbol: str) -> dict:
    """Fetch current ticker for a symbol."""
    exchange = get_exchange()
    ticker = exchange.fetch_ticker(symbol)
    logger.info(
        "Ticker %s: $%.2f AUD (24h: %s%%)",
        symbol, ticker["last"] or 0,
        f"{ticker['change_pct']:.1f}" if ticker["change_pct"] else "N/A",
    )
    return ticker


def fetch_all_tickers(symbols: list[str]) -> dict[str, dict]:
    """Fetch tickers for all symbols in the universe."""
    tickers = {}
    for symbol in symbols:
        try:
            tickers[symbol] = fetch_ticker(symbol)
        except Exception as e:
            logger.error("Failed to fetch ticker for %s: %s", symbol, e)
    return tickers
