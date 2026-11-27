import { AsyncLocalStorage } from "node:async_hooks";
import { TRPCError } from "@trpc/server";
import type { AnnualWorkspaceRecord } from "./store";
import { BUSINESS_TABLE_NAMES } from "./manifest";
import { acquireAnnualCompanyLease, assertLeaseWorkspaceWritable, runWithAnnualLeaseOwner, type AnnualCompanyLease } from "./lease";

export type AnnualScope = { workspace: AnnualWorkspaceRecord };
const annualScope = new AsyncLocalStorage<AnnualScope | undefined>();
const inputValidation = new AsyncLocalStorage<(() => Promise<void>) | undefined>();
const writeViolation = new AsyncLocalStorage<{ error?: TRPCError }>();
type WriteLeaseState = {
  workspace: AnnualWorkspaceRecord;
  acquiring?: Promise<AnnualCompanyLease>;
  lease?: AnnualCompanyLease;
  finishing?: boolean;
  finished: boolean;
  pending: Set<Promise<unknown>>;
};
const writeLeaseScope = new AsyncLocalStorage<WriteLeaseState | undefined>();

function rememberWriteFailure(error: unknown): never {
  if (error instanceof TRPCError && writeViolation.getStore()) writeViolation.getStore()!.error = error;
  throw error;
}

async function leaseFor(state: WriteLeaseState): Promise<AnnualCompanyLease> {
  if (state.finished) throw new TRPCError({ code: "FORBIDDEN", message: "La operación anual ya finalizó; no se permiten escrituras diferidas fuera de su lease." });
  if (!state.acquiring) state.acquiring = (async () => {
    const lease = await acquireAnnualCompanyLease(state.workspace.companyId);
    try { await assertLeaseWorkspaceWritable(lease, state.workspace); state.lease = lease; return lease; }
    catch (error) { await lease.release(); return rememberWriteFailure(error); }
  })();
  try { return await state.acquiring; } catch (error) { return rememberWriteFailure(error); }
}

/** Acquire once for the WHOLE authorized resolver/job/upload, not per SQL. */
export async function validateAnnualWriteAccess(): Promise<void> {
  const workspace = getAnnualScope()?.workspace;
  if (!workspace) return;
  assertAnnualWorkspaceWritable(workspace);
  const state = writeLeaseScope.getStore();
  if (!state || state.workspace.id !== workspace.id) throw new Error("Falta el estado de lease de la operación anual.");
  if (state.finishing) throw new TRPCError({ code: "FORBIDDEN", message: "La operación anual está finalizando; no admite escrituras diferidas." });
  await leaseFor(state);
}

async function finishWriteLease(state: WriteLeaseState): Promise<void> {
  state.finishing = true;
  // On HTTP disconnect, already started SQL still drains before unlocking.
  while (state.pending.size) await Promise.allSettled(Array.from(state.pending));
  state.finished = true;
  if (state.acquiring) {
    let lease: AnnualCompanyLease;
    try { lease = await state.acquiring; } catch { return; }
    await lease.release();
  }
}

function trackSql<T>(state: WriteLeaseState, promise: Promise<T>): Promise<T> {
  state.pending.add(promise);
  void promise.then(() => state.pending.delete(promise), () => state.pending.delete(promise));
  return promise;
}

/** Preserve a clear read-only failure even if a legacy query catches SQL errors. */
export async function runWithAnnualWriteGuard<T>(operation: () => T): Promise<T> {
  return writeViolation.run({}, async () => {
    const result = await operation();
    const error = writeViolation.getStore()?.error;
    if (error) throw error;
    return result;
  });
}

/** Request checks are separate from immutable workspace metadata/cache keys. */
export function runWithAnnualInputValidation<T>(validate: () => Promise<void>, operation: () => T): T {
  return inputValidation.run(validate, operation);
}

export async function validateAnnualRequestInput(): Promise<void> {
  await inputValidation.getStore()?.();
}

export function getAnnualScope(): AnnualScope | undefined {
  return annualScope.getStore();
}

export function runInAnnualScope<T>(workspace: AnnualWorkspaceRecord, operation: () => T): T {
  if (!Number.isSafeInteger(workspace.id) || workspace.id <= 0 ||
      !Number.isSafeInteger(workspace.companyId) || workspace.companyId <= 0 ||
      !Number.isSafeInteger(workspace.year) ||
      !["base", "namespace"].includes(workspace.storage) ||
      !["open", "closed"].includes(workspace.status)) {
    throw new Error("Metadatos del espacio anual inválidos; no se permite usar tablas originales como alternativa.");
  }
  // Never retain a mutable request/store object in ALS or in a cached client.
  const snapshot = Object.freeze({ ...workspace, strategy: Object.freeze({ ...workspace.strategy }) });
  const state: WriteLeaseState = { workspace: snapshot, finished: false, pending: new Set() };
  return runWithAnnualLeaseOwner(() => annualScope.run(Object.freeze({ workspace: snapshot }), () => writeLeaseScope.run(state, () => {
    let result: T;
    try { result = operation(); } catch (error) {
      void finishWriteLease(state).catch(() => {});
      throw error;
    }
    if (result && typeof (result as any).then === "function") {
      return Promise.resolve(result).finally(() => finishWriteLease(state)) as T;
    }
    void finishWriteLease(state).catch(() => {});
    return result;
  })));
}

export function withoutAnnualScope<T>(operation: () => T): T {
  return annualScope.run(undefined, () => writeLeaseScope.run(undefined, operation));
}

export function assertAnnualWorkspaceWritable(workspace: AnnualWorkspaceRecord): void {
  if (workspace.status === "closed") {
    const error = new TRPCError({
      code: "FORBIDDEN",
      message: `El año ${workspace.year} está cerrado y es de solo lectura. Las consultas que requieren inicializar o actualizar datos deben prepararse antes del cierre; no se permiten escrituras implícitas.`,
    });
    const guard = writeViolation.getStore();
    if (guard) guard.error = error;
    throw error;
  }
}

type Token = { text: string; value: string; start: number; end: number; kind: "identifier" | "literal" | "symbol" | "comment" };

/** Tokenization, not replacement by regex: literals, escaped quotes and comments are opaque. */
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const start = i;
    const char = sql[i];
    if (/\s/.test(char)) { i++; continue; }
    let kind: Token["kind"] = "symbol";
    if (char === "'" || char === '"' || char === "`") {
      kind = char === "`" ? "identifier" : "literal";
      i++;
      let terminated = false;
      while (i < sql.length) {
        if (sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === char) {
          if (sql[i + 1] === char) { i += 2; continue; }
          i++; terminated = true; break;
        }
        i++;
      }
      if (!terminated) throw new Error("SQL anual: literal o identificador sin terminar.");
    } else if (char === "#" || (sql.slice(i, i + 2) === "--" && /\s|^$/.test(sql[i + 2] ?? ""))) {
      kind = "comment";
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (sql.slice(i, i + 2) === "/*") {
      kind = "comment";
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) throw new Error("SQL anual: comentario sin terminar.");
      // MySQL executable comments are SQL, not harmless comments. Fail closed.
      if (sql[i + 2] === "!" || sql[i + 2] === "+") {
        throw new Error("SQL anual: comentarios ejecutables y hints no admitidos en este ámbito.");
      }
      i = end + 2;
    } else if (/[A-Za-z_$]/.test(char)) {
      kind = "identifier";
      i++;
      while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) i++;
    } else { i++; }
    const text = sql.slice(start, i);
    tokens.push({ text, value: kind === "identifier" && char === "`" ? text.slice(1, -1).replace(/``/g, "`") : text, start, end: i, kind });
  }
  return tokens;
}

function keyword(token: Token | undefined): string {
  return token?.kind === "identifier" && !token.text.startsWith("`") ? token.value.toUpperCase() : "";
}

function isReadOnly(tokens: Token[]): boolean {
  const statements: Token[][] = [[]];
  for (const token of tokens) {
    if (token.text === ";") statements.push([]);
    else statements[statements.length - 1].push(token);
  }
  return statements.filter(statement => statement.length).every(statement => {
    const head = keyword(statement[0]);
    if (["BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT"].includes(head)) return true;
    if (head === "RELEASE") return keyword(statement[1]) === "SAVEPOINT";
    if (head === "START") return keyword(statement[1]) === "TRANSACTION";
    if (head === "SET") return keyword(statement[1]) === "TRANSACTION" &&
      statement.every(token => token.text !== "=" && token.text !== ":");
    if (!["SELECT", "SHOW", "DESCRIBE", "DESC", "WITH"].includes(head)) return false;
    if (head === "SHOW" && keyword(statement[1]) === "CREATE") return true;
    // WITH can conceal DML; SELECT can write files, acquire locks, or assign variables.
    const unsafe = new Set(["INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "TRUNCATE", "INTO", "OUTFILE", "DUMPFILE", "CALL", "LOAD", "FOR", "LOCK", "GET_LOCK", "RELEASE_LOCK"]);
    // A stored/UDF function may write despite being invoked by SELECT. Only
    // known SQL read functions/grammar are accepted in closed workspaces.
    const readFunctions = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "IFNULL", "NULLIF", "IF", "ABS", "ROUND", "CEIL", "CEILING", "FLOOR", "MOD", "POWER", "SQRT", "LOWER", "UPPER", "TRIM", "LTRIM", "RTRIM", "CONCAT", "CONCAT_WS", "LENGTH", "CHAR_LENGTH", "SUBSTRING", "SUBSTR", "LEFT", "RIGHT", "REPLACE", "LOCATE", "INSTR", "NOW", "CURDATE", "CURRENT_DATE", "CURRENT_TIMESTAMP", "DATE", "YEAR", "MONTH", "DAY", "DAYOFMONTH", "DATEDIFF", "TIMESTAMPDIFF", "DATE_FORMAT", "DATE_ADD", "DATE_SUB", "EXTRACT", "CAST", "CONVERT", "JSON_EXTRACT", "JSON_UNQUOTE", "JSON_LENGTH", "JSON_CONTAINS", "JSON_OBJECT", "JSON_ARRAY", "GROUP_CONCAT", "ROW_NUMBER", "RANK", "DENSE_RANK", "DATABASE", "VERSION", "FOUND_ROWS", "AS", "IN", "EXISTS", "OVER", "MATCH", "AGAINST"]);
    return statement.every((token, i) => {
      if (unsafe.has(keyword(token)) || token.text === ":" || token.text === "@") return false;
      // REPLACE is either safe built-in string replacement or DML. A qualified
      // stored function named REPLACE/COUNT/etc is not the built-in.
      if (keyword(token) === "REPLACE" && statement[i + 1]?.text !== "(") return false;
      if (token.kind === "identifier" && statement[i + 1]?.text === "(") {
        return statement[i - 1]?.text !== "." && readFunctions.has(keyword(token));
      }
      return true;
    });
  });
}

/** Transaction control is safe in closed read transactions, but is NOT a read
 * that can escape its operation/connection (especially COMMIT and SAVEPOINT).
 */
function isKnownReadOnly(tokens: Token[]): boolean {
  const heads = tokens.filter((token, i) => i === 0 || tokens[i - 1].text === ";")
    .filter(token => token.text !== ";");
  return heads.length > 0 && heads.every(token => ["SELECT", "SHOW", "DESCRIBE", "DESC", "WITH"].includes(keyword(token))) && isReadOnly(tokens);
}

/**
 * Rewrite only table bindings. An implicit alias preserves original qualified
 * column references without modifying any column/alias token (Drizzle and raw).
 * Explicit aliases are left byte-for-byte intact. No table existence fallback.
 */
export function rewriteAnnualSql(sql: string, workspace: AnnualWorkspaceRecord): string {
  const tokens = tokenize(sql).filter(token => token.kind !== "comment");
  if (workspace.status === "closed" && !isReadOnly(tokens)) assertAnnualWorkspaceWritable(workspace);
  if (tokens.some(token => token.kind === "identifier" && ["GET_LOCK", "RELEASE_LOCK", "RELEASE_ALL_LOCKS"].includes(token.value.toUpperCase()))) {
    throw new Error("SQL anual: los locks pertenecen al protocolo de escritura/cierre, no al SQL empresarial.");
  }
  if (tokens.some((token, i) => ["PREPARE", "EXECUTE", "CALL", "HANDLER", "LOAD"].includes(keyword(token)) ||
      (keyword(token) === "USE" && (i === 0 || tokens[i - 1]?.text === ";")))) {
    throw new Error("SQL anual: ejecución dinámica/cambio de base no admitidos; no hay fallback a originales.");
  }
  if (workspace.storage !== "namespace") return sql;
  if (!Number.isSafeInteger(workspace.id) || workspace.id <= 0) throw new Error("Namespace anual inválido.");
  const names = new Map(BUSINESS_TABLE_NAMES.map(name => [name.toLowerCase(), name]));
  const prefix = `aw_${workspace.id}_`;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const clauseEnd = new Set(["WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "UNION", "SET", "VALUES", "RETURNING", "ON"]);
  const aliasKeywords = new Set([...Array.from(clauseEnd), "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "NATURAL", "STRAIGHT_JOIN", "FORCE", "USE", "IGNORE", "PARTITION"]);
  const modes = new Map<number, boolean>();
  const statementHeads = new Map<number, string>();
  let depth = 0;
  let expected: "alias" | "plain" | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const word = keyword(token);
    if (["PREPARE", "EXECUTE", "CALL", "HANDLER", "LOAD", "GET_LOCK", "RELEASE_LOCK", "RELEASE_ALL_LOCKS"].includes(word) ||
        (word === "USE" && i === 0)) {
      throw new Error("SQL anual: ejecución dinámica/cambio de base no admitidos; no hay fallback a originales.");
    }
    if (word === "WITH") {
      // CTEs are supported unless they shadow a business table name. Such SQL is
      // ambiguous for this table-binding lexer and must never fall back silently.
      for (let j = i + 1; j < tokens.length; j++) {
        if (names.has(tokens[j].value.toLowerCase()) && keyword(tokens[j + 1]) === "AS" && tokens[j + 2]?.text === "(") {
          throw new Error("SQL anual: CTE con nombre de tabla empresarial no admitido.");
        }
      }
    }
    if (token.text === ";") { expected = undefined; modes.clear(); statementHeads.clear(); depth = 0; continue; }
    if (token.text === "(") {
      depth++;
      if (expected && !["SELECT", "WITH"].includes(keyword(tokens[i + 1]))) modes.set(depth, true);
      else expected = undefined;
      continue;
    }
    if (token.text === ")") { modes.delete(depth); statementHeads.delete(depth); depth--; expected = undefined; continue; }
    const head = statementHeads.get(depth);
    if (word === "SELECT" || (["INSERT", "REPLACE", "UPDATE", "DELETE", "SHOW", "DESC", "DESCRIBE"].includes(word) && (!head || head === "WITH"))) statementHeads.set(depth, word);
    if (word === "WITH" && !head) statementHeads.set(depth, word);
    if ((!head && (word === "DESC" || word === "DESCRIBE")) ||
        (word === "FROM" && statementHeads.get(depth) === "SHOW")) { expected = "plain"; continue; }
    if ((word === "FROM" && ["SELECT", "DELETE"].includes(statementHeads.get(depth) ?? "")) ||
        word === "JOIN" || word === "STRAIGHT_JOIN" || (word === "UPDATE" && (!head || head === "WITH"))) {
      expected = "alias"; modes.set(depth, true); continue;
    }
    if ((word === "INSERT" || word === "REPLACE") && !head) { expected = "plain"; continue; }
    if (word === "INTO" || word === "TABLE") { expected = "plain"; continue; }
    if (clauseEnd.has(word)) { if (word !== "ON") modes.set(depth, false); expected = undefined; continue; }
    if (token.text === "," && modes.get(depth)) { expected = "alias"; continue; }
    if (!expected) continue;
    if (["LOW_PRIORITY", "IGNORE", "IF", "NOT", "EXISTS", "ONLY"].includes(word)) continue;
    const binding = expected;
    expected = undefined;
    if (token.kind !== "identifier") continue;
    let last = i;
    while (tokens[last + 1]?.text === "." && tokens[last + 2]?.kind === "identifier") last += 2;
    const table = tokens[last];
    const original = names.get(table.value.toLowerCase());
    if (/^aw_\d+_/i.test(table.value) && !table.value.startsWith(prefix)) {
      throw new Error("SQL anual: referencia a otro namespace no permitida.");
    }
    if (original) {
      const next = tokens[last + 1];
      const explicitAlias = keyword(next) === "AS" ||
        (next?.kind === "identifier" && (!keyword(next) || !aliasKeywords.has(keyword(next))));
      // Remove a schema qualifier: all annual namespaces live in the pool's DB.
      const alias = binding === "alias" && !explicitAlias ? ` AS \`${table.value.replace(/`/g, "``")}\`` : "";
      edits.push({ start: token.start, end: table.end, text: `\`${prefix}${original}\`${alias}` });
    }
    i = last;
  }
  for (const edit of edits.reverse()) sql = sql.slice(0, edit.start) + edit.text + sql.slice(edit.end);
  return sql;
}

/** A metadata-bound client, never a mutable global year or per-request connection. */
export function createAnnualClientProxy<T extends object>(client: T, workspace: AnnualWorkspaceRecord, validateInput?: () => Promise<void>): T {
  const snapshot = Object.freeze({ ...workspace, strategy: Object.freeze({ ...workspace.strategy }) });
  function proxy<U extends object>(object: U, pinned?: WriteLeaseState, detached = false, callback = false): U {
    return new Proxy(object, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property === "query" || property === "execute") {
        if (typeof value !== "function") throw new Error("Cliente SQL anual inválido.");
        return (...args: unknown[]) => {
          const first = args[0];
          const originalSql = typeof first === "string" ? first :
            first && typeof first === "object" && "sql" in first ? (first as { sql: unknown }).sql : undefined;
          if (typeof originalSql !== "string") throw new Error("SQL anual: query/execute requiere SQL explícito.");
          const rewritten = rewriteAnnualSql(originalSql, snapshot);
          const sqlTokens = tokenize(originalSql).filter(token => token.kind !== "comment");
          const readOnly = isReadOnly(sqlTokens);
          const knownRead = isKnownReadOnly(sqlTokens);
          const beginsTransaction = snapshot.status === "open" && ["BEGIN", "START", "SET"].includes(keyword(sqlTokens[0]));
          const scopedArgs = [...args];
          scopedArgs[0] = typeof first === "string" ? rewritten : { ...first as object, sql: rewritten };
          const ambient = writeLeaseScope.getStore();
          const state = pinned ?? (ambient?.workspace.id === snapshot.id ? ambient : undefined);
          if (callback) {
            // Callback/stream APIs cannot wait asynchronously for authorization.
            // They may only write using an already acquired pinned lease.
            // A pinned callback cannot switch to a promise pool synchronously.
            if (((state?.finishing || state?.finished) && (pinned || !knownRead)) || (!readOnly && !state?.lease?.active)) {
              throw new TRPCError({ code: "FORBIDDEN", message: "SQL callback anual sin lease activo; utilice query/execute promise scoped." });
            }
            const result = Reflect.apply(value, target, scopedArgs);
            if (state && !state.finishing && result && typeof result.once === "function") {
              trackSql(state, new Promise<void>(resolve => { result.once("end", resolve); result.once("error", resolve); }));
            }
            return result;
          }
          const execute = async (held?: WriteLeaseState) => {
            if (held?.finished) throw new TRPCError({ code: "FORBIDDEN", message: "La operación anual ya finalizó." });
            if (validateInput) await validateInput();
            // Every SQL after lease admission uses its SAME connection. This
            // covers transactions and avoids holding one connection for a lock
            // while attempting to borrow another for the business write.
            if (held && (!readOnly || (snapshot.status === "open" && !knownRead) || held.acquiring)) {
              const lease = await leaseFor(held);
              return Reflect.apply(Reflect.get(lease.connection, property), lease.connection, scopedArgs);
            }
            // A pinned handle may outlive its released lease. Late known reads
            // must use the original metadata-bound pool, never that connection.
            const driver = !held && pinned ? client : target;
            const query: unknown = Reflect.get(driver, property);
            if (typeof query !== "function") throw new Error("Cliente SQL anual inválido para lectura sin lease.");
            return Reflect.apply(query, driver, scopedArgs);
          };
          if (state?.finishing || state?.finished) {
            // Promise.all can reject while siblings are still reading; an array
            // argument can even throw before Promise.all observes its promises.
            // Immutable metadata + input validation still apply to known reads,
            // but no late SQL joins/reacquires the lease or delays its release.
            if (knownRead) return execute();
            return Promise.reject(new TRPCError({ code: "FORBIDDEN", message: "La operación anual está finalizando; no admite SQL diferido que requiera lease." }));
          }
          if (state) return trackSql(state, execute(state));
          if (readOnly && !beginsTransaction) return validateInput ? validateInput().then(() => Reflect.apply(value, target, scopedArgs)) : Reflect.apply(value, target, scopedArgs);
          if (beginsTransaction && !state) throw new Error("SQL anual: transacción requiere runInAnnualScope async o getConnection scoped con release; no se permite BEGIN aislado en un pool.");
          // A metadata-bound handle can escape its request. A new direct write
          // is still checked against live metadata under the common lock.
          const oneSql: WriteLeaseState = { workspace: snapshot, finished: false, pending: new Set() };
          return runWithAnnualLeaseOwner(() => execute(oneSql).finally(() => finishWriteLease(oneSql)));
        };
      }
      if (property === "getConnection") {
        if (typeof value !== "function") throw new Error("Pool SQL anual inválido.");
        return async (...args: unknown[]) => {
          if (snapshot.status === "closed") {
            if (validateInput) await validateInput();
            return proxy(await Reflect.apply(value, target, args) as object);
          }
          // getConnection has no SQL to classify: an OPEN handle remains a write
          // capability and requires admission. Do not grant one after scope end.
          const ambient = writeLeaseScope.getStore();
          const state = pinned ?? (ambient?.workspace.id === snapshot.id ? ambient : undefined);
          const held: WriteLeaseState = state ?? { workspace: snapshot, finished: false, pending: new Set<Promise<unknown>>() };
          if (held.finishing) throw new TRPCError({ code: "FORBIDDEN", message: "La operación anual está finalizando." });
          if (validateInput) await validateInput();
          const lease = await leaseFor(held);
          return proxy(lease.connection, held, !state);
        };
      }
      if (property === "prepare" || property === "changeUser") {
        return () => { throw new Error("SQL anual: prepared statements externos/cambio de base no admitidos; utilice execute/query scoped."); };
      }
      if (pinned && ["release", "end", "destroy"].includes(String(property))) {
        // Drizzle releases its transaction/iterator handle, not the resolver's
        // common lock. Detached connection users own their release themselves.
        return () => detached ? finishWriteLease(pinned) : undefined;
      }
      if (["beginTransaction", "commit", "rollback"].includes(String(property)) && typeof value === "function") {
        return () => (receiver as any).query(property === "beginTransaction" ? "BEGIN" : String(property).toUpperCase());
      }
      // Drizzle's iterator uses the callback connection directly; protect it too.
      if (property === "connection" && value && typeof value === "object") return proxy(value, pinned, detached, true);
      if (property === "pool") return receiver; // do not expose the unscoped callback pool
      if (property === "promise" && typeof value === "function") return () => receiver;
      return typeof value === "function" ? value.bind(target) : value;
    },
    });
  }
  return proxy(client);
}
