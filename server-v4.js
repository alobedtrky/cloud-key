const http=require('http');
const fs=require('fs');
const path=require('path');
const OUTER_PORT=Number(process.env.PORT||3000);
const INNER_PORT=OUTER_PORT===3101?3102:3101;
process.env.PORT=String(INNER_PORT);
require('./server-v3.js');
process.env.PORT=String(OUTER_PORT);
const SITE_PATH=path.join(__dirname,'data','site-config.json');
const DB_PATH=path.join(__dirname,'data','db.json');
const PUBLIC=path.join(__dirname,'public');
const MUTATING=new Set(['POST','PUT','PATCH','DELETE']);
function securityHeaders(){return {'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()','cross-origin-opener-policy':'same-origin','cross-origin-resource-policy':'same-origin','strict-transport-security':'max-age=31536000; includeSubDomains'}}
function json(res,status,data){res.writeHead(status,{...securityHeaders(),'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>500000)return reject(new Error('too_large'))});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});req.on('error',reject)})}
function readConfig(){return JSON.parse(fs.readFileSync(SITE_PATH,'utf8'))}
function writeConfig(c){const tmp=SITE_PATH+'.tmp';fs.writeFileSync(tmp,JSON.stringify(c,null,2),{mode:0o600});fs.renameSync(tmp,SITE_PATH)}
function readDB(){try{return JSON.parse(fs.readFileSync(DB_PATH,'utf8'))}catch{return {products:[]}}}
function adminAllowed(req){return new Promise(resolve=>{const r=http.request({hostname:'127.0.0.1',port:INNER_PORT,path:'/api/admin/overview',method:'GET',headers:{cookie:req.headers.cookie||''}},x=>{x.resume();resolve(x.statusCode===200)});r.on('error',()=>resolve(false));r.end()})}
function sameOrigin(req){const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===req.headers.host}catch{return false}}
function previewHeaders(headers){const h={...securityHeaders(),...headers};delete h['x-frame-options'];let csp=String(h['content-security-policy']||'');if(csp){csp=csp.replace(/frame-ancestors\s+'none'/i,"frame-ancestors 'self'");h['content-security-policy']=csp}h['x-frame-options']='SAMEORIGIN';return h}
function proxy(req,res){const p=http.request({hostname:'127.0.0.1',port:INNER_PORT,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${INNER_PORT}`}},r=>{const h=previewHeaders(r.headers);if(req.url.startsWith('/admin')||req.url.startsWith('/api/admin/'))h['cache-control']='no-store';res.writeHead(r.statusCode||500,h);r.pipe(res)});p.on('error',()=>{res.writeHead(502,securityHeaders());res.end('Bad gateway')});req.pipe(p)}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function origin(req){const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();return `${proto}://${req.headers.host}`}
function productSeo(req,res,url){const m=url.pathname.match(/^\/product\/([^/]+)$/);if(!m)return false;let id;try{id=decodeURIComponent(m[1])}catch{return false}const db=readDB(),p=(db.products||[]).find(x=>x.id===id&&x.active);if(!p)return false;let html;try{html=fs.readFileSync(path.join(PUBLIC,'product.html'),'utf8')}catch{return false}const base=origin(req),canonical=base+url.pathname,desc=String(p.description||`اشترِ ${p.name} من Cloud Key`).replace(/\s+/g,' ').trim().slice(0,160),img=/^https?:/i.test(String(p.image||''))?String(p.image):'',title=`${p.name} | Cloud Key`;const ld={'@context':'https://schema.org','@type':'Product',name:p.name,description:desc,sku:p.id,category:p.category,brand:{'@type':'Brand',name:'Cloud Key'},offers:{'@type':'Offer',url:canonical,priceCurrency:'SAR',price:Number(p.price),availability:Number(p.stock)>0?'https://schema.org/InStock':'https://schema.org/OutOfStock',itemCondition:'https://schema.org/NewCondition'}};if(img)ld.image=[img];const tags=`<meta name="description" content="${esc(desc)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="product"><meta property="og:site_name" content="Cloud Key"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">${img?`<meta property="og:image" content="${esc(img)}">`:''}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script>`;html=html.replace(/<title>.*?<\/title>/i,`<title>${esc(title)}</title>`).replace('</head>',tags+'</head>');res.writeHead(200,{...securityHeaders(),'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});res.end(html);return true}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');
  if(MUTATING.has(req.method)&&url.pathname.startsWith('/api/admin/')&&!sameOrigin(req))return json(res,403,{error:'origin_rejected'});
  if(req.method==='GET'&&url.pathname==='/robots.txt'){const base=origin(req);res.writeHead(200,{...securityHeaders(),'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600'});return res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${base}/sitemap.xml\n`)}
  if(req.method==='GET'&&url.pathname==='/sitemap.xml'){const base=origin(req),db=readDB(),items=(db.products||[]).filter(p=>p.active).map(p=>`<url><loc>${esc(base+'/product/'+encodeURIComponent(p.id))}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');res.writeHead(200,{...securityHeaders(),'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=1800'});return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(base+'/')}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>${items}</urlset>`)}
  if(req.method==='GET'&&productSeo(req,res,url))return;
  if(req.method==='GET'&&url.pathname==='/api/site-config'){const c=readConfig();if(url.searchParams.get('preview')==='1'){if(!await adminAllowed(req))return json(res,401,{error:'unauthorized'});return json(res,200,c.draft||c.published)}return json(res,200,c.published)}
  if(url.pathname==='/api/admin/site-editor'){
    if(!await adminAllowed(req))return json(res,401,{error:'unauthorized'});
    if(req.method==='GET')return json(res,200,readConfig());
    if(req.method==='PUT'){try{const next=await body(req),c=readConfig();c.draft=next;c.updatedAt=new Date().toISOString();writeConfig(c);return json(res,200,{ok:true,updatedAt:c.updatedAt})}catch{return json(res,400,{error:'bad_request'})}}
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/site-editor/publish'){if(!await adminAllowed(req))return json(res,401,{error:'unauthorized'});const c=readConfig();if(!c.draft)return json(res,409,{error:'no_draft'});c.published=c.draft;c.draft=null;c.publishedAt=new Date().toISOString();writeConfig(c);return json(res,200,{ok:true,publishedAt:c.publishedAt})}
  proxy(req,res)
});
server.listen(OUTER_PORT,()=>console.log(`Cloud Key V4 CMS + SEO + security: http://localhost:${OUTER_PORT}`));