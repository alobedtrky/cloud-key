const fs=require('fs');
if(process.env.NODE_ENV==='production'){
  const missing=[];
  if(!process.env.ADMIN_USER)missing.push('ADMIN_USER');
  if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12)missing.push('ADMIN_PASSWORD(12+ chars)');
  if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)missing.push('SESSION_SECRET(32+ chars)');
  if(process.env.DATABASE_URL&&(!process.env.DATA_ENCRYPTION_KEY||process.env.DATA_ENCRYPTION_KEY.length<32))missing.push('DATA_ENCRYPTION_KEY(32+ chars)');
  if(process.env.MOYASAR_PUBLISHABLE_KEY&&!process.env.MOYASAR_SECRET_KEY)missing.push('MOYASAR_SECRET_KEY');
  if(missing.length){console.error('Cloud Key security configuration missing:',missing.join(', '));process.exit(1)}
}
fs.copyFileSync('public/index-v3.html','public/index.html');
fs.copyFileSync('public/product-v3.html','public/product.html');
for(const file of ['public/index.html','public/product.html','public/login.html','public/profile.html','public/admin.html']){
  try{
    let s=fs.readFileSync(file,'utf8');
    if(!s.includes('/v4.css'))s=s.replace('</head>','<link rel="stylesheet" href="/v4.css"></head>');
    if(!s.includes('/motion.css'))s=s.replace('</head>','<link rel="stylesheet" href="/motion.css"></head>');
    if((file==='public/index.html'||file==='public/product.html')&&!s.includes('/cart-fx.css'))s=s.replace('</head>','<link rel="stylesheet" href="/cart-fx.css"></head>');
    if(file!=='public/admin.html'&&!s.includes('/cms-site.js'))s=s.replace('</body>','<script src="/cms-site.js"></script></body>');
    if(!s.includes('/motion.js'))s=s.replace('</body>','<script src="/motion.js"></script></body>');
    if((file==='public/index.html'||file==='public/product.html')&&!s.includes('/cart-fx.js'))s=s.replace('</body>','<script src="/cart-fx.js"></script></body>');
    if(file==='public/index.html'&&!s.includes('/checkout-redirect.js'))s=s.replace('</body>','<script src="/checkout-redirect.js"></script></body>');
    if(file==='public/index.html'&&!s.includes('/legal-links.js'))s=s.replace('</body>','<script src="/legal-links.js"></script></body>');
    if(file==='public/product.html'&&!s.includes('/product-pro.js'))s=s.replace('</body>','<script src="/product-pro.js"></script></body>');
    fs.writeFileSync(file,s)
  }catch{}
}
for(const [file,script,type] of [['public/profile.html','/profile-orders.js',' type="module"'],['public/admin.html','/admin-search.js',''],['public/admin.html','/site-editor.js',''],['public/admin.html','/admin-pro.js',''],['public/admin.html','/admin-suite.js',''],['public/admin.html','/admin-v6.js','']]){
  let s=fs.readFileSync(file,'utf8');if(!s.includes(script))s=s.replace('</body>',`<script${type} src="${script}"></script></body>`);fs.writeFileSync(file,s)
}
try{const f='public/login.js';let s=fs.readFileSync(f,'utf8');s=s.replaceAll("location.replace('/profile')","location.replace(new URLSearchParams(location.search).get('next')||'/profile')");fs.writeFileSync(f,s)}catch{}
require('./server-v4.js');