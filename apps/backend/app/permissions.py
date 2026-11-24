"""Who may do what. Endpoints ask for a permission, never for a role.

`PERMISSIONS_BY_ROLE` is the only place that joins the two: adding a role or
moving a permission is changing that table, not hunting for `if`s.
"""

from collections.abc import Iterable
from enum import StrEnum


class Role(StrEnum):
    """The same values the check on `user_roles.role` accepts."""

    ADMIN = "admin"
    COORDINATOR = "coordinator"
    EDITOR = "editor"
    MODERATOR = "moderator"
    REPORTER = "reporter"
    INGEST = "ingest"


class Permission(StrEnum):
    PARADES_STATE = "parades:state"
    PARADES_EDIT = "parades:edit"
    ANNOUNCEMENTS_MANAGE = "announcements:manage"
    USERS_VIEW = "users:view"
    USERS_MANAGE = "users:manage"
    # Send the position of one's own post, on the current parade.
    POSITIONS_OWN = "positions:own"
    # Send positions for any post and parade (coordinators, service accounts).
    POSITIONS_ANY = "positions:any"
    SCHEDULE_EDIT = "schedule:edit"
    BUSINESSES_EDIT = "businesses:edit"
    METRICS_VIEW = "metrics:view"
    PHOTOS_MODERATE = "photos:moderate"


PERMISSIONS_BY_ROLE: dict[Role, frozenset[Permission]] = {
    # Every permission by construction: a new one reaches admin on its own.
    Role.ADMIN: frozenset(Permission),
    Role.COORDINATOR: frozenset(
        {
            Permission.PARADES_STATE,
            Permission.ANNOUNCEMENTS_MANAGE,
            Permission.USERS_VIEW,
            Permission.POSITIONS_ANY,
        }
    ),
    Role.EDITOR: frozenset(
        {
            Permission.PARADES_EDIT,
            Permission.SCHEDULE_EDIT,
            Permission.BUSINESSES_EDIT,
            Permission.METRICS_VIEW,
        }
    ),
    Role.MODERATOR: frozenset({Permission.PHOTOS_MODERATE}),
    Role.REPORTER: frozenset({Permission.POSITIONS_OWN}),
    Role.INGEST: frozenset({Permission.POSITIONS_ANY}),
}


def permissions_for(roles: Iterable[str]) -> set[Permission]:
    """Everything a user with those roles may do.

    Roles come as text, the way the database stores them. One that does not
    exist raises `ValueError`: the database check never lets it in, so it is a
    bug worth seeing.
    """
    permissions: set[Permission] = set()
    for role in roles:
        permissions |= PERMISSIONS_BY_ROLE[Role(role)]
    return permissions
