# Guía de trabajo con Git — Manus

Instrucciones para sincronizar el repositorio **SIGE Platform** y publicar cambios de forma segura.

**Repositorio:** [Alejoss/SigeConsultores](https://github.com/Alejoss/SigeConsultores) (privado)

---

## 1. Lectura obligatoria

Antes de tocar código, **lee la documentación completa del proyecto**. No es opcional: describe cómo se desarrolla, despliega y opera la plataforma.

### Punto de entrada

1. [README.md](../README.md) — instalación local, comandos, stack y estructura del repo.
2. [docs/README.md](./README.md) — índice de toda la documentación.

### Documentación operativa (leer completa)

| Documento | Por qué importa |
|-----------|-----------------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Flujo de ramas, CI/CD, deploy manual y automático |
| [GITHUB_SETUP.md](./GITHUB_SETUP.md) | Workflows de GitHub Actions, secretos, permisos |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | Arquitectura: droplet, Docker, OAuth, S3, correo |
| [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md) | Respaldos diarios y restauración |
| [FILE_STORAGE.md](./FILE_STORAGE.md) | Subida de archivos a S3 |

### Variables de entorno

- Local: [.env.example](../.env.example) → copiar a `.env.local`
- Producción (referencia): [.env.production.example](../.env.production.example) — **no commitear** archivos `.env` reales

### Confirmación

Al empezar a trabajar, confirma al equipo que leíste los documentos anteriores. Si algo no queda claro, pregunta **antes** de pushear.

---

## 2. Modelo de ramas

| Rama | Uso | ¿Puedes pushear directo? |
|------|-----|---------------------------|
| **`infra/staging-cicd`** | Integración / trabajo del cliente | **Sí** — aquí van todos tus cambios |
| **`main`** | Producción | **No** — solo entra vía Pull Request revisado |
| **`feature/*`** | Ramas temporales (opcional) | Sí, pero el destino final sigue siendo `infra/staging-cicd` o PR hacia ella |

```text
Tu trabajo  →  push a infra/staging-cicd  →  CI (check + build)
                      ↓
              PR hacia main  →  revisión  →  merge  →  deploy producción
```

**Regla principal:** todo lo que hagas se sube a **`infra/staging-cicd`**. Nunca hagas push directo a `main`.

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

Tras el push, GitHub Actions ejecuta **CI** (`pnpm check` + `pnpm build`). Revisa en **Actions** que el workflow quede en verde.

### D. Pasar a producción (no lo hace Manus solo)

Cuando el trabajo en `infra/staging-cicd` esté listo y CI en verde:

1. Abrir un **Pull Request** de `infra/staging-cicd` → `main`
2. Esperar revisión del equipo
3. Merge del PR → se dispara deploy a producción

---

## 6. Qué NO hacer

- **No** pushear a `main` directamente.
- **No** commitear `.env`, `.env.local`, `.env.production` ni credenciales.
- **No** hacer `git push --force` en `infra/staging-cicd` ni en `main`.
- **No** desplegar al droplet de producción sin coordinación con el equipo (ver [DEPLOYMENT.md](./DEPLOYMENT.md)).
- **No** ignorar CI en rojo: corrige o comenta en el PR qué falla.

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

### CI falla en GitHub

1. Entra a **Actions** → run fallido → lee el log.
2. Reproduce en local: `pnpm check` y `pnpm build`.
3. Corrige, commit y push de nuevo a `infra/staging-cicd`.

### No tengo acceso al repo

Pide al owner (**Alejoss**) invitación de colaborador con permiso de **write** en GitHub.

---

## 9. Checklist antes de cada push

- [ ] Leí / repasé la documentación relevante para lo que toqué
- [ ] `git merge origin/main` (staging al día con main)
- [ ] `pnpm check` pasa en local
- [ ] `pnpm build` pasa en local (recomendado)
- [ ] No hay secretos ni `.env` en el commit
- [ ] Push a **`infra/staging-cicd`**, no a `main`
- [ ] Mensaje de commit claro en español o inglés

---

Última revisión: mayo 2026.
