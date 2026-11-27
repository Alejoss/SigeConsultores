import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { getDatabasePool } from '../db';
import { assertAnnualIntegrationDatabase } from './helpers/annualTestSafety';
import { annualCorporateHttpScope } from '../annual/requestScope';
import { registerFileUploadRoutes } from '../_core/fileUploadRoutes';
import { registerManagementSystemUploadRoutes } from '../managementSystemUploadRoutes';
import { registerManagementProgramUploadRoutes } from '../managementProgramUploadRoutes';

const state = vi.hoisted(() => ({ auth: null as any, writes: [] as string[] }));
vi.mock('../_core/resolveRequestAuth', () => ({ resolveAuthFromRequest: async () => state.auth }));
vi.mock('../storage', () => ({
  storagePut: async (key: string) => { state.writes.push(key); return {key, url:'https://example.invalid/'+key}; },
}));
assertAnnualIntegrationDatabase();
const C=998741001, ACCOUNT=998741002, ROLE=998741003, OWN=998741011, EXTRA=998741012;
const pool=getDatabasePool();
const q=async(sql:string,args:unknown[]=[])=>{const [rows]=await pool.query(sql,args);return rows as any;};
let server:Server, url:string;
const fixtures:Record<string,number[]>={accounts:[ACCOUNT],account_roles:[ROLE],companies:[C],processes:[OWN,EXTRA]};
const inserted=new Map<string,number[]>();
async function seed(table:string,row:Record<string,unknown>){
  if(!fixtures[table]?.includes(Number(row.id)))throw Error('Fixture no registrada');
  const keys=Object.keys(row);
  await q('INSERT INTO `'+table+'` ('+keys.map(k=>'`'+k+'`').join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',keys.map(k=>row[k]));
  inserted.set(table,[...(inserted.get(table)??[]),Number(row.id)]);
}
async function upload(path:string,processId=EXTRA){
  const form=new FormData();
  form.append('companyId',String(C));form.append('processId',String(processId));
  form.append('file',new Blob(['Test fixture'],{type:'text/plain'}),'fixture.txt');
  return fetch(url+path,{method:'POST',body:form,headers:{'x-isge-company-id':String(C),'x-isge-year':'2026'}});
}

describe('permisos granulares HTTP con MySQL TEST real',()=>{
  beforeAll(async()=>{
    for(const [table,ids] of Object.entries(fixtures))if((await q('SELECT id FROM `'+table+'` WHERE id IN ('+ids.map(()=>'?').join(',')+')',ids)).length)throw Error('Fixture ocupada: '+table);
    const [role]=await q("SELECT id FROM roles WHERE slug='process_leader'");
    if(!role)throw Error('Falta rol canónico');
    await seed('accounts',{id:ACCOUNT,openId:'team-access-http-998741',name:'HTTP fixture',email:'team-access-http@example.invalid',status:'active'});
    await seed('companies',{id:C,name:'HTTP team access fixture',ownerAccountId:ACCOUNT,status:'Activa'});
    for(const id of [OWN,EXTRA])await seed('processes',{id,companyId:C,name:'HTTP process '+id,processType:'soporte'});
    await seed('account_roles',{id:ROLE,accountId:ACCOUNT,roleId:role.id,companyId:C,processId:OWN,status:'active'});
    state.auth={user:null,manager:null,processLeader:{processLeaderId:ACCOUNT,leaderName:'HTTP fixture',leaderEmail:'team-access-http@example.invalid',processId:OWN,companyId:C,companyName:'HTTP fixture'}};
    const app=express();app.use(express.json());
    app.use(['/api/upload','/api/import'],annualCorporateHttpScope);
    registerFileUploadRoutes(app);registerManagementSystemUploadRoutes(app);registerManagementProgramUploadRoutes(app);
    server=createServer(app);
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();if(!address||typeof address==='string')throw Error('Puerto inválido');
    url='http://127.0.0.1:'+address.port;
  });
  beforeEach(async()=>{
    state.writes=[];
    await q("UPDATE account_roles SET status='active' WHERE id=?",[ROLE]);
    await q("UPDATE annualWorkspaces SET status='open' WHERE companyId=?",[C]);
    await q('DELETE FROM companyTeamModuleAccess WHERE companyId=? AND accountId=?',[C,ACCOUNT]);
    await q('DELETE FROM companyTeamProcessAccess WHERE companyId=? AND accountId=?',[C,ACCOUNT]);
  });
  afterAll(async()=>{
    if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const table of ['companyTeamModuleAccess','companyTeamProcessAccess','companyTeamAccessAudit'])await q('DELETE FROM `'+table+'` WHERE companyId=? AND accountId=?',[C,ACCOUNT]);
    for(const table of ['annualFileRetentions','annualEntityLineage','annualProcessStates'])await q('DELETE FROM `'+table+'` WHERE workspaceId IN (SELECT id FROM annualWorkspaces WHERE companyId=?)',[C]);
    await q('DELETE FROM annualWorkspaces WHERE companyId=?',[C]);
    for(const table of ['account_roles','processes','companies','accounts']){
      const ids=inserted.get(table)??[];
      if(ids.length)await q('DELETE FROM `'+table+'` WHERE id IN ('+ids.map(()=>'?').join(',')+')',ids);
    }
  });
  it('deniega los uploads SIG antes de procesar archivos cuando el módulo está restringido',async()=>{
    await q("INSERT INTO companyTeamModuleAccess(companyId,accountId,module,accessLevel) VALUES(?,?,'management_systems','none')",[C,ACCOUNT]);
    for(const path of ['/api/upload/management-system-file','/api/upload/management-program-documentation']){
      const response=await upload(path);expect(response.status).toBe(403);
      expect(await response.text()).toContain('permiso');
    }
    expect(state.writes).toEqual([]);
  });
  it('autorizar Estrategia no autoriza uploads de Sistemas de Gestión',async()=>{
    await q("INSERT INTO companyTeamModuleAccess(companyId,accountId,module,accessLevel) VALUES(?,?,'strategy','write')",[C,ACCOUNT]);
    expect((await upload('/api/upload/management-system-file')).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it('autorizar SIG permite llegar a validación de formulario sin necesitar Coordinador global',async()=>{
    await q("INSERT INTO companyTeamModuleAccess(companyId,accountId,module,accessLevel) VALUES(?,?,'management_systems','write')",[C,ACCOUNT]);
    const response=await upload('/api/upload/management-system-file');
    expect(response.status).toBe(400);expect(await response.text()).toContain('Datos de carga inválidos');
    expect(state.writes).toEqual([]);
  });
  it('solo consulta de un proceso adicional no permite cargar archivos de procedimientos',async()=>{
    await q("INSERT INTO companyTeamProcessAccess(companyId,accountId,processId,accessLevel) VALUES(?,?,?,'read')",[C,ACCOUNT,EXTRA]);
    expect((await upload('/api/upload/procedure-file')).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it('edición explícita del proceso adicional permite subir archivos, y el proceso propio no se pierde',async()=>{
    await q("INSERT INTO companyTeamProcessAccess(companyId,accountId,processId,accessLevel) VALUES(?,?,?,'write')",[C,ACCOUNT,EXTRA]);
    expect((await upload('/api/upload/procedure-file')).status).toBe(200);
    expect((await upload('/api/upload/procedure-file',OWN)).status).toBe(200);
    expect(state.writes).toHaveLength(2);
  });
  it('el proxy genérico no permite eludir el acceso al documento por una URL conocida',async()=>{
    const response=await fetch(url+'/api/proxy/file?url='+encodeURIComponent('https://sige-backups.s3.example.invalid/fixture.pdf'));
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('proceso o módulo autorizado');
    expect(state.writes).toEqual([]);
  });
  it('suspender la asignación impide cargar aunque un contexto anterior siga autenticado',async()=>{
    await q("UPDATE account_roles SET status='suspended' WHERE id=?",[ROLE]);
    expect((await upload('/api/upload/procedure-file',OWN)).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it('tener edición explícita no permite cargar en un año cerrado',async()=>{
    await q("INSERT INTO companyTeamProcessAccess(companyId,accountId,processId,accessLevel) VALUES(?,?,?,'write')",[C,ACCOUNT,EXTRA]);
    await q("UPDATE annualWorkspaces SET status='closed' WHERE companyId=? AND year=2026",[C]);
    expect((await upload('/api/upload/procedure-file')).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
});
