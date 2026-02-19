"""AMC product extension layer.

Contains planning/roadmap metadata for non-core productization features that
support AMC as an end-to-end agent platform.
"""

from .features import Relevance, Domain, FeatureProposal, as_dicts, count_features, get_features, select_high_impact
from .persistence import (
    PRODUCT_DB_PATH_ENV,
    PRODUCT_QUEUE_DB_FILE,
    PRODUCT_QUEUE_RETENTION_DAYS,
    product_db_path,
    queue_retention_cutoff,
)

__all__ = [
    "Relevance",
    "Domain",
    "FeatureProposal",
    "as_dicts",
    "count_features",
    "get_features",
    "select_high_impact",
    "PRODUCT_DB_PATH_ENV",
    "PRODUCT_QUEUE_DB_FILE",
    "PRODUCT_QUEUE_RETENTION_DAYS",
    "product_db_path",
    "queue_retention_cutoff",
]
