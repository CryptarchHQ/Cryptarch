# Plan técnico — Rediseño del admin v1 («de CRUD técnico a configuración guiada»)

> Documento único que recoge la definición completa de las nuevas interfaces.
> El troceo ejecutable está en el milestone **Admin redesign v1** y en la cola de
> [#27](https://github.com/CryptarchHQ/Cryptarch/issues/27). La sección
> [Issues](#8-issues) es el mapa.
>
> Decisiones ya tomadas por producto (23-09-2026):
> - **Estilo visual: Atlas** (SaaS operativo, azul acero).
> - **Se añade `name` + `description` al Connector** en backend (con migración).
> - **Alcance: todas las pantallas** (Integraciones + wizard, Usuarios, Documentos, Chat, Grupos/Filtros).
>
> Referencias: Figma [Cryptarch — Opción B · 3 estilos](https://www.figma.com/design/NJe1GFjIHC3TFLqSgVMuNQ)
> (página `02 — Atlas`, completa con 9 pantallas) y canvas `definicion-interfaces-v1` (spec interactiva).

---

## 1. Objetivo y criterios

Sustituir el admin actual (formularios técnicos fijos sobre tablas, IDs visibles, errores por
`window.alert`) por una experiencia guiada:

- **Máximo 3 pasos** en los flujos de creación (excepción: OAuth2 con prueba de conexión, hasta 5).
- **Lenguaje llano**: preguntas por intención («¿Cómo se autentica el servicio?»), con el término
  técnico como apoyo.
- **Reducción de clics**: list-first, drawers laterales, wizard con resumen persistente.
- **Ayuda contextual** para no expertos (qué es una API key, dónde encontrarla).
- **Transiciones discretas** (180–240 ms), desactivadas con `prefers-reduced-motion`.

## 2. Estilo visual: Atlas

Tokens de la página `02 — Atlas` del Figma (a materializar como variables CSS / theme del frontend):

| Token | Valor | Uso |
|---|---|---|
| `bg` | `#EEF1F4` | Fondo general |
| `surface` | `#FFFFFF` | Cards, drawers, tablas |
| `surfaceSoft` | `#F1F5F9` | Bloques secundarios, filas alternas |
| `text` | `#0F172A` | Texto principal |
| `muted` | `#64748B` | Texto secundario, hints |
| `accent` | `#1D4ED8` | Botón primario, links, paso activo |
| `accentSoft` | `#DBEAFE` | Fondos de badges/selección |
| `border` | `#CBD5E1` | Bordes de cards e inputs |
| `sidebar` | `#0F172A` | Fondo de la navegación lateral |
| `sidebarText` / `sidebarMuted` | `#E2E8F0` / `#94A3B8` | Texto de la sidebar |

- Radios: **8 px** en cards/drawers, **6 px** en botones e inputs (sin pills).
- Tipografía compacta (Inter), densidad alta: paddings apretados, tablas con más filas visibles.
- Frames de referencia en Figma (pageId `9:2`): Paso 1 `9:3`, Paso 2 `10:2`, Paso 3 `10:72`,
  Login `11:2`, Usuarios `11:21`, Conectores `11:110`, Documentos `12:2`, Chat `12:66`, Grupos `12:96`.

## 3. Reglas del sistema (aplican a todas las pantallas)

1. **List-first**: toda sección abre con listado + búsqueda. Crear/editar en drawer o wizard, nunca
   en un formulario fijo sobre la tabla.
2. **Wizard acotado**: creación guiada en 3 pasos; solo OAuth2 con test de conexión llega a 5.
3. **Lenguaje llano**: pregunta por intención; término técnico como apoyo.
4. **Divulgación progresiva**: headers, timeout, content-type y JSON plegados bajo «Opciones avanzadas».
5. **Validación inline**: errores junto al campo con `aria-live`; los 422 del API se mapean a campos.
   **Nunca `window.alert`** (hoy se usa en `ActionBuilderForm.jsx` para timeouts).
6. **Feedback de éxito**: toast tras crear/guardar/borrar, con enlace al recurso creado.
7. **Sin UUIDs visibles**: perfil muestra email y nombre de tenant; filtros y grupos se referencian
   por nombre + criterio legible.
8. **Movimiento discreto**: transiciones 180–240 ms entre pasos y drawers; respetar
   `prefers-reduced-motion`.

## 4. Especificación por pantalla

### 4.1 Integraciones (antes «Conectores») — vista raíz

**Objetivo**: ver de un vistazo qué servicios están conectados y qué acciones ofrece cada uno.
Crear siempre pasa por el asistente.

- Cabecera: título «Integraciones», buscador, botón primario «Nueva integración» (lanza wizard).
- Lista: nombre del servicio, URL base, badge de auth (Sin auth / Token / API key / Basic /
  OAuth2 / Avanzada) y nº de acciones.
- Seleccionar una integración despliega panel de detalle (derecha, o debajo en pantallas estrechas):
  datos del servicio + lista de acciones (nombre visible, chip método+path, tags, menú
  Editar · Duplicar · Eliminar).
- «Editar integración» abre drawer con los bloques del paso 1 del wizard. «Nueva acción» abre el
  wizard en el paso 2 con el servicio fijado.

**Estados**: vacío total (ilustración + «Conecta tu primer servicio»); integración sin acciones
(«Esta integración aún no hace nada» + CTA); borrar integración con acciones → el API devuelve 409
y el diálogo lista las acciones que hay que mover/borrar antes.

**Restricción técnica**: hoy `Connector` solo persiste `base_url` y `auth_config` (sin nombre →
«Conector 1» en la UI actual). El nombre requiere el cambio backend B1 (ya aprobado).

### 4.2 Wizard — Paso 1 · Servicio y autenticación

**Objetivo**: responder «¿con qué servicio conectas?» y «¿cómo se autentica?» sin pedir nada que
el usuario no sepa dónde encontrar.

- Rail izquierdo con los 3 pasos (persistente).
- Bloque servicio: nombre + URL base.
- Bloque autenticación: 6 tarjetas seleccionables; al elegir, aparecen sus campos + tarjeta de
  ayuda «¿Dónde lo encuentro?».
- Aside resumen persistente (servicio, URL, tipo de auth).
- Footer: Cancelar · Continuar (deshabilitado hasta validar).

Mapeo exacto a `auth_config` (convención frontend, backend acepta dict libre):

| Campo / tarjeta | Comportamiento | Mapeo |
|---|---|---|
| Nombre del servicio | Texto obligatorio (ej. «HubSpot») | `connector.name` (**NUEVO backend**) |
| URL base | Obligatoria; validación de formato al perder foco | `connector.base_url` |
| Sin autenticación | «El servicio es público o la clave va en cada acción» | `auth_config = null` |
| Token (Bearer) | 1 campo: variable de entorno del token | `{type:'bearer', token_env}` |
| API key | Header (default `X-API-Key`) + variable de la clave | `{type:'api_key', header_name, key_env}` |
| Usuario y contraseña | Usuario + variable del secreto | `{type:'basic', username, password_env}` |
| OAuth2 (client credentials) | client ID, variable del secret, token URL, scope(s) | `{type:'oauth2', client_id, client_secret_env, token_url, scope}` |
| Configuración avanzada | Textarea JSON con validación de sintaxis inline | `auth_config` libre (`type:'custom'`) |

**Estados**: cada tarjeta lleva «Cuándo usarlo» (API key → «Stripe, Twilio, HubSpot private apps»);
ayuda contextual con pasos para localizar la credencial y recordatorio de que se guarda como
variable de entorno del servidor, nunca en texto plano. La existencia de la variable no se puede
verificar hoy (ver B5, test de conexión).

### 4.3 Wizard — Paso 2 · Qué debe hacer

**Objetivo**: definir la acción por intención — nombre humano + endpoint. Detalles HTTP plegados.

- Campos visibles: nombre visible, método (select, default POST), path.
- Tarjeta «URL final» siempre visible: método + `base_url` + path + «Auth: la del servicio» +
  content-type inferido.
- Toggle «Usar la autenticación del servicio» (default activado).
- «Opciones avanzadas» plegado: headers, query, cuerpo (solo POST/PUT/PATCH), content-type, timeout.
- Footer: Cancelar · Atrás · Continuar.

| Campo | Comportamiento | Mapeo |
|---|---|---|
| Nombre visible | Obligatorio; lo que ve el usuario en el chat | `action.name` |
| Método + Path | GET/DELETE ocultan el bloque de cuerpo | `action.method` · `action.path` |
| Usar auth del servicio | Toggle | `request_config.auth.mode = 'connector' \| 'none'` |
| Headers / Query / Cuerpo | Editores clave-valor en avanzadas | `request_config.headers · query · body` (**contrato canónico**) |
| Content-Type | Select, solo con cuerpo; default `application/json` | `request_config.content_type` |
| Timeout | Número ≥ 1, opcional, en segundos | `request_config.timeout` |

**Estados**: cambiar a GET con cuerpo relleno → aviso inline sin borrar lo escrito; path sin `/`
inicial se normaliza; el bloque avanzadas recuerda su estado durante la sesión.

**Bloqueante técnico (B2)**: el builder actual emite `query_params`/`body_params`/`content_type`
mientras el dominio (`action_request_config.py`) espera `query`/`body`/`headers`. El wizard v1
escribe el contrato canónico y el backend debe aceptar/migrar el legado. Además,
`input_schema_version` pasa a tratarse como **string** y desaparece de la UI (B3).

### 4.4 Wizard — Paso 3 · Qué preguntará en el chat

**Objetivo**: definir los campos que el chat pedirá, viendo en vivo el formulario exacto.

- Split: constructor de campos a la izquierda, preview del chat a la derecha (**mismo componente
  de render que `ChatPage`**).
- Cada campo: etiqueta (lo que ve el usuario), tipo en lenguaje llano, toggle obligatorio, nombre
  técnico autogenerado desde la etiqueta (editable en desplegable secundario).
- Añadir campo; reordenar por drag o flechas.
- Cierre en el mismo paso: resumen completo (servicio, auth, acción, campos) + tags de la acción
  (TagPicker compacto) + botón «Crear integración».

Tipos disponibles (subset validado por `input_schema_contract.py` — no ofrecer más hasta ampliar
el contrato):

| Tipo en UI | Chat | JSON Schema |
|---|---|---|
| Texto | Respuesta corta | `type: 'string'` |
| Número | Acepta decimales | `type: 'number'` |
| Número entero | Sin decimales | `type: 'integer'` |
| Sí / No | Toggle | `type: 'boolean'` |
| Etiqueta | Label en el chat | `properties[name].description` |
| Obligatorio | — | `required: string[]` |

**Estados**: sin campos → preview con botón de ejecutar + «Esta acción no pedirá datos»; nombre
técnico duplicado → error inline; tras crear → toast + navegación al detalle con la acción resaltada.

### 4.5 Usuarios — list-first

- Cabecera: buscador por email, filtro por rol, filtro por tags, botón «Nuevo usuario».
- Tabla: email, rol (badge), tags, acciones (Editar · Eliminar con confirmación).
- Crear/editar en drawer: email, rol, password opcional, tags (TagPicker).
- «Guardar como filtro» pasa a acción secundaria dentro del panel de filtros aplicados, con nombre
  propuesto automáticamente.

**Estados**: búsqueda sin resultados («Nadie coincide» + limpiar filtros); borrar al propio admin
conectado → bloqueado con explicación.

### 4.6 Documentos — biblioteca y subida

- Cabecera: buscador por título, filtros por estado y tags, botón «Añadir documento».
- Drag&drop protagonista con biblioteca vacía; con contenido, botón + drop sobre la tabla.
- Subida en 2 pasos (drawer): 1) archivo (PDF/TXT/CSV) → 2) título prellenado editable + tags +
  confirmar.
- Tabla: título, estado con badge y tooltip (En cola «esperando al worker» · Procesando · Listo ·
  Error con motivo), tags, fecha.

**Estados**: fila en Error expandible con el mensaje del worker y botón «Reintentar» (re-encola).
Si el endpoint de upload de fichero aún no existe (B4), el paso 1 acepta solo metadatos y lo marca
como «referencia sin archivo».

### 4.7 Chat — usuario final

- Acciones permitidas como tarjetas con el nombre visible definido en el wizard.
- Elegir acción → formulario dinámico inline (render desde `input_schema_json`,
  `description` = label).
- Resultado de ejecución como tarjeta de conversación: estado + mensaje; JSON crudo plegado bajo
  «Ver detalle técnico».
- Perfil: email + menú (preferencias, cerrar sesión). Sin UUIDs.

**Estados**: si `/actions` tarda >8 s → «Esto está tardando más de lo normal» + reintentar; sin
acciones permitidas → «Tu espacio aún no tiene acciones disponibles. Habla con tu administrador.»

### 4.8 Grupos y filtros — v1 simplificada

- Filtros: tabla nombre + tipo (usuario/acción/documento) + criterio legible
  («tiene TODAS: Admin, CRM»). Crear/editar en drawer con TagPicker.
- Grupos: tabla nombre + resumen de bindings en lenguaje llano. Editor en drawer: tres selectores
  múltiples que muestran **nombre y criterio** del filtro, nunca su ID.
- Fase posterior (requiere B6): wizard de permisos de 3 pasos con conteo en vivo de coincidencias.

**Estados**: borrar filtro en uso → aviso con la lista de grupos afectados.

## 5. Componentes compartidos (frontend)

| Componente | Responsabilidad |
|---|---|
| `WizardShell` | Rail de pasos + contenido + aside resumen + footer; transiciones y gestión de foco |
| `Drawer` | Panel lateral crear/editar; cierra con Esc; confirma si hay cambios sin guardar |
| `ListPage` | Cabecera + buscador + filtros + tabla + estados vacío/cargando/error |
| `AuthMethodCard` | Tarjeta seleccionable con título, «cuándo usarlo» y ayuda contextual |
| `FieldRow` | Label + input + error inline + hint; único punto de estilo de formularios |
| `UrlPreview` | Tarjeta método + URL compuesta + auth + content-type |
| `ChatFormPreview` | Mismo renderer que el chat real, alimentado por el schema en edición |
| `Toast` / `ConfirmDialog` | Éxito con enlace al recurso; confirmaciones destructivas con consecuencias |
| `TagPicker` / `KeyValueEditor` | Ya existen; restyle al sistema Atlas sin cambiar su API |

## 6. Cambios de backend

| ID | Cambio | Detalle | Cuándo |
|---|---|---|---|
| B1 | `Connector.name` + `description` | Campos nuevos en modelo, schemas API y migración Alembic. `name` obligatorio, `description` opcional. Elimina «Conector 1» | **Bloqueante** vista raíz |
| B2 | Contrato `request_config` canónico | El API valida `headers`/`query`/`body` y **migra/acepta el legado** `query_params`/`body_params`. Datos existentes se migran | **Bloqueante** wizard paso 2 |
| B3 | `input_schema_version` string | El frontend deja de castear a número; la UI lo oculta | Bloqueante menor |
| B4 | Upload real de documentos | Endpoint de subida de fichero + encolado en Redis; hoy solo metadatos | Documentos completo |
| B5 | Test de conexión | Endpoint seguro que prueba la auth del conector sin exponer secretos | Fase posterior (pasos 4-5 OAuth2) |
| B6 | Preview de filtros | Endpoint que cuenta/lista coincidencias de un filtro | Wizard de permisos |

Orden: **B1 + B2 (+ B3) antes de construir el wizard**; B4–B6 llegan por fases sin bloquear la v1.

## 7. Fases de implementación

1. **Fase 0 — Backend bloqueante**: B1, B2, B3 (con tests TDD y migraciones).
2. **Fase 1 — Sistema visual y shell**: tokens Atlas como theme, `ListPage`, `Drawer`, `FieldRow`,
   `Toast`/`ConfirmDialog`; sidebar y navegación.
3. **Fase 2 — Integraciones + wizard**: vista raíz, `WizardShell`, pasos 1-3, `AuthMethodCard`,
   `UrlPreview`, `ChatFormPreview`.
4. **Fase 3 — Resto de pantallas**: Usuarios, Documentos (con B4 si está), Chat, Grupos/Filtros.
5. **Fase 4 — Extensiones**: test de conexión (B5, wizard OAuth2 hasta 5 pasos), wizard de permisos
   con preview (B6), accesibilidad completa (foco, aria-live, reduced-motion audit).

## 8. Issues

El lote vive en el milestone **Admin redesign v1**. La cola y la regla de promoción están en
[#27](https://github.com/CryptarchHQ/Cryptarch/issues/27). Una sola issue lleva `ready-for-agent`
a la vez. Cada una es dueña de un conjunto de ficheros; el cuerpo dice qué no puede tocar.

| Issue | Dueña de |
|---|---|
| [#28](https://github.com/CryptarchHQ/Cryptarch/issues/28) | B2. Contrato canónico de `request_config` (sin Alembic, sin frontend). |
| [#29](https://github.com/CryptarchHQ/Cryptarch/issues/29) | B1. `name` y `description` de Connector. |
| [#30](https://github.com/CryptarchHQ/Cryptarch/issues/30) | Email y nombre de tenant en `GET /me`, para admin y para usuario de chat. |
| [#31](https://github.com/CryptarchHQ/Cryptarch/issues/31) | Tokens Atlas del tema claro. El tema oscuro de preferencias se queda. |
| [#33](https://github.com/CryptarchHQ/Cryptarch/issues/33) | `FieldRow`, `Drawer`, `ListPage`, `Toast`, `ConfirmDialog`. |
| [#34](https://github.com/CryptarchHQ/Cryptarch/issues/34) | Restyle de `TagPicker` y `KeyValueEditor`, sin cambiar su API. |
| [#35](https://github.com/CryptarchHQ/Cryptarch/issues/35) | `WizardShell` (hasta 5 pasos; el flujo normal usa 3). |
| [#36](https://github.com/CryptarchHQ/Cryptarch/issues/36) | Navegación, perfil sin UUID y un `routes.jsx` por módulo. |
| [#37](https://github.com/CryptarchHQ/Cryptarch/issues/37) | Paso 1 y `IntegrationServiceForm`, reutilizado por el drawer de edición. |
| [#38](https://github.com/CryptarchHQ/Cryptarch/issues/38) | Paso 2, `UrlPreview` y el payload canónico en el cliente. |
| [#39](https://github.com/CryptarchHQ/Cryptarch/issues/39) | Paso 3, alta, ruta `/new` y B3 (`input_schema_version` string, oculto). |
| [#40](https://github.com/CryptarchHQ/Cryptarch/issues/40) | Vista Integraciones y retirada de `ConnectorsWorkspace` / `ActionBuilderForm`. |
| [#41](https://github.com/CryptarchHQ/Cryptarch/issues/41) | Usuarios list-first, incluido «guardar como filtro». |
| [#42](https://github.com/CryptarchHQ/Cryptarch/issues/42) | Grupos y filtros v1. Deja el hueco `headerActions` vacío. |
| [#43](https://github.com/CryptarchHQ/Cryptarch/issues/43) | Chat. No cambia las props de `DynamicActionForm` ni el perfil. |
| [#44](https://github.com/CryptarchHQ/Cryptarch/issues/44) | B4. Upload multipart y reintento de ingestión. |
| [#45](https://github.com/CryptarchHQ/Cryptarch/issues/45) | Biblioteca de documentos y subida en dos pasos. |
| [#46](https://github.com/CryptarchHQ/Cryptarch/issues/46) | B5. Test de conexión, sin secretos en la respuesta. |
| [#47](https://github.com/CryptarchHQ/Cryptarch/issues/47) | Pasos 4 y 5, solo si la auth es OAuth2. |
| [#32](https://github.com/CryptarchHQ/Cryptarch/issues/32) | B6. Preview de coincidencias de un filtro. |
| [#48](https://github.com/CryptarchHQ/Cryptarch/issues/48) | Wizard de permisos. Solo rellena `headerActions`. |

La accesibilidad (foco, `aria-live`, `prefers-reduced-motion`, cero `window.alert`) va en los
criterios de cada issue de UI. Tags queda fuera y tiene que seguir funcionando. La primera de la
cola es [#28](https://github.com/CryptarchHQ/Cryptarch/issues/28).
