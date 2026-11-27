import { TRPCError } from "@trpc/server";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { AnnualWorkspaceRecord } from "./store";

/**
 * One admitted annual operation per process, BEFORE borrowing from the unique
 * pool. A waiter never owns a connection while waiting for another annual
 * operation. GET_LOCK(…,0) also avoids pool starvation across server processes.
 * This deliberately conservative bound leaves the default pool's other nine
 * connections available to canonical auth/ACL/retention calls within a lease.
 */
let queue: Promise<void> = Promise.resolve();
const leaseOwner = new AsyncLocalStorage<{ lease?: AnnualCompanyLease; acquiring?: boolean }>();
export function runWithAnnualLeaseOwner<T>(operation: () => T): T {
  return leaseOwner.run(leaseOwner.getStore() ?? {}, operation);
}
async function enterQueue(): Promise<() => void> {
  const previous = queue;
  let leave!: () => void;
  queue = new Promise<void>(resolve => { leave = resolve; });
  await previous;
  return leave;
}

export type AnnualCompanyLease = {
  readonly companyId: number;
  readonly connection: PoolConnection;
  readonly active: boolean;
  release(): Promise<void>;
};

export async function acquireAnnualCompanyLease(companyId: number): Promise<AnnualCompanyLease> {
  if (!Number.isSafeInteger(companyId) || companyId <= 0) throw new Error("Empresa inválida para lease anual.");
  const owner = leaseOwner.getStore();
  if (owner?.acquiring || owner?.lease?.active) {
    throw new TRPCError({ code: "CONFLICT", message: "No se permite iniciar otra operación anual dentro de una escritura autorizada; finaliza su lease primero." });
  }
  if (owner) owner.acquiring = true;
  const leave = await enterQueue();
  let connection: PoolConnection | undefined;
  const key = `isge:annual:${companyId}`;
  try {
    // Lazy import prevents the db -> runtime -> lease -> db initialization cycle.
    const { getDatabasePool } = await import("../db");
    const deadline = Date.now() + 30_000;
    for (;;) {
      connection = await getDatabasePool().getConnection();
      const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?,0) acquired", [key]);
      if (Number(rows[0]?.acquired) === 1) break;
      connection.release(); connection = undefined;
      if (Date.now() >= deadline) throw new TRPCError({ code: "CONFLICT", message: "Otra operación anual está en curso; no se ha realizado ninguna escritura." });
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const held = connection;
    let active = true;
    let releasing: Promise<void> | undefined;
    const lease: AnnualCompanyLease = {
      companyId, connection: held,
      get active() { return active; },
      release() {
        if (releasing) return releasing;
        active = false;
        releasing = (async () => {
          let reusable = false;
          try {
            // An abandoned transaction must not outlive its lock (nor leak into
            // the next pool borrower). Explicit commits already remain committed.
            await held.rollback();
            const [released] = await held.query<RowDataPacket[]>("SELECT RELEASE_LOCK(?) released", [key]);
            if (Number(released[0]?.released) !== 1) throw new Error("No se pudo liberar el lock anual.");
            reusable = true;
          } finally {
            if (reusable) held.release(); else held.destroy();
            leave();
          }
        })();
        return releasing;
      },
    };
    if (owner) { owner.lease = lease; owner.acquiring = false; }
    return lease;
  } catch (error) {
    // Destroy if query itself failed: the server may have acquired its lock.
    connection?.destroy();
    if (owner) owner.acquiring = false;
    leave();
    throw error;
  }
}

export async function assertLeaseWorkspaceWritable(lease: AnnualCompanyLease, workspace: AnnualWorkspaceRecord): Promise<void> {
  if (!lease.active || lease.companyId !== workspace.companyId) throw new Error("Lease anual inválido o finalizado.");
  const [rows] = await lease.connection.query<RowDataPacket[]>(
    "SELECT id,companyId,year,status,storage FROM annualWorkspaces WHERE id=? AND companyId=? AND year=?",
    [workspace.id, workspace.companyId, workspace.year],
  );
  const row = rows[0];
  if (workspace.status === "closed" || row?.status === "closed") {
    throw new TRPCError({ code: "FORBIDDEN", message: `El año ${workspace.year} está cerrado y es de solo lectura. La petición anterior al cierre no puede autorizar nuevas escrituras.` });
  }
  if (!row || row.status !== "open" || row.storage !== workspace.storage) {
    throw new TRPCError({ code: "CONFLICT", message: "El espacio anual cambió o no está disponible; recarga el contexto. No se permite escribir en tablas originales como alternativa." });
  }
}

export async function withAnnualCompanyLease<T>(companyId: number, operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  return runWithAnnualLeaseOwner(async () => {
    const lease = await acquireAnnualCompanyLease(companyId);
    try { return await operation(lease.connection); } finally { await lease.release(); }
  });
}
