# Guía de trabajo — Manus

Instrucciones para sincronizar el repositorio **SIGE Platform**, publicar cambios y no romper producción.

**Repositorio:** [Alejoss/SigeConsultores](https://github.com/Alejoss/SigeConsultores) (privado)

**CI/CD:** solo corre CI al llegar a `main`. Si CI pasa → CD. Push a `infra/staging-cicd` no dispara ni CI ni deploy.

---

## 1. Lectura obligatoria

Antes de modificar cualquier archivo, **lee en este orden** (no es opcional):

### Cadena de entrada

1. [agents.md](../agents.md) — reglas de alcance, auth tRPC y verificación.
2. Esta guía ([GUIA_MANUS.md](./GUIA_MANUS.md)) — flujo Git, checklist y qué no hacer.
3. [README.md](../README.md) — instalación local, comandos, stack.
4. [docs/README.md](./README.md) — índice (referencia).

### Documentación operativa (leer completa, siempre)

| Documento | Por qué importa |
|-----------|-----------------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | **Único CI en `main`**; staging sin CI; CD solo si CI pasa |
| [TESTING.md](./TESTING.md) | Cómo correr y actualizar pruebas (crítico con cambios de esquema) |
| [GITHUB_SETUP.md](./GITHUB_SETUP.md) | Workflows de GitHub Actions, secretos, permisos |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | Arquitectura: droplet, Docker, OAuth, S3, correo |
| [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md) | Respaldos diarios y restauración |
| [FILE_STORAGE.md](./FILE_STORAGE.md) | Subida de archivos a S3 |

### Variables de entorno

- Local: [.env.example](../.env.example) → copiar a `.env.local`
- Producción (referencia): [.env.production.example](../.env.production.example) — **no commitear** archivos `.env` reales

### Confirmación

Al empezar a trabajar, confirma al equipo que leíste **agents.md**, esta guía y **todos** los documentos operativos de la tabla. Si algo no queda claro, pregunta **antes** de pushear o mergear.

---

## 2. Modelo de ramas

| Rama | Uso | ¿Puedes pushear directo? |
|------|-----|---------------------------|
| **`infra/staging-cicd`** | Integración / trabajo del cliente | **Sí** — aquí van todos tus cambios |
| **`main`** | Producción | **No** push directo — entra vía PR que **Manus abre y mergea** (0 aprobaciones) |
| **`feature/*`** | Ramas temporales (opcional) | Sí; el destino de integración es `infra/staging-cicd` |

```text
Tu trabajo  →  push a infra/staging-cicd  (sin CI)
                      ↓
              Manus abre PR hacia main
                      ↓
              Manus mergea el PR  (no espera al equipo)
                      ↓
              CI en main  →  si pasa  →  CD producción
```

**Regla principal:** todo lo que hagas se sube a **`infra/staging-cicd`**. Nunca hagas push directo a `main`. Para publicar, **tú** abres el PR y **tú** lo mergeas; no dejes el merge “a cargo del equipo”.

---

## 3. Configuración inicial (una sola vez)

```bash
git clone git@github.com:Alejoss/SigeConsultores.git
cd SigeConsultores   # o sige-app, según el nombre de la carpeta local

pnpm install
cp .env.example .env.local
# Editar .env.local con OAuth, JWT, DATABASE_URL, etc.

docker compose up -d mysql   # MySQL local
pnpm db:push
pnpm dev
```

Comprueba que la app arranca en **http://localhost:3000** antes de seguir.

---

## 4. Traer los últimos cambios de `main`

Haz esto **al inicio de cada jornada** o **antes de empezar una tarea nueva**, para no trabajar sobre código desactualizado.

```bash
# Asegúrate de no tener cambios sin guardar (commit o stash primero)
git fetch origin

# Cambia a la rama de staging
git checkout infra/staging-cicd

# Incorpora lo último de main en tu rama de trabajo
git merge origin/main
```

Si Git reporta conflictos, resuélvelos en tu editor, luego:

```bash
git add .
git commit -m "merge: sync infra/staging-cicd with main"
```

**Alternativa (historial más lineal):**

```bash
git checkout infra/staging-cicd
git fetch origin
git rebase origin/main
```

Usa `rebase` solo si te sientes cómodo resolviendo conflictos; si no, `merge` es más seguro.

---

## 5. Flujo diario de trabajo

### A. Antes de codear

```bash
git checkout infra/staging-cicd
git fetch origin
git merge origin/main
git pull origin infra/staging-cicd   # por si otros ya pushearon
```

### B. Mientras desarrollas

```bash
pnpm dev          # servidor local
pnpm check        # typecheck (ejecutar antes de pushear)
pnpm build        # build completo (recomendado antes de pushear)
pnpm test         # si tocaste lógica de servidor
```

### C. Subir tus cambios (siempre a staging)

```bash
git status
git add <archivos>    # o git add . con cuidado
git commit -m "feat: descripción clara del cambio"
git push origin infra/staging-cicd
```

Tras el push a staging **no** corre CI. Cuando el trabajo esté listo para producción:

### D. Pasar a producción (lo hace Manus, no el equipo)

El ruleset de `main` exige un PR con **0 aprobaciones**. Manus **debe** completar el ciclo; **no** digas que el siguiente paso es “esperar revisión del equipo”.

1. Abrir un **Pull Request** de `infra/staging-cicd` → `main` (título y descripción claros).
2. **Mergear el PR de inmediato** (merge/squash/rebase según lo permitido). No esperes aprobación humana.
3. Tras el merge, corre el **único CI** en `main`. Supervisa Actions (estado y logs).
4. Si CI = **success** → se dispara **Deploy Production**. Si CI falla → **no hay CD**; corrige en staging, push, nuevo PR (o actualiza el existente) y **vuelve a mergear**.

Ejemplo con GitHub CLI (si está disponible):

```bash
gh pr create --base main --head infra/staging-cicd --title "feat: …" --body "…"
gh pr merge --merge   # o --squash
gh run watch          # opcional: seguir el CI en main
```

También puedes mergear desde la API/UI de GitHub con el PAT del colaborador Write.

---

## 6. Qué NO hacer

- **No** pushear a `main` directamente (el ruleset exige PR).
- **No** dejar el PR abierto esperando que “el equipo” lo mergee: **Manus mergea**.
- **No** commitear `.env`, `.env.local`, `.env.production` ni credenciales.
- **No** hacer `git push --force` en `infra/staging-cicd` ni en `main`.
- **No** tocar el droplet ni secretos de deploy a mano; el CD lo hace Actions tras CI verde.
- **No** ignorar CI en rojo en `main`: corrige en staging, vuelve a abrir/actualizar PR y mergear.

---

## 7. Comandos de referencia rápida

| Acción | Comando |
|--------|---------|
| Ver rama actual | `git branch` |
| Cambiar a staging | `git checkout infra/staging-cicd` |
| Actualizar desde remoto | `git fetch origin` |
| Traer main a staging | `git merge origin/main` |
| Subir cambios | `git push origin infra/staging-cicd` |
| Ver estado | `git status` |
| Typecheck | `pnpm check` |
| Build | `pnpm build` |

---

## 8. Resolución de problemas frecuentes

### “Your branch is behind origin/infra/staging-cicd”

```bash
git pull origin infra/staging-cicd
```

### Conflictos al mergear `main`

1. Abre los archivos marcados como conflictivos.
2. Resuelve manualmente (quita marcadores `<<<<<<<`, `=======`, `>>>>>>>`).
3. `git add .` → `git commit`.

### CI falla en GitHub (tras merge a `main`)

1. Entra a **Actions** → run fallido → lee el log.
2. Reproduce en local: `pnpm check`, `pnpm build`, `pnpm test` / `pnpm test:integration`.
3. Corrige en `infra/staging-cicd`, commit, push, y **vuelve a mergear** a `main`.
4. Mientras CI esté en rojo, **no hay CD** (producción queda en la versión anterior).

### No tengo acceso al repo

Pide al owner (**Alejoss**) invitación de colaborador con permiso de **write** en GitHub.

---

## 9. Checklist antes de cada push (a staging)

- [ ] Leí `agents.md`, esta guía y los docs operativos (DEPLOYMENT, TESTING, GITHUB_SETUP, INFRASTRUCTURE, BACKUP_SYSTEM, FILE_STORAGE)
- [ ] Entiendo: staging **no** dispara CI; publicar = **Manus** mergea PR a `main` → CI → CD si pasa
- [ ] `git merge origin/main` (staging al día con main)
- [ ] `pnpm check` pasa en local
- [ ] `pnpm build` pasa en local (recomendado)
- [ ] `pnpm test` / `pnpm test:integration` si tocaste servidor o esquema
- [ ] Pruebas actualizadas ante cambios de esquema o comportamiento
- [ ] No hay secretos ni `.env` en el commit
- [ ] Push a **`infra/staging-cicd`**, no a `main`
- [ ] Mensaje de commit claro en español o inglés

### Tras publicar (checklist)

- [ ] PR `infra/staging-cicd` → `main` **creado y mergeado por Manus** (sin esperar al equipo)
- [ ] Actions en `main`: CI en verde (o fallo diagnosticado y corregido con nuevo merge)
- [ ] Si CI pasó: confirmar que el job Deploy Production corrió (o *Deploy skipped* solo por secretos)

---

Última revisión: julio 2026.
