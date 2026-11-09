# Protección del documento del mapa de procesos

Corrección preparada el 6 de noviembre e integrada el 8 de noviembre de 2026 sobre main 5ea5ab0. Despliegue autorizado por el usuario.

## Diagnóstico del código anterior

`processMap.uploadMapImage` eliminaba el registro anterior y su archivo antes de cargar el nuevo. Un error de carga o persistencia podía dejar a la empresa sin documento. `Eliminar Mapa` ejecutaba la mutación sin confirmación. `getMapImage` convertía errores de consulta o almacenamiento en `null`, que la pantalla interpretaba como ausencia de mapa.

Estos hallazgos no prueban cuál fue la causa de una desaparición en una empresa concreta. No se consultaron registros ni archivos de clientes, logs de Producción, S3 ni bases de datos empresariales.

## Comportamiento protegido

- Consulta y estado a la izquierda; Reemplazar Mapa y Eliminar Mapa a la derecha.
- Seleccionar un archivo de reemplazo abre una confirmación con su nombre. Cancelar no envía ni elimina nada.
- La primera subida, cuando no existe mapa, no exige confirmación de reemplazo.
- El reemplazo debe subir el archivo nuevo y persistir su referencia antes de retirar el anterior. Si falla, se conserva el registro y archivo anterior.
- Eliminar Mapa requiere su propia confirmación e informa que solo retira el documento, no los procesos ni subprocesos.
- La interfaz distingue errores de consulta de ausencia real del documento y ofrece Reintentar.
- Se bloquean operaciones durante carga/lectura, y los Jefes de Proceso siguen en consulta. Permisos del servidor sin cambios.

## Verificación y alcance

Pruebas mockeadas de almacenamiento/DB y componentes con archivos ficticios; verificación visual en escritorio y celular. Sin cambios de esquema, migraciones, restauraciones, correo, credenciales ni datos de empresas. No hay versionado histórico ni auditoría de usuarios nuevos en esta entrega. Publicación autorizada el 8 de noviembre mediante staging → PR a main → CI/CD. La integración añade cuatro pruebas MySQL con fixtures propios y limpieza de documentos creados dinámicamente. Suite final: 948 pruebas unitarias/cliente y 251 de integración aprobadas; TypeScript, build y revisión visual de escritorio/celular correctos. No se restaura ni sustituye el mapa de una empresa durante el despliegue.
