import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";

/**
 * Role-Based Access Control (RBAC) utilities
 * Defines access levels and permission checks for different user roles
 */

export enum UserRole {
  ADMIN = "admin",
  GENERAL_MANAGER = "general_manager",
  PROCESS_LEADER = "process_leader",
  COLLABORATOR = "collaborator",
}

/**
 * Permission matrix: defines what each role can do
 * 
 * Admin: Full access to everything
 * General Manager: Full access to their company and all its processes
 * Process Leader: Read access to company info, write access only to their assigned process
 * Collaborator: Read access to company info, write access only to their leader's process
 */

export function getUserRole(user: User | null): UserRole {
  if (!user) return UserRole.COLLABORATOR;
  
  if (user.role === "admin") {
    return UserRole.ADMIN;
  }
  
  // For now, we treat regular OAuth users as General Managers
  // In the future, we might add a specific role field
  return UserRole.GENERAL_MANAGER;
}

/**
 * Check if user has permission to access a company
 */
export function canAccessCompany(
  user: User | null,
  companyId: number,
  userCompanyId?: number
): boolean {
  if (!user) return false;
  
  const role = getUserRole(user);
  
  if (role === UserRole.ADMIN) {
    return true;
  }
  
  if (role === UserRole.GENERAL_MANAGER) {
    // General Manager can access their own company
    return userCompanyId === companyId;
  }
  
  if (role === UserRole.PROCESS_LEADER || role === UserRole.COLLABORATOR) {
    // Process leaders can access their company
    return userCompanyId === companyId;
  }
  
  return false;
}

/**
 * Check if user has permission to edit a company
 */
export function canEditCompany(
  user: User | null,
  companyId: number,
  userCompanyId?: number
): boolean {
  if (!user) return false;
  
  const role = getUserRole(user);
  
  if (role === UserRole.ADMIN) {
    return true;
  }
  
  if (role === UserRole.GENERAL_MANAGER) {
    // General Manager can edit their own company
    return userCompanyId === companyId;
  }
  
  // Process leaders and collaborators cannot edit company info
  return false;
}

/**
 * Check if user has permission to access a process
 */
export function canAccessProcess(
  user: User | null,
  processId: number,
  userProcessId?: number
): boolean {
  if (!user) return false;
  
  const role = getUserRole(user);
  
  if (role === UserRole.ADMIN) {
    return true;
  }
  
  if (role === UserRole.GENERAL_MANAGER) {
    // General Manager can access all processes in their company
    return true;
  }
  
  if (role === UserRole.PROCESS_LEADER || role === UserRole.COLLABORATOR) {
    // Process leaders can only access their assigned process
    return userProcessId === processId;
  }
  
  return false;
}

/**
 * Check if user has permission to edit a process
 */
export function canEditProcess(
  user: User | null,
  processId: number,
  userProcessId?: number
): boolean {
  if (!user) return false;
  
  const role = getUserRole(user);
  
  if (role === UserRole.ADMIN) {
    return true;
  }
  
  if (role === UserRole.GENERAL_MANAGER) {
    // General Manager can edit all processes in their company
    return true;
  }
  
  if (role === UserRole.PROCESS_LEADER || role === UserRole.COLLABORATOR) {
    // Process leaders can only edit their assigned process
    return userProcessId === processId;
  }
  
  return false;
}

/**
 * Throw error if user doesn't have permission
 */
export function requirePermission(
  condition: boolean,
  message: string = "No tienes permiso para realizar esta acción"
): void {
  if (!condition) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message,
    });
  }
}

/**
 * Throw error if user is not authenticated
 */
export function requireAuth(user: User | null): asserts user is User {
  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Debes estar autenticado para realizar esta acción",
    });
  }
}

/**
 * Throw error if user is not an admin
 */
export function requireAdmin(user: User | null): void {
  requireAuth(user);
  if (user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo los administradores pueden realizar esta acción",
    });
  }
}

/**
 * Throw error if user is not a general manager or admin
 */
export function requireManagerOrAdmin(user: User | null): void {
  requireAuth(user);
  const role = getUserRole(user);
  if (role !== UserRole.GENERAL_MANAGER && role !== UserRole.ADMIN) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo los gerentes generales y administradores pueden realizar esta acción",
    });
  }
}
