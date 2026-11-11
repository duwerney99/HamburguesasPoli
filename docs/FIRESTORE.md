# Firestore en Secret Bite

## Decisión de arquitectura

Express es la única puerta de entrada a los datos. El servidor usa Firebase Admin SDK y el cliente React continúa consumiendo `/api`. Así no se duplican reglas de negocio y el navegador nunca recibe la cuenta de servicio, hashes de contraseña ni acceso a la auditoría.

Mientras se valida la migración se conserva `DB_PROVIDER=sqlite`. La base SQLite no se elimina: queda como respaldo recuperable hasta aprobar conteos y pruebas funcionales.

## Colecciones

| Ruta | Responsabilidad | Identificador |
|---|---|---|
| `users/{userId}` | Perfil e identidad de la aplicación | ID de usuario |
| `roles/{userId}` | Rol vigente y quién lo modificó | Mismo ID de usuario |
| `userEmails/{emailHash}` | Reserva transaccional para impedir correos duplicados | SHA-256 del correo normalizado |
| `refreshTokens/{jti}` | Sesiones renovables, expiración y revocación | Identificador JWT `jti` |
| `burgers/{burgerId}` | Catálogo, ingredientes y precio | ID de hamburguesa |
| `campaigns/{campaignId}` | Fechas, estado y ganador | ID de campaña |
| `campaigns/{campaignId}/candidates/{burgerId}` | Candidatas y contador de votos | ID de hamburguesa |
| `votes/{campaignId_userId}` | Un voto por usuario y campaña | ID determinista único |
| `orders/{orderId}` | Cabecera y estado del pedido | ID de pedido |
| `orders/{orderId}/items/{itemId}` | Hamburguesas y personalizaciones inmutables | ID de línea |
| `orders/{orderId}/events/{eventId}` | Historial completo de estados | ID automático |
| `auditLogs/{logId}` | Trazabilidad administrativa y de negocio | ID automático |
| `_system/migration` | Versión y resultado de migración | `migration` |

Los pedidos guardan una copia del nombre, precio e ingredientes. Esto conserva la factura histórica aunque después cambie el menú. Los documentos de auditoría y eventos se crean, no se actualizan.

## Configuración segura

1. Crear el proyecto y una base Firestore en modo producción.
2. Crear una cuenta de servicio de backend y descargar su JSON en una carpeta privada fuera del proyecto.
3. Copiar `.env.example` a `.env` y completar `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `JWT_SECRET` y `REFRESH_TOKEN_SECRET`.
4. Instalar dependencias y verificar:

```powershell
corepack pnpm install
corepack pnpm firestore:check
```

5. Migrar una sola vez desde SQLite:

```powershell
corepack pnpm firestore:migrate
```

La migración usa IDs deterministas y escrituras `merge`, por lo que puede repetirse durante pruebas sin duplicar usuarios, votos ni pedidos. Antes de repetirla en producción debe confirmarse que todavía no existan escrituras nuevas exclusivas en Firestore.

Después de verificar conteos y muestras, activar el proveedor:

```env
DB_PROVIDER=firestore
FIREBASE_PROJECT_ID=secret-bite-tu-proyecto
FIRESTORE_DATABASE_ID=
GOOGLE_APPLICATION_CREDENTIALS=C:\ruta-privada\service-account.json
JWT_SECRET=una-clave-aleatoria-de-al-menos-32-caracteres
REFRESH_TOKEN_SECRET=otra-clave-independiente-de-al-menos-32-caracteres
CLIENT_ORIGIN=https://tu-sitio.netlify.app
```

## Seguridad y despliegue

- `firestore.rules` bloquea por completo el acceso directo de Web/Mobile SDK.
- Admin SDK no usa reglas de Firestore; la cuenta de servicio debe protegerse mediante IAM con el menor privilegio posible.
- Nunca se debe poner el JSON privado en React, Netlify, GitHub ni dentro de `VITE_*`.
- Los índices requeridos están en `firestore.indexes.json`.
- Para desplegar reglas e índices se puede usar Firebase CLI: `firebase deploy --only firestore`.
- Para backend se recomienda Cloud Run, Firebase Functions o un host Node persistente. Netlify puede alojar el frontend, pero las credenciales deben configurarse solamente en el entorno seguro del backend.

## Activación pendiente

Los componentes de conexión, repositorios, transacciones, reglas, índices y migración ya están separados. El cambio definitivo de `DB_PROVIDER` requiere credenciales reales y una corrida de validación contra el proyecto Firebase. No debe activarse a ciegas porque la aplicación actual contiene datos locales que deben conciliarse primero.
