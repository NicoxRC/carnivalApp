# Secretos

Los secretos del backend viven aquí, **cifrados** con [sops](https://github.com/getsops/sops)
y [age](https://github.com/FiloSottile/age). Los nombres de las variables se leen; los
valores no. Por eso estos archivos sí se suben al repo.

| Archivo | Para qué |
|---|---|
| `dev.enc.yaml` | Desarrollo en local |
| `prod.enc.yaml` | Producción (Railway) |

Nada entra a esta carpeta en texto plano: el hook `sops-cifrado` de pre-commit rechaza el
commit de cualquier archivo que no esté cifrado (menos este README).

## Cómo funciona

- **age** usa un par de llaves. La **pública** (`age1…`) solo cifra y está escrita en
  `.sops.yaml`. La **privada** (`AGE-SECRET-KEY-…`) es la única que descifra: vive en
  `~/.config/sops/age/keys.txt` de quien tenga acceso y nunca entra al repo.
- **sops** cifra cada valor del YAML para las llaves públicas de `.sops.yaml` y lo descifra
  con la privada que encuentre en tu máquina.

Todos los comandos se corren desde la raíz del repo, dentro del entorno de Nix
(`nix develop` o direnv).

## Día a día

```bash
# Arrancar el backend con los secretos de desarrollo
sops exec-env secrets/dev.enc.yaml 'cd backend && uv run fastapi dev'

# Editar: abre el archivo descifrado en $EDITOR y lo vuelve a cifrar al guardar
sops secrets/dev.enc.yaml

# Ver los valores en la terminal
sops -d secrets/dev.enc.yaml
```

`sops exec-env` descifra en memoria, pasa cada valor como variable de entorno al comando y
no deja nada en disco. La app las lee en `backend/app/config.py`.

Los tests no usan estos archivos: tienen valores fijos en `backend/tests/conftest.py`.

## Variables

Los nombres van en mayúsculas, tal como los lee la app.

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | sí | Conexión a Postgres (`postgresql+asyncpg://usuario:clave@host:5432/base`) |
| `JWT_SECRETO` | sí | Firma de las sesiones. Mínimo 32 caracteres; uno distinto por entorno |
| `JWT_HORAS` | no (20) | Cuánto dura una sesión |
| `CORS_ORIGENES` | no (`http://localhost:3000`) | Orígenes de la web que pueden llamar a la API, separados por comas |
| `ENTORNO` | no (`dev`) | `dev` o `prod` |
| `VAPID_PUBLICA`, `VAPID_PRIVADA`, `VAPID_CONTACTO` | no | Avisos push. Sin ellas la función se apaga sola |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_LLAVE`, `S3_SECRETO` | no | Fotos en S3. Sin bucket se guardan en disco |

Para generar un `JWT_SECRETO` nuevo: `openssl rand -hex 32`.

## Tener acceso por primera vez

1. Genera tu llave (una vez por persona):

   ```bash
   mkdir -p ~/.config/sops/age
   age-keygen -o ~/.config/sops/age/keys.txt
   ```

   Imprime `Public key: age1…`. Guarda una copia de `keys.txt` en tu gestor de
   contraseñas.
2. Pásale la **pública** a alguien que ya tenga acceso. Esa persona la agrega a
   `.sops.yaml` (varias llaves van separadas por comas en `age:`) y vuelve a cifrar:

   ```bash
   sops updatekeys secrets/dev.enc.yaml
   sops updatekeys secrets/prod.enc.yaml
   ```

3. Con ese cambio en `trunk`, `sops -d secrets/dev.enc.yaml` ya te funciona.

## Si algo sale mal

- **`no identity matched any of the recipients`**: tu llave privada no es una de las que
  cifraron el archivo. Revisa que `~/.config/sops/age/keys.txt` exista y que tu pública
  esté en `.sops.yaml`.
- **Se perdió la única llave privada**: los archivos no se pueden recuperar. Hay que
  generar una llave nueva, crear los archivos otra vez y **cambiar todos los secretos**
  (en producción, también en los servicios que los usan).
- **Se filtró una llave privada, o alguien deja el equipo**: quita su pública de
  `.sops.yaml`, corre `sops updatekeys` en cada archivo y **cambia los secretos**: quien
  tuvo la llave pudo haberlos leído, y el historial de git conserva las versiones viejas.
