
"use strict";
/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
const TODAY=(()=>{const d=new Date();return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5})();
const dd=n=>new Date(n*864e5), wd=n=>dd(n).getUTCDay();
const fmt=(n,o={month:'short',day:'numeric'})=>dd(n).toLocaleDateString('en-US',{...o,timeZone:'UTC'});
const dstr=n=>dd(n).toISOString().slice(0,10);
const pdate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?Date.UTC(+m[1],+m[2]-1,+m[3])/864e5:null};
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const PAL=['#FF3D8B','#3A35FF','#C9F53B','#FF8A3D','#9B6BFF'];
const TILES=['#FFD6E8','#E4F9A6','#D6D4FF','#FFE0C7','#E8DCFF','#CDEBFF'];
const hash=s=>{let x=5381;for(const c of s)x=(x*33^c.charCodeAt(0))>>>0;return x.toString(36)};

/* ---------- data layer: everything lives on the server ---------- */
const CATS=[
 {id:'night',name:'Night Dresses',shape:'dress',bg:'var(--pink)',blurb:'After-dark main character',vibes:['Club','Birthday','Date night']},
 {id:'pants',name:'Pants',shape:'pants',bg:'var(--lime)',blurb:'Wide, baggy, flared',vibes:['Campus','Festival','Photo dump']},
 {id:'jackets',name:'Jackets',shape:'jacket',bg:'#8E89FF',blurb:'Layers that do the talking',vibes:['Street','Road trip','Gig']},
 {id:'tops',name:'Tops',shape:'top',bg:'var(--tang)',blurb:'Corsets, babytees, mesh',vibes:['Brunch','Club','Concert']},
 {id:'skirts',name:'Skirts',shape:'skirt',bg:'var(--violet)',blurb:'Micro to maxi',vibes:['Grad szn','Game day','Picnic']},
 {id:'bags',name:'Bags & Extras',shape:'bag',bg:'#FFF',blurb:'Finish the look',vibes:['Everything','Gift','Weekend']}];
const CAT=Object.fromEntries(CATS.map(c=>[c.id,c]));
const SZ=['XS','S','M','L','XL'];
let APP={user:null,items:[],owners:{},people:{},bookings:[],saved:[],demoLogin:false};
async function api(path,method='GET',body){
  const r=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'X-Requested-With':'rentique',...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  let j=null;try{j=await r.json()}catch(e){}
  if(r.status===401&&APP.user&&!path.startsWith('/auth/')){APP.user=null;renderHeader();toast('Your session ended. Log in again.')}
  if(!r.ok)throw Object.assign(new Error((j&&j.error)||'Something went wrong. Try again.'),{status:r.status});
  return j;
}
async function refresh(){APP=await api('/bootstrap')}
async function act(fn,okMsg){try{const r=await fn();if(okMsg)toast(okMsg);return r}catch(e){toast(e.message);return null}}
async function mut(fn,okMsg,view){await act(fn,okMsg);try{await refresh()}catch(e){}view()}
const me=()=>APP.user;
const ownerOf=id=>APP.owners[id]||{id,name:'A lender',closet:'A closet',city:'Near you',rating:null,resp:'New lender',since:new Date().getFullYear(),hue:'#FF3D8B',bio:''};
const custOf=id=>APP.people[id]||{id,name:'Renter',hue:'#9B6BFF'};
const allItems=()=>APP.items;
const pubItems=()=>APP.items.filter(i=>i.status==='approved'&&i.live!==false); // what Explore shows to everyone, admin included
const itemById=id=>APP.items.find(i=>i.id===String(id));
const allBk=()=>APP.bookings;
const blockedSet=(id,bks)=>{const m=new Map();(bks||allBk()).forEach(b=>{if(b.item===id&&(b.status==='confirmed'||b.status==='pending'))for(let d=b.start;d<=b.end;d++)m.set(d,b.status)});return m};
const popularity=()=>{const m={};allBk().forEach(b=>{if(b.status!=='cancelled'&&b.status!=='declined')m[b.item]=(m[b.item]||0)+1});return m};
const initials=n=>n.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const av=(name,hue,px=34)=>`<span class="av" style="width:${px}px;height:${px}px;background:${hue};color:${/3A35FF|9B6BFF|3a35ff/i.test(hue)?'#fff':'#16133F'};font-size:${px*.36}px" aria-hidden="true">${esc(initials(name))}</span>`;

/* ---------- garment art ---------- */
const SH={
 dress:{d:'M76 14 L86 14 L89 56 Q100 70 111 56 L114 14 L124 14 L121 64 Q120 92 130 114 L160 222 Q100 238 40 222 L70 114 Q80 92 79 64 Z',x:'<path d="M73 114 Q100 126 127 114"/>'},
 pants:{d:'M62 20 H138 L150 224 H108 L100 96 L92 224 H50 Z',x:'<path d="M63 38 H137M100 38 V96"/><path d="M74 38 Q80 60 92 62M126 38 Q120 60 108 62"/>'},
 jacket:{d:'M72 22 L100 34 L128 22 L170 48 L186 150 L160 154 L152 98 L150 214 H50 L48 98 L40 154 L14 150 L30 48 Z',x:'<path d="M100 34 V214M72 22 L100 92 L128 22"/><path d="M66 170 H88M112 170 H134"/>'},
 top:{d:'M68 40 L88 30 Q100 52 112 30 L132 40 L172 76 L154 102 L138 90 L140 168 H60 L62 90 L46 102 L28 76 Z',x:'<path d="M62 156 H138"/>'},
 skirt:{d:'M62 40 H138 L180 214 Q100 234 20 214 Z',x:'<path d="M64 58 H136M84 58 L64 224M100 58 V228M116 58 L136 224"/>'},
 bag:{pre:'<path d="M70 92 C70 28 130 28 130 92" fill="none" style="stroke:var(--gline)" stroke-width="7" stroke-linecap="round"/>',d:'M44 88 H156 L168 214 H32 Z',x:'<path d="M44 88 Q100 132 156 88"/><circle cx="100" cy="120" r="7" fill="#fff"/>'}};
let uid=0;
function pattern(p,c2){
  if(p==='stripes'){let s='';for(let x=-60;x<260;x+=24)s+=`<rect x="${x}" y="-40" width="11" height="330" fill="${c2}" transform="rotate(-20 100 120)"/>`;return s}
  if(p==='dots'){let s='';for(let y=12,j=0;y<250;y+=24,j++)for(let x=(j%2)*12;x<210;x+=24)s+=`<circle cx="${x}" cy="${y}" r="5" fill="${c2}"/>`;return s}
  if(p==='checks'){let s='';for(let j=0;j<13;j++)for(let i=0;i<11;i++)if((i+j)%2)s+=`<rect x="${i*20}" y="${j*20}" width="20" height="20" fill="${c2}" opacity=".85"/>`;return s}
  if(p==='stars'){let s='';for(let i=0;i<22;i++){const x=(i*47%190)+8,y=(i*83%220)+10,k=.6+(i%4)*.25;s+=`<path d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6Z" fill="${c2}" transform="translate(${x} ${y}) scale(${k})"/>`}return s}
  return '';
}
function art(shape,c1,c2,pat,label){
  const S=SH[shape]||SH.dress,id='g'+(++uid),grad=pat==='grad';
  return `<svg viewBox="0 0 200 244" role="img" aria-label="${esc(label||shape)}"><defs><clipPath id="c${id}"><path d="${S.d}"/></clipPath>${grad?`<linearGradient id="l${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`:''}</defs>${S.pre||''}<path d="${S.d}" fill="${grad?`url(#l${id})`:c1}"/><g clip-path="url(#c${id})">${pattern(pat,c2)}<path d="M10 0 L58 0 L0 250 L-48 250Z" fill="#fff" opacity=".14"/></g><path d="${S.d}" fill="none" style="stroke:var(--gline)" stroke-width="4.5" stroke-linejoin="round"/><g fill="none" style="stroke:var(--gline)" stroke-width="2.6" stroke-linecap="round" opacity=".75">${S.x}</g></svg>`;
}
const itemArt=(it,i=0)=>it.photos&&it.photos[i]?`<img class="ph" src="${it.photos[i]}" alt="${esc(it.name)}">`:art(CAT[it.cat].shape,it.c1,it.c2,it.pat,it.name);
let FP=[];
function readPhoto(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file),im=new Image();im.onload=()=>{const k=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',.82))};im.onerror=()=>rej(new Error('bad image'));im.src=url})}
async function readMany(files,room){const out=[];for(const f of [...files].slice(0,Math.max(0,room))){if(f.type.indexOf('image/')!==0)continue;try{out.push(await readPhoto(f))}catch(e){toast('One file could not be read as an image')}}return out}
function drawThumbs(){const e=$('#phthumbs');if(e)e.innerHTML=FP.map((d,i)=>`<span class="t"><img class="ph" src="${d}" alt="Photo ${i+1}"><button type="button" data-act="phrm" data-id="${i}" aria-label="Remove photo ${i+1}">✕</button></span>`).join('');updPrev()}
document.documentElement.style.setProperty('--gline','#16133F');

/* ---------- ui bits ---------- */
const HEART='<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3 5 6.3 5c2 0 3.6 1.1 4.7 2.7C12.1 6.1 13.7 5 15.700 5 19 5 20.900 8.300 19.500 11.700 17.500 16.400 12 21 12 21z"/></svg>';
function toast(t){const e=document.createElement('div');e.className='toast';e.setAttribute('role','status');e.textContent=t;document.body.append(e);setTimeout(()=>e.remove(),2800)}
function openModal(html,cls=''){$('#modal').innerHTML=`<div class="ov" data-act="ovclose"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}<button class="ibtn x" data-act="close" aria-label="Close">✕</button></div></div>`;const f=$('#modal input,#modal button.btn');f&&f.focus&&setTimeout(()=>{try{$('#modal input')?.focus()}catch(e){}},30)}
const closeModal=()=>{$('#modal').innerHTML=''};
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
function confetti(){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const c=$('#fx'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;
  const P=Array.from({length:150},()=>({x:innerWidth/2+(Math.random()-.5)*200,y:innerHeight*.55,vx:(Math.random()-.5)*16,vy:-Math.random()*18-6,s:6+Math.random()*9,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:[...PAL,'#fff','#16133F'][Math.random()*7|0],sq:Math.random()<.6}));
  let t=0;(function f(){x.clearRect(0,0,c.width,c.height);P.forEach(p=>{p.vy+=.55;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.fillStyle=p.c;x.strokeStyle='#16133F';x.lineWidth=1.5;if(p.sq){x.fillRect(-p.s/2,-p.s/2,p.s,p.s*.6);x.strokeRect(-p.s/2,-p.s/2,p.s,p.s*.6)}else{x.beginPath();x.arc(0,0,p.s/2,0,7);x.fill();x.stroke()}x.restore()});
    if(++t<130)requestAnimationFrame(f);else x.clearRect(0,0,c.width,c.height)})();
}

/* ---------- header ---------- */
function renderHeader(){
  const r=route().name,u=me();
  const links=[['home','Home'],['explore','Explore']];
  if(u&&u.role==='admin')links.push(['admin','Admin'+(APP.pendingReview?`<b class="nb">${APP.pendingReview}</b>`:'')]);
  else{links.push(['studio','Lend']);if(u)links.push(['messages','Messages'+(APP.unread?`<b class="nb">${APP.unread}</b>`:'')])}
  $('#nav').innerHTML=links.map(([k,l])=>`<a href="#${k}" class="${r===k||(k==='explore'&&r==='item')?'on':''}">${l}</a>`).join('');
  $('#tools').innerHTML=`<button class="ibtn" data-act="theme" aria-label="Switch light or dark theme"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg></button>
  <a class="ibtn" href="#me" aria-label="Saved pieces">${HEART.replace('<svg','<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4"')}${APP.saved.length?`<b>${APP.saved.length}</b>`:''}</a>
  ${u?`<a class="btn sm ghost" href="#me" style="padding-left:8px">${av(u.name,'var(--pink)',26)} ${esc(u.name.split(' ')[0])}</a>`:`<button class="btn sm" data-act="auth">Log in</button>`}`;
}

/* ---------- router ---------- */
function route(){const h=location.hash.slice(1)||'home';if(h.startsWith('item-'))return{name:'item',id:h.slice(5)};if(h==='messages'||h.startsWith('messages-'))return{name:'messages',id:h.slice(9)};return{name:['home','explore','studio','me','admin'].includes(h)?h:'home'}}
let lastRoute='';
function render(keepScroll){
  const r=route();renderHeader();const key=JSON.stringify(r);
  clearInterval(MSG.timer);
  ({home:vHome,explore:vExplore,item:vItem,studio:vStudio,me:vMe,messages:vMessages,admin:vAdmin})[r.name](r);
  document.title=r.name==='item'?((itemById(r.id)||{}).name||'Item')+' · Rentique':'Rentique';
  if(!keepScroll&&key!==lastRoute)window.scrollTo(0,0);lastRoute=key;
}
window.addEventListener('hashchange',()=>render());

/* ---------- item card ---------- */
function availLabel(it,bs){bs=bs||blockedSet(it.id);if(!bs.has(TODAY))return{t:'Free today',cls:'free'};let d=TODAY;while(bs.has(d)&&d<TODAY+90)d++;return{t:'Free '+fmt(d),cls:'busy'}}
function card(it,i=0){
  const o=ownerOf(it.owner),a=availLabel(it),sv=APP.saved.includes(it.id);
  return `<article class="card tilt" style="--i:${i}"><a class="art" href="#item-${it.id}" style="background:${it.tile}" tabindex="-1" aria-hidden="true">${itemArt(it)}<span class="badge ${a.cls}">${a.t}</span></a>
  <button class="heart ${sv?'on':''}" data-act="save" data-id="${it.id}" aria-label="${sv?'Remove from saved':'Save'} ${esc(it.name)}" aria-pressed="${sv}">${HEART}</button>
  <div class="meta"><h3><a href="#item-${it.id}">${esc(it.name)}</a></h3>
  <div class="row"><span class="price">${money(it.price)}<small>/day</small></span><span class="sizes">${esc(it.sizes.join(' · '))}</span></div>
  <button class="lender" data-act="closet" data-id="${it.owner}">${av(o.name,o.hue,24)}<span>${esc(o.closet)}</span></button></div></article>`;
}

/* ---------- home ---------- */
const WORDS=['first date','birthday','grad szn','festival','photo dump','big night'];
let wordTimer;
function vHome(){
  const its=pubItems(),pop=popularity(),hot=[...its].sort((a,b)=>(pop[b.id]||0)-(pop[a.id]||0)).slice(0,8);
  const fl=['night','jackets','pants'].map(c=>its.find(i=>i.cat===c)).filter(Boolean);
  $('#app').innerHTML=`
  <section class="hero"><div>
    <p class="eyebrow">the closet your friends wish they had</p>
    <h1>Rent the fit for your <span class="swap"><span id="swapw">${WORDS[0]}</span></span></h1>
    <p class="lead">Borrow standout pieces from real people near you, wear them once, send them back. Or lend your own closet and watch it pay rent.</p>
    <div class="cta"><a class="btn" href="#explore">Explore fits →</a><a class="btn ghost" href="#studio">Lend your closet</a></div>
    <div class="facts"><div><b>${its.length}</b>pieces live</div><div><b>${new Set(its.map(i=>i.owner)).size}</b>closets</div><div><b>${money(Math.min(...its.map(i=>i.price)))}</b>per day, from</div></div>
  </div>
  <div class="stage" id="stage">${fl.map(it=>`<a class="float" href="#item-${it.id}" style="background:${it.tile}" aria-label="${esc(it.name)}">${itemArt(it)}</a>`).join('')}
    <span class="stk a">★ 4.9 renter</span><span class="stk b">Free this Sat</span><span class="stk c">${fl[0]?money(fl[0].price):'$10'}/day</span>
    <svg class="spin" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#C9F53B" stroke="#16133F" stroke-width="3"/><path id="cp" d="M60 60 m-40 0 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0" fill="none"/><text font-family="Space Mono,monospace" font-weight="700" font-size="11.500" letter-spacing="2" fill="#16133F"><textPath href="#cp">NEW DROPS · EVERY DAY · </textPath></text><text x="60" y="68" text-anchor="middle" font-size="24" fill="#16133F">✦</text></svg>
  </div></section>
  <div class="marq" aria-hidden="true"><div>${Array(2).fill(CATS.map(c=>`${c.name}<span>✦</span>`).join('')+'Rent it<span>✦</span>Wear it<span>✦</span>Return it<span>✦</span>').join('')}</div></div>
  <section class="blk"><div class="sh"><h2>Shop by mood</h2><p>Pick a theme, then see who has it and when it is free.</p></div>
    <div class="tiles">${CATS.map((c,i)=>{const n=its.filter(x=>x.cat===c.id).length,s=its.find(x=>x.cat===c.id);return `<button class="tile" style="background:${c.bg};--i:${i}" data-act="cat" data-id="${c.id}"><div><small>${n} pieces</small><h3>${c.name}</h3></div><p style="font-weight:500;position:relative;z-index:2">${c.blurb}</p>${s?art(c.shape,s.c1,s.c2,s.pat,''):''}</button>`}).join('')}</div></section>
  <section class="blk"><div class="sh"><h2>Hot this week</h2><a class="btn ghost sm" href="#explore">See everything</a></div><div class="scroller">${hot.map((it,i)=>card(it,i)).join('')}</div></section>
  <section class="blk"><div class="sh"><h2>How it works</h2></div><div class="steps">
    <div class="step" style="background:var(--pink)"><b>1</b><h3>Find your fit</h3><p>Browse by theme, size and the dates you need it.</p></div>
    <div class="step" style="background:var(--lime)"><b>2</b><h3>Request the dates</h3><p>Pick days on the calendar. The lender confirms, usually within the hour.</p></div>
    <div class="step" style="background:var(--tang)"><b>3</b><h3>Wear it, return it</h3><p>Pick up locally, follow the closet rules, hand it back. Deposit returns to you.</p></div></div>
  <div class="lendband"><div><p class="eyebrow">for lenders</p><h2>Your closet has a day job now.</h2><p>List what you barely wear, set your rules and prices, and track revenue, busy days and your best customers in your own studio.</p><a class="btn" href="#studio">Open your studio →</a></div>
  <div class="minibars" aria-hidden="true">${[40,62,48,80,66,92,58,100,76].map((h,i)=>`<i style="height:${h}%;--i:${i}"></i>`).join('')}</div></div></section>
  <footer><span>Rentique · a demo marketplace. Accounts and bookings live only in your browser.</span><span>Made for people who repeat outfits on purpose.</span></footer>`;
  clearInterval(wordTimer);let wi=0;wordTimer=setInterval(()=>{const e=$('#swapw');if(!e){clearInterval(wordTimer);return}wi=(wi+1)%WORDS.length;const n=document.createElement('span');n.textContent=WORDS[wi];e.replaceWith(n);n.id='swapw'},2200);
}
document.addEventListener('pointermove',e=>{
  const st=$('#stage');if(st&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const r=st.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;$$('.float',st).forEach((f,i)=>f.style.translate=`${x*(14+i*8)}px ${y*(10+i*6)}px`)}
  const c=e.target.closest&&e.target.closest('.tilt');if(c&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const r=c.getBoundingClientRect();c.style.setProperty('--ry',((e.clientX-r.left)/r.width-.5)*7+'deg');c.style.setProperty('--rx',-((e.clientY-r.top)/r.height-.5)*7+'deg')}
});
document.addEventListener('pointerout',e=>{const c=e.target.closest&&e.target.closest('.tilt');if(c&&!c.contains(e.relatedTarget)){c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')}});

/* ---------- explore ---------- */
const F={q:'',cat:'all',size:'',sort:'popular',max:30,from:'',to:'',owner:''};
function filtered(){
  const pop=popularity(),a=pdate(F.from),b=pdate(F.to)||a;
  let L=pubItems().filter(i=>(F.cat==='all'||i.cat===F.cat)&&(!F.size||i.sizes.includes(F.size))&&i.price<=F.max&&(!F.owner||i.owner===F.owner)
    &&(!F.q||(i.name+' '+ownerOf(i.owner).closet+' '+CAT[i.cat].name).toLowerCase().includes(F.q.toLowerCase())));
  if(a!=null){L=L.filter(i=>{const bs=blockedSet(i.id);for(let d=a;d<=Math.max(a,b);d++)if(bs.has(d))return false;return true})}
  const s={popular:(x,y)=>(pop[y.id]||0)-(pop[x.id]||0),'price-asc':(x,y)=>x.price-y.price,'price-desc':(x,y)=>y.price-x.price,new:(x,y)=>String(y.id).localeCompare(String(x.id),'en',{numeric:true})}[F.sort];
  return L.sort(s);
}
function gridHTML(){const L=filtered();return L.length?L.map((it,i)=>card(it,i)).join(''):`<div class="empty" style="grid-column:1/-1"><h3>Nothing matches yet</h3><p>Try another size, wider dates or a higher price cap.</p><button class="btn" data-act="clearf">Reset filters</button></div>`}
function vExplore(){
  const o=F.owner?ownerOf(F.owner):null;
  $('#app').innerHTML=`<div class="sh" style="padding-top:34px"><h2>${F.cat==='all'?'Explore everything':CAT[F.cat].name}</h2><p id="count"></p></div>
  <div class="filters"><div class="frow"><label class="field search"><span>Search</span><input id="q" type="search" placeholder="Satin, varsity, Mika…" value="${esc(F.q)}"></label>
  <label class="field"><span>Size</span><select id="fsize"><option value="">Any</option>${[...SZ,'One size'].map(s=>`<option ${F.size===s?'selected':''}>${s}</option>`).join('')}</select></label>
  <label class="field"><span>Sort</span><select id="fsort">${[['popular','Most rented'],['new','Newest'],['price-asc','Price: low'],['price-desc','Price: high']].map(([v,l])=>`<option value="${v}" ${F.sort===v?'selected':''}>${l}</option>`).join('')}</select></label>
  <label class="field"><span>Free from</span><input id="ffrom" type="date" min="${dstr(TODAY)}" value="${F.from}"></label>
  <label class="field"><span>to</span><input id="fto" type="date" min="${dstr(TODAY)}" value="${F.to}"></label>
  <label class="field"><span>Max price <b id="mx">${money(F.max)}</b>/day</span><input id="fmax" type="range" min="6" max="30" value="${F.max}"></label></div>
  <div class="frow">${[{id:'all',name:'All'},...CATS].map(c=>`<button class="chip ${F.cat===c.id?'on':''}" data-act="cat" data-id="${c.id}">${c.name}</button>`).join('')}
  ${o?`<button class="chip on" data-act="closet" data-id="">Closet: ${esc(o.closet)} ✕</button>`:''}</div></div>
  <div class="grid" id="grid">${gridHTML()}</div>`;
  $('#count').textContent=filtered().length+' pieces'+(F.from?' free on your dates':'')+' · tap a heart to save';
}
function refreshGrid(){const g=$('#grid');if(!g)return;g.innerHTML=gridHTML();$('#count').textContent=filtered().length+' pieces'+(F.from?' free on your dates':'')+' · tap a heart to save'}

/* ---------- item page ---------- */
let P={id:null,s:null,e:null,size:null,y:0,m:0};
function vItem(r){
  const it=itemById(r.id);
  if(!it){$('#app').innerHTML=`<div class="gate"><h1>That piece is gone</h1><p>It may have been removed by its lender.</p><a class="btn" href="#explore">Back to Explore</a></div>`;return}
  if(P.id!==it.id){const d=dd(TODAY);P={id:it.id,ph:0,msg:'',s:null,e:null,size:it.sizes[0],y:d.getUTCFullYear(),m:d.getUTCMonth()}}
  const o=ownerOf(it.owner),c=CAT[it.cat],R=it.rules,its=pubItems().filter(i=>i.owner===it.owner),done=allBk().filter(b=>its.some(i=>i.id===b.item)&&b.status==='completed').length;
  $('#app').innerHTML=`<a class="back" href="#explore">← All fits</a>
  <div class="ip"><div class="bigart" style="background:${it.tile}"><span id="bigimg" style="display:contents">${itemArt(it,P.ph||0)}</span>${it.photos&&it.photos.length>1?`<div class="gal">${it.photos.map((d,i)=>`<button data-act="ph" data-id="${i}" class="${(P.ph||0)===i?'on':''}" aria-label="Photo ${i+1}"><img class="ph" src="${d}" alt=""></button>`).join('')}</div>`:''}<span class="stk a" style="right:6%;top:6%;--r:6deg">${esc(c.name)}</span></div>
  <div><p class="eyebrow">${esc(c.name)} · ${esc(o.city)}</p><h1 style="margin-top:10px">${esc(it.name)}</h1>
  <div class="pricebig"><b>${money(it.price)}</b><span>per day · ${money(it.deposit)} refundable deposit</span></div>
  <div class="tags">${c.vibes.map(v=>`<span class="pill">${v}</span>`).join('')}<span class="pill">${esc(it.sizes.join(' / '))}</span></div>
  <p style="max-width:34em;color:var(--muted)">${esc(it.desc)}</p>
  <div class="panel" id="panel"></div>
  <div class="panel"><h4>House rules</h4><div class="rules">
    <div class="rule"><i class="t">⏱</i><span>${R.min===R.max?R.min:R.min+' to '+R.max} days per rental</span></div>
    <div class="rule"><i class="t">$</i><span>Late return: ${money(R.late)} per extra day</span></div>
    <div class="rule"><i class="t">↗</i><span>${esc(R.pickup)}</span></div>
    <div class="rule"><i class="t">✦</i><span>${esc(R.cleaning)}</span></div>
    ${R.dos.map(t=>`<div class="rule"><i class="y">✓</i><span>${esc(t)}</span></div>`).join('')}
    ${R.donts.map(t=>`<div class="rule"><i class="n">✕</i><span>${esc(t)}</span></div>`).join('')}</div></div>
  <div class="panel"><h4>Your lender</h4><div class="rcard">${av(o.name,o.hue,64)}<div class="info"><b style="font:800 1.4rem var(--f-display)">${esc(o.closet)}</b><span class="note">${esc(o.name)} · lending since ${o.since}</span><p style="font-size:.92rem">${esc(o.bio)}</p></div>
  <div class="rstats"><div><b>${o.rating?'★ '+o.rating:'New'}</b><span>rating</span></div><div><b>${esc(o.resp)}</b><span>replies</span></div><div><b>${its.length}</b><span>pieces</span></div>${done?`<div><b>${done}</b><span>rentals done</span></div>`:''}</div>
  <button class="btn sm ghost" data-act="closet" data-id="${o.id}">See closet</button></div></div>
  </div></div>
  ${(()=>{const m=pubItems().filter(i=>i.owner===it.owner&&i.id!==it.id).slice(0,4);return m.length?`<section class="blk"><div class="sh"><h2>More from ${esc(o.closet)}</h2></div><div class="grid">${m.map((x,i)=>card(x,i)).join('')}</div></section>`:''})()}`;
  drawPanel(it);
}
function drawPanel(it){
  const el=$('#panel');if(!el)return;
  if(it.status!=='approved'){const me2=me(),own=me2&&me2.id===it.owner;el.innerHTML=`<h4>${it.status==='rejected'?'Not approved':'Waiting for review'}</h4><p>${it.status==='rejected'?esc(it.reviewNote||'This piece was not approved.'):'This piece is being reviewed by the Rentique team. Rentals open as soon as it is approved.'}</p>${own?`<a class="btn pink" href="#studio" data-act="stab" data-id="catalog">Open my catalog</a>`:'<p class="note">Only the lender and the Rentique team can see this piece right now.</p>'}`;return}
  const bs=blockedSet(it.id),R=it.rules;
  const first=Date.UTC(P.y,P.m,1)/864e5,off=wd(first),dim=new Date(Date.UTC(P.y,P.m+1,0)).getUTCDate(),canPrev=Date.UTC(P.y,P.m,1)/864e5>TODAY-31;
  let cells='';for(let i=0;i<off;i++)cells+='<span></span>';
  for(let k=1;k<=dim;k++){const d=first+k-1,st=bs.get(d),past=d<TODAY;let c='d';
    if(st==='confirmed')c+=' bk';else if(st==='pending')c+=' pd';
    if(d===TODAY)c+=' today';
    if(P.s!=null&&P.e!=null&&d>P.s&&d<P.e)c+=' in';
    if(d===P.s)c+=' start';if(d===P.e)c+=' end';
    cells+=`<button class="${c}" data-act="day" data-d="${d}" ${past||st?'disabled':''} aria-label="${fmt(d,{weekday:'long',month:'long',day:'numeric'})}${st?', booked':''}">${k}</button>`}
  const days=P.s!=null?(P.e!=null?P.e-P.s+1:1):0,sub=days*it.price,fee=Math.round(sub*.08);
  const bad=days&&(days<R.min||days>R.max);
  el.innerHTML=`<h4>Pick your days</h4>
  <div class="field"><span>Size</span><div class="sw">${it.sizes.map(s=>`<label><input type="radio" name="sz" value="${esc(s)}" ${P.size===s?'checked':''} data-act="size"><span class="chip t">${esc(s)}</span></label>`).join('')}</div></div>
  <div class="cal"><div class="calh"><button class="btn sm ghost" data-act="cprev" ${canPrev?'':'disabled'} aria-label="Previous month">←</button><b style="font:800 1.2rem var(--f-display)">${dd(first).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}</b><button class="btn sm ghost" data-act="cnext" aria-label="Next month">→</button></div>
  <div class="cg">${['S','M','T','W','T','F','S'].map(x=>`<span class="dow">${x}</span>`).join('')}${cells}</div>
  <div class="legend"><span><i style="background:var(--blue)"></i>Your dates</span><span><i style="background:repeating-linear-gradient(135deg,var(--soft) 0 4px,transparent 4px 8px)"></i>Booked</span><span><i style="background:repeating-linear-gradient(135deg,var(--tang) 0 3px,transparent 3px 7px)"></i>Requested</span></div></div>
  <div class="sum">${days?`<div class="row"><span>${fmt(P.s)}${P.e!=null?' → '+fmt(P.e):''} · ${days} day${days>1?'s':''} × ${money(it.price)}</span><b>${money(sub)}</b></div><div class="row"><span>Rentique fee (8%)</span><b>${money(fee)}</b></div><div class="row"><span>Deposit held, returned after</span><b>${money(it.deposit)}</b></div><div class="row tot"><span>Pay now</span><span>${money(sub+fee)}</span></div>
  ${bad?`<p class="note" style="color:var(--bad)">This lender allows ${R.min===R.max?R.min:R.min+' to '+R.max} days per rental.</p>`:''}`:'<p class="note">Tap a start day, then an end day. Same day works for a one-day rental.</p>'}</div>
  <label class="field"><span>Message to ${esc(ownerOf(it.owner).name.split(' ')[0])} (optional)</span><textarea id="rmsg" rows="2" maxlength="1000" placeholder="Pickup time, fit questions, what it's for…">${esc(P.msg||'')}</textarea></label>
  <button class="btn pink" data-act="rent" data-id="${it.id}" ${days&&!bad?'':'disabled'}>Request to rent</button>
  <p class="note">You are not charged until ${esc(ownerOf(it.owner).name.split(' ')[0])} confirms. Demo only, no real payment.</p>`;
}

/* ---------- auth ---------- */
let afterAuth=null;
function authModal(tab='login'){
  openModal(`<h2>${tab==='login'?'Welcome back':'Join Rentique'}</h2><div class="frow"><button class="chip ${tab==='login'?'on':''}" data-act="authtab" data-id="login">Log in</button><button class="chip ${tab==='signup'?'on':''}" data-act="authtab" data-id="signup">Sign up</button></div>
  <form class="form" id="authf" data-tab="${tab}">${tab==='signup'?'<label class="field"><span>Name</span><input id="an" required maxlength="40" autocomplete="name"></label>':''}
  <label class="field"><span>Email</span><input id="ae" type="email" required autocomplete="email"></label>
  <label class="field"><span>Password</span><input id="ap" type="password" required minlength="8" autocomplete="${tab==='login'?'current-password':'new-password'}"></label>
  <p class="note" id="aerr" role="alert" style="color:var(--bad)"></p>
  <button class="btn" type="submit">${tab==='login'?'Log in':'Create account'}</button>
  <p class="note">Passwords are stored hashed on the server. Use at least 8 characters.</p></form>
  ${APP.demoLogin?`<div class="frow" style="border-top:2px dashed var(--soft);padding-top:14px"><span class="note" style="flex:1 1 100%">Just looking? Jump in as a demo user with fake data.</span><button class="btn sm ghost" data-act="demo" data-id="alex">Demo renter (Alex)</button><button class="btn sm ghost" data-act="demo" data-id="mika">Demo lender (Mika)</button><button class="btn sm ghost" data-act="demo" data-id="admin">Super admin</button></div>`:''}`);
}
async function afterLogin(){await refresh();closeModal();toast('You are in. Welcome!');const f=afterAuth;afterAuth=null;render(true);f&&f()}
document.addEventListener('submit',async e=>{
  const id=e.target.id;
  if(id==='authf'){e.preventDefault();const tab=e.target.dataset.tab,err=$('#aerr'),btn=$('button[type=submit]',e.target);btn.disabled=true;err.textContent='';
    try{await api(tab==='signup'?'/auth/signup':'/auth/login','POST',tab==='signup'?{name:$('#an').value,email:$('#ae').value,password:$('#ap').value}:{email:$('#ae').value,password:$('#ap').value});await afterLogin()}
    catch(x){err.textContent=x.message;btn.disabled=false}}
  if(id==='itemf'){e.preventDefault();saveItem(e.target)}
  if(id==='closetf'){e.preventDefault();const f=e.target;try{await api('/me','PATCH',{closet:f.elements.closet.value,city:f.elements.city.value,bio:f.elements.bio.value});await refresh();closeModal();render(true);toast('Closet updated')}catch(x){$('#cerr').textContent=x.message}}
});
function closetModal(){const u=me(),o=ownerOf(u.id);openModal(`<h2>Your closet</h2><form class="form" id="closetf"><label class="field"><span>Closet name</span><input name="closet" required maxlength="40" value="${esc(o.closet)}"></label><label class="field"><span>Neighborhood or city</span><input name="city" required maxlength="30" value="${esc(o.city)}"></label><label class="field"><span>Bio</span><textarea name="bio" rows="3" maxlength="200">${esc(o.bio)}</textarea></label><p class="note" id="cerr" role="alert" style="color:var(--bad)"></p><button class="btn pink" type="submit">Save</button></form>`)}

/* ---------- me ---------- */
let MT='rentals';
function vMe(){
  const u=me();
  if(!u){$('#app').innerHTML=`<div class="gate"><h1>Your account</h1><p>Log in to see your rentals and saved fits.</p><button class="btn" data-act="auth">Log in or sign up</button></div>`;return}
  const mine=allBk().filter(b=>b.cust===u.id).sort((a,b)=>b.start-a.start),sv=APP.saved.map(itemById).filter(Boolean);
  $('#app').innerHTML=`<div class="stu-h"><div><p class="eyebrow">account</p><h1>Hey ${esc(u.name.split(' ')[0])}.</h1></div><div class="frow">${u.role==='admin'?'<a class="btn pink" href="#admin">Admin</a>':'<a class="btn pink" href="#studio">My closet</a>'}<button class="btn ghost" data-act="logout">Log out</button></div></div>
  <div class="tabs">${[['rentals','My rentals ('+mine.length+')'],['saved','Saved ('+sv.length+')']].map(([k,l])=>`<button class="chip ${MT===k?'on':''}" data-act="mtab" data-id="${k}">${l}</button>`).join('')}</div>
  ${MT==='rentals'?(mine.length?`<div class="list">${mine.map(b=>{const it=itemById(b.item);if(!it)return'';return `<div class="req"><div class="th" style="background:${it.tile}">${itemArt(it)}</div><div class="who"><b><a href="#item-${it.id}">${esc(it.name)}</a></b><span>${fmt(b.start)}${b.end>b.start?' → '+fmt(b.end):''} · ${b.end-b.start+1} day(s) · ${esc(ownerOf(it.owner).closet)}</span></div><span class="pill ${b.status}">${b.status}</span><b>${money((b.end-b.start+1)*it.price)}</b><button class="btn sm ghost" data-act="chat" data-id="${b.id}">Message</button>${b.status==='pending'||(b.status==='confirmed'&&b.start>TODAY)?`<button class="btn sm ghost" data-act="cancel" data-id="${b.id}">Cancel</button>`:''}</div>`}).join('')}</div>`:`<div class="empty"><h3>No rentals yet</h3><p>Find something for your next plan.</p><a class="btn" href="#explore">Explore fits</a></div>`)
   :(sv.length?`<div class="grid">${sv.map((it,i)=>card(it,i)).join('')}</div>`:`<div class="empty"><h3>Nothing saved</h3><p>Tap the heart on any piece to keep it here.</p><a class="btn" href="#explore">Explore fits</a></div>`)}`;
}

/* ---------- studio (lender dashboard) ---------- */
const STU={tab:'overview',range:30};
function statsFor(oid,from,to){
  const its=allItems().filter(i=>i.owner===oid),by=Object.fromEntries(its.map(i=>[i.id,i]));
  const R={rev:0,days:0,cnt:0,lenSum:0,lead:0,daily:{},perItem:{},perCust:{},perCat:{},lens:{},weekday:Array(7).fill(0),its};
  allBk().filter(b=>by[b.item]&&(b.status==='completed'||b.status==='confirmed')&&b.start<=TODAY).forEach(b=>{const it=by[b.item],len=b.end-b.start+1;
    if(b.start>=from&&b.start<=to){R.cnt++;R.lenSum+=len;R.lead+=Math.max(0,b.start-b.created);R.weekday[wd(b.start)]++;const k=Math.min(len,5);R.lens[k]=(R.lens[k]||0)+1;(R.perCust[b.cust]=R.perCust[b.cust]||{n:0,spent:0}).n++;(R.perItem[it.id]=R.perItem[it.id]||{n:0,days:0,rev:0}).n++}
    for(let d=Math.max(b.start,from);d<=Math.min(b.end,to);d++){R.days++;R.rev+=it.price;R.daily[d]=(R.daily[d]||0)+it.price;const pi=(R.perItem[it.id]=R.perItem[it.id]||{n:0,days:0,rev:0});pi.days++;pi.rev+=it.price;R.perCat[it.cat]=(R.perCat[it.cat]||0)+it.price;(R.perCust[b.cust]=R.perCust[b.cust]||{n:0,spent:0}).spent+=it.price}});
  R.live=its.filter(i=>i.live!==false&&i.status==='approved').length;R.util=R.live?R.days/(R.live*(to-from+1)):0;return R;
}
const niceStep=v=>{const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;return(n<=1?1:n<=2?2:n<=5?5:10)*p};
function areaChart(vals,days){
  const W=640,H=230,pl=46,pr=10,pt=12,pb=26,step=niceStep(Math.max(10,...vals)/4),mx=step*4,n=vals.length;
  const x=i=>pl+(W-pl-pr)*i/(n-1),y=v=>pt+(H-pt-pb)*(1-v/mx);
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`),line='M'+pts.join(' L');
  let g='';for(let k=0;k<=4;k++){const v=step*k;g+=`<line class="gl" x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl-8}" y="${y(v)+4}" text-anchor="end">${money(v)}</text>`}
  let xl='';[0,.25,.5,.75,1].forEach(f=>{const i=Math.round(f*(n-1));xl+=`<text x="${x(i)}" y="${H-6}" text-anchor="${f===0?'start':f===1?'end':'middle'}">${fmt(days[i])}</text>`});
  return `<div class="chart" id="ac" data-v="${vals.join(',')}" data-d="${days.join(',')}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue over time">${g}${xl}<path class="area" d="${line} L${x(n-1)},${y(0)} L${x(0)},${y(0)}Z"/><path class="line" pathLength="1" d="${line}"/><line id="cl" x1="0" x2="0" y1="${pt}" y2="${H-pb}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 4" opacity="0"/><circle id="cd" r="6" fill="var(--lime)" stroke="var(--ink)" stroke-width="3" opacity="0"/><rect id="ho" x="${pl}" y="0" width="${W-pl-pr}" height="${H}" fill="transparent"/></svg><div class="tip" id="tip"></div></div>`;
}
function wireArea(){
  const c=$('#ac');if(!c)return;const v=c.dataset.v.split(',').map(Number),d=c.dataset.d.split(',').map(Number),svg=$('svg',c),W=640,pl=46,pr=10,H=230,pt=12,pb=26,n=v.length,step=niceStep(Math.max(10,...v)/4),mx=step*4;
  const mv=e=>{const r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*W/r.width,i=Math.max(0,Math.min(n-1,Math.round((px-pl)/(W-pl-pr)*(n-1)))),X=pl+(W-pl-pr)*i/(n-1),Y=pt+(H-pt-pb)*(1-v[i]/mx);
    $('#cl').setAttribute('x1',X);$('#cl').setAttribute('x2',X);$('#cl').style.opacity=1;$('#cd').setAttribute('cx',X);$('#cd').setAttribute('cy',Y);$('#cd').style.opacity=1;
    const t=$('#tip');t.textContent=fmt(d[i])+' · '+money(v[i]);t.style.left=(X/W*100)+'%';t.style.top=(Y/H*r.height)+'px';t.style.opacity=1};
  svg.addEventListener('pointermove',mv);svg.addEventListener('pointerleave',()=>{['cl','cd'].forEach(k=>$('#'+k).style.opacity=0);$('#tip').style.opacity=0});
}
function vStudio(){
  const u=me();
  if(!u){$('#app').innerHTML=`<div class="gate"><p class="eyebrow">the lender studio</p><h1>Run your closet like a tiny brand</h1><p style="max-width:32em;color:var(--muted)">Manage your catalog, answer rental requests and see what your pieces earn, who rents them and which days are busiest.</p><div class="frow" style="justify-content:center"><button class="btn" data-act="auth">Log in or sign up</button>${APP.demoLogin?'<button class="btn ghost" data-act="demo" data-id="mika">Peek at the demo studio</button>':''}</div></div>`;return}
  const o=ownerOf(u.id),R=STU.range,to=TODAY,from=to-R+1,S=statsFor(u.id,from,to),Pv=statsFor(u.id,from-R,from-1),mine=allItems().filter(i=>i.owner===u.id);
  const reqs=allBk().filter(b=>mine.some(i=>i.id===b.item)&&b.status==='pending').sort((a,b)=>a.start-b.start);
  $('#app').innerHTML=`<div class="stu-h"><div><p class="eyebrow">lender studio · ${esc(o.city)}</p><h1>${esc(o.closet)}</h1></div><div class="frow"><button class="btn ghost" data-act="editcloset">Edit closet</button><button class="btn pink" data-act="additem">+ List a piece</button></div></div>
  ${(()=>{const w=mine.filter(i=>i.status==='pending').length,x=mine.filter(i=>i.status==='rejected').length;return w||x?`<div class="banner"><b>${w?w+' piece'+(w>1?'s':'')+' waiting for review':''}${w&&x?' · ':''}${x?x+' need'+(x>1?'':'s')+' changes':''}</b><span>New pieces go live after the Rentique team approves the photos, details and price.</span><button class="btn sm" data-act="stab" data-id="catalog">See catalog</button></div>`:''})()}
  <div class="tabs">${[['overview','Stats'],['catalog','Catalog ('+mine.length+')'],['requests','Requests ('+reqs.length+')']].map(([k,l])=>`<button class="chip ${STU.tab===k?'on':''}" data-act="stab" data-id="${k}">${l}</button>`).join('')}
  ${STU.tab==='overview'?`<span style="flex:1"></span>${[30,60,90].map(r=>`<button class="chip ${R===r?'on':''}" data-act="srange" data-id="${r}">${r} days</button>`).join('')}`:''}</div>
  ${STU.tab==='overview'?stuOverview(S,Pv,from,to,R,mine):STU.tab==='catalog'?stuCatalog(mine,u.id):stuReqs(u.id,reqs)}`;
  wireArea();
}
function stuOverview(S,Pv,from,to,R,mine){
  if(!mine.length)return `<div class="empty"><h3>List your first piece</h3><p>Once people rent it, stats show up here: revenue, busy days, top customers.</p><button class="btn pink" data-act="additem">+ List a piece</button></div>`;
  const dl=Pv.rev?Math.round((S.rev-Pv.rev)/Pv.rev*100):null,custs=Object.entries(S.perCust),repeat=custs.length?Math.round(custs.filter(([,v])=>v.n>1).length/custs.length*100):0,avgLen=S.cnt?S.lenSum/S.cnt:0,lead=S.cnt?S.lead/S.cnt:0;
  const bucket=Math.max(1,Math.round(R/30)),vals=[],days=[];for(let b=0;b<30;b++){const st=from+b*bucket;let s=0;for(let d=st;d<st+bucket&&d<=to;d++)s+=S.daily[d]||0;vals.push(s);days.push(st)}
  const K=[['Revenue',money(S.rev),dl==null?'first period':(dl>=0?'↑ ':'↓ ')+Math.abs(dl)+'% vs previous','var(--lime)'],['Rentals',S.cnt,'avg '+avgLen.toFixed(1)+' days each','var(--pink)'],['Utilization',Math.round(S.util*100)+'%',S.live+' pieces live','var(--tang)'],['Repeat renters',repeat+'%',custs.length+' unique renters','#8E89FF'],['Booked ahead',lead.toFixed(1)+' d','average lead time','#fff']];
  const topItems=Object.entries(S.perItem).map(([id,v])=>({it:mine.find(i=>i.id===id),...v})).filter(x=>x.it).sort((a,b)=>b.rev-a.rev).slice(0,7),mxr=Math.max(1,...topItems.map(x=>x.rev));
  const wdn=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],bd=S.weekday.indexOf(Math.max(...S.weekday));
  const cat=Object.entries(S.perCat).sort((a,b)=>b[1]-a[1]),tot=cat.reduce((s,[,v])=>s+v,0)||1,CC=['var(--pink)','var(--blue)','var(--lime)','var(--tang)','var(--violet)','var(--ink)'];let acc=0;const Cc=2*Math.PI*54;
  const top=custs.sort((a,b)=>b[1].spent-a[1].spent).slice(0,5);
  /* heatmap: 13 weeks ending this week */
  const wk0=TODAY-wd(TODAY)-12*7,out={};allBk().forEach(b=>{if(mine.some(i=>i.id===b.item)&&(b.status==='completed'||b.status==='confirmed'))for(let d=Math.max(b.start,wk0);d<=Math.min(b.end,TODAY+6);d++)out[d]=(out[d]||0)+1});
  const hm=Math.max(1,...Object.values(out));let cells='';for(let w=0;w<13;w++)for(let d=0;d<7;d++){const day=wk0+w*7+d,v=out[day]||0,fut=day>TODAY;cells+=`<span class="hc" title="${fmt(day)}: ${v} out" style="background:${fut?'transparent':`color-mix(in srgb,var(--pink) ${Math.round(v/hm*100)}%,var(--soft))`};${fut?'border-style:dashed;opacity:.5':''}"></span>`}
  const lensMax=Math.max(1,...[1,2,3,4,5].map(k=>S.lens[k]||0));
  return `<div class="kpis">${K.map((k,i)=>`<div class="kpi" style="background:${k[3]};--i:${i}"><small>${k[0]}</small><b>${k[1]}</b><small style="font-weight:500">${k[2]}</small></div>`).join('')}</div>
  <div class="dash">
  <div class="box w8"><h3>Revenue</h3><p class="sub">Rental income per ${bucket>1?bucket+'-day period':'day'} · hover to inspect</p>${areaChart(vals,days)}</div>
  <div class="box w4"><h3>Where it comes from</h3><p class="sub">Revenue by theme</p><div class="donutw"><svg viewBox="0 0 140 140" role="img" aria-label="Revenue by theme"><g transform="rotate(-90 70 70)" fill="none" stroke-width="22">${cat.map(([k,v],i)=>{const l=v/tot*Cc,s=`<circle cx="70" cy="70" r="54" stroke="${CC[i%6]}" stroke-dasharray="${Math.max(0,l-2).toFixed(1)} ${(Cc-l+2).toFixed(1)}" stroke-dashoffset="${(-acc).toFixed(1)}"/>`;acc+=l;return s}).join('')}</g></svg>
   <div class="lg">${cat.map(([k,v],i)=>`<div><i style="background:${CC[i%6]}"></i>${CAT[k].name}<b>${Math.round(v/tot*100)}%</b></div>`).join('')}</div></div></div>
  <div class="box w8"><h3>Best earners</h3><p class="sub">Revenue in this window</p><div class="bars">${topItems.map((x,i)=>`<div class="br"><span class="nm" title="${esc(x.it.name)}">${esc(x.it.name)}</span><div class="trk"><i style="width:${x.rev/mxr*100}%;animation-delay:${i*70}ms"></i></div><em>${money(x.rev)}</em></div>`).join('')||'<p class="note">No rentals in this window.</p>'}</div></div>
  <div class="box w4"><h3>Top renters</h3><p class="sub">By spend in this window</p><div class="cust">${top.map(([id,v])=>{const c=custOf(id);return `<div class="c">${av(c.name,c.hue,40)}<div><b>${esc(c.name)}</b><span>${v.n} rental${v.n>1?'s':''}</span></div><b>${money(v.spent)}</b></div>`}).join('')||'<p class="note">No renters yet.</p>'}</div></div>
  <div class="box w8"><h3>Closet busyness</h3><p class="sub">Pieces out per day, last 13 weeks. Dashed days are still ahead.</p><div class="hrows"><div class="dl">${'SMTWTFS'.split('').map(x=>`<span>${x}</span>`).join('')}</div><div class="heat">${cells}</div></div></div>
  <div class="box w4"><h3>Rental length</h3><p class="sub">Days per booking</p><div class="bars">${[1,2,3,4,5].map(k=>`<div class="br" style="grid-template-columns:34px 1fr auto"><span class="nm">${k===5?'5+':k} d</span><div class="trk"><i style="width:${(S.lens[k]||0)/lensMax*100}%;background:var(--violet)"></i></div><em>${S.lens[k]||0}</em></div>`).join('')}</div></div>
  <div class="box w12"><h3>What the numbers say</h3><div class="ins"><div><b>${wdn[bd]}</b>is your busiest pickup day. Keep your best pieces free for it.</div><div><b>${topItems[0]?esc(topItems[0].it.name):'—'}</b>earned the most. ${topItems[0]?'It was rented '+topItems[0].n+' times.':''}</div><div><b>${lead.toFixed(1)} days</b>is how far ahead people book. Answer requests inside that window.</div><div><b>${repeat}% repeat</b>${repeat>25?'Renters come back. A small returning-renter discount could pay off.':'Most renters are new. Photos of real people wearing your pieces help conversion.'}</div></div></div>
  </div>`;
}
function stuCatalog(mine,uid){
  if(!mine.length)return `<div class="empty"><h3>Your catalog is empty</h3><p>List a piece in under a minute. Our team reviews it before it goes live.</p><button class="btn pink" data-act="additem">+ List a piece</button></div>`;
  const S=statsFor(uid,TODAY-29,TODAY);
  const pill=it=>it.status==='pending'?'<span class="pill pending">In review</span>':it.status==='rejected'?'<span class="pill rejected">Needs changes</span>':it.live===false?'<span class="pill completed">Paused</span>':'<span class="pill approved">Live</span>';
  const rm=it=>`<button class="chip" data-act="del" data-id="${it.id}" aria-label="Remove ${esc(it.name)}">Remove</button>`;
  return `<div class="cat-grid">${mine.map(it=>{const s=S.perItem[it.id]||{n:0,days:0,rev:0};
    const info=it.status==='approved'?`<p class="st">30 days: ${s.n} rentals · ${money(s.rev)} · ${Math.round(s.days/30*100)}% used</p>`:it.status==='pending'?`<p class="st">Waiting for the Rentique team${it.reviewNote?' · '+esc(it.reviewNote):''}</p>`:`<p class="st why">${esc(it.reviewNote||'Not approved.')}</p>`;
    const ctl=it.status==='approved'?`<span class="stepper"><button data-act="pdown" data-id="${it.id}" aria-label="Lower price">−</button><b>${money(it.price)}/day</b><button data-act="pup" data-id="${it.id}" aria-label="Raise price">+</button></span>
      <button class="chip" data-act="photos" data-id="${it.id}">${it.photos&&it.photos.length?'Change photos':'Add photos'}</button><button class="chip" data-act="pause" data-id="${it.id}">${it.live===false?'Paused · resume':'Live · pause'}</button>${rm(it)}`
      :`<button class="chip ${it.status==='rejected'?'on':''}" data-act="edititem" data-id="${it.id}">${it.status==='rejected'?'Edit and resubmit':'Edit'}</button>${rm(it)}`;
    return `<div class="mine ${it.live===false||it.status!=='approved'?'paused':''}"><div class="th" style="background:${it.tile}">${itemArt(it)}</div><div><div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><h4><a href="#item-${it.id}">${esc(it.name)}</a></h4>${pill(it)}</div><p class="st">${esc(CAT[it.cat].name)} · ${esc(it.sizes.join(', '))} · ${money(it.price)}/day</p>${info}</div>
    <div class="ctl">${ctl}</div></div>`}).join('')}</div>`;
}
function stuReqs(uid,reqs){
  const mine=allItems().filter(i=>i.owner===uid),up=allBk().filter(b=>mine.some(i=>i.id===b.item)&&b.status==='confirmed'&&b.end>=TODAY).sort((a,b)=>a.start-b.start).slice(0,8);
  const row=(b,act)=>{const it=itemById(b.item),c=custOf(b.cust);if(!it)return'';return `<div class="req"><div class="th" style="background:${it.tile}">${itemArt(it)}</div><div class="who"><b>${esc(c.name)} · ${esc(it.name)}</b><span>${fmt(b.start,{weekday:'short',month:'short',day:'numeric'})}${b.end>b.start?' → '+fmt(b.end):''} · ${b.end-b.start+1} day(s) · ${money((b.end-b.start+1)*it.price)}</span></div><button class="btn sm ghost" data-act="chat" data-id="${b.id}">Chat</button>${act?`<button class="btn sm" data-act="approve" data-id="${b.id}">Approve</button><button class="btn sm ghost" data-act="decline" data-id="${b.id}">Decline</button>`:`<span class="pill confirmed">confirmed</span>`}</div>`};
  return `<div class="dash"><div class="box w12"><h3>Waiting on you</h3>${reqs.length?`<div class="list">${reqs.map(b=>row(b,1)).join('')}</div>`:'<p class="note">All caught up. New requests appear here.</p>'}</div>
  <div class="box w12"><h3>Coming up</h3>${up.length?`<div class="list">${up.map(b=>row(b,0)).join('')}</div>`:'<p class="note">Nothing confirmed yet.</p>'}</div></div>`;
}
function itemForm(it){
  const v=it||{},rl=v.rules||{};
  const COL=['#1b1b2f','#cfd3e6','#f5ecd9','#ff3d8b','#e02c3a','#ff8a3d','#c9f53b','#8fbf9f','#2d3bff','#9ed0ff','#cdb4ff','#7a1233'];
  const sw=(name,cur,dflt)=>{const list=cur&&!COL.includes(cur)?[...COL,cur]:COL,sel=cur||dflt;return list.map(c=>`<label><input type="radio" name="${name}" value="${c}" ${c===sel?'checked':''}><span class="c" style="background:${c}" title="${c}"></span></label>`).join('')};
  const sizes=v.sizes||['M'];
  openModal(`<h2>${it?(it.status==='rejected'?'Edit and resubmit':'Edit piece'):'List a piece'}</h2>
  <p class="note" style="margin-top:-6px">${it&&it.status==='rejected'?'Fix what the team asked for and send it back for review.':'Every new piece is reviewed by the Rentique team before it appears in Explore. We check the photos, details and price, usually within a day.'}</p>
  ${it&&it.status==='rejected'&&it.reviewNote?`<div class="banner"><b>Why it was rejected</b><span>${esc(it.reviewNote)}</span></div>`:''}
  <form class="form" id="itemf" data-edit="${it?esc(it.id):''}"><div style="display:grid;grid-template-columns:1fr 170px;gap:16px;align-items:start" class="two">
  <div class="form"><label class="field"><span>Name</span><input name="name" required maxlength="40" placeholder="e.g. Silver Mesh Halter" value="${esc(v.name||'')}"></label>
  <div class="two"><label class="field"><span>Theme</span><select name="cat">${CATS.map(c=>`<option value="${c.id}" ${v.cat===c.id?'selected':''}>${c.name}</option>`).join('')}</select></label>
  <label class="field"><span>Pattern</span><select name="pat">${['solid','stripes','dots','checks','stars','grad'].map(p=>`<option ${v.pat===p?'selected':''}>${p}</option>`).join('')}</select></label></div></div>
  <div class="prev" id="prev"></div></div>
  <div class="field"><span>Photos (up to 3, first one is the cover)</span><div class="phs"><label class="btn sm ghost" for="phin" style="cursor:pointer">+ Add photos</label><input id="phin" type="file" accept="image/*" multiple class="sr"><span id="phthumbs" class="phs"></span></div><p class="note">Clear, well-lit photos get approved faster. No photos? The illustrated preview is used.</p></div>
  <div class="field"><span>Main color (for the illustration)</span><div class="sw">${sw('c1',v.c1,COL[0])}</div></div><div class="field"><span>Accent color</span><div class="sw">${sw('c2',v.c2,COL[3])}</div></div>
  <div class="two"><label class="field"><span>Price per day ($)</span><input name="price" type="number" min="1" max="500" value="${v.price||10}" required></label><label class="field"><span>Deposit ($)</span><input name="deposit" type="number" min="0" max="500" value="${v.deposit??30}" required></label></div>
  <div class="field"><span>Sizes</span><div class="sw">${[...SZ,'One size'].map(s=>`<label><input type="checkbox" name="sz" value="${s}" ${sizes.includes(s)?'checked':''}><span class="chip t">${s}</span></label>`).join('')}</div></div>
  <div class="two"><label class="field"><span>Max days per rental</span><select name="max">${[2,3,4,5,7,10].map(n=>`<option ${n===(rl.max||5)?'selected':''}>${n}</option>`).join('')}</select></label><label class="field"><span>Late fee per day ($)</span><input name="late" type="number" min="0" value="${rl.late??8}"></label></div>
  <label class="field"><span>Do's (comma separated)</span><input name="dos" maxlength="120" placeholder="Steam it, send a fit pic" value="${esc((rl.dos||[]).join(', '))}"></label>
  <label class="field"><span>Don'ts (comma separated)</span><input name="donts" maxlength="120" placeholder="No smoking, no alterations" value="${esc((rl.donts||[]).join(', '))}"></label>
  <label class="field"><span>Description</span><textarea name="desc" rows="2" maxlength="200" placeholder="Fit, feel, what it goes with">${esc(v.desc||'')}</textarea></label>
  <p class="note" id="ferr" role="alert" style="color:var(--bad)"></p><button class="btn pink" type="submit">Send for review</button></form>`,'wide');
  FP=(v.photos||[]).slice();drawThumbs();
}
function updPrev(){const f=$('#itemf');if(!f)return;const v=n=>(f.elements[n].value);if(FP[0]){$('#prev').innerHTML=`<img class="ph" src="${FP[0]}" alt="Cover preview">`;return}$('#prev').innerHTML=art(CAT[v('cat')].shape,v('c1'),v('c2'),v('pat'),'Preview')}
async function saveItem(f){
  const g=n=>f.elements[n].value.trim(),sizes=$$('input[name=sz]:checked',f).map(x=>x.value),list=s=>g(s).split(',').map(x=>x.trim()).filter(Boolean);
  if(!sizes.length){$('#ferr').textContent='Pick at least one size.';return}
  const btn=$('button[type=submit]',f);btn.disabled=true;$('#ferr').textContent='';
  const eid=f.dataset.edit,body={name:g('name'),cat:g('cat'),pat:g('pat'),c1:g('c1'),c2:g('c2'),price:+g('price'),deposit:+g('deposit'),max:+g('max'),late:+g('late')||0,sizes,dos:list('dos'),donts:list('donts'),desc:g('desc'),photos:FP};
  try{const r=await api(eid?'/items/'+eid:'/items',eid?'PUT':'POST',body);
    await refresh();closeModal();STU.tab='catalog';render(true);
    toast(r.status==='approved'?'Listed! It is live in Explore.':'Sent for review. It goes live once the Rentique team approves it.')}
  catch(e){$('#ferr').textContent=e.message;btn.disabled=false}
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t)return;const a=t.dataset.act,id=t.dataset.id;
  if(a==='ovclose'){if(e.target===t)closeModal();return}
  if(a==='close')return closeModal();
  if(a==='theme'){const root=document.documentElement,dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;root.dataset.theme=dark?'light':'dark';try{localStorage.setItem('rentique.theme',root.dataset.theme)}catch(x){}return}
  if(a==='auth')return authModal('login');
  if(a==='authtab')return authModal(id);
  if(a==='demo'){api('/auth/demo','POST',{who:id}).then(afterLogin).catch(x=>toast(x.message));return}
  if(a==='logout'){(async()=>{await act(()=>api('/auth/logout','POST'));await refresh();toast('Logged out');if(location.hash==='#home')render();else location.hash='home'})();return}
  if(a==='save'){e.preventDefault();if(!me()){authModal('login');toast('Log in to save pieces');return}
    const had=APP.saved.includes(id);if(had)APP.saved.splice(APP.saved.indexOf(id),1);else APP.saved.push(id);
    t.classList.toggle('on',!had);t.setAttribute('aria-pressed',String(!had));t.classList.remove('pop');void t.offsetWidth;t.classList.add('pop');renderHeader();
    api('/saves/'+id,had?'DELETE':'POST').then(()=>{if(route().name==='me'&&MT==='saved')vMe()}).catch(x=>{toast(x.message);refresh().then(()=>render(true))});return}
  if(a==='cat'){F.cat=id;F.owner='';location.hash==='#explore'?render(true):location.hash='explore';return}
  if(a==='closet'){F.owner=id;F.cat='all';location.hash==='#explore'?render(true):location.hash='explore';return}
  if(a==='clearf'){Object.assign(F,{q:'',cat:'all',size:'',max:30,from:'',to:'',owner:''});render(true);return}
  const it=()=>itemById(P.id);
  if(a==='cprev'){P.m--;if(P.m<0){P.m=11;P.y--}drawPanel(it());return}
  if(a==='cnext'){P.m++;if(P.m>11){P.m=0;P.y++}drawPanel(it());return}
  if(a==='day'){const d=+t.dataset.d,m=it(),bs=blockedSet(m.id);
    if(P.s==null||P.e!=null){P.s=d;P.e=null}
    else if(d<P.s){P.s=d}
    else{let hit=false;for(let k=P.s;k<=d;k++)if(bs.has(k))hit=true;
      if(hit){toast('Someone already has a day in that range');P.s=d;P.e=null}
      else if(d-P.s+1>m.rules.max){toast('This lender allows up to '+m.rules.max+' days');}
      else P.e=d}
    drawPanel(m);return}
  if(a==='size'){P.size=t.value;return}
  if(a==='rent'){
    const u=me();if(!u){afterAuth=null;authModal('signup');toast('Log in to send your request');return}
    const m=itemById(id);if(m.owner===u.id){toast("That's your own piece");return}
    const s=P.s,en=P.e??P.s;t.disabled=true;
    api('/bookings','POST',{item:id,start:s,end:en,size:P.size,message:(P.msg||'').trim()||undefined}).then(async r=>{P.msg='';await refresh();P.s=P.e=null;drawPanel(itemById(id));confetti();const o=ownerOf(m.owner),n=en-s+1;
      openModal(`<h2>Request sent!</h2><p>${esc(o.name.split(' ')[0])} usually replies in ${esc(o.resp)}. You will find ${esc(m.name)} (${fmt(s)}${n>1?' → '+fmt(en):''}) under My rentals.</p><div class="frow"><button class="btn pink" data-act="chat" data-id="${r.id}">Open chat</button><a class="btn" href="#me" data-act="close">See my rentals</a><button class="btn ghost" data-act="close">Keep browsing</button></div>`)}).catch(async x=>{toast(x.message);await refresh();drawPanel(itemById(id))});return}
  if(a==='ph'){P.ph=+id;const m=itemById(P.id);$('#bigimg').innerHTML=itemArt(m,P.ph);$$('.gal button').forEach((b,i)=>b.classList.toggle('on',i===P.ph));return}
  if(a==='phrm'){FP.splice(+id,1);drawThumbs();return}
  if(a==='photos'){const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.multiple=true;inp.onchange=async()=>{const got=await readMany(inp.files,3);if(!got.length)return;mut(()=>api('/items/'+id+'/photos','PUT',{photos:got}),itemById(id).status==='approved'?'New photos sent for review. The piece is hidden until they are approved.':'Photos updated',vStudio)};inp.click();return}
  if(a==='mtab'){MT=id;vMe();return}
  if(a==='cancel'){mut(()=>api('/bookings/'+id,'PATCH',{status:'cancelled'}),'Rental cancelled',vMe);return}
  if(a==='stab'){STU.tab=id;vStudio();return}
  if(a==='srange'){STU.range=+id;vStudio();return}
  if(a==='additem')return itemForm();
  if(a==='editcloset')return closetModal();
  if(a==='edititem')return itemForm(itemById(id));
  if(a==='pup'||a==='pdown'){const m=itemById(id);mut(()=>api('/items/'+id,'PATCH',{price:Math.max(1,m.price+(a==='pup'?1:-1))}),null,vStudio);return}
  if(a==='pause'){const m=itemById(id);mut(()=>api('/items/'+id,'PATCH',{live:m.live===false}),null,vStudio);return}
  if(a==='del'){mut(()=>api('/items/'+id,'DELETE'),'Removed from your closet',vStudio);return}
  if(a==='approve'){mut(()=>api('/bookings/'+id,'PATCH',{status:'confirmed'}),'Approved. The renter can see it now.',vStudio);return}
  if(a==='decline'){mut(()=>api('/bookings/'+id,'PATCH',{status:'declined'}),'Declined',vStudio);return}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='rmsg')P.msg=t.value;
  if(t.id==='q'){F.q=t.value;refreshGrid()}
  if(t.id==='fmax'){F.max=+t.value;$('#mx').textContent=money(F.max);refreshGrid()}
  if(t.closest&&t.closest('#itemf'))updPrev();
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='fsize'){F.size=t.value;refreshGrid()}
  if(t.id==='fsort'){F.sort=t.value;refreshGrid()}
  if(t.id==='ffrom'){F.from=t.value;if(F.to&&pdate(F.to)<pdate(F.from)){F.to='';$('#fto').value=''}refreshGrid()}
  if(t.id==='fto'){F.to=t.value;refreshGrid()}
  if(t.id==='phin'){readMany(t.files,3-FP.length).then(g=>{FP.push(...g);t.value='';drawThumbs()});return}
  if(t.closest&&t.closest('#itemf'))updPrev();
});

/* ---------- boot ---------- */
try{const th=localStorage.getItem('rentique.theme');if(th)document.documentElement.dataset.theme=th}catch(e){}
const boot=async()=>{try{await refresh()}catch(e){$('#app').innerHTML='<div class="gate"><h1>Cannot reach the server</h1><p>Check your connection and reload the page.</p></div>';return}render()};
// wait until messages.js and admin.js (also deferred) have run
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
