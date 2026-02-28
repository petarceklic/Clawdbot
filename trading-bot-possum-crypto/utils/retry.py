"""
Possum Crypto -- Retry Decorators
Tenacity-based retry logic for network APIs and database operations.
Same pattern as Possum US/AU.
"""

import logging
import sqlite3

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    wait_fixed,
    retry_if_exception_type,
    before_log,
    after_log,
)

logger = logging.getLogger("possum.crypto.retry")

# LLM API calls: 3 attempts, exponential 2/4/8 seconds
retry_llm_call = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception_type((ConnectionError, TimeoutError, Exception)),
    before=before_log(logger, logging.DEBUG),
    after=after_log(logger, logging.WARNING),
    reraise=True,
)

# Exchange API calls: 3 attempts, exponential 1-30 seconds
retry_exchange_call = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=1, max=30),
    retry=retry_if_exception_type((ConnectionError, TimeoutError, Exception)),
    before=before_log(logger, logging.DEBUG),
    after=after_log(logger, logging.WARNING),
    reraise=True,
)

# Data fetches (Fear & Greed, etc.): 3 attempts, exponential 1-30 seconds
retry_data_fetch = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=1, max=30),
    retry=retry_if_exception_type((ConnectionError, TimeoutError, Exception)),
    before=before_log(logger, logging.DEBUG),
    after=after_log(logger, logging.WARNING),
    reraise=True,
)

# SQLite: quick retries for lock contention
retry_db = retry(
    stop=stop_after_attempt(3),
    wait=wait_fixed(0.5),
    retry=retry_if_exception_type(sqlite3.OperationalError),
    reraise=True,
)
