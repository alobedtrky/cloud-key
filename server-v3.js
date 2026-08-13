const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {URL}=require('url');

const ROOT=__dirname, PUBLIC=path.join(ROOT,'public'), DB_PATH=path.join(ROOT,'data','db.json');
const PORT=Number(process.env.PORT||3000);
const ADMIN_USER=process.env.ADMIN_USER||'admin';
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'ChangeMe-CloudKey-2026!';
const SESSION_SECRET=process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex');
const sessions=new Map(),loginAttempts=new Map();

function readDB(){const db=JSON.parse(fs.readFileSync(DB_PATH,'utf8'));db.products||=[];db.orders||=[];db.coupons||=[];db.codes||=[];return db}
function writeDB(db){const tmp=DB_PATH+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,DB_PATH)}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>2500000){req.destroy();reject(new Error('body_too_large'))}});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}});req.on('error',reject)})}
function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),decodeURIComponent(x.slice(i+1))]}))}
function getSession(req){const sid=parseCookies(req).ck_session,s=sid&&sessions.get(sid);if(!s)return null;if(Date.now()-s.created>28800000){sessions.delete(sid);return null}return s}
function requireAdmin(req,res){if(!getSession(req)){json(res,401,{error:'unauthorized'});return false}return true}
function safeId(){return crypto.randomUUID()}
function orderNo(){const d=new Date(),day=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;return `CK-${day}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||''))}
function validPhone(v){return /^(\+?966|0)?5\d{8}$/.test(String(v||'').replace(/\s|-/g,''))}
function clientIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim()}
function hasImage(p){return typeof p.image==='string'&&p.image.length>20}
function bearer(req){const h=String(req.headers.authorization||'');return h.startsWith('Bearer ')?h.slice(7).trim():''}

async function firebaseUser(req){
  const token=bearer(req),key=process.env.FIREBASE_API_KEY||'';
  if(!token||!key)return null;
  try{
    const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:token})});
    if(!r.ok)return null;const out=await r.json();const u=out.users?.[0];
    if(!u?.localId)return null;
    return {uid:u.localId,email:u.email||'',phone:u.phoneNumber||'',name:u.displayName||'',photo:u.photoUrl||'',providers:(u.providerUserInfo||[]).map(x=>x.providerId)};
  }catch{return null}
}
async function requireCustomer(req,res){const u=await firebaseUser(req);if(!u){json(res,401,{error:'login_required'});return null}return u}
function publicOrder(o){return {number:o.number,status:o.status,total:o.total,subtotal:o.subtotal,discount:o.discount,createdAt:o.createdAt,items:o.items,delivery:o.status==='paid'||o.status==='completed'?o.delivery:[]}}

async function api(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,service:'cloud-key-v3'});
  if(req.method==='GET'&&url.pathname==='/api/firebase-config')return json(res,200,{apiKey:process.env.FIREBASE_API_KEY||'',authDomain:process.env.FIREBASE_AUTH_DOMAIN||'',projectId:process.env.FIREBASE_PROJECT_ID||'',storageBucket:process.env.FIREBASE_STORAGE_BUCKET||'',messagingSenderId:process.env.FIREBASE_MESSAGING_SENDER_ID||'',appId:process.env.FIREBASE_APP_ID||''});
  if(req.method==='GET'&&url.pathname==='/api/products'){const db=readDB();return json(res,200,db.products.filter(p=>p.active&&p.stock!==0&&hasImage(p)))}
  const publicProduct=url.pathname.match(/^\/api\/products\/([^/]+)$/);if(publicProduct&&req.method==='GET'){const db=readDB(),p=db.products.find(p=>p.id===publicProduct[1]&&p.active&&hasImage(p));return p?json(res,200,p):json(res,404,{error:'not_found'})}

  if(req.method==='GET'&&url.pathname==='/api/me'){const u=await requireCustomer(req,res);if(!u)return;const db=readDB(),count=db.orders.filter(o=>o.customer?.uid===u.uid).length;return json(res,200,{...u,orders:count})}
  if(req.method==='GET'&&url.pathname==='/api/my/orders'){const u=await requireCustomer(req,res);if(!u)return;const db=readDB();return json(res,200,db.orders.filter(o=>o.customer?.uid===u.uid).map(publicOrder))}
  const myOrder=url.pathname.match(/^\/api\/my\/orders\/([^/]+)$/);if(myOrder&&req.method==='GET'){const u=await requireCustomer(req,res);if(!u)return;const db=readDB(),number=decodeURIComponent(myOrder[1]).toUpperCase(),o=db.orders.find(o=>o.customer?.uid===u.uid&&String(o.number).toUpperCase()===number);return o?json(res,200,publicOrder(o)):json(res,404,{error:'not_found'})}
  if(req.method==='GET'&&url.pathname==='/api/order-status'){const u=await requireCustomer(req,res);if(!u)return;const number=(url.searchParams.get('number')||'').trim().toUpperCase(),db=readDB(),o=db.orders.find(o=>o.customer?.uid===u.uid&&String(o.number).toUpperCase()===number);return o?json(res,200,publicOrder(o)):json(res,404,{error:'not_found'})}

  if(req.method==='POST'&&url.pathname==='/api/checkout'){
    const u=await requireCustomer(req,res);if(!u)return;
    try{
      const b=await body(req);if(!Array.isArray(b.items)||!b.items.length)return json(res,400,{error:'invalid_order'});
      const contactPhone=u.phone||String(b.phone||'');if(!validPhone(contactPhone))return json(res,400,{error:'phone_required'});
      const db=readDB();let subtotal=0;const items=[];
      for(const x of b.items){const p=db.products.find(p=>p.id===x.id&&p.active&&hasImage(p));const qty=Math.max(1,Math.min(10,Number(x.qty)||1));if(!p||p.stock<qty)return json(res,409,{error:'out_of_stock',productId:x.id});subtotal+=p.price*qty;items.push({id:p.id,name:p.name,price:p.price,qty,image:p.image||''})}
      let discount=0;const coupon=String(b.coupon||'').trim().toUpperCase();if(coupon){const c=db.coupons.find(c=>c.active&&c.code===coupon);if(c)discount=Math.round(subtotal*c.percent)/100}
      const total=Math.max(0,subtotal-discount),order={id:safeId(),number:orderNo(),createdAt:new Date().toISOString(),customer:{uid:u.uid,name:u.name||String(b.name||'عميل Cloud Key').slice(0,100),email:u.email||String(b.email||'').slice(0,150),phone:contactPhone,provider:u.providers?.[0]||'firebase'},items,subtotal,discount,total,coupon,status:'pending_payment',payment:{provider:process.env.PAYMENT_PROVIDER||'demo',status:'not_started'},delivery:[]};
      db.orders.unshift(order);writeDB(db);return json(res,201,{orderNumber:order.number,total:order.total,status:order.status,paymentReady:false});
    }catch{return json(res,400,{error:'bad_request'})}
  }

  if(req.method==='POST'&&url.pathname==='/api/admin/login'){
    try{const ip=clientIp(req),now=Date.now(),rec=loginAttempts.get(ip)||{count:0,until:0};if(rec.until>now)return json(res,429,{error:'too_many_attempts'});const b=await body(req);if(b.username!==ADMIN_USER||b.password!==ADMIN_PASSWORD){rec.count++;if(rec.count>=5){rec.until=now+15*60*1000;rec.count=0}loginAttempts.set(ip,rec);return json(res,401,{error:'invalid_credentials'})}loginAttempts.delete(ip);const sid=crypto.randomBytes(32).toString('hex');sessions.set(sid,{user:ADMIN_USER,created:Date.now(),proof:crypto.createHmac('sha256',SESSION_SECRET).update(sid).digest('hex')});res.setHeader('Set-Cookie',`ck_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`);return json(res,200,{ok:true})}catch{return json(res,400,{error:'bad_request'})}
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/logout'){const sid=parseCookies(req).ck_session;if(sid)sessions.delete(sid);res.setHeader('Set-Cookie','ck_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true})}
  if(url.pathname.startsWith('/api/admin/')&&!requireAdmin(req,res))return;
  if(req.method==='GET'&&url.pathname==='/api/admin/overview'){const db=readDB();return json(res,200,{products:db.products,orders:db.orders,coupons:db.coupons,codes:db.codes})}
  if(req.method==='GET'&&url.pathname==='/api/admin/orders/search'){const q=String(url.searchParams.get('q')||'').trim().toLowerCase(),db=readDB();const list=!q?db.orders:db.orders.filter(o=>[o.number,o.customer?.name,o.customer?.email,o.customer?.phone,o.customer?.uid].some(v=>String(v||'').toLowerCase().includes(q)));return json(res,200,list.slice(0,100))}
  if(req.method==='POST'&&url.pathname==='/api/admin/products'){
    try{const b=await body(req);if(!b.name||!Number.isFinite(Number(b.price))||!hasImage(b))return json(res,400,{error:'image_required'});const db=readDB(),p={id:b.id||safeId(),name:String(b.name).slice(0,150),category:b.category||'services',price:Number(b.price),oldPrice:b.oldPrice?Number(b.oldPrice):null,tag:b.tag||'رقمي',stock:Math.max(0,Number(b.stock)||0),active:b.active!==false,description:String(b.description||'').slice(0,1000),image:b.image,cover:b.cover||'linear-gradient(135deg,#12384a,#19b9d6)'};db.products.push(p);writeDB(db);return json(res,201,p)}catch{return json(res,400,{error:'bad_request'})}
  }
  const pm=url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);if(pm&&req.method==='PATCH'){
    try{const b=await body(req),db=readDB(),p=db.products.find(p=>p.id===pm[1]);if(!p)return json(res,404,{error:'not_found'});if(b.active===true&&!hasImage({...p,...b}))return json(res,400,{error:'image_required'});for(const k of ['name','category','price','oldPrice','tag','stock','active','description','cover','image'])if(k in b)p[k]=b[k];p.price=Number(p.price);p.stock=Math.max(0,Number(p.stock)||0);writeDB(db);return json(res,200,p)}catch{return json(res,400,{error:'bad_request'})}
  }
  if(pm&&req.method==='DELETE'){const db=readDB();db.products=db.products.filter(p=>p.id!==pm[1]);writeDB(db);return json(res,200,{ok:true})}
  const om=url.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);if(om&&req.method==='PATCH'){
    try{const b=await body(req),db=readDB(),o=db.orders.find(o=>o.id===om[1]);if(!o)return json(res,404,{error:'not_found'});if(b.status)o.status=b.status;if(b.markPaid===true&&o.status!=='paid'){o.status='paid';o.payment.status='paid';o.payment.paidAt=new Date().toISOString();for(const item of o.items){const p=db.products.find(p=>p.id===item.id);if(p)p.stock=Math.max(0,p.stock-item.qty)}o.delivery=[];for(const item of o.items){const available=db.codes.filter(c=>c.productId===item.id&&!c.usedAt).slice(0,item.qty);available.forEach(c=>{c.usedAt=new Date().toISOString();c.orderId=o.id;o.delivery.push({productId:item.id,code:c.code})})}}writeDB(db);return json(res,200,o)}catch{return json(res,400,{error:'bad_request'})}
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/codes'){
    try{const b=await body(req);if(!b.productId||!Array.isArray(b.codes))return json(res,400,{error:'invalid_codes'});const db=readDB(),clean=[...new Set(b.codes.map(x=>String(x).trim()).filter(Boolean))];for(const code of clean)db.codes.push({id:safeId(),productId:b.productId,code,createdAt:new Date().toISOString(),usedAt:null,orderId:null});writeDB(db);return json(res,201,{added:clean.length})}catch{return json(res,400,{error:'bad_request'})}
  }
  return json(res,404,{error:'not_found'});
}

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
const CSP="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://apis.google.com; script-src-elem 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://apis.google.com; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://www.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://www.google.com https://www.recaptcha.net; frame-src https://www.google.com https://www.recaptcha.net https://accounts.google.com https://*.firebaseapp.com; frame-ancestors 'none'";
const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',CSP);const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return api(req,res,url);let rel=url.pathname==='/'?'index.html':url.pathname.slice(1);if(rel==='admin')rel='admin.html';if(rel==='login')rel='login.html';if(rel==='profile')rel='profile.html';if(/^product\/[A-Za-z0-9-]+$/.test(rel))rel='product.html';const file=path.normalize(path.join(PUBLIC,rel));if(!file.startsWith(PUBLIC))return res.end('Forbidden');fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':path.extname(file)==='.html'?'no-cache':'public, max-age=3600'});fs.createReadStream(file).pipe(res)})});
server.listen(PORT,()=>console.log(`Cloud Key V3: http://localhost:${PORT}`));