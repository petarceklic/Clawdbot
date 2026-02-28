"""
Possum Crypto -- Technical Indicators
Calculates RSI, EMA, Bollinger Bands, MACD, ADX using the `ta` library.
Pure Python -- no C compilation needed (unlike TA-Lib).
"""

import logging

import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator, MACD, ADXIndicator
from ta.volatility import BollingerBands

logger = logging.getLogger("possum.crypto.technicals")


def get_all_indicators(df: pd.DataFrame, symbol: str) -> dict:
    """Calculate all technical indicators from OHLCV DataFrame.

    Input DataFrame must have columns: open, high, low, close, volume
    Returns dict with all indicator values for the latest bar.
    """
    if len(df) < 50:
        logger.warning("Only %d bars for %s -- some indicators may be NaN", len(df), symbol)

    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    # Current price
    current_price = float(close.iloc[-1])
    prev_close = float(close.iloc[-2]) if len(close) > 1 else current_price

    # RSI (14)
    rsi_indicator = RSIIndicator(close=close, window=14)
    rsi_series = rsi_indicator.rsi()
    rsi = float(rsi_series.iloc[-1]) if not rsi_series.iloc[-1] != rsi_series.iloc[-1] else None
    rsi_prev = float(rsi_series.iloc[-2]) if len(rsi_series) > 1 and rsi_series.iloc[-2] == rsi_series.iloc[-2] else None

    # EMA (25 and 50)
    ema25_indicator = EMAIndicator(close=close, window=25)
    ema50_indicator = EMAIndicator(close=close, window=50)
    ema25 = float(ema25_indicator.ema_indicator().iloc[-1])
    ema50 = float(ema50_indicator.ema_indicator().iloc[-1])

    ema25_prev = float(ema25_indicator.ema_indicator().iloc[-2]) if len(close) > 25 else None
    ema50_prev = float(ema50_indicator.ema_indicator().iloc[-2]) if len(close) > 50 else None

    # EMA signal
    if ema25 > ema50:
        ema_signal = "bullish"
    elif ema25 < ema50:
        ema_signal = "bearish"
    else:
        ema_signal = "neutral"

    # EMA crossover detection
    ema_crossover = None
    if ema25_prev is not None and ema50_prev is not None:
        if ema25_prev <= ema50_prev and ema25 > ema50:
            ema_crossover = "bullish"
        elif ema25_prev >= ema50_prev and ema25 < ema50:
            ema_crossover = "bearish"

    # Bollinger Bands (20, 2)
    bb = BollingerBands(close=close, window=20, window_dev=2)
    bb_upper = float(bb.bollinger_hband().iloc[-1])
    bb_middle = float(bb.bollinger_mavg().iloc[-1])
    bb_lower = float(bb.bollinger_lband().iloc[-1])

    if current_price > bb_upper:
        bb_position = "above_upper"
    elif current_price < bb_lower:
        bb_position = "below_lower"
    else:
        bb_position = "within"

    # MACD (12, 26, 9)
    macd_indicator = MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    macd_line = float(macd_indicator.macd().iloc[-1])
    macd_signal_line = float(macd_indicator.macd_signal().iloc[-1])
    macd_histogram = float(macd_indicator.macd_diff().iloc[-1])

    if macd_line > macd_signal_line:
        macd_signal = "bullish"
    elif macd_line < macd_signal_line:
        macd_signal = "bearish"
    else:
        macd_signal = "neutral"

    # ADX (14)
    adx_indicator = ADXIndicator(high=high, low=low, close=close, window=14)
    adx_value = float(adx_indicator.adx().iloc[-1]) if not pd.isna(adx_indicator.adx().iloc[-1]) else None

    # Volume ratio (current vs 20-bar average)
    avg_volume_20 = float(volume.tail(20).mean()) if len(volume) >= 20 else float(volume.mean())
    current_volume = float(volume.iloc[-1])
    volume_ratio = current_volume / avg_volume_20 if avg_volume_20 > 0 else 1.0

    # 7-day high/low (for breakout detection -- 7 days * 24 hours = 168 bars on 1h)
    lookback = min(168, len(df))
    high_7d = float(high.tail(lookback).max())
    low_7d = float(low.tail(lookback).min())

    # 24h change
    bars_24h = min(24, len(df))
    price_24h_ago = float(close.iloc[-bars_24h]) if len(close) >= bars_24h else current_price
    change_24h_pct = ((current_price - price_24h_ago) / price_24h_ago * 100) if price_24h_ago > 0 else 0

    indicators = {
        "symbol": symbol,
        "current_price": current_price,
        "prev_close": prev_close,
        "change_24h_pct": round(change_24h_pct, 2),

        # RSI
        "rsi": round(rsi, 2) if rsi is not None else None,
        "rsi_prev": round(rsi_prev, 2) if rsi_prev is not None else None,

        # EMA
        "ema_25": round(ema25, 2),
        "ema_50": round(ema50, 2),
        "ema_signal": ema_signal,
        "ema_crossover": ema_crossover,

        # Bollinger Bands
        "bb_upper": round(bb_upper, 2),
        "bb_middle": round(bb_middle, 2),
        "bb_lower": round(bb_lower, 2),
        "bb_position": bb_position,

        # MACD
        "macd_line": round(macd_line, 4),
        "macd_signal_line": round(macd_signal_line, 4),
        "macd_histogram": round(macd_histogram, 4),
        "macd_signal": macd_signal,

        # ADX
        "adx": round(adx_value, 2) if adx_value is not None else None,

        # Volume
        "volume_ratio": round(volume_ratio, 2),
        "current_volume": current_volume,
        "avg_volume_20": round(avg_volume_20, 2),

        # Price range
        "high_7d": round(high_7d, 2),
        "low_7d": round(low_7d, 2),
    }

    logger.info(
        "Technicals %s: price=%.2f, RSI=%.1f, EMA=%s, BB=%s, MACD=%s",
        symbol, current_price,
        rsi if rsi is not None else 0,
        ema_signal, bb_position, macd_signal,
    )

    return indicators
