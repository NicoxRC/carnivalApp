"""The businesses and services on the map, and what the panel may send.

Appearing on the map never depends on paying. The plan only decides whether
the card carries what is sold: the offer, the menu and the contact.
"""

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import urlsplit

BUSINESS_CATEGORIES = (
    "restaurant",
    "tasca",
    "cafe",
    "ice_cream",
    "bakery",
    "shop",
    "bar",
    "pharmacy",
)
# Services share the table and the form with businesses (they are points on
# the map) but never carry a plan or an offer, and are loaded only with
# official data: a made-up toilet on a map someone uses to find a toilet is
# worse than not having the layer.
SERVICE_CATEGORIES = ("toilet", "water", "first_aid", "police", "road_closure")
CATEGORIES = BUSINESS_CATEGORIES + SERVICE_CATEGORIES

Plan = Literal["basic", "featured"]
PLANS: tuple[Plan, ...] = ("basic", "featured")
# When the offer shows, relative to the parade going past the business.
OfferTiming = Literal["always", "before", "after"]
OFFER_TIMINGS: tuple[OfferTiming, ...] = ("always", "before", "after")

# What the advertiser is told about.
MetricType = Literal["card", "map", "menu", "whatsapp", "link", "offer"]
METRIC_TYPES: tuple[MetricType, ...] = ("card", "map", "menu", "whatsapp", "link", "offer")

MAX_LENGTH = {"name": 80, "description": 280, "address": 140, "hours": 80, "offer": 140}
MAX_MENU_ITEMS = 40


class BusinessError(Exception):
    """What the panel sent cannot be saved. The message is for the person."""


@dataclass(frozen=True, slots=True)
class MenuItem:
    name: str
    # Free text: "$8.000", "desde $5.000".
    price: str


@dataclass(frozen=True, slots=True)
class Business:
    id: str
    name: str
    category: str
    description: str
    # How to find it from the pavement, not only the street address.
    address: str
    hours: str
    lat: float
    lng: float
    # `None`: it is on the map without having paid.
    plan: Plan | None
    offer: str | None
    offer_timing: OfferTiming
    menu: list[MenuItem] = field(default_factory=list)
    # Digits only, with country code: "573001234567".
    whatsapp: str | None = None
    link: str | None = None
    # False: hidden from the map without deleting it.
    visible: bool = True


def is_service(category: str) -> bool:
    return category in SERVICE_CATEGORIES


def _text(value: object, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _menu(value: object) -> list[MenuItem]:
    if not isinstance(value, Sequence) or isinstance(value, str):
        return []
    menu = []
    for item in list(value)[:MAX_MENU_ITEMS]:
        if not isinstance(item, Mapping):
            continue
        name = _text(item.get("name"), 60)
        if name:
            menu.append(MenuItem(name=name, price=_text(item.get("price"), 24)))
    return menu


def _whatsapp(value: object) -> str | None:
    """Digits only; a 10-digit Colombian mobile gets its country code."""
    digits = re.sub(r"\D", "", _text(value, 24))
    if len(digits) == 10 and digits.startswith("3"):
        return f"57{digits}"
    return digits if 10 <= len(digits) <= 15 else None


def _link(value: object) -> str | None:
    """Only http(s): a `javascript:` here would end up in a link the public taps."""
    text = _text(value, 200)
    if not text:
        return None
    if not re.match(r"^https?://", text, re.IGNORECASE):
        if re.match(r"^[a-z][a-z0-9+.-]*:", text, re.IGNORECASE) and not re.match(
            r"^[^/:]+:\d", text
        ):
            # It names another scheme (javascript:, data:, mailto:).
            return None
        text = f"https://{text}"
    try:
        parts = urlsplit(text)
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        return None
    return text


def _coordinate(value: object, limit: float) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    number = float(value)
    return number if math.isfinite(number) and abs(number) <= limit else None


def clean_business(raw: Mapping[str, Any], business_id: str) -> Business:
    """The business as it is stored, or `BusinessError` with the first problem."""
    name = _text(raw.get("name"), MAX_LENGTH["name"])
    if not name:
        raise BusinessError("Falta el nombre.")

    category = raw.get("category")
    if not isinstance(category, str) or category not in CATEGORIES:
        raise BusinessError("Categoría inválida.")

    lat = _coordinate(raw.get("lat"), 90)
    lng = _coordinate(raw.get("lng"), 180)
    if lat is None or lng is None:
        raise BusinessError("Falta marcar el punto en el mapa.")

    # A service is never advertising. And without a plan there is no offer,
    # menu or contact: that is exactly what is sold.
    plan: Plan | None = None
    if not is_service(category) and raw.get("plan") in PLANS:
        plan = raw["plan"]
    timing: OfferTiming = (
        raw["offer_timing"] if raw.get("offer_timing") in ("before", "after") else "always"
    )

    return Business(
        id=business_id,
        name=name,
        category=category,
        description=_text(raw.get("description"), MAX_LENGTH["description"]),
        address=_text(raw.get("address"), MAX_LENGTH["address"]),
        hours=_text(raw.get("hours"), MAX_LENGTH["hours"]),
        lat=lat,
        lng=lng,
        plan=plan,
        offer=(_text(raw.get("offer"), MAX_LENGTH["offer"]) or None) if plan else None,
        offer_timing=timing if plan else "always",
        menu=_menu(raw.get("menu")) if plan else [],
        whatsapp=_whatsapp(raw.get("whatsapp")) if plan else None,
        link=_link(raw.get("link")) if plan else None,
        visible=raw.get("visible") is not False,
    )
