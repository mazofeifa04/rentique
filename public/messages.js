"use strict";
/* ---------- messages: one conversation per renter + lender pair, grouped by rental ---------- */
const MSG={threads:[],cur:null,detail:null,timer:null,sig:''};
const ago=iso=>{const d=new Date(iso),n=new Date();return d.toDateString()===n.toDateString()?d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):d.toLocaleDateString('en-US',{month:'short',day:'numeric'})};
const stamp=iso=>new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const bkRange=b=>fmt(b.start)+(b.end>b.start?' – '+fmt(b.end):'');
const unreadTotal=l=>l.reduce((a,x)=>a+x.unread,0);

/* Transcript shared by the inbox and the super admin: messages grouped under the rental they belong to. */
function transcriptHTML(d,rightId){
  const byB={},early=[];
  d.messages.forEach(m=>{(m.booking&&d.bookings.some(b=>b.id===m.booking)?(byB[m.booking]=byB[m.booking]||[]):early).push(m)});
  const admin=d.thread.you==='admin',names={[d.thread.renter.id]:d.thread.renter.name,[d.thread.lender.id]:d.thread.lender.name};
  const bub=m=>`<div class="bub ${m.from===rightId?'me':''}">${admin?`<span class="bwho">${esc(names[m.from]||'')}</span>`:''}<p>${esc(m.body)}</p><time datetime="${esc(m.at)}">${stamp(m.at)}</time></div>`;
  let out='';
  if(early.length)out+=`<div class="bkdiv"><span>Earlier</span></div>`+early.map(bub).join('');
  d.bookings.forEach(b=>{
    out+=`<div class="bkdiv"><a href="#item-${esc(b.item.id)}">${esc(b.item.name)}</a><span>${bkRange(b)}</span><span class="pill ${esc(b.status)}">${esc(b.status)}</span></div>`;
    out+=(byB[b.id]||[]).map(bub).join('')||`<p class="note bkempty">No messages about this rental yet.</p>`;
  });
  return out||'<p class="note" style="text-align:center">No messages yet.</p>';
}

function convHTML(d){
  const u=me(),t=d.thread,other=t.you==='renter'?t.lender:t.renter;
  const latest=d.bookings.length?d.bookings[d.bookings.length-1].id:'';
  return `<header class="chead"><a class="back2" href="#messages">← All</a>${av(other.name,other.hue,40)}<div><b>${esc(other.name)}</b><span class="note">${t.you==='renter'?esc(t.lender.closet):'Renter'} · ${d.bookings.length} rental${d.bookings.length===1?'':'s'} together</span></div></header>
  <div class="msgs" id="msgs">${transcriptHTML(d,u.id)}</div>
  <form class="composer" id="cmp"><select id="cbk" aria-label="Which rental is this about?" ${d.bookings.length>1?'':'hidden'}>${[...d.bookings].reverse().map(b=>`<option value="${esc(b.id)}" ${b.id===latest?'selected':''}>About: ${esc(b.item.name)} · ${bkRange(b)}</option>`).join('')}</select>
  <textarea id="cbody" rows="2" maxlength="1000" placeholder="Write a message…" aria-label="Message"></textarea><button class="btn" type="submit">Send</button></form>`;
}
const toBottom=()=>{const m=$('#msgs');if(m)m.scrollTop=m.scrollHeight};

function drawList(){
  const el=$('#tl');if(!el)return;
  el.innerHTML=MSG.threads.length?MSG.threads.map(t=>`<a class="trow ${t.id===MSG.cur?'on':''}" href="#messages-${esc(t.id)}">${av(t.other.name,t.other.hue,42)}<div class="tmeta"><div class="row"><b>${esc(t.other.name)}</b><time>${ago(t.lastAt)}</time></div><span class="prev1">${t.lastBody?(t.lastFromMe?'You: ':'')+esc(t.lastBody):'<i>No messages yet</i>'}</span></div>${t.unread?`<span class="nb">${t.unread}</span>`:''}</a>`).join('')
    :`<div class="empty" style="margin:12px"><h3>No conversations yet</h3><p>A chat opens automatically when you request a rental or receive one.</p><a class="btn" href="#explore">Explore fits</a></div>`;
}
async function loadThreads(){
  MSG.threads=await api('/threads');APP.unread=unreadTotal(MSG.threads);renderHeader();drawList();
}
function drawConv(d){
  const el=$('#cv');if(!el)return;
  MSG.detail=d;
  if(!d){el.innerHTML=`<div class="convempty"><h3>Pick a conversation</h3><p>Messages about each rental stay together, so you can see past chats with the same person.</p></div>`;return}
  const keep=$('#cbody')?$('#cbody').value:'';
  el.innerHTML=convHTML(d);if(keep)$('#cbody').value=keep;
  MSG.sig=d.messages.length+':'+(d.messages.length?d.messages[d.messages.length-1].id:'');
  toBottom();
}
async function openThread(id,first){
  try{const d=await api('/threads/'+id);if(MSG.cur!==id||route().name!=='messages')return;drawConv(d);await loadThreads()}
  catch(e){toast(e.message);location.hash='messages'}
}
async function pollMsgs(){
  if(document.hidden||route().name!=='messages')return;
  try{
    await loadThreads();
    if(!MSG.cur)return;
    const d=await api('/threads/'+MSG.cur),sig=d.messages.length+':'+(d.messages.length?d.messages[d.messages.length-1].id:'');
    if(sig!==MSG.sig){const m=$('#msgs'),near=m&&m.scrollHeight-m.scrollTop-m.clientHeight<80;MSG.detail=d;MSG.sig=sig;if(m){m.innerHTML=transcriptHTML(d,me().id);if(near)toBottom()}await loadThreads()}
  }catch(e){}
}
async function vMessages(r){
  clearInterval(MSG.timer);
  const u=me();
  if(!u){$('#app').innerHTML=`<div class="gate"><p class="eyebrow">inbox</p><h1>Your messages</h1><p>Log in to chat with renters and lenders about your rentals.</p><button class="btn" data-act="auth">Log in or sign up</button></div>`;return}
  if(u.role==='admin'){location.hash='admin';return}
  MSG.cur=r.id||null;
  $('#app').innerHTML=`<div class="stu-h"><div><p class="eyebrow">inbox</p><h1>Messages</h1></div></div><div class="mw ${MSG.cur?'open':''}" id="mw"><aside class="tl" id="tl" aria-label="Conversations"></aside><section class="cv" id="cv"></section></div>`;
  drawConv(null);
  try{await loadThreads()}catch(e){toast(e.message);return}
  if(MSG.cur)await openThread(MSG.cur,true);
  MSG.timer=setInterval(pollMsgs,8000);
}

document.addEventListener('submit',async e=>{
  if(e.target.id!=='cmp')return;e.preventDefault();
  const ta=$('#cbody'),body=ta.value.trim();if(!body)return;
  const btn=$('button[type=submit]',e.target);btn.disabled=true;
  try{await api('/threads/'+MSG.cur+'/messages','POST',{body,booking:$('#cbk').value||undefined});ta.value='';await openThread(MSG.cur)}
  catch(x){toast(x.message)}
  finally{btn.disabled=false}
});
document.addEventListener('keydown',e=>{if(e.target.id==='cbody'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#cmp').requestSubmit()}});
// "Message" / "Chat" / "Open chat" buttons next to a rental
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-act="chat"]');if(!t)return;
  try{const r=await api('/threads/for-booking/'+t.dataset.id);closeModal();location.hash='messages-'+r.id}
  catch(x){toast(x.message)}
});
// unread badge in the header while browsing other pages
setInterval(async()=>{
  if(document.hidden||!APP.user||APP.user.role==='admin'||route().name==='messages')return;
  try{APP.unread=unreadTotal(await api('/threads'));renderHeader()}catch(e){}
},25000);
