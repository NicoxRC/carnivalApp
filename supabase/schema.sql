-- =====================================================================
-- Sigue el Desfile — esquema de Supabase
--
-- Pegar en el SQL Editor de Supabase y ejecutar. Es idempotente.
--
-- Cubre Fase 1 y Fase 2. Las tablas de Fase 3 (anunciantes, promociones)
-- están al final, creadas pero sin usar todavía.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- La ruta física del desfile
-- ---------------------------------------------------------------------
create table if not exists sendas (
  id               text primary key,
  nombre           text not null,
  geojson          jsonb not null,
  longitud_metros  numeric not null,
  oficial          boolean not null default false,
  creado_en        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cada día de desfile
-- ---------------------------------------------------------------------
create table if not exists desfiles (
  id           text primary key,
  nombre       text not null,
  fecha        date,
  hora_inicio  time,
  senda_id     text references sendas(id),
  estado       text not null default 'programado'
               check (estado in ('programado','en_curso','finalizado')),
  creado_en    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Los tres reporteros
-- ---------------------------------------------------------------------
create table if not exists reporteros (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users(id) on delete set null,
  nombre    text not null,
  rol       text not null check (rol in ('cabeza','mitad','cola')),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Cada reportero entra al panel con un código que genera el administrador.
-- Se guarda solo el hash. `ultima_senal` es lo que mira el panel de admin para
-- saber quién está mandando y quién se calló.
alter table reporteros add column if not exists codigo_hash text unique;
alter table reporteros add column if not exists ultima_senal timestamptz;

-- ---------------------------------------------------------------------
-- Stream de posiciones — la tabla que más escribe
-- ---------------------------------------------------------------------
create table if not exists posiciones (
  id              bigint generated always as identity primary key,
  desfile_id      text not null references desfiles(id) on delete cascade,
  reportero_id    uuid references reporteros(id) on delete set null,
  -- `rol` va desnormalizado a propósito: la consulta de lectura corre
  -- cada pocos segundos con miles de clientes encima y no puede pagar un join.
  rol             text not null check (rol in ('cabeza','mitad','cola')),
  lat             double precision not null,
  lng             double precision not null,
  -- Se precalcula al insertar. Ninguna lectura debería recalcular geometría.
  metros_en_senda numeric not null,
  precision_m     numeric,
  creado_en       timestamptz not null default now()
);

create index if not exists posiciones_desfile_creado_idx
  on posiciones (desfile_id, creado_en desc);

create index if not exists posiciones_desfile_rol_creado_idx
  on posiciones (desfile_id, rol, creado_en desc);

-- Última posición conocida de cada rol.
-- Nunca se borra un reportero que se calló: su último punto sigue siendo
-- información, y la app lo pinta como "sin señal".
create or replace view ultimas_posiciones as
select distinct on (desfile_id, rol)
  desfile_id, rol, lat, lng, metros_en_senda, precision_m, creado_en
from posiciones
order by desfile_id, rol, creado_en desc;

-- ---------------------------------------------------------------------
-- Gentío (mapa de calor)
--
-- Una fila por dispositivo, no un historial: se sobrescribe en cada reporte.
-- Se guarda el TRAMO de la senda, nunca lat/lng, y el id de dispositivo es un
-- aleatorio del navegador que solo sirve para no contar dos veces a la misma
-- persona. Aun así es dato de ubicación: hay que decírselo al usuario y dejarlo
-- apagar (ver README, "Mapa de gentío").
-- ---------------------------------------------------------------------
create table if not exists presencias (
  desfile_id     text not null references desfiles(id) on delete cascade,
  dispositivo_id text not null,
  bin            integer not null,
  visto_en       timestamptz not null default now(),
  primary key (desfile_id, dispositivo_id)
);

create index if not exists presencias_desfile_visto_idx
  on presencias (desfile_id, visto_en desc);

-- ---------------------------------------------------------------------
-- Comercios del mapa. Los gestiona el panel de administración.
-- Aparecer no depende de pagar: `plan` solo decide si la ficha lleva oferta
-- y el sello de pauta.
-- ---------------------------------------------------------------------
create table if not exists comercios (
  id            text primary key,
  nombre        text not null,
  categoria     text not null,
  descripcion   text,
  direccion     text,
  horario       text,
  lat           double precision not null,
  lng           double precision not null,
  plan          text check (plan in ('basico','destacado')),
  promo         text,
  visible       boolean not null default true,
  actualizado_en timestamptz not null default now()
);

-- Menú, contacto y momento de la oferta: lo que se vende con el plan.
alter table comercios add column if not exists menu jsonb not null default '[]';
alter table comercios add column if not exists whatsapp text;
alter table comercios add column if not exists enlace text;
alter table comercios add column if not exists promo_momento text not null default 'siempre'
  check (promo_momento in ('siempre','antes','despues'));

-- La lista de categorías crece (servicios: baños, agua, salud…): el check se
-- recrea entero para que este archivo se pueda volver a ejecutar.
alter table comercios drop constraint if exists comercios_categoria_check;
alter table comercios add constraint comercios_categoria_check check (categoria in
  ('restaurante','tasca','cafe','heladeria','panaderia','tienda','bar','farmacia',
   'bano','hidratacion','salud','policia','cierre'));

-- Lo que se le cuenta al anunciante: vistas de ficha, toques en WhatsApp…
-- Un contador por comercio, día y tipo; nunca quién lo tocó.
create table if not exists comercio_metricas (
  comercio_id text not null references comercios(id) on delete cascade,
  dia         date not null default current_date,
  tipo        text not null check (tipo in ('ficha','mapa','menu','whatsapp','enlace','oferta')),
  conteo      integer not null default 0,
  primary key (comercio_id, dia, tipo)
);

create or replace function sumar_metrica(p_comercio text, p_tipo text)
returns void language sql as $$
  insert into comercio_metricas (comercio_id, dia, tipo, conteo)
  values (p_comercio, current_date, p_tipo, 1)
  on conflict (comercio_id, dia, tipo) do update set conteo = comercio_metricas.conteo + 1;
$$;

-- ---------------------------------------------------------------------
-- Mensajes del equipo a todos los usuarios
-- ---------------------------------------------------------------------
create table if not exists avisos (
  id        text primary key,
  texto     text not null,
  nivel     text not null default 'info' check (nivel in ('info','alerta')),
  creado_en timestamptz not null default now(),
  expira_en timestamptz
);

-- ---------------------------------------------------------------------
-- Avisos push "el desfile está cerca". Una fila por dispositivo; se borra
-- al avisar. No guarda quién es: solo a dónde mandar y en qué metro espera.
-- ---------------------------------------------------------------------
create table if not exists suscripciones_aviso (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  desfile_id text not null references desfiles(id) on delete cascade,
  metros     numeric not null,
  umbral_min integer not null default 10,
  creado_en  timestamptz not null default now()
);

create index if not exists suscripciones_aviso_desfile_idx on suscripciones_aviso (desfile_id);

-- ---------------------------------------------------------------------
-- Fotos del público (Fase 2). Nada se publica sin aprobación.
-- ---------------------------------------------------------------------
create table if not exists fotos (
  id              uuid primary key default gen_random_uuid(),
  desfile_id      text references desfiles(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  storage_path    text not null,
  lat             double precision,
  lng             double precision,
  metros_en_senda numeric,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','aprobada','rechazada')),
  creado_en       timestamptz not null default now()
);

create index if not exists fotos_estado_creado_idx on fotos (estado, creado_en desc);

-- ---------------------------------------------------------------------
-- Programación del día
-- ---------------------------------------------------------------------
create table if not exists eventos (
  id            text primary key default gen_random_uuid()::text,
  fecha         date not null,
  hora_inicio   time not null,
  hora_fin      time,
  titulo        text not null,
  descripcion   text,
  categoria     text check (categoria in ('tasca','presentacion','cultural','infantil')),
  lugar_nombre  text,
  lat           double precision,
  lng           double precision,
  patrocinado   boolean not null default false,
  anunciante_id uuid,
  creado_en     timestamptz not null default now()
);

create index if not exists eventos_fecha_hora_idx on eventos (fecha, hora_inicio);

-- ---------------------------------------------------------------------
-- Monetización (Fase 3)
-- ---------------------------------------------------------------------
create table if not exists anunciantes (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  logo_path text,
  tipo_plan text,
  creado_en timestamptz not null default now()
);

create table if not exists promociones (
  id             uuid primary key default gen_random_uuid(),
  anunciante_id  uuid references anunciantes(id) on delete cascade,
  titulo         text not null,
  descripcion    text,
  lat            double precision,
  lng            double precision,
  radio_metros   integer not null default 300,
  vigente_desde  timestamptz,
  vigente_hasta  timestamptz,
  impresiones    integer not null default 0,
  clics          integer not null default 0,
  creado_en      timestamptz not null default now()
);

alter table eventos
  drop constraint if exists eventos_anunciante_id_fkey;
alter table eventos
  add constraint eventos_anunciante_id_fkey
  foreign key (anunciante_id) references anunciantes(id) on delete set null;

-- =====================================================================
-- Realtime
-- =====================================================================
-- `add table` falla si la tabla ya está en la publicación; se atrapa para que
-- este archivo se pueda ejecutar más de una vez.
do $$
begin
  alter publication supabase_realtime add table posiciones;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table avisos;
exception when duplicate_object then null;
end $$;

-- Bucket de fotos. Privado: las fotos se sirven por /api/fotos/[id], que solo
-- entrega las aprobadas (o cualquiera, a un administrador).
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

-- =====================================================================
-- RLS
--
-- Criterio: la posición del desfile es información pública — se lee sin
-- login. Escribir es otra cosa: solo el backend (service_role) inserta.
-- En Fase 2, cuando el reportero mande GPS desde su celular, se cambia
-- la política de INSERT por una que valide auth.uid() contra `reporteros`.
-- =====================================================================
alter table sendas     enable row level security;
alter table desfiles   enable row level security;
alter table posiciones enable row level security;
alter table eventos    enable row level security;
alter table fotos      enable row level security;
alter table presencias enable row level security;
alter table comercios  enable row level security;
alter table reporteros enable row level security;
alter table avisos              enable row level security;
alter table comercio_metricas   enable row level security;
alter table suscripciones_aviso enable row level security;

drop policy if exists "lectura publica sendas" on sendas;
create policy "lectura publica sendas" on sendas for select using (true);

drop policy if exists "lectura publica desfiles" on desfiles;
create policy "lectura publica desfiles" on desfiles for select using (true);

drop policy if exists "lectura publica posiciones" on posiciones;
create policy "lectura publica posiciones" on posiciones for select using (true);

drop policy if exists "lectura publica eventos" on eventos;
create policy "lectura publica eventos" on eventos for select using (true);

-- Solo se ven las fotos ya moderadas. El contenido inapropiado bajo el nombre
-- del Carnaval es un problema reputacional, no un detalle de producto.
drop policy if exists "lectura fotos aprobadas" on fotos;
create policy "lectura fotos aprobadas" on fotos for select using (estado = 'aprobada');

-- Los comercios ocultos desde el panel no los ve el público.
drop policy if exists "lectura comercios visibles" on comercios;
create policy "lectura comercios visibles" on comercios for select using (visible);

-- Los avisos son públicos (y Realtime los necesita legibles).
drop policy if exists "lectura publica avisos" on avisos;
create policy "lectura publica avisos" on avisos for select using (true);

-- `comercio_metricas` y `suscripciones_aviso` no llevan policy: solo el servidor.

-- `reporteros` no lleva policy: sus nombres y el hash del código solo los lee
-- el servidor (service_role).

-- `presencias` no lleva ninguna policy, ni de lectura: las filas crudas no las
-- ve nadie desde el cliente. El agregado sale por /api/densidad, que corre en el
-- servidor. Que la tabla exista no debe permitir reconstruir por dónde anduvo
-- un dispositivo.

-- Nota: no se define ninguna policy de INSERT. Sin policy, ningún cliente
-- anónimo puede escribir; el service_role las salta por diseño.

-- =====================================================================
-- Semilla mínima para que el demo tenga con qué arrancar.
-- La senda real se carga pegando el GeoJSON oficial en la tabla `sendas`.
-- =====================================================================
insert into desfiles (id, nombre, fecha, hora_inicio, estado)
values ('demo', 'Desfile Magno (demo)', current_date, '09:00', 'programado')
on conflict (id) do nothing;
-- Los desfiles reales de cada día se crean desde /admin, pestaña Programación.
