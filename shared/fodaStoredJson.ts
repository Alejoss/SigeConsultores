/**
 * Lee categorías FODA almacenadas sin escribir ni normalizar sus propiedades.
 * Algunos registros antiguos contienen controles C0 literales dentro de cadenas;
 * solo ese defecto se recupera, conservando los caracteres originales al parsear.
 * No debe usarse para admitir payloads entrantes ni para reparar otros errores JSON.
 */
export function parseStoredFodaArray<T extends object = Record<string, unknown>>(
  serialized: string | null | undefined
): T[] {
  if (serialized === null || serialized === undefined || serialized === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (strictError) {
    let inString = false;
    let escaped = false;
    let changed = false;
    const recovered: string[] = [];

    for (const character of serialized) {
      if (!inString) {
        recovered.push(character);
        if (character === '"') inString = true;
      } else if (escaped) {
        // Preserve even invalid/partial escapes: JSON.parse must reject them.
        recovered.push(character);
        escaped = false;
      } else if (character === "\\") {
        recovered.push(character);
        escaped = true;
      } else if (character === '"') {
        recovered.push(character);
        inString = false;
      } else if (character.charCodeAt(0) < 0x20) {
        recovered.push(`\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
        changed = true;
      } else {
        recovered.push(character);
      }
    }

    if (!changed) throw strictError;
    parsed = JSON.parse(recovered.join(""));
  }

  if (!Array.isArray(parsed)) throw new Error("El FODA almacenado no es un arreglo.");
  if (parsed.some(item => item === null || typeof item !== "object" || Array.isArray(item))) {
    throw new Error("El FODA almacenado contiene una fila que no es un objeto.");
  }
  return parsed as T[];
}
