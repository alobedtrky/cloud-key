const fs=require('fs');
fs.copyFileSync('public/index-v3.html','public/index.html');
fs.copyFileSync('public/product-v3.html','public/product.html');
for(const file of ['public/index.html','public/product.html','public/login.html','public/profile.html']){
  try{
    let s=fs.readFileSync(file,'utf8');
    if(!s.includes('/v4.css')) s=s.replace('</head>','<link rel="stylesheet" href="/v4.css"></head>');
    fs.writeFileSync(file,s);
  }catch{}
}
for(const [file,script,type] of [['public/profile.html','/profile-orders.js',' type="module"'],['public/admin.html','/admin-search.js','']]){
  let s=fs.readFileSync(file,'utf8');
  if(!s.includes(script)) s=s.replace('</body>',`<script${type} src="${script}"></script></body>`);
  fs.writeFileSync(file,s);
}
try{
  const f='public/login.js';
  let s=fs.readFileSync(f,'utf8');
  s=s.replaceAll("location.replace('/profile')","location.replace(new URLSearchParams(location.search).get('next')||'/profile')");
  fs.writeFileSync(f,s);
}catch{}
require('./server-v3.js');