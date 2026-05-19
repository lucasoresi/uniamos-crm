# Resumen de sesión — 12/05/2026

## Contexto inicial

El usuario inició sesión con una cuenta de Gmail real y encontró dos problemas:
1. La pantalla **Inicio** mostraba solo 1 email (de un contacto que casualmente coincidía con un lead de demo)
2. El **CRM Pipeline** mostraba cards genéricas con empresas ficticias (Tallers ECI, Gabor, Almexca, etc.)

---

## Diagnóstico

### Por qué aparecía data genérica en el pipeline

Al hacer login por primera vez con una cuenta vacía, la app ejecutaba `autoSetupData()` que sembraba 10 leads ficticios hardcodeados en Supabase. Esos datos de demo eran los que poblaban el kanban.

### Por qué solo 1 email en Inicio

La función `home_matchEmailsToLeads()` hace un join estricto entre los emails del inbox de Gmail y el campo `email` de los leads existentes en Supabase. Solo muestra emails de remitentes que ya están en el CRM. Con datos de demo, solo un contacto real del inbox coincidía con uno de los emails ficticios.

---

## Cambios realizados en esta sesión

### 1. Nueva Edge Function: `enrich-gmail-contacts`
- **Archivo**: `supabase/functions/enrich-gmail-contacts/index.ts`
- **Función**: recibe un batch de hasta 40 contactos extraídos de Gmail, los analiza con Claude Haiku en una sola llamada, y devuelve los que son leads B2B con su `empresa`, `lead`, `email`, `estado` y `prioridad`
- **Deployada** y activa en Supabase (version 2, con sanitización de inputs para prevenir prompt injection)

### 2. Funciones `gmailSync_*` en `app.html`

| Función | Rol |
|---|---|
| `gmailSync_parseEmails(header)` | Parsea headers `From`/`To` RFC 2822 en `{ email, name }` |
| `gmailSync_fetchContacts(token)` | Fetcha SENT (50) + INBOX (30) de Gmail API, extrae contactos únicos filtrando ruido, devuelve top 40 por frecuencia de intercambios |
| `gmailSync_upsertLeads(leads)` | Inserta leads nuevos / actualiza existentes (solo si cambió `estado` o `prioridad`), preserva notas del usuario |
| `gmailSync_run()` | Orquestador completo con guard de concurrencia (`finally` block), loading states en el panel, toast de resultado |

### 3. Eliminación de `autoSetupData()`
La función que sembraba datos de demo fue eliminada completamente. Ya no existe en el código.

### 4. Modificación del bloque init
```javascript
// Antes
if(leads.length===0&&prospects.length===0){
  await autoSetupData();
}

// Ahora
if (leads.length === 0) {
  await gmailSync_run();  // primer login: espera
} else {
  gmailSync_run();         // logins siguientes: background
}
```

### 5. CLAUDE.md actualizado
Documentadas la nueva arquitectura de Gmail Auto-Sync, las Edge Functions existentes, y removidas las referencias a `autoSetupData()`.

### 6. Merge a `main`
Todo mergeado al branch principal. La Edge Function está deployada en producción.

---

## Estado actual del programa

### Lo que funciona
- Al hacer login con Google, el CRM escanea Gmail automáticamente
- Los contactos reales de SENT + INBOX son analizados con IA (Claude Haiku)
- Los leads B2B detectados se cargan en el CRM Pipeline
- En logins subsiguientes, el sync corre en background y actualiza estados si cambiaron
- La sección "Emails recientes" del Inicio muestra emails del inbox que coinciden con leads existentes en el CRM

### Resultados observados en prueba real
- Se detectaron 2 leads reales de Gmail: "Bot My Solutions" y "Twilio"
- Ambos verificados como contactos reales existentes en el Gmail del usuario
- "Twilio" es un **falso positivo** (servicio, no prospecto B2B)

---

## Lo que falta / problemas pendientes

### Limitaciones de diseño actuales

**1. "Emails recientes" solo muestra INBOX, no SENT**
- La función `home_matchEmailsToLeads()` solo procesa emails recibidos (inbox)
- Un email enviado a un nuevo contacto no aparecerá en "Emails recientes" aunque el contacto esté en el CRM
- Para que un email enviado aparezca, el contacto tiene que responderte (llegar a tu inbox)

**2. Mensajes de LinkedIn no aparecen**
- LinkedIn usa su propio sistema de mensajería interno, no Gmail
- El programa solo integra con Gmail; los mensajes de LinkedIn no son emails
- No existe integración con la API de LinkedIn en el proyecto

**3. Sync solo corre al login (no en tiempo real)**
- Los emails enviados/recibidos después del login no se detectan hasta recargar la app
- No hay webhook ni polling continuo
- Solución actual: botón "↻ Actualizar" en el header del Home

**4. Falsos positivos en la clasificación IA**
- Servicios conocidos como Twilio, Slack, GitHub pueden colarse como leads B2B
- El filtro de ruido (`NOISE` regex) no incluye todos los servicios posibles
- Necesita ampliar la lista de dominios/servicios a filtrar antes de llamar a Claude

**5. Solo se puebla el CRM Pipeline, no el PRM Prospectos**
- El sync solo crea `leads`, no `prospects`
- Contactos en etapas tempranas (primer contacto, sin respuesta) podrían ir al PRM en lugar del CRM

**6. Contactos con poco historial en Gmail pueden no detectarse**
- Si un prospecto solo recibió 1 email tuyo y nunca respondió, puede quedar fuera del top 40
- El ranking por frecuencia de intercambios favorece conversaciones activas

### Mejoras planificadas / próximos pasos

- [ ] Ampliar filtro NOISE para excluir servicios conocidos (Twilio, Stripe, Notion, Slack, etc.)
- [ ] Mostrar también emails enviados en "Emails recientes" del Inicio (no solo inbox)
- [ ] Agregar botón "Sincronizar Gmail" manual en el CRM Pipeline para forzar re-sync sin recargar
- [ ] Clasificar contactos en PRM vs CRM según nivel de conversación (contacto inicial → PRM, conversación activa → CRM)
- [ ] Mejorar el prompt de Claude para que no clasifique como leads a servicios de notificación
