// @ts-nocheck
/* The Agent Desk view: render functions and event handlers ported from the original single-page
   app with the markup unchanged. Data logic lives in lib/ (typed); this layer builds HTML strings
   and keeps loosely typed UI state, as the original did. Call mount() once in the browser. */
import {
  esc, clone, rid, newId, ago, fmtDate, count, statusLabel, fmtNum, kpiPct, agentPct, tone, today, isLate,
  isBlocked, lateCount, routineLate, libCount, attention, nextDue, sortAg, buildTree,
  repoById as repoByIdIn, shortName as shortNameIn, fullName as fullNameIn,
} from '@/lib/model';
import { norm as scopeNorm, toMix, applies as appliesLib, isEmpty as scopeEmpty, giveTo, removeFor, toggle as tgl } from '@/lib/scope';
import { syncAgent, syncAll, sharedFor, sharedLabel, materialises, SHARED_KINDS } from '@/lib/shared';
import { readUpload, scan as scanPkg, LIMITS as PKG_LIMITS } from '@/lib/pkg';
import { effState, isAvailable, restExpired, restLeft, restUntilFor, logStatus, taskState, taskPct, roll, isLead, coverFor, suggestBackup, STATE_LABEL, STATE_HELP, REST_CHOICES } from '@/lib/status';
import { templateSpec as templateSpecIn, normalizeSpec, toFields, fromFields, buildPrompt as buildPromptIn, jdText as jdTextIn } from '@/lib/templates';
import { HOLD, TIMELINES, ROUTINES, recordsText, chatTurns as chatTurnsIn, capturePrompt } from '@/lib/prompts';
import { buildCsv, csvFilename } from '@/lib/csv';
import { DESIGNATIONS, designationOf, resolveRole } from '@/lib/roles';
import { cancel as cancelReq, decide as decideReq, fill as fillReq, newReq } from '@/lib/reqs';
import { LEVELS, agentUnits, cleanLimit, cleanRate, companyUsage, hireCheck, labelOf, modelUnits, overLimits, rupees, unitCap, usageOf, whoOf } from '@/lib/budget';
import { DEPARTMENTS, TECH, deptOf, groupBy, techOf, ONBOARDING, activeLoan, addReview, companyStats, diffChanges, endLoan, expireLoan, lend as lendIn, logChange, onboardingProgress, orgNeeds, reviewState, safeUrl, setBench, setOnboarding, transfer as transferIn } from '@/lib/org';
import { MEMORY_OPTIONS, allHelpers, brainOf, defaultBrain, isLeader as isLeaderT, recommendModel, suggestSubs } from '@/lib/taskplan';
import { TOOL_OPTIONS, APPROVAL_OPTIONS, CADENCES, defaultExtras, refreshDefaults, extrasPrompt, applyExtras, roleChosen, effectiveDept } from '@/lib/wizard-options';
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
var S: any = {repos:DEFAULT_REPOS,syncedAt:null,projects:{},agents:[],chats:{},loaded:false,scope:'all',tab:'overview',views:(function(){try{return JSON.parse(localStorage.getItem('ad-views')||'{}')||{}}catch(e){return {}}})(),ext:null,xe:null,xdel:null,reqs:null,rq:{company:'',by:'owner',dept:'',designation:'agent',reason:''},rqNote:{},lm:{level:'company',company:'',target:'',maxAgents:'',maxUnits:'',maxRupees:''},orgBy:'line',bd:{},bdBusy:'',org:null,mv:null,lastSub:{},feed:null,control:null,feedBusy:false,pgConfirm:'',at:null,canFeed:false,xview:{},imp:null,liveOpen:{},ctl:null,capTab:'catalog',dirView:(function(){try{return localStorage.getItem('ad-dirview')||'people'}catch(e){return 'people'}})(),dirSel:'',dirTeam:'all',dirModel:'all',models:null,
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
  chains[k]=(chains[k]||Promise.resolve()).then(function(){return DB!.doc(k).set(body)}).catch(function(e:any){toast(e&&e.code==='conflict'?'Someone changed this on another device or tab. Showing the latest. Please redo your edit.':'Could not save: '+((e&&e.code)||'unknown error'))});
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
  var d=S.bd[id],b=d?d.text:((S.projects[id]||{}).brief||'');
  return '<section class="brief"><label for="brief-edit">Project brief</label><p class="hint">What this project is, who it is for and what matters this quarter. New agents are drafted from it.</p>'
   +'<textarea id="brief-edit" data-brief="'+esc(id)+'" placeholder="Example: A mobile-first savings app for gig workers in India. Launching the beta in November.">'+esc(b)+'</textarea>'
   +'<div class="row"><button class="btn small primary" data-act="save-brief" data-id="'+esc(id)+'">Save brief</button>'+(S.canFeed?'<button class="btn small" data-act="brief-import" data-id="'+esc(id)+'"'+(S.bdBusy===id?' disabled':'')+'>'+(S.bdBusy===id?'Reading GitHub…':'Collect from GitHub')+'</button>':'')+'</div>'+(d&&d.srcs?'<p class="hint">Draft collected from '+d.srcs.map(function(x:any){return esc(x.path)}).join(', ')+'. It is not saved until you click Save brief. Trim anything you do not want agents to see.</p>':(S.canFeed?'<p class="hint">Collect from GitHub reads the repo\'s README, CLAUDE.md and docs and drafts a brief you can edit.</p>':''))+'</section>';
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
var GROUPS=[['progress','Progress',[['live','Now'],['tracker','History'],['report','Status report']]],['people','People',[['people','Directory'],['agents','Teams'],['hr','HR desk'],['org','Org chart'],['co','Companies'],['lib','Library']]],['work','Work',[['tasks','Todos'],['score','Goals & KPIs']]]];
function groupOf(tab:any){for(var i=0;i<GROUPS.length;i++)for(var j=0;j<GROUPS[i][2].length;j++)if(GROUPS[i][2][j][0]===tab)return GROUPS[i];return null}
function tabsHTML(list){
  var n=list.reduce(function(s,a){return s+(a.todos||[]).length},0),k=list.reduce(function(s,a){return s+(a.kpis||[]).length+(a.goals||[]).length},0);
  var cur=groupOf(S.tab),cg=cur?'g:'+cur[0]:S.tab;
  var t=[['overview','Overview',''],['g:progress','Progress',''],['g:people','People',list.length],['g:work','Work',n+k],['caps','Capabilities',ext().items.length+ext().rules.length+ext().shared.length],['connect','Connections',modelList().length]];
  return '<div class="tabs" role="tablist">'+t.map(function(x){return '<button class="tab" role="tab" data-act="tab" data-tab="'+x[0]+'" aria-selected="'+(cg===x[0])+'">'+x[1]+(x[2]!==''?'<em>'+x[2]+'</em>':'')+'</button>'}).join('')+'</div>'+subTabsHTML(list,cur);
}
function subTabsHTML(list:any,g:any){
  if(!g)return '';
  var n=list.reduce(function(s:any,a:any){return s+(a.todos||[]).length},0),k=list.reduce(function(s:any,a:any){return s+(a.kpis||[]).length+(a.goals||[]).length},0),lb=list.reduce(function(s:any,a:any){return s+libCount(a)},0);
  var cnt:any={people:list.length,agents:list.length,report:list.length,tasks:n,score:k,lib:lb,org:list.length,co:companyIds().length,hr:reqsDoc().items.filter(function(r:any){return r.status==='requested'||r.status==='approved'}).length};
  return '<div class="subtabs" role="tablist" aria-label="'+esc(g[1])+'">'+g[2].map(function(m:any){return '<button class="subtab" role="tab" data-act="tab" data-tab="'+m[0]+'" aria-selected="'+(S.tab===m[0])+'">'+esc(m[1])+(cnt[m[0]]!=null?'<em>'+cnt[m[0]]+'</em>':'')+'</button>'}).join('')+'</div>';
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
   +'<td><select class="cell" id="ast-'+id+'" data-status="'+id+'" aria-label="Status of '+esc(a.name)+'">'+statusOpts(a)+'</select></td>'
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
function todosView(list){return '<div class="vrow"><button class="btn primary small" data-act="task-open">Add a task</button></div>'+vsw('tasks','Board')+(isSheet('tasks')?todosSheet(list):todosCards(list))}
function sheetBlock(title:any,heads:any,rows:any){
  return '<div class="block"><h2>'+title+'</h2><div class="sheetwrap"><table class="sheet" style="min-width:760px"><thead><tr><th class="rn">#</th>'+heads.map(function(h:any){return '<th>'+h+'</th>'}).join('')+'</tr></thead><tbody>'+(rows||'<tr><td class="rn"></td><td colspan="'+heads.length+'" class="hint">Nothing yet</td></tr>')+'</tbody></table></div></div>';
}
function scoreView(list){return vsw('score','Cards')+(isSheet('score')?scoreSheet(list):scoreCards(list))}
function libView(list){return vsw('lib','Cards')+(isSheet('lib')?libSheet(list):libCards(list))}
function shellHTML(){
  var list=agentsOf(S.scope),repo=S.scope==='all'?null:repoById(S.scope);
  return '<div class="shell">'+railHTML()+'<main class="main">'+(S.banner?'<div class="err">'+esc(S.banner)+'</div>':'')+'<div class="mainhead">'+topHTML(repo)+tabsHTML(list)+'</div>'+(S.scope!=='all'?briefHTML(S.scope):'')+(S.tab==='overview'||S.tab==='tracker'||S.tab==='live'||S.tab==='people'||S.tab==='org'||S.tab==='co'||S.tab==='hr'||S.tab==='report'||S.tab==='caps'||S.tab==='connect'?'':statsHTML(list))
   +'<section>'+coverBanner()+((groupOf(S.tab)||[])[0]==='progress'?progressHeader():'')+(S.tab==='overview'?overviewView(list):S.tab==='live'?liveView(list):S.tab==='tracker'?trackerView(list):S.tab==='people'?directoryView(list):S.tab==='hr'?hrDeskView(list):S.tab==='org'?orgView(list):S.tab==='co'?companiesView(list):S.tab==='caps'?capView(list):S.tab==='connect'?connectView():S.tab==='agents'?rosterView(list):S.tab==='tasks'?todosView(list):S.tab==='lib'?libView(list):S.tab==='report'?reportView(list):scoreView(list))+'</section></main></div>';
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
  h+='<div class="panel-head"><div><h2>'+esc(a.name)+(a.example?' <span class="tag">Example</span>':'')+'</h2><p class="role">'+esc(a.role)+'</p></div><div class="btns"><button class="btn small" data-act="edit-open" data-id="'+id+'">Edit</button><button class="btn small" data-act="task-open" data-id="'+id+'">Add task</button><button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button><button class="btn small" data-act="close-panel">Close</button></div></div><div class="panel-body">';
  h+='<div class="facts"><div><span>Project</span><b>'+esc(fullName(a.projectId))+'</b></div><div><span>Reports to</span><b>'+esc(a.reportsTo||'—')+'</b></div>'+(modelOf(a).now?'<div><span>Model</span><b>'+esc(modelOf(a).now)+' now · planned '+esc(modelOf(a).prop)+'</b></div>':'')
   +'<div><span>Status</span><select id="st-'+id+'" data-status="'+id+'" aria-label="Status">'+statusOpts(a)+'</select></div>'
   +'<div><span>Created</span><b>'+esc(fmtDate(a.createdAt)||'—')+(a.source==='claude'?' · drafted by Claude':a.source==='template'?' · from template':a.source==='repo'?' · imported from role file':'')+'</b></div></div>';
  h+=ctlBlock(a)+appliesBlock(a);
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
  h+=hrBlock(a);
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
function pluginNames(){return ext().items.filter(function(i:any){return i.status!=='off'&&(i.kind==='skill'||i.kind==='plugin'||i.kind==='mcp')}).map(function(i:any){return i.name})}
function extrasHTML(x:any){
  var box=function(kind:string,opts:readonly string[],sel:string[]){return '<div class="checks">'+opts.map(function(o,i){var id='wx-'+kind+'-'+i;return '<label for="'+id+'"><input type="checkbox" id="'+id+'" data-wcheck="'+kind+'" value="'+esc(o)+'"'+(sel.indexOf(o)>=0?' checked':'')+'>'+esc(o)+'</label>'}).join('')+'</div>'};
  x.__brain=S.wizard.brain||defaultBrain({role:S.wizard.task});
  var h='<section class="more" aria-label="More details"><h3>More details · defaults chosen for you</h3>';
  h+='<p class="hint">Pre-selected from the task. Keep them as they are or untick what does not apply. These are recorded on the role; this app does not connect to the services.</p>';
  var dEff=effectiveDept(x,S.wizard.task),rr=resolveRole(dEff,x.designation),skOpts=rr.skills.map(function(k:any){return k[0]}),plOpts=pluginNames();
  h+='<div class="two"><div class="fld"><label for="wx-dept">Department</label><select id="wx-dept" data-wxrole="dept"><option value="">Worked out from the task: '+esc(dEff)+'</option>'+DEPARTMENTS.map(function(d:any){return '<option'+(x.dept===d?' selected':'')+'>'+esc(d)+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="wx-desig">Designation</label><select id="wx-desig" data-wxrole="designation">'+DESIGNATIONS.map(function(d:any){return '<option value="'+d.id+'"'+(x.designation===d.id?' selected':'')+'>'+esc(d.label)+'</option>'}).join('')+'</select></div></div>'
   +'<p class="hint">'+esc(designationOf(x.designation).blurb)+' Title: <b>'+esc(rr.title)+'</b>. Typical duties, loaded into the draft: '+esc(rr.duties.slice(0,3).join('; '))+'.</p>';
  h+='<div class="fld"><label>Skills</label>'+(skOpts.length||x.skills.length?box('skills',uniq(skOpts.concat(x.skills)),x.skills):'<span class="hint">None for this department.</span>')+'</div>';
  h+='<div class="fld"><label>Plugins and capabilities <span class="hint">registered under Capabilities. Ticked ones are given to this agent.</span></label>'+(plOpts.length?box('plugins',plOpts,x.plugins):'<span class="hint">None registered yet.</span>')+'</div>';
  h+='<div class="fld"><label>Tools and access</label>'+box('tools',TOOL_OPTIONS,x.tools)+'<input type="text" id="wx-other" data-wx="otherTools" value="'+esc(x.otherTools)+'" placeholder="Other tools, comma separated" aria-label="Other tools"></div>';
  h+='<div class="fld"><label>Needs your approval before</label>'+box('approvals',APPROVAL_OPTIONS,x.approvals)+'</div>';
  h+='<div class="two"><div class="fld"><label for="wx-cadence">Status updates</label><select id="wx-cadence" data-wx="cadence" style="width:100%">'+CADENCES.map(function(c){return '<option value="'+esc(c)+'"'+(x.cadence===c?' selected':'')+'>'+esc(c)+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="wx-reports">Reports to</label><input type="text" id="wx-reports" data-wx="reportsTo" value="'+esc(x.reportsTo)+'" placeholder="Leave blank to use the draft"></div></div>';
  var wb=x.__brain;
  h+='<div class="fld"><label>Brain and memory</label></div>'+brainBox(wb,'wb');
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
  var pbx=[].map.call(overlay.querySelectorAll('.pickbox'),function(b:any){return b.scrollTop});
  var sw=app.querySelector('.sheetwrap'),sl=sw?sw.scrollLeft:0,stp=sw?sw.scrollTop:0;
  var ms=document.scrollingElement?document.scrollingElement.scrollTop:0;
  app.innerHTML=shellHTML();
  overlay.innerHTML=panelHTML()+chatHTML()+wizardHTML()+editHTML()+modelsHTML()+xeHTML()+ctlHTML()+impHTML()+addTaskHTML()+moveHTML();
  [].forEach.call(overlay.querySelectorAll('.pickbox'),function(b:any,i:number){if(pbx[i])b.scrollTop=pbx[i]});
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
  S.wizard={brain:null,step:1,projectId:pid,brief:(S.projects[pid]&&S.projects[pid].brief)||'',task:'',autonomy:'review',busy:false,error:'',fields:null,source:'template',ctl:null,extras:defaultExtras('')};
  S.chat=null;S.openAgent=null;render();
  var t=byId('w-task');if(t)t.focus();
}
function toStep2(spec:any,source:any){
  var w=S.wizard;
  if(w.brief.trim()!==((S.projects[w.projectId]&&S.projects[w.projectId].brief)||'').trim())saveBrief(w.projectId,w.brief,true);
  w.fields=toFields(normalizeSpec(applyExtras(spec,w.extras,w.task)));w.source=source;w.step=2;w.error='';w.busy=false;w.ctl=null;render();
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
  var lead=isLeaderT({role:s.role,name:s.name})||resolveRole(effectiveDept(w.extras,w.task),w.extras.designation).leader&&roleChosen(w.extras),rec=recommendModel(w.task,atModels(),lead),units=modelUnits(rec.id||'opus55',lead);
  if(!gate({company:w.projectId,dept:effectiveDept(w.extras,w.task),role:s.role},units,w,'create:'+s.name)){w.error=w.err;return}
  var roleSel=roleChosen(w.extras),rl0=resolveRole(effectiveDept(w.extras,w.task),w.extras.designation);
  var a={model:rec.id||'',id:newId(),projectId:w.projectId,name:s.name,role:s.role,reportsTo:s.reportsTo,status:'active',task:w.task.trim(),autonomy:w.autonomy,
    purpose:s.purpose,responsibilities:s.responsibilities,requirements:s.requirements,tools:s.tools,mustNot:s.mustNot,goals:s.goals,kras:s.kras,kpis:s.kpis,todos:s.todos,
    routines:[{name:'Status update to '+(s.reportsTo||'the owner'),cadence:w.extras.cadence,state:'planned',next:'',note:'Set when the agent was built'}],
    brain:w.brain||defaultBrain({role:s.role,name:s.name}),
    memory:w.extras.notes.trim()?[{text:w.extras.notes.trim(),at:today(),src:'you'}]:[],
    source:w.source,createdAt:Date.now()};
  a.dept=rl0.dept;a.designation=w.extras.designation;if(roleSel)a.level=rl0.level;
  a.skills=(w.extras.skills||[]).map(function(n:any){var f2=rl0.skills.filter(function(k:any){return k[0]===n})[0];return {name:n,note:f2?f2[1]:''}});
  S.agents.unshift(a);
  (function(){var E=ext(),ch=false,tm=teamIndex();(w.extras.plugins||[]).forEach(function(n:any){E.items.forEach(function(it:any){if(it.name===n){var ns=giveTo(it.scope,a,tm);if(JSON.stringify(ns)!==JSON.stringify(it.scope)){it.scope=ns;ch=true}}})});if(ch)saveExt(E)})();
  syncAgent(ext().shared,a,teamIndex());persist('agents',a.id,a);
  if(w.reqId){var rd=reqsDoc(),rq0=rd.items.filter(function(r:any){return r.id===w.reqId})[0];if(rq0){fillReq(rq0,a.id);S.reqs=rd;persist('meta','reqs',rd)}}
  logChange(a,'Created'+(w.reqId?' from a requisition':'')+' as '+rl0.title);persist('agents',a.id,a);
  S.wizard=null;S.scope=w.projectId;S.tab='agents';S.openAgent=a.id;render();toast('Agent created');
}
async function briefImport(id:any){
  if(S.bdBusy)return;S.bdBusy=id;render();
  try{
    var r=await fetch('/api/brief',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({repo:String(id).replace('__','/')})});
    var j=await r.json();
    if(r.ok&&j.brief){var cur=((S.projects[id]||{}).brief||'').trim();S.bd[id]={text:(cur?cur+'\n\n---\n\n':'')+j.brief,srcs:j.sources};toast('Draft collected. Review it, then Save brief')}
    else toast(j.error==='nothing_found'?'No README or docs found in that repo':j.error==='no_access'?'The GitHub token cannot read that repo':j.error==='server_not_connected'?'GitHub is not connected to this site':'Could not collect the brief');
  }catch(e){toast('Could not reach GitHub')}
  S.bdBusy='';render();
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
  else if(act==='tab'){
    var tt=el.dataset.tab;
    if(tt.indexOf('g:')===0){var gg=GROUPS.filter(function(x:any){return x[0]===tt.slice(2)})[0];S.tab=(gg&&S.lastSub[gg[0]])||(gg?gg[2][0][0]:'overview')}else S.tab=tt;
    var g2=groupOf(S.tab);if(g2)S.lastSub[g2[0]]=S.tab;
    render();
  }
  else if(act==='toggle'){S.open[id]=!S.open[id];render()}
  else if(act==='expand-all'){agentsOf(S.scope).forEach(function(a){S.open[a.id]=true});render()}
  else if(act==='collapse-all'){S.open={};render()}
  else if(act==='csv')exportCSV();
  else if(act==='dircsv')exportDirCSV();
  else if(act==='edit-open'){var ea=S.agents.filter(function(x){return x.id===id})[0];if(ea){S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.openAgent=null;S.modelsOpen=false;S.edit={id:id,f:editFields(ea)};render()}}
  else if(act==='edit-close'){S.edit=null;render()}
  else if(act==='st'){var sst=el.dataset.st;if(sst==='active'||sst==='paused'){setStates([id],sst,{});render();toast(STATE_LABEL[sst])}else openCtl([id],sst)}
  else if(act==='st-bulk'){var bids=String(el.dataset.ids||'').split(',').filter(Boolean);if(bids.length)openCtl(bids,el.dataset.st)}
  else if(act==='ctl-close'){S.ctl=null;render()}
  else if(act==='task-open')taskOpen(id);
  else if(act==='mv-open'){var ma=S.agents.filter(function(x:any){return x.id===id})[0];if(ma){S.mv={id:id,kind:el.dataset.kind,to:'',until:isoPlus(14),reason:''};render()}}
  else if(act==='mv-close'){S.mv=null;render()}
  else if(act==='orgby'){S.orgBy=el.dataset.by;render()}
  else if(act==='rq-add'){
    var rf=S.rq,rpe=S.agents.filter(function(a:any){return a.id===rf.by})[0],rn=newReq({company:rf.company||companyIds()[0],by:rf.by,byName:rpe?rpe.name:'You',dept:rf.dept,designation:rf.designation,reason:rf.reason},'r'+Date.now().toString(36));
    if(typeof rn==='string'){toast(rn);return}
    var rd=reqsDoc();rd.items.push(rn);S.rq={company:rf.company,by:'owner',dept:'',designation:'agent',reason:''};saveReqs(rd);toast('Requisition raised');
  }
  else if(act==='rq-approve'||act==='rq-decline'||act==='rq-cancel'||act==='rq-build'){
    var rd2=reqsDoc(),rq=rd2.items.filter(function(r:any){return r.id===id})[0];if(!rq)return;
    if(act==='rq-cancel'){cancelReq(rq);saveReqs(rd2);return}
    if(act==='rq-decline'){var er2=decideReq(rq,'declined',S.rqNote[id]||'');if(er2){toast(er2);return}saveReqs(rd2);toast('Declined');return}
    if(act==='rq-approve'){var er3=decideReq(rq,'approved','');if(er3){toast(er3);return}S.reqs=rd2;persist('meta','reqs',rd2)}
    reqBuild(rq);
  }
  else if(act==='lm-add'){
    var og=orgDoc(),lmr=cleanLimit(Object.assign({},S.lm,{company:S.lm.company||companyIds()[0]}),'l'+Date.now().toString(36));
    if(typeof lmr==='string'){toast(lmr);return}
    og.limits.push(lmr);S.org=og;persist('meta','org',og);S.lm={level:S.lm.level,company:S.lm.company,target:'',maxAgents:'',maxUnits:'',maxRupees:''};render();toast('Limit added');
  }
  else if(act==='lm-del'){var og2=orgDoc();og2.limits=og2.limits.filter(function(x:any){return x.id!==id});S.org=og2;persist('meta','org',og2);render();toast('Limit removed')}
  else if(act==='mv-ok')moveApply();
  else if(act==='loan-end'){mutate(id,function(a:any){endLoan(a,'returned early by you')});toast('Returned to the home company')}
  else if(act==='bench-toggle'){mutate(id,function(a:any){setBench(a,!a.bench)})}
  else if(act==='rv-add'){var rr=Number((byId('rv-r-'+id)||{}).value),rn=String((byId('rv-n-'+id)||{}).value||'');var er=null;mutate(id,function(a:any){er=addReview(a,rr,rn)});if(er)toast(er);else toast('Review recorded')}
  else if(act==='task-close'){S.at=null;render()}
  else if(act==='task-add')taskAdd();
  else if(act==='task-all'){var tq=String(S.at&&S.at.q||'').toLowerCase();S.agents.forEach(function(a:any){if(!tq||(a.name+' '+(teamIndex()[a.id]||'')).toLowerCase().indexOf(tq)>=0)if(S.at.ids.indexOf(a.id)<0)S.at.ids.push(a.id)});atDefaults(S.at);render()}
  else if(act==='task-none'){S.at.ids=[];atDefaults(S.at);render()}
  else if(act==='feed-refresh')refreshFeed(false);
  else if(act==='pg-ask'){S.pgConfirm=el.dataset.what;render()}
  else if(act==='pg-cancel'){S.pgConfirm='';render()}
  else if(act==='pg-do')setPause(el.dataset.what==='pause');
  else if(act==='ctl-ok')ctlApply();
  else if(act==='use-backup'){mutate(id,function(a){a.backupId=el.dataset.bk});toast('Backup saved')}
  else if(act==='live-toggle'){S.liveOpen[id]=!S.liveOpen[id];render()}
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
    if(act==='x-edit'){var xa=xk==='rule'?ext().rules:xk==='shared'?ext().shared:ext().items;for(var xi=0;xi<xa.length;xi++)if(xa[xi].id===id)xo=xa[xi];if(!xo)return}
    S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.openAgent=null;S.edit=null;S.imp=null;S.modelsOpen=false;
    var xsk=xk==='shared'?(xo?xo.kind:el.dataset.skind):'';
    S.xe={kind:xk,id:xo?xo.id:null,skind:xsk,f:xeFields(xk,xo,xsk)};render();
  }
  else if(act==='x-close'){S.xe=null;render()}
  else if(act==='x-reduce'){var rag=S.agents.filter(function(x){return x.id===el.dataset.agent})[0];if(rag)changeScopeFor(el.dataset.kind,id,rag,'remove')}
  else if(act==='x-view'){S.xview[id]=!S.xview[id];render()}
  else if(act==='shared-sync')applyShared(ext(),'Re-applied')
  else if(act==='pkg-open')pkgOpen();
  else if(act==='pkg-close'){S.imp=null;render()}
  else if(act==='pkg-add')pkgAdd();
  else if(act==='x-save')saveXe();
  else if(act==='x-del'){S.xdel=id;render()}
  else if(act==='x-del-ok'){var E2=clone(ext());if(el.dataset.kind==='rule')E2.rules=E2.rules.filter(function(r){return r.id!==id});else if(el.dataset.kind==='shared')E2.shared=E2.shared.filter(function(r){return r.id!==id});else E2.items=E2.items.filter(function(r){return r.id!==id});S.xdel=null;saveExt(E2);if(el.dataset.kind==='shared')applyShared(E2,'Removed');else{render();toast('Removed')}}
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
  else if(act==='save-brief'){var t=document.getElementById('brief-edit');if(t){saveBrief(id,t.value);delete S.bd[id];render()}}
  else if(act==='brief-import')briefImport(id);
  else if(act==='co-brief'){S.scope=id;S.tab='co';render()}
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
  else if(t.dataset.ctl==='custom'&&S.ctl){S.ctl.custom=t.value}
  else if(t.dataset.atq!==undefined&&S.at){S.at.q=t.value;render()}
  else if(t.dataset.atf&&S.at){S.at[t.dataset.atf]=t.value}
  else if(t.dataset.mvf&&S.mv){S.mv[t.dataset.mvf]=t.value}
  else if(t.dataset.lmf&&t.dataset.lmf!=='level'&&t.dataset.lmf!=='company'){S.lm[t.dataset.lmf]=t.value}
  else if(t.dataset.rqf&&t.dataset.rqf!=='company'&&t.dataset.rqf!=='by'){S.rq[t.dataset.rqf]=t.value}
  else if(t.dataset.rqnote){S.rqNote[t.dataset.rqnote]=t.value}
  else if(t.dataset.brief&&S.bd[t.dataset.brief]){S.bd[t.dataset.brief].text=t.value}
  else if(t.dataset.ctl==='note'&&S.ctl){S.ctl.note=t.value}
  else if(t.dataset.xf&&S.xe){S.xe.f[t.dataset.xf]=t.value}
  else if(t.dataset.wxrole&&S.wizard){
    var wz=S.wizard,xx=wz.extras;xx[t.dataset.wxrole]=t.value;xx.touched={tools:false,approvals:false,skills:false,plugins:false};
    wz.extras=refreshDefaults(xx,wz.task,pluginNames());
    var rl=resolveRole(effectiveDept(wz.extras,wz.task),wz.extras.designation);wz.brain={own:rl.brainOwn,memory:rl.memory.slice(),note:''};
    render();
  }
  else if(t.dataset.wx&&S.wizard){S.wizard.extras[t.dataset.wx]=t.value}
  else if(t.dataset.wf&&S.wizard&&S.wizard.fields){S.wizard.fields[t.dataset.wf]=t.value}
  else if(t.dataset.w1&&S.wizard){
    var k=t.dataset.w1;S.wizard[k]=t.value;
    if(k==='task'){var before=JSON.stringify(S.wizard.extras);S.wizard.extras=refreshDefaults(S.wizard.extras,t.value,pluginNames());if(JSON.stringify(S.wizard.extras)!==before)render()}
    if(k==='projectId'){S.wizard.brief=(S.projects[t.value]&&S.projects[t.value].brief)||'';render()}
  }
});
document.addEventListener('change',function(e){
  var t=e.target;
  if(t.dataset.flt!==undefined){S.flt=t.value;render()}
  else if(t.dataset.xf&&S.xe){S.xe.f[t.dataset.xf]=t.value;if(t.dataset.xf==='mode'){S.xe.f.scope.mode=t.value;render()}}
  else if(t.dataset.xs){var scx=curScope(t.dataset.own);if(scx){if(t.dataset.xs==='all')scx.all=t.checked;else scx[t.dataset.xs]=tgl(scx[t.dataset.xs]||[],t.value,t.checked);scx.mode='mix';render()}}
  else if(t.dataset.pkg!==undefined){if(t.files&&t.files.length)pkgRead(t.files)}
  else if(t.dataset.pkgsel!==undefined&&S.imp){S.imp.cands[Number(t.dataset.pkgsel)].on=t.checked;render()}
  else if(t.dataset.pkgf&&S.imp){S.imp[t.dataset.pkgf]=t.value}
  else if(t.dataset.give){var gag=S.agents.filter(function(x){return x.id===t.dataset.give})[0],gi=String(t.value).indexOf(':');if(gag&&gi>0)changeScopeFor(t.value.slice(0,gi),t.value.slice(gi+1),gag,'give')}
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
  else if(t.dataset.rqf){S.rq[t.dataset.rqf]=t.value;if(t.dataset.rqf==='company'||t.dataset.rqf==='by'){render()}}
  else if(t.dataset.rqnote){S.rqNote[t.dataset.rqnote]=t.value}
  else if(t.dataset.lmf){S.lm[t.dataset.lmf]=t.value;if(t.dataset.lmf==='level'||t.dataset.lmf==='company'){S.lm.target='';render()}}
  else if(t.dataset.corate){var cr=cleanRate(t.value),og3=orgDoc();if(cr)og3.rates[t.dataset.corate]=cr;else delete og3.rates[t.dataset.corate];S.org=og3;persist('meta','org',og3);render();toast(cr?'Rupee rate saved':'Rupee rate cleared')}
  else if(t.dataset.onb&&true){mutate(t.dataset.onb,function(a:any){setOnboarding(a,t.value,t.checked)})}
  else if(t.dataset.cosite){var cs=String(t.value).trim(),cv=safeUrl(cs);if(cs&&!cv){toast('Use a web address that starts with https://');return}var og=orgDoc();og.companies[t.dataset.cosite]=Object.assign({},og.companies[t.dataset.cosite],{site:cv});S.org=og;persist('meta','org',og);render();toast(cv?'Website saved':'Website cleared')}
  else if(t.dataset.ebm!==undefined&&S.edit){S.edit.f.brain.memory=tgl(S.edit.f.brain.memory,t.value,t.checked)}
  else if(t.dataset.eb&&S.edit){S.edit.f.brain[t.dataset.eb]=t.dataset.eb==='own'?t.checked:t.value}
  else if(t.dataset.wbm!==undefined&&S.wizard){S.wizard.brain=S.wizard.brain||defaultBrain({role:S.wizard.task});S.wizard.brain.memory=tgl(S.wizard.brain.memory,t.value,t.checked)}
  else if(t.dataset.wb&&S.wizard){S.wizard.brain=S.wizard.brain||defaultBrain({role:S.wizard.task});S.wizard.brain[t.dataset.wb]=t.dataset.wb==='own'?t.checked:t.value}
  else if(t.dataset.atid&&S.at){S.at.ids=tgl(S.at.ids,t.dataset.atid,t.checked);atDefaults(S.at);render()}
  else if(t.dataset.atc&&S.at){var ak=t.dataset.atc;S.at.t[ak]=true;S.at[ak]=tgl(S.at[ak],t.value,t.checked)}
  else if(t.dataset.asub!==undefined&&S.at){S.at.t.subs=true;S.at.subs[Number(t.dataset.asub)].on=t.checked}
  else if(t.dataset.asubm!==undefined&&S.at){S.at.t.subs=true;S.at.subs[Number(t.dataset.asubm)].model=t.value}
  else if(t.dataset.atf==='text'&&S.at){S.at.text=t.value;atDefaults(S.at);var pd=document.querySelector('details.plan');if(pd)pd.outerHTML=atPlanHTML()}
  else if(t.dataset.atf&&S.at){S.at[t.dataset.atf]=t.value}
  else if(t.dataset.mvf&&S.mv){S.mv[t.dataset.mvf]=t.value}
  else if(t.dataset.lmf&&t.dataset.lmf!=='level'&&t.dataset.lmf!=='company'){S.lm[t.dataset.lmf]=t.value}
  else if(t.dataset.brief&&S.bd[t.dataset.brief]){S.bd[t.dataset.brief].text=t.value}
  else if(t.dataset.ctl==='hours'&&S.ctl){S.ctl.hours=Number(t.value);S.ctl.custom='';render()}
  else if(t.dataset.ctlBk&&S.ctl){S.ctl.bk[t.dataset.ctlBk]=t.value;render()}
  else if(t.dataset.ctlBackup){var bv=t.value;mutate(t.dataset.ctlBackup,function(a){if(bv)a.backupId=bv;else delete a.backupId})}
  else if(t.dataset.tpct){
    var pp=t.dataset.tpct.split('|'),pv=t.value===''?null:Math.max(0,Math.min(99,Math.round(Number(t.value))));
    mutate(pp[0],function(a){var tt=(a.todos||[])[Number(pp[1])];if(!tt)return;a.todos=a.todos.slice();tt=a.todos[Number(pp[1])]=Object.assign({},tt);if(pv==null||isNaN(pv))delete tt.pct;else{tt.pct=pv;if(tt.status==='todo')tt.status='doing'}tt.updatedAt=Date.now()});
  }
  else if(t.dataset.status){var sv=t.value,sid=t.dataset.status;if(sv==='resting'||sv==='revoked'||sv==='withdrawn')openCtl([sid],sv);else{setStates([sid],sv,{});render()}}
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
    if(S.mv){S.mv=null;render()}
    else if(S.at){S.at=null;render()}
    else if(S.imp){S.imp=null;render()}
    else if(S.xe){S.xe=null;render()}
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
 {id:'haiku55',name:'Claude Haiku 5.5',vendor:'Anthropic',connected:true,note:'Lightest and cheapest Claude model. For simple, well-defined jobs.'},
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
  var h='<div class="pc-head"><span class="av lg">'+esc(initials(a.name))+'</span><div class="grow"><h3>'+esc(a.name)+'</h3><p class="hint">'+esc(a.role||'')+'</p><p class="hint">'+esc(team)+(a.reportsTo?' · reports to '+esc(a.reportsTo):'')+(activeLoan(a)?' · on loan to '+esc(coName(activeLoan(a).to)):'')+'</p></div>'
   +'<div class="btns"><button class="btn small" data-act="edit-open" data-id="'+id+'">Edit</button><button class="btn small" data-act="open-agent" data-id="'+id+'">Full profile</button><button class="btn small" data-act="task-open" data-id="'+id+'">Add task</button><button class="btn small primary" data-act="chat-open" data-id="'+id+'">Talk</button></div></div>';
  h+='<div class="pc-facts"><div><span>Status</span><select class="cell" id="pcs-'+id+'" data-status="'+id+'" aria-label="Status">'+statusOpts(a)+'</select></div>'
   +'<div><span>Model now</span>'+modelSel(a,'now')+'</div><div><span>Model planned</span>'+modelSel(a,'prop')+'</div>'
   +'<div><span>Work done</span><b>'+(g&&g.pct!=null?g.pct+'% ('+g.done+' of '+g.assigned+')':'No tickets of its own')+'</b></div>'
   +'<div><span>Last active</span><b>'+(g&&g.lastActive?esc(g.lastActive)+(g.idleDays!=null?' · '+g.idleDays+' days ago':''):'No record')+'</b></div></div>';
  h+=ctlBlock(a)+appliesBlock(a);
  if(a.purpose)h+=pcSec('Mission','<p>'+esc(a.purpose)+'</p>');
  if(g&&(g.reasons||[]).length)h+=pcSec('Why work is pending',ulN(g.reasons));
  h+='<div class="pc-cols">'+pcSec('Responsibilities',ulN(a.responsibilities))+'<div style="display:flex;flex-direction:column;gap:18px">'+pcSec('May',ulN(a.may))+pcSec('Must not',ulN(a.mustNot))+'</div></div>';
  h+='<div class="pc-cols">'+pcSec('Hands off to','<p>'+esc(a.handsOff||'—')+'</p>')+pcSec('Reads at the start of a run','<p>'+esc(a.reads||'—')+'</p>')+'</div>';
  h+=pcSec('Tools and access',(a.tools||[]).length?'<div class="chips">'+a.tools.map(function(x){return '<span class="chip">'+esc(x)+'</span>'}).join('')+'</div>':'<span class="hint">—</span>');
  var ap=appliedTo(a);
  h+=pcSec('Guardrails and capabilities that apply',(ap.rules.length||ap.items.length)?'<ul class="cl" style="max-height:none">'+ap.rules.map(function(r){return '<li><b>'+ruleLabel(r.type)+':</b> '+esc(r.text)+'</li>'}).join('')+ap.items.map(function(x){return '<li><b>'+kindLabel(x.kind)+':</b> '+esc(x.name)+' <span class="hint">('+esc(x.status)+')</span></li>'}).join('')+'</ul>':'<span class="hint">Nothing set. Add some on the Capabilities page.</span>');
  h+='<div class="pc-cols">'+pcSec('Skills',ulN((a.skills||[]).map(function(z){return z.name+(z.note?': '+z.note:'')})))+pcSec('Routines',ulN((a.routines||[]).map(function(z){return z.name+' · '+(z.cadence||'no cadence')+' · '+(z.state||'planned')})))+'</div>';
  var bb=brainOf(a);
  h+=pcSec('Brain',(bb.own?'<p><b>Own brain</b> <span class="hint">memory kept for this agent alone</span></p>':'<p><b>Shares team memory</b></p>')+'<div class="chips">'+bb.memory.map(function(x:any){return '<span class="chip">'+esc(x)+'</span>'}).join('')+'</div>'+(bb.note?'<p class="hint">'+esc(bb.note)+'</p>':''));
  h+='<div class="pc-cols">'+pcSec('Memory',ulN((a.memory||[]).map(function(z){return z.text})))+pcSec('Docs',ulN((a.docs||[]).map(function(z){return z.title+(z.path?' ['+z.path+']':'')})))+'</div>';
  h+=hrBlock(a);
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
/* ---------- agent controls and live status ---------- */
function stOpt(a,x){return '<option value="'+x+'"'+((a.status==='resting'?effState(a):(a.status||'active'))===x?' selected':'')+'>'+statusLabel(x)+'</option>'}
function statusOpts(a){return ['active','paused','draft'].map(function(x){return stOpt(a,x)}).join('')+'<!--ctl-->'+['resting','revoked','withdrawn'].map(function(x){return stOpt(a,x)}).join('')+'<!--/ctl-->'}
function clock(ms){return new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
function stChip(a){var x=effState(a);return '<span class="stc st-'+x+'">'+esc(STATE_LABEL[x])+(x==='resting'?' · back in '+esc(restLeft(a)):'')+'</span>'}
function stateLines(a){
  var o=[],x=effState(a);
  if(x!=='active')o.push('Your status, set by the founder on this page: '+STATE_LABEL[x]+(x==='resting'?' until '+clock(a.restUntil):'')+'. '+STATE_HELP[x]);
  S.agents.forEach(function(b){
    if(b.id===a.id||isAvailable(b)||effState(b)==='draft')return;
    var c=coverFor(b,S.agents);
    if(c.by&&c.by.id===a.id)o.push('You are covering for '+b.name+' ('+STATE_LABEL[effState(b)]+'). Do their duties as far as your own role and limits allow, and say you are covering.');
  });
  return o;
}
function ctlButtons(a){
  var id=esc(a.id),x=effState(a),h='';
  function b(st,label,cls){return '<button class="btn small'+(cls?' '+cls:'')+'" data-act="st" data-st="'+st+'" data-id="'+id+'">'+label+'</button>'}
  if(x!=='active'&&x!=='draft')h+=b('active',x==='resting'?'End rest now':'Activate','primary');
  if(x==='active'||x==='draft')h+=b('paused','Pause');
  if(x==='active'||x==='draft'||x==='paused')h+=b('resting','Rest…');
  if(x!=='revoked'&&x!=='withdrawn')h+=b('revoked','Revoke…');
  if(x!=='withdrawn')h+=b('withdrawn','Withdraw…');
  return '<div class="ctlbtns">'+h+'</div>';
}
function backupChoices(a,skip){
  var skipIds=skip||[];
  return S.agents.filter(function(x){return x.id!==a.id&&x.projectId===a.projectId&&skipIds.indexOf(x.id)<0&&effState(x)!=='withdrawn'&&effState(x)!=='revoked'});
}
function backupOpts(a,cur){return '<option value="">No backup</option>'+backupChoices(a).map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===cur?' selected':'')+'>'+esc(x.name)+'</option>'}).join('')}
function ctlBlock(a){
  var x=effState(a),id=esc(a.id),h='<!--ctl--><div class="ctl"><div class="ctl-top">'+stChip(a)+'<span class="hint">'+esc(STATE_HELP[x])+(a.statusNote?' Note: '+esc(a.statusNote):'')+'</span></div>'+ctlButtons(a);
  var away=x!=='active'&&x!=='draft',cov=away?coverFor(a,S.agents):null,sug=suggestBackup(a,S.agents),extra='';
  if(cov&&cov.by)extra='<span class="hint">'+esc(cov.by.name)+' is covering.</span>';
  else if(away)extra='<span class="hint bad">Nobody is covering'+(isLead(a)?': the daily loop is not running':'')+'.</span>';
  if(!a.backupId&&sug&&(isLead(a)||away))extra+=' <button class="btn small" data-act="use-backup" data-id="'+id+'" data-bk="'+esc(sug.id)+'">Use '+esc(sug.name)+' as backup</button>';
  h+='<div class="fld ctl-bk"><label for="bk-'+id+'">Backup when away</label><select id="bk-'+id+'" data-ctl-backup="'+id+'">'+backupOpts(a,a.backupId)+'</select>'+extra+'</div></div><!--/ctl-->';
  return h;
}
function coverBanner(){
  var out='';
  S.agents.forEach(function(a){
    var x=effState(a);
    if(!isLead(a)||x==='active'||x==='draft')return;
    var c=coverFor(a,S.agents),sug=suggestBackup(a,S.agents),when=x==='resting'?' until '+clock(a.restUntil)+' (back in '+restLeft(a)+')':'';
    out+='<div class="ctl-alert '+(c.by?'ok':'bad')+'"><div><b>'+esc(a.name)+' is '+STATE_LABEL[x].toLowerCase()+esc(when)+'.</b> '
      +(c.by?esc(c.by.name)+' is covering the daily loop until then.':'Nobody is covering, so the daily loop is not running.')+'</div><div class="ctlbtns">'
      +(c.by?'':(sug&&!a.backupId?'<button class="btn small" data-act="use-backup" data-id="'+esc(a.id)+'" data-bk="'+esc(sug.id)+'">Use '+esc(sug.name)+' as backup</button>':''))
      +'<button class="btn small primary" data-act="st" data-st="active" data-id="'+esc(a.id)+'">'+(x==='resting'?'End rest now':'Activate')+'</button></div></div>';
  });
  return out?'<!--ctl-->'+out+'<!--/ctl-->':'';
}
function pauseWanted(a:any){return ['paused','resting','revoked','withdrawn'].indexOf(a.status)>=0}
function inControl(a:any){var c=S.control;return !!(S.canFeed&&c&&c.repo&&!c.error&&String(a.projectId||'').toLowerCase()===String(c.repo).replace('/','__').toLowerCase())}
async function syncPause(a:any){
  if(!inControl(a))return;
  var key=String(a.id).replace(/^fv_/,''),want=pauseWanted(a);
  try{
    var r=await fetch('/api/control',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({paused:want,agent:key})});
    var j=await r.json();
    if(j&&Array.isArray(j.agents)){S.control=j;render()}else toast('Saved here, but GitHub was not updated'+(j&&j.error==='needs_write'?' (the token needs Issues write)':''));
  }catch(e){toast('Saved here, but GitHub was not updated')}
}
function setStates(ids,status,o){
  o=o||{};var now=Date.now();
  ids.forEach(function(id){
    var a=S.agents.filter(function(x){return x.id===id})[0];if(!a)return;
    a.status=status;
    if(status==='resting')a.restUntil=restUntilFor(o.hours,now);else delete a.restUntil;
    a.statusNote=status==='active'?'':String(o.note||'').trim();
    if(!a.statusNote)delete a.statusNote;
    logStatus(a,status,a.statusNote||'',now);
    if(o.bk&&o.bk[id]!==undefined){if(o.bk[id])a.backupId=o.bk[id];else delete a.backupId}
    persist('agents',a.id,a);syncPause(a);
  });
}
function openCtl(ids,status){
  var c={ids:ids,status:status,hours:1,custom:'',note:'',bk:{}};
  ids.forEach(function(id){
    var a=S.agents.filter(function(x){return x.id===id})[0];if(!a||!isLead(a))return;
    var sg=suggestBackup(a,S.agents);c.bk[id]=a.backupId||(sg&&ids.indexOf(sg.id)<0?sg.id:'');
  });
  S.ctl=c;S.chat&&S.chat.ctl&&S.chat.ctl.abort();render();
}
var CTL_TITLE={paused:'Pause',resting:'Rest',revoked:'Revoke access for',withdrawn:'Withdraw',active:'Activate'};
var CTL_OK={paused:'Pause',resting:'Start rest',revoked:'Revoke access',withdrawn:'Withdraw',active:'Activate'};
function ctlHTML(){
  var c=S.ctl;if(!c)return '';
  var ags=c.ids.map(function(id){return S.agents.filter(function(x){return x.id===id})[0]}).filter(Boolean);
  if(!ags.length)return '';
  var name=ags.length===1?ags[0].name:ags.length+' agents',st=c.status;
  var h='<div class="scrim" data-act="ctl-close"></div><div class="modal" role="dialog" aria-label="'+esc(CTL_TITLE[st]+' '+name)+'"><div class="modal-head"><h2>'+esc(CTL_TITLE[st]+' '+name)+'</h2><p>'+esc(STATE_HELP[st])+'</p></div><div class="modal-body">';
  if(st==='resting'){
    h+='<div class="fld"><span class="lbl">How long should the rest be? It ends by itself and the agent goes back to Active.</span><div class="rest-opts">'
     +REST_CHOICES.map(function(r){return '<label class="rest-opt"><input type="radio" name="rest" data-ctl="hours" value="'+r[0]+'"'+(!c.custom&&Number(c.hours)===r[0]?' checked':'')+'> '+r[1]+'</label>'}).join('')+'</div>'
     +'<label class="rest-other" for="ctl-custom">Or a number of hours: <input type="number" id="ctl-custom" min="0.25" max="336" step="0.25" data-ctl="custom" value="'+esc(c.custom)+'" style="width:90px"></label></div>';
  }
  ags.filter(isLead).forEach(function(a){
    if(st==='active')return;
    var rest=c.ids,cur=c.bk[a.id]||'';
    h+='<div class="fld"><label for="ctl-bk-'+esc(a.id)+'">Who covers for '+esc(a.name)+' while away?</label><select id="ctl-bk-'+esc(a.id)+'" data-ctl-bk="'+esc(a.id)+'"><option value="">Nobody</option>'
     +backupChoices(a,rest).map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===cur?' selected':'')+'>'+esc(x.name)+(isAvailable(x)?'':' ('+STATE_LABEL[effState(x)]+')')+'</option>'}).join('')+'</select>'
     +(cur?'':'<span class="hint bad">With nobody covering, the daily loop stops until '+esc(a.name)+' is back.</span>')+'</div>';
  });
  if(st!=='active')h+='<div class="fld"><label for="ctl-note">Reason (optional)</label><textarea id="ctl-note" rows="2" data-ctl="note" placeholder="For example: waiting for my review">'+esc(c.note)+'</textarea></div>';
  h+='<p class="hint">This records your decision on this page and tells the agent in chat. It does not switch off a scheduled run that lives somewhere else; pause that where it is set up.</p></div>'
   +'<div class="modal-foot"><button class="btn" data-act="ctl-close">Cancel</button><button class="btn primary" data-act="ctl-ok">'+esc(CTL_OK[st])+'</button></div></div>';
  return h;
}
function ctlApply(){
  var c=S.ctl;if(!c)return;
  var hrs=c.status==='resting'?(Number(c.custom)>0?Number(c.custom):Number(c.hours)):0;
  if(c.status==='resting'&&!(hrs>0)){toast('Choose or enter a rest time');return}
  var n=c.ids.length;
  setStates(c.ids,c.status,{hours:hrs,note:c.note,bk:c.bk});
  S.ctl=null;render();
  toast((c.status==='resting'?'Resting for '+(hrs<1?Math.round(hrs*60)+' minutes':hrs+(hrs===1?' hour':' hours')):STATE_LABEL[c.status])+(n>1?' · '+n+' agents':''));
}
function pbar(state,p,lg){
  var inner=(state==='running'&&p==null)?'<i class="ind"></i>':'<i style="width:'+(p||0)+'%"></i>';
  return '<div class="pbar s-'+state+(lg?' lg':'')+'" role="progressbar" aria-valuemin="0" aria-valuemax="100"'+(p==null?'':' aria-valuenow="'+p+'"')+' aria-label="'+(p==null?'In progress, no percentage recorded':p+' percent')+'">'+inner+'</div>';
}
var TS_LABEL={running:'Running',queued:'Queued',paused:'Paused',waiting:'Waiting',done:'Done'};
function rollText(r){
  var b=[];['running','queued','paused','waiting'].forEach(function(k){if(r[k])b.push(r[k]+' '+k)});
  return r.done+' of '+r.n+' done'+(b.length?' · '+b.join(' · '):'');
}
function taskRow(x){
  var t=x.t,a=x.a,s=taskState(t,a),p=taskPct(t,s),id=esc(a.id);
  var why=s==='paused'?'Agent is '+STATE_LABEL[effState(a)].toLowerCase():(s==='waiting'||s==='queued')&&t.note?t.note:'';
  return '<div class="lv-task"><div class="lv-tt"><span class="lv-text">'+esc(t.text)+'</span><span class="stc ts-'+s+'">'+TS_LABEL[s]+'</span></div>'+pbar(s,p)
   +'<div class="lv-meta"><span>'+(p==null?(s==='paused'?'Paused, no percentage recorded':'In progress, no percentage recorded'):p+'% complete')+(why?' · '+esc(why):'')+'</span>'
   +(s==='done'?'':'<label class="lv-set">Set progress <input type="number" min="0" max="99" data-tpct="'+id+'|'+x.i+'" value="'+(t.pct==null?'':esc(t.pct))+'" aria-label="Progress percent for '+esc(t.text)+'"> %</label>')+'</div></div>';
}
function liveAgent(a,T){
  var id=esc(a.id),x=effState(a),items=(a.todos||[]).map(function(t,i){return {a:a,t:t,i:i}}),r=roll(items);
  var h='<div class="lv-agent"><div class="lv-ah"><div class="grow"><b>'+esc(a.name)+'</b> '+stChip(a)+'<span class="hint"> '+esc(a.role||'')+'</span></div><button class="btn small" data-act="task-open" data-id="'+id+'">Add task</button>'+ctlButtons(a)+'</div>';
  if(x==='withdrawn'){return h+'<span class="hint">Off the team. Its '+items.length+' ticket'+(items.length===1?'':'s')+' are not counted.</span></div>'}
  if(!items.length)return h+'<span class="hint">No tickets assigned.</span></div>';
  var shown=S.liveOpen[a.id]?items:items.filter(function(y){var s=taskState(y.t,a);return s==='running'||s==='paused'}).slice(0,6);
  h+=pbar(r.running?'running':r.paused?'paused':'queued',r.pct)+'<div class="lv-meta"><span><b>'+r.pct+'%</b> overall · '+esc(rollText(r))+'</span><button class="linkbtn" data-act="live-toggle" data-id="'+id+'">'+(S.liveOpen[a.id]?'Show only active tickets':'Show all '+items.length+' tickets')+'</button></div>';
  h+=shown.length?'<div class="lv-tasks">'+shown.map(taskRow).join('')+'</div>':'<p class="hint">Nothing running right now.</p>';
  return h+'</div>';
}
function bulkBtns(ids,label){
  var s=ids.join(',');
  return '<div class="ctlbtns"><button class="btn small" data-act="st-bulk" data-st="active" data-ids="'+esc(s)+'">Activate '+label+'</button><button class="btn small" data-act="st-bulk" data-st="paused" data-ids="'+esc(s)+'">Pause '+label+'</button><button class="btn small" data-act="st-bulk" data-st="resting" data-ids="'+esc(s)+'">Rest '+label+'…</button></div>';
}
function liveView(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var all=[];list.forEach(function(a){(a.todos||[]).forEach(function(t,i){all.push({a:a,t:t,i:i})})});
  var r=roll(all),T=buildTree(list);
  var h='<div class="lv"><div class="lv-all"><div class="lv-ah"><div class="grow"><h2>Overall progress</h2><p class="hint">'+r.pct+'% complete · '+esc(rollText(r))+'</p></div>'+bulkBtns(list.map(function(a){return a.id}),'everyone')+'</div>'+pbar(r.running?'running':r.paused?'paused':'queued',r.pct,true)
   +(r.unmeasured?'<p class="hint">'+r.unmeasured+' running ticket'+(r.unmeasured===1?' has':'s have')+' no percentage yet, so the overall figure counts them as 0%. Type a percentage on a ticket to record one.</p>':'')+'</div>';
  T.roots.forEach(function(root){
    var ags=[];(function walk(a){ags.push(a);(T.kids[a.id]||[]).forEach(walk)})(root);
    var its=[];ags.forEach(function(a){(a.todos||[]).forEach(function(t,i){its.push({a:a,t:t,i:i})})});
    var tr=roll(its);
    h+='<section class="lv-team"><div class="lv-ah"><div class="grow"><h3>'+esc(root.name)+'</h3><p class="hint">'+ags.length+' agent'+(ags.length===1?'':'s')+' · '+tr.pct+'% · '+esc(rollText(tr))+'</p></div>'+bulkBtns(ags.map(function(a){return a.id}),'team')+'</div>'+pbar(tr.running?'running':tr.paused?'paused':'queued',tr.pct)
     +'<div class="lv-agents">'+ags.map(function(a){return liveAgent(a,T)}).join('')+'</div></section>';
  });
  h+='<p class="hint">A bar fills when someone records progress on a ticket here or the status snapshot is refreshed; a moving stripe means running with no percentage recorded. Pause, rest, revoke and withdraw record your decision on this page and in each agent\'s chat; they do not stop a scheduled run elsewhere.</p></div>';
  return h;
}
/* ---------- add a task ---------- */
function atFirst(){var c=S.at;return c&&c.ids.length?S.agents.filter(function(a:any){return a.id===c.ids[0]})[0]:null}
function atModels(){return modelList().map(function(m:any){return {id:m.id,name:m.name,connected:m.connected}})}
function atDefaults(c:any){
  var a=atFirst(),E=ext(),ap=a?appliedTo(a):{rules:[],items:[]};
  if(!c.t.tools)c.tools=(a&&(a.tools||[]).length?a.tools.slice():defaultExtras(c.text).tools.slice());
  if(!c.t.skills)c.skills=uniq((a?(a.skills||[]).map(function(x:any){return x.name}):[]).concat(ap.items.filter(function(x:any){return x.kind==='skill'}).map(function(x:any){return x.name})));
  if(!c.t.plugins)c.plugins=uniq(ap.items.filter(function(x:any){return x.kind==='plugin'||x.kind==='mcp'}).map(function(x:any){return x.name}));
  if(!c.t.memory)c.memory=(a?brainOf(a):defaultBrain({role:c.text})).memory.slice();
  if(!c.t.subs){
    var sg=suggestSubs(c.text,atModels(),S.agents,a||undefined);
    c.subs=sg.map(function(x:any){return Object.assign({on:true},x)});
    allHelpers(atModels()).forEach(function(h:any){if(!c.subs.some(function(x:any){return x.key===h.key}))c.subs.push(Object.assign({on:false},h))});
  }
}
function uniq(l:any){var o:any=[];l.forEach(function(x:any){if(x&&o.indexOf(x)<0)o.push(x)});return o}
function taskOpen(id:any){
  S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.edit=null;S.xe=null;S.imp=null;S.modelsOpen=false;
  S.at={ids:id?[id]:[],text:'',due:'',note:'',state:'todo',priority:'Normal',done:'',model:'auto',q:'',t:{},tools:[],skills:[],plugins:[],memory:[],subs:[]};
  atDefaults(S.at);render();
  var t=byId('at-text');if(t)t.focus();
}
function atChecks(kind:string,opts:any,sel:any){
  var all=uniq(opts.concat(sel));
  return '<div class="checks">'+all.map(function(o:any,i:number){var id='at-'+kind+'-'+i;return '<label for="'+id+'"><input type="checkbox" id="'+id+'" data-atc="'+kind+'" value="'+esc(o)+'"'+(sel.indexOf(o)>=0?' checked':'')+'>'+esc(o)+'</label>'}).join('')+'</div>';
}
function atPlanHTML(){
  var c=S.at,a=atFirst(),E=ext(),L=modelList(),lead=a&&isLeaderT(a),rec=recommendModel(c.text,atModels(),!!lead);
  var h='<details class="plan" open><summary>How it should be done <span class="hint">defaults are chosen from the task and the first agent; untick what does not apply</span></summary>';
  h+='<div class="fld"><label>Tools and access</label>'+atChecks('tools',TOOL_OPTIONS.slice(),c.tools)+'</div>';
  var skillOpts=E.items.filter(function(x:any){return x.kind==='skill'}).map(function(x:any){return x.name}),plugOpts=E.items.filter(function(x:any){return x.kind==='plugin'||x.kind==='mcp'}).map(function(x:any){return x.name});
  h+='<div class="fld"><label>Skills</label>'+(skillOpts.length||c.skills.length?atChecks('skills',skillOpts,c.skills):'<span class="hint">No skills registered yet. Add some under Capabilities.</span>')+'</div>';
  h+='<div class="fld"><label>Plugins and connectors</label>'+(plugOpts.length||c.plugins.length?atChecks('plugins',plugOpts,c.plugins):'<span class="hint">No plugins registered yet. Add some under Capabilities.</span>')+'</div>';
  h+='<div class="fld"><label>Memory it may use'+(a?' <span class="hint">'+(brainOf(a).own?'this agent has its own brain':'this agent shares the team memory')+'</span>':'')+'</label>'+atChecks('memory',MEMORY_OPTIONS.slice(),c.memory)+'</div>';
  h+='<div class="fld"><label for="at-model">Model</label><select id="at-model" data-atf="model"><option value="auto"'+(c.model==='auto'?' selected':'')+'>Recommended'+(rec.id?': '+esc(mn(rec.id)):'')+'</option>'+L.filter(function(m:any){return m.connected}).map(function(m:any){return '<option value="'+esc(m.id)+'"'+(c.model===m.id?' selected':'')+'>'+esc(m.name)+'</option>'}).join('')+'</select>'
   +'<span class="hint">'+(c.model==='auto'?esc(rec.why)+(c.ids.length>1?' Each agent gets its own recommendation.':''):'Your choice. The recommendation would be '+esc(mn(rec.id))+'.')+'</span></div>';
  h+='<div class="fld"><label>Helper agents (subagents) for this task</label><p class="hint">Cheapest model that is accurate enough comes first. Tick the ones you want, change a model if you like. Skills may later do some of this work for less.</p><div class="subs">'
   +c.subs.map(function(x:any,i:number){return '<div class="sub-row"><label><input type="checkbox" data-asub="'+i+'"'+(x.on?' checked':'')+'> <b>'+esc(x.name)+'</b> <small class="hint">'+esc(x.task)+(x.agentId?' · existing agent':'')+'</small></label><select data-asubm="'+i+'" aria-label="Model for '+esc(x.name)+'">'+L.filter(function(m:any){return m.connected||m.id===x.model}).map(function(m:any){return '<option value="'+esc(m.id)+'"'+(x.model===m.id?' selected':'')+'>'+esc(m.name)+'</option>'}).join('')+'</select><small class="hint">'+esc(x.why)+'</small></div>'}).join('')+'</div></div>';
  h+='</details>';
  return h;
}
function addTaskHTML(){
  var c=S.at;if(!c)return '';
  var tm=teamIndex(),q=String(c.q||'').toLowerCase(),a=atFirst(),E=ext(),L=modelList();
  var shown=S.agents.slice().sort(function(a:any,b:any){return String(tm[a.id]||'').localeCompare(String(tm[b.id]||''))||String(a.name).localeCompare(String(b.name))}).filter(function(a:any){return !q||(a.name+' '+(tm[a.id]||'')).toLowerCase().indexOf(q)>=0});
  var lead=a&&isLeaderT(a),rec=recommendModel(c.text,atModels(),!!lead);
  var h='<div class="scrim" data-act="task-close"></div><div class="modal wide" role="dialog" aria-label="Add a task"><div class="modal-head"><h2>Add a task</h2><p>'+(c.ids.length===1?'For '+esc(a&&a.name||'one agent'):c.ids.length?'For '+c.ids.length+' agents':'Choose who it is for')+'</p></div><div class="modal-body">';
  h+='<div class="fld"><label for="at-text">What needs doing</label><textarea id="at-text" rows="3" data-atf="text" placeholder="For example Review the open pull requests">'+esc(c.text)+'</textarea></div>'
   +'<div class="two"><div class="fld"><label for="at-due">Due date (optional)</label><input type="date" id="at-due" data-atf="due" value="'+esc(c.due)+'"></div>'
   +'<div class="fld"><label for="at-pri">Priority</label><select id="at-pri" data-atf="priority">'+['Low','Normal','High','Urgent'].map(function(o){return '<option'+(c.priority===o?' selected':'')+'>'+o+'</option>'}).join('')+'</select></div></div>'
   +'<div class="two"><div class="fld"><label for="at-state">Start as</label><select id="at-state" data-atf="state"><option value="todo"'+(c.state==='todo'?' selected':'')+'>Queued (not started)</option><option value="doing"'+(c.state==='doing'?' selected':'')+'>Running (already started)</option></select></div>'
   +'<div class="fld"><label for="at-note">Note (optional)</label><input type="text" id="at-note" data-atf="note" value="'+esc(c.note)+'" placeholder="Anything the agent should know"></div></div>'
   +'<div class="fld"><label for="at-done">Done when (optional)</label><input type="text" id="at-done" data-atf="done" value="'+esc(c.done)+'" placeholder="How you will know it is finished"></div>';
  h+='<div class="fld"><label for="at-q">Who is it for? <span class="hint">'+c.ids.length+' chosen</span></label><input type="text" id="at-q" data-atq placeholder="Search by name or team" value="'+esc(c.q)+'"><div class="pickbox">'
   +(shown.map(function(a:any){return '<label><input type="checkbox" data-atid="'+esc(a.id)+'"'+(c.ids.indexOf(a.id)>=0?' checked':'')+'> '+esc(a.name)+' <small class="hint">'+esc(tm[a.id]||'')+(isLeaderT(a)?' · own brain':'')+'</small></label>'}).join('')||'<span class="hint">No one matches.</span>')+'</div>'
   +'<div class="ctlbtns"><button class="btn small" data-act="task-all">Select everyone shown</button><button class="btn small" data-act="task-none">Clear</button></div></div>';
  h+=atPlanHTML();
  h+='<p class="hint">Each agent gets its own copy to track. These choices are recorded on the task and told to the agent in chat. They do not change the real role files or start any run.</p></div>'
   +'<div class="modal-foot"><button class="btn" data-act="task-close">Cancel</button><button class="btn primary" data-act="task-add">Add task'+(c.ids.length>1?' to '+c.ids.length+' agents':'')+'</button></div></div>';
  return h;
}
function taskAdd(){
  var c=S.at;if(!c)return;
  if(!String(c.text).trim()){toast('Write the task');return}
  if(!c.ids.length){toast('Choose who it is for');return}
  var now=Date.now(),n=0,subs=c.subs.filter(function(x:any){return x.on}).map(function(x:any){return {name:x.name,agentId:x.agentId,model:x.model,why:x.why}});
  c.ids.forEach(function(id:any){
    var a=S.agents.filter(function(x:any){return x.id===id})[0];if(!a)return;
    var r=recommendModel(c.text,atModels(),isLeaderT(a)),model=c.model==='auto'?r.id:c.model,why=c.model==='auto'?r.why:'Chosen by you.';
    var plan:any={priority:c.priority,tools:c.tools.slice(),skills:c.skills.slice(),plugins:c.plugins.slice(),memory:c.memory.slice(),model:model,modelWhy:why,subs:subs.filter(function(x:any){return x.agentId!==id})};
    if(String(c.done).trim())plan.done=String(c.done).trim();
    var t:any={text:String(c.text).trim(),status:c.state==='doing'?'doing':'todo',addedBy:'founder',updatedAt:now,plan:plan};
    if(c.due)t.due=c.due;
    var nt=[c.priority!=='Normal'?c.priority+' priority':'','Model '+mn(model),plan.subs.length?'Helpers: '+plan.subs.map(function(x:any){return x.name}).join(', '):'',String(c.note).trim()].filter(Boolean).join(' · ');
    if(nt)t.note=nt;
    a.todos=(a.todos||[]).concat([t]);persist('agents',a.id,a);n++;
  });
  S.at=null;render();toast('Added to '+n+' agent'+(n===1?'':'s'));
}
/* ---------- GitHub feed and the real pause switch ---------- */
function liveInfo(){
  var f=S.feed,prs=0;
  if(f&&f.repos)Object.keys(f.repos).forEach(function(k:any){prs+=(f.repos[k]&&f.repos[k].openPRs)||0});
  return {live:!!(f&&f.fetchedAt),prs:prs,paused:!!(S.control&&S.control.paused)};
}
var FEED_ERR:any={no_access:'the GitHub token cannot read this repo',needs_reauth:'GitHub rejected the token',upstream_error:'GitHub did not answer',bad_repo:'the repo name is not valid'};
function agoMs(ms:any){var m=Math.max(0,Math.round((Date.now()-ms)/60000));return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago'}
function progressHeader(){
  var f=S.feed,c=S.control,h='<div class="pg-head">';
  // the real pause switch
  h+='<div class="pg-card"><h3>Agent control</h3>';
  if(!S.canFeed)h+='<p class="hint">GitHub is not connected to this site, so it cannot pause or resume the agents for real. Add a <span class="mono">GITHUB_TOKEN</span> in Vercel, then redeploy.</p>';
  else if(!c)h+='<p class="hint">Checking GitHub…</p>';
  else if(c.error)h+='<p class="hint bad">'+esc(c.error==='needs_write'?'The token can read but not change the Agent control issue. Give it Issues: read and write on '+c.repo+'.':c.error==='no_access'?'The token cannot see '+c.repo+'.':'Could not reach GitHub ('+c.error+').')+'</p>';
  else{
    h+='<p><span class="stc '+(c.paused?'st-revoked':'st-active')+'">'+(c.paused?'Paused':'Allowed to run')+'</span> <span class="hint">'+(c.paused?'The label '+esc(c.label)+' is on '+esc(c.repo)+' issue #'+c.issue+'. Agents stop at the start of their next run.':'No pause label on '+esc(c.repo)+' issue #'+c.issue+'.')+'</span></p>';
    if(S.pgConfirm)h+='<p><b>'+(S.pgConfirm==='pause'?'Pause every agent?':'Let every agent run again?')+'</b> This changes the real label on GitHub.</p><div class="ctlbtns"><button class="btn small primary" data-act="pg-do" data-what="'+esc(S.pgConfirm)+'">'+(S.pgConfirm==='pause'?'Yes, pause all':'Yes, resume all')+'</button><button class="btn small" data-act="pg-cancel">Cancel</button></div>';
    else h+='<div class="ctlbtns"><button class="btn small'+(c.paused?' primary':'')+'" data-act="pg-ask" data-what="'+(c.paused?'resume':'pause')+'">'+(c.paused?'Resume all agents':'Pause all agents')+'</button></div>';
  }
  var pa=(c&&c.agents)||[];
  if(pa.length)h+='<p class="hint">Paused one by one on GitHub: '+esc(pa.join(', '))+'</p>';
  h+='<p class="hint">"Pause all" is the switch the agents check today. Pause, Rest and Revoke on a person also set a label <span class="mono">agent-paused:name</span> on the same issue, so the decision is on GitHub. An agent only stops for it once its role file says to look for that label.</p></div>';
  // the ticket feed
  h+='<div class="pg-card"><h3>Ticket status from GitHub</h3>';
  if(!S.canFeed)h+='<p class="hint">Not connected. The numbers are the snapshot of '+esc((S.report&&S.report.asOf)||'the last import')+'.</p>';
  else{
    h+='<p class="hint">'+(f&&f.fetchedAt?'Refreshed '+esc(agoMs(f.fetchedAt))+'. It refreshes by itself every few minutes while this page is open, and once a day otherwise.':'Not refreshed yet. The numbers are the snapshot of '+esc((S.report&&S.report.asOf)||'the last import')+'.')+'</p>';
    if(f&&f.repos)Object.keys(f.repos).forEach(function(k:any){
      var r=f.repos[k];
      h+='<p class="hint">'+esc(k.split('/')[1])+': '+(r.ok?(r.issues+' tickets, '+r.matched+' matched to an agent'+(r.openPRs?', '+r.openPRs+' pull request'+(r.openPRs===1?'':'s')+' open':'')+(r.unmatched?'. '+r.unmatched+' open tickets have no agent here':'')):'<span class="bad">'+esc(FEED_ERR[r.error]||r.error||'failed')+'</span>')+'</p>';
    });
    h+='<div class="ctlbtns"><button class="btn small" data-act="feed-refresh"'+(S.feedBusy?' disabled':'')+'>'+(S.feedBusy?'Refreshing…':'Refresh now')+'</button></div>';
  }
  return h+'</div></div>';
}
async function refreshFeed(quiet:any){
  if(!S.canFeed||S.feedBusy)return;
  S.feedBusy=true;if(!quiet)render();
  try{
    var r=await fetch('/api/feed',{method:'POST',credentials:'same-origin'});
    if(!r.ok)throw new Error('http_'+r.status);
    var j=await r.json();S.feed=j;DB&&DB.refresh&&DB.refresh();
    if(!quiet)toast('Updated from GitHub');
  }catch(e:any){if(!quiet)toast('Could not refresh from GitHub')}
  S.feedBusy=false;render();
}
async function loadControl(){
  if(!S.canFeed)return;
  try{
    var r=await fetch('/api/control',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)return;
    var j=await r.json(),a=JSON.stringify(S.control);
    S.control=j.configured===false?null:j;
    if(JSON.stringify(S.control)!==a)render();
  }catch(e){}
}
async function setPause(paused:any){
  S.pgConfirm='';
  try{
    var r=await fetch('/api/control',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({paused:paused})});
    var j=await r.json();
    if(j&&typeof j.paused==='boolean'){S.control=j;toast(paused?'All agents paused':'Agents may run again')}
    else{S.control=j&&j.error?Object.assign({},S.control||{},j):S.control;toast(j&&j.error==='needs_write'?'The token cannot change that issue (needs Issues: write)':'Could not change it')}
  }catch(e){toast('Could not reach GitHub')}
  render();
}
/* ---------- companies, org chart, loans and the HR file ---------- */
function orgDoc(){var o=S.org?clone(S.org):{};if(!o.companies)o.companies={};if(!Array.isArray(o.limits))o.limits=[];if(!o.rates)o.rates={};return o}
function agentName(id:any){var a=S.agents.filter(function(x:any){return x.id===id})[0];return a?a.name:id}
/* Returns true when the change keeps every limit. Otherwise it explains once and lets the owner approve going over by repeating the action. */
function gate(who:any,units:any,holder:any,key:string){
  var o=orgDoc(),c=hireCheck(o.limits,o.rates,S.agents,who,units,agentName);
  if(c.ok){holder.overOk='';holder.err='';return true}
  if(holder.overOk===key){holder.overOk='';holder.err='';return true}
  holder.overOk=key;holder.err='This goes over a limit you set: '+c.reasons.join('; ')+'. Repeat the same action to approve going over.';render();return false;
}
function isoPlus(days:any){return new Date(Date.now()+days*86400000).toISOString().slice(0,10)}
function coName(id:any){var n=fullName(id);return n.indexOf('/')>=0?n.split('/')[1]:n}
function companyIds(){var o:any=[];S.agents.forEach(function(a:any){if(o.indexOf(a.projectId)<0)o.push(a.projectId)});return o.sort(function(a:any,b:any){return coName(a).localeCompare(coName(b))})}
function siteOf(id:any){
  var m=safeUrl(((S.org&&S.org.companies&&S.org.companies[id])||{}).site);if(m)return m;
  var r=S.feed&&S.feed.repos&&S.feed.repos[String(id).replace('__','/')];return (r&&safeUrl(r.site))||'';
}
function siteBtn(id:any){var u=siteOf(id);return u?'<a class="btn small primary" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">Open site ↗</a>':'<span class="hint">No website found yet</span>'}
function stDot(a:any){var st=effState(a);return '<span class="stc st-'+esc(st)+'">'+esc(statusLabel(st))+'</span>'}
function orgNode(a:any,T:any,depth:number){
  if(depth>8)return '';
  var kids=T.kids[a.id]||[],ln=activeLoan(a);
  return '<li><button class="nm" data-act="open-agent" data-id="'+esc(a.id)+'">'+esc(a.name)+'</button> <span class="hint">'+esc(a.role||'')+'</span> '+stDot(a)
   +(ln?' <span class="pill mute">on loan to '+esc(coName(ln.to))+' until '+esc(ln.until)+'</span>':'')+(a.bench?' <span class="pill mute">shared bench</span>':'')
   +(kids.length?'<ul>'+kids.map(function(k:any){return orgNode(k,T,depth+1)}).join('')+'</ul>':'')+'</li>';
}
function orgView(list:any){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!list.length)return emptyHTML();
  var T=buildTree(list),ids:any=[];list.forEach(function(a:any){if(ids.indexOf(a.projectId)<0)ids.push(a.projectId)});ids.sort(function(a:any,b:any){return coName(a).localeCompare(coName(b))});
  var seg='<span class="seg" role="group" aria-label="Group by" style="margin-bottom:10px;display:inline-flex">'+[['line','Reporting line'],['dept','Departments'],['tech','Technologies'],['flat','Flat list']].map(function(o:any){return '<button class="btn small" data-act="orgby" data-by="'+o[0]+'" aria-pressed="'+(S.orgBy===o[0])+'">'+o[1]+'</button>'}).join('')+'</span>';
  if(S.orgBy!=='line')return seg+orgAlt(list,ids,S.orgBy);
  var h=seg+'<div class="orgc"><div class="org-top"><b>You</b><span class="hint">owner of every company below</span></div><ul class="org-root">';
  ids.forEach(function(pid:any){
    var roots=T.roots.filter(function(r:any){return r.projectId===pid}),bor=list.filter(function(a:any){var l=activeLoan(a);return l&&l.to===pid&&a.projectId!==pid});
    h+='<li><div class="org-co"><b>'+esc(coName(pid))+'</b> <span class="hint">'+list.filter(function(a:any){return a.projectId===pid}).length+' people</span> '+siteBtn(pid)+'</div>'
     +(roots.length?'<ul>'+roots.map(function(r:any){return orgNode(r,T,0)}).join('')+'</ul>':'<p class="hint">No one in this company yet.</p>')
     +(bor.length?'<p class="hint">Borrowed from other companies</p><ul>'+bor.map(function(a:any){var l=activeLoan(a);return '<li><button class="nm" data-act="open-agent" data-id="'+esc(a.id)+'">'+esc(a.name)+'</button> <span class="hint">from '+esc(coName(a.projectId))+' until '+esc(l.until)+' · '+esc(l.reason)+'</span></li>'}).join('')+'</ul>':'')+'</li>';
  });
  h+='</ul></div>';
  var bench=list.filter(function(a:any){return a.bench});
  if(bench.length)h+='<div class="block"><h2>Shared bench · '+bench.length+'</h2><p class="hint">Available to any company. Lend them from the Companies tab.</p><ul class="cl">'+bench.map(function(a:any){return '<li><button class="nm" data-act="open-agent" data-id="'+esc(a.id)+'">'+esc(a.name)+'</button> <span class="hint">'+esc(a.role||'')+' · home '+esc(coName(a.projectId))+'</span></li>'}).join('')+'</ul></div>';
  return h+'<p class="hint">This chart is built from each agent\'s Reports to line and company. It is a record on this page, not the real role files.</p>';
}
function agentChip(a:any,extra?:any){var ln=activeLoan(a);return '<button class="nm" data-act="open-agent" data-id="'+esc(a.id)+'">'+esc(a.name)+'</button> '+stDot(a)+(ln?' <span class="pill mute">on loan</span>':'')+(extra?' <span class="hint">'+extra+'</span>':'')}
function orgAlt(list:any,ids:any,mode:string){
  var h='';
  if(mode==='dept'){
    var all=groupBy(list,function(a:any){return [deptOf(a)]});
    h+='<div class="chips" style="margin-bottom:10px">'+all.map(function(g:any){var cs:any=[];g[1].forEach(function(a:any){if(cs.indexOf(a.projectId)<0)cs.push(a.projectId)});return '<span class="chip">'+esc(g[0])+' · '+g[1].length+(cs.length>1?' in '+cs.length+' companies':'')+'</span>'}).join('')+'</div>';
    ids.forEach(function(pid:any){
      var home=list.filter(function(a:any){return a.projectId===pid});
      h+='<div class="block" style="margin-bottom:14px"><h2>'+esc(coName(pid))+' <span class="hint">'+home.length+' people</span> '+siteBtn(pid)+'</h2><div class="gc">'
       +groupBy(home,function(a:any){return [deptOf(a)]}).map(function(g:any){return '<div class="cd"><div class="cd-h"><b>'+esc(g[0])+'</b><span class="hint"> '+g[1].length+'</span></div><ul class="cl" style="max-height:none">'+g[1].map(function(a:any){return '<li>'+agentChip(a,esc(a.role||''))+'</li>'}).join('')+'</ul></div>'}).join('')+'</div></div>';
    });
  }else if(mode==='tech'){
    var tg=groupBy(list,function(a:any){var t=techOf(a);return t.length?t:['Not stated']});
    h+='<div class="gc">'+tg.map(function(g:any){return '<div class="cd"><div class="cd-h"><b>'+esc(g[0])+'</b><span class="hint"> '+g[1].length+'</span></div><ul class="cl" style="max-height:none">'+g[1].map(function(a:any){return '<li>'+agentChip(a,esc(coName(a.projectId)))+'</li>'}).join('')+'</ul></div>'}).join('')+'</div>';
  }else{
    h+='<div class="sheetwrap"><table class="sheet"><thead><tr><th>Name</th><th>Company</th><th>Department</th><th>Reports to</th><th>Status</th><th>Technologies</th></tr></thead><tbody>'+list.slice().sort(function(a:any,b:any){return coName(a.projectId).localeCompare(coName(b.projectId))||deptOf(a).localeCompare(deptOf(b))||String(a.name).localeCompare(String(b.name))}).map(function(a:any){return '<tr><td>'+agentChip(a)+'</td><td>'+esc(coName(a.projectId))+'</td><td>'+esc(deptOf(a))+'</td><td>'+esc(a.reportsTo||'')+'</td><td>'+esc(statusLabel(effState(a)))+'</td><td>'+esc(techOf(a).join(', '))+'</td></tr>'}).join('')+'</tbody></table></div>';
  }
  return h+'<p class="hint">Departments and technologies are worked out from each role and its tools. Set them yourself in Edit if the guess is wrong.</p>';
}
function companiesView(list:any){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  if(!S.agents.length)return emptyHTML();
  var ids=companyIds(),st=companyStats(S.agents,ids),h='<div class="gc">';
  st.forEach(function(c:any){
    var pid=c.id,fr=S.feed&&S.feed.repos&&S.feed.repos[String(pid).replace('__','/')],pct=c.assigned?Math.round(100*c.done/c.assigned):null,T=buildTree(S.agents.filter(function(a:any){return a.projectId===pid})),head=T.roots[0];
    var man=((S.org&&S.org.companies&&S.org.companies[pid])||{}).site||'';
    h+='<div class="cd"><div class="cd-h"><div class="grow"><b>'+esc(coName(pid))+'</b><small class="hint" style="display:block">'+(head?'Led by '+esc(head.name):'No head yet')+'</small></div>'+siteBtn(pid)+'<button class="btn small" data-act="co-brief" data-id="'+esc(pid)+'">Brief</button></div>'
     +'<div class="chips"><span class="chip">'+c.total+' people</span><span class="chip">'+c.active+' active</span>'+(c.resting?'<span class="chip">'+c.resting+' resting</span>':'')+(c.paused?'<span class="chip">'+c.paused+' paused</span>':'')+(c.loanedOut?'<span class="chip">'+c.loanedOut+' lent out</span>':'')+(c.loanedIn?'<span class="chip">'+c.loanedIn+' borrowed</span>':'')+(c.bench?'<span class="chip">'+c.bench+' on bench</span>':'')+(fr&&fr.openPRs?'<span class="chip">'+fr.openPRs+' open pull requests</span>':'')+'</div>'
     +(function(){var u=companyUsage(S.agents,pid),rt=(orgDoc().rates||{})[pid],rr=rupees(u.units,rt);return '<p class="hint">Using '+u.heads+' agents and '+u.units+' capacity units'+(rr?' (about ₹'+rr+' a month)':'')+'.</p>'})()
     +(pct!=null?'<div class="pbar" role="progressbar" aria-valuenow="'+pct+'" aria-valuemin="0" aria-valuemax="100"><i style="width:'+pct+'%"></i></div><p class="hint">'+c.done+' of '+c.assigned+' tickets done ('+pct+'%)</p>':'<p class="hint">No tickets recorded.</p>')
     +'<div class="fld"><label for="cs-'+esc(pid)+'">Website address (overrides what GitHub reports)</label><input type="text" id="cs-'+esc(pid)+'" data-cosite="'+esc(pid)+'" value="'+esc(man)+'" placeholder="https://your-site.vercel.app"></div>'
     +'<div class="fld"><label for="cr-'+esc(pid)+'">Rupees per capacity unit per month (optional)</label><input type="text" id="cr-'+esc(pid)+'" data-corate="'+esc(pid)+'" value="'+esc(((orgDoc().rates||{})[pid])||'')+'" placeholder="Leave empty to count units only"></div></div>';
  });
  h+='</div>'+limitsBlock();
  var bench=S.agents.filter(function(a:any){return a.bench}),loans=S.agents.filter(function(a:any){return activeLoan(a)});
  h+='<div class="block" style="margin-top:16px"><h2>Shared bench · '+bench.length+'</h2><p class="hint">Agents any company may borrow. Put someone on the bench from their HR file.</p>'
   +(bench.length?'<ul class="cl">'+bench.map(function(a:any){return '<li><button class="nm" data-act="open-agent" data-id="'+esc(a.id)+'">'+esc(a.name)+'</button> <span class="hint">'+esc(a.role||'')+' · home '+esc(coName(a.projectId))+'</span> <button class="btn small" data-act="mv-open" data-kind="lend" data-id="'+esc(a.id)+'">Lend…</button></li>'}).join('')+'</ul>':'<p class="hint">Nobody is on the bench.</p>')+'</div>';
  h+='<div class="block" style="margin-top:16px"><h2>Loans in force · '+loans.length+'</h2>'+(loans.length?'<ul class="cl">'+loans.map(function(a:any){var l=activeLoan(a);return '<li><button class="nm" data-act="open-agent" data-id="'+esc(a.id)+'">'+esc(a.name)+'</button> <span class="hint">'+esc(coName(a.projectId))+' to '+esc(coName(l.to))+' until '+esc(l.until)+' · '+esc(l.reason)+'</span> <button class="btn small" data-act="loan-end" data-id="'+esc(a.id)+'">Return now</button></li>'}).join('')+'</ul>':'<p class="hint">No loans.</p>')+'</div>';
  return h+'<p class="hint">Websites come from the homepage on GitHub, or the address of the latest deployment (Vercel reports it there). Loans end by themselves on their last day. All of this is a record here: it does not change real role files or start runs.</p>';
}
function limitsBlock(){
  var o=orgDoc(),ids=companyIds(),lm=S.lm,co=lm.company||ids[0]||'';
  var h='<div class="block" style="margin-top:16px"><h2>Hiring limits · '+o.limits.length+'</h2><p class="hint">Limits keep hiring tight. Each agent counts as capacity units, a rough measure of how much of your Claude plan it uses: Haiku 1, Sonnet 2, Opus 4, plus 1 for its own brain. Paused agents count as zero. A hire, loan or upgrade that breaks a limit is stopped until you repeat it to approve going over. These are estimates, not bills.</p>';
  if(o.limits.length){
    h+='<div class="sheetwrap"><table class="sheet"><thead><tr><th>Applies to</th><th>Company</th><th>Agents</th><th>Capacity</th><th></th></tr></thead><tbody>'+o.limits.map(function(l:any){
      var u=usageOf(S.agents,l,undefined),cap=unitCap(l,o.rates),rt=o.rates[l.company],over=(l.maxAgents&&u.heads>l.maxAgents)||(cap&&u.units>cap);
      return '<tr><td>'+esc(labelOf(l,agentName))+'</td><td>'+esc(coName(l.company))+'</td><td'+(l.maxAgents&&u.heads>l.maxAgents?' class="bad"':'')+'>'+(l.level==='person'?'—':u.heads+(l.maxAgents?' of '+l.maxAgents:''))+'</td><td'+(cap&&u.units>cap?' class="bad"':'')+'>'+u.units+(cap?' of '+cap:'')+' units'+(l.maxRupees?' <span class="hint">(₹'+l.maxRupees+(rt?'':', set a rupee rate to count this')+')</span>':'')+'</td><td>'+(over?'<span class="pill bad">Over</span> ':'')+'<button class="btn small" data-act="lm-del" data-id="'+esc(l.id)+'">Remove</button></td></tr>';
    }).join('')+'</tbody></table></div>';
  }else h+='<p class="hint">No limits yet.</p>';
  var tgt='';
  if(lm.level==='department')tgt='<div class="fld"><label for="lm-t">Department</label><select id="lm-t" data-lmf="target"><option value="">Choose</option>'+DEPARTMENTS.map(function(d:any){return '<option'+(lm.target===d?' selected':'')+'>'+esc(d)+'</option>'}).join('')+'</select></div>';
  else if(lm.level==='role')tgt='<div class="fld"><label for="lm-t">A word in the role</label><input type="text" id="lm-t" data-lmf="target" value="'+esc(lm.target)+'" placeholder="For example developer"></div>';
  else if(lm.level==='person')tgt='<div class="fld"><label for="lm-t">Person</label><select id="lm-t" data-lmf="target"><option value="">Choose</option>'+S.agents.filter(function(a:any){return a.projectId===co}).map(function(a:any){return '<option value="'+esc(a.id)+'"'+(lm.target===a.id?' selected':'')+'>'+esc(a.name)+'</option>'}).join('')+'</select></div>';
  h+='<div class="cd" style="margin-top:10px"><b>Add a limit</b><div class="two"><div class="fld"><label for="lm-l">Level</label><select id="lm-l" data-lmf="level">'+LEVELS.map(function(x:any){return '<option value="'+x[0]+'"'+(lm.level===x[0]?' selected':'')+'>'+x[1]+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="lm-c">Company</label><select id="lm-c" data-lmf="company">'+ids.map(function(x:any){return '<option value="'+esc(x)+'"'+(co===x?' selected':'')+'>'+esc(coName(x))+'</option>'}).join('')+'</select></div></div>'+tgt
   +'<div class="two">'+(lm.level==='person'?'':'<div class="fld"><label for="lm-a">Most agents</label><input type="text" id="lm-a" data-lmf="maxAgents" value="'+esc(lm.maxAgents)+'" placeholder="For example 8"></div>')
   +'<div class="fld"><label for="lm-u">Most capacity units</label><input type="text" id="lm-u" data-lmf="maxUnits" value="'+esc(lm.maxUnits)+'" placeholder="For example 16"></div>'
   +'<div class="fld"><label for="lm-r">Most rupees a month</label><input type="text" id="lm-r" data-lmf="maxRupees" value="'+esc(lm.maxRupees)+'" placeholder="Needs a rupee rate on the company"></div></div>'
   +'<div class="ctlbtns"><button class="btn small primary" data-act="lm-add">Add limit</button></div></div></div>';
  return h;
}
function moveHTML(){
  var m=S.mv;if(!m)return '';
  var a=S.agents.filter(function(x:any){return x.id===m.id})[0];if(!a)return '';
  var others=companyIds().filter(function(x:any){return x!==a.projectId}),lendIt=m.kind==='lend';
  return '<div class="scrim" data-act="mv-close"></div><div class="modal" role="dialog" aria-label="'+(lendIt?'Lend':'Move')+' '+esc(a.name)+'"><div class="modal-head"><h2>'+(lendIt?'Lend ':'Move for good: ')+esc(a.name)+'</h2><p>Home company: '+esc(coName(a.projectId))+'</p></div><div class="modal-body">'
   +'<div class="fld"><label for="mv-to">To which company?</label><select id="mv-to" data-mvf="to"><option value="">Choose a company</option>'+others.map(function(x:any){return '<option value="'+esc(x)+'"'+(m.to===x?' selected':'')+'>'+esc(coName(x))+'</option>'}).join('')+'</select></div>'
   +(lendIt?'<div class="fld"><label for="mv-until">Until (last day)</label><input type="date" id="mv-until" data-mvf="until" value="'+esc(m.until)+'"></div><div class="fld"><label for="mv-reason">What will it work on?</label><textarea id="mv-reason" rows="2" data-mvf="reason" placeholder="For example Security review of the upload screen">'+esc(m.reason)+'</textarea></div>':'<p class="hint">The agent leaves its manager and backup behind: name a new manager afterwards. Its tasks and history stay with it.</p>')
   +(m.err?'<div class="err">'+esc(m.err)+'</div>':'')+'<p class="hint">Approving this is your decision as owner. While on loan, the borrowing company\'s guardrails also apply to the agent, and it is told to keep its home company\'s private details to itself. This is a record and a chat instruction: real runs follow the role files.</p></div>'
   +'<div class="modal-foot"><button class="btn" data-act="mv-close">Cancel</button><button class="btn primary" data-act="mv-ok">'+(lendIt?'Approve loan':'Approve move')+'</button></div></div>';
}
function moveApply(){
  var m=S.mv;if(!m)return;var a=S.agents.filter(function(x:any){return x.id===m.id})[0];if(!a)return;
  if(m.to&&!gate({id:a.id,company:m.to,dept:deptOf(a),role:String(a.role||a.name||'')},agentUnits(a),m,'move:'+m.to))return;
  var er=m.kind==='lend'?lendIn(a,m.to,m.until,m.reason):transferIn(a,m.to);
  if(er){toast(er);return}
  persist('agents',a.id,a);S.mv=null;render();toast(m.kind==='lend'?'Lent to '+coName(a.loan.to):'Moved to '+coName(a.projectId));
}
function hrBlock(a:any){
  var id=esc(a.id),rs=reviewState(a),ob=onboardingProgress(a),ln=activeLoan(a),first=String(a.name||'this person').split(/[ (]/)[0];
  var chip=rs.state==='never'?'<span class="pill mute">No review on file</span>':rs.state==='ok'?'<span class="pill ok">Next review '+esc(rs.next)+'</span>':rs.state==='due'?'<span class="pill warn">Review due since '+esc(rs.next)+'</span>':'<span class="pill bad">Review overdue since '+esc(rs.next)+'</span>';
  var backup=a.backupId?(S.agents.filter(function(x:any){return x.id===a.backupId})[0]||{}).name:'';
  var h='<section class="pc-s hr"><h4>HR file</h4><div class="pc-facts">'
   +'<div><span>Company</span><b>'+esc(coName(a.projectId))+'</b></div>'
   +'<div><span>Department</span><b>'+esc(deptOf(a))+'</b></div><div><span>Manager</span><b>'+esc(a.reportsTo||'None named')+'</b></div>'
   +'<div><span>Backup</span><b>'+esc(backup||'None named')+'</b></div>'
   +'<div><span>Working for</span><b>'+(ln?esc(coName(ln.to))+' until '+esc(ln.until):'Home company')+'</b></div>'
   +'<div><span>Capacity</span><b>'+agentUnits(a)+' units'+(function(){var r=rupees(agentUnits(a),(orgDoc().rates||{})[a.projectId]);return r?' (₹'+r+')':''})()+'</b></div><div><span>Onboarding</span><b>'+ob.done+' of '+ob.total+'</b></div><div><span>Review</span>'+chip+'</div></div>';
  if(ln)h+='<p class="hint">On loan: '+esc(ln.reason)+'</p>';
  h+='<div class="ctlbtns"><button class="btn small" data-act="mv-open" data-kind="lend" data-id="'+id+'">Lend…</button><button class="btn small" data-act="mv-open" data-kind="move" data-id="'+id+'">Move for good…</button>'
   +(ln?'<button class="btn small" data-act="loan-end" data-id="'+id+'">Return now</button>':'')
   +'<button class="btn small" data-act="bench-toggle" data-id="'+id+'">'+(a.bench?'Take off the shared bench':'Put on the shared bench')+'</button></div>';
  h+='<div class="fld"><label>Onboarding checklist</label><div class="checks">'+ONBOARDING.map(function(o:any,i:number){var cid='onb-'+id+'-'+i;return '<label for="'+cid+'"><input type="checkbox" id="'+cid+'" data-onb="'+id+'" value="'+esc(o)+'"'+((a.hr&&a.hr.onboarding&&a.hr.onboarding[o])?' checked':'')+'>'+esc(o)+'</label>'}).join('')+'</div></div>';
  h+='<div class="fld"><label>Record a review for '+esc(first)+'</label><div class="two"><select id="rv-r-'+id+'" aria-label="Rating">'+[5,4,3,2,1].map(function(n){return '<option value="'+n+'"'+(n===4?' selected':'')+'>'+n+' of 5</option>'}).join('')+'</select><input type="text" id="rv-n-'+id+'" placeholder="A line on how the work went" aria-label="Review note"></div><div class="ctlbtns"><button class="btn small" data-act="rv-add" data-id="'+id+'">Record review</button></div></div>';
  var rv=((a.hr&&a.hr.reviews)||[]).slice(-3).reverse();
  if(rv.length)h+='<ul class="cl" style="max-height:none">'+rv.map(function(r:any){return '<li><b>'+esc(r.at)+'</b> '+r.rating+' of 5 <span class="hint">'+esc(r.note||'')+'</span></li>'}).join('')+'</ul>';
  h+='<details><summary>Job description</summary><pre class="jd">'+esc(jdText(a))+'</pre><button class="btn small" data-act="copy-jd" data-id="'+id+'">Copy job description</button></details>';
  var cl=(a.changeLog||[]).slice(-8).reverse();
  h+='<details><summary>Change log · '+(a.changeLog||[]).length+'</summary>'+(cl.length?'<ul class="cl" style="max-height:none">'+cl.map(function(c:any){return '<li><b>'+esc(new Date(c.at).toISOString().slice(0,10))+'</b> '+esc(c.text)+'</li>'}).join('')+'</ul>':'<p class="hint">Nothing recorded yet. Edits, moves, loans, bench changes and reviews are logged here.</p>')+'</details></section>';
  return h;
}
/* ---------- HR desk and requisitions ---------- */
function reqsDoc(){var o=S.reqs?clone(S.reqs):{};if(!Array.isArray(o.items))o.items=[];return o}
function saveReqs(o:any){S.reqs=o;persist('meta','reqs',o);render()}
function prepReq(r:any){
  var rl=resolveRole(r.dept,r.designation),og=orgDoc(),peers=S.agents.filter(function(a:any){return a.projectId===r.company});
  var head=peers.filter(function(a:any){return a.level==='Head'&&deptOf(a)===r.dept})[0]||peers.filter(function(a:any){return a.level==='Head'})[0];
  var rec=recommendModel(r.reason+' '+rl.duties.join(' '),atModels(),rl.leader),units=modelUnits(rec.id||'opus55',rl.brainOwn);
  var chk=hireCheck(og.limits,og.rates,S.agents,{company:r.company,dept:r.dept,role:rl.title},units,agentName);
  return {rl:rl,rec:rec,units:units,chk:chk,manager:(r.designation==='head'?'':(head&&head.name)||r.byName||''),rupees:rupees(units,og.rates[r.company])};
}
function reqCard(r:any){
  var id=esc(r.id),pr=prepReq(r),rl=pr.rl,open=r.status==='requested';
  var h='<div class="cd"><div class="cd-h"><div class="grow"><b>'+esc(rl.title)+'</b><small class="hint" style="display:block">'+esc(coName(r.company))+' · '+esc(r.dept)+' · asked by '+esc(r.byName)+' · '+esc(new Date(r.createdAt).toISOString().slice(0,10))+'</small></div><span class="pill '+(r.status==='approved'?'ok':'mute')+'">'+esc(r.status==='approved'?'Approved, not built yet':'Waiting for you')+'</span></div>'
   +'<p>'+esc(r.reason)+'</p>'
   +'<div class="pc-facts"><div><span>Manager</span><b>'+esc(pr.manager||'None yet')+'</b></div><div><span>Model</span><b>'+esc(mn(pr.rec.id)||'Choose one')+'</b></div><div><span>Capacity</span><b>'+pr.units+' units'+(pr.rupees?' (₹'+pr.rupees+')':'')+'</b></div><div><span>Own brain</span><b>'+(rl.brainOwn?'Yes':'No')+'</b></div></div>'
   +'<p class="hint">'+esc(pr.rec.why)+'</p>'
   +'<p class="hint"><b>Duties:</b> '+esc(rl.duties.slice(0,4).join('; '))+'</p><p class="hint"><b>Skills:</b> '+esc(rl.skills.map(function(k:any){return k[0]}).join(', ')||'none')+' · <b>Tools:</b> '+esc(rl.tools.join(', '))+'</p><p class="hint"><b>Guardrails:</b> '+esc(rl.mustNot.concat(rl.approvals.map(function(a:any){return 'Ask before: '+a})).join('; ')||'none')+'</p>'
   +(pr.chk.ok?'<p class="hint"><span class="pill ok">Within your limits</span></p>':'<div class="err">Over a limit: '+esc(pr.chk.reasons.join('; '))+'. You can still approve; the build step asks again.</div>');
  if(open)h+='<div class="fld"><label for="rqn-'+id+'">Note (needed to decline)</label><input type="text" id="rqn-'+id+'" data-rqnote="'+id+'" value="'+esc(S.rqNote[r.id]||'')+'" placeholder="Why or why not"></div><div class="ctlbtns"><button class="btn small primary" data-act="rq-approve" data-id="'+id+'">Approve and build</button><button class="btn small" data-act="rq-decline" data-id="'+id+'">Decline</button><button class="btn small" data-act="rq-cancel" data-id="'+id+'">Cancel request</button></div>';
  else h+='<div class="ctlbtns"><button class="btn small primary" data-act="rq-build" data-id="'+id+'">Build now</button><button class="btn small" data-act="rq-cancel" data-id="'+id+'">Cancel request</button></div>';
  return h+'</div>';
}
function hrDeskView(list:any){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  var D=reqsDoc(),ids=companyIds(),f=S.rq,co=f.company||ids[0]||'',people=S.agents.filter(function(a:any){return a.projectId===co&&a.status!=='revoked'&&a.status!=='withdrawn'});
  var wait=D.items.filter(function(r:any){return r.status==='requested'}),appr=D.items.filter(function(r:any){return r.status==='approved'}),done=D.items.filter(function(r:any){return r.status!=='requested'&&r.status!=='approved'}).slice(-8).reverse();
  var h='<p class="hint">The HR desk is the default HR function for every company. Anyone can ask for a hire. The desk prepares it (role, duties, skills, model, cost) and checks your hiring limits. Only you approve or decline. Approving opens the Build an agent form already filled in, for you to review.</p>';
  h+='<div class="cd"><b>Raise a requisition</b><div class="two"><div class="fld"><label for="rq-c">Company</label><select id="rq-c" data-rqf="company">'+ids.map(function(x:any){return '<option value="'+esc(x)+'"'+(co===x?' selected':'')+'>'+esc(coName(x))+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="rq-b">Asked by</label><select id="rq-b" data-rqf="by"><option value="owner">You</option>'+people.map(function(a:any){return '<option value="'+esc(a.id)+'"'+(f.by===a.id?' selected':'')+'>'+esc(a.name)+'</option>'}).join('')+'</select></div></div>'
   +'<div class="two"><div class="fld"><label for="rq-d">Department</label><select id="rq-d" data-rqf="dept"><option value="">Choose</option>'+DEPARTMENTS.map(function(d:any){return '<option'+(f.dept===d?' selected':'')+'>'+esc(d)+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="rq-g">Designation</label><select id="rq-g" data-rqf="designation">'+DESIGNATIONS.map(function(d:any){return '<option value="'+d.id+'"'+(f.designation===d.id?' selected':'')+'>'+esc(d.label)+'</option>'}).join('')+'</select></div></div>'
   +'<div class="fld"><label for="rq-r">Why is this role needed?</label><textarea id="rq-r" rows="2" data-rqf="reason" placeholder="For example Launch content is behind and the Head of Marketing has no help">'+esc(f.reason)+'</textarea></div>'
   +'<div class="ctlbtns"><button class="btn small primary" data-act="rq-add">Raise requisition</button></div></div>';
  h+='<div class="block" style="margin-top:16px"><h2>Waiting for you · '+wait.length+'</h2>'+(wait.length?'<div class="gc">'+wait.map(reqCard).join('')+'</div>':'<p class="hint">Nothing is waiting.</p>')+'</div>';
  if(appr.length)h+='<div class="block" style="margin-top:16px"><h2>Approved, not built yet · '+appr.length+'</h2><div class="gc">'+appr.map(reqCard).join('')+'</div></div>';
  if(done.length)h+='<div class="block" style="margin-top:16px"><h2>Recent decisions</h2><ul class="cl" style="max-height:none">'+done.map(function(r:any){return '<li><b>'+esc(r.title)+'</b> <span class="hint">'+esc(coName(r.company))+' · '+esc(r.status)+(r.note?' · '+esc(r.note):'')+(r.agentId?' · '+esc(agentName(r.agentId)):'')+'</span></li>'}).join('')+'</ul></div>';
  return h;
}
function reqBuild(r:any){
  var pr=prepReq(r),rl=pr.rl;
  openWizard(r.company);
  var w=S.wizard;w.task=r.reason;w.reqId=r.id;
  w.extras.dept=r.dept;w.extras.designation=r.designation;if(pr.manager)w.extras.reportsTo=pr.manager;
  w.extras=refreshDefaults(w.extras,w.task,pluginNames());w.brain={own:rl.brainOwn,memory:rl.memory.slice(),note:''};
  S.tab='hr';render();
}
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
  var pct=A?Math.round(100*D/A):0,stalled=idle>7&&O>0,lv=liveInfo(),needs=rp.needsYou||[];
  var head=rp.headline||(A?D+' of '+A+' tickets are done ('+pct+'%).':'No work recorded yet.'),sub=rp.sub||'';
  if(lv.live){
    head=stalled?'The agent team has not worked for '+idle+' days.':(A?D+' of '+A+' tickets are done ('+pct+'%).':'No work recorded yet.');
    sub=(lv.prs>3?lv.prs+' pull requests are open and the rule allows three, so the agents cannot start new work. ':lv.prs?lv.prs+' pull request'+(lv.prs===1?' is':'s are')+' open. ':'')+(lv.paused?'Agents are paused (label on the Agent control issue).':'');
    needs=[];
    list.forEach(function(a:any){(a.todos||[]).forEach(function(t:any){if(t.status!=='done'&&/^Needs the founder/.test(t.note||''))needs.push({title:String(t.text||'').replace(/\s*\[[^\]]*\]\s*$/,''),why:' Waiting for you. ('+a.name+')'})})});
    if(lv.prs>3)needs.unshift({title:'Clear open pull requests',why:' '+lv.prs+' are open and the limit is 3.'});
    needs=needs.slice(0,8);
  }
  needs=needs.concat(orgNeeds(list));
  (function(){var n=reqsDoc().items.filter(function(r:any){return r.status==='requested'}).length;if(n)needs.push({title:'Requisitions waiting for you',why:' '+n+' hiring request'+(n===1?'':'s')+' on the HR desk (People, HR desk).'})})();
  (function(){var o=orgDoc();overLimits(o.limits,o.rates,S.agents,agentName).slice(0,4).forEach(function(t:any){needs.push({title:'Over a hiring limit',why:' '+t})})})();
  var h='<div class="ov"><div class="ov-hero'+(stalled?'':' ok')+'"><h2>'+esc(head)+'</h2><p>'+esc(sub)+'</p></div>';
  h+='<div class="ov-tiles"><div class="ov-tile"><b>'+pct+'%</b><span>of tickets done ('+D+' of '+A+')</span></div>'
   +'<div class="ov-tile"><b>'+O+'</b><span>still open</span></div>'
   +'<div class="ov-tile"><b>'+blocked+'</b><span>stuck behind something else</span></div>'
   +'<div class="ov-tile"><b class="'+(stalled?'bad':'')+'">'+(idle||'—')+'</b><span>days since any agent worked</span></div></div>';
  if(needs.length)h+='<div><h3>What needs you</h3><ol class="ov-need">'+needs.map(function(x){return '<li><b>'+esc(x.title)+'</b>'+esc(x.why||'')+'</li>'}).join('')+'</ol></div>';
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
var STARTER=[
 {id:'sp1',name:'Model routing',what:'Picks the cheapest model that is accurate enough for each task.'},
 {id:'sp2',name:'Context compaction',what:'Keeps long runs small by summarising what is no longer needed.'},
 {id:'sp3',name:'Memory manager',what:'Saves, recalls and tidies the notes an agent keeps.'}];
function starterItems(){return STARTER.map(function(x:any){return {id:x.id,name:x.name,kind:'plugin',runtime:'any',status:'wanted',what:x.what,source:'Starter pack: a placeholder for the real plugin. Replace it by adding the real one from its downloaded file.',scope:{mode:'all'},starter:true}})}
function defaultExt(){
  var fv='';S.repos.forEach(function(r){if(r.full_name.split('/')[1]==='familyvault')fv=rid(r)});
  var sc=fv?{mode:'project',projects:[fv]}:{mode:'all'};
  function g(id,t,ty){return {id:id,text:t,type:ty,scope:sc,src:'FamilyVault CLAUDE.md'}}
  return {items:starterItems(),starter:true,rules:[
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
function ext(){var E=S.ext||defaultExt();if(!E.shared)E.shared=[];return E}
function saveExt(E){S.ext=E;persist('meta','ext',E)}
function teamIndex(){var T=buildTree(S.agents),m={};T.roots.forEach(function(r){(function w(a){m[a.id]=r.name;(T.kids[a.id]||[]).forEach(w)})(r)});return m}
function allTeams(){var T=buildTree(S.agents),o=[];T.roots.forEach(function(r){if(o.indexOf(r.name)<0)o.push(r.name)});return o.sort()}
function applies(sc,a,tm){return appliesLib(sc,a,tm)}
function appliedTo(a){var E=ext(),tm=teamIndex();return {rules:E.rules.filter(function(r){return applies(r.scope,a,tm)}),items:E.items.filter(function(x){return x.status!=='off'&&applies(x.scope,a,tm)})}}
function scopeText(sc){
  var n=scopeNorm(sc),lv=(n.all?1:0)+(n.projects.length?1:0)+(n.teams.length?1:0)+(n.people.length?1:0),ex=n.except.length;
  function nm(ids){return ids.map(function(id){var a=S.agents.filter(function(x){return x.id===id})[0];return a?a.name:null}).filter(Boolean)}
  if(lv===1&&!ex){
    if(n.all)return 'Every agent';
    if(n.projects.length)return 'Project: '+(n.projects.map(shortName).join(', '));
    if(n.teams.length)return 'Team: '+(n.teams.join(', '));
    var p=nm(n.people);return p.length?(p.length<=2?p.join(', '):p.length+' people: '+p.slice(0,2).join(', ')+'…'):'People: none chosen';
  }
  if(!lv)return 'Nobody yet';
  var parts=[];
  if(n.all)parts.push('Whole organisation');
  if(n.projects.length)parts.push('Project: '+n.projects.map(shortName).join(', '));
  if(n.teams.length)parts.push('Team: '+n.teams.join(', '));
  if(n.people.length){var q=nm(n.people);parts.push(q.length<=2?q.join(', '):q.length+' people')}
  return parts.join(' + ')+(ex?' · except '+ex:'');
}
function countFor(sc){var tm=teamIndex();return S.agents.filter(function(a){return applies(sc,a,tm)}).length}
function runtimeLabel(r){return !r||r==='any'?'Any model':mn(r)}
function capView(list){
  if(!S.loaded)return '<p class="hint">Loading…</p>';
  var E=ext(),sub=[['catalog','Skills and plugins',E.items.length],['rules','Guardrails',E.rules.length],['shared','Shared items',E.shared.length],['tools','Tools in role files','']];
  var h='<div class="vrow"><span class="seg" role="group" aria-label="Section">'+sub.map(function(x){return (x[0]==='shared'?'<!--ctl-->':'')+'<button class="btn small" data-act="cap-tab" data-sub="'+x[0]+'" aria-pressed="'+(S.capTab===x[0])+'">'+x[1]+(x[2]!==''?' · '+x[2]:'')+'</button>'+(x[0]==='shared'?'<!--/ctl-->':'')}).join('')+'</span>';
  if(S.capTab==='catalog'||S.capTab==='rules')h+='<button class="btn primary small" data-act="x-new" data-kind="'+(S.capTab==='rules'?'rule':'item')+'">'+(S.capTab==='rules'?'Add a guardrail':'Add a skill or plugin')+'</button><span class="seg" role="group" aria-label="Layout"><button class="btn small" data-act="vw" data-tab="caps" data-view="cards" aria-pressed="'+!isSheet('caps')+'">Cards</button><button class="btn small" data-act="vw" data-tab="caps" data-view="sheet" aria-pressed="'+isSheet('caps')+'">Spreadsheet</button></span>';
  if(S.capTab==='catalog')h+='<!--ctl--><button class="btn small" data-act="pkg-open">Add from downloaded files</button><!--/ctl-->';
  if(S.capTab==='shared')h+=sharedAdd();
  h+='</div><p class="hint" style="margin-bottom:12px">This is a register. Setting something here records it and shapes what agents say in chat on this page. It does not install anything or change role files in the repo. '+(S.ext?'':'Starter guardrails are copied from FamilyVault\'s CLAUDE.md (11 Oct) and are saved once you change anything.')+'</p>';
  if(S.capTab==='shared')return h+sharedView();
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
   +pkgExtra(x,kind)+'<p class="hint"><b>'+esc(scopeText(x.scope))+'</b> · '+n+' agent'+(n===1?'':'s')+(kind==='rule'&&x.src?' · from '+esc(x.src):'')+'</p>'
   +'<div class="acts"><button class="btn small" data-act="x-edit" data-kind="'+kind+'" data-id="'+id+'">Edit</button><!--ctl--><button class="btn small" data-act="x-edit" data-kind="'+kind+'" data-id="'+id+'">Change who gets it</button><!--/ctl--><button class="btn small danger" data-act="'+(del?'x-del-ok':'x-del')+'" data-kind="'+kind+'" data-id="'+id+'">'+(del?'Really remove?':'Remove')+'</button></div></div>';
}
function xeFields(kind,x,skind){
  var sc=toMix(scopeNorm(x&&x.scope?x.scope:{mode:'mix',all:false}));
  if(kind==='rule')return {text:x?x.text:'',type:x?x.type:'never',note:x?x.note||'':'',scope:sc};
  if(kind==='shared'){x=x||{};return {text:x.text||'',name:x.name||'',target:x.target==null?'':String(x.target),unit:x.unit||'',cadence:x.cadence||'weekly',dir:x.dir||'up',due:x.due||'',horizon:x.horizon||'',title:x.title||'',path:x.path||'',scope:sc}}
  return {name:x?x.name:'',kind:x?x.kind:'skill',runtime:x?x.runtime||'any':'any',status:x?x.status:'wanted',what:x?x.what||'':'',source:x?x.source||'':'',scope:sc};
}
var SK_LABEL={todo:'shared todo',kpi:'shared KPI',goal:'shared goal',memory:'shared memory note',doc:'shared document'};
function curScope(own){return own==='imp'?(S.imp&&S.imp.scope):(S.xe&&S.xe.f.scope)}
function scopeEditorHTML(sc,own){
  var n=scopeNorm(sc),tm=teamIndex(),cnt=countFor(sc);
  function cb(k,v,on,label,extra){return '<label><input type="checkbox" data-xs="'+k+'" data-own="'+own+'" value="'+esc(v)+'"'+(on?' checked':'')+'> '+label+(extra||'')+'</label>'}
  var byName=S.agents.slice().sort(function(a:any,b:any){return String(a.name).localeCompare(String(b.name))});
  var wide=toMix({all:n.all,projects:n.projects,teams:n.teams,people:n.people,except:[]}),cand=byName.filter(function(a:any){return appliesLib(wide,a,tm)||n.except.indexOf(a.id)>=0});
  return '<div class="sec"><h3>Who it applies to</h3><p class="hint">Tick any mix of levels. Each one adds people. The last list leaves individuals out. You can change this later to widen or narrow it.</p>'
   +'<div class="lvl"><div class="pickbox" style="max-height:none">'+cb('all','all',n.all,'<b>Organisation</b>: every agent in every project')+'</div></div>'
   +'<div class="lvl"><span class="lvl-t">Projects (repositories)</span><div class="pickbox">'+S.repos.map(function(r:any){var v=rid(r);return cb('projects',v,n.projects.indexOf(v)>=0,esc(r.full_name.split('/')[1]))}).join('')+'</div></div>'
   +'<div class="lvl"><span class="lvl-t">Teams</span><div class="pickbox">'+(allTeams().map(function(t:any){return cb('teams',t,n.teams.indexOf(t)>=0,esc(t))}).join('')||'<span class="hint">No teams yet.</span>')+'</div></div>'
   +'<div class="lvl"><span class="lvl-t">Individuals</span><div class="pickbox">'+byName.map(function(a:any){return cb('people',a.id,n.people.indexOf(a.id)>=0,esc(a.name),' <small class="hint">'+esc(tm[a.id]||'')+'</small>')}).join('')+'</div></div>'
   +'<div class="lvl"><span class="lvl-t">Except these individuals</span><div class="pickbox">'+(cand.length?cand.map(function(a:any){return cb('except',a.id,n.except.indexOf(a.id)>=0,esc(a.name),' <small class="hint">'+esc(tm[a.id]||'')+'</small>')}).join(''):'<span class="hint">Choose a level above first.</span>')+'</div></div>'
   +'<span class="hint" aria-live="polite">Applies to <b>'+cnt+'</b> of '+S.agents.length+' agent'+(S.agents.length===1?'':'s')+' right now.</span></div>';
}
function xeHTML(){
  var e=S.xe;if(!e)return '';var f=e.f,item=e.kind==='item',sh=e.kind==='shared';
  var ttl=item?'skill or plugin':sh?SK_LABEL[e.skind]:'guardrail';
  var h='<div class="scrim" data-act="x-close"></div><aside class="panel" role="dialog" aria-label="'+esc(item?'Skill or plugin':sh?SK_LABEL[e.skind]:'Guardrail')+'"><div class="panel-head"><div><h2>'+(e.id?'Edit ':'Add ')+ttl+'</h2></div><div class="btns"><button class="btn small primary" data-act="x-save">Save</button><button class="btn small" data-act="x-close">Cancel</button></div></div><div class="panel-body">';
  function sel(k,opts,cur,lab){return '<div class="fld"><label for="xf-'+k+'">'+lab+'</label><select id="xf-'+k+'" data-xf="'+k+'">'+opts.map(function(o:any){return '<option value="'+esc(o[0])+'"'+(o[0]===cur?' selected':'')+'>'+esc(o[1])+'</option>'}).join('')+'</select></div>'}
  function txt(k,lab,ph,ty){return '<div class="fld"><label for="xf-'+k+'">'+lab+'</label><input type="'+(ty||'text')+'" id="xf-'+k+'" data-xf="'+k+'" value="'+esc(f[k])+'"'+(ph?' placeholder="'+esc(ph)+'"':'')+'></div>'}
  function area(k,lab,ph){return '<div class="fld"><label for="xf-'+k+'">'+lab+'</label><textarea id="xf-'+k+'" data-xf="'+k+'" rows="3"'+(ph?' placeholder="'+esc(ph)+'"':'')+'>'+esc(f[k])+'</textarea></div>'}
  if(item){
    h+='<div class="fld"><label for="xf-name">Name</label><input type="text" id="xf-name" data-xf="name" value="'+esc(f.name)+'" placeholder="For example Weekly regulation scan"></div>'
     +sel('kind',KINDS,f.kind,'Kind')
     +sel('runtime',[['any','Any model']].concat(modelList().map(function(m:any){return [m.id,m.name]})),f.runtime,'Runs on')
     +sel('status',[['wanted','Wanted (not set up yet)'],['installed','Installed'],['off','Off']],f.status,'Status')
     +'<div class="fld"><label for="xf-what">What it does</label><textarea id="xf-what" data-xf="what" rows="3">'+esc(f.what)+'</textarea></div>'
     +'<div class="fld"><label for="xf-source">Where it comes from</label><input type="text" id="xf-source" data-xf="source" value="'+esc(f.source)+'" placeholder="A link, a repo path or a marketplace name"></div>';
  }else if(sh){
    var k=e.skind;
    if(k==='todo')h+=area('text','The todo','For example Review open pull requests')+txt('due','Due date (optional)','','date');
    else if(k==='goal')h+=area('text','The goal','')+txt('horizon','When (optional)','For example Alpha, Q1')+txt('due','Due date (optional)','','date');
    else if(k==='kpi')h+=txt('name','KPI name','For example Cycle time')+txt('target','Target number','10','number')+txt('unit','Unit','days')+sel('cadence',[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['quarterly','Quarterly']],f.cadence,'How often')+sel('dir',[['up','Higher is better'],['down','Lower is better']],f.dir,'Direction');
    else if(k==='memory')h+=area('text','The note','Something these agents should always keep in mind');
    else h+=txt('title','Document title','')+txt('path','Path or link (optional)','');
    h+='<p class="hint">'+(materialises(k)?'This is copied onto each agent in scope, so each one tracks its own progress. Widening adds it to more agents. Narrowing removes the copies that have no progress yet and keeps the ones that do.':'This is read when an agent chats. It is not copied.')+'</p>';
  }else{
    h+=sel('type',RTYPES,f.type,'Type')
     +'<div class="fld"><label for="xf-text">The rule</label><textarea id="xf-text" data-xf="text" rows="3" placeholder="For example Never merge without Quality approval">'+esc(f.text)+'</textarea></div>'
     +'<div class="fld"><label for="xf-note">Why (optional)</label><input type="text" id="xf-note" data-xf="note" value="'+esc(f.note)+'"></div>';
  }
  return h+scopeEditorHTML(f.scope,'xe')+'</div></aside>';
}
function sharedInvalid(k,f){
  if((k==='todo'||k==='goal'||k==='memory')&&!String(f.text).trim())return k==='memory'?'Write the note':'Write the '+k;
  if(k==='kpi'){if(!String(f.name).trim())return 'Give the KPI a name';if(f.target!==''&&!isFinite(Number(f.target)))return 'The target must be a number'}
  if(k==='doc'&&!String(f.title).trim())return 'Give the document a title';
  return '';
}
function applyShared(E,prefix){
  var r=syncAll(E.shared,S.agents,teamIndex());
  r.ids.forEach(function(id:any){var a=S.agents.filter(function(x:any){return x.id===id})[0];if(a)persist('agents',a.id,a)});
  S.xe=null;render();
  var b=[];if(r.added)b.push('added '+r.added);if(r.removed)b.push('removed '+r.removed);if(r.kept)b.push(r.kept+' kept because they have progress');
  toast(prefix+(b.length?' · '+b.join(' · '):''));
}
function saveXe(){
  var e=S.xe;if(!e)return;var f=e.f,E=clone(ext()),kind=e.kind,item=kind==='item',sh=kind==='shared';
  if(item&&!String(f.name).trim()){toast('Give it a name');return}
  if(kind==='rule'&&!String(f.text).trim()){toast('Write the rule');return}
  if(sh){var why=sharedInvalid(e.skind,f);if(why){toast(why);return}}
  if(scopeEmpty(f.scope)){toast('Choose who it applies to');return}
  var sc=toMix(scopeNorm(f.scope)),o:any;
  if(item)o={name:f.name.trim(),kind:f.kind,runtime:f.runtime,status:f.status,what:f.what.trim(),source:f.source.trim(),scope:sc};
  else if(sh){
    o={kind:e.skind,scope:sc};var q=e.skind;
    if(q==='todo'){o.text=f.text.trim();if(f.due)o.due=f.due}
    else if(q==='goal'){o.text=f.text.trim();if(f.horizon.trim())o.horizon=f.horizon.trim();if(f.due)o.due=f.due}
    else if(q==='kpi'){o.name=f.name.trim();o.target=f.target===''?null:Number(f.target);o.unit=f.unit.trim();o.cadence=f.cadence;o.dir=f.dir}
    else if(q==='memory')o.text=f.text.trim();
    else{o.title=f.title.trim();if(f.path.trim())o.path=f.path.trim()}
  }
  else o={text:f.text.trim(),type:f.type,note:f.note.trim(),scope:sc};
  var arr=item?E.items:sh?E.shared:E.rules;
  if(e.id){for(var i=0;i<arr.length;i++)if(arr[i].id===e.id){o.id=e.id;if(kind==='rule')o.src=arr[i].src;if(item)['body','contains','version'].forEach(function(k:any){if(arr[i][k]!==undefined)o[k]=arr[i][k]});arr[i]=o}}
  else{o.id=(sh?'sh_':'x_')+Date.now().toString(36)+Math.random().toString(36).slice(2,5);arr.push(o)}
  saveExt(E);
  if(sh){applyShared(E,'Saved');return}
  S.xe=null;render();toast('Saved');
}
function changeScopeFor(kind,itemId,ag,how){
  var E=clone(ext()),arr=kind==='rule'?E.rules:kind==='shared'?E.shared:E.items,tm=teamIndex(),hit=false;
  arr.forEach(function(x:any){if(x.id!==itemId)return;x.scope=(how==='give'?giveTo:removeFor)(x.scope,ag,tm);hit=true});
  if(!hit)return;
  saveExt(E);
  var msg=(how==='give'?'Added for ':'Removed for ')+ag.name;
  if(kind==='shared')applyShared(E,msg);else{render();toast(msg)}
}
function sharedAdd(){return '<!--ctl-->'+SHARED_KINDS.map(function(k:any){return '<button class="btn small'+(k[0]==='todo'?' primary':'')+'" data-act="x-new" data-kind="shared" data-skind="'+k[0]+'">Add '+(k[0]==='memory'?'a memory note':k[0]==='kpi'?'a KPI':'a '+k[1].toLowerCase())+'</button>'}).join('')+'<button class="btn small" data-act="shared-sync">Re-apply to everyone</button><!--/ctl-->'}
function sharedCard(x:any){
  var id=esc(x.id),n=countFor(x.scope),del=S.xdel===x.id,mat=materialises(x.kind),lab=sharedLabel(x);
  var meta=x.kind==='kpi'?(x.target!=null?'Target '+fmtNum(x.target)+(x.unit?' '+x.unit:'')+' · ':'')+(x.cadence||''):x.due?'Due '+x.due:x.kind==='doc'&&x.path?x.path:x.horizon||'';
  return '<div class="cd"><h3 style="font:600 15px/1.4 var(--sans)">'+esc(lab)+'</h3>'+(meta?'<p class="hint">'+esc(meta)+'</p>':'')
   +'<p class="hint"><b>'+esc(scopeText(x.scope))+'</b> · '+n+' agent'+(n===1?'':'s')+' · '+(mat?'copied to each agent':'read when needed')+'</p>'
   +'<div class="acts"><button class="btn small" data-act="x-edit" data-kind="shared" data-id="'+id+'">Change who gets it</button><button class="btn small danger" data-act="'+(del?'x-del-ok':'x-del')+'" data-kind="shared" data-id="'+id+'">'+(del?'Really remove?':'Remove')+'</button></div></div>';
}
function sharedView(){
  var E=ext();
  if(!E.shared.length)return '<div class="empty"><h3>No shared items yet</h3><p>A shared item is a todo, KPI, goal, memory note or document that goes to many agents at once: the whole organisation, a project, a team or named individuals. Todos, KPIs and goals are copied onto each agent so each one tracks its own progress. You can widen or narrow who gets one at any time, here or on a person\'s card.</p></div>';
  var h='';
  SHARED_KINDS.forEach(function(k:any){
    var xs=E.shared.filter(function(x:any){return x.kind===k[0]});if(!xs.length)return;
    h+='<div class="block" style="margin-bottom:16px"><h2>'+k[1]+(k[0]==='memory'?' notes':'s')+' · '+xs.length+'</h2><div class="gc">'+xs.map(sharedCard).join('')+'</div></div>';
  });
  return h;
}
function sharedLines(a:any){
  var tm=teamIndex(),E=ext(),o:string[]=[],m=sharedFor(E.shared,a,tm,['memory']),d=sharedFor(E.shared,a,tm,['doc']);
  if(m.length){o.push('Standing notes the founder shared with you:');m.forEach(function(x:any){o.push('- '+x.text)})}
  if(d.length){o.push('Documents the founder wants you to read (a register, not proof they exist):');d.forEach(function(x:any){o.push('- '+x.title+(x.path?' ['+x.path+']':''))})}
  return o;
}
function appliesBlock(a:any){
  var E=ext(),tm=teamIndex(),id=esc(a.id),rows='',rowsD='',av:any[]=[],first=String(a.name||'this person').split(/[ (]/)[0];
  function row(kind:string,x:any,label:string,tag:string){
    if(!applies(x.scope,a,tm)){if(x.status!=='off')av.push([kind+':'+x.id,tag+': '+label]);return}
    var isDef=scopeNorm(x.scope).all;
    var li='<li><span class="pill mute">'+esc(tag)+'</span><span class="grow">'+esc(label)+'</span><button class="linkbtn" data-act="x-reduce" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-agent="'+id+'" aria-label="Remove '+esc(label)+' for '+esc(first)+'">Remove for '+esc(first)+'</button></li>';
    if(isDef)rowsD+=li;else rows+=li;
  }
  E.rules.forEach(function(r:any){row('rule',r,r.text,ruleLabel(r.type))});
  E.items.forEach(function(x:any){row('item',x,x.name,kindLabel(x.kind))});
  E.shared.forEach(function(x:any){row('shared',x,sharedLabel(x),(SHARED_KINDS.filter(function(k:any){return k[0]===x.kind})[0]||[0,'Shared'])[1])});
  return '<!--ctl--><section class="pc-s ap"><h4>What applies to '+esc(first)+'</h4>'+(rowsD?'<h5>Loaded by default <span class="hint">everyone in the organisation</span></h5><ul class="ap-l">'+rowsD+'</ul>':'')+'<h5>Added for this project, team or person</h5>'+(rows?'<ul class="ap-l">'+rows+'</ul>':'<p class="hint">Nothing extra has been added.</p>')
   +(av.length?'<div class="fld"><label for="gv-'+id+'">Give '+esc(first)+' something</label><select id="gv-'+id+'" data-give="'+id+'"><option value="">Choose a guardrail, skill, plugin or shared item</option>'+av.map(function(o:any){return '<option value="'+esc(o[0])+'">'+esc(o[1].length>90?o[1].slice(0,90)+'…':o[1])+'</option>'}).join('')+'</select></div>':'')
   +'<p class="hint">Use Change who gets it on the Capabilities page to widen or narrow by project, team or organisation.</p></section><!--/ctl-->';
}
function pkgExtra(x:any,kind:string){
  if(kind!=='item')return '';
  var h='';
  if(x.version)h+=' · version '+esc(x.version);
  if(x.contains&&x.contains.length)h+='<p class="hint">Contains: '+esc(x.contains.join(' · '))+'</p>';
  if(x.body)h+='<p class="hint"><button class="linkbtn" data-act="x-view" data-id="'+esc(x.id)+'">'+(S.xview[x.id]?'Hide the instructions':'View the saved instructions')+'</button></p>'+(S.xview[x.id]?'<pre class="pkg-body">'+esc(x.body)+'</pre>':'');
  return h?'<!--ctl-->'+h+'<!--/ctl-->':'';
}
/* ---------- add from downloaded files ---------- */
function pkgOpen(){
  S.chat&&S.chat.ctl&&S.chat.ctl.abort();S.chat=null;S.openAgent=null;S.edit=null;S.xe=null;S.modelsOpen=false;
  S.imp={busy:false,error:'',cands:[],skipped:0,names:[],status:'wanted',runtime:'any',scope:{mode:'mix',all:false,projects:[],teams:[],people:[],except:[]}};render();
}
async function pkgRead(files:any){
  var c=S.imp;if(!c)return;
  var fl=[].slice.call(files).slice(0,PKG_LIMITS.files);
  c.busy=true;c.error='';c.cands=[];c.skipped=0;c.names=fl.map(function(f:any){return f.name});render();
  var all:any[]=[],E=ext();
  for(var i=0;i<fl.length;i++){
    try{
      var up=await readUpload(fl[i].name,await fl[i].arrayBuffer());
      if(up.error){c.error=fl[i].name+': '+up.error;continue}
      c.skipped+=up.skipped;
      scanPkg(up,fl[i].name).forEach(function(x:any){all.push(x)});
    }catch(err){c.error=fl[i].name+' could not be read.'}
  }
  var seen:any={};
  c.cands=all.filter(function(x:any){var k=x.kind+':'+x.name.toLowerCase();if(seen[k])return false;seen[k]=1;return true}).slice(0,200).map(function(x:any){
    x.dup=E.items.some(function(y:any){return y.kind===x.kind&&String(y.name).toLowerCase()===x.name.toLowerCase()});x.on=!x.dup;return x});
  c.busy=false;if(S.imp===c)render();
}
function impHTML(){
  var c=S.imp;if(!c)return '';
  var n=c.cands.filter(function(x:any){return x.on}).length;
  var h='<div class="scrim" data-act="pkg-close"></div><aside class="panel" role="dialog" aria-label="Add from downloaded files"><div class="panel-head"><div><h2>Add from downloaded files</h2><p class="role">Skills, plugins and connectors</p></div><div class="btns"><button class="btn small primary" data-act="pkg-add"'+(n?'':' disabled')+'>Add '+n+'</button><button class="btn small" data-act="pkg-close">Cancel</button></div></div><div class="panel-body">';
  h+='<div class="fld"><label for="pkg-file">Choose the files you downloaded</label><input type="file" id="pkg-file" data-pkg multiple accept=".zip,.skill,.md,.json,.txt"><span class="hint">A .zip or .skill package, or a SKILL.md, plugin.json, marketplace.json or .mcp.json. Files are read in your browser and are never run. Only add files you trust: agents are told each one\'s name and description.</span></div>';
  if(c.busy)h+='<p class="hint">Reading…</p>';
  if(c.error)h+='<div class="err">'+esc(c.error)+'</div>';
  if(c.cands.length){
    h+='<div class="sec"><h3>Found '+c.cands.length+'</h3>'+c.cands.map(function(x:any,i:number){
      return '<label class="pkgc"><input type="checkbox" data-pkgsel="'+i+'"'+(x.on?' checked':'')+'><span class="pkgc-b"><span><span class="pill mute">'+esc(kindLabel(x.kind))+'</span> <b>'+esc(x.name)+'</b>'+(x.version?' <small class="hint">v'+esc(x.version)+'</small>':'')+(x.dup?' <span class="pill warn">Already registered</span>':'')+'</span>'
       +(x.what?'<span class="hint">'+esc(x.what)+'</span>':'')+(x.contains&&x.contains.length?'<span class="hint">Contains: '+esc(x.contains.join(' · '))+'</span>':'')+'<span class="hint">From '+esc(x.source)+(x.path&&x.path!==x.source?' · '+esc(x.path):'')+'</span></span></label>';
    }).join('')+'</div>';
    h+='<div class="fld"><label for="pkg-status">Status to record</label><select id="pkg-status" data-pkgf="status"><option value="wanted"'+(c.status==='wanted'?' selected':'')+'>Wanted (not set up yet)</option><option value="installed"'+(c.status==='installed'?' selected':'')+'>Installed (I have set it up)</option></select></div>'
     +'<div class="fld"><label for="pkg-runtime">Runs on</label><select id="pkg-runtime" data-pkgf="runtime"><option value="any">Any model</option>'+modelList().map(function(m:any){return '<option value="'+esc(m.id)+'"'+(c.runtime===m.id?' selected':'')+'>'+esc(m.name)+'</option>'}).join('')+'</select></div>'
     +scopeEditorHTML(c.scope,'imp')
     +'<p class="hint">This adds them to the register and says who gets them. It does not install anything into an agent\'s own tools; to do that, put the files in the repo\'s skills or plugins folder.</p>';
  }else if(!c.busy&&!c.error&&c.names.length)h+='<p class="hint">No skills, plugins or connectors were found in '+esc(c.names.join(', '))+(c.skipped?'. '+c.skipped+' other files were skipped.':'.')+'</p>';
  return h+'</div></aside>';
}
function pkgAdd(){
  var c=S.imp;if(!c)return;
  var picked=c.cands.filter(function(x:any){return x.on});if(!picked.length)return;
  if(scopeEmpty(c.scope)){toast('Choose who they apply to');return}
  var E=clone(ext()),sc=toMix(scopeNorm(c.scope));
  picked.forEach(function(x:any,i:number){
    var o:any={id:'x_'+Date.now().toString(36)+i+Math.random().toString(36).slice(2,4),name:x.name,kind:x.kind,runtime:c.runtime,status:c.status,what:x.what||'',source:x.source+(x.path&&x.path!==x.source?' · '+x.path:''),scope:sc};
    if(x.body)o.body=x.body;if(x.contains&&x.contains.length)o.contains=x.contains;if(x.version)o.version=x.version;
    E.items.push(o);
  });
  saveExt(E);S.imp=null;S.capTab='catalog';render();toast('Added '+picked.length+' to the register');
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
  f.dept=a.dept||'';f.techTxt=(Array.isArray(a.tech)?a.tech:[]).join(', ');f.model=o.nowId;f.modelPlanned=o.propId;f.brain=JSON.parse(JSON.stringify(brainOf(a)));return f;
}
function brainBox(b:any,pre:string){
  return '<div class="fld"><label><input type="checkbox" data-'+pre+'="own"'+(b.own?' checked':'')+'> Gets its own brain <span class="hint">its own memory, not shared with other agents. Leads such as the CTO and Chief of Staff have it by default.</span></label></div><div class="fld"><label>Memory it keeps</label><div class="checks">'+MEMORY_OPTIONS.map(function(o:any,i:number){var id=pre+'-m-'+i;return '<label for="'+id+'"><input type="checkbox" id="'+id+'" data-'+pre+'m="1" value="'+esc(o)+'"'+(b.memory.indexOf(o)>=0?' checked':'')+'>'+esc(o)+'</label>'}).join('')+'</div></div><div class="fld"><label for="'+pre+'-note">Memory note (optional)</label><input type="text" id="'+pre+'-note" data-'+pre+'="note" value="'+esc(b.note||'')+'" placeholder="For example Keep decisions for 90 days"></div>';
}
function editHTML(){
  var e=S.edit,a=e&&S.agents.filter(function(x){return x.id===e.id})[0];if(!a)return '';
  var h='<div class="scrim" data-act="edit-close"></div><aside class="panel" role="dialog" aria-label="Edit '+esc(a.name)+'"><div class="panel-head"><div><h2>Edit agent</h2><p class="role">'+esc(a.name)+'</p></div><div class="btns"><button class="btn small primary" data-act="edit-save">Save</button><button class="btn small" data-act="edit-close">Cancel</button></div></div><div class="panel-body">';
  EF.forEach(function(x){
    var k=x[0],v=e.f[k]==null?'':e.f[k],id='ef-'+k,c;
    if(x[2]==='level'){var lv=['Head','Junior','Agent'];if(v&&lv.indexOf(v)<0)lv.push(v);c='<select id="'+id+'" data-ef="'+k+'">'+lv.map(function(o){return '<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>'}).join('')+'</select>'}
    else if(x[2]==='status')c='<select id="'+id+'" data-ef="'+k+'">'+['active','paused','draft'].concat(['resting','revoked','withdrawn'].indexOf(v)>=0?[v]:[]).map(function(o){return '<option value="'+o+'"'+(o===(v||'active')?' selected':'')+'>'+statusLabel(o)+'</option>'}).join('')+'</select>';
    else if(x[2]==='area'||x[2]==='lines')c='<textarea id="'+id+'" data-ef="'+k+'" rows="'+(x[2]==='area'?3:5)+'">'+esc(v)+'</textarea>';
    else c='<input type="text" id="'+id+'" data-ef="'+k+'" value="'+esc(v)+'">';
    h+='<div class="fld"><label for="'+id+'">'+esc(x[1])+'</label>'+c+'</div>';
  });
  h+='<div class="fld"><label for="ef-dept">Department</label><select id="ef-dept" data-ef="dept"><option value="">Worked out from the role: '+esc(deptOf(Object.assign({},a,{dept:''})))+'</option>'+DEPARTMENTS.map(function(d:any){return '<option'+(e.f.dept===d?' selected':'')+'>'+esc(d)+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="ef-tech">Technologies (comma separated)</label><input type="text" id="ef-tech" data-ef="techTxt" value="'+esc(e.f.techTxt||'')+'" placeholder="Worked out from tools and duties when empty. For example '+esc(TECH.slice(0,3).join(', '))+'"></div>';
  h+='<div class="fld"><label for="ef-model">Model now</label><select id="ef-model" data-ef="model">'+modelOpts(e.f.model,'Not set')+'</select></div>'
   +'<div class="fld"><label for="ef-modelPlanned">Model planned</label><select id="ef-modelPlanned" data-ef="modelPlanned">'+modelOpts(e.f.modelPlanned,'Not set')+'</select><span class="hint">Models that are not connected cannot be chosen. Connect them under Connections.</span></div>'
   +'<h3 style="margin-top:10px">Brain and memory</h3>'+brainBox(e.f.brain,'eb')
   +(e.err?'<div class="err">'+esc(e.err)+'</div>':'')+'<p class="hint">If you rename this agent, update Reports to on the agents that report to it: they match by name. This edits the record on this page, not the role file in the repo.</p></div></aside>';
  return h;
}
function lines(v:any){return String(v==null?'':v).split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean)}
function saveEdit(){
  var e=S.edit;if(!e)return;var f=e.f;
  if(!String(f.name||'').trim()){toast('Name is required');return}
  var ea0=S.agents.filter(function(x:any){return x.id===e.id})[0];
  if(ea0&&(f.model||'')!==(ea0.model||'')||ea0&&!!(f.brain&&f.brain.own)!==!!(brainOf(ea0).own)){
    var nm=f.model||ea0.model||ea0.modelPlanned||'opus55',un=modelUnits(nm,!!(f.brain&&f.brain.own));
    if(!gate({id:ea0.id,company:whoOf(ea0).company,dept:f.dept||deptOf(ea0),role:String(f.role||ea0.role||'')},un,e,'edit:'+nm+(f.brain&&f.brain.own)))return;
  }
  mutate(e.id,function(a){
    var before=JSON.parse(JSON.stringify(a));before.brain=before.brain||brainOf(a);
    ['name','role','level','reportsTo','status','purpose','handsOff','reads'].forEach(function(k){if(f[k]!=null)a[k]=String(f[k]).trim()});
    ['responsibilities','may','mustNot','requirements'].forEach(function(k){a[k]=lines(f[k])});
    a.tools=String(f.tools||'').split(',').map(function(x){return x.trim()}).filter(Boolean);
    a.model=f.model||'';a.modelPlanned=f.modelPlanned||'';
    if(f.dept)a.dept=f.dept;else delete a.dept;
    var tl=String(f.techTxt||'').split(',').map(function(x:any){return x.trim()}).filter(Boolean);if(tl.length)a.tech=tl;else delete a.tech;
    if(f.brain)a.brain={own:!!f.brain.own,memory:f.brain.memory.slice(),note:String(f.brain.note||'').trim()};
    diffChanges(before,a).forEach(function(tx:any){logChange(a,tx)});
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
function guardLines(a: any): string[] { return guardLines0(a).concat(stateLines(a),sharedLines(a)) }
function guardLines0(a: any): string[] { var g=appliedTo(a),o: string[]=[]; if(a.progress&&S.report&&S.report.facts)o.push('Team-wide facts: '+S.report.facts.join(' | ')); if(g.rules.length){o.push('Guardrails the founder set for you (follow them strictly):');g.rules.forEach(function(r: any){o.push('- '+ruleLabel(r.type)+': '+r.text)})} if(g.items.length){o.push('Skills, plugins and tools assigned to you on the Capabilities page (a register, not proof they are installed):');g.items.forEach(function(x: any){o.push('- '+x.name+' ('+kindLabel(x.kind)+', '+x.status+')'+(x.what?': '+x.what:''))})} return o }

setInterval(function(){
  if(!S.loaded)return;
  var ch=false;
  S.agents.forEach(function(a:any){if(expireLoan(a)){persist('agents',a.id,a);ch=true}if(restExpired(a)){a.status='active';delete a.restUntil;logStatus(a,'active','Rest ended');persist('agents',a.id,a);syncPause(a);ch=true}});
  if(ch){render();toast('A rest ended. The agent is active again.')}
  else if(S.agents.some(function(a:any){return a.status==='resting'})&&!S.ctl&&!S.edit&&!S.chat&&!S.wizard&&!(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)))render();
},30000);
render();
(async function(){
  DB=createDb();DL=createDownloads();S.canImport=true;
  var cfg=await loadConfig();
  if(cfg.chat)SAMPLE=createSample();
  MCP=cfg.github;S.canFeed=!!cfg.github;
  if(S.canFeed){
    loadControl();setInterval(function(){if(!document.hidden)loadControl()},60000);
    setTimeout(function(){if(!S.feed||!S.feed.fetchedAt||Date.now()-S.feed.fetchedAt>10*60000)refreshFeed(true)},4000);
    setInterval(function(){if(!document.hidden)refreshFeed(true)},5*60000);
  }
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
  DB.doc('meta/ext').onSnapshot(function(d:any){S.ext=d.exists?clone(d.data()):null;if(S.ext&&!S.ext.starter){S.ext.items=(S.ext.items||[]).concat(starterItems());S.ext.starter=true;saveExt(S.ext)}render()},function(){});
  DB.doc('meta/models').onSnapshot(function(d:any){S.models=d.exists?clone(d.data()):null;if(S.models&&S.models.list&&!S.models.haikuAdded&&!S.models.list.some(function(m:any){return m.id==='haiku55'})){S.models.list.push(clone(DEFAULT_MODELS.filter(function(m:any){return m.id==='haiku55'})[0]));S.models.haikuAdded=true;persistModels()}render()},function(){});
  DB.doc('meta/reqs').onSnapshot(function(d:any){S.reqs=d.exists?clone(d.data()):null;render()},function(){});
  DB.doc('meta/org').onSnapshot(function(d:any){S.org=d.exists?clone(d.data()):null;render()},function(){});
  DB.doc('meta/feed').onSnapshot(function(d:any){S.feed=d.exists?clone(d.data()):null;render()},function(){});
  DB.doc('meta/report').onSnapshot(function(d:any){S.report=d.exists?clone(d.data()):null;render()},function(){});
  DB.doc('meta/repos').onSnapshot(function(d:any){
    if(d.exists){var v=d.data();if(v&&Array.isArray(v.items)&&v.items.length){S.repos=keepKnown(clone(v.items));S.syncedAt=v.syncedAt||null;render()}}
  },function(){});
  render();
})();
}
