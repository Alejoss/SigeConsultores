# Capacitaciones en línea

Plataforma de cursos para el personal de las empresas cliente. Corre en el mismo proceso y la misma base de datos (`sige_platform`) que ISGE 360, pero se abre únicamente en **https://capacitaciones.isge360.com**. La ruta `/cursos` del sitio principal no existe (responde 404).

## Quién entra y a qué pantalla

| Persona                                                      | Cómo entra                                                                                                                   | Pantalla                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Administrador general (`account_roles` con `platform_admin`) | Botón **Capacitaciones On line** en `/admin-dashboard`, o correo y clave de ISGE 360 en el subdominio                        | `/` (portal en vista previa), `/modulo/:id` (visor), `/empresa` (eligiendo la empresa) y `/catalogo` |
| Gerente de empresa (`company_manager`)                       | Botón **Capacitaciones On line** dentro de **Capacitaciones** de ISGE 360, o correo y clave de ISGE 360                      | `/` (portal en vista previa), `/modulo/:id` y `/empresa`                                             |
| Jefe de Proceso autorizado para cursos                       | El Gerente activa **Capacitaciones en Línea** en **Accesos del equipo** y el Jefe entra desde **Capacitaciones** de ISGE 360 | `/empresa` solo para su propia empresa                                                               |
| Trabajador                                                   | Cédula y clave propias, creadas en **Crear cuenta** con el código de su empresa                                              | `/` (portal), `/modulo/:id` y `/certificado/...`                                                     |

Las pantallas equivalen a los HTML originales: `portal.html` → `/`, `visor.html` → `/modulo/:id`, `empresa.html` → `/empresa`, `super.html` → `/catalogo`.

### Navegación y salida

No hay redirecciones por rol: cada persona llega a la ruta que abrió. Todas las pantallas muestran la barra `CourseNav` (`client/src/pages/online-courses/PortalPage.tsx`) con las secciones que su rol puede abrir (**Capacitaciones**, **Empresa**, **Catálogo**), un enlace **ISGE 360** para el personal administrativo y el botón **Salir**. Si alguien abre una pantalla que no le corresponde, ve un aviso y la barra para moverse.

**Salir** cierra las dos sesiones: la de cursos (`onlineCourses.logout`, cookie `course_sid`) y la compartida de ISGE 360 (`POST /api/auth/session/logout`, cookie `app_session_id`). Sin la segunda, la sesión compartida volvería a autenticar al usuario. Después muestra el formulario de ingreso.

### Vista previa del personal administrativo

El administrador general y el gerente recorren la aplicación igual que un trabajador: portal, búsqueda, módulos, lecciones y evaluaciones. Todos los módulos aparecen abiertos, sin secuencia ni fechas. Al calificar ven el resultado y las respuestas correctas, pero nada se guarda y no se emiten certificados (`staffTree`, `staffModule` y `previewEvaluation` en el servicio). El administrador general ve el catálogo general; el gerente ve además los campos privados de su empresa.

### Panel de empresa para el administrador general

En `/empresa` el administrador general elige la empresa en un selector (o llega desde el nombre de la empresa en `/catalogo`, que abre `/empresa?empresa=<id>`). Los procedimientos del panel aceptan un `companyId` opcional; el router lo resuelve con `actAsCompany`, que solo actúa para `platform_admin` y se ignora para cualquier otro rol.

El catálogo permite crear módulos dentro de los campos existentes y cargar capacitaciones; no crea campos nuevos.

Si alguien abre cualquier pantalla sin sesión, ve el formulario de ingreso.

## Sesión compartida entre isge360.com y el subdominio

- La cookie de ISGE 360 (`app_session_id`) se escribe con `Domain=isge360.com`, así el navegador la envía también a `capacitaciones.isge360.com`. Lo resuelve `sharedCookieDomain` en `server/_core/cookies.ts`. En `localhost` o con IP no se pone dominio.
- Las cookies antiguas sin dominio se reemplazan solas: cada respuesta autenticada (`createContext`, `/api/auth/session/me`) vuelve a escribir la cookie con dominio y borra la copia antigua (`applySessionCookie`).
- El botón **Capacitaciones On line** del área de Capacitaciones apunta a `/api/auth/session/continue?to=/empresa&companyId=...`. Esa ruta verifica que la persona puede administrar cursos de esa misma empresa, guarda únicamente esa selección temporal en la sesión compartida y redirige al subdominio. Solo acepta `/`, `/catalogo` y `/empresa` como destino.
- En el subdominio, `readCourseActor` (`server/onlineCourses/service.ts`) busca primero la sesión propia de cursos (`course_sid`, 12 horas) y, si no hay, la sesión de ISGE 360. Con esta última reconoce al administrador general y al gerente; los trabajadores siempre usan `course_sid`.
- La autorización de un Jefe para cursos se guarda por `(empresa, cuenta)` en `companyOnlineCourseAccess`. Es independiente de **Coordinador de empresa**: no concede edición de módulos de ISGE 360, acceso a otros procesos, nómina, equipo ni otras empresas. El servidor la comprueba en cada solicitud; revocar el permiso o suspender al Jefe bloquea el panel inmediatamente, incluso si tenía una sesión de cursos abierta.
- Si la misma cuenta administra cursos en más de una empresa, no se escoge ninguna automáticamente. Cada entrada desde ISGE 360 debe indicar la empresa activa; el servidor la valida otra vez en cada petición del panel.
- Si existe una sesión ISGE 360 válida, esa identidad tiene prioridad sobre una cookie `course_sid` previa del mismo navegador. Así un Jefe estándar no puede heredar la sesión administrativa de cursos de otra persona.
- **Salir** cierra también la sesión de ISGE 360, porque es la misma cookie (ver «Navegación y salida»).

Variable opcional: `COOKIE_DOMAIN`, para cuando el dominio registrable tiene más de dos partes (por ejemplo `empresa.com.ec`).

## Código de inscripción de la empresa

El trabajador escribe este código en **Crear cuenta**; así queda asociado a su empresa. Se guarda en `courseCompanySettings.regCode` (único por empresa). Una empresa queda habilitada en capacitaciones en cuanto tiene código.

| Quién                 | Dónde lo edita                                                        | Reglas                                                                                                |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Gerente de empresa    | **Datos Generales** dentro de `/manager-dashboard`                    | Solo su empresa. Entre 4 y 32 caracteres.                                                             |
| Administrador general | `/admin-dashboard`, tabla **Códigos de inscripción a capacitaciones** | Cualquier empresa. Si guarda el campo vacío, se genera un código a partir del nombre (`EMPRES-1A2B`). |

Dos empresas no pueden compartir código; el servidor responde «Ese código ya lo usa otra empresa.»

El catálogo (`/catalogo`) ya no edita códigos: solo lista empresas y número de trabajadores. El panel `/empresa` del subdominio conserva su botón **Cambiar código** para el gerente.

### API (tRPC `courseRegCodes`, `server/routers/courseRegCodes.ts`)

| Procedimiento | Guardia                                | Uso                                        |
| ------------- | -------------------------------------- | ------------------------------------------ |
| `mine`        | `companyProcedure` + sesión de gerente | Código de la empresa del gerente           |
| `setMine`     | `companyProcedure` + sesión de gerente | Cambiar ese código                         |
| `list`        | `adminProcedure`                       | Todas las empresas con su código           |
| `set`         | `adminProcedure`                       | Cambiar o generar el código de una empresa |

Un jefe de proceso o un usuario normal de plataforma recibe error en `mine` y `setMine`. La lógica compartida vive en `listCompanyRegCodes`, `getCompanyRegCode` y `saveCompanyRegCode` del servicio de cursos.

## Pruebas

- `server/__tests__/sessionCookie.test.ts`: dominio de la cookie y limpieza de la copia antigua.
- `server/__tests__/onlineCourses.test.ts`: destinos permitidos del enlace de continuación y URL de salida.
- `server/__tests__/onlineCourses.integration.test.ts` (MySQL): ingreso al catálogo con la sesión de ISGE 360, vista de administrador sin guardar avance, edición del código por gerente y administrador, rechazo a jefe de proceso, y el flujo completo de cursos y certificados.
- `server/__tests__/onlineCourseManagementAccess.integration.test.ts` (MySQL): autorización y revocación del Jefe, aislamiento por empresa, suspensión y selección explícita cuando una cuenta tiene dos empresas autorizadas.
