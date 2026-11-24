import re

import pytest
from sqlalchemy import CheckConstraint

from app.models import UserRole
from app.permissions import PERMISSIONS_BY_ROLE, Permission, Role, permissions_for


def test_permissions_for_ok() -> None:
    permissions = permissions_for(["editor", "moderator"])

    assert permissions == PERMISSIONS_BY_ROLE[Role.EDITOR] | PERMISSIONS_BY_ROLE[Role.MODERATOR]
    assert Permission.PHOTOS_MODERATE in permissions
    assert Permission.SCHEDULE_EDIT in permissions


def test_permissions_for_fails() -> None:
    assert Permission.PARADES_STATE not in permissions_for(["reporter"])
    assert permissions_for([]) == set()


def test_admin_has_every_permission() -> None:
    permissions = permissions_for(["admin"])

    # Walks the enum: whoever adds a permission gets it checked here for free.
    for permission in Permission:
        assert permission in permissions


def test_unknown_role_fails() -> None:
    with pytest.raises(ValueError):
        permissions_for(["emperor"])


def test_every_role_has_permissions() -> None:
    assert set(PERMISSIONS_BY_ROLE) == set(Role)


def test_roles_match_the_database_check() -> None:
    # The list of roles is written twice: here and in the check on `user_roles`.
    check = next(
        c
        for c in UserRole.__table__.constraints
        if isinstance(c, CheckConstraint) and str(c.name).endswith("role_valid")
    )

    assert set(re.findall(r"'(\w+)'", str(check.sqltext))) == {role.value for role in Role}
