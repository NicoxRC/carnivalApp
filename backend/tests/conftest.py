import os

# La app lee su configuración al importarse. Los tests usan siempre estos
# valores, nunca los del entorno de quien los corre.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://prueba:prueba@localhost:5432/prueba"
os.environ["JWT_SECRETO"] = "secreto-de-prueba-solo-para-los-tests"
