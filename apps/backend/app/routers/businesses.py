"""Businesses and services: what the public sees and what the panel edits."""

import logging
import re
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Response, status

from app.domain.businesses import (
    METRIC_TYPES,
    Business,
    BusinessError,
    OfferTiming,
    Plan,
    clean_business,
)
from app.permissions import Permission, permissions_for
from app.repositories.businesses import BusinessesRepoDep, BusinessNotFound, Metrics
from app.repositories.users import User
from app.schemas import Schema
from app.security import require

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["businesses"])

IS_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
Editor = Annotated[User, require(Permission.BUSINESSES_EDIT)]


class MenuItemOut(Schema):
    name: str
    price: str


class BusinessOut(Schema):
    """Web: `Comercio`."""

    id: str
    name: str
    category: str
    description: str
    address: str
    hours: str
    lat: float
    lng: float
    plan: Plan | None
    offer: str | None
    offer_timing: OfferTiming
    menu: list[MenuItemOut]
    whatsapp: str | None
    link: str | None
    visible: bool


class Businesses(Schema):
    businesses: list[BusinessOut]


class AdminBusinesses(Schema):
    businesses: list[BusinessOut]
    # Business id → type → count. Empty without `metrics:view`.
    metrics: Metrics


class BusinessBody(Schema):
    """Cleaned by `clean_business`, which answers with the panel's own messages."""

    name: str = ""
    category: str = ""
    description: str = ""
    address: str = ""
    hours: str = ""
    lat: float | None = None
    lng: float | None = None
    plan: str | None = None
    offer: str | None = None
    offer_timing: str | None = None
    menu: list[Any] = []
    whatsapp: str | None = None
    link: str | None = None
    visible: bool = True


class MetricBody(Schema):
    id: str = ""
    type: str = ""


class Ok(Schema):
    ok: bool = True


def business_out(business: Business) -> BusinessOut:
    return BusinessOut(
        id=business.id,
        name=business.name,
        category=business.category,
        description=business.description,
        address=business.address,
        hours=business.hours,
        lat=business.lat,
        lng=business.lng,
        plan=business.plan,
        offer=business.offer,
        offer_timing=business.offer_timing,
        menu=[MenuItemOut(name=item.name, price=item.price) for item in business.menu],
        whatsapp=business.whatsapp,
        link=business.link,
        visible=business.visible,
    )


@router.get("/businesses")
async def list_businesses(businesses: BusinessesRepoDep, response: Response) -> Businesses:
    """The ones the public sees: only the visible ones.

    They change little, so they may be cached for a minute; the service worker
    keeps the last copy so the layer works without network.
    """
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=600"
    return Businesses(businesses=[business_out(b) for b in await businesses.list() if b.visible])


@router.post("/businesses/event")
async def count_interaction(body: MetricBody, businesses: BusinessesRepoDep) -> Ok:
    """Counts an interaction with a business: its card was opened, WhatsApp tapped…

    It is what the advertiser is shown. Only a counter goes up: who it was or
    from where is not stored.
    """
    if not body.id or len(body.id) > 64 or body.type not in METRIC_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datos inválidos.")
    try:
        await businesses.add_metric(body.id, body.type)
    except Exception:
        # A counter that fails is not the problem of whoever is looking at the map.
        log.exception("Could not count the interaction with business %s", body.id)
    return Ok()


@router.get("/admin/businesses", tags=["admin: businesses"])
async def list_all_businesses(
    user: Editor, businesses: BusinessesRepoDep, response: Response
) -> AdminBusinesses:
    """Every business, hidden ones included, with its counters."""
    may_see_metrics = Permission.METRICS_VIEW in permissions_for(user.roles)
    response.headers["Cache-Control"] = "no-store"
    return AdminBusinesses(
        businesses=[business_out(b) for b in await businesses.list()],
        metrics=await businesses.metrics() if may_see_metrics else {},
    )


@router.put("/admin/businesses/{business_id}", tags=["admin: businesses"])
async def save_business(
    business_id: str, body: BusinessBody, _: Editor, businesses: BusinessesRepoDep
) -> BusinessOut:
    """Creates the business with that id or replaces it."""
    if not IS_ID.match(business_id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "El id solo puede llevar minúsculas, números y guiones."
        )
    try:
        business = clean_business(body.model_dump(), business_id)
    except BusinessError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
    await businesses.save(business)
    return business_out(business)


@router.delete(
    "/admin/businesses/{business_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["admin: businesses"],
)
async def delete_business(business_id: str, _: Editor, businesses: BusinessesRepoDep) -> None:
    try:
        await businesses.delete(business_id)
    except BusinessNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe ese comercio.") from error
