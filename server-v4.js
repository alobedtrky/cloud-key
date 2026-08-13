const http=require('http');
const fs=require('fs');
const path=require('path');
const OUTER_PORT=Number(process.env.PORT||3000);
const INNER_PORT=OUTER_PORT===3101?3102:3101;
process.env.PORT=String(INNER_PORT);
require('./server-v3.js');
process.env.PORT=String(OUTER_PORT);
const SITE_PATH=path.join(__dirname,'data','site-config.json');
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>500000)reject(new Error('too_large'))});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});req.on('error',reject)})}
function readConfig(){return JSON.parse(fs.readFileSync(SITE_PATH,'utf8'))}
function writeConfig(c){fs.writeFileSync(SITE_PATH,JSON.stringify(c,null,2))}
function adminAllowed(req){return new Promise(resolve=>{const r=http.request({hostname:'127.0.0.1',port:INNER_PORT,path:'/api/admin/overview',method:'GET',headers:{cookie:req.headers.cookie||''}},x=>{x.resume();resolve(x.statusCode===200)});r.on('error',()=>resolve(false));r.end()})}
function proxy(req,res){const p=http.request({hostname:'127.0.0.1',port:INNER_PORT,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${INNER_PORT}`}},r=>{res.writeHead(r.statusCode||500,r.headers);r.pipe(res)});p.on('error',()=>{res.writeHead(502);res.end('Bad gateway')});req.pipe(p)}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/api/site-config'){const c=readConfig();if(url.searchParams.get('preview')==='1'){if(!await adminAllowed(req))return json(res,401,{error:'unauthorized'});return json(res,200,c.draft||c.published)}return json(res,200,c.published)}
  if(url.pathname==='/api/admin/site-editor'){if(!await adminAllowed(req))return json(res,401,{error:'unauthorized'});if(req.method==='GET')return json(res,200,readConfig());if(req.method==='PUT'){try{const next=await body(req),c=readConfig();c.draft=next;c.updatedAt=new Date().toISOString();writeConfig(c);return json(res,200,{ok:true,updatedAt:c.updatedAt})}catch{return json(res,400,{error:'bad_request'})}}
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/site-editor/publish'){if(!await adminAllowed(req))return json(res,401,{error:'unauthorized'});const c=readConfig();if(!c.draft)return json(res,409,{error:'no_draft'});c.published=c.draft;c.draft=null;c.publishedAt=new Date().toISOString();writeConfig(c);return json(res,200,{ok:true,publishedAt:c.publishedAt})}
  proxy(req,res)
});
server.listen(OUTER_PORT,()=>console.log(`Cloud Key V4 CMS: http://localhost:${OUTER_PORT}`));