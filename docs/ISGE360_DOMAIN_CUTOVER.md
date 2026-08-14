# Cambio controlado de dominio y marca: ISGE 360

> Este documento **no ejecuta ningún cambio en producción**. Sirve como lista de verificación para el momento en que se autorice el despliegue de la nueva identidad.

## Dominio oficial

| Elemento | Valor oficial |
|---|---|
| Nombre de producto | **ISGE 360** |
| Lema | **La estrategia hecha gestión.** |
| URL pública | `https://isge360.com` |
| Inicio de sesión | `https://isge360.com/login` |
| Callback OAuth | `https://isge360.com/api/oauth/callback` |

## Configuración requerida en producción

En el archivo privado `.env.production` del servidor deben quedar los siguientes valores:

```dotenv
FRONTEND_URL=https://isge360.com
VITE_FRONTEND_URL=https://isge360.com
BREVO_FROM_NAME=ISGE 360
```

No se deben almacenar ni publicar secretos en este documento.

## Verificaciones previas al despliegue

1. Confirmar que el certificado TLS de `isge360.com` está activo y que el proxy dirige el dominio a la aplicación.
2. Registrar `https://isge360.com/api/oauth/callback` como URL de retorno autorizada en el proveedor OAuth.
3. Mantener temporalmente el dominio anterior redirigido a `https://isge360.com`, si sigue disponible, para no interrumpir enlaces anteriores.
4. Confirmar el correo remitente que se usará para comunicaciones. El nombre visible será **ISGE 360**; la dirección de correo debe validarse por separado.
5. Tras un despliegue autorizado, comprobar login, recuperación de contraseña, invitaciones, alertas de cronograma, enlaces de correos y archivos exportados.

## Alcance del cambio de marca en código

La plataforma local ya prepara el logo, icono, título, tipografía Poppins, textos visibles, correos, documentos exportados y fuentes de API para ISGE 360. La producción permanece sin cambios hasta recibir autorización expresa.
