# Secret Bite · plataforma de votación

Aplicación full stack para votar por la hamburguesa del próximo mes y gestionar pedidos. Incluye SPA responsive en React Hooks, API REST en Express, autenticación JWT, roles `CLIENT`/`CHEF`/`ADMIN`, catálogo, campañas, voto único, comandas de cocina y auditoría administrativa.

Los prototipos HTML y notas originales se mantienen intactos en la raíz como referencia visual. El alcance no incluye pagos en línea, puntos ni WhatsApp.

## Requisitos

- Node.js 22.5 o superior (se usa `node:sqlite`).
- pnpm 10 o superior.

## Inicio rápido

```bash
corepack pnpm install
corepack pnpm seed
corepack pnpm dev
```

Abrir `http://localhost:5173`. La API queda en `http://localhost:3001/api`.

Credenciales demo:

- Administrador: `admin@secretbite.co` / `Admin123!`
- Cliente: `cliente@secretbite.co` / `Cliente123!`
- Chef: `chef@secretbite.co` / `Chef123!`

Para producción:

```bash
corepack pnpm build
corepack pnpm start
```

Express sirve `dist/` cuando existe. Las variables disponibles están documentadas en `.env.example`; el proyecto carga `.env` sin dependencia adicional.

## Scripts

- `pnpm dev`: API y Vite en paralelo.
- `pnpm seed`: recrea/actualiza los datos demo de forma idempotente.
- `pnpm test`: pruebas de voto único, cierre temporal y autorización.
- `pnpm build`: compilación del cliente.
- `pnpm start`: API y SPA compilada.

## API principal

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/burgers`, `POST|PUT|DELETE /api/burgers/:id` (admin)
- `GET /api/campaigns`, `GET /api/campaigns/active`
- `POST /api/campaigns`, `PUT /api/campaigns/:id` y `POST /api/campaigns/:id/close` (admin)
- `POST /api/campaigns/:id/votes` (cliente autenticado)
- `POST /api/orders`, `GET /api/orders/mine` (cliente)
- `GET /api/kitchen/orders`, `PUT /api/kitchen/orders/:id/status` (chef/admin)
- `GET /api/admin/users`, `PUT /api/admin/users/:id/role` (admin)
- `GET /api/admin/audit` (admin)
- `GET /api/admin/stats` (admin)

## Datos y seguridad

SQLite activa claves foráneas y WAL. La base impone `UNIQUE(user_id, campaign_id)`, por lo que dos solicitudes concurrentes del mismo usuario no pueden registrar dos votos. Las contraseñas usan bcrypt, los recursos protegidos JWT y los endpoints de autenticación/voto tienen rate limiting. Las fechas se almacenan en UTC ISO-8601.

También quedó preparada la migración segura a Firestore con colecciones separadas, reglas, índices, repositorios y trazabilidad. Antes de activarla consulta [docs/FIRESTORE.md](docs/FIRESTORE.md).

```powershell
corepack pnpm firestore:check
corepack pnpm firestore:migrate
```

La conexión real requiere `FIREBASE_PROJECT_ID` y una cuenta de servicio configurada mediante `GOOGLE_APPLICATION_CREDENTIALS`. El JSON privado nunca debe copiarse al repositorio ni al frontend.

El esquema y las consultas compartidas viven en `server/src/db.js`; pedidos, usuarios y auditoría están separados en `server/src/modules`. La siguiente evolución es extraer también campañas, votación y hamburguesas a módulos con capas `route/controller/service/repository`. Para PostgreSQL debe conservarse `UNIQUE (user_id, campaign_id)` y el alta del voto debe ejecutarse dentro de una transacción.

## Flujo de pedidos

1. El cliente agrega hamburguesas, define cantidades y puede retirar ingredientes.
2. El pedido inicia en `PENDING`.
3. Chef o administrador avanza por `CONFIRMED`, `PREPARING`, `READY` y `DELIVERED`.
4. El cliente sólo puede cancelar mientras esté pendiente.
5. Los cambios relevantes quedan registrados en `audit_logs`.
