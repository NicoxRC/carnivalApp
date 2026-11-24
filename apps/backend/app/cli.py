"""Console commands, run by hand by whoever has access to the server.

    python -m app.cli create-admin --email ana@example.com --name "Ana"
    python -m app.cli seed
    python -m app.cli seed --dev

`seed` loads the sample data of `apps/backend/seed/` (course, parades, events and
businesses); it can be run again at any time. With `--dev`, and only with
`ENVIRONMENT=dev`, it also leaves ready the simulator's service account
(`SIMULATOR_EMAIL`), so `npm run simular` works locally without flags.

To create users you need to be an admin, and at the beginning there is none:
this command creates the first one. The password is asked for without showing
it and never travels as an argument, so it does not stay in the shell history.
"""

import argparse
import asyncio
import sys
from collections.abc import Callable, Sequence
from getpass import getpass

from app.config import get_settings
from app.db import get_engine, get_session_factory
from app.permissions import Role
from app.repositories.businesses import BusinessesPostgres
from app.repositories.courses import CoursesPostgres
from app.repositories.events import EventsPostgres
from app.repositories.parades import ParadesPostgres
from app.repositories.users import UserAlreadyExists, UsersPostgres, UsersRepo
from app.security import hash_password, validate_password
from app.seed import SeedError, seed

# The simulator's service account in development. The password is not a
# secret: the account only exists on a local database with ENVIRONMENT=dev, and
# `npm run simular` uses these same values by default against localhost.
SIMULATOR_EMAIL = "simulator@local"
SIMULATOR_PASSWORD = "simulator-dev-only"


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


async def ensure_simulator(repo: UsersRepo, *, environment: str) -> int:
    """Leaves the simulator's `ingest` account ready. Returns the exit code.

    Run again, it puts it back as it should be (password, role, active)
    instead of failing because it exists. Outside development it refuses and
    touches nothing: this account must never exist in production.
    """
    if environment != "dev":
        return _fail("El usuario del simulador solo se crea con ENVIRONMENT=dev.")

    password_hash = hash_password(SIMULATOR_PASSWORD)
    user = await repo.by_email(SIMULATOR_EMAIL)
    if user is None:
        await repo.create(
            email=SIMULATOR_EMAIL,
            name="Simulador",
            password_hash=password_hash,
            roles=[Role.INGEST],
        )
    else:
        await repo.update(user.id, {"password_hash": password_hash, "active": True})
        await repo.set_roles(user.id, [Role.INGEST])
    print(f"Simulador listo: {SIMULATOR_EMAIL} (rol ingest). `npm run simular` ya puede entrar.")
    return 0


async def _create_admin_in_postgres(email: str, name: str) -> int:
    async with get_session_factory()() as session:
        code = await create_admin(UsersPostgres(session), email=email, name=name)
    await get_engine().dispose()
    return code


async def _seed_postgres(*, dev: bool) -> int:
    environment = get_settings().environment
    # Checked before loading anything: `--dev` outside dev changes nothing.
    if dev and environment != "dev":
        return _fail("El usuario del simulador solo se crea con ENVIRONMENT=dev.")
    try:
        async with get_session_factory()() as session:
            seeded = await seed(
                CoursesPostgres(session),
                ParadesPostgres(session),
                EventsPostgres(session),
                BusinessesPostgres(session),
            )
            print(
                f"Senda cargada: {seeded.course.name} ({seeded.course.id}). "
                f"Desfiles: {seeded.parades}. Eventos: {seeded.events}. "
                f"Comercios: {seeded.businesses}."
            )
            if dev:
                return await ensure_simulator(UsersPostgres(session), environment=environment)
    except SeedError as error:
        return _fail(str(error))
    finally:
        await get_engine().dispose()
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="create a user with the admin role")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", required=True)
    seed_parser = commands.add_parser("seed", help="load the sample data of apps/backend/seed/")
    seed_parser.add_argument(
        "--dev",
        action="store_true",
        help="also create the simulator's ingest user (only with ENVIRONMENT=dev)",
    )
    args = parser.parse_args(argv)

    if args.command == "seed":
        return asyncio.run(_seed_postgres(dev=args.dev))
    try:
        return asyncio.run(_create_admin_in_postgres(args.email, args.name))
    except (EOFError, KeyboardInterrupt):
        # Ctrl-D or Ctrl-C at the password prompt: nothing was created.
        print()
        return _fail("Cancelado.")


if __name__ == "__main__":
    sys.exit(main())
