# Estado de seguridad y Google OAuth — Uniamos CRM

> Documento de contexto. Última actualización: 2026-06-23.
> Resume las decisiones de seguridad de Supabase (RLS) y de publicación de la app de Google (OAuth / Gmail / Calendar), para no perder el hilo más adelante.

---

## 1. Google OAuth — scopes y publicación

### Scopes que pide la app (definidos en `login.html`)

| Scope | Clasificación Google | Implica |
|---|---|---|
| `gmail.readonly` | **Restringido (restricted)** | Requiere auditoría **CASA** para publicar |
| `gmail.send` | Sensible (sensitive) | Verificación normal, sin CASA |
| `calendar.readonly` | Sensible (sensitive) | Verificación normal, sin CASA |

### Estado actual
- La app de Google Cloud Console está en **Testing**: solo acceden las cuentas agregadas a mano como testers (máx. 100).
- Para que **cualquiera** entre con su cuenta hay que pasar el publishing status a **In production** y completar la **verificación de OAuth** de Google.

### Decisión tomada (2026-06-23)
**Quedarse con `gmail.readonly` por ahora**, para no afectar el funcionamiento actual (snippet de emails, preview, y precisión de la clasificación con IA).

Consecuencia: el día que se quiera sacar la app de Testing y abrirla al público, `gmail.readonly` obligará a pasar la auditoría **CASA**.

### Qué es CASA
*Cloud Application Security Assessment*. Auditoría de seguridad externa (App Defense Alliance) exigida por Google para scopes restringidos en producción.
- **Paga** (orden de miles de USD), la hace un tercero, no Google.
- Toma **semanas**; puede incluir pentest.
- Hay que **renovarla cada 12 meses** (carta LOA) o se pierde el acceso al scope.

### Alternativa para evitar CASA (no aplicada)
Bajar de `gmail.readonly` a `gmail.metadata` (solo "sensible", sin CASA). Requeriría refactor de `src/gmail-layer.jsx`:
- Quitar uso de `snippet` (metadata no lo devuelve) → se vacía la línea de preview en bandeja y detalle de lead.
- Cambiar `format=minimal` → `format=metadata` en `gmail_loadForContact`.
- Eliminar `_gmailExtractBody` (ya no funciona: pide `format=minimal`, que no trae cuerpo → hoy es código muerto).
- Reemplazar búsqueda con `q=from:/to:` por listado + filtrado en cliente (metadata restringe el parámetro `q`).
- La clasificación con IA quedaría solo con asunto + remitente + fecha (menos precisión).

Mientras la app siga en **Testing**, no hace falta CASA ni el refactor.

---

## 2. Supabase — seguridad de la base de datos

Proyectos involucrados: `uniamos-crm` (crm-database) y `uniamosphone`.

### RLS (Row Level Security) — RESUELTO
- Alerta original: `rls_disabled_in_public` ("Table publicly accessible").
- Causa: alguna tabla en el proyecto real quedó sin RLS (creada a mano o schema corrido a medias).
- Fix aplicado: script `docs/fix-rls.sql` — activa RLS + policy de dueño (`auth.uid() = user_id`) en todas las tablas de `public` con columna `user_id`.
- Estado: **0 errors** en Security Advisor. Todas las tablas con RLS = true y policy `*_owner`.
- Pendiente: confirmar que `uniamosphone` también esté en 0 errors.

> Nota: hay policies duplicadas en `google_tokens`, `ignored_senders` y `user_services`
> (las granulares del `schema.sql` + las `*_owner` del script). Es inofensivo
> (las permissivas se combinan con OR y todas exigen `auth.uid() = user_id`).
> Se pueden borrar las `*_owner` en esas 3 tablas si se quiere dejar prolijo.

### Event trigger `ensure_rls` + función `rls_auto_enable()`
- Existe un **event trigger** `ensure_rls` que llama a `public.rls_auto_enable()` para activar RLS automáticamente en cada tabla nueva. **Es una red de seguridad útil — NO borrar.**
- Warnings del linter: la función `rls_auto_enable()` era `SECURITY DEFINER` ejecutable por `anon` y `authenticated` vía `/rest/v1/rpc/`.
- Fix aplicado (sin borrar la función ni el trigger):
  ```sql
  revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
  ```
  El event trigger sigue funcionando (se dispara a nivel DB, no depende de los grants de la API REST).

### Warning: Leaked Password Protection
- Estado: a activar (toggle en **Authentication → Sign In / Providers → Leaked password protection**).
- Chequea contraseñas contra HaveIBeenPwned. Recomendado, gratis.

---

## 3. Checklist pendiente

- [ ] Correr `docs/fix-rls.sql` en `uniamosphone` y confirmar 0 errors.
- [ ] `revoke execute` sobre `rls_auto_enable()` (resuelve 2 warnings SECURITY DEFINER).
- [ ] Activar Leaked Password Protection en Authentication.
- [ ] (Opcional) Borrar policies `*_owner` duplicadas en `google_tokens`, `ignored_senders`, `user_services`.
- [ ] (Futuro, al publicar) Decidir CASA con `gmail.readonly` **o** refactor a `gmail.metadata`.
