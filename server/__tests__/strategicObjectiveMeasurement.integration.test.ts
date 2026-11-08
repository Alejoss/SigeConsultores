import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { accounts, companies, processes, strategicObjectives, processTacticalObjectives, companyManagementAccess, strategicObjectiveMeasurementConfigs, strategicObjectiveMeasurements } from '../../drizzle/schema';
import { getDb } from '../db';
import { strategicObjectivesRouter } from '../routers/strategicObjectives';
import { strategicTrendsRouter } from '../routers/strategicTrends';
import type { StrategicMeasurementConfig } from '../../shared/strategicObjectiveMeasurement';
let db:NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId=0,foreignCompanyId=0,accountId=0,processId=0,firstId=0,secondId=0,foreignId=0,oteId=0;
let originalOE:any, originalOTE:any, originalContributions:any;
const ctx=(overrides:any)=>({user:null,manager:null,processLeader:null,req:{} as never,res:{} as never,...overrides}) as never;
const manager=()=>strategicObjectivesRouter.createCaller(ctx({manager:{companyId,companyName:'Medición sintética',managerEmail:'oe@example.test'}}));
const leader=()=>strategicObjectivesRouter.createCaller(ctx({processLeader:{companyId,processId,processLeaderId:accountId,leaderName:'Jefe sintético',leaderEmail:'jefe@example.test',companyName:'Medición sintética'}}));
const config=(patch:Partial<StrategicMeasurementConfig>={}):StrategicMeasurementConfig=>({initialSituation:'Contexto sintético',expectedResult:'Resultado sintético',indicator:'Indicador empresarial',weight:50,baseline:0,goal:100,unit:'%',deadline:'2027-11-08',...patch});
const save=(id:number,value:number,date='2026-11-01')=>manager().saveMeasurement({companyId,objectiveId:id,value,measurementDate:date,observation:'Medición de prueba',evidence:'Referencia ficticia'});
beforeAll(async()=>{
 db=(await getDb())!; if(!db) throw new Error('MySQL de integración no disponible.');
 accountId=Number((await db.insert(accounts).values({openId:`oe-integration-${Date.now()}`,name:'Cuenta ficticia'}))[0].insertId);
 companyId=Number((await db.insert(companies).values({name:'Prueba sintética de medición OE',ownerAccountId:accountId}))[0].insertId);
 foreignCompanyId=Number((await db.insert(companies).values({name:'Otra empresa ficticia de medición OE',ownerAccountId:accountId}))[0].insertId);
 processId=Number((await db.insert(processes).values({companyId,name:'Proceso sintético',processType:'soporte'}))[0].insertId);
 firstId=Number((await db.insert(strategicObjectives).values({companyId,objective:'OE previo A',description:'Descripción previa intacta',target:'Meta previa no numérica',startYear:2022,endYear:2023,generalManagerName:'Responsable anterior',orderIndex:0}))[0].insertId);
 secondId=Number((await db.insert(strategicObjectives).values({companyId,objective:'OE previo B',description:'Descripción B intacta',target:'Meta previa B',startYear:2022,endYear:2023,orderIndex:1}))[0].insertId);
 foreignId=Number((await db.insert(strategicObjectives).values({companyId:foreignCompanyId,objective:'OE de otra empresa',startYear:2022,endYear:2023,orderIndex:0}))[0].insertId);
 oteId=Number((await db.insert(processTacticalObjectives).values({processId,name:'OTE previo',strategicObjective:'OE previo A',description:'Enunciado anterior',planningData:JSON.stringify({ponderacion:100,puntoPartida:0,metaLlegada:100,avanceMeta:95,trackingType:'puntual',resultKeys:[{description:'Texto anterior',meta:100}],situacionInicial:'Texto de contexto previo'})}))[0].insertId);
 [originalOE]=await db.select().from(strategicObjectives).where(eq(strategicObjectives.id,firstId));
 [originalOTE]=await db.select().from(processTacticalObjectives).where(eq(processTacticalObjectives.id,oteId));
 originalContributions=(await strategicTrendsRouter.createCaller(ctx({manager:{companyId}})).getStrategicObjectivesBreakdown({companyId})).objectives.map(o=>o.contributions);
});
afterAll(async()=>{
 if(!db)return;
 const ids=[companyId,foreignCompanyId].filter(Boolean);
 if(ids.length){
  await db.delete(strategicObjectiveMeasurements).where(inArray(strategicObjectiveMeasurements.companyId,ids));
  await db.delete(strategicObjectiveMeasurementConfigs).where(inArray(strategicObjectiveMeasurementConfigs.companyId,ids));
  await db.delete(companyManagementAccess).where(inArray(companyManagementAccess.companyId,ids));
  if(oteId)await db.delete(processTacticalObjectives).where(eq(processTacticalObjectives.id,oteId));
  await db.delete(strategicObjectives).where(inArray(strategicObjectives.companyId,ids));
  if(processId)await db.delete(processes).where(eq(processes.id,processId));
  await db.delete(companies).where(inArray(companies.id,ids));
 }
 if(accountId)await db.delete(accounts).where(eq(accounts.id,accountId));
});
describe('Medición estratégica: persistencia aditiva y permisos',()=>{
 it('un OE previo sin configuración no hereda el 95% del OTE',async()=>{
  const result=await manager().getMeasurementOverview({companyId});
  expect(result.globalPercent).toBeNull();expect(result.status).toBe('pending_configuration');
  expect(result.objectives[0].percent).toBeNull();
  expect((await manager().list({companyId}))[0].target).toBe('Meta previa no numérica');
 });
 it('guardar definición numérica deja intacto el registro anterior y la planificación OTE',async()=>{
  await manager().saveMeasurementConfig({companyId,objectiveId:firstId,config:config()});
  const [oe]=await db.select().from(strategicObjectives).where(eq(strategicObjectives.id,firstId));
  const [ote]=await db.select().from(processTacticalObjectives).where(eq(processTacticalObjectives.id,oteId));
  expect(oe).toEqual(originalOE);expect(ote).toEqual(originalOTE);
  expect((await manager().list({companyId}))[0].deadline).toBe('2027-11-08');
 });
 it('calcula avance propio y reconoce cero real como medición',async()=>{
  await save(firstId,0);
  expect((await manager().getMeasurementDetail({companyId,objectiveId:firstId})).objective.percent).toBe(0);
  await save(firstId,30);
  expect((await manager().getMeasurementDetail({companyId,objectiveId:firstId})).objective.percent).toBe(30);
 });
 it('el guardado repetido del mismo día no crea duplicados de historial',async()=>{
  const result=await manager().getMeasurementDetail({companyId,objectiveId:firstId});
  expect(result.measurements).toHaveLength(1);expect(result.measurements[0].value).toBe(30);
 });
 it('una medición histórica no desplaza a una más reciente',async()=>{
  await save(firstId,10,'2026-10-01');
  const result=await manager().getMeasurementDetail({companyId,objectiveId:firstId});
  expect(result.measurements).toHaveLength(2);expect(result.objective.latestMeasurement?.measurementDate).toBe('2026-11-01');expect(result.objective.percent).toBe(30);
 });
 it('mide reducción de indicador y calcula total ponderado independiente de OTE',async()=>{
  await manager().saveMeasurementConfig({companyId,objectiveId:firstId,config:config({weight:80})});
  await manager().saveMeasurementConfig({companyId,objectiveId:secondId,config:config({weight:20,baseline:20,goal:0,unit:'reclamos'})});
  let result=await manager().getMeasurementOverview({companyId});
  expect(result.status).toBe('incomplete_measurements');expect(result.globalPercent).toBeNull();
  await save(secondId,0);
  result=await manager().getMeasurementOverview({companyId});
  expect(result.objectives[1].percent).toBe(100);expect(result.status).toBe('complete');expect(result.globalPercent).toBe(44);
 });
 it('ponderaciones incompletas no se renormalizan ocultamente',async()=>{
  await manager().saveMeasurementConfig({companyId,objectiveId:secondId,config:config({weight:19,baseline:20,goal:0})});
  const result=await manager().getMeasurementOverview({companyId});expect(result.totalWeight).toBe(99);expect(result.globalPercent).toBeNull();expect(result.status).toBe('invalid_weights');
  await manager().saveMeasurementConfig({companyId,objectiveId:secondId,config:config({weight:20,baseline:20,goal:0})});
 });
 it('la tabla de contribución conserva exactamente sus cálculos anteriores',async()=>{
  const contributions=(await strategicTrendsRouter.createCaller(ctx({manager:{companyId}})).getStrategicObjectivesBreakdown({companyId})).objectives.map(o=>o.contributions);
  expect(contributions).toEqual(originalContributions);
  const [ote]=await db.select().from(processTacticalObjectives).where(eq(processTacticalObjectives.id,oteId));expect(ote).toEqual(originalOTE);
 });
 it('el jefe estándar puede leer pero no configurar ni registrar avances',async()=>{
  expect((await leader().getMeasurementOverview({companyId})).objectives).toHaveLength(2);
  await expect(leader().saveMeasurementConfig({companyId,objectiveId:firstId,config:config()})).rejects.toThrow();
  await expect(leader().saveMeasurement({companyId,objectiveId:firstId,value:50,measurementDate:'2026-11-01',observation:'',evidence:''})).rejects.toThrow();
 });
 it('un coordinador ya autorizado mantiene su permiso sin acceso a otras empresas',async()=>{
  await db.insert(companyManagementAccess).values({companyId,accountId,accessLevel:'coordinator'});
  await leader().saveMeasurement({companyId,objectiveId:firstId,value:30,measurementDate:'2026-11-01',observation:'Coordinador autorizado',evidence:''});
  await expect(leader().getMeasurementOverview({companyId:foreignCompanyId})).rejects.toThrow();
 });
 it('rechaza un objetivo de otra empresa aunque se envíe companyId autorizado',async()=>{
  await expect(manager().getMeasurementDetail({companyId,objectiveId:foreignId})).rejects.toThrow();
  await expect(manager().saveMeasurementConfig({companyId,objectiveId:foreignId,config:config()})).rejects.toThrow();
  await expect(manager().saveMeasurement({companyId,objectiveId:foreignId,value:40,measurementDate:'2026-11-01',observation:'',evidence:''})).rejects.toThrow();
 });
 it('rechaza fechas futuras o inexistentes y números no finitos',async()=>{
  await expect(save(firstId,50,'2999-01-01')).rejects.toThrow();
  await expect(save(firstId,50,'2026-02-31')).rejects.toThrow();
  await expect(save(firstId,Infinity)).rejects.toThrow();
 });
 it('un parche de descripción no borra nombre, meta ni años de la definición anterior',async()=>{
  await manager().update({id:firstId,description:'Descripción editada intencionalmente'});
  const [oe]=await db.select().from(strategicObjectives).where(eq(strategicObjectives.id,firstId));
  expect(oe.objective).toBe(originalOE.objective);expect(oe.target).toBe(originalOE.target);expect(oe.startYear).toBe(originalOE.startYear);expect(oe.endYear).toBe(originalOE.endYear);
 });
});
