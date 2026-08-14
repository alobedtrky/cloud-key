const fs=require('fs');
const crypto=require('crypto');
let Pool;try{({Pool}=require('pg'))}catch{}
let state={products:[],orders:[],coupons:[],codes:[],audit:[],reviews:[]},pool=null,seedPath='',queue=Promise.resolve(),backend='file';
function norm(db={}){db.products||=[];db.orders||=[];db.coupons||=[];db.codes||=[];db.audit||=[];db.reviews||=[];return db}
function key(){const raw=String(process.env.DATA_ENCRYPTION_KEY||'');if(process.env.NODE_ENV==='production'&&raw.length<32)throw new Error('DATA_ENCRYPTION_KEY must be at least 32 characters in production');return crypto.createHash('sha256').update(raw||'cloud-key-dev-only').digest()}
function enc(obj){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv),raw=Buffer.from(JSON.stringify(obj));const out=Buffer.concat([c.update(raw),c.final()]);return ['v1',iv.toString('base64url'),c.getAuthTag().toString('base64url'),out.toString('base64url')].join('.')}
function dec(s){const [v,iv,tag,data]=String(s||'').split('.');if(v!=='v1')throw new Error('unsupported_state');const d=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));d.setAuthTag(Buffer.from(tag,'base64url'));return norm(JSON.parse(Buffer.concat([d.update(Buffer.from(data,'base64url')),d.final()]).toString('utf8')))}
function fileSeed(){try{return norm(JSON.parse(fs.readFileSync(seedPath,'utf8')))}catch{return norm({})}}
async function persist(){const snap=JSON.parse(JSON.stringify(state));try{const tmp=seedPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(snap,null,2));fs.renameSync(tmp,seedPath)}catch{}if(pool)await pool.query('insert into cloud_key_state(id,payload,updated_at) values($1,$2,now()) on conflict(id) do update set payload=excluded.payload,updated_at=now()',['main',enc(snap)])}
async function init({seedPath:path}){seedPath=path;state=fileSeed();const url=String(process.env.DATABASE_URL||'');if(url&&Pool){pool=new Pool({connectionString:url,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:false},max:3});await pool.query('create table if not exists cloud_key_state(id text primary key,payload text not null,updated_at timestamptz not null default now())');const r=await pool.query('select payload from cloud_key_state where id=$1',['main']);if(r.rows[0]?.payload){state=dec(r.rows[0].payload)}else{await persist()}backend='postgres'}return {backend}}
function read(){return state}
function write(db){state=norm(db);queue=queue.then(persist).catch(e=>console.error('Cloud Key persistence:',e.message));return state}
function info(){return {backend,encrypted:!!process.env.DATA_ENCRYPTION_KEY,persistent:backend==='postgres'}}
module.exports={init,read,write,info};