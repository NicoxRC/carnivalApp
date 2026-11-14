from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.domain.dates import is_real_date, normalize_time, today_in_pasto
from app.domain.parades import Parade, ParadeState, current_parade
from app.repositories.parades import ParadeList, ParadesMemory, resolve_parade


def parade(
    id: str, date: str, state: ParadeState = "scheduled", start_time: str = "10:00"
) -> Parade:
    return Parade(
        id=id,
        name=id,
        date=date,
        start_time=start_time,
        state=state,
        course_id="c",
        run_started_at=datetime.now(UTC),
    )


CARNIVAL = [
    parade("d3", "2027-01-03"),
    parade("d2", "2027-01-02"),
    parade("d4", "2027-01-04"),
]


def test_current_parade_ok() -> None:
    parades = [*CARNIVAL, parade("live", "2027-01-06", "in_progress")]

    # The one in progress wins, whatever the date.
    current = current_parade(parades, "2027-01-03")

    assert current is not None
    assert current.id == "live"


def test_current_parade_fails() -> None:
    assert current_parade([], "2027-01-03") is None


def test_current_parade_follows_the_rule() -> None:
    def current(parades: list[Parade], today: str) -> str:
        found = current_parade(parades, today)
        assert found is not None
        return found.id

    # Today's, if it is still to happen.
    assert current(CARNIVAL, "2027-01-03") == "d3"
    # Otherwise the next one.
    assert current(CARNIVAL, "2026-12-20") == "d2"
    finished_today = [
        parade("d2", "2027-01-02"),
        parade("d3", "2027-01-03", "finished"),
        CARNIVAL[2],
    ]
    assert current(finished_today, "2027-01-03") == "d4"
    # After the last one: how it ended.
    over = [parade(p.id, p.date, "finished") for p in CARNIVAL]
    assert current(over, "2027-02-01") == "d4"
    # Two in progress: the most recent.
    two = [parade("a", "2027-01-02", "in_progress"), parade("b", "2027-01-03", "in_progress")]
    assert current(two, "2027-01-03") == "b"
    # Two on the same day: the earlier one first.
    same_day = [
        parade("late", "2027-01-03", start_time="18:00"),
        parade("early", "2027-01-03", start_time="09:00"),
    ]
    assert current(same_day, "2027-01-03") == "early"


def test_today_in_pasto_at_8_pm_is_still_today() -> None:
    # 01:00 UTC of January 4 is 8 p.m. of January 3 in Pasto.
    assert today_in_pasto(datetime(2027, 1, 4, 1, 0, tzinfo=UTC)) == "2027-01-03"
    assert today_in_pasto(datetime(2027, 1, 4, 5, 0, tzinfo=UTC)) == "2027-01-04"
    # Whatever zone the moment comes in.
    tokyo = timezone(timedelta(hours=9))
    assert today_in_pasto(datetime(2027, 1, 4, 10, 0, tzinfo=tokyo)) == "2027-01-03"
    with pytest.raises(ValueError):
        today_in_pasto(datetime(2027, 1, 4, 1, 0))


def test_normalize_time_and_dates() -> None:
    assert normalize_time("9:00") == "09:00"
    assert normalize_time("16:30") == "16:30"
    assert is_real_date("2027-01-06")
    assert not is_real_date("2027-02-31")
    assert not is_real_date("6 de enero")


async def test_resolve_parade_ok() -> None:
    repo = ParadesMemory()
    await repo.save(id="d2", name="Colonias", date="2999-01-02", start_time="09:00", course_id="c")
    await repo.save(
        id="d3", name="Carnavalito", date="2999-01-03", start_time="10:00", course_id="c"
    )
    parade_list = ParadeList()

    by_id = await resolve_parade(repo, parade_list, "d3")
    current = await resolve_parade(repo, parade_list)

    assert by_id is not None and by_id.id == "d3"
    # No id: the current one, here the next one scheduled.
    assert current is not None and current.id == "d2"


async def test_resolve_parade_fails() -> None:
    repo = ParadesMemory()
    await repo.save(id="d2", name="Colonias", date="2999-01-02", start_time="09:00", course_id="c")

    # An id that does not exist is not created by asking for it.
    assert await resolve_parade(repo, ParadeList(), "nope") is None
    assert await repo.by_id("nope") is None


async def test_parade_list_is_remembered_for_two_seconds() -> None:
    now = [100.0]
    repo = ParadesMemory()
    parade_list = ParadeList(clock=lambda: now[0])
    assert await parade_list.get(repo) == []

    await repo.save(id="d2", name="Colonias", date="2999-01-02", start_time="09:00", course_id="c")

    assert await parade_list.get(repo) == []
    now[0] += 2.1
    assert [p.id for p in await parade_list.get(repo)] == ["d2"]
    # `forget` does not wait for the 2 s.
    await repo.delete("d2")
    parade_list.forget()
    assert await parade_list.get(repo) == []
