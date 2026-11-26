// LOCAL TEST ONLY. Not an app route or a production authentication service.
// Start from the repository root; follow docs/sprints/2026-11-24-3-validation.md.
import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installTeamSchema } from './fixture.mjs';
const moduleUrl = process.env.WORKBRIDGE_PGLITE_MODULE ? pathToFileURL(resolve(process.env.WORKBRIDGE_PGLITE_MODULE)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleUrl);
const wsModule = process.env.WORKBRIDGE_WS_MODULE;
const WebSocketServer = wsModule ? (await import(pathToFileURL(resolve(wsModule)).href)).WebSocketServer : null;
const db=new PGlite();
await installTeamSchema(db);
const users=[
 {id:'10000000-0000-0000-0000-000000000001',name:'의뢰인 테스트',role:'client'},
 {id:'10000000-0000-0000-0000-000000000002',name:'김하나 테스트',role:'freelancer'},
 {id:'10000000-0000-0000-0000-000000000003',name:'이두리 테스트',role:'freelancer'},
 {id:'10000000-0000-0000-0000-000000000004',name:'프로필 미완성 테스트',role:'freelancer'},
 {id:'10000000-0000-0000-0000-000000000005',name:'다른 의뢰인 테스트',role:'client'},
];
const project='20000000-0000-0000-0000-000000000001';
for(const u of users){
 u.email=`local-${u.id.slice(-1)}@test.example`;
 await db.query('insert into auth.users(id,email) values($1,$2)',[u.id,u.email]);
 await db.query("update profiles set name=$2,role=$3,bio=$4,category='웹 개발',skills=array['TypeScript'] where id=$1",[u.id,u.id.endsWith('4')?null:u.name,u.role,u.id.endsWith('4')?'':'웹 서비스 개발 경험이 있습니다.']);
}
await db.query("insert into projects(id,client_id,title,description,category,budget,status,recruit_start_at,recruit_end_at) values($1,$2,'지역 가게 예약 서비스 만들기','동네 가게의 예약을 관리하는 반응형 웹 서비스를 만듭니다.','웹 개발',3000000,'recruiting',now()-interval '1 day',now()+interval '7 days')",[project,users[0].id]);
const peers = new Map();
let snapshot = new Map();
const send = (ws, c, event, payload, ref=null) => { if(ws.readyState===1) ws.send(JSON.stringify(c.array ? [c.join_ref,ref,c.topic,event,payload] : {join_ref:c.join_ref,ref,topic:c.topic,event,payload})); };
async function publishChanges(){
 const rows=(await db.query('select * from public.notifications')).rows;
 const active=new Set((await db.query('select id from profiles where deleted_at is null')).rows.map(r=>r.id));
 for(const record of rows){
  const signature=JSON.stringify(record);const old=snapshot.get(record.id);if(old===signature)continue;
  for(const [ws, channels] of peers)for(const c of channels.values()){
   if(c.userId!==record.user_id || !active.has(c.userId))continue;
   send(ws,c,'postgres_changes',{ids:c.filters.map(f=>f.id),data:{schema:'public',table:'notifications',commit_timestamp:new Date().toISOString(),type:old?'UPDATE':'INSERT',errors:[],columns:Object.keys(record).map(name=>({name,type:name==='read_at'||name==='created_at'?'timestamptz':'text'})),record,old_record:{}}});
  }
 }
 snapshot=new Map(rows.map(r=>[r.id,JSON.stringify(r)]));
}
const userData=(u)=>({...u,aud:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()});
const jwt=(u)=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:u.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})).toString('base64url'),'local-fixture-only'].join('.');
const session=(u)=>({access_token:jwt(u),refresh_token:'local-fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:userData(u)});
const who=(req)=>{try{const token=req.headers.authorization?.replace(/^Bearer /i,'');const sub=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub;return users.find(u=>u.id===sub);}catch{return null;}};
const identifier=(s)=>{if(!/^[a-z_][a-z_0-9]*$/.test(s))throw new Error('bad identifier');return '"'+s+'"';};
const json=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(body===undefined?undefined:JSON.stringify(body));};
let pending=Promise.resolve();
async function locked(fn){const before=pending;let release;pending=new Promise(r=>release=r);await before;try{return await fn();}finally{release();}}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3003');res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']??'authorization,apikey,content-type,x-client-info,prefer,range,range-unit');res.setHeader('Access-Control-Expose-Headers','Content-Range');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const url=new URL(req.url,'http://127.0.0.1:3014');
 if(url.pathname==='/test'){
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
  res.end(`<h1>로컬 테스트 계정 선택</h1><p>실제 Supabase 계정이 아닌 임시 DB 검증용입니다.</p>${users.map((u,i)=>`<p><a href="/test-login?user=${i}">${u.name}</a></p>`).join('')}<p><a href="http://127.0.0.1:3003/projects/${project}/apply">지원 화면</a></p><p><a href="http://127.0.0.1:3003/projects/${project}/applicants">지원자 관리</a></p><p><a href="http://127.0.0.1:3003/me/applications">내 지원 현황</a></p><p><a href="http://127.0.0.1:3003/notifications">알림</a></p>`);return;
 }
 if(url.pathname==='/test-login'){
  const u=users[Number(url.searchParams.get('user'))];if(!u){json(res,400,{});return;}
  const cookie='base64-'+Buffer.from(JSON.stringify(session(u))).toString('base64url');
  res.writeHead(302,{'Set-Cookie':`sb-127-auth-token=${cookie}; Path=/; SameSite=Lax`,Location:'http://127.0.0.1:3003/'+(u.role==='client'?`projects/${project}/applicants`:'me/applications')});res.end();return;
 }
 if(url.pathname==='/auth/v1/token' && req.method==='POST'){
  const input=await new Promise(resolve=>{let data='';req.on('data',d=>data+=d);req.on('end',()=>resolve(JSON.parse(data||'{}')));});
  const u=users.find(u=>u.email===input.email);
  json(res,u&&input.password==='Local-only-demo-1124'?200:400,u&&input.password==='Local-only-demo-1124'?session(u):{message:'Invalid login credentials'});return;
 }
 if(url.pathname==='/auth/v1/logout'){json(res,204);return;}
 if(url.pathname==='/test-status'){json(res,200,{websockets:peers.size,channels:[...peers.values()].reduce((n,m)=>n+m.size,0)});return;}
 if(url.pathname==='/auth/v1/user'){const u=who(req);json(res,u?200:401,u?userData(u):{message:'not signed in'});return;}
 if(!url.pathname.startsWith('/rest/v1/')){json(res,404,{});return;}
 const body=await new Promise((resolve,reject)=>{let s='';req.on('data',d=>s+=d);req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(e){reject(e);}});});
 await locked(async()=>{
  const u=who(req);const role=u?'authenticated':'anon';
  try{
   await db.exec('set role '+role);
   await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[u?.id??'',role]);
   const resource=url.pathname.slice('/rest/v1/'.length);
   if(resource.startsWith('rpc/')){
    const name=resource.slice(4);const keys=Object.keys(body);
    const q=`select public.${identifier(name)}(${keys.map((k,i)=>`${identifier(k)} => $${i+1}`).join(',')}) as result`;
    const result=await db.query(q,Object.values(body));json(res,200,result.rows[0].result);return;
   }
   if(!['profiles','projects','applications','notifications'].includes(resource))throw new Error('unsupported fixture table');
   const args=[];const conditions=[];
   for(const [key,val] of url.searchParams){
    if(['select','order','offset','limit'].includes(key))continue;
    const col=identifier(key);
    if(val==='is.null')conditions.push(`${col} is null`);
    else if(val.startsWith('eq.')){args.push(val.slice(3));conditions.push(`${col}=$${args.length}`);}
    else if(val.startsWith('in.(')){const values=val.slice(4,-1).split(',');conditions.push(`${col} in (${values.map(v=>{args.push(v.replace(/^"|"$/g,''));return '$'+args.length;}).join(',')})`);}
    else throw new Error('unsupported fixture filter '+val);
   }
   const where=conditions.length?' where '+conditions.join(' and '):'';
   if(req.method==='POST'){
    if(resource!=='projects')throw new Error('fixture only inserts projects through REST');
    const keys=Object.keys(body);const values=Object.values(body);
    const inserted=await db.query(`insert into public.projects(${keys.map(identifier).join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning id`,values);
    json(res,201,req.headers.accept?.includes('vnd.pgrst.object')?inserted.rows[0]:inserted.rows);return;
   }
   if(req.method==='PATCH'){
    const keys=Object.keys(body);const updateArgs=[...args,...Object.values(body)];
    const set=keys.map((k,i)=>`${identifier(k)}=$${args.length+i+1}`).join(',');
    await db.query(`update public.${identifier(resource)} set ${set}${where}`,updateArgs);json(res,204);return;
   }
   const selections=(url.searchParams.get('select')??'*').split(/,(?![^()]*\))/);
   const cols=selections.map(s=>s.startsWith('freelancer:')?`(select json_build_object('name',p.name) from public.profiles p where p.id=applications.freelancer_id) as freelancer`:s==='*'?'*':identifier(s.trim())).join(',');
   const count=(await db.query(`select count(*)::int as n from public.${identifier(resource)}${where}`,args)).rows[0].n;
   const order=url.searchParams.get('order');const orderSql=order?' order by '+order.split(',').map(v=>{const [col,dir]=v.split('.');return identifier(col)+' '+(dir==='desc'?'desc':'asc');}).join(','):'';
   const offset=Math.max(0,Number(url.searchParams.get('offset')??0));const limit=Math.max(0,Math.min(1000,Number(url.searchParams.get('limit')??1000)));
   const result=req.method==='HEAD'?[]:(await db.query(`select ${cols} from public.${identifier(resource)}${where}${orderSql} limit ${limit} offset ${offset}`,args)).rows;
   if(req.method!=='HEAD'&&req.headers.accept?.includes('vnd.pgrst.object')&&result.length!==1){json(res,406,{code:'PGRST116',message:'Expected exactly one row'});return;}
   json(res,200,req.method==='HEAD'?undefined:req.headers.accept?.includes('vnd.pgrst.object')?result[0]:result,{'Content-Range':`${offset}-${Math.max(offset,offset+result.length-1)}/${count}`});
  }catch(e){json(res,400,{code:e.code??'FIXTURE_ERROR',message:e.message,details:null,hint:null});}
  finally{await db.exec('reset role');await publishChanges();}
 });
});
if(WebSocketServer){
 const realtime=new WebSocketServer({server,path:'/realtime/v1/websocket'});
 realtime.on('connection',ws=>{
  const channels=new Map();peers.set(ws,channels);
  ws.on('close',()=>peers.delete(ws));
  ws.on('message',raw=>{try{
   const value=JSON.parse(raw.toString());const m=Array.isArray(value)?{join_ref:value[0],ref:value[1],topic:value[2],event:value[3],payload:value[4],array:true}:value;
   const c={topic:m.topic,join_ref:m.join_ref,array:m.array};
   if(m.event==='phx_join'){
    const userId=JSON.parse(Buffer.from(m.payload.access_token.split('.')[1],'base64url')).sub;
    const filters=(m.payload.config?.postgres_changes??[]).map((f,i)=>({...f,id:i+1}));
    if(!users.some(u=>u.id===userId)||filters.some(f=>f.table!=='notifications'||f.filter!=='user_id=eq.'+userId))throw new Error('unauthorized fixture subscription');
    channels.set(m.topic,{...c,userId,filters});send(ws,c,'phx_reply',{status:'ok',response:{postgres_changes:filters}},m.ref);
   }else if(m.event==='phx_leave'){channels.delete(m.topic);send(ws,c,'phx_reply',{status:'ok',response:{}},m.ref);}
   else if(m.event==='heartbeat')send(ws,c,'phx_reply',{status:'ok',response:{}},m.ref);
  }catch{ws.close(1008,'fixture subscription rejected');}});
 });
}
server.listen(3014,'127.0.0.1',()=>console.log('Local verification API ready on 3014; ephemeral DB; realtime fixture:',Boolean(WebSocketServer)));
process.on('SIGINT',async()=>{server.close();await db.close();process.exit(0);});
