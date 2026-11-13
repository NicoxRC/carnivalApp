import os

# The app reads its settings on import. Tests always use these values, never
# the environment of whoever runs them.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@localhost:5432/test"
os.environ["JWT_SECRET"] = "test-secret-only-for-the-test-suite"
