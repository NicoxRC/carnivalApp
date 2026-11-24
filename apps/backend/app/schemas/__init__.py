"""Base for everything that travels as JSON.

Python attributes are snake_case and JSON keys camelCase (`expires_at` goes
out as `expiresAt`). Inheriting from `Schema` does the conversion both ways.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def to_ms(moment: datetime) -> int:
    """Dates go out as epoch milliseconds: the clients do arithmetic on them."""
    return int(moment.timestamp() * 1000)
