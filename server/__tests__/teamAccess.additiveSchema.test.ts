import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ensureTeamAccessSchema, TEAM_ACCESS_TABLES } from '../../scripts/team-access-additive-schema.mjs';

describe('bootstrap aditivo de permisos canónicos', () => {
  it('producción usa el volumen histórico y no ejecuta un push general al arrancar', () => {
    const compose = readFileSync(new URL('../../docker-compose.prod.yml', import.meta.url), 'utf8');
    const entrypoint = readFileSync(new URL('../../docker/entrypoint.sh', import.meta.url), 'utf8');
    expect(compose).toMatch(/RUN_DB_PUSH_ON_STARTUP:\s*"false"/);
    expect(compose).toContain('mysql_staging_data:/var/lib/mysql');
    const bootstrap = entrypoint.indexOf('node scripts/team-access-additive-schema.mjs');
    expect(bootstrap).toBeGreaterThan(-1);
    expect(bootstrap).toBeLessThan(entrypoint.indexOf('exec node dist/index.js'));
    expect(entrypoint).toContain('if [ "${RUN_DB_PUSH_ON_STARTUP:-true}" = "true" ]');
  });

  it('crea exactamente tres tablas nuevas sin ALTER, DROP ni DML', async () => {
    const calls: string[] = [];
    const connection = { query: async (sql: string, args?: string[]) => {
      calls.push(sql);
      if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [[], []];
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
        const name = args![0] as keyof typeof TEAM_ACCESS_TABLES;
        return [TEAM_ACCESS_TABLES[name].columns.map((column: string) => ({name: column, type: column === 'module' ? "enum('strategy','management_systems','change_management','company_foda','organization_personnel')" : column === 'accessLevel' ? name === 'companyTeamModuleAccess' ? "enum('none','read','write')" : "enum('read','write')" : 'int'})), []];
      }
      return [[], []];
    }};
    await expect(ensureTeamAccessSchema(connection, () => {})).resolves.toEqual({checked:3,created:3});
    expect(calls.filter(sql=>sql.startsWith('CREATE TABLE'))).toHaveLength(3);
    expect(calls.some(sql=>/^(ALTER|DROP|DELETE|UPDATE|INSERT)\b/.test(sql))).toBe(false);
  });

  it('no modifica tablas ya existentes y detiene un esquema incompatible', async () => {
    const calls: string[] = [];
    const connection={query:async(sql:string,args?:string[])=>{
      calls.push(sql);
      if(sql.includes('INFORMATION_SCHEMA.TABLES'))return [[{TABLE_NAME:args![0]}],[]];
      if(sql.includes('INFORMATION_SCHEMA.COLUMNS'))return [[{name:'otroCampo',type:'int'}],[]];
      throw Error('DDL no autorizado');
    }};
    await expect(ensureTeamAccessSchema(connection,()=>{})).rejects.toThrow('incompatible');
    expect(calls.every(sql=>sql.startsWith('SELECT'))).toBe(true);
  });
});
