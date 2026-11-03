// @ts-nocheck
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

/* GitHub snapshot taken 3 Nov 2026. "Sync from GitHub" replaces it. */
export const DEFAULT_REPOS: Repo[] = [
 {full_name:'Skybirds-Empyrean-Avenue/familyvault',url:'https://github.com/Skybirds-Empyrean-Avenue/familyvault',pushed_at:'2026-10-16T19:45:18Z',visibility:'private'},
 {full_name:'sagarradia/AgentMonitoring',url:'https://github.com/sagarradia/AgentMonitoring',pushed_at:'2026-11-03T09:13:45Z',visibility:'public'},
 {full_name:'sagarradia/agent-evals',url:'https://github.com/sagarradia/agent-evals',pushed_at:'2026-11-03T06:32:22Z',visibility:'private'},
 {full_name:'sagarradia/agent-desk',url:'https://github.com/sagarradia/agent-desk',pushed_at:'2026-10-11T11:40:28Z',visibility:'private'},
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
var S: any = {repos:DEFAULT_REPOS,syncedAt:null,projects:{},agents:[],chats:{},loaded:false,scope:'all',tab:'overview',views:(function(){try{return JSON.parse(localStorage.getItem('ad-views')||'{}')||{}}catch(e){return {}}})(),ext:null,xe:null,xdel:null,capTab:'catalog',dirView:(function(){try{return localStorage.getItem('ad-dirview')||'people'}catch(e){return 'people'}})(),dirSel:'',dirTeam:'all',dirModel:'all',models:null,
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
function chatTurns(a: any) { return chatTurnsIn(S.repos, a, (S.projects[a.projectId] || {}).brief, (S.chats[a.id] || {}).messages || [], guardLines(a)) }
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
  h+='<span>'+(S.syncedAt?'Synced '+esc(fmtDate(S.syncedAt)):'GitHub snapshot, 3 Nov 2026')+'</span></div></aside>';
  return h;
}
function topHTML(repo){
  var h='<header class="top"><div><h1>'+(repo?esc(repo.full_name.split('/')[1]):'All projects')+'</h1><div class="sub">';
  if(repo)h+='<a href="'+esc(repo.url)+'" target="_blank" rel="noopener">'+esc(repo.full_name)+'</a><span class="pill">'+esc(repo.visibility)+'</span><span>pushed '+esc(ago(repo.pushed_at))+'</span>';
  else if(S.scope!=='all')h+='<span>'+esc(fullName(S.scope))+'</span>';
  else h+='<span>'+S.repos.length+' repositories from GitHub, with the agents that run them</span>';
  h+='</div></div><div class="btns"><button class="btn" data-act="tab" data-tab="connect">Connections</button><button class="btn primary" data-act="wizard-open" data-project="'+(S.scope==='all'?'':esc(S.scope))+'">Build an agent</button></div></header>';
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
function tabsHTML(list){
  var n=list.reduce(function(s,a){return s+(a.todos||[]).length},0),k=list.reduce(function(s,a){return s+(a.kpis||[]).length+(a.goals||[]).length},0);
  var lb=list.reduce(function(s,a){return s+libCount(a)},0);var t=[['overview','Overview',''],['tracker','Tracker',''],['people','Directory',list.length],['report','Status report',list.length],['agents','Roster',list.length],['tasks','Todos',n],['score','Goals & KPIs',k],['lib','Library',lb],['caps','Capabilities',ext().items.length+ext().rules.length],['connect','Connections',modelList().length]];
  return '<div class="tabs" role="tablist">'+t.map(function(x){return '<button class="tab" role="tab" data-act="tab" data-tab="'+x[0]+'" aria-selected="'+(S.tab===x[0])+'">'+x[1]+(x[2]!==''?'<em>'+x[2]+'</em>':'')+'</button>'}).join('')+'</div>';
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
function agentRow(a,d,rn,nKids,open){
  var gd=count(a,'goals',function(g){return g.done}),gt=(a.goals||[]).length,td=count(a,'todos',function(t){return t.status==='done'}),tt=(a.todos||[]).length,p=agentPct(a),late=lateCount(a),nd=nextDue(a),id=esc(a.id);
  return '<tr class="r-agent'+(late?' hot':'')+'"><td class="rn">'+rn+'</td>'
   +'<td class="name" style="padding-left:'+(8+d*20)+'px"><button class="caret" data-act="toggle" data-id="'+id+'" aria-expanded="'+open+'" aria-label="'+(open?'Collapse ':'Expand ')+esc(a.name)+'">'+(open?'▾':'▸')+'</button><button class="nm" data-act="toggle" data-id="'+id+'">'+esc(a.name)+'</button>'+(a.example?' <span class="tag">Example</span>':'')+(nKids?' <span class="cnt">'+nKids+' report'+(nKids>1?'s':'')+'</span>':'')+'</td>'
   +'<td class="kind">'+esc(a.level||'Agent')+'</td>'
   +'<td><select class="cell" id="ast-'+id+'" data-status="'+id+'" aria-label="Status of '+esc(a.name)+'">'+['active','paused','draft'].map(function(s){return '<option value="'+s+'"'+((a.status||'active')===s?' selected':'')+'>'+statusLabel(s)+'</option>'}).join('')+'</select></td>'
   +'<td class="mono'+(nd&&nd<today()?' bad':'')+'">'+(nd||'—')+'</td>'
   +'<td class="mono">'+gd+'/'+gt+'</td>'
   +'<td class="mono">'+td+'/'+tt+(late?' <span class="bad">'+late+' late</span>':'')+'</td>'
   +'<td class="mono '+tone(a.progress&&a.progress.pct)+'">'+(a.progress&&a.progress.pct!=null?a.progress.pct+'%':'—')+'</td><td class="mono'+(a.progress&&a.progress.idleDays>7?' bad':'')+'">'+(a.progress&&a.progress.lastActive?esc(a.progress.lastActive):'—')+'</td>'
   +'<td class="mono '+tone(p)+'">'+(p==null?'—':p+'%')+'</td>'
   +'<td class="detail">'+esc(a.role||'')+'</td><td>'+esc(a.reportsTo||'—')+'</td><td class="proj">'+esc(shortName(a.projectId))+'</td>'
   +'<td class="act"><button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button><button class="btn small" data-act="open-agent" data-id="'+id+'">Profile</button></td></tr>';
}
function subRow(nx,d,cls,nameHTML,kind,statusHTML,dueHTML,kpiHTML,detail){
  return '<tr class="r-sub '+cls+'"><td class="rn">'+nx()+'</td><td class="name" style="padding-left:'+(8+(d+1)*20)+'px">'+nameHTML+'</td><td class="kind">'+kind+'</td><td>'+(statusHTML||'')+'</td><td>'+(dueHTML||'')+'</td><td></td><td></td><td></td><td></td><td>'+(kpiHTML||'')+'</td><td class="detail">'+esc(detail||'')+'</td><td></td><td></td><td></td></tr>';
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
var HEAD='<thead><tr><th class="rn">#</th><th>Name</th><th>Kind</th><th>Status</th><th>Due</th><th>Goals</th><th>Todos</th><th>Done</th><th>Last active</th><th>KPI</th><th>Detail</th><th>Reports to</th><th>Project</th><th></th></tr></thead>';
function rosterSheet(list:any){
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
function todosView(list){return vsw('tasks','Board')+(isSheet('tasks')?todosSheet(list):todosCards(list))}
function sheetBlock(title:any,heads:any,rows:any){
  return '<div class="block"><h2>'+title+'</h2><div class="sheetwrap"><table class="sheet" style="min-width:760px"><thead><tr><th class="rn">#</th>'+heads.map(function(h:any){return '<th>'+h+'</th>'}).join('')+'</tr></thead><tbody>'+(rows||'<tr><td class="rn"></td><td colspan="'+heads.length+'" class="hint">Nothing yet</td></tr>')+'</tbody></table></div></div>';
}
function scoreView(list){return vsw('score','Cards')+(isSheet('score')?scoreSheet(list):scoreCards(list))}
function libView(list){return vsw('lib','Cards')+(isSheet('lib')?libSheet(list):libCards(list))}
function shellHTML(){
  var list=agentsOf(S.scope),repo=S.scope==='all'?null:repoById(S.scope);
  return '<div class="shell">'+railHTML()+'<main class="main">'+(S.banner?'<div class="err">'+esc(S.banner)+'</div>':'')+'<div class="mainhead">'+topHTML(repo)+tabsHTML(list)+'</div>'+(S.scope!=='all'?briefHTML(S.scope):'')+(S.tab==='overview'||S.tab==='tracker'||S.tab==='people'||S.tab==='report'||S.tab==='caps'||S.tab==='connect'?'':statsHTML(list))
   +'<section>'+(S.tab==='overview'?overviewView(list):S.tab==='tracker'?trackerView(list):S.tab==='people'?directoryView(list):S.tab==='caps'?capView(list):S.tab==='connect'?connectView():S.tab==='agents'?rosterView(list):S.tab==='tasks'?todosView(list):S.tab==='lib'?libView(list):S.tab==='report'?reportView(list):scoreView(list))+'</section></main></div>';
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
  var a=S.openAgent&&S.agents.filter(function(x){return x.id===S.openAgent})[0];
  if(!a)return '';
  var p=agentPct(a),id=esc(a.id);
  var h='<div class="scrim" data-act="close-panel"></div><aside class="panel" role="dialog" aria-label="Agent profile">';
  h+='<div class="panel-head"><div><h2>'+esc(a.name)+(a.example?' <span class="tag">Example</span>':'')+'</h2><p class="role">'+esc(a.role)+'</p></div><div class="btns"><button class="btn small" data-act="edit-open" data-id="'+id+'">Edit</button><button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button><button class="btn small" data-act="close-panel">Close</button></div></div><div class="panel-body">';
  h+='<div class="facts"><div><span>Project</span><b>'+esc(fullName(a.projectId))+'</b></div><div><span>Reports to</span><b>'+esc(a.reportsTo||'—')+'</b></div>'+(modelOf(a).now?'<div><span>Model</span><b>'+esc(modelOf(a).now)+' now · planned '+esc(modelOf(a).prop)+'</b></div>':'')
   +'<div><span>Status</span><select id="st-'+id+'" data-status="'+id+'" aria-label="Status">'+['active','paused','draft'].map(function(s){return '<option value="'+s+'"'+((a.status||'active')===s?' selected':'')+'>'+statusLabel(s)+'</option>'}).join('')+'</select></div>'
   +'<div><span>Created</span><b>'+esc(fmtDate(a.createdAt)||'—')+(a.source==='claude'?' · drafted by Claude':a.source==='template'?' · from template':a.source==='repo'?' · imported from role file':'')+'</b></div></div>';
  if(a.progress){var g=a.progress;h+='<section class="sec"><h3>Progress · '+esc(g.asOf)+'</h3><p>'+(g.assigned?g.done+' of '+g.assigned+' tickets done ('+g.pct+'%), '+g.open+' open. ':'No tickets of its own. ')+(g.lastActive?'Last active '+esc(g.lastActive)+(g.idleDays!=null?' ('+g.idleDays+' days ago).':'.'):'No recorded activity.')+'</p><ul class="plain">'+(g.reasons||[]).map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></section>'}
  h+='<section class="sec"><h3>Job description</h3><p>'+esc(a.purpose||'')+'</p>'
   +((a.task)?'<p class="hint">Task given: '+esc(a.task)+'</p>':'')
   +((a.requirements||[]).length?'<h3 style="margin-top:6px">Requirements</h3><ul class="plain">'+a.requirements.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>':'')
   +((a.tools||[]).length?'<h3 style="margin-top:6px">Tools and access</h3><div class="chips">'+a.tools.map(function(x){return '<span class="chip">'+esc(x)+'</span>'}).join('')+'</div>':'')+'</section>';
  h+='<section class="sec"><h3>Responsibilities</h3><ul class="plain">'+((a.responsibilities||[]).map(function(x){return '<li>'+esc(x)+'</li>'}).join('')||'<li>None listed</li>')+'</ul></section>';
  if((a.may||[]).length)h+='<section class="sec"><h3>May</h3><ul class="plain">'+a.may.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></section>';
  if((a.mustNot||[]).length)h+='<section class="sec"><h3>Must not</h3><ul class="plain">'+a.mustNot.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></section>';
  if(a.handsOff||a.reads)h+='<section class="sec"><h3>Handoffs</h3>'+(a.handsOff?'<p><b>Hands off to:</b> '+esc(a.handsOff)+'</p>':'')+(a.reads?'<p><b>Reads at the start of a run:</b> '+esc(a.reads)+'</p>':'')+'</section>';
  h+='<section class="sec"><h3>Goals</h3>'+((a.goals||[]).map(function(g,i){return '<div class="rowline '+(g.done?'done':'')+'"><input type="checkbox" id="g-'+id+'-p'+i+'" data-set="goal" data-f="done" data-id="'+id+'" data-i="'+i+'"'+(g.done?' checked':'')+' aria-label="Goal met"><label class="grow" for="g-'+id+'-p'+i+'">'+esc(g.text)+'<small>'+esc([g.horizon,g.note].filter(Boolean).join(' · '))+'</small></label>'+dateInput('goal',a.id,i,g.due)+'</div>'}).join('')||'<p class="hint">No goals set.</p>')
   +'<div class="addrow"><input type="text" id="goal-new" placeholder="Add a goal" aria-label="New goal"><button class="btn small" data-act="goal-add" data-id="'+id+'">Add</button></div></section>';
  h+='<section class="sec"><h3>Key result areas</h3>'+((a.kras||[]).map(function(k){return '<div class="rowline"><span class="grow"><b>'+esc(k.area)+'</b><small style="font-family:var(--sans);font-size:13px;color:var(--fg)">'+esc(k.outcome)+'</small></span><span class="mono">'+esc(k.weight)+'%</span></div>'}).join('')||'<p class="hint">No KRAs set.</p>')+'</section>';
  h+='<section class="sec"><h3>KPIs · '+(p==null?'no readings yet':'attainment '+p+'%')+'</h3>'+((a.kpis||[]).map(function(k,i){
    var kp=kpiPct(k);
    return '<div class="kpi '+tone(kp)+'"><div><b>'+esc(k.name)+'</b><div class="hint">'+esc(k.cadence||'')+' · '+(k.dir==='down'?'lower is better':'higher is better')+'</div></div>'
     +'<div class="tg"><input type="number" step="any" class="kin" id="kpi-'+id+'-'+i+'" data-set="kpi" data-f="current" data-id="'+id+'" data-i="'+i+'" value="'+(k.current==null?'':esc(k.current))+'" placeholder="current" aria-label="Current value"> / <input type="number" step="any" class="kin" id="kpt-'+id+'-'+i+'" data-set="kpi" data-f="target" data-id="'+id+'" data-i="'+i+'" value="'+(k.target==null?'':esc(k.target))+'" placeholder="target" aria-label="Target"> '+esc(k.unit||'')+'</div>'
     +'<div class="bar"><i style="width:'+(kp==null?0:kp)+'%"></i></div></div>';
  }).join('')||'<p class="hint">No KPIs set.</p>')+'</section>';
  h+='<section class="sec"><h3>Todos</h3>'+((a.todos||[]).map(function(t,i){
    var s=t.status||'todo';
    return '<div class="rowline '+(s==='done'?'done':'')+'"><button class="st" data-s="'+s+'" data-act="todo-cycle" data-id="'+id+'" data-i="'+i+'" aria-label="Status: '+s+'. Click to change">'+(s==='done'?'✓':s==='doing'?'…':'')+'</button><span class="grow">'+esc(t.text)+'<small>'+({todo:'To do',doing:'In progress',done:'Done'}[s])+(t.note?' · '+esc(t.note):'')+'</small></span>'+dateInput('todo',a.id,i,t.due)+'</div>';
  }).join('')||'<p class="hint">No todos yet.</p>')
   +'<div class="addrow"><input type="text" id="todo-new" placeholder="Add a todo" aria-label="New todo"><button class="btn small" data-act="todo-add" data-id="'+id+'">Add</button></div></section>';
  ['routines','memory','docs','skills'].forEach(function(k){h+=libSec(a,k)});
  h+='<div class="foot"><button class="btn small" data-act="copy-jd" data-id="'+id+'">Copy job description</button>';
  if(S.confirmDelete===a.id)h+='</div><div class="confirm"><span>Delete this agent with its goals, KPIs and todos?</span><button class="btn small danger" data-act="delete-confirm" data-id="'+id+'">Delete</button><button class="btn small" data-act="delete-cancel">Keep</button></div>';
  else h+='<button class="btn small danger" data-act="delete-ask" data-id="'+id+'">Delete agent</button></div>';
  return h+'</div></aside>';
}

function chatHTML(){
  var c=S.chat,a=c&&S.agents.filter(function(x){return x.id===c.id})[0];
  if(!c||!a)return '';
  var msgs=(S.chats[a.id]&&S.chats[a.id].messages)||[],can=!!SAMPLE&&!S.sampleBlocked,dis=(!can||c.busy||c.extracting)?' disabled':'';
  var hasReply=msgs.some(function(m){return m.role==='agent'});
  var h='<div class="scrim" data-act="chat-close"></div><aside class="panel chat" role="dialog" aria-label="Chat with '+esc(a.name)+'">';
  h+='<div class="panel-head"><div><h2>'+esc(a.name)+'</h2><p class="role">'+esc(a.role)+' · '+esc(shortName(a.projectId))+'</p></div><div class="btns"><button class="btn small" data-act="open-agent" data-id="'+esc(a.id)+'">Profile</button><button class="btn small" data-act="chat-close">Close</button></div></div>';
  h+='<p class="chat-note">Claude speaks as this role, using its role file and the records on this page. Its reasons are a reading of the records and the GitHub repo record as of the report date, not a memory of what happened.'+(can?'':' Chat is unavailable in this view.')+'</p>';
  h+='<div class="chat-quick"><button class="btn small" data-act="chat-hold"'+dis+'>Hold to account</button><button class="btn small" data-act="chat-timelines"'+dis+'>Ask for timelines</button><button class="btn small" data-act="chat-routines"'+dis+'>Check routines</button><button class="btn small" data-act="chat-complain"'+(can?'':' disabled')+'>Complain</button></div>';
  h+='<div class="chat-log" id="chat-log">';
  if(!msgs.length&&!c.busy)h+='<p class="hint">No messages yet. Use Hold to account to ask why items are late, what blocks them and when they will be done.</p>';
  msgs.forEach(function(m){h+='<div class="msg '+(m.role==='agent'?'agent':'founder')+'"><span class="who">'+(m.role==='agent'?esc(a.name):'You')+'</span><div class="txt">'+esc(m.text)+'</div></div>'});
  if(c.busy)h+='<div class="msg agent"><span class="who">'+esc(a.name)+'</span><div class="txt" id="chat-stream">'+(c.partial?esc(c.partial):'Thinking…')+'</div></div>';
  h+='</div>';
  if(c.proposals){
    h+='<div class="props"><h3>From this chat</h3>';
    if(!c.proposals.length)h+='<p class="hint">The agent made no commitments to record. Ask for timelines, then capture again.</p>';
    else{
      c.proposals.forEach(function(p,i){
        var list=p.kind==='todo'?a.todos:p.kind==='goal'?a.goals:p.kind==='routine'?a.routines:a.kpis,it=list&&list[p.index],label=p.kind==='memory'?p.note:it?(it.text||it.name):'(item removed)';
        h+='<div class="prop"><div class="grow"><b>'+({todo:'Todo',goal:'Goal',kpi:'KPI',routine:'Routine',memory:'Add to memory'}[p.kind])+':</b> '+esc(label)+'<small>'+[p.due?(p.kind==='routine'?'next run ':'due ')+p.due:'',p.status?'status '+p.status:'',p.kind==='memory'?'':p.note].filter(Boolean).map(esc).join(' · ')+'</small></div>'
         +(p.state==='open'?'<span><button class="btn small primary" data-act="prop-apply" data-i="'+i+'">Apply</button> <button class="btn small" data-act="prop-skip" data-i="'+i+'">Skip</button></span>':'<span class="hint">'+(p.state==='applied'?'Applied':'Skipped')+'</span>')+'</div>';
      });
      if(c.proposals.some(function(p){return p.state==='open'}))h+='<div><button class="btn small primary" data-act="prop-all">Apply all</button></div>';
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
  var ae=document.activeElement,aid=ae&&ae.id,s0=null,s1=null;
  try{if(ae&&ae.selectionStart!=null){s0=ae.selectionStart;s1=ae.selectionEnd}}catch(e){}
  var pb=overlay.querySelector('.panel-body'),pt=pb?pb.scrollTop:0,mb=overlay.querySelector('.modal-body'),mt=mb?mb.scrollTop:0;
  var lg=document.getElementById('chat-log'),lt=lg?lg.scrollTop:0,near=lg?(lg.scrollHeight-lg.scrollTop-lg.clientHeight<90):true;
  var sw=app.querySelector('.sheetwrap'),sl=sw?sw.scrollLeft:0,stp=sw?sw.scrollTop:0;
  var ms=document.scrollingElement?document.scrollingElement.scrollTop:0;
  app.innerHTML=shellHTML();
  overlay.innerHTML=panelHTML()+chatHTML()+wizardHTML()+editHTML()+modelsHTML()+xeHTML();
  var pb2=overlay.querySelector('.panel-body');if(pb2)pb2.scrollTop=pt;
  var mb2=overlay.querySelector('.modal-body');if(mb2)mb2.scrollTop=mt;
  var lg2=document.getElementById('chat-log');
  if(lg2){if(near||(S.chat&&S.chat.fresh)){lg2.scrollTop=lg2.scrollHeight;if(S.chat)S.chat.fresh=false}else lg2.scrollTop=lt}
  var sw2=app.querySelector('.sheetwrap');if(sw2){sw2.scrollLeft=sl;sw2.scrollTop=stp}
  if(document.scrollingElement)document.scrollingElement.scrollTop=ms;
  if(aid){var el=document.getElementById(aid);if(el){try{el.focus({preventScroll:true});if(s0!=null&&el.setSelectionRange)el.setSelectionRange(s0,s1)}catch(e){}}}
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
/* GitHub may not return a private or organisation repo (token scope). Never drop a project that has agents or is in the saved list. */
function keepKnown(items:any[]):any[]{
  var have:any={};items.forEach(function(x:any){have[rid(x)]=1});
  var out=items.slice();
  DEFAULT_REPOS.concat(S.repos||[]).forEach(function(x:any){
    var k=rid(x);
    if(have[k])return;
    var used=S.agents.some(function(a:any){return a.projectId===k});
    if(used||DEFAULT_REPOS.some(function(d:any){return rid(d)===k})){have[k]=1;out.push(x)}
  });
  return out;
}
async function sync(){
  if(!MCP||S.syncing)return;
  S.syncing=true;render();
  try{
    var repos=await listRepos();
    var items=repos.filter(function(x:any){return x&&x.full_name&&x.full_name.indexOf('/')>0}).map(function(x:any){return {full_name:x.full_name,url:x.url||('https://github.com/'+x.full_name),pushed_at:x.pushed_at||'',visibility:x.visibility||'private'}});
    if(!items.length)throw {code:'empty'};
    var fromGh=items.length;items=keepKnown(items);
    S.repos=items;S.syncedAt=Date.now();
    persist('meta','repos',{items:items,syncedAt:S.syncedAt});
    toast('Synced '+fromGh+' repositories'+(items.length>fromGh?' (kept '+(items.length-fromGh)+' that GitHub did not list; check the token has access)':''));
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
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-act]');if(!el)return;
  var act=el.dataset.act,id=el.dataset.id,i=Number(el.dataset.i);
  if(act==='scope'){S.scope=id;render()}
  else if(act==='tab'){S.tab=el.dataset.tab;render()}
  else if(act==='toggle'){S.open[id]=!S.open[id];render()}
  else if(act==='expand-all'){agentsOf(S.scope).forEach(function(a){S.open[a.id]=true});render()}
  else if(act==='collapse-all'){S.open={};render()}
  else if(act==='csv')exportCSV();
  else if(act==='dircsv')exportDirCSV();
  else if(act==='edit-open'){var ea=S.agents.filter(function(x){return x.id===id})[0];if(ea){S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.openAgent=null;S.modelsOpen=false;S.edit={id:id,f:editFields(ea)};render()}}
  else if(act==='edit-close'){S.edit=null;render()}
  else if(act==='edit-save')saveEdit();
  else if(act==='models-open'){S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.openAgent=null;S.edit=null;S.modelsOpen=true;render()}
  else if(act==='models-close'){S.modelsOpen=false;render()}
  else if(act==='model-del'){
    var used=S.agents.filter(function(a){var o=modelOf(a);return o.nowId===id||o.propId===id}).length;
    if(used){toast('Still assigned to '+used+' agent'+(used>1?'s':'')+'. Change them first.');return}
    ensureList();S.models.list=S.models.list.filter(function(m){return m.id!==id});persistModels();render();
  }
  else if(act==='model-add'){
    var g=function(k){var e2=document.getElementById('mnew-'+k);return e2?e2.value.trim():''};
    var nm=g('name');if(!nm){toast('Give the model a name');return}
    ensureList();var mid=nm.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'model';while(modelById(mid))mid+='-2';
    S.models.list.push({id:mid,name:nm,vendor:g('vendor'),connected:false,note:g('note')});persistModels();render();toast('Added. Tick Connected when it is wired in.');
  }
  else if(act==='vw'){S.views[el.dataset.tab]=el.dataset.view;try{localStorage.setItem('ad-views',JSON.stringify(S.views))}catch(e){}render()}
  else if(act==='cap-tab'){S.capTab=el.dataset.sub;S.xdel=null;render()}
  else if(act==='x-new'||act==='x-edit'){
    var xk=el.dataset.kind,xo=null;
    if(act==='x-edit'){var xa=xk==='rule'?ext().rules:ext().items;for(var xi=0;xi<xa.length;xi++)if(xa[xi].id===id)xo=xa[xi];if(!xo)return}
    S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.openAgent=null;S.edit=null;S.modelsOpen=false;
    S.xe={kind:xk,id:xo?xo.id:null,f:xeFields(xk,xo)};render();
  }
  else if(act==='x-close'){S.xe=null;render()}
  else if(act==='x-save')saveXe();
  else if(act==='x-del'){S.xdel=id;render()}
  else if(act==='x-del-ok'){var E2=clone(ext());if(el.dataset.kind==='rule')E2.rules=E2.rules.filter(function(r){return r.id!==id});else E2.items=E2.items.filter(function(r){return r.id!==id});S.xdel=null;saveExt(E2);render();toast('Removed')}
  else if(act==='dirfull'){S.dirFull=!S.dirFull;render()}
  else if(act==='dirview'){S.dirView=el.dataset.view;try{localStorage.setItem('ad-dirview',S.dirView)}catch(e){}render()}
  else if(act==='dirsel'){S.dirSel=id;render();var pc=document.getElementById('pp-card');if(pc)pc.scrollTop=0}
  else if(act==='open-agent'){S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.openAgent=id;S.confirmDelete=null;render()}
  else if(act==='close-panel'){S.openAgent=null;S.confirmDelete=null;render()}
  else if(act==='chat-open')openChat(id);
  else if(act==='chat-close')closeChat();
  else if(act==='chat-hold')sendChat(HOLD);
  else if(act==='chat-timelines')sendChat(TIMELINES);
  else if(act==='chat-routines')sendChat(ROUTINES);
  else if(act==='chat-complain'){if(S.chat){S.chat.draft='Complaint: ';render();var ci=document.getElementById('chat-input');if(ci){ci.focus();ci.setSelectionRange(ci.value.length,ci.value.length)}}}
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
  else if(act==='prop-all'){var ca=chatAgent();if(ca&&S.chat&&S.chat.proposals){S.chat.proposals.forEach(function(p,k){applyProp(k,true)});persist('agents',ca.id,ca);render();toast('Dates applied to the sheet')}}
  else if(act==='wizard-open')openWizard(el.dataset.project);
  else if(act==='wizard-close'){if(S.wizard&&S.wizard.ctl)S.wizard.ctl.abort();S.wizard=null;render()}
  else if(act==='wiz-template')wizTemplate();
  else if(act==='wiz-generate')wizGenerate();
  else if(act==='wiz-stop'){if(S.wizard&&S.wizard.ctl)S.wizard.ctl.abort()}
  else if(act==='wiz-back'){S.wizard.step=1;S.wizard.error='';render()}
  else if(act==='wiz-create')createAgent();
  else if(act==='sync')sync();
  else if(act==='save-brief'){var t=document.getElementById('brief-edit');if(t)saveBrief(id,t.value)}
  else if(act==='todo-cycle')mutate(id,function(a){var t=a.todos[i],o=['todo','doing','done'];t.status=o[(o.indexOf(t.status||'todo')+1)%3]});
  else if(act==='todo-add'){var ti=document.getElementById('todo-new');if(ti&&ti.value.trim()){var v=ti.value.trim();ti.value='';mutate(id,function(a){(a.todos=a.todos||[]).push({text:v,status:'todo',due:''})})}}
  else if(act==='goal-add'){var gi=document.getElementById('goal-new');if(gi&&gi.value.trim()){var gv=gi.value.trim();gi.value='';mutate(id,function(a){(a.goals=a.goals||[]).push({text:gv,horizon:'',done:false,due:''})})}}
  else if(act==='lib-del'){var lk=el.dataset.key;mutate(id,function(a){if(a[lk])a[lk].splice(i,1)})}
  else if(act==='lib-add'){
    var lk2=el.dataset.key,sp=LSPEC[lk2],obj={},okk=true;
    sp.f.forEach(function(f,n){var inp=document.getElementById('lib-'+lk2+'-'+f[0]);var v=inp?inp.value.trim():'';if(n===0&&!v)okk=false;obj[f[0]]=v});
    if(okk){
      if(lk2==='memory'){obj.at=today();obj.src='you'}
      if(lk2==='routines'){obj.state='planned';obj.next='';obj.note=''}
      mutate(id,function(a){(a[lk2]=a[lk2]||[]).push(obj)});
    }
  }
  else if(act==='delete-ask'){S.confirmDelete=id;render()}
  else if(act==='delete-cancel'){S.confirmDelete=null;render()}
  else if(act==='delete-confirm'){S.agents=S.agents.filter(function(a){return a.id!==id});removeDoc('agents',id);S.openAgent=null;S.confirmDelete=null;render();toast('Agent deleted')}
  else if(act==='copy-jd'){
    var a=S.agents.filter(function(x){return x.id===id})[0];if(!a)return;
    (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(jdText(a)):Promise.reject()).then(function(){toast('Job description copied')},function(){toast('Copy is blocked here. Select the text in the profile instead.')});
  }
});
document.addEventListener('input',function(e){
  var t=e.target;
  if(t.dataset.q!==undefined){S.q=t.value;render()}
  else if(t.dataset.chat!==undefined&&S.chat){S.chat.draft=t.value}
  else if(t.dataset.ef&&S.edit){S.edit.f[t.dataset.ef]=t.value}
  else if(t.dataset.xf&&S.xe){S.xe.f[t.dataset.xf]=t.value}
  else if(t.dataset.wx&&S.wizard){S.wizard.extras[t.dataset.wx]=t.value}
  else if(t.dataset.wf&&S.wizard&&S.wizard.fields){S.wizard.fields[t.dataset.wf]=t.value}
  else if(t.dataset.w1&&S.wizard){
    var k=t.dataset.w1;S.wizard[k]=t.value;
    if(k==='task'){var before=JSON.stringify(S.wizard.extras);S.wizard.extras=refreshDefaults(S.wizard.extras,t.value);if(JSON.stringify(S.wizard.extras)!==before)render()}
    if(k==='projectId'){S.wizard.brief=(S.projects[t.value]&&S.projects[t.value].brief)||'';render()}
  }
});
document.addEventListener('change',function(e){
  var t=e.target;
  if(t.dataset.flt!==undefined){S.flt=t.value;render()}
  else if(t.dataset.xf&&S.xe){S.xe.f[t.dataset.xf]=t.value;if(t.dataset.xf==='mode'){S.xe.f.scope.mode=t.value;render()}}
  else if(t.dataset.xc&&S.xe){var xl=S.xe.f.scope[t.dataset.xc],xp=xl.indexOf(t.value);if(t.checked&&xp<0)xl.push(t.value);else if(!t.checked&&xp>=0)xl.splice(xp,1);render()}
  else if(t.dataset.xi){var E3=clone(ext());E3.items.forEach(function(x){if(x.id===t.dataset.id)x[t.dataset.xi]=t.value});saveExt(E3);render()}
  else if(t.dataset.mdl){var mv=t.value,mw=t.dataset.mdl;mutate(t.dataset.id,function(a){if(mw==='now')a.model=mv;else a.modelPlanned=mv})}
  else if(t.dataset.mc){ensureList();var mm=modelById(t.dataset.mc);if(mm){mm.connected=t.checked;persistModels();render()}}
  else if(t.dataset.mf){ensureList();var m3=modelById(t.dataset.mid);if(m3){var nv=t.value.trim();if(t.dataset.mf==='name'&&!nv)nv=m3.name;if(looksSecret(nv)){toast('That looks like a secret key. Do not paste keys here. Type only the key\'s name, for example DEEPSEEK_API_KEY.');render();return}m3[t.dataset.mf]=nv;persistModels();render()}}
  else if(t.dataset.ef&&S.edit){S.edit.f[t.dataset.ef]=t.value}
  else if(t.dataset.dirf){if(t.dataset.dirf==='team')S.dirTeam=t.value;else S.dirModel=t.value;render()}
  else if(t.dataset.wcheck&&S.wizard){
    var xk=t.dataset.wcheck,xs=S.wizard.extras;xs.touched[xk]=true;
    xs[xk]=xs[xk].filter(function(v){return v!==t.value});if(t.checked)xs[xk].push(t.value);
  }
  else if(t.dataset.imp!==undefined){
    var fl=t.files&&t.files[0];if(!fl)return;
    var rd=new FileReader();
    rd.onload=function(){
      var data:any;try{data=JSON.parse(String(rd.result))}catch(e){toast('That file is not valid JSON');return}
      fetch('/api/import',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(data)}).then(function(r){
        if(!r.ok)throw new Error('http_'+r.status);return r.json()}).then(function(j:any){toast('Imported '+j.agents+' agents. Reloading…');setTimeout(function(){location.reload()},900)},function(){toast('Import failed. Check you are signed in and the file is the right one.')});
    };
    rd.readAsText(fl);
  }
  else if(t.dataset.status){var sv=t.value;mutate(t.dataset.status,function(a){a.status=sv})}
  else if(t.dataset.set){
    var kind=t.dataset.set,f=t.dataset.f,i=Number(t.dataset.i),v=t.type==='checkbox'?t.checked:t.value;
    if(f==='current'||f==='target'){v=v===''?null:Number(v);if(v!==null&&!isFinite(v))v=null}
    mutate(t.dataset.id,function(a){
      var arr=kind==='goal'?a.goals:kind==='todo'?a.todos:kind==='routine'?a.routines:a.kpis;
      if(arr&&arr[i])arr[i][f]=v;
    });
  }
});
document.addEventListener('keydown',function(e){
  var t=e.target;
  if(e.key==='Escape'){
    if(S.xe){S.xe=null;render()}
    else if(S.edit){S.edit=null;render()}
    else if(S.modelsOpen){S.modelsOpen=false;render()}
    else if(S.wizard){if(S.wizard.ctl)S.wizard.ctl.abort();S.wizard=null;render()}
    else if(S.chat)closeChat();
    else if(S.openAgent){S.openAgent=null;render()}
  }
  else if(e.key==='Enter'&&t.id&&t.id.indexOf('lib-')===0){var lb=document.querySelector('[data-act="lib-add"][data-key="'+t.id.split('-')[1]+'"]');if(lb)lb.click()}
  else if(e.key==='Enter'&&t.id==='todo-new'){var b=document.querySelector('[data-act="todo-add"]');if(b)b.click()}
  else if(e.key==='Enter'&&t.id==='goal-new'){var g=document.querySelector('[data-act="goal-add"]');if(g)g.click()}
  else if(e.key==='Enter'&&t.dataset&&t.dataset.newtodo){
    var v=t.value.trim();if(!v)return;e.preventDefault();
    mutate(t.dataset.newtodo,function(a){(a.todos=a.todos||[]).push({text:v,status:'todo',due:''})});
  }
  else if(e.key==='Enter'&&!e.shiftKey&&t.id==='chat-input'){e.preventDefault();if(S.chat)sendChat(S.chat.draft)}
});

/* ---------- boot ---------- */

/* ---------- additions: directory, capabilities, connections, card views ---------- */
function todosSheet(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  var items=[],q=S.q.trim().toLowerCase();
  list.forEach(function(a){(a.todos||[]).forEach(function(t,i){items.push({a:a,t:t,i:i})})});
  items=items.filter(function(x){
    if(S.flt==='attention'&&!(isLate('todo',x.t)||isBlocked(x.t)))return false;
    if(S.flt==='active'&&x.a.status!=='active')return false;
    if(S.flt==='draft'&&x.a.status!=='draft')return false;
    if(q&&(x.t.text+' '+x.a.name).toLowerCase().indexOf(q)<0)return false;
    return true;
  });
  if(!items.length)return toolbarHTML(false)+(list.length?'<div class="empty"><h3>No todos match</h3><p>Clear the search or change the filter.</p></div>':emptyHTML());
  var rank={doing:0,todo:1,done:2};
  items.sort(function(x,y){
    var lx=isLate('todo',x.t)?0:1,ly=isLate('todo',y.t)?0:1;
    return lx-ly||(rank[x.t.status||'todo']-rank[y.t.status||'todo'])||String(x.t.due||'9999').localeCompare(String(y.t.due||'9999'))||String(x.a.name).localeCompare(String(y.a.name));
  });
  var rows=items.map(function(x,k){
    var s=x.t.status||'todo',id=esc(x.a.id),late=isLate('todo',x.t);
    return '<tr class="'+(late?'hot':'')+'"><td class="rn">'+(k+1)+'</td><td class="name'+(isBlocked(x.t)?' blocked':'')+'">'+esc(x.t.text)+'</td>'
     +'<td><button class="nm" data-act="chat-open" data-id="'+id+'" title="Talk to this agent">'+esc(x.a.name)+'</button></td><td class="proj">'+esc(shortName(x.a.projectId))+'</td>'
     +'<td><select class="cell" id="ts-'+id+'-'+x.i+'" data-set="todo" data-f="status" data-id="'+id+'" data-i="'+x.i+'" aria-label="Todo status">'+[['todo','To do'],['doing','In progress'],['done','Done']].map(function(o){return '<option value="'+o[0]+'"'+(s===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></td>'
     +'<td>'+dateInput('todo',x.a.id,x.i,x.t.due)+'</td><td class="detail">'+esc(x.t.note||'')+'</td></tr>';
  }).join('');
  return toolbarHTML(false)+'<div class="sheetwrap"><table class="sheet" style="min-width:900px"><thead><tr><th class="rn">#</th><th>Todo</th><th>Agent</th><th>Project</th><th>Status</th><th>Due</th><th>Note</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function scoreSheet(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var g=0,k=0,p=0,gr='',kr='',pr='';
  list.slice().sort(sortAg).forEach(function(a){
    (a.goals||[]).forEach(function(x){g++;gr+='<tr class="'+(isLate('goal',x)?'hot':'')+'"><td class="rn">'+g+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.text)+'</td><td>'+esc(x.horizon||'')+'</td><td class="mono">'+esc(x.due||'—')+'</td><td>'+(x.done?'Met':isLate('goal',x)?'<span class="bad">Late</span>':'Open')+'</td></tr>'});
    (a.kras||[]).forEach(function(x){k++;kr+='<tr><td class="rn">'+k+'</td><td>'+esc(a.name)+'</td><td>'+esc(x.area)+'</td><td class="detail">'+esc(x.outcome)+'</td><td class="mono">'+esc(x.weight)+'%</td></tr>'});
    (a.kpis||[]).forEach(function(x){p++;var pc=kpiPct(x);pr+='<tr class="'+(isLate('kpi',x)?'hot':'')+'"><td class="rn">'+p+'</td><td>'+esc(a.name)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.cadence||'')+'</td><td class="mono">'+(x.target==null||x.target===''?'not set':(x.dir==='down'?'≤ ':'≥ ')+esc(fmtNum(x.target))+' '+esc(x.unit||''))+'</td><td class="mono">'+(x.current==null?'—':esc(fmtNum(x.current)))+'</td><td class="mono">'+esc(x.due||'—')+'</td><td class="mono '+tone(pc)+'">'+(pc==null?'not tracked':pc+'%')+'</td></tr>'});
  });
  return toolbarHTML(false).replace(/<input[^>]*data-q[^>]*>/,'').replace(/<select[^>]*data-flt[\s\S]*?<\/select>/,'')
   +'<div style="display:flex;flex-direction:column;gap:18px">'
   +sheetBlock('Goals',['Agent','Goal','Horizon','Due','Status'],gr)
   +sheetBlock('Key result areas',['Agent','Area','Outcome','Weight'],kr)
   +sheetBlock('KPIs',['Agent','KPI','Cadence','Target','Current','Due','Attainment'],pr)+'</div>';
}
var DEFAULT_MODELS=[
 {id:'opus55',name:'Claude Opus 5.5',vendor:'Anthropic',connected:true,note:'Base model for every agent (CLAUDE.md).'},
 {id:'sonnet55',name:'Claude Sonnet 5.5',vendor:'Anthropic',connected:true,note:'Planned for 12 lighter roles in PR #139.'},
 {id:'codex',name:'Codex',vendor:'OpenAI',connected:false,note:'CLAUDE.md names it as a secondary tool. Connection not verified.'},
 {id:'hermes',name:'Hermes',vendor:'',connected:false,note:'CLAUDE.md names it as a secondary tool. Connection not verified.'},
 {id:'deepseek',name:'DeepSeek',vendor:'DeepSeek',connected:false,note:''},
 {id:'kimi',name:'Kimi',vendor:'Moonshot AI',connected:false,note:''}];
function modelList(){return (S.models&&S.models.list&&S.models.list.length)?S.models.list:DEFAULT_MODELS}
function modelById(id){var L=modelList();for(var i=0;i<L.length;i++)if(L[i].id===id)return L[i];return null}
function mn(id){var x=modelById(id);return x?x.name:(id||'')}
function ensureList(){S.models=S.models||{today:'Opus 5.5'};if(!S.models.list||!S.models.list.length)S.models.list=clone(DEFAULT_MODELS)}
function persistModels(){persist('meta','models',S.models)}
function modelOf(a){
  var m=S.models;
  if(!a.sourceFile&&!a.model&&!a.modelPlanned)return {now:'',prop:'',nowId:'',propId:''};
  var k=String(a.id).replace(/^fv_/,''),sn=!!m&&(m.sonnet||[]).indexOf(k)>=0;
  var nowId=a.model||'opus55',propId=a.modelPlanned||(a.sourceFile?(sn?'sonnet55':'opus55'):'');
  return {nowId:nowId,propId:propId,now:mn(nowId),prop:mn(propId)};
}
function mdlChip(x){var l=String(x||'').toLowerCase();return x?'<span class="mdl '+(l.indexOf('opus')>=0?'opus':l.indexOf('sonnet')>=0?'sonnet':'')+'">'+esc(x)+'</span>':'—'}
function modelOpts(cur,blank){
  var h=blank?'<option value="">'+esc(blank)+'</option>':'';
  modelList().forEach(function(m){h+='<option value="'+esc(m.id)+'"'+(m.id===cur?' selected':'')+((!m.connected&&m.id!==cur)?' disabled':'')+'>'+esc(m.name)+(m.connected?'':' (not connected)')+'</option>'});
  if(cur&&!modelById(cur))h+='<option value="'+esc(cur)+'" selected>'+esc(cur)+' (removed)</option>';
  return h;
}
function modelSel(a,which){
  var o=modelOf(a),cur=which==='now'?o.nowId:o.propId,id=esc(a.id);
  return '<select class="cell" id="mdl-'+which+'-'+id+'" data-mdl="'+which+'" data-id="'+id+'" aria-label="Model '+which+' for '+esc(a.name)+'">'+modelOpts(cur,'Not set')+'</select>';
}
function ul(arr){return (arr&&arr.length)?'<ul class="cl">'+arr.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>':'<span class="hint">—</span>'}
function dirRows(list){
  var T=buildTree(list),out=[];
  function walk(a,team){out.push({a:a,team:team});(T.kids[a.id]||[]).forEach(function(k){walk(k,team)})}
  T.roots.forEach(function(r){walk(r,r.name)});
  var q=S.q.trim().toLowerCase();
  return out.filter(function(x){
    var a=x.a,m=modelOf(a);
    if(S.dirTeam!=='all'&&x.team!==S.dirTeam)return false;
    if(S.dirModel!=='all'&&m.propId!==S.dirModel)return false;
    if(!q)return true;
    var blob=[a.name,a.role,a.purpose,a.reportsTo,a.handsOff,a.reads,x.team,(a.responsibilities||[]).join(' '),(a.may||[]).join(' '),(a.mustNot||[]).join(' '),(a.tools||[]).join(' '),(a.docs||[]).map(function(d){return d.title}).join(' '),(a.skills||[]).map(function(d){return d.name}).join(' ')].join(' ').toLowerCase();
    return blob.indexOf(q)>=0;
  });
}
function ulN(arr,n){
  if(!arr||!arr.length)return '<span class="hint">—</span>';
  var sh=n?arr.slice(0,n):arr,more=n&&arr.length>n?'<li class="hint">+'+(arr.length-n)+' more in the profile</li>':'';
  return '<ul class="cl'+(n?' cl1':'')+'" style="max-height:none">'+sh.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+more+'</ul>';
}
function directoryView(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var all=dirRows(list.slice()),T=buildTree(list),teams=T.roots.map(function(r){return r.name}),full=!!S.dirFull;
  var h='<div class="toolbar"><input type="text" id="q" data-q placeholder="Search anyone, any duty, tool or document" aria-label="Search" value="'+esc(S.q)+'">'
   +'<select data-dirf="team" aria-label="Team" id="dirteam"><option value="all">All teams</option>'+teams.map(function(t){return '<option value="'+esc(t)+'"'+(S.dirTeam===t?' selected':'')+'>'+esc(t)+'</option>'}).join('')+'</select>'
   +'<select data-dirf="model" aria-label="Model" id="dirmodel">'+[['all','Any planned model']].concat(modelList().map(function(x){return [x.id,x.name]})).map(function(o){return '<option value="'+o[0]+'"'+(S.dirModel===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select>'
   +'<span class="seg" role="group" aria-label="Layout"><button class="btn small" data-act="dirview" data-view="people" aria-pressed="'+(S.dirView!=='sheet')+'">People</button><button class="btn small" data-act="dirview" data-view="sheet" aria-pressed="'+(S.dirView==='sheet')+'">Spreadsheet</button></span>'
   +'<button class="btn small" data-act="tab" data-tab="connect">Connections</button>'+(S.dirView==='sheet'?'<button class="btn small" data-act="dirfull">'+(full?'Show fewer columns':'Show every column')+'</button>':'')
   +(DL?'<button class="btn small" data-act="dircsv">Download CSV</button>':'')+'</div>';
  var m=S.models;
  h+='<p class="dir-count">'+all.length+' of '+list.length+' shown'+(m?' · Model now: '+esc(m.today)+'. Planned models come from PR #'+esc(m.pr)+' ('+esc(m.prState)+').':'')+(S.dirView==='sheet'?' · Click a name for the full profile.':' · Pick someone on the left.')+'</p>';
  if(S.dirView!=='sheet')return h+peopleView(all);
  var rows=all.map(function(x,k){
    var a=x.a,id=esc(a.id),md=modelOf(a),g=a.progress,n=full?0:3;
    return '<tr><td class="rn">'+(k+1)+'</td><td class="name stick"><button class="nm" data-act="open-agent" data-id="'+id+'">'+esc(a.name)+'</button><small class="hint" style="display:block">'+esc(a.role||'')+'</small></td>'
     +'<td style="width:150px">'+esc(x.team)+'</td><td style="width:140px">'+esc(a.reportsTo||'—')+'</td><td style="width:70px">'+esc(statusLabel(a.status))+'</td>'
     +'<td>'+modelSel(a,'now')+'</td><td>'+modelSel(a,'prop')+'</td>'
     +'<td style="min-width:260px"><div'+(full?'':' class="clamp3"')+'>'+esc(a.purpose||'')+'</div></td>'
     +'<td style="min-width:300px">'+ulN(a.responsibilities,n)+'</td>'
     +(full?'<td style="min-width:240px">'+ulN(a.may)+'</td><td style="min-width:240px">'+ulN(a.mustNot)+'</td><td>'+esc(a.handsOff||'—')+'</td><td style="min-width:200px">'+esc(a.reads||'—')+'</td><td>'+ulN(a.tools)+'</td>':'')
     +'<td>'+ulN((a.skills||[]).map(function(z){return z.name}),n)+'</td><td>'+ulN((a.routines||[]).map(function(z){return z.name+' ('+(z.cadence||'no cadence')+')'}),n)+'</td>'
     +'<td class="mono">'+(g&&g.pct!=null?g.pct+'%':'—')+'</td>'
     +'<td class="act"><button class="btn small" data-act="edit-open" data-id="'+id+'">Edit</button> <button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button></td></tr>';
  }).join('');
  var cols=19-(full?0:5);
  return h+'<div class="sheetwrap"><table class="sheet dir"><thead><tr><th class="rn">#</th><th class="stick">Name and title</th><th>Team</th><th>Reports to</th><th>Status</th><th>Model now</th><th>Model planned</th><th>Mission</th><th>Responsibilities</th>'
   +(full?'<th>May</th><th>Must not</th><th>Hands off to</th><th>Reads first</th><th>Tools</th>':'')+'<th>Skills</th><th>Routines</th><th>Done</th><th></th></tr></thead><tbody>'+(rows||'<tr><td></td><td colspan="'+cols+'" class="hint">No one matches.</td></tr>')+'</tbody></table></div>'
   +'<p class="hint">Change anything with Edit, or pick a model straight from the table. Skills, routines, memory and docs are edited in the profile. These are records on this page: they do not change the real role files. Real runs follow the role file, and changing a role file is a founder-only PR.</p>';
}
function initials(n){var w=String(n||'').replace(/\(.*?\)/g,' ').split(/[^A-Za-z]+/).filter(Boolean);return ((w[0]||'?').charAt(0)+(w[1]||'').charAt(0)).toUpperCase()}
function shortModel(id){return mn(id).replace(/^Claude\s+/,'')}
function pcSec(t,body){return '<section class="pc-s"><h4>'+t+'</h4>'+body+'</section>'}
function personCard(a,team){
  var id=esc(a.id),g=a.progress;
  var h='<div class="pc-head"><span class="av lg">'+esc(initials(a.name))+'</span><div class="grow"><h3>'+esc(a.name)+'</h3><p class="hint">'+esc(a.role||'')+'</p><p class="hint">'+esc(team)+(a.reportsTo?' · reports to '+esc(a.reportsTo):'')+'</p></div>'
   +'<div class="btns"><button class="btn small" data-act="edit-open" data-id="'+id+'">Edit</button><button class="btn small" data-act="open-agent" data-id="'+id+'">Full profile</button><button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button></div></div>';
  h+='<div class="pc-facts"><div><span>Status</span><select class="cell" id="pcs-'+id+'" data-status="'+id+'" aria-label="Status">'+['active','paused','draft'].map(function(o){return '<option value="'+o+'"'+((a.status||'active')===o?' selected':'')+'>'+statusLabel(o)+'</option>'}).join('')+'</select></div>'
   +'<div><span>Model now</span>'+modelSel(a,'now')+'</div><div><span>Model planned</span>'+modelSel(a,'prop')+'</div>'
   +'<div><span>Work done</span><b>'+(g&&g.pct!=null?g.pct+'% ('+g.done+' of '+g.assigned+')':'No tickets of its own')+'</b></div>'
   +'<div><span>Last active</span><b>'+(g&&g.lastActive?esc(g.lastActive)+(g.idleDays!=null?' · '+g.idleDays+' days ago':''):'No record')+'</b></div></div>';
  if(a.purpose)h+=pcSec('Mission','<p>'+esc(a.purpose)+'</p>');
  if(g&&(g.reasons||[]).length)h+=pcSec('Why work is pending',ulN(g.reasons));
  h+='<div class="pc-cols">'+pcSec('Responsibilities',ulN(a.responsibilities))+'<div style="display:flex;flex-direction:column;gap:18px">'+pcSec('May',ulN(a.may))+pcSec('Must not',ulN(a.mustNot))+'</div></div>';
  h+='<div class="pc-cols">'+pcSec('Hands off to','<p>'+esc(a.handsOff||'—')+'</p>')+pcSec('Reads at the start of a run','<p>'+esc(a.reads||'—')+'</p>')+'</div>';
  h+=pcSec('Tools and access',(a.tools||[]).length?'<div class="chips">'+a.tools.map(function(x){return '<span class="chip">'+esc(x)+'</span>'}).join('')+'</div>':'<span class="hint">—</span>');
  var ap=appliedTo(a);
  h+=pcSec('Guardrails and capabilities that apply',(ap.rules.length||ap.items.length)?'<ul class="cl" style="max-height:none">'+ap.rules.map(function(r){return '<li><b>'+ruleLabel(r.type)+':</b> '+esc(r.text)+'</li>'}).join('')+ap.items.map(function(x){return '<li><b>'+kindLabel(x.kind)+':</b> '+esc(x.name)+' <span class="hint">('+esc(x.status)+')</span></li>'}).join('')+'</ul>':'<span class="hint">Nothing set. Add some on the Capabilities page.</span>');
  h+='<div class="pc-cols">'+pcSec('Skills',ulN((a.skills||[]).map(function(z){return z.name+(z.note?': '+z.note:'')})))+pcSec('Routines',ulN((a.routines||[]).map(function(z){return z.name+' · '+(z.cadence||'no cadence')+' · '+(z.state||'planned')})))+'</div>';
  h+='<div class="pc-cols">'+pcSec('Memory',ulN((a.memory||[]).map(function(z){return z.text})))+pcSec('Docs',ulN((a.docs||[]).map(function(z){return z.title+(z.path?' ['+z.path+']':'')})))+'</div>';
  return h;
}
function peopleView(all){
  if(!all.length)return '<div class="empty"><h3>No one matches</h3><p>Clear the search or the filters.</p></div>';
  var sel=all.filter(function(x){return x.a.id===S.dirSel})[0]||all[0],last=null,L='';
  all.forEach(function(x){
    if(x.team!==last){last=x.team;L+='<div class="pp-team">'+esc(x.team)+'</div>'}
    var a=x.a,o=modelOf(a),on=a.id===sel.a.id;
    L+='<button class="pp-item'+(on?' on':'')+'" data-act="dirsel" data-id="'+esc(a.id)+'" aria-pressed="'+on+'"><span class="av">'+esc(initials(a.name))+'</span><span class="pn"><b>'+esc(a.name)+'</b><small>'+esc(a.level||'')+(a.status&&a.status!=='active'?' · '+statusLabel(a.status):'')+'</small></span>'+(o.nowId?mdlChip(shortModel(o.nowId)):'')+'</button>';
  });
  return '<div class="pp"><div class="pp-list">'+L+'</div><div class="pp-card" id="pp-card">'+personCard(sel.a,sel.team)+'</div></div>';
}
function exportDirCSV(){
  if(!DL)return;
  var rows=[['Name','Title','Level','Team','Reports to','Status','Model now','Model planned','Mission','Responsibilities','May','Must not','Hands off to','Reads first','Tools','Skills','Routines','Tickets done','Tickets total']];
  dirRows(agentsOf(S.scope)).forEach(function(x){var a=x.a,m=modelOf(a),g=a.progress||{};
    rows.push([a.name,a.role||'',a.level||'',x.team,a.reportsTo||'',statusLabel(a.status),m.now,m.prop,a.purpose||'',(a.responsibilities||[]).join(' | '),(a.may||[]).join(' | '),(a.mustNot||[]).join(' | '),a.handsOff||'',a.reads||'',(a.tools||[]).join(', '),(a.skills||[]).map(function(z){return z.name}).join(', '),(a.routines||[]).map(function(z){return z.name+' ('+(z.cadence||'')+')'}).join(' | '),g.done==null?'':g.done,g.assigned==null?'':g.assigned])});
  var csv='\ufeff'+rows.map(function(r){return r.map(csvCell).join(',')}).join('\r\n');
  DL.save({filename:'agent-directory.csv',data:csv}).then(function(){toast('Saved the directory as CSV')},function(e){if(!e||e.code!=='declined')toast('Could not save the file here.')});
}

/* ---------- tracker ---------- */
function closedOn(t){var m=/Closed (\d{4}-\d{2}-\d{2})/.exec(t.note||'');return m?m[1]:''}
function dayDiff(a,b){return Math.round((new Date(a+'T00:00:00')-new Date(b+'T00:00:00'))/864e5)}
function addDays(s0,n){var d=new Date(s0+'T00:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function fmtShort(s0){return new Date(s0+'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})}
function trackerView(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var td=today(),items=[];
  list.forEach(function(a){(a.todos||[]).forEach(function(t){items.push({a:a,t:t,c:closedOn(t)})})});
  var total=items.length,done=items.filter(function(x){return x.t.status==='done'}),open=items.filter(function(x){return x.t.status!=='done'});
  var isBl=function(x){return isBlocked(x.t)||/^Blocked/.test(x.t.note||'')};
  var blocked=open.filter(isBl),doing=open.filter(function(x){return x.t.status==='doing'}),needs=open.filter(function(x){return /Needs the founder/i.test(x.t.note||'')}),ready=open.filter(function(x){return /^Ready/.test(x.t.note||'')&&!isBl(x)});
  var dates=done.map(function(x){return x.c}).filter(Boolean).sort(),last=dates.length?dates[dates.length-1]:'';
  var c7=dates.filter(function(d){return dayDiff(td,d)<7}).length,c14=dates.filter(function(d){return dayDiff(td,d)<14}).length;
  var pct=total?Math.round(100*done.length/total):0,perWeek=c14/2,idle=last?dayDiff(td,last):null;
  var byDay={};dates.forEach(function(d){byDay[d]=(byDay[d]||0)+1});
  var peakDay=Object.keys(byDay).sort(function(x,y){return byDay[y]-byDay[x]})[0];
  var eta=perWeek>0?'About '+Math.max(1,Math.ceil(open.length/perWeek))+' week'+(Math.ceil(open.length/perWeek)>1?'s':'')+' at the last two weeks\' pace':(last?'No estimate: nothing has closed for '+idle+' days':'No estimate: nothing has closed yet');
  var rp=S.report||{};
  var h='<div class="trk"><div class="ov-hero'+(c7?' ok':'')+'"><h2>'+(c7?c7+' ticket'+(c7>1?'s':'')+' closed in the last 7 days.':(last?'Nothing has closed for '+idle+' days.':'Nothing has closed yet.'))+'</h2><p>'+done.length+' of '+total+' done ('+pct+'%). '+open.length+' still open, '+blocked.length+' of them stuck behind something else. '+esc(eta)+'.</p></div>';
  h+='<div class="trk-tiles">'
   +'<div class="ov-tile"><b>'+pct+'%</b><span>complete ('+done.length+' of '+total+')</span></div>'
   +'<div class="ov-tile"><b>'+open.length+'</b><span>pending</span></div>'
   +'<div class="ov-tile"><b>'+doing.length+'</b><span>in progress</span></div>'
   +'<div class="ov-tile"><b>'+blocked.length+'</b><span>blocked</span></div>'
   +'<div class="ov-tile"><b>'+c7+'</b><span>closed in last 7 days</span></div>'
   +'<div class="ov-tile"><b>'+(peakDay?byDay[peakDay]:0)+'</b><span>best day'+(peakDay?' ('+fmtShort(peakDay)+')':'')+'</span></div>'
   +'<div class="ov-tile"><b>'+(perWeek?perWeek.toFixed(1):'0')+'</b><span>per week, last 2 weeks</span></div>'
   +'<div class="ov-tile"><b>'+(idle==null?'—':idle)+'</b><span>days since last close</span></div></div>';
  var bars=[],mx=1,i;
  for(i=27;i>=0;i--){var d=addDays(td,-i),n=byDay[d]||0;if(n>mx)mx=n;bars.push([d,n])}
  h+='<div><h3 class="sh">Tickets closed per day, last 28 days</h3><div class="spark" role="img" aria-label="Bar chart of tickets closed per day">'+bars.map(function(b){return '<i class="'+(b[1]?'':'z')+'" style="height:'+(b[1]?Math.max(6,Math.round(100*b[1]/mx)):2)+'%" title="'+fmtShort(b[0])+': '+b[1]+' closed"></i>'}).join('')+'</div><div class="sparkx"><span>'+fmtShort(bars[0][0])+'</span><span>peak '+mx+' a day</span><span>'+fmtShort(td)+'</span></div></div>';
  var T=buildTree(list),tm='';
  T.roots.forEach(function(r){
    var a2=0,d2=0,b2=0,k7=0,l2='',n=0;
    (function walk(a){n++;(a.todos||[]).forEach(function(t){a2++;if(t.status==='done'){d2++;var c=closedOn(t);if(c){if(dayDiff(td,c)<7)k7++;if(c>l2)l2=c}}else if(isBlocked(t)||/^Blocked/.test(t.note||''))b2++});(T.kids[a.id]||[]).forEach(walk)})(r);
    var p2=a2?Math.round(100*d2/a2):null;
    tm+='<div class="cd"><div class="cd-h"><div class="grow"><h3>'+esc(r.name)+'</h3><span class="hint">'+n+' agent'+(n>1?'s':'')+'</span></div><b class="mono '+tone(p2)+'">'+(p2==null?'—':p2+'%')+'</b></div>'+barHTML(p2)
     +'<span class="hint">'+(a2?d2+' of '+a2+' done · '+(a2-d2)+' pending'+(b2?' · '+b2+' blocked':'')+' · '+k7+' closed this week'+(l2?' · last close '+fmtShort(l2):''):'No tickets assigned')+'</span></div>';
  });
  h+='<div><h3 class="sh">By team</h3><div class="gc">'+tm+'</div></div>';
  function lst(title,arr,empty){return '<div class="cd"><div class="cd-h"><div class="grow"><h3>'+title+'</h3></div><b class="mono">'+arr.length+'</b></div>'+(arr.length?'<ul class="cl" style="max-height:260px">'+arr.slice(0,12).map(function(x){return '<li>'+esc(x.t.text)+' <span class="hint">· '+esc(x.a.name)+(x.t.note?' · '+esc(x.t.note):'')+'</span></li>'}).join('')+(arr.length>12?'<li class="hint">+'+(arr.length-12)+' more in Todos</li>':'')+'</ul>':'<span class="hint">'+empty+'</span>')+'</div>'}
  h+='<div><h3 class="sh">Pending work</h3><div class="gc">'+lst('Needs you',needs,'Nothing waiting on you.')+lst('In progress',doing,'Nothing in progress.')+lst('Ready to start',ready,'Nothing ready.')+lst('Blocked',blocked,'Nothing blocked.')+'</div></div>';
  h+='<p class="hint">Numbers come from each agent\'s tickets and the dates GitHub recorded when they closed, as of '+esc(rp.asOf||'the last status snapshot')+'. This page does not poll GitHub by itself, so it moves when the snapshot is refreshed. Speed is closed tickets per day or week; opened dates are not recorded, so there is no cycle time.</p></div>';
  return h;
}
function overviewView(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var rp=S.report||{},T=buildTree(list),A=0,D=0,O=0,idle=0,blocked=0;
  list.forEach(function(a){var g=a.progress;if(!g)return;A+=g.assigned;D+=g.done;O+=g.open;if(g.idleDays>idle)idle=g.idleDays;(a.todos||[]).forEach(function(t){if(/^Blocked/.test(t.note||''))blocked++})});
  var pct=A?Math.round(100*D/A):0,stalled=idle>7&&O>0;
  var h='<div class="ov"><div class="ov-hero'+(stalled?'':' ok')+'"><h2>'+esc(rp.headline||(A?D+' of '+A+' tickets are done ('+pct+'%).':'No work recorded yet.'))+'</h2><p>'+esc(rp.sub||'')+'</p></div>';
  h+='<div class="ov-tiles"><div class="ov-tile"><b>'+pct+'%</b><span>of tickets done ('+D+' of '+A+')</span></div>'
   +'<div class="ov-tile"><b>'+O+'</b><span>still open</span></div>'
   +'<div class="ov-tile"><b>'+blocked+'</b><span>stuck behind something else</span></div>'
   +'<div class="ov-tile"><b class="'+(stalled?'bad':'')+'">'+(idle||'—')+'</b><span>days since any agent worked</span></div></div>';
  if(rp.needsYou&&rp.needsYou.length)h+='<div><h3>What needs you</h3><ol class="ov-need">'+rp.needsYou.map(function(x){return '<li><b>'+esc(x.title)+'</b>'+esc(x.why||'')+'</li>'}).join('')+'</ol></div>';
  h+='<div><h3>How each team is doing</h3><div class="ov-teams">';
  T.roots.forEach(function(r){
    var a2=0,d2=0,o2=0,n=0,id2=0;
    (function walk(a){var g=a.progress||{};a2+=g.assigned||0;d2+=g.done||0;o2+=g.open||0;n++;if(g.idleDays>id2)id2=g.idleDays;(T.kids[a.id]||[]).forEach(walk)})(r);
    var p2=a2?Math.round(100*d2/a2):null,lab,cl,line;
    if(!a2){lab='No tickets yet';cl='mute';line='Nothing assigned to this team so far.'}
    else if(p2>=70){lab='Going well';cl='ok';line=d2+' of '+a2+' done, '+o2+' left.'}
    else if(id2>7){lab='Stalled';cl='bad';line=d2+' of '+a2+' done, '+o2+' left. Idle '+id2+' days.'}
    else if(!d2&&o2){lab='Waiting';cl='warn';line='0 of '+a2+' done. Nothing started yet.'}
    else{lab='In progress';cl='warn';line=d2+' of '+a2+' done.'}
    h+='<div class="ov-team"><div class="t">'+esc(r.name)+'<small>'+n+' agent'+(n>1?'s':'')+'</small></div>'
     +'<div class="pc"><div class="bar t-'+(cl==='ok'?'ok':cl==='bad'?'bad':cl==='warn'?'warn':'')+'"><i style="width:'+(p2==null?0:p2)+'%"></i></div><span>'+esc(line)+'</span></div>'
     +'<span class="pill '+cl+'">'+lab+'</span></div>';
  });
  h+='</div></div><div class="ov-go"><button class="btn primary" data-act="tab" data-tab="report">See every agent in detail</button><button class="btn" data-act="tab" data-tab="agents">Open the team tree</button><button class="btn" data-act="tab" data-tab="tasks">See all todos</button></div></div>';
  return h;
}
function reportSheet(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var rp=S.report,h='';
  var rows=list.filter(function(a){return a.progress}).slice().sort(function(x,y){return (y.progress.assigned-x.progress.assigned)||String(x.name).localeCompare(String(y.name))});
  var A=0,D=0;rows.forEach(function(a){A+=a.progress.assigned;D+=a.progress.done});
  if(rp&&rp.facts&&rp.facts.length)h+='<div class="block"><h2>Where things stand · '+esc(rp.asOf||'')+'</h2><ul class="plain">'+rp.facts.map(function(f){return '<li>'+esc(f)+'</li>'}).join('')+'</ul>'
    +'<p class="hint">Across roles: '+D+' of '+A+' tickets done ('+(A?Math.round(100*D/A):0)+'%). Source: GitHub issues, pull requests and docs/logs.md. No agent run has been seen since 11 Oct.</p></div>';
  var body=rows.map(function(a,k){
    var g=a.progress,id=esc(a.id),tm=g.team?'<small class="mono" style="display:block;color:var(--muted)">team: '+g.team.done+' of '+g.team.assigned+' done</small>':'';
    return '<tr class="'+(g.idleDays>7&&g.open?'hot':'')+'"><td class="rn">'+(k+1)+'</td><td class="name"><button class="nm" data-act="chat-open" data-id="'+id+'" title="Talk to this agent">'+esc(a.name)+'</button>'+tm+'</td><td>'+esc(a.level||'')+'</td>'
     +'<td class="detail" style="min-width:240px">'+esc(String(a.purpose||'').slice(0,150))+'</td><td class="mono">'+g.assigned+'</td><td class="mono">'+g.done+'</td><td class="mono">'+g.open+'</td>'
     +'<td class="mono '+tone(g.pct)+'">'+(g.pct==null?'—':g.pct+'%')+'</td><td class="mono">'+esc(g.lastActive||'never')+'</td><td class="mono'+(g.idleDays>7?' bad':'')+'">'+(g.idleDays==null?'—':g.idleDays)+'</td>'
     +'<td class="detail" style="min-width:420px">'+esc((g.reasons||[]).join('; '))+'</td></tr>';
  }).join('');
  return toolbarHTML(false).replace(/<input[^>]*data-q[^>]*>/,'').replace(/<select[^>]*data-flt[\s\S]*?<\/select>/,'')+h
   +sheetBlock('Status by agent',['Agent','Level','Meant to do','Tickets','Done','Open','% done','Last active','Idle days','Why pending'],body);
}
function libSheet(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var r1='',m1='',d1='',s1='',a1=0,b1=0,c1=0,e1=0;
  list.slice().sort(sortAg).forEach(function(a){
    (a.routines||[]).forEach(function(x,i){a1++;r1+='<tr class="'+(routineLate(x)?'hot':'')+'"><td class="rn">'+a1+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.name)+'</td><td>'+esc(x.cadence||'')+'</td><td>'+routineSel(a.id,i,x.state)+'</td><td>'+dateInput('routine',a.id,i,x.next)+'</td><td class="detail">'+esc(x.note||'')+'</td></tr>'});
    (a.memory||[]).forEach(function(x){b1++;m1+='<tr><td class="rn">'+b1+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.text)+'</td><td class="mono">'+esc(x.at||'')+'</td><td>'+esc(x.src||'')+'</td></tr>'});
    (a.docs||[]).forEach(function(x){c1++;d1+='<tr><td class="rn">'+c1+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.title)+'</td><td class="mono">'+esc(x.path||'')+'</td><td class="detail">'+esc(x.note||'')+'</td></tr>'});
    (a.skills||[]).forEach(function(x){e1++;s1+='<tr><td class="rn">'+e1+'</td><td>'+esc(a.name)+'</td><td class="name">'+esc(x.name)+'</td><td class="detail">'+esc(x.note||'')+'</td></tr>'});
  });
  return toolbarHTML(false).replace(/<input[^>]*data-q[^>]*>/,'').replace(/<select[^>]*data-flt[\s\S]*?<\/select>/,'')
   +'<div style="display:flex;flex-direction:column;gap:18px">'
   +sheetBlock('Routines',['Agent','Routine','Cadence','State','Next run','Note'],r1)
   +sheetBlock('Memory',['Agent','Note','Added','Source'],m1)
   +sheetBlock('Docs',['Agent','Doc','Path or link','Note'],d1)
   +sheetBlock('Skills',['Agent','Skill','What it does'],s1)
   +'</div><p class="hint">Routines here are a register: a state and a next-run date you set. Nothing on this page runs them. Add or remove items in each agent\'s profile.</p>';
}
function isSheet(tab){return S.views[tab]==='sheet'}
function vsw(tab,label,extra){
  return '<div class="vrow"><span class="seg" role="group" aria-label="Layout"><button class="btn small" data-act="vw" data-tab="'+tab+'" data-view="cards" aria-pressed="'+!isSheet(tab)+'">'+esc(label)+'</button><button class="btn small" data-act="vw" data-tab="'+tab+'" data-view="sheet" aria-pressed="'+isSheet(tab)+'">Spreadsheet</button></span>'+(extra||'')+'</div>';
}
function rosterView(list){return vsw('agents','Teams')+(isSheet('agents')?rosterSheet(list):rosterCards(list))}
function reportView(list){return vsw('report','Cards')+(isSheet('report')?reportSheet(list):reportCards(list))}
function stripBar(h){return h.replace(/<input[^>]*data-q[^>]*>/,'').replace(/<select[^>]*data-flt[\s\S]*?<\/select>/,'')}
function barHTML(p){return '<div class="'+tone(p)+'"><div class="bar"><i style="width:'+(p||0)+'%"></i></div></div>'}
function rosterCards(list){
  if(!S.loaded)return '<p class="hint">Loading agents…</p>';
  if(!list.length)return emptyHTML();
  var T=buildTree(list),out='';
  T.roots.forEach(function(r){
    var mem=[];(function w(a,d){mem.push({a:a,d:d});(T.kids[a.id]||[]).forEach(function(k){w(k,d+1)})})(r,0);
    mem=mem.filter(function(x){return passF(x.a)});if(!mem.length)return;
    var A=0,D=0,late=0;mem.forEach(function(x){var g=x.a.progress;if(g){A+=g.assigned;D+=g.done}late+=lateCount(x.a)});
    var p=A?Math.round(100*D/A):null;
    out+='<div class="cd"><div class="cd-h"><div class="grow"><h3>'+esc(r.name)+'</h3><span class="hint">'+mem.length+' agent'+(mem.length>1?'s':'')+' · '+(A?D+' of '+A+' tickets done':'no tickets')+(late?' · <span class="bad">'+late+' late</span>':'')+'</span></div><b class="mono '+tone(p)+'">'+(p==null?'—':p+'%')+'</b></div>'+barHTML(p)
     +mem.map(function(x){var a=x.a,o=modelOf(a),id=esc(a.id),g=a.progress,lt=lateCount(a);
       return '<div class="mrow" style="padding-left:'+(x.d*14)+'px"><div style="min-width:0"><button class="nm" data-act="open-agent" data-id="'+id+'">'+esc(a.name)+'</button><small class="hint" style="display:block">'+esc(a.level||'')+(a.status&&a.status!=='active'?' · '+statusLabel(a.status):'')+(g&&g.pct!=null?' · '+g.pct+'% done':'')+(lt?' · <span class="bad">'+lt+' late</span>':'')+'</small></div>'+(o.nowId?mdlChip(shortModel(o.nowId)):'<span></span>')+'<button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button></div>'}).join('')+'</div>';
  });
  return toolbarHTML(false)+(out?'<div class="gc">'+out+'</div>':'<div class="empty"><h3>Nothing matches</h3><p>Clear the search or change the filter.</p></div>')+'<p class="hint">Each card is a team. Click a name for the full profile.</p>';
}
function todosCards(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  var items=[],q=S.q.trim().toLowerCase();
  list.forEach(function(a){(a.todos||[]).forEach(function(t,i){items.push({a:a,t:t,i:i})})});
  items=items.filter(function(x){
    if(S.flt==='attention'&&!(isLate('todo',x.t)||isBlocked(x.t)))return false;
    if(S.flt==='active'&&x.a.status!=='active')return false;
    if(S.flt==='draft'&&x.a.status!=='draft')return false;
    if(q&&(x.t.text+' '+x.a.name).toLowerCase().indexOf(q)<0)return false;
    return true;
  });
  if(!items.length)return toolbarHTML(false)+(list.length?'<div class="empty"><h3>No todos match</h3><p>Clear the search or change the filter.</p></div>':emptyHTML());
  var cols=[['todo','To do'],['doing','In progress'],['done','Done']],h=toolbarHTML(false)+'<div class="kan">';
  cols.forEach(function(c){
    var its=items.filter(function(x){return (x.t.status||'todo')===c[0]});
    its.sort(function(x,y){var lx=isLate('todo',x.t)?0:1,ly=isLate('todo',y.t)?0:1;return lx-ly||String(x.t.due||'9999').localeCompare(String(y.t.due||'9999'))||String(x.a.name).localeCompare(String(y.a.name))});
    h+='<div class="kcol"><h3>'+c[1]+' · '+its.length+'</h3>'+its.slice(0,50).map(function(x){
      var id=esc(x.a.id),late=isLate('todo',x.t);
      return '<div class="kc'+(late?' hot':'')+'"><p'+(isBlocked(x.t)?' class="blocked"':'')+'>'+esc(x.t.text)+'</p><div class="meta"><button class="nm" data-act="chat-open" data-id="'+id+'" title="Talk to this agent">'+esc(x.a.name)+'</button><span>'+esc(shortName(x.a.projectId))+'</span></div>'
       +(x.t.note?'<small class="hint">'+esc(x.t.note)+'</small>':'')
       +'<div class="meta"><select class="cell" id="ts-'+id+'-'+x.i+'" data-set="todo" data-f="status" data-id="'+id+'" data-i="'+x.i+'" aria-label="Todo status">'+cols.map(function(o){return '<option value="'+o[0]+'"'+((x.t.status||'todo')===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select>'+dateInput('todo',x.a.id,x.i,x.t.due)+(late?'<b class="bad">Late</b>':'')+'</div></div>';
    }).join('')+(its.length>50?'<p class="hint">+'+(its.length-50)+' more. Narrow with search or the filter.</p>':'')+(its.length?'':'<p class="hint">Nothing here.</p>')+'</div>';
  });
  return h+'</div>';
}
function scoreCards(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var out='';
  list.slice().sort(sortAg).forEach(function(a){
    if(!(a.goals||[]).length&&!(a.kras||[]).length&&!(a.kpis||[]).length)return;
    var id=esc(a.id),p=agentPct(a);
    out+='<div class="cd'+(lateCount(a)?' hot':'')+'"><div class="cd-h"><div class="grow"><button class="nm" data-act="open-agent" data-id="'+id+'">'+esc(a.name)+'</button><small class="hint" style="display:block">'+esc(a.role||'')+'</small></div><b class="mono '+tone(p)+'">'+(p==null?'':p+'%')+'</b></div>'
     +((a.goals||[]).length?pcSec('Goals',ulN((a.goals||[]).map(function(g){return (g.done?'✓ ':isLate('goal',g)?'Late: ':'')+g.text+(g.due?' (due '+g.due+')':'')}))):'')
     +((a.kras||[]).length?pcSec('Key result areas',ulN((a.kras||[]).map(function(k){return k.area+' · '+k.weight+'%: '+k.outcome}))):'')
     +((a.kpis||[]).length?pcSec('KPIs',(a.kpis||[]).map(function(k){var pc=kpiPct(k);return '<div style="margin-bottom:8px"><div class="rowline" style="padding:4px 0;border:0;background:none"><span class="grow">'+esc(k.name)+'<small>'+(k.target==null||k.target===''?'target not set':(k.dir==='down'?'≤ ':'≥ ')+esc(fmtNum(k.target))+' '+esc(k.unit||''))+(k.current==null?' · no reading':' · now '+esc(fmtNum(k.current)))+'</small></span><b class="mono '+tone(pc)+'">'+(pc==null?'—':pc+'%')+'</b></div>'+barHTML(pc)+'</div>'}).join('')):'')+'</div>';
  });
  return stripBar(toolbarHTML(false))+(out?'<div class="gc">'+out+'</div>':'<div class="empty"><h3>No goals, KRAs or KPIs yet</h3><p>Add them in an agent\'s profile, or ask the agent in chat to propose them.</p></div>');
}
function reportCards(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var rp=S.report,h='',rows=list.filter(function(a){return a.progress}).slice().sort(function(x,y){return (y.progress.assigned-x.progress.assigned)||String(x.name).localeCompare(String(y.name))});
  var A=0,D=0;rows.forEach(function(a){A+=a.progress.assigned;D+=a.progress.done});
  if(rp&&rp.facts&&rp.facts.length)h+='<div class="block"><h2>Where things stand · '+esc(rp.asOf||'')+'</h2><ul class="plain">'+rp.facts.map(function(f){return '<li>'+esc(f)+'</li>'}).join('')+'</ul><p class="hint">Across roles: '+D+' of '+A+' tickets done ('+(A?Math.round(100*D/A):0)+'%). Source: GitHub issues, pull requests and docs/logs.md.</p></div>';
  var out=rows.map(function(a){
    var g=a.progress,id=esc(a.id),stalled=g.idleDays>7&&g.open;
    return '<div class="cd'+(stalled?' hot':'')+'"><div class="cd-h"><div class="grow"><button class="nm" data-act="chat-open" data-id="'+id+'" title="Talk to this agent">'+esc(a.name)+'</button><small class="hint" style="display:block">'+esc(a.level||'')+'</small></div><b class="mono '+tone(g.pct)+'">'+(g.pct==null?'—':g.pct+'%')+'</b></div>'+barHTML(g.pct)
     +'<div class="meta hint">'+g.done+' of '+g.assigned+' done · '+g.open+' open · last active '+esc(g.lastActive||'never')+(g.idleDays!=null?' ('+g.idleDays+' days ago)':'')+(g.team?' · team '+g.team.done+' of '+g.team.assigned:'')+'</div>'
     +pcSec('Meant to do','<p>'+esc(String(a.purpose||'').slice(0,160))+'</p>')
     +((g.reasons||[]).length?pcSec('Why pending',ulN(g.reasons)):'')+'</div>';
  }).join('');
  return stripBar(toolbarHTML(false))+h+(out?'<div class="gc">'+out+'</div>':'<div class="empty"><h3>No records</h3></div>');
}
function libCards(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var out='';
  list.slice().sort(sortAg).forEach(function(a){
    if(!libCount(a))return;var id=esc(a.id);
    out+='<div class="cd"><div class="cd-h"><div class="grow"><button class="nm" data-act="open-agent" data-id="'+id+'">'+esc(a.name)+'</button><small class="hint" style="display:block">'+(a.routines||[]).length+' routines · '+(a.memory||[]).length+' memory · '+(a.docs||[]).length+' docs · '+(a.skills||[]).length+' skills</small></div></div>'
     +((a.routines||[]).length?pcSec('Routines',ul((a.routines||[]).map(function(x){return x.name+' · '+(x.cadence||'no cadence')+' · '+(x.state||'planned')+(x.next?' · next '+x.next:'')}))):'')
     +((a.memory||[]).length?pcSec('Memory',ul((a.memory||[]).map(function(x){return x.text}))):'')
     +((a.docs||[]).length?pcSec('Docs',ul((a.docs||[]).map(function(x){return x.title+(x.path?' ['+x.path+']':'')}))):'')
     +((a.skills||[]).length?pcSec('Skills',ul((a.skills||[]).map(function(x){return x.name+(x.note?': '+x.note:'')}))):'')+'</div>';
  });
  return stripBar(toolbarHTML(false))+(out?'<div class="gc">'+out+'</div>':'<div class="empty"><h3>Nothing in the library yet</h3><p>Add routines, memory, docs and skills in an agent\'s profile.</p></div>')+'<p class="hint">Routines here are a register: a state and a next-run date you set. Nothing on this page runs them.</p>';
}
var KINDS=[['skill','Skill'],['plugin','Plugin'],['mcp','Connector (MCP)'],['tool','Tool']];
var RTYPES=[['never','Never'],['ask','Ask first'],['always','Always']];
function kindLabel(k){for(var i=0;i<KINDS.length;i++)if(KINDS[i][0]===k)return KINDS[i][1];return 'Skill'}
function ruleLabel(k){for(var i=0;i<RTYPES.length;i++)if(RTYPES[i][0]===k)return RTYPES[i][1];return 'Never'}
function defaultExt(){
  var fv='';S.repos.forEach(function(r){if(r.full_name.split('/')[1]==='familyvault')fv=rid(r)});
  var sc=fv?{mode:'project',projects:[fv]}:{mode:'all'};
  function g(id,t,ty){return {id:id,text:t,type:ty,scope:sc,src:'FamilyVault CLAUDE.md'}}
  return {items:[],rules:[
   g('g1','Keys live only in packages/crypto. No other code generates, stores, logs or sends keys.','never'),
   g('g2','Never log content: no document text, names, numbers, balances, passwords, tokens or message bodies.','never'),
   g('g3','Synthetic data only. No real user data, statements, IDs or messages in the repo, tests or issues.','never'),
   g('g4','No pay-per-use spending. The daily API spend cap is 0 rupees; use only fixed-cost or free services.','never'),
   g('g5','No secrets in the repo, docs, issues, pull requests or commit messages.','never'),
   g('g6','Never force-push or edit branch protection.','never'),
   g('g7','Founder-only paths (packages/crypto, CLAUDE.md, .github, docs/ops, docs/adr, docs/security) are merged by the founder.','ask'),
   g('g8','Work only from a status:ready issue, one ticket at a time.','always'),
   g('g9','At most 3 open pull requests at a time.','always')],seeded:true};
}
function ext(){return S.ext||defaultExt()}
function saveExt(E){S.ext=E;persist('meta','ext',E)}
function teamIndex(){var T=buildTree(S.agents),m={};T.roots.forEach(function(r){(function w(a){m[a.id]=r.name;(T.kids[a.id]||[]).forEach(w)})(r)});return m}
function allTeams(){var T=buildTree(S.agents),o=[];T.roots.forEach(function(r){if(o.indexOf(r.name)<0)o.push(r.name)});return o.sort()}
function applies(sc,a,tm){
  sc=sc||{mode:'all'};
  if(sc.mode==='all')return true;
  if(sc.mode==='project')return (sc.projects||[]).indexOf(a.projectId)>=0;
  if(sc.mode==='team')return (sc.teams||[]).indexOf(tm[a.id])>=0;
  if(sc.mode==='people')return (sc.people||[]).indexOf(a.id)>=0;
  return false;
}
function appliedTo(a){var E=ext(),tm=teamIndex();return {rules:E.rules.filter(function(r){return applies(r.scope,a,tm)}),items:E.items.filter(function(x){return x.status!=='off'&&applies(x.scope,a,tm)})}}
function scopeText(sc){
  sc=sc||{mode:'all'};
  if(sc.mode==='all')return 'Every agent';
  if(sc.mode==='project')return 'Project: '+((sc.projects||[]).map(shortName).join(', ')||'none chosen');
  if(sc.mode==='team')return 'Team: '+((sc.teams||[]).join(', ')||'none chosen');
  var nm=(sc.people||[]).map(function(id){var a=S.agents.filter(function(x){return x.id===id})[0];return a?a.name:null}).filter(Boolean);
  return nm.length?(nm.length<=2?nm.join(', '):nm.length+' people: '+nm.slice(0,2).join(', ')+'…'):'People: none chosen';
}
function countFor(sc){var tm=teamIndex();return S.agents.filter(function(a){return applies(sc,a,tm)}).length}
function runtimeLabel(r){return !r||r==='any'?'Any model':mn(r)}
function capView(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  var E=ext(),sub=[['catalog','Skills and plugins',E.items.length],['rules','Guardrails',E.rules.length],['tools','Tools in role files','']];
  var h='<div class="vrow"><span class="seg" role="group" aria-label="Section">'+sub.map(function(x){return '<button class="btn small" data-act="cap-tab" data-sub="'+x[0]+'" aria-pressed="'+(S.capTab===x[0])+'">'+x[1]+(x[2]!==''?' · '+x[2]:'')+'</button>'}).join('')+'</span>';
  if(S.capTab!=='tools')h+='<button class="btn primary small" data-act="x-new" data-kind="'+(S.capTab==='rules'?'rule':'item')+'">'+(S.capTab==='rules'?'Add a guardrail':'Add a skill or plugin')+'</button><span class="seg" role="group" aria-label="Layout"><button class="btn small" data-act="vw" data-tab="caps" data-view="cards" aria-pressed="'+!isSheet('caps')+'">Cards</button><button class="btn small" data-act="vw" data-tab="caps" data-view="sheet" aria-pressed="'+isSheet('caps')+'">Spreadsheet</button></span>';
  h+='</div><p class="hint" style="margin-bottom:12px">This is a register. Setting something here records it and shapes what agents say in chat on this page. It does not install anything or change role files in the repo. '+(S.ext?'':'Starter guardrails are copied from FamilyVault\'s CLAUDE.md (11 Oct) and are saved once you change anything.')+'</p>';
  if(S.capTab==='tools'){
    var cnt={};S.agents.forEach(function(a){(a.tools||[]).forEach(function(t){cnt[t]=(cnt[t]||0)+1})});
    var ks=Object.keys(cnt).sort(function(x,y){return cnt[y]-cnt[x]||x.localeCompare(y)});
    return h+'<div class="cd"><h3>Tools agents already have</h3><p class="hint">Read from the role files. To add or remove one for a person, use Edit on their Directory card.</p><div class="chips">'+(ks.map(function(k){return '<span class="chip">'+esc(k)+' · '+cnt[k]+'</span>'}).join('')||'<span class="hint">None recorded.</span>')+'</div></div>';
  }
  if(S.capTab==='rules'){
    if(!E.rules.length)return h+'<div class="empty"><h3>No guardrails yet</h3><p>A guardrail is a rule an agent must follow: never do this, ask first before that, always do this. Pick who it applies to.</p><button class="btn primary" data-act="x-new" data-kind="rule">Add a guardrail</button></div>';
    if(isSheet('caps'))return h+'<div class="sheetwrap"><table class="sheet" style="min-width:760px"><thead><tr><th>Type</th><th>Rule</th><th>Applies to</th><th>Agents</th><th>Source</th><th></th></tr></thead><tbody>'+E.rules.map(function(r){return '<tr><td>'+ruleLabel(r.type)+'</td><td class="name">'+esc(r.text)+'</td><td>'+esc(scopeText(r.scope))+'</td><td class="mono">'+countFor(r.scope)+'</td><td>'+esc(r.src||'You')+'</td><td class="act"><button class="btn small" data-act="x-edit" data-kind="rule" data-id="'+esc(r.id)+'">Edit</button></td></tr>'}).join('')+'</tbody></table></div>';
    RTYPES.forEach(function(t){
      var rs=E.rules.filter(function(r){return r.type===t[0]});if(!rs.length)return;
      h+='<div class="block" style="margin-bottom:16px"><h2>'+t[1]+' · '+rs.length+'</h2><div class="gc">'+rs.map(function(r){return xCard(r,'rule')}).join('')+'</div></div>';
    });
    return h;
  }
  if(!E.items.length)return h+'<div class="empty"><h3>No skills or plugins registered</h3><p>Register a skill, plugin, connector or tool, say which model runs it (Claude, Hermes, Codex or any), and choose who gets it: everyone, a project, a team or named people.</p><button class="btn primary" data-act="x-new" data-kind="item">Add a skill or plugin</button></div>';
  if(isSheet('caps'))return h+'<div class="sheetwrap"><table class="sheet" style="min-width:820px"><thead><tr><th>Name</th><th>Kind</th><th>Runs on</th><th>Status</th><th>Applies to</th><th>Agents</th><th>What it does</th><th></th></tr></thead><tbody>'+E.items.map(function(x){return '<tr><td class="name">'+esc(x.name)+'</td><td>'+kindLabel(x.kind)+'</td><td>'+esc(runtimeLabel(x.runtime))+'</td><td>'+esc(x.status)+'</td><td>'+esc(scopeText(x.scope))+'</td><td class="mono">'+countFor(x.scope)+'</td><td class="detail">'+esc(x.what||'')+'</td><td class="act"><button class="btn small" data-act="x-edit" data-kind="item" data-id="'+esc(x.id)+'">Edit</button></td></tr>'}).join('')+'</tbody></table></div>';
  return h+'<div class="gc">'+E.items.map(function(x){return xCard(x,'item')}).join('')+'</div>';
}
function xCard(x,kind){
  var id=esc(x.id),n=countFor(x.scope),del=S.xdel===x.id;
  var head=kind==='rule'?'<span class="pill '+(x.type==='never'?'bad':x.type==='ask'?'warn':'ok')+'">'+ruleLabel(x.type)+'</span>':'<span class="pill mute">'+kindLabel(x.kind)+'</span><span class="mdl">'+esc(runtimeLabel(x.runtime))+'</span>';
  return '<div class="cd"><div class="cd-h"><div class="grow" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+head+'</div>'
   +(kind==='item'?'<select class="cell" id="xs-'+id+'" data-xi="status" data-id="'+id+'" aria-label="Status of '+esc(x.name)+'">'+[['wanted','Wanted'],['installed','Installed'],['off','Off']].map(function(o){return '<option value="'+o[0]+'"'+(x.status===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select>':'')+'</div>'
   +'<h3'+(kind==='rule'?' style="font:600 15px/1.4 var(--sans)"':'')+'>'+esc(kind==='rule'?x.text:x.name)+'</h3>'
   +(kind==='item'&&x.what?'<p>'+esc(x.what)+'</p>':'')+(kind==='item'&&x.source?'<p class="hint">Source: '+esc(x.source)+'</p>':'')+(kind==='rule'&&x.note?'<p class="hint">'+esc(x.note)+'</p>':'')
   +'<p class="hint"><b>'+esc(scopeText(x.scope))+'</b> · '+n+' agent'+(n===1?'':'s')+(kind==='rule'&&x.src?' · from '+esc(x.src):'')+'</p>'
   +'<div class="acts"><button class="btn small" data-act="x-edit" data-kind="'+kind+'" data-id="'+id+'">Edit</button><button class="btn small danger" data-act="'+(del?'x-del-ok':'x-del')+'" data-kind="'+kind+'" data-id="'+id+'">'+(del?'Really remove?':'Remove')+'</button></div></div>';
}
function xeFields(kind,x){
  var sc=x&&x.scope?clone(x.scope):{mode:'all'};sc.projects=sc.projects||[];sc.teams=sc.teams||[];sc.people=sc.people||[];
  if(kind==='rule')return {text:x?x.text:'',type:x?x.type:'never',note:x?x.note||'':'',scope:sc};
  return {name:x?x.name:'',kind:x?x.kind:'skill',runtime:x?x.runtime||'any':'any',status:x?x.status:'wanted',what:x?x.what||'':'',source:x?x.source||'':'',scope:sc};
}
function xeHTML(){
  var e=S.xe;if(!e)return '';var f=e.f,item=e.kind==='item';
  var h='<div class="scrim" data-act="x-close"></div><aside class="panel" role="dialog" aria-label="'+(item?'Skill or plugin':'Guardrail')+'"><div class="panel-head"><div><h2>'+(e.id?'Edit ':'Add ')+(item?'skill or plugin':'guardrail')+'</h2></div><div class="btns"><button class="btn small primary" data-act="x-save">Save</button><button class="btn small" data-act="x-close">Cancel</button></div></div><div class="panel-body">';
  function sel(k,opts,cur,lab){return '<div class="fld"><label for="xf-'+k+'">'+lab+'</label><select id="xf-'+k+'" data-xf="'+k+'">'+opts.map(function(o){return '<option value="'+esc(o[0])+'"'+(o[0]===cur?' selected':'')+'>'+esc(o[1])+'</option>'}).join('')+'</select></div>'}
  if(item){
    h+='<div class="fld"><label for="xf-name">Name</label><input type="text" id="xf-name" data-xf="name" value="'+esc(f.name)+'" placeholder="For example Weekly regulation scan"></div>'
     +sel('kind',KINDS,f.kind,'Kind')
     +sel('runtime',[['any','Any model']].concat(modelList().map(function(m){return [m.id,m.name]})),f.runtime,'Runs on')
     +sel('status',[['wanted','Wanted (not set up yet)'],['installed','Installed'],['off','Off']],f.status,'Status')
     +'<div class="fld"><label for="xf-what">What it does</label><textarea id="xf-what" data-xf="what" rows="3">'+esc(f.what)+'</textarea></div>'
     +'<div class="fld"><label for="xf-source">Where it comes from</label><input type="text" id="xf-source" data-xf="source" value="'+esc(f.source)+'" placeholder="A link, a repo path or a marketplace name"></div>';
  }else{
    h+=sel('type',RTYPES,f.type,'Type')
     +'<div class="fld"><label for="xf-text">The rule</label><textarea id="xf-text" data-xf="text" rows="3" placeholder="For example Never merge without Quality approval">'+esc(f.text)+'</textarea></div>'
     +'<div class="fld"><label for="xf-note">Why (optional)</label><input type="text" id="xf-note" data-xf="note" value="'+esc(f.note)+'"></div>';
  }
  var sc=f.scope;
  h+='<div class="sec"><h3>Who it applies to</h3>'+sel('mode',[['all','Every agent'],['project','A project'],['team','A team'],['people','Named people']],sc.mode,'Applies to');
  if(sc.mode==='project')h+='<div class="pickbox">'+S.repos.map(function(r,i){var v=rid(r);return '<label><input type="checkbox" id="xc-p'+i+'" data-xc="projects" value="'+esc(v)+'"'+(sc.projects.indexOf(v)>=0?' checked':'')+'> '+esc(r.full_name.split('/')[1])+'</label>'}).join('')+'</div>';
  if(sc.mode==='team')h+='<div class="pickbox">'+allTeams().map(function(t,i){return '<label><input type="checkbox" id="xc-t'+i+'" data-xc="teams" value="'+esc(t)+'"'+(sc.teams.indexOf(t)>=0?' checked':'')+'> '+esc(t)+'</label>'}).join('')+'</div>';
  if(sc.mode==='people'){var tm=teamIndex();h+='<div class="pickbox">'+S.agents.slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name))}).map(function(a,i){return '<label><input type="checkbox" id="xc-a'+i+'" data-xc="people" value="'+esc(a.id)+'"'+(sc.people.indexOf(a.id)>=0?' checked':'')+'> '+esc(a.name)+' <small class="hint">'+esc(tm[a.id]||'')+'</small></label>'}).join('')+'</div>'}
  h+='<span class="hint">Applies to '+countFor(sc)+' agent'+(countFor(sc)===1?'':'s')+' right now.</span></div></div></aside>';
  return h;
}
function saveXe(){
  var e=S.xe;if(!e)return;var f=e.f,E=clone(ext()),item=e.kind==='item';
  if(item&&!String(f.name).trim()){toast('Give it a name');return}
  if(!item&&!String(f.text).trim()){toast('Write the rule');return}
  var sc=f.scope;if(sc.mode==='project'&&!sc.projects.length||sc.mode==='team'&&!sc.teams.length||sc.mode==='people'&&!sc.people.length){toast('Choose who it applies to');return}
  var o=item?{name:f.name.trim(),kind:f.kind,runtime:f.runtime,status:f.status,what:f.what.trim(),source:f.source.trim(),scope:sc}:{text:f.text.trim(),type:f.type,note:f.note.trim(),scope:sc};
  var arr=item?E.items:E.rules;
  if(e.id){for(var i=0;i<arr.length;i++)if(arr[i].id===e.id){o.id=e.id;if(!item)o.src=arr[i].src;arr[i]=o}}
  else{o.id='x_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);arr.push(o)}
  saveExt(E);S.xe=null;render();toast('Saved');
}
function looksSecret(v){v=String(v||'');return /^(sk|pk|rk|ghp|gho|ghs|github_pat|xox[a-z]|AIza|hf|gsk)[-_]/i.test(v)||/^[A-Za-z0-9_\-]{32,}$/.test(v)}
var BILL=[['','Not set'],['sub','Subscription login (no key)'],['free','Free tier'],['pay','Pay per use (needs a key)']];
var KEYLOC=[['','Not set'],['none','No key needed'],['vercel','Vercel environment variable'],['github','GitHub secret'],['pm','Password manager'],['other','Somewhere else'],['missing','Key not added yet']];
function mopt(o,cur){return o.map(function(x){return '<option value="'+x[0]+'"'+((cur||'')===x[0]?' selected':'')+'>'+x[1]+'</option>'}).join('')}
function connectView(){
  var L=modelList(),conn=0,nokey=0,pay=0;
  L.forEach(function(m){if(m.connected)conn++;if(m.billing==='pay'){pay++;if(!m.keyLoc||m.keyLoc==='missing')nokey++}});
  var h='<div class="sumrow"><span><b>'+conn+'</b> of '+L.length+' marked connected</span><span><b>'+pay+'</b> pay per use</span><span><b>'+nokey+'</b> need a key location</span></div>'
   +'<div class="guide"><h3>Where do API keys go?</h3><p><b>Not on this page.</b> Anything typed here is saved to shared storage that other people you share this page with could read, so this page only records <i>where</i> a key lives, never the key. If you paste something that looks like a key, it is refused.</p><ol><li>Get the key from the provider\'s website (look for "API keys" in your account).</li><li>Put it where the tool runs: in Vercel, open the project, then Settings, then Environment Variables. For GitHub, use Settings, then Secrets. Or keep it in your password manager.</li><li>Give it a name such as <span class="mono">DEEPSEEK_API_KEY</span> and paste the key as its value there.</li><li>Come back here, pick where it lives and type only the name on the provider\'s card.</li></ol><p class="hint">This page cannot call or test these providers, and its chat uses Claude only. Role files run Claude models. Other models run only if you wire them in as separate tools. FamilyVault\'s rule is no pay-per-use services (spend cap 0 rupees), so pay-per-use is flagged below.</p></div><div class="gc">';
  L.forEach(function(m){
    var id=esc(m.id),n=S.agents.filter(function(a){var o=modelOf(a);return o.nowId===m.id||o.propId===m.id}).length,warn=[];
    if(m.billing==='pay')warn.push('Pay per use. FamilyVault allows no pay-per-use spending.');
    if(m.connected&&m.billing==='pay'&&(!m.keyLoc||m.keyLoc==='missing'))warn.push('Marked connected but no key location is recorded.');
    if(m.keyLoc&&m.keyLoc!=='none'&&m.keyLoc!=='missing'&&!m.keyName)warn.push('Type the key\'s name so people know what to look for.');
    function F(k,lab,ctl){return '<div class="fld"><label for="c'+k+'-'+id+'">'+lab+'</label>'+ctl+'</div>'}
    function T(k,lab,v,ph){return F(k,lab,'<input type="text" id="c'+k+'-'+id+'" data-mf="'+k+'" data-mid="'+id+'" value="'+esc(v||'')+'"'+(ph?' placeholder="'+esc(ph)+'"':'')+'>')}
    function S2(k,lab,o,v){return F(k,lab,'<select id="c'+k+'-'+id+'" data-mf="'+k+'" data-mid="'+id+'">'+mopt(o,v)+'</select>')}
    h+='<div class="cd"><div class="cd-h"><div class="grow"><h3>'+esc(m.name)+'</h3><span class="hint">'+esc(m.vendor||'No vendor set')+' · '+n+' agent'+(n===1?'':'s')+'</span></div><span class="pill '+(m.connected?'ok':'mute')+'">'+(m.connected?'Connected':'Not connected')+'</span></div>'
     +'<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-mc="'+id+'"'+(m.connected?' checked':'')+'> Mark as connected <span class="hint">(a label you set)</span></label>'
     +'<div class="cf">'+T('name','Name',m.name)+T('vendor','Vendor',m.vendor)+S2('billing','How it is paid',BILL,m.billing)+S2('keyLoc','Where the key lives',KEYLOC,m.keyLoc)+T('keyName','Key name (not the key)',m.keyName,'DEEPSEEK_API_KEY')+T('cap','Monthly cap, rupees',m.cap,'0')+'</div>'
     +T('note','Note',m.note,'How it is reached')
     +warn.map(function(w){return '<span class="pill warn" style="white-space:normal">'+esc(w)+'</span>'}).join('')
     +'<div class="acts"><button class="btn small danger" data-act="model-del" data-id="'+id+'">Remove</button></div></div>';
  });
  if(S.canImport)h+='<!--import--><div class="cd"><h3>Import agent data from a file</h3><p class="hint">Choose the data file you were given. It adds the repo progress record, the status report and missing library items. It never overwrites what you added or changed.</p><div class="fld"><label for="imp-file">Data file (.json)</label><input type="file" id="imp-file" data-imp accept="application/json,.json"></div></div><!--/import-->';
  h+='<div class="cd"><h3>Add a model or provider</h3><div class="fld"><label for="mnew-name">Name</label><input type="text" id="mnew-name" placeholder="For example Qwen"></div><div class="fld"><label for="mnew-vendor">Vendor</label><input type="text" id="mnew-vendor"></div><div class="fld"><label for="mnew-note">Note</label><input type="text" id="mnew-note" placeholder="How it is reached"></div><div><button class="btn primary" data-act="model-add">Add</button></div><span class="hint">New ones start as not connected. Fill in the payment and key details on their card.</span></div></div>';
  return h;
}
var EF=[['name','Name','text'],['role','Title line','text'],['level','Level','level'],['reportsTo','Reports to','text'],['status','Status','status'],['purpose','Mission','area'],['responsibilities','Responsibilities (one per line)','lines'],['may','May (one per line)','lines'],['mustNot','Must not (one per line)','lines'],['handsOff','Hands off to','text'],['reads','Reads at the start of a run','text'],['tools','Tools (comma separated)','text'],['requirements','Requirements (one per line)','lines']];
function editFields(a){
  var f={},o=modelOf(a);
  EF.forEach(function(x){var k=x[0],v=a[k];f[k]=Array.isArray(v)?(k==='tools'?v.join(', '):v.join('\n')):(v==null?'':String(v))});
  f.model=o.nowId;f.modelPlanned=o.propId;return f;
}
function editHTML(){
  var e=S.edit,a=e&&S.agents.filter(function(x){return x.id===e.id})[0];if(!a)return '';
  var h='<div class="scrim" data-act="edit-close"></div><aside class="panel" role="dialog" aria-label="Edit '+esc(a.name)+'"><div class="panel-head"><div><h2>Edit agent</h2><p class="role">'+esc(a.name)+'</p></div><div class="btns"><button class="btn small primary" data-act="edit-save">Save</button><button class="btn small" data-act="edit-close">Cancel</button></div></div><div class="panel-body">';
  EF.forEach(function(x){
    var k=x[0],v=e.f[k]==null?'':e.f[k],id='ef-'+k,c;
    if(x[2]==='level'){var lv=['Head','Junior','Agent'];if(v&&lv.indexOf(v)<0)lv.push(v);c='<select id="'+id+'" data-ef="'+k+'">'+lv.map(function(o){return '<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>'}).join('')+'</select>'}
    else if(x[2]==='status')c='<select id="'+id+'" data-ef="'+k+'">'+['active','paused','draft'].map(function(o){return '<option value="'+o+'"'+(o===(v||'active')?' selected':'')+'>'+statusLabel(o)+'</option>'}).join('')+'</select>';
    else if(x[2]==='area'||x[2]==='lines')c='<textarea id="'+id+'" data-ef="'+k+'" rows="'+(x[2]==='area'?3:5)+'">'+esc(v)+'</textarea>';
    else c='<input type="text" id="'+id+'" data-ef="'+k+'" value="'+esc(v)+'">';
    h+='<div class="fld"><label for="'+id+'">'+esc(x[1])+'</label>'+c+'</div>';
  });
  h+='<div class="fld"><label for="ef-model">Model now</label><select id="ef-model" data-ef="model">'+modelOpts(e.f.model,'Not set')+'</select></div>'
   +'<div class="fld"><label for="ef-modelPlanned">Model planned</label><select id="ef-modelPlanned" data-ef="modelPlanned">'+modelOpts(e.f.modelPlanned,'Not set')+'</select><span class="hint">Models that are not connected cannot be chosen. Connect them under Connections.</span></div>'
   +'<p class="hint">If you rename this agent, update Reports to on the agents that report to it: they match by name. This edits the record on this page, not the role file in the repo.</p></div></aside>';
  return h;
}
function saveEdit(){
  var e=S.edit;if(!e)return;var f=e.f;
  if(!String(f.name||'').trim()){toast('Name is required');return}
  mutate(e.id,function(a){
    ['name','role','level','reportsTo','status','purpose','handsOff','reads'].forEach(function(k){if(f[k]!=null)a[k]=String(f[k]).trim()});
    ['responsibilities','may','mustNot','requirements'].forEach(function(k){a[k]=lines(f[k])});
    a.tools=String(f.tools||'').split(',').map(function(x){return x.trim()}).filter(Boolean);
    a.model=f.model||'';a.modelPlanned=f.modelPlanned||'';
  });
  S.edit=null;render();toast('Saved');
}
function modelsHTML(){
  if(!S.modelsOpen)return '';
  var L=modelList(),h='<div class="scrim" data-act="models-close"></div><aside class="panel" role="dialog" aria-label="Models"><div class="panel-head"><div><h2>Models</h2><p class="role">Models your agents can be assigned to</p></div><div class="btns"><button class="btn small" data-act="models-close">Close</button></div></div><div class="panel-body">';
  h+='<p class="hint">Connected is a label you set. This page cannot test a connection. Role files run Claude models only. Codex, Hermes, DeepSeek or Kimi run only if you wire them in as separate tools. The chat on this page always uses Claude.</p>';
  L.forEach(function(m){
    var n=S.agents.filter(function(a){var o=modelOf(a);return o.nowId===m.id||o.propId===m.id}).length,id=esc(m.id);
    h+='<section class="sec"><div class="rowline"><label class="grow"><input type="checkbox" data-mc="'+id+'"'+(m.connected?' checked':'')+'> Connected</label><span class="hint">'+n+' agent'+(n===1?'':'s')+'</span><button class="btn small danger" data-act="model-del" data-id="'+id+'">Remove</button></div>'
     +'<div class="fld"><label for="mn-'+id+'">Name</label><input type="text" id="mn-'+id+'" data-mf="name" data-mid="'+id+'" value="'+esc(m.name)+'"></div>'
     +'<div class="fld"><label for="mv-'+id+'">Vendor</label><input type="text" id="mv-'+id+'" data-mf="vendor" data-mid="'+id+'" value="'+esc(m.vendor||'')+'"></div>'
     +'<div class="fld"><label for="mt-'+id+'">Note</label><input type="text" id="mt-'+id+'" data-mf="note" data-mid="'+id+'" value="'+esc(m.note||'')+'"></div></section>';
  });
  h+='<section class="sec"><h3>Add a model</h3><div class="fld"><label for="mnew-name">Name</label><input type="text" id="mnew-name" placeholder="For example Qwen"></div><div class="fld"><label for="mnew-vendor">Vendor</label><input type="text" id="mnew-vendor"></div><div class="fld"><label for="mnew-note">Note</label><input type="text" id="mnew-note" placeholder="How it is reached, for example through a Codex CLI"></div><div><button class="btn primary" data-act="model-add">Add model</button></div><span class="hint">New models start as not connected. Tick Connected once it really is.</span></section></div></aside>';
  return h;
}
function guardLines(a: any): string[] { var g=appliedTo(a),o: string[]=[]; if(a.progress&&S.report&&S.report.facts)o.push('Team-wide facts: '+S.report.facts.join(' | ')); if(g.rules.length){o.push('Guardrails the founder set for you (follow them strictly):');g.rules.forEach(function(r: any){o.push('- '+ruleLabel(r.type)+': '+r.text)})} if(g.items.length){o.push('Skills, plugins and tools assigned to you on the Capabilities page (a register, not proof they are installed):');g.items.forEach(function(x: any){o.push('- '+x.name+' ('+kindLabel(x.kind)+', '+x.status+')'+(x.what?': '+x.what:''))})} return o }

render();
(async function(){
  DB=createDb();DL=createDownloads();S.canImport=true;
  var cfg=await loadConfig();
  if(cfg.chat)SAMPLE=createSample();
  MCP=cfg.github;
  DB.collection('agents').onSnapshot(function(snap:any){
    var next=snap.docs.map(function(d:any){var o=clone(d.data());o.id=d.id;return o}).sort(function(a:any,b:any){return (b.createdAt||0)-(a.createdAt||0)});
    var sig=JSON.stringify(next);
    S.loaded=true;
    if(sig===lastSig&&lastSig!=='')return;
    lastSig=sig;S.agents=next;if(!S.seeded&&next.length){S.seeded=true;buildTree(next).roots.forEach(function(r:any){S.open[r.id]=true})}render();
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
  DB.doc('meta/ext').onSnapshot(function(d:any){S.ext=d.exists?clone(d.data()):null;render()},function(){});
  DB.doc('meta/models').onSnapshot(function(d:any){S.models=d.exists?clone(d.data()):null;render()},function(){});
  DB.doc('meta/report').onSnapshot(function(d:any){S.report=d.exists?clone(d.data()):null;render()},function(){});
  DB.doc('meta/repos').onSnapshot(function(d:any){
    if(d.exists){var v=d.data();if(v&&Array.isArray(v.items)&&v.items.length){S.repos=keepKnown(clone(v.items));S.syncedAt=v.syncedAt||null;render()}}
  },function(){});
  render();
})();
}
