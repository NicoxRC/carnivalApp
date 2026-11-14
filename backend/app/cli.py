"""Console commands, run by hand by whoever has access to the server.

    python -m app.cli create-admin --email ana@example.com --name "Ana"
    python -m app.cli seed

`seed` loads the course, the parades and the events from `backend/seed/`; it can be run
again at any time.

To create users you need to be an admin, and at the beginning there is none:
this command creates the first one. The password is asked for without showing
it and never travels as an argument, so it does not stay in the shell history.
"""

import argparse
import asyncio
import sys
from collections.abc import Callable, Sequence
from getpass import getpass

from app.db import get_engine, get_session_factory
from app.permissions import Role
from app.repositories.courses import CoursesPostgres
from app.repositories.events import EventsPostgres
from app.repositories.parades import ParadesPostgres
from app.repositories.users import UserAlreadyExists, UsersPostgres, UsersRepo
from app.security import hash_password, validate_password
from app.seed import SeedError, seed


def _fail(message: str) -> int:
    print(f"Error: {message}", file=sys.stderr)
    return 1


async def create_admin(
    repo: UsersRepo,
    *,
    email: str,
    name: str,
    ask: Callable[[str], str] = getpass,
) -> int:
    """Creates a user with the `admin` role. Returns the exit code.

    Everything is checked before touching the repository: on any error
    nothing is created.
    """
    if "@" not in email:
        return _fail("El email no es válido.")
    if not name.strip():
        return _fail("El nombre no puede estar vacío.")

    password = ask("Contraseña: ")
    try:
        validate_password(password)
    except ValueError as error:
        return _fail(str(error))
    if ask("Repetir contraseña: ") != password:
        return _fail("Las contraseñas no coinciden.")

    try:
        user = await repo.create(
            email=email,
            name=name.strip(),
            password_hash=hash_password(password),
            roles=[Role.ADMIN],
        )
    except UserAlreadyExists:
        return _fail("Ya existe un usuario con ese email.")

    print(f"Admin creado: {user.email}")
    return 0


async def _create_admin_in_postgres(email: str, name: str) -> int:
    async with get_session_factory()() as session:
        code = await create_admin(UsersPostgres(session), email=email, name=name)
    await get_engine().dispose()
    return code


async def _seed_postgres() -> int:
    try:
        async with get_session_factory()() as session:
            seeded = await seed(
                CoursesPostgres(session), ParadesPostgres(session), EventsPostgres(session)
            )
    except SeedError as error:
        return _fail(str(error))
    finally:
        await get_engine().dispose()
    print(
        f"Senda cargada: {seeded.course.name} ({seeded.course.id}). "
        f"Desfiles: {seeded.parades}. Eventos: {seeded.events}."
    )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="create a user with the admin role")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", required=True)
    commands.add_parser(
        "seed", help="load the course, the parades and the events from backend/seed/"
    )
    args = parser.parse_args(argv)

    if args.command == "seed":
        return asyncio.run(_seed_postgres())
    try:
        return asyncio.run(_create_admin_in_postgres(args.email, args.name))
    except (EOFError, KeyboardInterrupt):
        # Ctrl-D or Ctrl-C at the password prompt: nothing was created.
        print()
        return _fail("Cancelado.")


if __name__ == "__main__":
    sys.exit(main())
