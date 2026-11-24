# Rentique

Marketplace de renta de ropa entre personas. Quien renta explora por tema, ve disponibilidad, precio, reglas y lender. Quien presta mantiene su catalogo y ve estadisticas de uso, clientes y tiempos.

Stack: **Node 22 + Express**, **PostgreSQL 16**, frontend sin build (HTML/CSS/JS en `public/`). Dos servicios en Docker: `app` y `db`.

## Arrancar

```bash
cp .env.example .env        # cambia POSTGRES_PASSWORD
docker compose up -d --build
```

Abre http://localhost:3000. La primera vez, con la base vacia, se cargan los datos de ejemplo.

## Usuarios de ejemplo (datos falsos)

| Rol | Email | Password |
|---|---|---|
| Renter | `alex@demo.rentique` | `demo1234` |
| Lender | `mika@demo.rentique` | `demo1234` |
| Super admin | `admin@demo.rentique` | `demo1234` |

Tambien hay botones de acceso en un clic ("Demo renter", "Demo lender" y "Super admin") en la ventana de login y en la pantalla **Lend**.

- **Mika** tiene 9 prendas, ~90 dias de historial, solicitudes pendientes y todas las estadisticas.
- **Alex** tiene 5 rentas (completadas, confirmada y pendiente) y 4 prendas guardadas. Su solicitud pendiente aparece en la bandeja de Mika.
- **Super Admin** ve todo: cola de revision con 3 piezas pendientes y 1 rechazada, 21 usuarios, 6 lenders y 10 conversaciones.
- Hay otros 4 lenders y 14 renters falsos que **no pueden iniciar sesion**; solo dan contenido al catalogo y a las estadisticas.

Las fechas del seed se generan relativas al dia en que se crea la base. Para regenerarlas (borra todo):

```bash
docker compose exec app npm run seed:reset
```

## Super admin y moderacion

El rol `admin` tiene su propia vista en `#admin` (aparece como "Admin" en el menu, con un contador de piezas pendientes).

**Cola de aprobacion.** Toda pieza nueva entra en estado `pending` y **no es visible para nadie** (ni sus fotos) salvo su dueno y el super admin, hasta que se aprueba. El admin ve fotos a tamano completo, precio, deposito, tallas, reglas, descripcion y datos del lender, y decide:

- **Aprobar:** la pieza se publica.
- **Rechazar:** el motivo es obligatorio. El lender lo ve en su catalogo, corrige la pieza y la reenvia con "Edit and resubmit" (vuelve a la cola).

Reglas:

- Quitar una pieza no requiere aprobacion (lender o admin, siempre).
- Cambiar el precio, pausar o reanudar una pieza ya aprobada es inmediato.
- Cambiar las **fotos** de una pieza ya aprobada la devuelve a la cola hasta que se aprueben (si no, bastaria con aprobar una foto buena y luego cambiarla).
- Una pieza aprobada no se puede editar por completo: se quita y se crea una nueva.

**Resto de la vista admin:**

- **Users:** todas las cuentas (renters y lenders) con correo, fecha de alta, rentas, piezas y estado. Al abrir una cuenta se ven sus rentas, sus piezas y sus conversaciones. Se puede **suspender** y reactivar (la suspension cierra sus sesiones, bloquea el login y oculta sus piezas). No se puede suspender a un admin.
- **Lenders:** cada closet con ingresos, rentas, piezas activas y en revision.
- **Pieces:** todas las piezas en cualquier estado, con filtros y boton para retirar cualquiera.
- **Conversations:** todas las conversaciones, en solo lectura.

**Como se crea el super admin.** Define `ADMIN_EMAIL` y `ADMIN_PASSWORD` (8+ caracteres): al arrancar se crea esa cuenta, o se promueve si el correo ya existe. Con `ADMIN_EMAIL` definido **no** se crea el admin demo. Sin `ADMIN_EMAIL` y con `SEED_DEMO=true` existe `admin@demo.rentique`.

> **Importante para produccion:** el admin demo tiene una contrasena publica. En un despliegue real usa `ADMIN_EMAIL` + `ADMIN_PASSWORD` (o `SEED_DEMO=false`) para que ese acceso no exista.

## Mensajes

- Al pedir una renta, el renter puede dejar un mensaje al lender. Cada renta abre (o reutiliza) la conversacion entre esa pareja renter-lender.
- Hay **una conversacion por pareja**: si el mismo renter vuelve a rentarle al mismo lender, el chat continua y se ven los mensajes anteriores, agrupados por renta.
- Cada mensaje queda ligado a una renta (se elige en un selector cuando hay varias). Hay indicador de no leidos y se actualiza solo cada pocos segundos.
- Solo participan el renter y el lender. El super admin puede leer todas las conversaciones pero no escribir en ellas.
- El acceso se comprueba en el servidor: abrir una conversacion ajena responde "no existe".

## Que esta habilitado

- Registro, login y logout reales. Passwords con scrypt, sesiones en cookie `HttpOnly` guardadas (hasheadas) en la base, 30 dias.
- Catalogo por tema, filtros por talla, precio y fechas libres, busqueda y orden.
- Pagina de prenda con calendario de disponibilidad, precio, deposito, reglas y perfil del lender.
- Reservas con validacion en el servidor: sin solapes (con lock por prenda, probado con 5 peticiones simultaneas), limites de dias del lender, no se puede rentar la propia prenda.
- Flujo de estados: pendiente, confirmada, rechazada, cancelada, completada. El lender aprueba o rechaza; el renter cancela. Las solicitudes sin respuesta expiran cuando pasa la fecha de inicio.
- Estudio del lender: alta de prendas con hasta 3 fotos reales, editar precio, pausar, eliminar, editar nombre del closet, bandeja de solicitudes y estadisticas (ingresos, utilizacion, renters recurrentes, mapa de ocupacion, mejores prendas, mejores clientes, duracion de rentas).
- Guardados (favoritos) por usuario.
- Tema claro y oscuro.

## Variables de entorno

| Variable | Default | Para que |
|---|---|---|
| `DATABASE_URL` | `postgres://rentique:rentique@localhost:5432/rentique` | Conexion a Postgres |
| `DATABASE_SSL` | `false` | `true` si tu Postgres administrado exige SSL |
| `PORT` | `3000` | Puerto de la app |
| `SEED_DEMO` | `true` | Cargar datos de ejemplo si la base esta vacia. `false` para un marketplace vacio |
| `DEMO_LOGIN` | `true` | Mostrar los botones de acceso demo. `false` los apaga |
| `DEMO_PASSWORD` | `demo1234` | Password de Alex y Mika (se aplica al crear el seed) |
| `TRUST_PROXY` | `1` | Cantidad de proxies delante de la app (necesario para cookies `Secure` e IP real) |
| `ADMIN_EMAIL` | vacio | Correo del super admin (se crea o se promueve al arrancar) |
| `ADMIN_PASSWORD` | vacio | Contrasena inicial del super admin (8+ caracteres, solo al crearlo) |
| `POSTGRES_PASSWORD` | `rentique` | Solo para `docker-compose.yml` |

## Subirlo a un hosting

**VPS (Hetzner, DigitalOcean, etc.)** con Docker instalado:

1. Copia el proyecto, crea `.env` con un `POSTGRES_PASSWORD` fuerte.
2. `docker compose up -d --build`
3. Pon HTTPS delante. Lo mas simple es Caddy en el host:

   ```
   tu-dominio.com {
       reverse_proxy localhost:3000
   }
   ```

   Si usas HTTPS, la cookie de sesion se marca `Secure` automaticamente (`TRUST_PROXY=1`).

**Railway, Render, Fly.io u otro PaaS:** crea un servicio desde este repo (usa el `Dockerfile`) y una base Postgres administrada. Define `DATABASE_URL` con la URL que te da el proveedor, `DATABASE_SSL=true` si lo pide, y `PORT` si el proveedor lo exige. Las tablas se crean solas al arrancar.

**Antes de abrirlo al publico**, define `ADMIN_EMAIL` y `ADMIN_PASSWORD` para tener un super admin real. Para los usuarios demo: o dejas `DEMO_LOGIN=true` como vitrina, o pones `DEMO_LOGIN=false` y cambias `DEMO_PASSWORD`. Con `SEED_DEMO=false` arrancas sin datos falsos.

**Si ya tenias una base con la version anterior**, al arrancar se migra sola: las piezas existentes quedan como aprobadas y se crean las tablas de chat. Los datos de ejemplo nuevos (cola, conversaciones) solo aparecen en una base nueva o tras `npm run seed:reset`.

## Backups

```bash
docker compose exec db pg_dump -U rentique rentique > backup.sql
```

Todo esta en Postgres (incluidas las fotos), asi que el volumen `pgdata` es lo unico que hay que respaldar.

## Estructura

```
src/server.js   API REST, sesiones, moderacion, chat, admin, headers de seguridad
src/db.js       Conexion y esquema (se crea solo al arrancar)
src/seed.js     Datos de ejemplo
src/auth.js     Hash de passwords y tokens
public/         Frontend (index.html, styles.css, app.js, messages.js, admin.js)
```

## Limites actuales

- **No hay pagos reales ni correos.** El "Pay now" y el deposito son informativos. Integrar Stripe y un servicio de email es el siguiente paso natural.
- Las prendas de ejemplo usan ilustraciones, no fotos. Los lenders suben fotos reales (JPEG, PNG o WebP, hasta 2.5 MB cada una); se guardan en Postgres. Con un catalogo grande conviene moverlas a almacenamiento de objetos (S3 o similar).
- `/api/bootstrap` envia el catalogo completo en una llamada. Funciona bien con cientos de prendas; para miles hay que paginar.
- Sin recuperacion de password ni verificacion de email.
- El chat actualiza cada 8 segundos (polling), no en tiempo real, y no hay notificaciones por correo ni push.
- La moderacion es manual: no hay revision automatica de imagenes. El admin no puede eliminar cuentas, solo suspenderlas.
- El frontend esta en ingles.

## Seguridad incluida

Passwords con scrypt y sal; sesiones aleatorias guardadas solo como hash; cookie `HttpOnly` + `SameSite=Lax`; cabecera obligatoria `X-Requested-With` en toda peticion que modifica datos (defensa CSRF); limite de intentos en login y registro; CSP estricta (`script-src 'self'`); validacion de tipo real de imagen por firma; todas las consultas parametrizadas; permisos comprobados en el servidor para cada accion (solo el dueno edita su prenda, solo el lender aprueba, solo el renter cancela lo suyo); los datos de clientes solo los ven el lender y el propio cliente.
