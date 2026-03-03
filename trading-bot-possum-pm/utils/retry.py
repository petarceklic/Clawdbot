"""
Possum PM — Retry Logic
Predefined tenacity retry configurations for different API failure modes.
"""

import logging
import sqlite3

import httpx
import requests
from tenacity import (
    RetryError,
    after_log,
    before_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    wait_fixed,
)

logger = logging.getLogger("possum.pm.retry")

# Network exceptions to retry on
NETWORK_ERRORS = (
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
    httpx.ConnectError,
    httpx.TimeoutException,
    ConnectionError,
    TimeoutError,
)

# LLM API calls: 3 attempts, exponential backoff 2/4/8 seconds
retry_llm_call = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception_type(NETWORK_ERRORS),
    before=before_log(logger, logging.WARNING),
    after=after_log(logger, logging.WARNING),
    reraise=True,
)

# Data fetches (Manifold, Polymarket): 3 attempts, patient backoff
retry_data_fetch = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=1, max=30),
    retry=retry_if_exception_type(NETWORK_ERRORS),
    before=before_log(logger, logging.WARNING),
    after=after_log(logger, logging.WARNING),
    reraise=True,
)

# SQLite operations: quick retry for lock contention
retry_db = retry(
    stop=stop_after_attempt(3),
    wait=wait_fixed(0.5),
    retry=retry_if_exception_type(sqlite3.OperationalError),
    reraise=True,
)

__all__ = [
    "retry_llm_call",
    "retry_data_fetch",
    "retry_db",
    "RetryError",
]
