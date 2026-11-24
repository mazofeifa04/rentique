"use strict";
/* ---------- super admin: review queue, users, lenders, pieces, conversations ---------- */
const ADM={tab:'queue',users:[],threads:[],uq:'',uf:'all',pf:'pending',pq:'',tq:''};
const joinedOn=iso=>new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const userKind=u=>u.role==='admin'?'Admin':u.pieces>0&&u.rentals>0?'Renter + lender':u.pieces>0?'Lender':'Renter';
const emailOf=id=>{const u=ADM.users.find(x=>x.id===id);return u?u.email:''};
const gate=(m)=>`<div class="gate"><p class="eyebrow">restricted</p><h1>Super admin only</h1><p style="color:var(--muted)">${m}</p>${APP.user?'<a class="btn" href="#home">Back home</a>':`<button class="btn" data-act="auth">Log in</button>${APP.demoLogin?'<button class="btn ghost" data-act="demo" data-id="admin">Try the demo super admin</button>':''}`}</div>`;
const spill=s=>`<span class="pill ${s==='approved'?'approved':s}">${s==='pending'?'In review':s}</span>`;

async function loadAdmin(){
  const [users,threads]=await Promise.all([api('/admin/users'),api('/admin/threads')]);
  ADM.users=users;ADM.threads=threads;
}
async function vAdmin(){
  const u=me();
  if(!u||u.role!=='admin'){$('#app').innerHTML=gate(u?'This area is for platform administrators.':'Log in with an administrator account to continue.');return}
  $('#app').innerHTML=`<div class="stu-h"><div><p class="eyebrow">control room</p><h1>Super admin</h1></div></div><p class="note">Loading…</p>`;
  try{await loadAdmin()}catch(e){$('#app').innerHTML=`<div class="gate"><h1>Could not load</h1><p>${esc(e.message)}</p></div>`;return}
  drawAdmin();
}
const pendingItems=()=>APP.items.filter(i=>i.status==='pending').sort((a,b)=>new Date(a.submittedAt)-new Date(b.submittedAt));

function drawAdmin(){
  if(route().name!=='admin')return;
  const pend=pendingItems(),lenders=ADM.users.filter(u=>u.pieces>0),people=ADM.users.filter(u=>u.role!=='admin');
  const K=[['Waiting for review',pend.length,'var(--tang)'],['Users',people.length,'var(--lime)'],['Lenders',lenders.length,'var(--pink)'],['Live pieces',pubItems().length,'#8E89FF'],['Rentals',APP.bookings.filter(b=>b.status!=='cancelled'&&b.status!=='declined').length,'#fff'],['Conversations',ADM.threads.length,'#fff']];
  const T=[['queue','Review queue ('+pend.length+')'],['users','Users ('+people.length+')'],['lenders','Lenders ('+lenders.length+')'],['pieces','Pieces ('+APP.items.length+')'],['convos','Conversations ('+ADM.threads.length+')']];
  $('#app').innerHTML=`<div class="stu-h"><div><p class="eyebrow">control room</p><h1>Super admin</h1></div></div>
  <div class="kpis">${K.map((k,i)=>`<div class="kpi" style="background:${k[2]};--i:${i}"><small>${k[0]}</small><b>${k[1]}</b></div>`).join('')}</div>
  <div class="tabs">${T.map(([k,l])=>`<button class="chip ${ADM.tab===k?'on':''}" data-act="atab" data-id="${k}">${l}</button>`).join('')}</div>
  <div id="atab">${({queue:aQueue,users:aUsers,lenders:aLenders,pieces:aPieces,convos:aConvos})[ADM.tab](pend)}</div>`;
}
async function reloadAdmin(){try{await Promise.all([refresh(),loadAdmin()])}catch(e){toast(e.message)}renderHeader();drawAdmin()}

/* ---- review queue ---- */
function qCard(it){
  const R=it.rules,o=ownerOf(it.owner),own=ADM.users.find(u=>u.id===it.owner)||{},c=CAT[it.cat];
  const list=a=>a&&a.length?`<ul>${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<span class="note">None</span>';
  return `<article class="qc" id="q-${esc(it.id)}">
  <div class="qph">${it.photos.length?it.photos.map((p,i)=>`<a href="${esc(p)}" target="_blank" rel="noopener" aria-label="Open photo ${i+1} full size"><img class="ph" src="${esc(p)}" alt="${esc(it.name)}, photo ${i+1}"></a>`).join(''):`<div class="qnone"><div class="qill" style="background:${it.tile}">${itemArt(it)}</div><span class="pill pending">No photos uploaded</span></div>`}</div>
  <div class="qd">
    <div class="row" style="justify-content:flex-start;gap:10px;flex-wrap:wrap"><h3>${esc(it.name)}</h3><span class="pill pending">${it.reviewNote?esc(it.reviewNote):'New piece'}</span></div>
    <dl class="spec">
      <dt>Theme</dt><dd>${esc(c.name)}</dd>
      <dt>Price</dt><dd><b>${money(it.price)}</b>/day · ${money(it.deposit)} deposit</dd>
      <dt>Sizes</dt><dd>${esc(it.sizes.join(', '))}</dd>
      <dt>Rental</dt><dd>${R.min===R.max?R.min:R.min+' to '+R.max} days · late fee ${money(R.late)}/day</dd>
      <dt>Pickup</dt><dd>${esc(R.pickup)}</dd><dt>Cleaning</dt><dd>${esc(R.cleaning)}</dd>
      <dt>Do</dt><dd>${list(R.dos)}</dd><dt>Don't</dt><dd>${list(R.donts)}</dd>
      <dt>Description</dt><dd>${esc(it.desc)}</dd>
      <dt>Look</dt><dd><span class="sw2" style="background:${esc(it.c1)}"></span><span class="sw2" style="background:${esc(it.c2)}"></span> ${esc(it.pat)}</dd>
      <dt>Submitted</dt><dd>${it.submittedAt?stamp(it.submittedAt):''}</dd></dl>
    <div class="qown">${av(o.name,o.hue,36)}<div><b>${esc(o.name)}</b> · ${esc(o.closet)}<br><span class="note">${esc(own.email||'')} · joined ${own.joined?joinedOn(own.joined):''} · ${own.approved||0} approved piece${own.approved===1?'':'s'}, ${own.pending||0} in review</span></div><button class="btn sm ghost" data-act="auser" data-id="${esc(it.owner)}">View account</button></div>
    <div class="qact"><button class="btn" data-act="qapprove" data-id="${esc(it.id)}">Approve and publish</button><button class="btn ghost" data-act="qreject" data-id="${esc(it.id)}">Reject…</button></div>
    <div class="qrej" id="rj-${esc(it.id)}" hidden>
      <p class="note">The lender sees this message and can fix the piece and resubmit it.</p>
      <div class="frow">${['Photos are unclear or too dark','Details are incomplete','Price looks off for this piece','Not allowed: replicas or unsafe items'].map(t=>`<button type="button" class="chip" data-act="qchip" data-id="${esc(it.id)}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <textarea id="rn-${esc(it.id)}" rows="2" maxlength="400" placeholder="Reason for the lender (required)"></textarea>
      <button class="btn pink" data-act="qrejectgo" data-id="${esc(it.id)}">Send rejection</button></div>
  </div></article>`;
}
function aQueue(pend){
  return pend.length?`<p class="note" style="margin-bottom:14px">Oldest first. Nothing here is visible to renters until you approve it. Photos open full size in a new tab.</p><div class="list">${pend.map(qCard).join('')}</div>`
    :`<div class="empty"><h3>The queue is clear</h3><p>New pieces and changed photos show up here for review.</p></div>`;
}

/* ---- users ---- */
function filteredUsers(){
  const q=ADM.uq.toLowerCase();
  return ADM.users.filter(u=>(ADM.uf==='all'||(ADM.uf==='renters'&&u.role!=='admin'&&u.rentals>0)||(ADM.uf==='lenders'&&u.pieces>0)||(ADM.uf==='suspended'&&u.suspended)||(ADM.uf==='admins'&&u.role==='admin'))&&(!q||(u.name+' '+u.email+' '+(u.closet||'')).toLowerCase().includes(q)));
}
function usersRows(){
  const L=filteredUsers();
  return L.length?L.map(u=>`<tr class="${u.suspended?'susp':''}"><td><div class="ucell">${av(u.name,u.role==='admin'?'#16133F':(ownerOf(u.id).hue||'#9B6BFF'),34)}<div><b>${esc(u.name)}</b><br><span class="note">${esc(u.email)}</span></div></div></td>
    <td>${userKind(u)}</td><td>${joinedOn(u.joined)}</td><td class="num">${u.rentals}</td><td class="num">${u.approved}${u.pending?` <span class="pill pending">+${u.pending}</span>`:''}</td><td class="num">${u.received}</td>
    <td>${u.suspended?'<span class="pill rejected">Suspended</span>':'<span class="pill approved">Active</span>'}</td><td><button class="btn sm ghost" data-act="auser" data-id="${esc(u.id)}">Open</button></td></tr>`).join(''):`<tr><td colspan="8" class="note" style="padding:24px;text-align:center">No users match.</td></tr>`;
}
function aUsers(){
  return `<div class="frow" style="margin-bottom:14px"><label class="field search"><span>Search</span><input id="auq" type="search" placeholder="Name, email or closet" value="${esc(ADM.uq)}"></label>
  ${[['all','All'],['renters','Renters'],['lenders','Lenders'],['suspended','Suspended'],['admins','Admins']].map(([k,l])=>`<button class="chip ${ADM.uf===k?'on':''}" data-act="auf" data-id="${k}">${l}</button>`).join('')}</div>
  <div class="tw"><table class="tbl"><thead><tr><th>User</th><th>Type</th><th>Joined</th><th class="num">Rentals</th><th class="num">Pieces</th><th class="num">Received</th><th>Status</th><th></th></tr></thead><tbody id="utbody">${usersRows()}</tbody></table></div>`;
}

/* ---- lenders ---- */
function lenderStats(uid){
  const its=APP.items.filter(i=>i.owner===uid);let rev=0,n=0;
  APP.bookings.forEach(b=>{const it=its.find(i=>i.id===b.item);if(it&&(b.status==='completed'||b.status==='confirmed')&&b.start<=TODAY){rev+=(b.end-b.start+1)*it.price;n++}});
  return{rev,n};
}
function aLenders(){
  const L=ADM.users.filter(u=>u.pieces>0).map(u=>({u,...lenderStats(u.id)})).sort((a,b)=>b.rev-a.rev);
  return `<div class="cat-grid">${L.map(({u,rev,n})=>{const o=ownerOf(u.id);return `<div class="mine lcard ${u.suspended?'paused':''}"><div class="th">${av(u.name,o.hue,64)}</div><div><h4>${esc(o.closet)}</h4><p class="st">${esc(u.name)} · ${esc(u.email)}</p><p class="st">${esc(o.city)} · since ${joinedOn(u.joined)}</p></div>
    <div class="lstats"><div><b>${money(rev)}</b><span>earned</span></div><div><b>${n}</b><span>rentals</span></div><div><b>${u.approved}</b><span>live</span></div><div><b>${u.pending}</b><span>in review</span></div></div>
    <div class="ctl"><button class="chip" data-act="auser" data-id="${esc(u.id)}">Account</button><button class="chip" data-act="aclo" data-id="${esc(u.id)}">See closet</button>${u.suspended?'<span class="pill rejected">Suspended</span>':''}</div></div>`}).join('')}</div>`;
}

/* ---- pieces ---- */
function filteredPieces(){
  const q=ADM.pq.toLowerCase();
  return APP.items.filter(i=>(ADM.pf==='all'||(ADM.pf==='paused'?(i.status==='approved'&&i.live===false):i.status===ADM.pf))&&(!q||(i.name+' '+ownerOf(i.owner).name+' '+ownerOf(i.owner).closet).toLowerCase().includes(q)));
}
function piecesRows(){
  const L=filteredPieces();
  return L.length?L.map(it=>`<tr><td><div class="ucell"><span class="mini" style="background:${it.tile}">${itemArt(it)}</span><div><b><a href="#item-${esc(it.id)}">${esc(it.name)}</a></b><br><span class="note">${esc(CAT[it.cat].name)}</span></div></div></td>
    <td>${esc(ownerOf(it.owner).closet)}</td><td class="num">${money(it.price)}</td><td>${it.status==='approved'&&it.live===false?'<span class="pill completed">Paused</span>':spill(it.status)}${it.status==='rejected'&&it.reviewNote?`<br><span class="note">${esc(it.reviewNote)}</span>`:''}</td>
    <td>${it.submittedAt?joinedOn(it.submittedAt):''}</td><td><button class="btn sm ghost" data-act="arem" data-id="${esc(it.id)}">Remove</button></td></tr>`).join(''):`<tr><td colspan="6" class="note" style="padding:24px;text-align:center">No pieces match.</td></tr>`;
}
function aPieces(){
  return `<div class="frow" style="margin-bottom:14px"><label class="field search"><span>Search</span><input id="apq" type="search" placeholder="Piece or lender" value="${esc(ADM.pq)}"></label>
  ${[['pending','In review'],['approved','Approved'],['rejected','Rejected'],['paused','Paused'],['all','All']].map(([k,l])=>`<button class="chip ${ADM.pf===k?'on':''}" data-act="apf" data-id="${k}">${l}</button>`).join('')}</div>
  <div class="tw"><table class="tbl"><thead><tr><th>Piece</th><th>Lender</th><th class="num">Price</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody id="ptbody">${piecesRows()}</tbody></table></div>`;
}

/* ---- conversations ---- */
function threadRows(){
  const q=ADM.tq.toLowerCase(),L=ADM.threads.filter(t=>!q||(t.renter.name+' '+t.lender.name+' '+t.lender.closet+' '+(t.lastBody||'')).toLowerCase().includes(q));
  return L.length?L.map(t=>`<button class="trow2" data-act="athread" data-id="${esc(t.id)}">${av(t.renter.name,t.renter.hue,38)}<div class="tmeta"><div class="row"><b>${esc(t.renter.name)} <span class="note">with</span> ${esc(t.lender.closet)}</b><time>${ago(t.lastAt)}</time></div><span class="prev1">${t.lastBody?esc(t.lastBody):'<i>No messages yet</i>'}</span><span class="note">${t.messages} message${t.messages===1?'':'s'} · ${t.rentals} rental${t.rentals===1?'':'s'}</span></div></button>`).join(''):`<p class="note" style="padding:20px">No conversations match.</p>`;
}
function aConvos(){
  return `<div class="frow" style="margin-bottom:14px"><label class="field search"><span>Search</span><input id="atq" type="search" placeholder="Name, closet or words in the last message" value="${esc(ADM.tq)}"></label></div><p class="note" style="margin-bottom:10px">You can read every conversation. Super admins cannot post in them.</p><div class="tlist2" id="ttbody">${threadRows()}</div>`;
}
async function openTranscript(id){
  try{
    const d=await api('/threads/'+id);
    openModal(`<h2>${esc(d.thread.renter.name)} <span class="note">with</span> ${esc(d.thread.lender.closet)}</h2><p class="note">Read-only · ${d.bookings.length} rental${d.bookings.length===1?'':'s'} · ${d.messages.length} message${d.messages.length===1?'':'s'}</p><div class="msgs tx">${transcriptHTML(d,d.thread.lender.id)}</div>`,'wide');
  }catch(e){toast(e.message)}
}

/* ---- one account ---- */
async function userModal(id){
  try{
    const d=await api('/admin/users/'+id),u=d.user,admin=u.role==='admin',o=ownerOf(u.id);
    openModal(`<div class="ucell" style="gap:14px">${av(u.name,admin?'#16133F':o.hue,56)}<div><h2 style="font-size:1.7rem">${esc(u.name)}</h2><span class="note">${esc(u.email)} · joined ${joinedOn(u.joined)}</span></div></div>
    <div class="frow">${admin?'<span class="pill approved">Super admin</span>':u.suspended?'<span class="pill rejected">Suspended</span>':'<span class="pill approved">Active</span>'}${u.closet?`<span class="note">Closet: ${esc(u.closet)} · ${esc(u.city)}</span>`:''}</div>
    ${admin?'':`<div class="frow"><button class="btn ${u.suspended?'':'pink'} sm" data-act="asusp" data-id="${esc(u.id)}" data-on="${u.suspended?'0':'1'}">${u.suspended?'Unsuspend account':'Suspend account'}</button><span class="note">${u.suspended?'They can log in again and their pieces return.':'Logs them out now, blocks login and hides their pieces.'}</span></div>`}
    <h3 style="font-size:1.15rem">Rentals (${d.rentals.length})</h3>${d.rentals.length?`<div class="tw"><table class="tbl"><tbody>${d.rentals.map(r=>`<tr><td><b>${esc(r.item)}</b><br><span class="note">from ${esc(r.lender)}</span></td><td>${fmt(r.start)}${r.end>r.start?' – '+fmt(r.end):''}</td><td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table></div>`:'<p class="note">No rentals.</p>'}
    <h3 style="font-size:1.15rem">Pieces (${d.pieces.length})</h3>${d.pieces.length?`<div class="tw"><table class="tbl"><tbody>${d.pieces.map(p=>`<tr><td><b><a href="#item-${esc(p.id)}" data-act="close">${esc(p.name)}</a></b>${p.note?`<br><span class="note">${esc(p.note)}</span>`:''}</td><td class="num">${money(p.price)}</td><td>${spill(p.status)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="note">No pieces.</p>'}
    <h3 style="font-size:1.15rem">Conversations (${d.threads.length})</h3>${d.threads.length?`<div class="frow">${d.threads.map(t=>`<button class="chip" data-act="athread" data-id="${esc(t.id)}">${esc(t.renter)} ↔ ${esc(t.lender)}</button>`).join('')}</div>`:'<p class="note">None.</p>'}`,'wide');
  }catch(e){toast(e.message)}
}

/* ---- actions ---- */
const armed=(t,label)=>{ // two-step confirm without confirm(): first click arms, second click acts
  if(t.dataset.armed)return true;
  const old=t.textContent;t.dataset.armed='1';t.textContent=label;
  setTimeout(()=>{if(t.isConnected){t.textContent=old;delete t.dataset.armed}},4000);return false;
};
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-act]');if(!t||route().name!=='admin'&&!['auser','athread','asusp'].includes(t.dataset.act))return;
  const a=t.dataset.act,id=t.dataset.id;
  if(a==='atab'){ADM.tab=id;drawAdmin();return}
  if(a==='qapprove'){t.disabled=true;try{await api('/admin/items/'+id+'/review','POST',{decision:'approve'});toast('Approved. It is live in Explore.');await reloadAdmin()}catch(x){toast(x.message);t.disabled=false}return}
  if(a==='qreject'){const p=$('#rj-'+id);p.hidden=!p.hidden;if(!p.hidden)$('#rn-'+id).focus();return}
  if(a==='qchip'){$('#rn-'+id).value=t.dataset.t;return}
  if(a==='qrejectgo'){const note=$('#rn-'+id).value.trim();if(note.length<3){toast('Add a short reason so the lender can fix it');$('#rn-'+id).focus();return}t.disabled=true;try{await api('/admin/items/'+id+'/review','POST',{decision:'reject',note});toast('Rejected. The lender can see why.');await reloadAdmin()}catch(x){toast(x.message);t.disabled=false}return}
  if(a==='auser'){userModal(id);return}
  if(a==='athread'){openTranscript(id);return}
  if(a==='asusp'){const on=t.dataset.on==='1';if(on&&!armed(t,'Click again to suspend'))return;try{await api('/admin/users/'+id+'/suspend','POST',{suspended:on});toast(on?'Account suspended':'Account restored');await reloadAdmin();userModal(id)}catch(x){toast(x.message)}return}
  if(a==='arem'){if(!armed(t,'Click again to remove'))return;try{await api('/admin/items/'+id,'DELETE');toast('Piece removed');await reloadAdmin()}catch(x){toast(x.message)}return}
  if(a==='auf'){ADM.uf=id;drawAdmin();return}
  if(a==='apf'){ADM.pf=id;drawAdmin();return}
  if(a==='aclo'){F.owner=id;F.cat='all';location.hash='explore';return}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='auq'){ADM.uq=t.value;$('#utbody').innerHTML=usersRows()}
  if(t.id==='apq'){ADM.pq=t.value;$('#ptbody').innerHTML=piecesRows()}
  if(t.id==='atq'){ADM.tq=t.value;$('#ttbody').innerHTML=threadRows()}
});
