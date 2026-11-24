from starlette.requests import Request

from app.rate_limits import LoginRateLimit, ip_of


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def request(
    headers: dict[str, str], client: tuple[str, int] | None = ("10.0.0.9", 1234)
) -> Request:
    raw = [(name.lower().encode(), value.encode()) for name, value in headers.items()]
    return Request({"type": "http", "headers": raw, "client": client})


async def test_login_rate_limit_ok() -> None:
    waits: list[float] = []

    async def sleep(seconds: float) -> None:
        waits.append(seconds)

    limit = LoginRateLimit(clock=Clock(), sleep=sleep)

    assert limit.delay("1.1.1.1") == 0
    await limit.wait("1.1.1.1")
    # No failures, no wait: `sleep` is not even called.
    assert waits == []


async def test_login_rate_limit_fails() -> None:
    waits: list[float] = []

    async def sleep(seconds: float) -> None:
        waits.append(seconds)

    limit = LoginRateLimit(clock=Clock(), sleep=sleep)
    for _ in range(3):
        limit.record("1.1.1.1", ok=False)

    await limit.wait("1.1.1.1")

    assert waits == [1.5]
    # Another IP does not pay for it.
    assert limit.delay("2.2.2.2") == 0


def test_login_rate_limit_caps_at_five_seconds() -> None:
    limit = LoginRateLimit(clock=Clock())
    for _ in range(50):
        limit.record("1.1.1.1", ok=False)

    assert limit.delay("1.1.1.1") == 5.0


def test_login_rate_limit_forgets() -> None:
    clock = Clock()
    limit = LoginRateLimit(clock=clock)
    limit.record("1.1.1.1", ok=False)
    limit.record("2.2.2.2", ok=False)

    # A success clears the count...
    limit.record("1.1.1.1", ok=True)
    assert limit.delay("1.1.1.1") == 0

    # ...and so does the window going by; the next failure starts from one.
    clock.now += LoginRateLimit.WINDOW_S + 1
    assert limit.delay("2.2.2.2") == 0
    limit.record("2.2.2.2", ok=False)
    assert limit.delay("2.2.2.2") == 0.5


def test_login_rate_limit_prunes_the_map() -> None:
    clock = Clock()
    limit = LoginRateLimit(clock=clock)
    for n in range(LoginRateLimit.PRUNE_ABOVE):
        limit.record(f"ip-{n}", ok=False)
    clock.now += LoginRateLimit.WINDOW_S + 1

    limit.record("one-more", ok=False)
    limit.record("and-another", ok=False)

    # The expired ones are gone: only the two recent ones remain.
    assert limit.delay("one-more") == 0.5
    assert len(limit._failures) == 2


def test_ip_is_the_last_hop_of_forwarded_for() -> None:
    # The first hop is written by whoever makes the request.
    forged = request({"X-Forwarded-For": "6.6.6.6, 10.1.1.1, 203.0.113.7"})

    assert ip_of(forged) == "203.0.113.7"


def test_ip_prefers_the_platform_header() -> None:
    assert (
        ip_of(request({"X-Real-IP": "203.0.113.7", "X-Forwarded-For": "6.6.6.6"})) == "203.0.113.7"
    )
    # With no headers at all, the address of the connection.
    assert ip_of(request({})) == "10.0.0.9"
    assert ip_of(request({}, client=None)) == "unknown"
