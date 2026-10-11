/* The Agent Desk view: render functions and event handlers ported from the original single-page
   app with the markup unchanged. Data logic lives in lib/ (typed); this layer builds HTML strings
   and keeps loosely typed UI state, as the original did. Call mount() once in the browser. */
import {
  esc, clone, rid, newId, ago, fmtDate, count, statusLabel, fmtNum, kpiPct, agentPct, tone, today, isLate,
  isBlocked, lateCount, routineLate, libCount, attention, nextDue, sortAg, buildTree,
  repoById as repoByIdIn, shortName as shortNameIn, fullName as fullNameIn,
} from '@/lib/model';
import { templateSpec as templateSpecIn, normalizeSpec, toFields, fromFields, buildPrompt as buildPromptIn, jdText as jdTextIn } from '@/lib/templates';
import { HOLD, TIMELINES, ROUTINES, recordsText, chatTurns as chatTurnsIn, capturePrompt } from '@/lib/prompts';
import { buildCsv, csvFilename } from '@/lib/csv';
import { TOOL_OPTIONS, APPROVAL_OPTIONS, CADENCES, defaultExtras, refreshDefaults, extrasPrompt, applyExtras } from '@/lib/wizard-options';
import { createDb, createSample, createDownloads, listRepos, loadConfig, type DB as DBT, type Sample, type Downloads } from '@/lib/client/runtime';
import type { Repo } from '@/lib/types';

/* GitHub snapshot taken 11 Oct 2026. "Sync from GitHub" replaces it. */
export const DEFAULT_REPOS: Repo[] = [
 {full_name:'Skybirds-Empyrean-Avenue/familyvault',url:'https://github.com/Skybirds-Empyrean-Avenue/familyvault',pushed_at:'2026-10-11T07:12:13Z',visibility:'private'},
 {full_name:'sagarradia/ensyncro',url:'https://github.com/sagarradia/ensyncro',pushed_at:'2026-08-02T17:49:51Z',visibility:'public'},
 {full_name:'sagarradia/pocketfund.in',url:'https://github.com/sagarradia/pocketfund.in',pushed_at:'2026-07-27T18:54:32Z',visibility:'private'},
 {full_name:'sagarradia/MarketingSite_Mock',url:'https://github.com/sagarradia/MarketingSite_Mock',pushed_at:'2026-07-21T09:50:19Z',visibility:'public'},
 {full_name:'sagarradia/trvo',url:'https://github.com/sagarradia/trvo',pushed_at:'2026-05-18T22:45:21Z',visibility:'private'},
 {full_name:'sagarradia/secondjobs-in',url:'https://github.com/sagarradia/secondjobs-in',pushed_at:'2026-05-01T08:43:52Z',visibility:'private'}
];

let mounted = false;
export function mount() {
if (mounted) return;
mounted = true;

/* UI state, same fields as the original page. */
var S: any = {repos:DEFAULT_REPOS,syncedAt:null,projects:{},agents:[],chats:{},loaded:false,scope:'all',tab:'agents',
  q:'',flt:'all',open:{},openAgent:null,confirmDelete:null,wizard:null,chat:null,syncing:false,sampleBlocked:false,banner:''};
var DB: DBT | null = null, SAMPLE: Sample | null = null, MCP: boolean = false, DL: Downloads | null = null, lastSig = '';
var app = document.getElementById('app') as HTMLElement, overlay = document.getElementById('overlay') as HTMLElement, toastEl = document.getElementById('toast') as HTMLElement;

/* ---------- helpers bound to the current repo list ---------- */
function repoById(id: string) { return repoByIdIn(S.repos, id) }
function shortName(id: string) { return shortNameIn(S.repos, id) }
function fullName(id: string) { return fullNameIn(S.repos, id) }
function templateSpec(w: any) { return templateSpecIn(S.repos, w) }
function buildPrompt(w: any) { return buildPromptIn(S.repos, w) }
function jdText(a: any) { return jdTextIn(S.repos, a) }
function chatTurns(a: any) { return chatTurnsIn(S.repos, a, (S.projects[a.projectId] || {}).brief, (S.chats[a.id] || {}).messages || []) }
var toastTimer: any = null;
function byId(id: string): any { return document.getElementById(id) }
function qs(sel: string): any { return document.querySelector(sel) }
function oq(sel: string): any { return overlay.querySelector(sel) }
function aq(sel: string): any { return app.querySelector(sel) }
function toast(t: string) { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true }, 3400) }
function agentsOf(scope:any){return S.agents.filter(function(a:any){return scope==='all'||a.projectId===scope})}
function routineSel(id:any,i:any,s:any){return '<select class="cell" id="rs-'+esc(id)+'-'+i+'" data-set="routine" data-f="state" data-id="'+esc(id)+'" data-i="'+i+'" aria-label="Routine state">'+[['planned','Planned'],['on','On'],['paused','Paused']].map(function(o:any){return '<option value="'+o[0]+'"'+((s||'planned')===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select>'}

/* ---------- persistence ---------- */
var chains: any = {};
function persist(coll:any,id:any,data:any){
  if(!DB)return;
  var k=coll+'/'+id,body=clone(data);
  chains[k]=(chains[k]||Promise.resolve()).then(function(){return DB!.doc(k).set(body)}).catch(function(e:any){toast('Could not save: '+((e&&e.code)||'unknown error'))});
}
function removeDoc(coll:any,id:any){
  if(!DB)return;
  var k=coll+'/'+id;
  chains[k]=(chains[k]||Promise.resolve()).then(function(){return DB!.doc(k).delete()}).catch(function(e:any){toast('Could not delete: '+((e&&e.code)||'unknown error'))});
}
function mutate(id:any,fn:any){var a=S.agents.filter(function(x:any){return x.id===id})[0];if(!a)return;fn(a);persist('agents',a.id,a);render()}

function passF(a:any){
  if(S.flt==='attention'&&!attention(a))return false;
  if(S.flt==='active'&&a.status!=='active')return false;
  if(S.flt==='draft'&&a.status!=='draft')return false;
  var q=S.q.trim().toLowerCase();
  if(q){
    var h=[a.name,a.role,a.reportsTo,a.purpose].concat((a.todos||[]).map(function(t:any){return t.text})).concat((a.goals||[]).map(function(g:any){return g.text})).join(' ').toLowerCase();
    if(h.indexOf(q)<0)return false;
  }
  return true;
}

/* ---------- HTML builders ---------- */
function railHTML(){
  var h='<aside class="rail"><div class="brand">Agent Desk<small>Projects, agents and scorecards</small></div><nav class="scopes" aria-label="Projects">';
  h+='<button class="scope" data-act="scope" data-id="all" aria-current="'+(S.scope==='all')+'"><b>All projects</b><span>'+S.repos.length+' repos · '+S.agents.length+' agents</span></button>';
  S.repos.forEach(function(r:any){
    var id=rid(r),ag=agentsOf(id),open=ag.reduce(function(s:any,a:any){return s+count(a,'todos',function(t:any){return t.status!=='done'})},0);
    h+='<button class="scope" data-act="scope" data-id="'+esc(id)+'" aria-current="'+(S.scope===id)+'"><b>'+esc(r.full_name.split('/')[1])+'</b><span>'+ag.length+' agents · '+open+' open</span></button>';
  });
  h+='</nav><div class="rail-foot">';
  if(MCP)h+='<button class="btn small" data-act="sync"'+(S.syncing?' disabled':'')+'>'+(S.syncing?'Syncing…':'Sync from GitHub')+'</button>';
  h+='<span>'+(S.syncedAt?'Synced '+esc(fmtDate(S.syncedAt)):'GitHub snapshot, 11 Oct 2026')+'</span></div></aside>';
  return h;
}
function topHTML(repo:any){
  var h='<header class="top"><div><h1>'+(repo?esc(repo.full_name.split('/')[1]):'All projects')+'</h1><div class="sub">';
  if(repo)h+='<a href="'+esc(repo.url)+'" target="_blank" rel="noopener">'+esc(repo.full_name)+'</a><span class="pill">'+esc(repo.visibility)+'</span><span>pushed '+esc(ago(repo.pushed_at))+'</span>';
  else if(S.scope!=='all')h+='<span>'+esc(fullName(S.scope))+'</span>';
  else h+='<span>'+S.repos.length+' repositories from GitHub, with the agents that run them</span>';
  h+='</div></div><button class="btn primary" data-act="wizard-open" data-project="'+(S.scope==='all'?'':esc(S.scope))+'">Build an agent</button></header>';
  return h;
}
function briefHTML(id:any){
  var b=(S.projects[id]||{}).brief||'';
  return '<section class="brief"><label for="brief-edit">Project brief</label><p class="hint">What this project is, who it is for and what matters this quarter. New agents are drafted from it.</p>'
   +'<textarea id="brief-edit" data-brief="'+esc(id)+'" placeholder="Example: A mobile-first savings app for gig workers in India. Launching the beta in November.">'+esc(b)+'</textarea>'
   +'<div class="row"><button class="btn small" data-act="save-brief" data-id="'+esc(id)+'">Save brief</button></div></section>';
}
function statsHTML(list:any){
  var active=list.filter(function(a:any){return a.status==='active'}).length,open=0,tot=0,late=0,gd=0,gt=0,pcts=[] as any[];
  list.forEach(function(a:any){
    open+=count(a,'todos',function(t:any){return t.status!=='done'});tot+=(a.todos||[]).length;
    gt+=(a.goals||[]).length;gd+=count(a,'goals',function(g:any){return g.done});late+=lateCount(a);
    var p=agentPct(a);if(p!=null)pcts.push(p);
  });
  var avg=pcts.length?Math.round(pcts.reduce(function(s:any,x:any){return s+x},0)/pcts.length):null;
  return '<section class="strip" aria-label="Summary">'
   +'<div><span class="l">Agents</span><span class="v">'+list.length+' <small>'+active+' active</small></span></div>'
   +'<div><span class="l">Open todos</span><span class="v">'+open+' <small>of '+tot+(late?' · <span class="bad">'+late+' overdue</span>':'')+'</small></span></div>'
   +'<div><span class="l">Goals met</span><span class="v">'+gd+' <small>of '+gt+'</small></span></div>'
   +'<div><span class="l">KPI attainment</span><span class="v">'+(avg==null?'—':avg+'<small>%</small>')+'</span></div></section>';
}
function tabsHTML(list:any){
  var n=list.reduce(function(s:any,a:any){return s+(a.todos||[]).length},0),k=list.reduce(function(s:any,a:any){return s+(a.kpis||[]).length+(a.goals||[]).length},0);
  var lb=list.reduce(function(s:any,a:any){return s+libCount(a)},0);var t=[['agents','Roster',list.length],['tasks','Todos',n],['score','Goals & KPIs',k],['lib','Library',lb]];
  return '<div class="tabs" role="tablist">'+t.map(function(x:any){return '<button class="tab" role="tab" data-act="tab" data-tab="'+x[0]+'" aria-selected="'+(S.tab===x[0])+'">'+x[1]+'<em>'+x[2]+'</em></button>'}).join('')+'</div>';
}
function emptyHTML(){
  var scoped=S.scope!=='all';
  return '<div class="empty"><h3>No agents '+(scoped?'on '+esc(shortName(S.scope)):'yet')+'</h3><p>'
   +(scoped?'Add a short brief above, then build an agent for a task. You review its job description, goals, key result areas, KPIs and todos before it is created.':'Pick a project, describe the task, and review the job description, goals, key result areas, KPIs and todos before the agent is created.')
   +'</p><button class="btn primary" data-act="wizard-open" data-project="'+(scoped?esc(S.scope):'')+'">Build the first agent</button></div>';
}
function toolbarHTML(tree:any){
  var o=[['all','All'],['attention','Needs attention (overdue or blocked)'],['active','Active only'],['draft','Draft only']];
  return '<div class="toolbar"><input type="text" id="q" data-q placeholder="Search agents, goals and todos" aria-label="Search" value="'+esc(S.q)+'">'
   +'<select id="flt" data-flt aria-label="Filter">'+o.map(function(x:any){return '<option value="'+x[0]+'"'+(S.flt===x[0]?' selected':'')+'>'+x[1]+'</option>'}).join('')+'</select>'
   +(tree?'<button class="btn small" data-act="expand-all">Expand all</button><button class="btn small" data-act="collapse-all">Collapse all</button>':'')
   +(DL?'<button class="btn small" data-act="csv">Download CSV</button>':'')+'</div>';
}
function dateInput(kind:any,aid:any,i:any,v:any){
  return '<input type="date" class="cell dt" id="d-'+kind+'-'+esc(aid)+'-'+i+'" data-set="'+kind+'" data-f="due" data-id="'+esc(aid)+'" data-i="'+i+'" value="'+esc(v||'')+'" aria-label="Due date">';
}
function agentRow(a:any,d:any,rn:any,nKids:any,open:any){
  var gd=count(a,'goals',function(g:any){return g.done}),gt=(a.goals||[]).length,td=count(a,'todos',function(t:any){return t.status==='done'}),tt=(a.todos||[]).length,p=agentPct(a),late=lateCount(a),nd=nextDue(a),id=esc(a.id);
  return '<tr class="r-agent'+(late?' hot':'')+'"><td class="rn">'+rn+'</td>'
   +'<td class="name" style="padding-left:'+(8+d*20)+'px"><button class="caret" data-act="toggle" data-id="'+id+'" aria-expanded="'+open+'" aria-label="'+(open?'Collapse ':'Expand ')+esc(a.name)+'">'+(open?'▾':'▸')+'</button><button class="nm" data-act="toggle" data-id="'+id+'">'+esc(a.name)+'</button>'+(a.example?' <span class="tag">Example</span>':'')+(nKids?' <span class="cnt">'+nKids+' report'+(nKids>1?'s':'')+'</span>':'')+'</td>'
   +'<td class="kind">'+esc(a.level||'Agent')+'</td>'
   +'<td><select class="cell" id="ast-'+id+'" data-status="'+id+'" aria-label="Status of '+esc(a.name)+'">'+['active','paused','draft'].map(function(s:any){return '<option value="'+s+'"'+((a.status||'active')===s?' selected':'')+'>'+statusLabel(s)+'</option>'}).join('')+'</select></td>'
   +'<td class="mono'+(nd&&nd<today()?' bad':'')+'">'+(nd||'—')+'</td>'
   +'<td class="mono">'+gd+'/'+gt+'</td>'
   +'<td class="mono">'+td+'/'+tt+(late?' <span class="bad">'+late+' late</span>':'')+'</td>'
   +'<td class="mono '+tone(p)+'">'+(p==null?'—':p+'%')+'</td>'
   +'<td class="detail">'+esc(a.role||'')+'</td><td>'+esc(a.reportsTo||'—')+'</td><td class="proj">'+esc(shortName(a.projectId))+'</td>'
   +'<td class="act"><button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button><button class="btn small" data-act="open-agent" data-id="'+id+'">Profile</button></td></tr>';
}
function subRow(nx:any,d:any,cls:any,nameHTML:any,kind:any,statusHTML:any,dueHTML:any,kpiHTML:any,detail:any){
  return '<tr class="r-sub '+cls+'"><td class="rn">'+nx()+'</td><td class="name" style="padding-left:'+(8+(d+1)*20)+'px">'+nameHTML+'</td><td class="kind">'+kind+'</td><td>'+(statusHTML||'')+'</td><td>'+(dueHTML||'')+'</td><td></td><td></td><td>'+(kpiHTML||'')+'</td><td class="detail">'+esc(detail||'')+'</td><td></td><td></td><td></td></tr>';
}
function subRows(a:any,d:any,nx:any){
  var h='',id=esc(a.id);
  (a.goals||[]).forEach(function(g:any,i:any){
    var late=isLate('goal',g);
    h+=subRow(nx,d,late?'hot':'','<label for="g-'+id+'-'+i+'"><input type="checkbox" id="g-'+id+'-'+i+'" data-set="goal" data-f="done" data-id="'+id+'" data-i="'+i+'"'+(g.done?' checked':'')+'><span>'+esc(g.text)+'</span></label>','Goal',g.done?'Met':late?'<span class="bad">Late</span>':'Open',dateInput('goal',a.id,i,g.due),'',[g.horizon,g.note].filter(Boolean).join(' · '));
  });
  (a.kras||[]).forEach(function(k:any){
    h+=subRow(nx,d,'',esc(k.area),'KRA',esc(k.weight)+'%','','',k.outcome);
  });
  (a.kpis||[]).forEach(function(k:any,i:any){
    var p=kpiPct(k),late=isLate('kpi',k);
    h+=subRow(nx,d,late?'hot':'',esc(k.name),'KPI',p==null?'No reading':'<span class="'+(p>=90?'':p>=60?'':'bad')+'">'+p+'%</span>',dateInput('kpi',a.id,i,k.due),
      '<input type="number" step="any" class="cell num" id="kc-'+id+'-'+i+'" data-set="kpi" data-f="current" data-id="'+id+'" data-i="'+i+'" value="'+(k.current==null?'':esc(k.current))+'" placeholder="now" aria-label="Current value"> / <input type="number" step="any" class="cell num" id="kt-'+id+'-'+i+'" data-set="kpi" data-f="target" data-id="'+id+'" data-i="'+i+'" value="'+(k.target==null?'':esc(k.target))+'" placeholder="target" aria-label="Target">',
      [k.unit,k.cadence,k.dir==='down'?'lower is better':'higher is better',k.note].filter(Boolean).join(' · '));
  });
  (a.todos||[]).forEach(function(t:any,i:any){
    var late=isLate('todo',t),s=t.status||'todo';
    h+=subRow(nx,d,late?'hot':'',(isBlocked(t)?'<span class="blocked">':'<span>')+esc(t.text)+'</span>','Todo',
      '<select class="cell" id="s-todo-'+id+'-'+i+'" data-set="todo" data-f="status" data-id="'+id+'" data-i="'+i+'" aria-label="Todo status">'+[['todo','To do'],['doing','In progress'],['done','Done']].map(function(o:any){return '<option value="'+o[0]+'"'+(s===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select>',
      dateInput('todo',a.id,i,t.due),'',t.note||'');
  });
  (a.routines||[]).forEach(function(r:any,i:any){
    h+=subRow(nx,d,routineLate(r)?'hot':'',esc(r.name),'Routine',routineSel(a.id,i,r.state),dateInput('routine',a.id,i,r.next),'',[r.cadence,r.note].filter(Boolean).join(' · '));
  });
  (a.memory||[]).forEach(function(m:any){h+=subRow(nx,d,'',esc(m.text),'Memory','','','',m.at||'')});
  (a.docs||[]).forEach(function(x:any){h+=subRow(nx,d,'',esc(x.title),'Doc','','','',[x.path,x.note].filter(Boolean).join(' · '))});
  (a.skills||[]).forEach(function(x:any){h+=subRow(nx,d,'',esc(x.name),'Skill','','','',x.note||'')});
  h+=subRow(nx,d,'add','<input type="text" class="cell" id="nt-'+id+'" data-newtodo="'+id+'" placeholder="Add a todo, press Enter" aria-label="New todo for '+esc(a.name)+'">','','','','','');
  return h;
}
var HEAD='<thead><tr><th class="rn">#</th><th>Name</th><th>Kind</th><th>Status</th><th>Due</th><th>Goals</th><th>Todos</th><th>KPI</th><th>Detail</th><th>Reports to</th><th>Project</th><th></th></tr></thead>';
function rosterView(list:any){
  if(!S.loaded)return '<p class="hint">Loading agents…</p>';
  if(!list.length)return emptyHTML();
  var T=buildTree(list),n=0,memo: any={},out='';
  function nx(){return ++n}
  function vis(a:any){if(memo[a.id]!=null)return memo[a.id];var v=passF(a)||(T.kids[a.id]||[]).some(vis);memo[a.id]=v;return v}
  /* Every agent always has its own row, indented under its manager; the caret opens only that
     agent's goals, KRAs, KPIs and todos. "seen" guards against a reports-to loop. */
  var seen: any={};
  function walk(a:any,d:any){
    if(!vis(a)||seen[a.id])return;
    seen[a.id]=1;
    var all=T.kids[a.id]||[],open=!!S.open[a.id];
    out+=agentRow(a,d,nx(),all.length,open);
    if(open)out+=subRows(a,d,nx);
    all.filter(vis).forEach(function(k:any){walk(k,d+1)});
  }
  T.roots.forEach(function(r:any){walk(r,0)});
  if(!out)return toolbarHTML(true)+'<div class="empty"><h3>Nothing matches</h3><p>Clear the search or change the filter.</p></div>';
  return toolbarHTML(true)+'<div class="sheetwrap"><table class="sheet">'+HEAD+'<tbody>'+out+'</tbody></table></div><p class="hint">Every agent has a row, indented under its manager. Click a name to expand its goals, KRAs, KPIs and todos. Dates, statuses and readings are editable in the grid.</p>';
}
function todosView(list:any){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  var items=[] as any[],q=S.q.trim().toLowerCase();
  list.forEach(function(a:any){(a.todos||[]).forEach(function(t:any,i:any){items.push({a:a,t:t,i:i})})});
  items=items.filter(function(x:any){
    if(S.flt==='attention'&&!(isLate('todo',x.t)||isBlocked(x.t)))return false;
    if(S.flt==='active'&&x.a.status!=='active')return false;
    if(S.flt==='draft'&&x.a.status!=='draft')return false;
    if(q&&(x.t.text+' '+x.a.name).toLowerCase().indexOf(q)<0)return false;
    return true;
  });
  if(!items.length)return toolbarHTML(false)+(list.length?'<div class="empty"><h3>No todos match</h3><p>Clear the search or change the filter.</p></div>':emptyHTML());
  var rank: any = {doing:0,todo:1,done:2};
  items.sort(function(x:any,y:any){
    var lx=isLate('todo',x.t)?0:1,ly=isLate('todo',y.t)?0:1;
    return lx-ly||(rank[x.t.status||'todo']-rank[y.t.status||'todo'])||String(x.t.due||'9999').localeCompare(String(y.t.due||'9999'))||String(x.a.name).localeCompare(String(y.a.name));
  });
  var rows=items.map(function(x:any,k:any){
    var s=x.t.status||'todo',id=esc(x.a.id),late=isLate('todo',x.t);
    return '<tr class="'+(late?'hot':'')+'"><td class="rn">'+(k+1)+'</td><td class="name'+(isBlocked(x.t)?' blocked':'')+'">'+esc(x.t.text)+'</td>'
     +'<td><button class="nm" data-act="chat-open" data-id="'+id+'" title="Talk to this agent">'+esc(x.a.name)+'</button></td><td class="proj">'+esc(shortName(x.a.projectId))+'</td>'
     +'<td><select class="cell" id="ts-'+id+'-'+x.i+'" data-set="todo" data-f="status" data-id="'+id+'" data-i="'+x.i+'" aria-label="Todo status">'+[['todo','To do'],['doing','In progress'],['done','Done']].map(function(o:any){return '<option value="'+o[0]+'"'+(s===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></td>'
     +'<td>'+dateInput('todo',x.a.id,x.i,x.t.due)+'</td><td class="detail">'+esc(x.t.note||'')+'</td></tr>';
  }).join('');
  return toolbarHTML(false)+'<div class="sheetwrap"><table class="sheet" style="min-width:900px"><thead><tr><th class="rn">#</th><th>Todo</th><th>Agent</th><th>Project</th><th>Status</th><th>Due</th><th>Note</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function sheetBlock(title:any,heads:any,rows:any){
  return '<div class="block"><h2>'+title+'</h2><div class="sheetwrap"><table class="sheet" style="min-width:760px"><thead><tr><th class="rn">#</th>'+heads.map(function(h:any){return '<th>'+h+'</th>'}).join('')+'</tr></thead><tbody>'+(rows||'<tr><td class="rn"></td><td colspan="'+heads.length+'" class="hint">Nothing yet</td></tr>')+'</tbody></table></div></div>';
}
function scoreView(list:any){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var g=0,k=0,p=0,gr='',kr='',pr='';
  list.slice().sort(sortAg).forEach(function(a:any){
    (a.goals||[]).forEach(function(x:any){g++;gr+='<tr class="'+(isLate('goal',x)?'hot':'')+'"><td class="rn">'+g+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.text)+'</td><td>'+esc(x.horizon||'')+'</td><td class="mono">'+esc(x.due||'—')+'</td><td>'+(x.done?'Met':isLate('goal',x)?'<span class="bad">Late</span>':'Open')+'</td></tr>'});
    (a.kras||[]).forEach(function(x:any){k++;kr+='<tr><td class="rn">'+k+'</td><td>'+esc(a.name)+'</td><td>'+esc(x.area)+'</td><td class="detail">'+esc(x.outcome)+'</td><td class="mono">'+esc(x.weight)+'%</td></tr>'});
    (a.kpis||[]).forEach(function(x:any){p++;var pc=kpiPct(x);pr+='<tr class="'+(isLate('kpi',x)?'hot':'')+'"><td class="rn">'+p+'</td><td>'+esc(a.name)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.cadence||'')+'</td><td class="mono">'+(x.target==null||x.target===''?'not set':(x.dir==='down'?'≤ ':'≥ ')+esc(fmtNum(x.target))+' '+esc(x.unit||''))+'</td><td class="mono">'+(x.current==null?'—':esc(fmtNum(x.current)))+'</td><td class="mono">'+esc(x.due||'—')+'</td><td class="mono '+tone(pc)+'">'+(pc==null?'not tracked':pc+'%')+'</td></tr>'});
  });
  return toolbarHTML(false).replace(/<input[^>]*data-q[^>]*>/,'').replace(/<select[^>]*data-flt[\s\S]*?<\/select>/,'')
   +'<div style="display:flex;flex-direction:column;gap:18px">'
   +sheetBlock('Goals',['Agent','Goal','Horizon','Due','Status'],gr)
   +sheetBlock('Key result areas',['Agent','Area','Outcome','Weight'],kr)
   +sheetBlock('KPIs',['Agent','KPI','Cadence','Target','Current','Due','Attainment'],pr)+'</div>';
}
function libView(list:any){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var r1='',m1='',d1='',s1='',a1=0,b1=0,c1=0,e1=0;
  list.slice().sort(sortAg).forEach(function(a:any){
    (a.routines||[]).forEach(function(x:any,i:any){a1++;r1+='<tr class="'+(routineLate(x)?'hot':'')+'"><td class="rn">'+a1+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.name)+'</td><td>'+esc(x.cadence||'')+'</td><td>'+routineSel(a.id,i,x.state)+'</td><td>'+dateInput('routine',a.id,i,x.next)+'</td><td class="detail">'+esc(x.note||'')+'</td></tr>'});
    (a.memory||[]).forEach(function(x:any){b1++;m1+='<tr><td class="rn">'+b1+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.text)+'</td><td class="mono">'+esc(x.at||'')+'</td><td>'+esc(x.src||'')+'</td></tr>'});
    (a.docs||[]).forEach(function(x:any){c1++;d1+='<tr><td class="rn">'+c1+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.title)+'</td><td class="mono">'+esc(x.path||'')+'</td><td class="detail">'+esc(x.note||'')+'</td></tr>'});
    (a.skills||[]).forEach(function(x:any){e1++;s1+='<tr><td class="rn">'+e1+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.name)+'</td><td class="detail">'+esc(x.note||'')+'</td></tr>'});
  });
  return toolbarHTML(false).replace(/<input[^>]*data-q[^>]*>/,'').replace(/<select[^>]*data-flt[\s\S]*?<\/select>/,'')
   +'<div style="display:flex;flex-direction:column;gap:18px">'
   +sheetBlock('Routines',['Agent','Routine','Cadence','State','Next run','Note'],r1)
   +sheetBlock('Memory',['Agent','Note','Added','Source'],m1)
   +sheetBlock('Docs',['Agent','Doc','Path or link','Note'],d1)
   +sheetBlock('Skills',['Agent','Skill','What it does'],s1)
   +'</div><p class="hint">Routines here are a register: a state and a next-run date you set. Nothing on this page runs them. Add or remove items in each agent\'s profile.</p>';
}
function shellHTML(){
  var list=agentsOf(S.scope),repo=S.scope==='all'?null:repoById(S.scope);
  return '<div class="shell">'+railHTML()+'<main class="main">'+(S.banner?'<div class="err">'+esc(S.banner)+'</div>':'')+topHTML(repo)+(S.scope!=='all'?briefHTML(S.scope):'')+statsHTML(list)+tabsHTML(list)
   +'<section>'+(S.tab==='agents'?rosterView(list):S.tab==='tasks'?todosView(list):S.tab==='lib'?libView(list):scoreView(list))+'</section></main></div>';
}

var LSPEC: any = {
  routines:{t:'Routines',main:'name',f:[['name','Routine, e.g. Weekly regulation scan'],['cadence','Cadence, e.g. weekly Mon 09:00 IST']],none:'No routines recorded.'},
  memory:{t:'Memory',main:'text',f:[['text','Something this agent should always keep in mind']],none:'No memory notes yet.'},
  docs:{t:'Docs',main:'title',f:[['title','Doc title'],['path','Path or link']],none:'No docs linked.'},
  skills:{t:'Skills',main:'name',f:[['name','Skill name'],['note','What it does']],none:'No skills recorded.'}
};
function libSec(a:any,key:any){
  var sp=LSPEC[key],id=esc(a.id),arr=a[key]||[];
  var h='<section class="sec"><h3>'+sp.t+'</h3>'+(arr.map(function(x:any,i:any){
    var sub=[];
    if(key==='routines')sub.push(x.cadence);
    if(key==='memory')sub.push(x.at,x.src);
    if(key==='docs')sub.push(x.path,x.note);
    if(key==='skills')sub.push(x.note);
    var main=esc(x[sp.main]);
    if(key==='docs'&&/^https?:\/\//.test(x.path||''))main='<a href="'+esc(x.path)+'" target="_blank" rel="noopener noreferrer">'+main+'</a>';
    return '<div class="rowline"><span class="grow">'+main+'<small>'+sub.filter(Boolean).map(esc).join(' · ')+(key==='routines'&&x.note?' · '+esc(x.note):'')+'</small></span>'
     +(key==='routines'?routineSel(a.id,i,x.state)+dateInput('routine',a.id,i,x.next):'')
     +'<button class="btn small" data-act="lib-del" data-key="'+key+'" data-id="'+id+'" data-i="'+i+'" aria-label="Remove">Remove</button></div>';
  }).join('')||'<p class="hint">'+sp.none+'</p>');
  h+='<div class="addrow">'+sp.f.map(function(f:any){return '<input type="text" id="lib-'+key+'-'+f[0]+'" placeholder="'+esc(f[1])+'" aria-label="'+esc(f[1])+'" style="flex:1;min-width:0">'}).join('')
   +'<button class="btn small" data-act="lib-add" data-key="'+key+'" data-id="'+id+'">Add</button></div></section>';
  return h;
}
function panelHTML(){
  var a=S.openAgent&&S.agents.filter(function(x:any){return x.id===S.openAgent})[0];
  if(!a)return '';
  var p=agentPct(a),id=esc(a.id);
  var h='<div class="scrim" data-act="close-panel"></div><aside class="panel" role="dialog" aria-label="Agent profile">';
  h+='<div class="panel-head"><div><h2>'+esc(a.name)+(a.example?' <span class="tag">Example</span>':'')+'</h2><p class="role">'+esc(a.role)+'</p></div><div class="btns"><button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button><button class="btn small" data-act="close-panel">Close</button></div></div><div class="panel-body">';
  h+='<div class="facts"><div><span>Project</span><b>'+esc(fullName(a.projectId))+'</b></div><div><span>Reports to</span><b>'+esc(a.reportsTo||'—')+'</b></div>'
   +'<div><span>Status</span><select id="st-'+id+'" data-status="'+id+'" aria-label="Status">'+['active','paused','draft'].map(function(s:any){return '<option value="'+s+'"'+((a.status||'active')===s?' selected':'')+'>'+statusLabel(s)+'</option>'}).join('')+'</select></div>'
   +'<div><span>Created</span><b>'+esc(fmtDate(a.createdAt)||'—')+(a.source==='claude'?' · drafted by Claude':a.source==='template'?' · from template':a.source==='repo'?' · imported from role file':'')+'</b></div></div>';
  h+='<section class="sec"><h3>Job description</h3><p>'+esc(a.purpose||'')+'</p>'
   +((a.task)?'<p class="hint">Task given: '+esc(a.task)+'</p>':'')
   +((a.requirements||[]).length?'<h3 style="margin-top:6px">Requirements</h3><ul class="plain">'+a.requirements.map(function(x:any){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>':'')
   +((a.tools||[]).length?'<h3 style="margin-top:6px">Tools and access</h3><div class="chips">'+a.tools.map(function(x:any){return '<span class="chip">'+esc(x)+'</span>'}).join('')+'</div>':'')+'</section>';
  h+='<section class="sec"><h3>Responsibilities</h3><ul class="plain">'+((a.responsibilities||[]).map(function(x:any){return '<li>'+esc(x)+'</li>'}).join('')||'<li>None listed</li>')+'</ul></section>';
  if((a.may||[]).length)h+='<section class="sec"><h3>May</h3><ul class="plain">'+a.may.map(function(x:any){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></section>';
  if((a.mustNot||[]).length)h+='<section class="sec"><h3>Must not</h3><ul class="plain">'+a.mustNot.map(function(x:any){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></section>';
  if(a.handsOff||a.reads)h+='<section class="sec"><h3>Handoffs</h3>'+(a.handsOff?'<p><b>Hands off to:</b> '+esc(a.handsOff)+'</p>':'')+(a.reads?'<p><b>Reads at the start of a run:</b> '+esc(a.reads)+'</p>':'')+'</section>';
  h+='<section class="sec"><h3>Goals</h3>'+((a.goals||[]).map(function(g:any,i:any){return '<div class="rowline '+(g.done?'done':'')+'"><input type="checkbox" id="g-'+id+'-p'+i+'" data-set="goal" data-f="done" data-id="'+id+'" data-i="'+i+'"'+(g.done?' checked':'')+' aria-label="Goal met"><label class="grow" for="g-'+id+'-p'+i+'">'+esc(g.text)+'<small>'+esc([g.horizon,g.note].filter(Boolean).join(' · '))+'</small></label>'+dateInput('goal',a.id,i,g.due)+'</div>'}).join('')||'<p class="hint">No goals set.</p>')
   +'<div class="addrow"><input type="text" id="goal-new" placeholder="Add a goal" aria-label="New goal"><button class="btn small" data-act="goal-add" data-id="'+id+'">Add</button></div></section>';
  h+='<section class="sec"><h3>Key result areas</h3>'+((a.kras||[]).map(function(k:any){return '<div class="rowline"><span class="grow"><b>'+esc(k.area)+'</b><small style="font-family:var(--sans);font-size:13px;color:var(--fg)">'+esc(k.outcome)+'</small></span><span class="mono">'+esc(k.weight)+'%</span></div>'}).join('')||'<p class="hint">No KRAs set.</p>')+'</section>';
  h+='<section class="sec"><h3>KPIs · '+(p==null?'no readings yet':'attainment '+p+'%')+'</h3>'+((a.kpis||[]).map(function(k:any,i:any){
    var kp=kpiPct(k);
    return '<div class="kpi '+tone(kp)+'"><div><b>'+esc(k.name)+'</b><div class="hint">'+esc(k.cadence||'')+' · '+(k.dir==='down'?'lower is better':'higher is better')+'</div></div>'
     +'<div class="tg"><input type="number" step="any" class="kin" id="kpi-'+id+'-'+i+'" data-set="kpi" data-f="current" data-id="'+id+'" data-i="'+i+'" value="'+(k.current==null?'':esc(k.current))+'" placeholder="current" aria-label="Current value"> / <input type="number" step="any" class="kin" id="kpt-'+id+'-'+i+'" data-set="kpi" data-f="target" data-id="'+id+'" data-i="'+i+'" value="'+(k.target==null?'':esc(k.target))+'" placeholder="target" aria-label="Target"> '+esc(k.unit||'')+'</div>'
     +'<div class="bar"><i style="width:'+(kp==null?0:kp)+'%"></i></div></div>';
  }).join('')||'<p class="hint">No KPIs set.</p>')+'</section>';
  h+='<section class="sec"><h3>Todos</h3>'+((a.todos||[]).map(function(t:any,i:any){
    var s=t.status||'todo';
    return '<div class="rowline '+(s==='done'?'done':'')+'"><button class="st" data-s="'+s+'" data-act="todo-cycle" data-id="'+id+'" data-i="'+i+'" aria-label="Status: '+s+'. Click to change">'+(s==='done'?'✓':s==='doing'?'…':'')+'</button><span class="grow">'+esc(t.text)+'<small>'+({todo:'To do',doing:'In progress',done:'Done'} as any)[s]+(t.note?' · '+esc(t.note):'')+'</small></span>'+dateInput('todo',a.id,i,t.due)+'</div>';
  }).join('')||'<p class="hint">No todos yet.</p>')
   +'<div class="addrow"><input type="text" id="todo-new" placeholder="Add a todo" aria-label="New todo"><button class="btn small" data-act="todo-add" data-id="'+id+'">Add</button></div></section>';
  ['routines','memory','docs','skills'].forEach(function(k:any){h+=libSec(a,k)});
  h+='<div class="foot"><button class="btn small" data-act="copy-jd" data-id="'+id+'">Copy job description</button>';
  if(S.confirmDelete===a.id)h+='</div><div class="confirm"><span>Delete this agent with its goals, KPIs and todos?</span><button class="btn small danger" data-act="delete-confirm" data-id="'+id+'">Delete</button><button class="btn small" data-act="delete-cancel">Keep</button></div>';
  else h+='<button class="btn small danger" data-act="delete-ask" data-id="'+id+'">Delete agent</button></div>';
  return h+'</div></aside>';
}

function chatHTML(){
  var c=S.chat,a=c&&S.agents.filter(function(x:any){return x.id===c.id})[0];
  if(!c||!a)return '';
  var msgs=(S.chats[a.id]&&S.chats[a.id].messages)||[],can=!!SAMPLE&&!S.sampleBlocked,dis=(!can||c.busy||c.extracting)?' disabled':'';
  var hasReply=msgs.some(function(m:any){return m.role==='agent'});
  var h='<div class="scrim" data-act="chat-close"></div><aside class="panel chat" role="dialog" aria-label="Chat with '+esc(a.name)+'">';
  h+='<div class="panel-head"><div><h2>'+esc(a.name)+'</h2><p class="role">'+esc(a.role)+' · '+esc(shortName(a.projectId))+'</p></div><div class="btns"><button class="btn small" data-act="open-agent" data-id="'+esc(a.id)+'">Profile</button><button class="btn small" data-act="chat-close">Close</button></div></div>';
  h+='<p class="chat-note">Claude speaks as this role, using its role file and the records on this page. It has no run logs, so its reasons are a reading of the records, not a report of what happened.'+(can?'':' Chat is unavailable in this view.')+'</p>';
  h+='<div class="chat-quick"><button class="btn small" data-act="chat-hold"'+dis+'>Hold to account</button><button class="btn small" data-act="chat-timelines"'+dis+'>Ask for timelines</button><button class="btn small" data-act="chat-routines"'+dis+'>Check routines</button><button class="btn small" data-act="chat-complain"'+(can?'':' disabled')+'>Complain</button></div>';
  h+='<div class="chat-log" id="chat-log">';
  if(!msgs.length&&!c.busy)h+='<p class="hint">No messages yet. Use Hold to account to ask why items are late, what blocks them and when they will be done.</p>';
  msgs.forEach(function(m:any){h+='<div class="msg '+(m.role==='agent'?'agent':'founder')+'"><span class="who">'+(m.role==='agent'?esc(a.name):'You')+'</span><div class="txt">'+esc(m.text)+'</div></div>'});
  if(c.busy)h+='<div class="msg agent"><span class="who">'+esc(a.name)+'</span><div class="txt" id="chat-stream">'+(c.partial?esc(c.partial):'Thinking…')+'</div></div>';
  h+='</div>';
  if(c.proposals){
    h+='<div class="props"><h3>From this chat</h3>';
    if(!c.proposals.length)h+='<p class="hint">The agent made no commitments to record. Ask for timelines, then capture again.</p>';
    else{
      c.proposals.forEach(function(p:any,i:any){
        var list=p.kind==='todo'?a.todos:p.kind==='goal'?a.goals:p.kind==='routine'?a.routines:a.kpis,it=list&&list[p.index],label=p.kind==='memory'?p.note:it?(it.text||it.name):'(item removed)';
        h+='<div class="prop"><div class="grow"><b>'+(({todo:'Todo',goal:'Goal',kpi:'KPI',routine:'Routine',memory:'Add to memory'} as any)[p.kind])+':</b> '+esc(label)+'<small>'+[p.due?(p.kind==='routine'?'next run ':'due ')+p.due:'',p.status?'status '+p.status:'',p.kind==='memory'?'':p.note].filter(Boolean).map(esc).join(' · ')+'</small></div>'
         +(p.state==='open'?'<span><button class="btn small primary" data-act="prop-apply" data-i="'+i+'">Apply</button> <button class="btn small" data-act="prop-skip" data-i="'+i+'">Skip</button></span>':'<span class="hint">'+(p.state==='applied'?'Applied':'Skipped')+'</span>')+'</div>';
      });
      if(c.proposals.some(function(p:any){return p.state==='open'}))h+='<div><button class="btn small primary" data-act="prop-all">Apply all</button></div>';
    }
    h+='</div>';
  }
  if(c.error)h+='<div class="err" style="margin:0 16px 8px">'+esc(c.error)+'</div>';
  h+='<div class="chat-compose"><textarea id="chat-input" data-chat placeholder="Complain, ask why something is late, or agree actions. Enter sends, Shift+Enter adds a line."'+(can?'':' disabled')+'>'+esc(c.draft)+'</textarea><div class="row">'
   +'<button class="btn primary" data-act="chat-send"'+dis+'>Send</button>'
   +(c.busy?'<button class="btn" data-act="chat-stop">Stop</button>':'')
   +'<button class="btn" data-act="chat-capture"'+((!can||c.busy||c.extracting||!hasReply)?' disabled':'')+'>'+(c.extracting?'Reading…':'Capture commitments')+'</button>'
   +'<button class="btn" data-act="chat-clear"'+(msgs.length&&!c.busy?'':' disabled')+'>'+(c.confirmClear?'Click again to clear':'Clear chat')+'</button></div></div>';
  return h+'</aside>';
}

/* Step 1 "More details": defaults are pre-selected from the task; untick what does not apply. */
function extrasHTML(x:any){
  var box=function(kind:string,opts:readonly string[],sel:string[]){return '<div class="checks">'+opts.map(function(o,i){var id='wx-'+kind+'-'+i;return '<label for="'+id+'"><input type="checkbox" id="'+id+'" data-wcheck="'+kind+'" value="'+esc(o)+'"'+(sel.indexOf(o)>=0?' checked':'')+'>'+esc(o)+'</label>'}).join('')+'</div>'};
  var h='<section class="more" aria-label="More details"><h3>More details · defaults chosen for you</h3>';
  h+='<p class="hint">Pre-selected from the task. Keep them as they are or untick what does not apply. These are recorded on the role; this app does not connect to the services.</p>';
  h+='<div class="fld"><label>Tools and access</label>'+box('tools',TOOL_OPTIONS,x.tools)+'<input type="text" id="wx-other" data-wx="otherTools" value="'+esc(x.otherTools)+'" placeholder="Other tools, comma separated" aria-label="Other tools"></div>';
  h+='<div class="fld"><label>Needs your approval before</label>'+box('approvals',APPROVAL_OPTIONS,x.approvals)+'</div>';
  h+='<div class="two"><div class="fld"><label for="wx-cadence">Status updates</label><select id="wx-cadence" data-wx="cadence" style="width:100%">'+CADENCES.map(function(c){return '<option value="'+esc(c)+'"'+(x.cadence===c?' selected':'')+'>'+esc(c)+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="wx-reports">Reports to</label><input type="text" id="wx-reports" data-wx="reportsTo" value="'+esc(x.reportsTo)+'" placeholder="Leave blank to use the draft"></div></div>';
  h+='<div class="fld"><label for="wx-notes">Anything else it should know</label><textarea id="wx-notes" data-wx="notes" rows="2" placeholder="Optional. Saved to the agent\'s memory.">'+esc(x.notes)+'</textarea></div>';
  return h+'</section>';
}
function wizardHTML(){
  var w=S.wizard;if(!w)return '';
  var h='<div class="scrim" data-act="wizard-close"></div><div class="modal" role="dialog" aria-label="Build an agent"><div class="modal-head"><h2>Build an agent</h2><p>'+(w.step===1?'Accept a project and describe the task. The agent is drafted for you to review.':'Review and edit the draft. Nothing is created until you confirm.')+'</p><div class="steps"><span>'+(w.step===1?'<b>1 Project and task</b>':'1 Project and task')+'</span><span>→</span><span>'+(w.step===2?'<b>2 Review spec</b>':'2 Review spec')+'</span></div></div><div class="modal-body">';
  if(w.error)h+='<div class="err">'+esc(w.error)+'</div>';
  if(w.step===1){
    var r=repoById(w.projectId);
    h+='<div class="fld"><label for="w-project">Project</label><select id="w-project" data-w1="projectId" style="width:100%">'+S.repos.map(function(x:any){return '<option value="'+esc(rid(x))+'"'+(rid(x)===w.projectId?' selected':'')+'>'+esc(x.full_name)+' ('+esc(x.visibility)+')</option>'}).join('')+'</select>'+(r?'<span class="hint">Last pushed '+esc(ago(r.pushed_at))+'</span>':'')+'</div>';
    h+='<div class="fld"><label for="w-brief">Project brief</label><textarea id="w-brief" data-w1="brief" placeholder="What the project is, who it is for, what matters now. The more you give, the less generic the agent.">'+esc(w.brief)+'</textarea><span class="hint">Saved to the project when you continue.</span></div>';
    h+='<div class="fld"><label for="w-task">What should this agent do?</label><input type="text" id="w-task" data-w1="task" value="'+esc(w.task)+'" placeholder="Example: answer customer emails and keep the FAQ current"></div>';
    h+='<div class="fld"><label for="w-autonomy">Autonomy</label><select id="w-autonomy" data-w1="autonomy" style="width:100%"><option value="review"'+(w.autonomy==='review'?' selected':'')+'>Drafts only, I approve every action</option><option value="guardrails"'+(w.autonomy==='guardrails'?' selected':'')+'>Acts within written guardrails</option><option value="full"'+(w.autonomy==='full'?' selected':'')+'>Runs end to end, reports afterwards</option></select></div>';
    h+=extrasHTML(w.extras);
    if(w.busy)h+='<div class="note">Claude is drafting the role. This can take up to a minute.</div>';
  }else{
    var f=w.fields,ta=function(k:any,lab:any,hint:any,rows:any){return '<div class="fld"><label for="wf-'+k+'">'+lab+'</label><textarea id="wf-'+k+'" data-wf="'+k+'" rows="'+(rows||4)+'">'+esc(f[k])+'</textarea>'+(hint?'<span class="hint">'+hint+'</span>':'')+'</div>'};
    h+='<div class="note">'+(w.source==='claude'?'Drafted by Claude from your brief and task. Check every line; edit freely.':'Drafted from a built-in template for this kind of task. Edit freely.')+'</div>';
    h+='<div class="two"><div class="fld"><label for="wf-name">Agent name</label><input type="text" id="wf-name" data-wf="name" value="'+esc(f.name)+'"></div><div class="fld"><label for="wf-role">Role / job title</label><input type="text" id="wf-role" data-wf="role" value="'+esc(f.role)+'"></div></div>';
    h+='<div class="fld"><label for="wf-reportsTo">Reports to</label><input type="text" id="wf-reportsTo" data-wf="reportsTo" value="'+esc(f.reportsTo)+'"></div>';
    h+=ta('purpose','Job description','Two or three sentences on what this role is for.',3);
    h+=ta('responsibilities','Responsibilities','One per line.',6)+ta('requirements','Requirements','One per line.',4)+ta('tools','Tools and access','One per line.',3)+ta('mustNot','Needs your approval before','One per line.',3);
    h+=ta('goals','Goals','One per line: goal | horizon (30 days, 90 days, 6 months).',4);
    h+=ta('kras','Key result areas','One per line: area | outcome | weight %.',4);
    h+=ta('kpis','KPIs','One per line: name | target | unit | cadence | higher is better or lower is better.',5);
    h+=ta('todos','Todos','One per line, in the order they should happen.',7);
  }
  h+='</div><div class="modal-foot">';
  if(w.step===1){
    h+='<button class="btn" data-act="wizard-close">Cancel</button>';
    if(w.busy)h+='<button class="btn" data-act="wiz-stop">Stop</button>';
    else{
      h+='<button class="btn" data-act="wiz-template">Use template draft</button>';
      if(SAMPLE&&!S.sampleBlocked)h+='<button class="btn primary" data-act="wiz-generate">Generate with Claude</button>';
    }
  }else{
    h+='<button class="btn" data-act="wiz-back">Back</button><button class="btn primary" data-act="wiz-create">Create agent</button>';
  }
  return h+'</div></div>';
}

/* ---------- render ---------- */
function render(){
  var ae: any=document.activeElement,aid=ae&&ae.id,s0=null,s1=null;
  try{if(ae&&ae.selectionStart!=null){s0=ae.selectionStart;s1=ae.selectionEnd}}catch(e:any){}
  var pb=oq('.panel-body'),pt=pb?pb.scrollTop:0,mb=oq('.modal-body'),mt=mb?mb.scrollTop:0;
  var lg=byId('chat-log'),lt=lg?lg.scrollTop:0,near=lg?(lg.scrollHeight-lg.scrollTop-lg.clientHeight<90):true;
  var sw=aq('.sheetwrap'),sl=sw?sw.scrollLeft:0,stp=sw?sw.scrollTop:0;
  var ms=document.scrollingElement?document.scrollingElement.scrollTop:0;
  app.innerHTML=shellHTML();
  overlay.innerHTML=panelHTML()+chatHTML()+wizardHTML();
  var pb2=oq('.panel-body');if(pb2)pb2.scrollTop=pt;
  var mb2=oq('.modal-body');if(mb2)mb2.scrollTop=mt;
  var lg2=byId('chat-log');
  if(lg2){if(near||(S.chat&&S.chat.fresh)){lg2.scrollTop=lg2.scrollHeight;if(S.chat)S.chat.fresh=false}else lg2.scrollTop=lt}
  var sw2=aq('.sheetwrap');if(sw2){sw2.scrollLeft=sl;sw2.scrollTop=stp}
  if(document.scrollingElement)document.scrollingElement.scrollTop=ms;
  if(aid){var el=byId(aid);if(el){try{el.focus({preventScroll:true});if(s0!=null&&el.setSelectionRange)el.setSelectionRange(s0,s1)}catch(e:any){}}}
}

/* ---------- wizard actions ---------- */
function openWizard(projectId:any){
  var pid=projectId||(S.scope!=='all'?S.scope:rid(S.repos[0]));
  S.wizard={step:1,projectId:pid,brief:(S.projects[pid]&&S.projects[pid].brief)||'',task:'',autonomy:'review',busy:false,error:'',fields:null,source:'template',ctl:null,extras:defaultExtras('')};
  S.chat=null;S.openAgent=null;render();
  var t=byId('w-task');if(t)t.focus();
}
function toStep2(spec:any,source:any){
  var w=S.wizard;
  if(w.brief.trim()!==((S.projects[w.projectId]&&S.projects[w.projectId].brief)||'').trim())saveBrief(w.projectId,w.brief,true);
  w.fields=toFields(normalizeSpec(applyExtras(spec,w.extras)));w.source=source;w.step=2;w.error='';w.busy=false;w.ctl=null;render();
}
function wizTemplate(){
  var w=S.wizard;if(!w.task.trim()){w.error='Describe what the agent should do first.';render();return}
  toStep2(templateSpec(w),'template');
}
async function wizGenerate(){
  var w=S.wizard;if(!w.task.trim()){w.error='Describe what the agent should do first.';render();return}
  w.busy=true;w.error='';w.ctl=new AbortController();render();
  try{
    var spec=await SAMPLE!.json(buildPrompt(w)+extrasPrompt(w.extras),{signal:w.ctl.signal,cache:false});
    if(S.wizard!==w)return;
    if(!spec||typeof spec!=='object'||Array.isArray(spec))throw {code:'invalid_json'};
    toStep2(spec,'claude');
  }catch(e:any){
    if(S.wizard!==w)return;
    w.busy=false;w.ctl=null;
    var c=e&&e.code;
    if(c==='cancelled'){w.error=''}
    else if(c==='not_granted'||c==='sampling_disabled'||c==='not_declared'){S.sampleBlocked=true;w.error='Claude drafting is not available for this page. Use the template draft instead.'}
    else if(c==='rate_limited')w.error='Too many requests right now. Wait a minute and try again, or use the template draft.';
    else if(c==='invalid_json')w.error='Claude replied in a format this page could not read. Try again, or use the template draft.';
    else w.error='Claude could not draft the role. Try again, or use the template draft.';
    render();
  }
}
function createAgent(){
  var w=S.wizard,f=w.fields;
  if(!f.name.trim()||!f.role.trim()){w.error='Give the agent a name and a role.';render();return}
  var s=fromFields(f);
  var a={id:newId(),projectId:w.projectId,name:s.name,role:s.role,reportsTo:s.reportsTo,status:'active',task:w.task.trim(),autonomy:w.autonomy,
    purpose:s.purpose,responsibilities:s.responsibilities,requirements:s.requirements,tools:s.tools,mustNot:s.mustNot,goals:s.goals,kras:s.kras,kpis:s.kpis,todos:s.todos,
    routines:[{name:'Status update to '+(s.reportsTo||'the owner'),cadence:w.extras.cadence,state:'planned',next:'',note:'Set when the agent was built'}],
    memory:w.extras.notes.trim()?[{text:w.extras.notes.trim(),at:today(),src:'you'}]:[],
    source:w.source,createdAt:Date.now()};
  S.agents.unshift(a);persist('agents',a.id,a);
  S.wizard=null;S.scope=w.projectId;S.tab='agents';S.openAgent=a.id;render();toast('Agent created');
}
function saveBrief(id:any,text:any,quiet?:any){
  var p=S.projects[id]||{};p.brief=text.trim();S.projects[id]=p;persist('projects',id,p);
  if(!quiet){render();toast('Brief saved')}
}
async function sync(){
  if(!MCP||S.syncing)return;
  S.syncing=true;render();
  try{
    var repos=await listRepos();
    var items=repos.filter(function(x:any){return x&&x.full_name&&x.full_name.indexOf('/')>0}).map(function(x:any){return {full_name:x.full_name,url:x.url||('https://github.com/'+x.full_name),pushed_at:x.pushed_at||'',visibility:x.visibility||'private'}});
    if(!items.length)throw {code:'empty'};
    S.repos=items;S.syncedAt=Date.now();
    persist('meta','repos',{items:items,syncedAt:S.syncedAt});
    toast('Synced '+items.length+' repositories');
  }catch(e:any){
    var c=e&&e.code;
    toast(c==='needs_reauth'?'GitHub rejected the token. Check GITHUB_TOKEN, then sync again.':c==='server_not_connected'?'GitHub is not connected. Set GITHUB_TOKEN, then sync again.':c==='rate_limited'?'Too many syncs. Wait a minute and try again.':c==='empty'?'GitHub returned no repositories.':'Sync failed. Try again in a moment.');
  }
  S.syncing=false;render();
}

function chatAgent(){return S.chat&&S.agents.filter(function(x:any){return x.id===S.chat.id})[0]}
function openChat(id:any){S.chat={id:id,draft:'',busy:false,partial:'',error:'',proposals:null,extracting:false,ctl:null,fresh:true,confirmClear:false};S.openAgent=null;S.wizard=null;render()}
function closeChat(){if(S.chat&&S.chat.ctl)S.chat.ctl.abort();S.chat=null;render()}

async function sendChat(text:any){
  var c=S.chat,a=chatAgent();text=String(text||'').trim();
  if(!c||!a||c.busy||!text)return;
  if(!SAMPLE||S.sampleBlocked){c.error='Chat needs Claude access, which is not available in this view.';render();return}
  var ch=S.chats[a.id]=S.chats[a.id]||{messages:[]};ch.messages=(ch.messages||[]).slice();
  ch.messages.push({role:'founder',text:text,ts:Date.now()});
  c.draft='';c.busy=true;c.partial='';c.error='';c.proposals=null;c.confirmClear=false;c.ctl=new AbortController();render();
  var ctl=c.ctl;
  try{
    var r=await SAMPLE(chatTurns(a),{cache:false,signal:ctl.signal,onText:function(u:any){
      c.partial=u.text;var el=byId('chat-stream');
      if(el){el.textContent=u.text;var lg=byId('chat-log');if(lg)lg.scrollTop=lg.scrollHeight}
    }});
    ch.messages.push({role:'agent',text:String(r.text).trim()+(r.truncated?'\n[reply cut short]':''),ts:Date.now()});
  }catch(e:any){
    var code=e&&e.code;
    if(e&&e.text&&String(e.text).trim()&&code!=='refused')ch.messages.push({role:'agent',text:String(e.text).trim()+'\n[interrupted]',ts:Date.now()});
    if(code==='not_granted'||code==='sampling_disabled'||code==='not_declared'){S.sampleBlocked=true;c.error='Claude access was declined or is unavailable, so the agent cannot reply.'}
    else if(code==='rate_limited')c.error='Too many requests right now. Wait a minute, then send again.';
    else if(code!=='cancelled')c.error='The agent could not reply. Send again in a moment.';
  }
  c.busy=false;c.partial='';c.ctl=null;
  ch.messages=ch.messages.slice(-40);ch.agentId=a.id;ch.updatedAt=Date.now();persist('chats',a.id,ch);
  if(S.chat===c)render();
}
async function captureChat(){
  var c=S.chat,a=chatAgent();if(!c||!a||c.busy||c.extracting||!SAMPLE)return;
  c.extracting=true;c.error='';render();
  var prompt=capturePrompt(a,(S.chats[a.id]||{}).messages||[]);
  try{
    var arr=await SAMPLE.json(prompt,{cache:false});
    var ok=[] as any[];
    (Array.isArray(arr)?arr:[]).forEach(function(p:any){
      var kind=p&&p.kind;
      if(kind==='memory'){var mt=String(p.note||'').trim().slice(0,200);if(mt)ok.push({kind:'memory',index:-1,due:'',status:'',note:mt,state:'open'});return}
      var idx=Number(p&&p.index)-1,list=kind==='todo'?a.todos:kind==='goal'?a.goals:kind==='kpi'?a.kpis:kind==='routine'?a.routines:null;
      if(!list||!(idx>=0&&idx<list.length))return;
      var due=/^\d{4}-\d{2}-\d{2}$/.test(String(p.due||''))?p.due:'';
      var st=(kind==='todo'&&['todo','doing','done'].indexOf(p.status)>=0)?p.status:'';
      var note=String(p.note||'').slice(0,160);
      if(!due&&!st&&!note)return;
      ok.push({kind:kind,index:idx,due:due,status:st,note:note,state:'open'});
    });
    c.proposals=ok;
  }catch(e:any){
    c.error=(e&&e.code==='rate_limited')?'Too many requests right now. Try again in a minute.':'Could not read dates from the chat. Try again.';
  }
  c.extracting=false;if(S.chat===c)render();
}
function applyProp(i:any,quiet?:any){
  var c=S.chat,a=chatAgent(),p=c&&c.proposals&&c.proposals[i];
  if(!a||!p||p.state!=='open')return;
  p.state='applied';
  if(p.kind==='memory'){(a.memory=a.memory||[]).push({text:p.note,at:today(),src:'chat'});if(!quiet){persist('agents',a.id,a);render()}return}
  var it=(p.kind==='todo'?a.todos:p.kind==='goal'?a.goals:p.kind==='routine'?a.routines:a.kpis)[p.index];
  if(it&&p.kind==='routine'){if(p.due)it.next=p.due;if(p.note)it.note=p.note}
  else if(it){if(p.due)it.due=p.due;if(p.status&&p.kind==='todo')it.status=p.status;if(p.note)it.note=p.note}
  if(!quiet){persist('agents',a.id,a);render()}
}

/* ---------- CSV export ---------- */
function exportCSV(){
  if(!DL)return;
  var csv=buildCsv(agentsOf(S.scope),S.repos);
  DL.save({filename:csvFilename(S.scope,S.repos),data:csv}).then(function(){toast('Saved the sheet as CSV')},function(e:any){if(!e||e.code!=='declined')toast('Could not save the file here.')});
}

/* ---------- events ---------- */
document.addEventListener('click',function(e:any){
  var el=e.target.closest('[data-act]');if(!el)return;
  var act=el.dataset.act,id=el.dataset.id,i=Number(el.dataset.i);
  if(act==='scope'){S.scope=id;render()}
  else if(act==='tab'){S.tab=el.dataset.tab;render()}
  else if(act==='toggle'){S.open[id]=!S.open[id];render()}
  else if(act==='expand-all'){agentsOf(S.scope).forEach(function(a:any){S.open[a.id]=true});render()}
  else if(act==='collapse-all'){S.open={};render()}
  else if(act==='csv')exportCSV();
  else if(act==='open-agent'){S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.openAgent=id;S.confirmDelete=null;render()}
  else if(act==='close-panel'){S.openAgent=null;S.confirmDelete=null;render()}
  else if(act==='chat-open')openChat(id);
  else if(act==='chat-close')closeChat();
  else if(act==='chat-hold')sendChat(HOLD);
  else if(act==='chat-timelines')sendChat(TIMELINES);
  else if(act==='chat-routines')sendChat(ROUTINES);
  else if(act==='chat-complain'){if(S.chat){S.chat.draft='Complaint: ';render();var ci=byId('chat-input');if(ci){ci.focus();ci.setSelectionRange(ci.value.length,ci.value.length)}}}
  else if(act==='chat-send'){if(S.chat)sendChat(S.chat.draft)}
  else if(act==='chat-stop'){if(S.chat&&S.chat.ctl)S.chat.ctl.abort()}
  else if(act==='chat-capture')captureChat();
  else if(act==='chat-clear'){
    var a2=chatAgent();if(!a2||!S.chat)return;
    if(!S.chat.confirmClear){S.chat.confirmClear=true;render();return}
    S.chats[a2.id]={messages:[],agentId:a2.id,updatedAt:Date.now()};persist('chats',a2.id,S.chats[a2.id]);S.chat.confirmClear=false;S.chat.proposals=null;render();
  }
  else if(act==='prop-apply')applyProp(i);
  else if(act==='prop-skip'){if(S.chat&&S.chat.proposals&&S.chat.proposals[i]){S.chat.proposals[i].state='skipped';render()}}
  else if(act==='prop-all'){var ca=chatAgent();if(ca&&S.chat&&S.chat.proposals){S.chat.proposals.forEach(function(p:any,k:any){applyProp(k,true)});persist('agents',ca.id,ca);render();toast('Dates applied to the sheet')}}
  else if(act==='wizard-open')openWizard(el.dataset.project);
  else if(act==='wizard-close'){if(S.wizard&&S.wizard.ctl)S.wizard.ctl.abort();S.wizard=null;render()}
  else if(act==='wiz-template')wizTemplate();
  else if(act==='wiz-generate')wizGenerate();
  else if(act==='wiz-stop'){if(S.wizard&&S.wizard.ctl)S.wizard.ctl.abort()}
  else if(act==='wiz-back'){S.wizard.step=1;S.wizard.error='';render()}
  else if(act==='wiz-create')createAgent();
  else if(act==='sync')sync();
  else if(act==='save-brief'){var t=byId('brief-edit');if(t)saveBrief(id,t.value)}
  else if(act==='todo-cycle')mutate(id,function(a:any){var t=a.todos[i],o=['todo','doing','done'];t.status=o[(o.indexOf(t.status||'todo')+1)%3]});
  else if(act==='todo-add'){var ti=byId('todo-new');if(ti&&ti.value.trim()){var v=ti.value.trim();ti.value='';mutate(id,function(a:any){(a.todos=a.todos||[]).push({text:v,status:'todo',due:''})})}}
  else if(act==='goal-add'){var gi=byId('goal-new');if(gi&&gi.value.trim()){var gv=gi.value.trim();gi.value='';mutate(id,function(a:any){(a.goals=a.goals||[]).push({text:gv,horizon:'',done:false,due:''})})}}
  else if(act==='lib-del'){var lk=el.dataset.key;mutate(id,function(a:any){if(a[lk])a[lk].splice(i,1)})}
  else if(act==='lib-add'){
    var lk2=el.dataset.key,sp=LSPEC[lk2],obj: any={},okk=true;
    sp.f.forEach(function(f:any,n:any){var inp=byId('lib-'+lk2+'-'+f[0]);var v=inp?inp.value.trim():'';if(n===0&&!v)okk=false;obj[f[0]]=v});
    if(okk){
      if(lk2==='memory'){obj.at=today();obj.src='you'}
      if(lk2==='routines'){obj.state='planned';obj.next='';obj.note=''}
      mutate(id,function(a:any){(a[lk2]=a[lk2]||[]).push(obj)});
    }
  }
  else if(act==='delete-ask'){S.confirmDelete=id;render()}
  else if(act==='delete-cancel'){S.confirmDelete=null;render()}
  else if(act==='delete-confirm'){S.agents=S.agents.filter(function(a:any){return a.id!==id});removeDoc('agents',id);S.openAgent=null;S.confirmDelete=null;render();toast('Agent deleted')}
  else if(act==='copy-jd'){
    var a=S.agents.filter(function(x:any){return x.id===id})[0];if(!a)return;
    (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(jdText(a)):Promise.reject()).then(function(){toast('Job description copied')},function(){toast('Copy is blocked here. Select the text in the profile instead.')});
  }
});
document.addEventListener('input',function(e:any){
  var t=e.target;
  if(t.dataset.q!==undefined){S.q=t.value;render()}
  else if(t.dataset.chat!==undefined&&S.chat){S.chat.draft=t.value}
  else if(t.dataset.wf&&S.wizard&&S.wizard.fields){S.wizard.fields[t.dataset.wf]=t.value}
  else if(t.dataset.wx&&S.wizard){S.wizard.extras[t.dataset.wx]=t.value}
  else if(t.dataset.w1&&S.wizard){
    var k=t.dataset.w1;S.wizard[k]=t.value;
    if(k==='task'){var before=JSON.stringify(S.wizard.extras);S.wizard.extras=refreshDefaults(S.wizard.extras,t.value);if(JSON.stringify(S.wizard.extras)!==before)render()}
    if(k==='projectId'){S.wizard.brief=(S.projects[t.value]&&S.projects[t.value].brief)||'';render()}
  }
});
document.addEventListener('change',function(e:any){
  var t=e.target;
  if(t.dataset.flt!==undefined){S.flt=t.value;render()}
  else if(t.dataset.wcheck&&S.wizard){
    var xk=t.dataset.wcheck,xs=S.wizard.extras;xs.touched[xk]=true;
    xs[xk]=xs[xk].filter(function(v:any){return v!==t.value});if(t.checked)xs[xk].push(t.value);
  }
  else if(t.dataset.status){var sv=t.value;mutate(t.dataset.status,function(a:any){a.status=sv})}
  else if(t.dataset.set){
    var kind=t.dataset.set,f=t.dataset.f,i=Number(t.dataset.i),v=t.type==='checkbox'?t.checked:t.value;
    if(f==='current'||f==='target'){v=v===''?null:Number(v);if(v!==null&&!isFinite(v))v=null}
    mutate(t.dataset.id,function(a:any){
      var arr=kind==='goal'?a.goals:kind==='todo'?a.todos:kind==='routine'?a.routines:a.kpis;
      if(arr&&arr[i])arr[i][f]=v;
    });
  }
});
document.addEventListener('keydown',function(e:any){
  var t=e.target;
  if(e.key==='Escape'){
    if(S.wizard){if(S.wizard.ctl)S.wizard.ctl.abort();S.wizard=null;render()}
    else if(S.chat)closeChat();
    else if(S.openAgent){S.openAgent=null;render()}
  }
  else if(e.key==='Enter'&&t.id&&t.id.indexOf('lib-')===0){var lb=qs('[data-act="lib-add"][data-key="'+t.id.split('-')[1]+'"]');if(lb)lb.click()}
  else if(e.key==='Enter'&&t.id==='todo-new'){var b=qs('[data-act="todo-add"]');if(b)b.click()}
  else if(e.key==='Enter'&&t.id==='goal-new'){var g=qs('[data-act="goal-add"]');if(g)g.click()}
  else if(e.key==='Enter'&&t.dataset&&t.dataset.newtodo){
    var v=t.value.trim();if(!v)return;e.preventDefault();
    mutate(t.dataset.newtodo,function(a:any){(a.todos=a.todos||[]).push({text:v,status:'todo',due:''})});
  }
  else if(e.key==='Enter'&&!e.shiftKey&&t.id==='chat-input'){e.preventDefault();if(S.chat)sendChat(S.chat.draft)}
});

/* ---------- boot ---------- */
render();
(async function(){
  DB=createDb();DL=createDownloads();
  var cfg=await loadConfig();
  if(cfg.chat)SAMPLE=createSample();
  MCP=cfg.github;
  DB.collection('agents').onSnapshot(function(snap:any){
    var next=snap.docs.map(function(d:any){var o=clone(d.data());o.id=d.id;return o}).sort(function(a:any,b:any){return (b.createdAt||0)-(a.createdAt||0)});
    var sig=JSON.stringify(next);
    S.loaded=true;
    if(sig===lastSig&&lastSig!=='')return;
    lastSig=sig;S.agents=next;render();
  },function(){S.loaded=true;S.banner='Could not load saved agents. Reload the page to try again.';render()});
  DB.collection('projects').onSnapshot(function(snap:any){
    var m: any = {};snap.docs.forEach(function(d:any){m[d.id]=clone(d.data())});S.projects=m;
    if(!(document.activeElement&&document.activeElement.id==='brief-edit'))render();
  },function(){});
  DB.collection('chats').onSnapshot(function(snap:any){
    var m: any = {};snap.docs.forEach(function(d:any){m[d.id]=clone(d.data())});
    if(S.chat&&(S.chat.busy||S.chat.extracting))return;
    S.chats=m;if(S.chat)render();
  },function(){});
  DB.doc('meta/repos').onSnapshot(function(d:any){
    if(d.exists){var v=d.data();if(v&&Array.isArray(v.items)&&v.items.length){S.repos=clone(v.items);S.syncedAt=v.syncedAt||null;render()}}
  },function(){});
  render();
})();
}
