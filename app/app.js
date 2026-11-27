
const $ = s => document.querySelector(s);

// Admin yoki GitHub yangilagan savol/shablonlarni asosiy bazaga qo‘llaydi.
function applyContentPatch(data) {
  if (!data || typeof data !== 'object') return;
  const isCyrl = document.documentElement.dataset.script === 'cyrl';
  // Dasturchi o'rgatgan lotin->kirill lug'ati paket bilan keladi.
  if (data.translitDict && window.UZ_TRANSLIT) window.UZ_TRANSLIT.setUserDict(data.translitDict);
  // Kirill sayt: paketda kirill nusxasi yo'q / bo'sh / "Янги савол матни" bo'lib qolgan savollar
  // lotin matndan avtomatik o'giriladi. Qo'lda yozilgan kirill matnga tegilmaydi.
  if (isCyrl && window.UZ_TRANSLIT && (Array.isArray(data.templates) || Array.isArray(data.questions))) {
    try {
      const filled = window.UZ_TRANSLIT.fillPayload(data);
      if (filled.fields || filled.questions) console.info('Kirill avtomatik to‘ldirildi:', filled);
    } catch (error) { console.warn('Kirillga o‘girishda xato:', error); }
  }
  const templates = isCyrl ? data.templatesKiril : data.templates;
  const questions = isCyrl ? data.questionsKiril : data.questions;
  if (Array.isArray(templates)) window.BUNDLED_TEMPLATES = templates;
  if (Array.isArray(questions)) window.ALL_QUESTIONS = questions;
  if (Array.isArray(data.media)) {
    const old = Array.isArray(window.BUNDLED_MEDIA) ? window.BUNDLED_MEDIA : [];
    const paths = new Set(old.map(x => typeof x === 'string' ? x : x?.path || x?.id));
    data.media.forEach(x => {
      const path = typeof x === 'string' ? x : x?.path;
      if (path && !paths.has(path)) { old.push(path); paths.add(path); }
    });
    window.BUNDLED_MEDIA = old;
  }
  if (data.videoPolicy && typeof data.videoPolicy === 'object') window.APP_VIDEO_POLICY = { ...data.videoPolicy };
  window.APP_CONTENT_VERSION = String(data.version || window.APP_CONTENT_VERSION || '1.0.0');
  window.__TEMPLATE_MEDIA_LOOKUP = null;
}
applyContentPatch(window.APP_CONTENT_PATCH);

// ---- MODERN WELCOME INTRO ----
(function initWelcomeIntro(){
  const intro=document.getElementById('welcomeIntro');
  const skip=document.getElementById('welcomeSkip');
  if(!intro) return;
  let closed=false;
  const close=()=>{
    if(closed) return;
    closed=true;
    intro.classList.add('is-leaving');
    intro.setAttribute('aria-hidden','true');
    setTimeout(()=>intro.remove(),750);
  };
  skip?.addEventListener('click',close);
  setTimeout(close,1800);
  document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape')close();},{once:true});
})();


let templateFiles=[], allFiles=[], current=null, currentFileIndex=-1, qIndex=0, answered=[], score=0, objectUrls=[];
const templateQuestionCache = new WeakMap();
let imageSize='medium', scale=100, timerSeconds=1500, timerId=null;
let examMode=false, examWrongCount=0, examPool=[], lastRunWasExam=false;
const MISTAKES_KEY='yangiyer_avto_test_mistakes_v1';
const THEME_KEY='ui_theme';

// ---- BUNDLED DATA: automatically available on startup ----
function makeBundledFiles(){
  const out=[];
  (window.BUNDLED_TEMPLATES||[]).forEach(t=>out.push({name:t.name,webkitRelativePath:t.path,__bundled:true,__template:true,__questions:Array.isArray(t.questions)?t.questions:null}));
  (window.BUNDLED_MEDIA||[]).forEach(item=>{
    if(typeof item==='string')out.push({name:item.split('/').pop(),webkitRelativePath:item,__bundled:true});
    else if(item && item.id){
      const kind=item.kind==='video'?'video':'image';
      out.push({name:String(item.id),webkitRelativePath:`vault:${kind==='video'?'vid':'img'}:${item.id}`,
        __bundled:true,__vaultId:item.id,__mediaKind:kind});
    }
  });
  return out;
}
function initBundledProject(){ const files=makeBundledFiles(); if(files.length) loadProject(files); }
function ensureBundledProject(){ if(!templateFiles.length && ((window.BUNDLED_TEMPLATES||[]).length || (window.BUNDLED_MEDIA||[]).length)) initBundledProject(); }


$('#folder')?.addEventListener('change',e=>loadProject([...e.target.files]));
$('#files')?.addEventListener('change',e=>loadProject([...e.target.files]));
function setTopActive(id){
  document.querySelectorAll('.top-actions .top-btn').forEach(b=>b.classList.remove('active'));
  const b=document.getElementById(id); if(b) b.classList.add('active');
}
$('#homeBtn').onclick=()=>{showView('home');setTopActive('homeBtn')};
$('#templatesBtn').onclick=()=>{showView('templates');setTopActive('templatesBtn')};
$('#homeLoginBtn').onclick=()=>startRandomExam();
$('#homeTemplatesBtn').onclick=()=>showView('templates');
$('#homeGeneralTestBtn')?.addEventListener('click',()=>showView('general'));
$('#homeAllQuestionsBtn')?.addEventListener('click',()=>startSpecialTest('all'));
$('#homeResultsBtn').onclick=()=>{ if(current) showView('result'); else alert('Hozircha natija yo‘q. Avval testni ishlang.'); };
$('#homeFolder')?.addEventListener('change',e=>{loadProject([...e.target.files]);showView('templates');});
$('#homeTopicsBtn')?.addEventListener('click',()=>showView('topics'));
$('#topicsBackHome')?.addEventListener('click',()=>showView('home'));
$('#topicSearch')?.addEventListener('input',()=>window.renderTopics?.());
$('#homeSettingsBtn')?.addEventListener('click',()=>showView('settings'));
$('#templateSearch').oninput=renderTemplates;
const backTemplates=$('#backTemplates'); if(backTemplates) backTemplates.onclick=()=>showView('templates');
const retryBtn=$('#retryBtn'); if(retryBtn) retryBtn.onclick=()=>{if(current){answered=Array(current.questions.length).fill(null);score=0;resetTimer();showView('quiz');showQuestion(0);}};

function navigateQuizQuestion(step){
  if(!current || !Array.isArray(current.questions) || !current.questions.length) return;
  const target=Math.max(0,Math.min(qIndex+step,current.questions.length-1));
  if(target!==qIndex) showQuestion(target);
}
const prevBtn=$('#prev'); if(prevBtn){prevBtn.type='button';prevBtn.onclick=e=>{e.preventDefault();navigateQuizQuestion(-1);};}
const nextBtn=$('#next'); if(nextBtn){nextBtn.type='button';nextBtn.onclick=e=>{e.preventDefault();navigateQuizQuestion(1);};}
const refreshBtn=$('#refreshBtn'); if(refreshBtn) refreshBtn.onclick=()=>loadProject(allFiles);
$('#search').oninput=renderList;
const fullscreenTarget=document.documentElement;
let fullscreenSavedZoom='';
function updateFullscreenButton(){
  const buttons=[$('#fullscreenTopBtn'),$('#fullscreenBtn'),$('#homeFullscreenBtn')].filter(Boolean);
  buttons.forEach(b=>{
    b.textContent=document.fullscreenElement?'⛶ To‘liq ekran':'⛶ To‘liq ekran';
    b.title='To‘liq ekran';
    b.setAttribute('aria-label','To‘liq ekran');
  });
}
async function toggleFullscreen(){
  try{
    if(!document.fullscreenElement){
      fullscreenSavedZoom=document.body.style.zoom||'';
      await fullscreenTarget.requestFullscreen({navigationUI:'hide'});
      document.documentElement.classList.add('app-fullscreen');
    }else if(document.exitFullscreen){
      await document.exitFullscreen();
    }
  }catch(err){console.warn('Fullscreen ishlamadi:',err);}
}
const fullscreenTopBtn=$('#fullscreenTopBtn'); if(fullscreenTopBtn) fullscreenTopBtn.onclick=toggleFullscreen;
const fullscreenBtn=$('#fullscreenBtn'); if(fullscreenBtn) fullscreenBtn.onclick=toggleFullscreen;
const homeFullscreenBtn=$('#homeFullscreenBtn'); if(homeFullscreenBtn) homeFullscreenBtn.onclick=toggleFullscreen;
document.addEventListener('fullscreenchange',()=>{
  if(document.fullscreenElement){
    document.documentElement.classList.add('app-fullscreen');
    document.body.style.zoom='1';
    document.body.style.width='100%';
    document.body.style.height='100%';
  } else {
    document.documentElement.classList.remove('app-fullscreen');
    document.body.style.zoom=fullscreenSavedZoom||'';
    document.body.style.width='';
    document.body.style.height='';
    applyScale();
  }
  updateFullscreenButton();
});
updateFullscreenButton();
// Theme is handled by the single robust handler below (avoid double-toggle).

const settingsBtn=$('#settingsBtn'); if(settingsBtn) settingsBtn.onclick=()=>{setTopActive('settingsBtn');$('.rightbar').scrollIntoView({behavior:'smooth'})};
const helpBtn=$('#helpBtn'); if(helpBtn) helpBtn.onclick=()=>{setTopActive('helpBtn');alert('Shablon savollari dastur ichida tayyor. Media fayllar himoyalangan vault ichidan olinadi.')};
$('#showImages')?.addEventListener('change',()=>showQuestion(qIndex)); $('#autoVideo')?.addEventListener('change',()=>showQuestion(qIndex));
const timerStart=$('#timerStart'); if(timerStart) timerStart.onclick=startTimer;
const timerPause=$('#timerPause'); if(timerPause) timerPause.onclick=()=>clearInterval(timerId);
const timerReset=$('#timerReset'); if(timerReset) timerReset.onclick=resetTimer;
document.querySelectorAll('[data-layout]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.layout; document.body.classList.remove('layout-normal','layout-wide','layout-full'); document.body.classList.add('layout-'+v); setActive('[data-layout]',b); localStorage.setItem('ui_layout',v);}));
const savedLayout=localStorage.getItem('ui_layout')==='wide'?'wide':'normal'; document.body.classList.add('layout-'+savedLayout); document.querySelectorAll('[data-layout]').forEach(b=>b.classList.toggle('active',b.dataset.layout===savedLayout));
document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>setTheme(b.dataset.theme));


  // A+ kattalashtiriw 


  function changeScale(delta){
    const current=Number(scale)||100;
    scale=Math.max(70,Math.min(180,current+delta)); // Максимал лимит 140 dan 180 га оширилди
    applyScale();
    try{ localStorage.setItem('ui_scale',String(scale)); }catch(e){}
  }

function bindScaleButtons(){
  document.querySelectorAll('[data-scale]').forEach(btn=>{
    btn.type='button';
    btn.onclick=(e)=>{
      e.preventDefault();
      e.stopPropagation();
      const direction=btn.dataset.scale==='plus'?1:-1;
      changeScale(direction*10);
    };
  });
}

// A+ kattalawtiriw 

scale=Number(localStorage.getItem('ui_scale')||100);
function setActive(sel,el){document.querySelectorAll(sel).forEach(x=>x.classList.remove('active'));el.classList.add('active')}
function applyScale(){
  const textScale=Math.max(0.7,Math.min(1.8,Number(scale||100)/100)); // Мах кўпайтириш лимити 1.4 dan 1.8 (180%) га кўтарилди 
  const root=document.documentElement;
  root.style.setProperty('--quiz-text-scale',String(textScale));
  root.style.setProperty('--quiz-ui-scale',String(textScale));
  root.style.setProperty('--quiz-control-scale',String(textScale));
  root.style.setProperty('--quiz-zoom',String(textScale));
  const center=document.querySelector('.quiz-style .center');
  if(center) center.style.setProperty('font-size',`${14*textScale}px`,'important');
  document.querySelectorAll('[data-scale]').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('[data-scale="plus"]').forEach(b=>b.classList.toggle('active', scale>100));
  document.querySelectorAll('[data-scale="small"]').forEach(b=>b.classList.toggle('active', scale<100));
  bindScaleButtons();
}

function applyTheme(theme){
  const resolved=theme === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', resolved === 'light');
  document.body.classList.toggle('dark', resolved === 'dark');
  document.body.setAttribute('data-theme', resolved);
  // const themeBtn=$('#themeBtn');
  // if(themeBtn){ themeBtn.textContent = resolved === 'light' ? '☀ Light' : '☾ Dark'; }
  // document.querySelectorAll('[data-theme]').forEach(btn=>btn.classList.toggle('active', btn.dataset.theme === resolved));
  // try{ localStorage.setItem(THEME_KEY, resolved); }catch(e){}
}

function setTheme(t){
  applyTheme(t === 'auto' ? (document.body.classList.contains('light') ? 'light' : 'dark') : t);
}

bindScaleButtons();
applyScale();
function naturalFileCompare(a,b){
  const getName = f => {
    const path=(f.webkitRelativePath||f.name||'').replaceAll('\\','/');
    return path.split('/').pop().toLowerCase();
  };
  const an=getName(a), bn=getName(b);
  const splitNatural = s => s.split(/(\d+)/).map(x => /^\d+$/.test(x) ? Number(x) : x);
  const aa=splitNatural(an), bb=splitNatural(bn);
  const len=Math.max(aa.length,bb.length);
  for(let i=0;i<len;i++){
    if(i>=aa.length) return -1;
    if(i>=bb.length) return 1;
    const x=aa[i], y=bb[i];
    if(typeof x==='number' && typeof y==='number'){
      if(x!==y) return x-y;
    }else if(x!==y){
      return String(x).localeCompare(String(y),'uz',{sensitivity:'base'});
    }
  }
  const ap=(a.webkitRelativePath||a.name||'').replaceAll('\\','/').toLowerCase();
  const bp=(b.webkitRelativePath||b.name||'').replaceAll('\\','/').toLowerCase();
  return ap.localeCompare(bp,'uz',{sensitivity:'base'});
}

function loadProject(input){cleanup();allFiles=input||[];templateFiles=allFiles.filter(f=>f.__template===true || Array.isArray(f.__questions)).sort(naturalFileCompare);$('#fileCount').textContent=templateFiles.length+' ta fayl';$('#questionTotal').textContent='0 ta savol';renderList();renderTemplates();updateHomeCounts();if($('#homeStatus')) $('#homeStatus').textContent=templateFiles.length?`${templateFiles.length} ta shablon yuklandi.`:'Shablonlar topilmadi.';if(!templateFiles.length)showEmpty('Shablonlar topilmadi.');}
function renderList(){let term=$('#search').value.toLowerCase();$('#list').innerHTML='';templateFiles.forEach((f,i)=>{let path=f.webkitRelativePath||f.name;if(term&&!path.toLowerCase().includes(term))return;let d=document.createElement('div');d.className='item'+(i===currentFileIndex?' active':'');d.innerHTML=`<b>🚗 ${esc(f.name)}</b><small>${esc(path.replace(f.name,'').replace(/\/$/,'')||'asosiy papka')}</small><i class="dot"></i>`;d.onclick=()=>openFile(i);$('#list').appendChild(d)});}
function getTemplateQuestions(file){
  if(!file || !Array.isArray(file.__questions)){
    throw new Error('Shablon savollari tayyor ma’lumot sifatida topilmadi. Yangilangan Build-Windows.cmd bilan EXE ni qayta yig‘ing.');
  }
  let cached=templateQuestionCache.get(file);
  if(!cached){
    cached=file.__questions.map(normalizeTemplateCorrectIndex);
    templateQuestionCache.set(file,cached);
  }
  return cached;
}
async function openFile(i){
  if(typeof specialTestMode!=='undefined'){specialTestMode=false;document.body.classList.remove('special-test-active');}
  // Tugallanmagan imtihon holati shablonga o'tib qolmasin.
  abortExam();
  lastRunWasExam=false;
  currentFileIndex=i;qIndex=0;renderList();
  try{
    const file=templateFiles[i];
    $('#status').textContent='Shablon ochilmoqda...';
    const qs=getTemplateQuestions(file);
    const displayQs=(typeof templateShuffleEnabled==='function' && templateShuffleEnabled())
      ? qs.map(shuffleTemplateQuestion) : qs.slice();
    current={file,path:file.webkitRelativePath||file.name,questions:displayQs};
    const baseName=String(file.name||'').replace(/\.(?:py|js)$/i,'');
    const templateNumber=(baseName.match(/\d+/)||[])[0] || String(i+1);
    const templateLabel=$('#quizTemplateLabel'); if(templateLabel) templateLabel.textContent=`${templateNumber}-SHABLON`;
    answered=Array(displayQs.length).fill(null);score=0;
    $('#empty').hidden=true;$('#quiz').hidden=false;
    $('#currentFile').textContent=current.path;
    $('#questionTotal').textContent=displayQs.length+' ta savol';
    $('#status').textContent=displayQs.length+' ta savol yuklandi';
    updateNav();resetTimer();startTimer();showQuestion(0);
  }catch(e){console.error(e);showEmpty('Xatolik: '+(e.message||e));}
}
function showEmpty(msg){$('#empty').hidden=false;$('#quiz').hidden=true;$('#empty').innerHTML=`<div class="empty-icon">⚠️</div><h2>Shablon yuklanmadi</h2><p>${esc(msg)}</p>`}
function pick(o,...ks){for(let k of ks)if(o?.[k]!==undefined&&o[k]!==null&&o[k]!=='')return o[k];return null}
function normalizeAssetRef(ref){
  if(ref==null)return '';
  let s=String(ref).trim().replace(/^['\"]|['\"]$/g,'').replaceAll('\\','/');
  try{s=decodeURIComponent(s)}catch(_e){}
  s=s.replace(/^file:\/\//i,'').replace(/^\.\//,'').replace(/^\/+/, '').toLowerCase();
  s=s.replace(/^.*?\/(?:images?|rasmlar|videos?|videolar)\//i,m=>m.toLowerCase().replace(/^.*?\//,''));
  return s;
}
function secureBundledUrl(path){
  if(!window.__SECURE_APP__)return null;
  const raw=String(path||'').trim();
  const match=/^vault:(img|vid):([0-9a-f]{64})$/i.exec(raw);
  return match?`https://secure-media.local/${match[2]}`:null;
}
function assetFor(ref){
  if(!ref)return null;
  if(ref instanceof File){
    if(window.__SECURE_APP__)return null; // EXE faqat vault ichidagi media fayllarni ochadi.
    const u=URL.createObjectURL(ref);objectUrls.push(u);return u;
  }
  if(typeof ref==='object'){
    if(ref.__bundled && ref.webkitRelativePath){
      const bundledPath=ref.webkitRelativePath.replaceAll('\\','/');
      return window.__SECURE_APP__?secureBundledUrl(bundledPath):bundledPath;
    }
    for(const k of ['path','src','url','file','name','value']){if(ref[k]){const u=assetFor(ref[k]);if(u)return u;}}
    return null;
  }
  const wanted=normalizeAssetRef(ref); if(!wanted)return null;
  const remoteBlob=window.APP_UPDATE_MEDIA?.[String(ref).replaceAll('\\','/')] || window.APP_UPDATE_MEDIA?.[wanted];
  if(remoteBlob instanceof Blob){
    window.__APP_MEDIA_URLS=window.__APP_MEDIA_URLS||new Map();
    const key=String(ref);
    if(!window.__APP_MEDIA_URLS.has(key))window.__APP_MEDIA_URLS.set(key,URL.createObjectURL(remoteBlob));
    return window.__APP_MEDIA_URLS.get(key);
  }
  // EXE ichida GitHub'dan kelgan media shifrlangan vault ichida turadi: https://vault.local/updates/media/...
  if(window.__VAULT_HOST__){
    const rel=String(ref).replaceAll('\\','/').replace(/^\.?\//,'');
    if(/^updates\/media\//i.test(rel))return rel.split('/').map(encodeURIComponent).join('/');
  }
  if(window.__SECURE_APP__){const direct=secureBundledUrl(ref);if(direct)return direct;}
  const base=wanted.split('/').pop();
  const stem=base.replace(/\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|ogg|mov)$/i,'');
  const files=allFiles.filter(f=>/\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|ogg|mov)$/i.test(f.name));
  let f=files.find(x=>normalizeAssetRef(x.webkitRelativePath||x.name)===wanted)
      ||files.find(x=>normalizeAssetRef(x.webkitRelativePath||x.name).endsWith('/'+wanted))
      ||files.find(x=>normalizeAssetRef(x.name)===base)
      ||files.find(x=>normalizeAssetRef(x.webkitRelativePath||x.name).split('/').pop()===base)
      ||files.find(x=>normalizeAssetRef(x.name).replace(/\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|ogg|mov)$/i,'')===stem);
  // In the secure EXE, never substitute an unrelated video when a path is missing.
  if(!f && !window.__SECURE_APP__ && /\.(mp4|webm|ogg|mov)(?:\?.*)?$/i.test(base)){
    f=files.find(x=>x.__bundled && /\.(mp4|webm|ogg|mov)$/i.test(x.name)) || files.find(x=>/\.(mp4|webm|ogg|mov)$/i.test(x.name));
  }
  if(!f)return null;
  if(f.__bundled && f.webkitRelativePath){
    let p=f.webkitRelativePath.replaceAll('\\','/');
    const ix=p.indexOf('assets/'); if(ix>0)p=p.slice(ix);
    return window.__SECURE_APP__?secureBundledUrl(p):p;
  }
  const u=URL.createObjectURL(f);objectUrls.push(u);return u;
}

function localizedValue(v){
  if(v && typeof v==='object' && !Array.isArray(v)){
    const lang=localStorage.getItem('ui_lang')||'uz';
    const keys=lang==='ru'?['ru','rus','russian','русский']:lang==='cy'?['cy','uz_cyrl','kirill','kr','uzbek_cyrillic','ўзбекча']:['uz','uz_lat','uzbek','o‘zbek','o\'zbek'];
    for(const k of keys){if(v[k]!==undefined && v[k]!==null && v[k]!=='') return v[k];}
    for(const k of ['text','label','variant','name']){if(v[k]!==undefined && v[k]!==null && v[k]!=='') return v[k];}
  }
  return v;
}
function localizedPick(o,...ks){for(const k of ks){const v=o?.[k];if(v!==undefined&&v!==null&&v!=='')return localizedValue(v)}return null}

function showQuestion(n){if(!current?.questions?.length)return;qIndex=Math.max(0,Math.min(n,current.questions.length-1));let q=current.questions[qIndex]||{};$('#counter').textContent=`${qIndex+1} / ${current.questions.length}`;$('#progressBar').style.width=((qIndex+1)/current.questions.length*100)+'%';$('#score').textContent=score;$('#question').textContent=localizedPick(q,'savol','question','text')||'';$('#media').innerHTML='';if($('#explanation'))$('#explanation').hidden=true;renderAnswers(q);const correct=Number(pick(q,'togri_javob','correct','correctAnswer'));addMedia(q,answered[qIndex]!==null && answered[qIndex]!==correct);renderNumbers();updateNav();}
function renderAnswers(q){let box=$('#answers');box.innerHTML='';let arr=pick(q,'variantlar','answers','options')||[];let correct=Number(pick(q,'togri_javob','correct','correctAnswer'));arr.forEach((a,i)=>{let label=typeof a==='object'?localizedValue(a)||JSON.stringify(a):String(a);let b=document.createElement('button');b.className='answer';let key=['F1','F2','F3','F4','F5','F6'][i]||String(i+1);b.innerHTML=`<span class="key">${key}</span>${esc(label)}`;if(answered[qIndex]!==null){if(i===correct)b.classList.add('correct');else if(i===answered[qIndex])b.classList.add('wrong')}b.onclick=()=>answer(i,correct,q);box.appendChild(b)})}
function answer(i,correct,q){
  if(answered[qIndex]!==null)return;
  answered[qIndex]=i;
  if(i===correct)score++;
  renderAnswers(q); $('#score').textContent=score; updateNav(); renderNumbers();
  // Noto‘g‘ri javob tanlanganda video darhol asosiy rasm o‘rnida chiqadi.
  if(i!==correct){
    const media=$('#media');
    if(media){ media.innerHTML=''; addMedia(q,true); }
  }
  // Javob tanlangandan keyin savol avtomatik almashmaydi.
  // Keyingi savol faqat "Keyingi" tugmasi yoki savol raqami bosilganda ochiladi.
  if(answered.every(x=>x!==null)) showResult();
}
function findAssetRefDeep(value, mode='wrong', depth=0){
  if(value==null || depth>8) return null;
  const candidates=[];
  function walk(v,keyPath=[],d=0){
    if(v==null || d>8)return;
    if(typeof v==='string'){
      if(/^vault:vid:[0-9a-f]{64}$/i.test(v) || /\.(mp4|webm|ogg|mov)(?:\?.*)?$/i.test(v)) candidates.push({ref:v,key:keyPath.join('_'),score:scoreVideoKey(keyPath.join('_'),mode)});
      return;
    }
    if(Array.isArray(v)){v.forEach((x,i)=>walk(x,keyPath.concat(i),d+1));return;}
    if(typeof v==='object')Object.entries(v).forEach(([k,x])=>walk(x,keyPath.concat(k),d+1));
  }
  walk(value);
  candidates.sort((a,b)=>b.score-a.score);
  if(mode==='wrong'){
    const preferred=candidates.find(x=>x.score>=8) || candidates.find(x=>x.score>=2);
    return preferred?.ref || null;
  }
  return candidates[0]?.ref || null;
}
function scoreVideoKey(k,mode){
  const s=String(k).toLowerCase().replace(/[ _-]/g,'');
  if(!/(video|mp4|webm|ogg|mov)/.test(s)) return 0;
  if(mode==='wrong'){
    if(/wrong|xato|hato|noto|notogri|izoh|explanation|error|incorrect|mistake/.test(s)) return 10;
    if(/video/.test(s)) return 1;
    return 0;
  }
  return /video/.test(s)?2:1;
}
function findMediaRefDeep(value, type='image', mode='normal'){
  if(value==null)return null;
  const exts=type==='video'?/\.(mp4|webm|ogg|mov)(?:\?.*)?$/i:/\.(png|jpe?g|gif|webp|bmp|svg)(?:\?.*)?$/i;
  const keys=[];
  const walk=(v,path=[],d=0)=>{
    if(v==null||d>10)return;
    if(typeof v==='string'){
      const vaultType=type==='video'?/^vault:vid:[0-9a-f]{64}$/i.test(v):/^vault:img:[0-9a-f]{64}$/i.test(v);
      if(vaultType || exts.test(v)){
        const k=path.join('_').toLowerCase().replace(/[ _-]/g,'');
        let score=1;
        if(type==='video'){
          if(/wrong|xato|hato|noto|notogri|incorrect|error|mistake|izoh|explanation/.test(k))score+=20;
          if(/video/.test(k))score+=5;
        }else if(/rasm|image|photo|picture|savol/.test(k))score+=10;
        keys.push({ref:v,score});
      }
      return;
    }
    if(Array.isArray(v)){v.forEach((x,i)=>walk(x,path.concat(i),d+1));return;}
    if(typeof v==='object')Object.entries(v).forEach(([k,x])=>walk(x,path.concat(k),d+1));
  };
  walk(value);
  keys.sort((a,b)=>b.score-a.score);
  return keys[0]?.ref||null;
}
function addMedia(q,wrong=false){
  const ir=localizedPick(q,'rasm','image','photo','picture','savol_rasm','image_url','imageUrl','rasm_url','rasmUrl') || findMediaRefDeep(q,'image','normal');
  const normalVideo=localizedPick(q,'video','video_url','savol_video','videoUrl','video_path','videoPath','izoh_video','explanation_video') || findMediaRefDeep(q,'video','normal');
  let wrongVideo=localizedPick(q,'wrong_video','wrongVideo','wrongVideoUrl','xato_video','hato_video','noto_gri_video','notogri_video','wrong_video_url','xatoVideo','hatoVideo','izoh_video','explanation_video','error_video','incorrect_video','video_xato','video_hato');
  if(wrong && !wrongVideo) wrongVideo=findMediaRefDeep(q,'video','wrong') || findAssetRefDeep(q,'wrong');
  const media=$('#media'); if(!media)return;

  const addInlineVideo=(src)=>{
    if(!src)return false;
    const wrap=document.createElement('div'); wrap.className='media-frame video-frame';
    const back=document.createElement('button');
    back.type='button'; back.className='video-back-arrow'; back.innerHTML='←';
    back.title='Rasmga qaytish'; back.setAttribute('aria-label','Rasmga qaytish');
    back.onclick=(e)=>{
      e.preventDefault();
      e.stopPropagation();
      // Videodan rasmga qaytishda media maydonini to'liq almashtiramiz.
      // Eski video DOM elementi qolib ketmaydi va rasm video bilan yonma-yon chiqmaydi.
      media.innerHTML='';
      const imageSrc=assetFor(
        localizedPick(q,'rasm','image','photo','picture','savol_rasm','image_url','imageUrl','rasm_url','rasmUrl') ||
        findMediaRefDeep(q,'image','normal')
      );
      if(!imageSrc) return;
      const imageWrap=document.createElement('div');
      imageWrap.className='media-frame';
      const image=document.createElement('img');
      image.src=imageSrc;
      image.className='media-img img-'+imageSize;
      image.alt='Savol rasmi';
      image.title='Kattalashtirish uchun bosing';
      image.onclick=()=>openMedia(imageSrc,'image');
      image.onerror=()=>imageWrap.remove();
      imageWrap.appendChild(image);
      const normalVideo=localizedPick(q,'video','video_url','savol_video','videoUrl','video_path','videoPath','izoh_video','explanation_video') || findMediaRefDeep(q,'video','normal');
      const normalVideoSrc=assetFor(normalVideo);
      if(normalVideoSrc){
        const videoBtn=document.createElement('button');
        videoBtn.type='button';
        videoBtn.className='media-video-btn';
        videoBtn.innerHTML='▶';
        videoBtn.title="Videoni ko'rish";
        videoBtn.setAttribute("aria-label","Videoni ko'rish");
        videoBtn.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();openMedia(normalVideoSrc,'video');};
        imageWrap.appendChild(videoBtn);
      }
      media.appendChild(imageWrap);
    };
    wrap.appendChild(back);
    const el=document.createElement('video');
    el.src=src; el.controls=true; el.playsInline=true; el.preload='metadata';
    el.className='main-video wrong-answer-video';
    el.onclick=()=>openMedia(src,'video');
    wrap.appendChild(el); media.appendChild(wrap);
    return true;
  };

  if(wrong){
    const v=assetFor(wrongVideo);
    if(v && addInlineVideo(v)) return;
  }

  const u=assetFor(ir); if(!u)return;
  const wrap=document.createElement('div'); wrap.className='media-frame';
  const img=document.createElement('img'); img.src=u; img.className='media-img img-'+imageSize;
  img.title='Kattalashtirish uchun bosing'; img.alt='Savol rasmi';
  img.onclick=()=>openMedia(u,'image'); img.onerror=()=>wrap.remove(); wrap.appendChild(img);

  const videoSrc=assetFor(normalVideo);
  if(videoSrc){
    const videoBtn=document.createElement('button'); videoBtn.type='button'; videoBtn.className='media-video-btn';
    videoBtn.innerHTML='▶'; videoBtn.title='Videoni ko‘rish'; videoBtn.setAttribute('aria-label','Videoni ko‘rish');
    videoBtn.onclick=(e)=>{e.preventDefault();e.stopPropagation();openMedia(videoSrc,'video');};
    wrap.appendChild(videoBtn);
  }
  media.appendChild(wrap);
}
function renderNumbers(){let box=$('#numbers');box.innerHTML='';if(!current)return;current.questions.forEach((q,i)=>{let b=document.createElement('button');let cls='num';if(answered[i]!==null){const correct=Number(pick(q,'togri_javob','correct','correctAnswer'));cls += answered[i]===correct?' correct':' wrong';}else if(i===qIndex){cls+=' active';}b.className=cls;b.textContent=i+1;b.onclick=()=>showQuestion(i);box.appendChild(b)})}
function updateNav(){if(!current){$('#navAll').textContent=$('#navDone').textContent=$('#navReview').textContent=$('#navEmpty').textContent='0';return}let done=answered.filter(x=>x!==null).length;$('#navAll').textContent=current.questions.length;$('#navDone').textContent=done;$('#navReview').textContent=0;$('#navEmpty').textContent=current.questions.length-done;$('#prev').disabled=qIndex<=0;$('#next').disabled=qIndex>=current.questions.length-1}
function startTimer(){
  clearInterval(timerId);
  timerId=setInterval(()=>{
    if(timerSeconds<=0){clearInterval(timerId);timerId=null;if(examMode) finishExam('Vaqt tugadi');return}
    timerSeconds--; drawTimer();
  },1000);
  drawTimer();
}
function resetTimer(){clearInterval(timerId);timerId=null;timerSeconds=1500;drawTimer()}
function drawTimer(){
  const s=String(Math.max(0,timerSeconds)); const mm=String(Math.floor(Number(s)/60)).padStart(2,'0'); const ss=String(Number(s)%60).padStart(2,'0');
  if($('#timer')) $('#timer').textContent=mm+':'+ss;
  if($('#quizTimer')){const el=$('#quizTimer');el.textContent=mm+':'+ss;el.classList.toggle('time-warning',timerSeconds<=300&&timerSeconds>60);el.classList.toggle('time-danger',timerSeconds<=60);}
  const top=$('#topExamTimer'); if(top){top.hidden=!document.body.classList.contains('view-quiz'); const b=top.querySelector('b'); if(b)b.textContent=mm+':'+ss; top.classList.toggle('time-warning',timerSeconds<=300&&timerSeconds>60); top.classList.toggle('time-danger',timerSeconds<=60);}
}
function cleanup(){objectUrls.forEach(URL.revokeObjectURL);objectUrls=[]}function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function updateHomeCounts(){
  const qStat=$('#homeQuestionStat'); if(qStat) qStat.textContent=(window.ALL_QUESTIONS||[]).length.toLocaleString('uz-UZ');
  const tStat=$('#homeTemplateStat'); if(tStat) tStat.textContent=(window.BUNDLED_TEMPLATES||[]).length.toLocaleString('uz-UZ');
  const available=(f)=>!window.__SECURE_APP__ || !f.__bundled || !!secureBundledUrl(f.webkitRelativePath||f.name);
  const isImage=(f)=>f.__mediaKind?f.__mediaKind==='image':/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name);
  const isVideo=(f)=>f.__mediaKind?f.__mediaKind==='video':/\.(mp4|webm|ogg|mov)$/i.test(f.name);
  const imgs=allFiles.filter(f=>available(f) && isImage(f)).length;
  const vids=allFiles.filter(f=>available(f) && isVideo(f)).length;
  if($('#homeStatus')) $('#homeStatus').textContent=templateFiles.length?`${templateFiles.length} ta shablon, ${imgs} ta rasm, ${vids} ta video yuklangan.`:'Shablonlar va rasmlar/videolar papkalarini birga tanlang.';
}
function showView(name){
  // Returning to the home page must always restore the normal page layout.
  // The browser fullscreen state must not leave the home card stretched and
  // push the home menu below the visible area.
  if(name==='home'){
    document.documentElement.classList.remove('app-fullscreen');
    document.body.style.zoom='';
    if(document.fullscreenElement){ document.exitFullscreen?.().catch(()=>{}); }
  }
  $('#homeView').hidden=true;
  $('#templatesView').hidden=true;
  $('#topicsView').hidden=true;
  $('#quizView').hidden=true;
  $('#resultView').hidden=true;
  $('#generalTestView').hidden=true;
  $('#settingsView').hidden=true;
  document.body.classList.remove('quiz-style','view-home','view-templates','view-topics','view-quiz','view-result','view-general','view-settings');
  document.body.classList.add('view-'+name);
  if(name==='home'){ $('#homeView').hidden=false; updateHomeCounts(); }
  if(name==='templates'){ $('#templatesView').hidden=false; renderTemplates(); }
  if(name==='topics'){ $('#topicsView').hidden=false; window.renderTopics?.(); }
  if(name==='general'){ $('#generalTestView').hidden=false; }
  if(name==='settings'){ $('#settingsView').hidden=false; syncTemplateShuffleSetting(); }
  if(name==='quiz'){ $('#quizView').hidden=false; document.body.classList.add('quiz-style'); }
  const topTimer=$('#topExamTimer'); if(topTimer) topTimer.hidden=name!=='quiz';
  if(name==='result'){ $('#resultView').hidden=false; }
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderTemplates(){
  const grid=$('#templateGrid'); if(!grid)return;
  if(!templateFiles.length && ((window.BUNDLED_TEMPLATES||[]).length)){ ensureBundledProject(); return; }
  const term=($('#templateSearch')?.value||'').toLowerCase(); grid.innerHTML='';
  const lang=localStorage.getItem('ui_lang')||'uz';
  const tx={
    uz:{empty:'Shablonlar yo‘q',pick:'Shablon savollari dastur ichida tayyor bo‘lishi kerak.',status:'YANGIYER AVTO TEST',open:'Ochish →'},
    cy:{empty:'Шаблонлар йўқ',pick:'Шаблон саволлари дастур ичида тайёр бўлиши керак.',status:'YANGIYER AVTO TEST',open:'Очиш →'},
    ru:{empty:'Нет шаблонов',pick:'Данные шаблонов должны быть встроены в приложение.',status:'YANGIYER AVTO TEST',open:'Открыть →'}
  }[lang]||null;
  const t=tx;
  if(!templateFiles.length){grid.innerHTML=`<div class="panel empty"><div class="empty-icon">🚗</div><h2>${t.empty}</h2><p>${t.pick}</p></div>`;return;}
  templateFiles.forEach((f,i)=>{
    const path=f.webkitRelativePath||f.name;
    if(term&&!path.toLowerCase().includes(term))return;

    // Kartada ichki JS ma’lumot faylining texnik nomini ko‘rsatmaymiz.
    // shablon_1.js -> 1 shablon, shablon_2.js -> 2 shablon, ...
    const baseName=String(f.name||'').replace(/\.(?:py|js)$/i,'');
    const number=(baseName.match(/\d+/)||[])[0] || String(i+1);
    const templateTitle=`${number} shablon`;

    const templateIcons=window.__SECURE_APP__?(window.__SECURE_TEMPLATE_ICONS||[]):['assets/template-icons/icon-1.png','assets/template-icons/icon-2.png','assets/template-icons/icon-3.png','assets/template-icons/icon-4.png','assets/template-icons/icon-5.png','assets/template-icons/icon-6.png'];
    const card=document.createElement('article'); card.className='template-card panel';
    const templateIcon=templateIcons.length?templateIcons[i % templateIcons.length]:'';
    card.innerHTML=`<div class="template-icon" aria-hidden="true">${templateIcon?`<img src="${templateIcon}" alt="">`:''}</div><h3>${esc(templateTitle)}</h3><button class="next-btn">${t.open}</button>`;
    card.querySelector('button').onclick=()=>{
      // Shablon ochilganda brauzer fullscreeniga avtomatik kirmaymiz.
      // To‘liq ekran faqat yuqoridagi tugma orqali yoqiladi — shunda Bosh sahifaga
      // qaytganda sahifa cho‘zilib yoki markazga siqilib qolmaydi.
      openFile(i).then(()=>showView('quiz'));
    };
    grid.appendChild(card);
  });
}

function showResult(){
  if(!current)return;
  clearInterval(timerId);
  const total=current.questions.length, done=answered.filter(x=>x!==null).length;
  let wrong=0;
  answered.forEach((a,i)=>{if(a!==null){const c=Number(pick(current.questions[i],'togri_javob','correct','correctAnswer'));if(a!==c)wrong++;}});
  const empty=total-done,pct=total?Math.round(score/total*100):0;
  $('#resultPercent').textContent=pct+'%';$('#resultSummary').textContent=`${score} / ${total} to‘g‘ri`;
  $('#resultCorrect').textContent=score;$('#resultWrong').textContent=wrong;$('#resultEmpty').textContent=empty;$('#resultTotal').textContent=total;
  const list=$('#resultList');list.innerHTML='';
  current.questions.forEach((q,i)=>{
    const c=Number(pick(q,'togri_javob','correct','correctAnswer'));
    const state=answered[i]===null?'Javobsiz':answered[i]===c?'To‘g‘ri':'Noto‘g‘ri';
    const b=document.createElement('button');b.className='result-row '+(state==='To‘g‘ri'?'r-ok':state==='Noto‘g‘ri'?'r-bad':'r-empty');
    b.innerHTML=`<b>${i+1}</b><span>${esc(String(pick(q,'savol','question','text')||'').slice(0,100))}</span><strong>${state}</strong>`;
    b.onclick=()=>{showView('quiz');showQuestion(i);};list.appendChild(b);
  });
  showView('result');
}


const LANGS={
 uz:{home:'⌂ Bosh sahifa',templates:'▦ Shablonlar',settings:'⚙ Sozlamalar',welcome:'Prava olish endi biz bilan oson!',ready:'Haydovchilik imtihoniga tayyormisiz?',start:'Imtihonni boshlash',t:'Shablonlar',r:'Natijalar',rs:'Test natijalari',step:'2-QADAM',choose:'Kerakli shablonni tanlang va testni boshlang.',search:'⌕  Shablon qidirish...',prev:'← Oldingi',explain:'ⓘ Izohni ko‘rsatish',next:'Keyingi →',size:'Ko‘rinish o‘lchami',imageSize:'Rasm o‘lchami',layout:'Maket',theme:'Mavzu',all:'Barcha savollar',done:'Javob berilgan',review:'Ko‘rib chiqish',empty:'Javobsiz savollar',showImages:'Rasmlarni ko‘rsatish',autoVideo:'Videolarni avtomatik ijro etish',autoExplain:'Izohlarni avtomatik ochish'},
 cy:{home:'⌂ Бош саҳифа',templates:'▦ Шаблонлар',settings:'⚙ Созламалар',welcome:'Права олиш энди биз билан осон!',ready:'Ҳайдовчилик имтиҳонига тайёрмисиз?',start:'Имтиҳонни бошлаш',t:'Шаблонлар',r:'Натижалар',rs:'Тест натижалари',step:'2-ҚАДАМ',choose:'Керакли шаблонни танланг ва тестни бошланг.',search:'⌕  Шаблон қидириш...',prev:'← Олдинги',explain:'ⓘ Изоҳни кўрсатиш',next:'Кейинги →',size:'Кўриниш ўлчами',imageSize:'Расм ўлчами',layout:'Макет',theme:'Мавзу',all:'Барча саволлар',done:'Жавоб берилган',review:'Кўриб чиқиш',empty:'Жавобсиз саволлар',showImages:'Расмларни кўрсатиш',autoVideo:'Видеоларни автоматик ижро этиш',autoExplain:'Изоҳларни автоматик очиш'},
 ru:{home:'⌂ Главная',templates:'▦ Шаблоны',settings:'⚙ Настройки',welcome:'Получать права теперь легко с нами!',ready:'Готовы к экзамену по вождению?',start:'Начать экзамен',t:'Шаблоны',r:'Результаты',rs:'Результаты тестов',step:'2-ШАГ',choose:'Выберите нужный шаблон и начните тест.',search:'⌕  Поиск шаблона...',prev:'← Назад',explain:'ⓘ Показать пояснение',next:'Далее →',size:'Размер интерфейса',imageSize:'Размер изображения',layout:'Макет',theme:'Тема',all:'Все вопросы',done:'Отвечено',review:'На проверку',empty:'Без ответа',showImages:'Показывать изображения',autoVideo:'Автоматически воспроизводить видео',autoExplain:'Автоматически открывать пояснения'}
};
function applyLanguage(lang){
 const t=LANGS[lang]||LANGS.uz;
 localStorage.setItem('ui_lang',lang);
 document.documentElement.lang=lang==='ru'?'ru':lang==='cy'?'uz-Cyrl':'uz';
 document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));
 const set=(sel,val)=>{const el=$(sel);if(el)el.textContent=val};
 set('#homeBtn',t.home); set('#templatesBtn',t.templates);
 set('#homeWelcomeTitle',t.welcome); set('#homeWelcomeText',t.ready); set('#homeExamText',t.start);
 set('#homeTemplatesText',t.t); set('#homeResultsText',t.r); set('#homeResultsSub',t.rs); set('#homeTopicsText',lang==='ru'?'По темам':lang==='cy'?'Мавзу бўйича':'Mavzu bo‘yicha'); set('#homeTopicsSub',lang==='ru'?'Тесты по темам':lang==='cy'?'Мавзулар бўйича тестлар':'Mavzular bo‘yicha testlar'); set('#homeSettingsText',t.settings.replace('⚙ ','')); set('#homeSettingsSub',lang==='ru'?'Настройки теста':lang==='cy'?'Тест созламалари':'Test sozlamalari');
 const head=document.querySelector('.templates-head h1'); if(head)head.textContent=t.t;
 const step=document.querySelector('.templates-head .home-kicker'); if(step)step.textContent=t.step;
 const desc=document.querySelector('.templates-head p'); if(desc)desc.textContent=t.choose;
 const search=$('#templateSearch'); if(search)search.placeholder=t.search;
 set('#prev',t.prev); set('#next',t.next);
 const themeBtns=document.querySelectorAll('[data-theme]'); if(themeBtns[0])themeBtns[0].textContent=lang==='ru'?'Тёмная':lang==='cy'?'Қоронғи':'Dark'; if(themeBtns[1])themeBtns[1].textContent=lang==='ru'?'Светлая':lang==='cy'?'Ёруғ':'Light'; if(themeBtns[2])themeBtns[2].textContent=lang==='ru'?'Авто':lang==='cy'?'Авто':'Auto';
 renderTemplates();
 if(current){ showQuestion(qIndex); }
 const groups=document.querySelectorAll('.controls .control-group span'); if(groups[0])groups[0].textContent=t.size; if(groups[2])groups[2].textContent=t.layout; if(groups[3])groups[3].textContent=t.theme;
 const stats=document.querySelectorAll('.rightbar .stat span'); if(stats[0])stats[0].textContent=t.all; if(stats[1])stats[1].textContent=t.done; if(stats[2])stats[2].textContent=t.review; if(stats[3])stats[3].textContent=t.empty;
 const checks=document.querySelectorAll('.rightbar .check span'); if(checks[0])checks[0].textContent=t.showImages; if(checks[1])checks[1].textContent=t.autoVideo; if(checks[2])checks[2].textContent=t.autoExplain;
}
// Kirill sahifasi (index-kiril.html) o'z yozuvida qolishi kerak.
applyLanguage(document.documentElement.dataset.script==='cyrl'?'cy':'uz');
setTheme(localStorage.getItem('ui_theme')||'dark');
applyScale();drawTimer();
showView('home');

const mediaModal=$('#mediaModal'),mediaBody=$('#mediaModalBody');
function openMedia(src,type){
  if(!src)return;
  mediaBody.innerHTML='';
  if(type==='video'){
    const v=document.createElement('video');
    v.src=src; v.controls=true; v.autoplay=true; v.playsInline=true; v.preload='auto';
    v.setAttribute('controls','');
    v.setAttribute('playsinline','');
    v.className='modal-media-video';
    mediaBody.appendChild(v);
    // Bosilgan tugma foydalanuvchi harakati bo‘lgani uchun video darhol ishga tushadi.
    requestAnimationFrame(()=>v.play().catch(()=>{}));
  } else {
    const img=new Image(); img.src=src; img.alt='Katta rasm'; img.className='modal-media-image'; mediaBody.appendChild(img);
  }
  mediaModal.classList.remove('is-hidden');
  mediaModal.setAttribute('aria-hidden','false');
}
function closeMedia(){
  mediaModal.classList.add('is-hidden');
  mediaModal.setAttribute('aria-hidden','true');
  mediaBody.innerHTML='';
}
$('#mediaClose').onclick=closeMedia;
mediaModal.addEventListener('click',e=>{if(e.target===mediaModal)closeMedia();});

// Klaviatura: ESC media oynasini yopadi, F1–F6 mos javob variantini tanlaydi.
document.addEventListener('keydown',e=>{
  if(!mediaModal.classList.contains('is-hidden')){
    if(e.key==='Escape'){e.preventDefault();closeMedia();}
    return;
  }
  if(!document.body.classList.contains('view-quiz')||!current)return;
  if(e.target?.closest?.('input,textarea,select'))return;
  const m=/^F([1-6])$/.exec(e.key);
  if(!m)return;
  const btn=document.querySelectorAll('#answers .answer')[Number(m[1])-1];
  if(!btn)return; // Bunday variant bo'lmasa (masalan F5), brauzer odatiy ishlaydi.
  e.preventDefault();
  btn.click();
});

// v32: keep theme state consistent in every view
(function(){
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
  const tb=document.getElementById('themeBtn');
  if(tb) tb.addEventListener('click',()=>{
    const next = document.body.classList.contains('light') ? 'dark' : 'light';
    applyTheme(next);
  });
  window.__setExamTheme = applyTheme;
})();

// Extra direct handlers for the two theme buttons in the quiz toolbar.
document.querySelectorAll('.control-group-theme [data-theme]').forEach(btn=>{
  btn.onclick=(e)=>{e.preventDefault();e.stopPropagation(); if(window.__setExamTheme) window.__setExamTheme(btn.dataset.theme);};
});

// Bundled JS question data is ready before this script runs; no parser/network warm-up is needed.
initBundledProject();
applyScale();
requestAnimationFrame(()=>{ renderTemplates(); updateHomeCounts(); });

/* === FINAL FEATURE PATCH: exam, mistakes, language === */
function questionText(q){return String(localizedPick(q,'savol','question','text')||'').trim()}
function getMistakes(){
  try{return JSON.parse(localStorage.getItem(MISTAKES_KEY)||'[]')}catch(e){return []}
}
function saveMistake(q){
  const text=questionText(q); if(!text)return;
  const arr=getMistakes(); if(!arr.some(x=>x===text)){arr.push(text);localStorage.setItem(MISTAKES_KEY,JSON.stringify(arr));}
  updateMistakeCount();
}
function clearMistakes(){
  if(!getMistakes().length){alert((localStorage.getItem('ui_lang')||'uz')==='ru'?'Ошибок для удаления нет.':'O‘chiriladigan xatolar yo‘q.');return}
  const lang=localStorage.getItem('ui_lang')||'uz';
  const msg=lang==='ru'?'Изученные ошибки будут удалены. Продолжить?':lang==='cy'?'Ўрганилган хатолар ўчирилади. Давом этасизми?':'O‘rganilgan xatolar o‘chiriladi. Davom etasizmi?';
  if(confirm(msg)){localStorage.removeItem(MISTAKES_KEY);updateMistakeCount();}
}
function updateMistakeCount(){
  const n=getMistakes().length;
  document.querySelectorAll('[data-mistake-count]').forEach(x=>x.textContent=n);
}
function updateExamErrors(){
  const box=$('#examErrors'); if(box) box.hidden=!examMode;
  const n=$('#examErrorCount'); if(n)n.textContent=examWrongCount;
}
function finishExam(reason=''){
  clearInterval(timerId);timerId=null;
  examMode=false;document.body.classList.remove('exam-active');
  updateExamErrors();
  if(reason && current) alert(reason);
  showResult();
}
// Imtihon yarim yo'lda tashlab ketilsa: taymer to'xtaydi, imtihon holati tozalanadi.
function abortExam(){
  if(!examMode)return;
  clearInterval(timerId);timerId=null;
  examMode=false;examWrongCount=0;
  document.body.classList.remove('exam-active');
  updateExamErrors();
}
function beginExam(pool){
  current={file:null,path:'IMTIHON',questions:pool};
  currentFileIndex=-1;qIndex=0;answered=Array(pool.length).fill(null);score=0;examWrongCount=0;examMode=true;lastRunWasExam=true;
  document.body.classList.add('exam-active');
  $('#empty').hidden=true;$('#quiz').hidden=false;
  if($('#quizTemplateLabel'))$('#quizTemplateLabel').textContent='IMTIHON';
  if($('#currentFile'))$('#currentFile').textContent='IMTIHON — 25:00';
  if($('#questionTotal'))$('#questionTotal').textContent=pool.length+' ta savol';
  resetTimer();updateExamErrors();updateMistakeCount();showView('quiz');showQuestion(0);startTimer();
}
async function startRandomExam(){
  if(typeof specialTestMode!=='undefined'){specialTestMode=false;document.body.classList.remove('special-test-active');}
  ensureBundledProject();
  if(!templateFiles.length && !(window.BUNDLED_TEMPLATES||[]).length){alert('Shablonlar hali yuklanmagan.');return}
  clearInterval(timerId);timerId=null;
  const oldStatus=$('#status'); if(oldStatus)oldStatus.textContent='Imtihon savollari tayyorlanmoqda...';
  const pool=[], seen=new Set();
  // Barcha savollar JS faylida oldindan tayyorlangan; ochishda internet yoki parser kerak emas.
  const bundledQuestions=(window.BUNDLED_TEMPLATES||[]).flatMap(t=>Array.isArray(t.questions)?t.questions:[]);
  bundledQuestions.forEach(q=>{const key=questionText(q);if(key&&!seen.has(key)){seen.add(key);pool.push(q)}});
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  examPool=pool.slice(0,Math.min(20,pool.length));
  if(!examPool.length){alert('Savollar topilmadi.');return}
  beginExam(examPool);
}
function patchExamAnswer(){
  if(window.__examAnswerPatched)return; window.__examAnswerPatched=true;
  const oldAnswer=answer;
  answer=function(i,correct,q){
    if(answered[qIndex]!==null)return;
    answered[qIndex]=i;
    if(i===correct)score++;
    else {saveMistake(q);if(examMode){examWrongCount++;updateExamErrors();if(examWrongCount>=3){renderAnswers(q);showQuestion(qIndex);finishExam('3 ta xato javob berildi');return}}}
    renderAnswers(q);$('#score').textContent=score;updateNav();renderNumbers();
    if(i!==correct){const media=$('#media');if(media){media.innerHTML='';addMedia(q,true)}}
    if(answered.every(x=>x!==null)) examMode?finishExam():showResult();
  };
}
patchExamAnswer();

const _showQuestion=showQuestion;
showQuestion=function(n){
  _showQuestion(n);
  if(examMode){const c=$('#counter');if(c)c.textContent=`${qIndex+1} / ${current.questions.length}`;updateExamErrors();}
  updateMistakeCount();
};

const _showView=showView;
showView=function(name){
  // Imtihon davomida test oynasidan chiqilsa, imtihon bekor qilinadi (taymer fonda ishlamaydi).
  if(examMode && name!=='quiz' && name!=='result') abortExam();
  _showView(name);updateMistakeCount();updateExamErrors();
};

document.addEventListener('click',e=>{
  const b=e.target.closest('#clearMistakesBtn');
  if(b){e.preventDefault();e.stopPropagation();clearMistakes();}
});
const _applyLanguage=applyLanguage;
applyLanguage=function(lang){
  _applyLanguage(lang);
  const ru=lang==='ru', cy=lang==='cy';
  const tx=ru?{
    question:'Вопрос',score:'Оценка',clearMistakes:'Очистить ошибки',
    prev:'← Назад',next:'Далее →',explain:'ⓘ Показать пояснение',
    questionLoaded:'вопрос загружен',all:'Все вопросы',done:'Отвечено',review:'На проверку',empty:'Без ответа'
  }:cy?{
    question:'Савол',score:'Бахо',clearMistakes:'Хатоларни тозалаш',
    prev:'← Олдинги',next:'Кейинги →',explain:'ⓘ Изоҳни кўрсатиш',
    questionLoaded:'савол юкланди',all:'Барча саволлар',done:'Жавоб берилган',review:'Кўриб чиқиш',empty:'Жавобсиз'
  }:{
    question:'Savol',score:'Baho',clearMistakes:'Xatolarni tozalash',
    prev:'← Oldingi',next:'Keyingi →',explain:'ⓘ Izohni ko‘rsatish',
    questionLoaded:'ta savol yuklandi',all:'Barcha savollar',done:'Javob berilgan',review:'Ko‘rib chiqish',empty:'Javobsiz'
  };
  document.querySelectorAll('[data-i18n="question"]').forEach(x=>x.textContent=tx.question);
  document.querySelectorAll('[data-i18n="score"]').forEach(x=>x.textContent=tx.score);
  document.querySelectorAll('[data-i18n="clearMistakes"]').forEach(x=>x.textContent=tx.clearMistakes);
  if($('#prev'))$('#prev').textContent=tx.prev;
  if($('#next'))$('#next').textContent=tx.next;
  const empty=$('#empty');if(empty&&!current){empty.querySelector('h2')?.replaceChildren(document.createTextNode(ru?'Шаблон не загружен':cy?'Шаблон юкланмади':'Shablon yuklanmadi'))}
  updateMistakeCount();drawTimer();
};
updateMistakeCount();drawTimer();


/* ================================================================
   YANGI TEST BO'LIMLARI — Umumiy testlar / Barcha savollar
   allquest.js ma'lumotlari bilan mustaqil ishlaydi; video ishlatilmaydi.
   ================================================================ */
let specialTestMode = false;
let specialTestType = '';
let specialTestCount = 0;
let specialTestSource = null, specialTestLabel = '';
const TEMPLATE_SHUFFLE_KEY = 'yangiyer_template_answer_shuffle_v1';

function templateShuffleEnabled(){
  return localStorage.getItem(TEMPLATE_SHUFFLE_KEY) !== 'false';
}
function syncTemplateShuffleSetting(){
  const control=$('#shuffleTemplateAnswers');
  if(control) control.checked=templateShuffleEnabled();
}
$('#shuffleTemplateAnswers')?.addEventListener('change',e=>{
  localStorage.setItem(TEMPLATE_SHUFFLE_KEY,e.target.checked?'true':'false');
});
$('#generalBackHome')?.addEventListener('click',()=>showView('home'));
$('#settingsBackHome')?.addEventListener('click',()=>showView('home'));
document.querySelectorAll('[data-general-count]').forEach(btn=>{
  btn.addEventListener('click',()=>startSpecialTest('general',Number(btn.dataset.generalCount)));
});
syncTemplateShuffleSetting();

function shuffleArray(items){
  const out=[...items];
  for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
function shuffleQuestionOptions(question){
  const opts=pick(question,'variantlar','answers','options')||[];
  const rawCorrect=Number(pick(question,'togri_javob','correct','correctAnswer'));
  const correct=(rawCorrect===opts.length && opts.length>0)?opts.length-1:rawCorrect;
  const indexed=opts.map((value,index)=>({value,index}));
  let shuffled=shuffleArray(indexed);
  // Ikki va undan ortiq variant bo'lsa, asl holicha qolib ketmasin.
  if(shuffled.length>1 && shuffled.every((x,i)=>x.index===i)) shuffled=[...shuffled.slice(1),shuffled[0]];
  return {...question,variantlar:shuffled.map(x=>x.value),togri_javob:shuffled.findIndex(x=>x.index===correct)};
}
function normalizeTemplateCorrectIndex(question){
  const opts=pick(question,'variantlar','answers','options')||[];
  const raw=Number(pick(question,'togri_javob','correct','correctAnswer'));
  if(opts.length && raw===opts.length)return {...question,togri_javob:opts.length-1};
  return question;
}
function shuffleTemplateQuestion(question){
  return templateShuffleEnabled()?shuffleQuestionOptions(question):question;
}
// Maxsus testlar uchun javob pozitsiyasi: har yangi testda avvalgi joyidan
// albatta ko'chadi. Shablonlarning sozlamasi bu mexanizmga ta'sir qilmaydi.
const SPECIAL_LAST_POSITIONS_KEY = 'yangiyer_special_answer_positions_v2';
let specialLastPositions = {};
try {
  const savedPositions = JSON.parse(localStorage.getItem(SPECIAL_LAST_POSITIONS_KEY) || '{}');
  if (savedPositions && typeof savedPositions === 'object' && !Array.isArray(savedPositions)) {
    specialLastPositions = savedPositions;
  }
} catch (e) { specialLastPositions = {}; }

function shuffleSpecialQuestionOptions(question){
  const opts=pick(question,'variantlar','answers','options')||[];
  if(!Array.isArray(opts) || opts.length<2) return {...question,variantlar:Array.isArray(opts)?opts.slice():[]};

  const rawCorrect=Number(pick(question,'togri_javob','correct','correctAnswer'));
  const correct=(rawCorrect===opts.length)?opts.length-1:rawCorrect;
  if(!Number.isInteger(correct) || correct<0 || correct>=opts.length) {
    // Noto'g'ri kalit bo'lsa ham variantlarni aralashtiramiz, ammo taxminiy
    // to'g'ri javob indeksini o'zgartirib yubormaymiz.
    return {...question,variantlar:shuffleArray(opts)};
  }

  const key=String(Number(question.raqam)||question.raqam||question.savol||'');
  const previous=Number(specialLastPositions[key]);
  const hasPrevious=Number.isInteger(previous) && previous>=0 && previous<opts.length;
  const indexed=shuffleArray(opts.map((value,index)=>({value,index})));
  const correctItem=indexed.find(item=>item.index===correct);
  const distractors=indexed.filter(item=>item.index!==correct);

  // Iloji bo'lsa, to'g'ri javob na manbadagi, na o'tgan testdagi joyida turadi.
  // 2 variantli savolda ikkala shart bir vaqtda bajarilmasa, o'tgan testdagi
  // pozitsiyani takrorlamaslik ustuvor bo'ladi.
  let allowed=Array.from({length:opts.length},(_,i)=>i)
    .filter(i=>i!==correct && (!hasPrevious || i!==previous));
  if(!allowed.length && hasPrevious) allowed=Array.from({length:opts.length},(_,i)=>i).filter(i=>i!==previous);
  if(!allowed.length) allowed=Array.from({length:opts.length},(_,i)=>i).filter(i=>i!==correct);
  if(!allowed.length) allowed=[correct];
  const target=allowed[Math.floor(Math.random()*allowed.length)];

  const shuffled=distractors.map(item=>item.value);
  shuffled.splice(target,0,correctItem.value);
  specialLastPositions[key]=target;
  try { localStorage.setItem(SPECIAL_LAST_POSITIONS_KEY,JSON.stringify(specialLastPositions)); }
  catch (e) { /* storage o'chirilgan bo'lsa, joriy sessiya ichidagi aralashtirish davom etadi */ }
  return {...question,variantlar:shuffled,togri_javob:target};
}
function questionKey(value){
  return String(value||'').toLowerCase().replace(/^\s*\d+[.)-]?\s*/,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
function getTemplateMediaLookup(){
  if(window.__TEMPLATE_MEDIA_LOOKUP)return window.__TEMPLATE_MEDIA_LOOKUP;
  const map=new Map();
  (window.BUNDLED_TEMPLATES||[]).forEach(template=>(template.questions||[]).forEach(item=>{
    const key=questionKey(item.savol||item.question);
    if(key&&!map.has(key))map.set(key,item);
  }));
  window.__TEMPLATE_MEDIA_LOOKUP=map;
  return map;
}
function toSpecialQuestion(source){
  const matched=getTemplateMediaLookup().get(questionKey(source.savol||source.question))||{};
  const q={
    raqam:Number(source.raqam)||0,
    savol:String(source.savol||''),
    variantlar:Array.isArray(source.javob)?source.javob.slice():Array.isArray(source.variantlar)?source.variantlar.slice():[],
    togri_javob:Number(source.togri_javob)||0,
    rasm:String(source.rasm||matched.rasm||''),
    wrong_video:source.wrong_video||source.xato_video||source.izoh_video||matched.wrong_video||matched.xato_video||matched.izoh_video||'',
    izoh_video:source.izoh_video||matched.izoh_video||'',
    izoh:source.izoh||matched.izoh||'',
    izoh_rasm:source.izoh_rasm||matched.izoh_rasm||''
  };
  return shuffleSpecialQuestionOptions(q);
}
function startSpecialTest(type,count,sourceOverride,topicTitle){
  const source=Array.isArray(sourceOverride)?sourceOverride:(Array.isArray(window.ALL_QUESTIONS)?window.ALL_QUESTIONS:[]);
  if(!source.length){alert('Savollar bazasi topilmadi.');return;}
  ensureBundledProject();
  specialTestMode=true;
  specialTestType=type;
  specialTestSource=Array.isArray(sourceOverride)?sourceOverride:null;
  specialTestLabel=topicTitle||'';
  lastRunWasExam=false;
  specialTestCount=(type==='all'||type==='topic')?source.length:Number(count)||20;
  examMode=false;
  examWrongCount=0;
  clearInterval(timerId);timerId=null;
  document.body.classList.remove('exam-active');
  document.body.classList.add('special-test-active');

  let selected;
  if(type==='all'){
    // Barcha savollar bazadagi tartib bo'yicha ketma-ket keladi.
    selected=[...source].sort((a,b)=>Number(a.raqam)-Number(b.raqam));
  }else{
    // Umumiy test uchun savollar qayta-qayta aralashtiriladi, takrorlanmaydi.
    selected=shuffleArray(source).slice(0,Math.min(specialTestCount,source.length));
  }
  const questions=selected.map(toSpecialQuestion);
  const modeTitle=type==='all'?'BARCHA SAVOLLAR':type==='topic'?`MAVZU — ${topicTitle||'TEST'}`:`UMUMIY TEST — ${questions.length} TA SAVOL`;
  current={file:null,path:modeTitle,questions};
  currentFileIndex=-1;qIndex=0;answered=Array(questions.length).fill(null);score=0;
  // Mavzu testi ishga tushganda ham Keyingi/Oldingi aynan shu savollar ro‘yxatiga ulanadi.
  const topicNext=$('#next'), topicPrev=$('#prev');
  if(topicNext){topicNext.type='button';topicNext.onclick=e=>{e.preventDefault();navigateQuizQuestion(1);};}
  if(topicPrev){topicPrev.type='button';topicPrev.onclick=e=>{e.preventDefault();navigateQuizQuestion(-1);};}
  $('#empty').hidden=true;$('#quiz').hidden=false;
  if($('#quizTemplateLabel')) $('#quizTemplateLabel').textContent=modeTitle;
  if($('#currentFile')) $('#currentFile').textContent=current.path;
  if($('#questionTotal')) $('#questionTotal').textContent=questions.length+' ta savol';
  if($('#quizTimer')) $('#quizTimer').textContent='—';
  if($('#topExamTimer')) $('#topExamTimer').hidden=true;
  updateNav();
  showView('quiz');
  showQuestion(0);
  updateNav();
}

// Video siyosati: imtihonda doim o‘chiq, mavzu testida faqat xato javobdan keyin.
const addMediaOriginal=addMedia;
function getVideoPolicy(){
  return { templates:true, topics:true, general:true, all:true, exam:false, ...(window.APP_VIDEO_POLICY||{}) };
}
function renderQuestionImageOnly(q){
  const media=$('#media');if(!media)return;media.innerHTML='';
  const ref=localizedPick(q,'rasm','image','photo','picture','savol_rasm','image_url','imageUrl','rasm_url','rasmUrl');
  const src=assetFor(ref);if(!src)return;
  const wrap=document.createElement('div');wrap.className='media-frame';
  const img=document.createElement('img');img.src=src;img.className='media-img img-'+imageSize;img.alt='Savol rasmi';
  img.title='Kattalashtirish uchun bosing';img.onclick=()=>openMedia(src,'image');img.onerror=()=>wrap.remove();
  wrap.appendChild(img);media.appendChild(wrap);
}
addMedia=function(q,wrong=false){
  const section=examMode?'exam':(specialTestMode?specialTestType:'templates');
  const policy=getVideoPolicy();
  const policyKey=section==='topic'?'topics':section;
  if(section==='exam'||policy[policyKey]===false){renderQuestionImageOnly(q);return;}
  if(specialTestMode){
    // Mavzu va umumiy mashqlarda video faqat noto‘g‘ri javobdan keyin chiqadi.
    if(wrong&&policy[policyKey]!==false)return addMediaOriginal(q,true);
    return renderQuestionImageOnly(q);
  }
  return addMediaOriginal(q,wrong);
};

// 1 310 ta savolda navigatsiya paneliga mingta tugma chiqarib yubormaslik uchun
// faqat joriy savol atrofidagi raqamlarni ko'rsatamiz.
const renderNumbersOriginal=renderNumbers;
renderNumbers=function(){
  if(!specialTestMode)return renderNumbersOriginal();
  const box=$('#numbers');if(!box||!current)return;
  box.innerHTML='';
  const total=current.questions.length;
  const radius=5;
  let start=Math.max(0,Math.min(qIndex-radius,total-11));
  let end=Math.min(total,start+11);
  if(start>0){addNumberButton(box,0);addNumberGap(box);}
  for(let i=start;i<end;i++)addNumberButton(box,i);
  if(end<total-1){addNumberGap(box);addNumberButton(box,total-1);}
  function addNumberButton(parent,index){
    const q=current.questions[index];const b=document.createElement('button');let cls='num';
    if(answered[index]!==null){const correct=Number(pick(q,'togri_javob','correct','correctAnswer'));cls+=answered[index]===correct?' correct':' wrong';}
    else if(index===qIndex)cls+=' active';
    b.className=cls;b.textContent=index+1;b.title=`${index+1}-savol`;b.onclick=()=>showQuestion(index);parent.appendChild(b);
  }
  function addNumberGap(parent){const gap=document.createElement('span');gap.className='number-gap';gap.textContent='…';parent.appendChild(gap);}
};

// Maxsus test natijalarida xato savol, tanlangan javob va to'g'ri javob to'liq ko'rsatiladi.
const showResultOriginal=showResult;
showResult=function(){
  if(!specialTestMode)return showResultOriginal();
  clearInterval(timerId);timerId=null;
  const total=current.questions.length;
  let correctCount=0,wrongItems=[],emptyItems=[];
  current.questions.forEach((q,i)=>{
    const correct=Number(pick(q,'togri_javob','correct','correctAnswer'));
    if(answered[i]===null)emptyItems.push({q,i});
    else if(answered[i]===correct)correctCount++;
    else wrongItems.push({q,i,selected:answered[i],correct});
  });
  const done=total-emptyItems.length;
  const pct=total?Math.round(correctCount/total*100):0;
  $('#resultPercent').textContent=pct+'%';
  $('#resultSummary').textContent=`${correctCount} / ${total} to‘g‘ri`;
  $('#resultCorrect').textContent=correctCount;
  $('#resultWrong').textContent=wrongItems.length;
  $('#resultEmpty').textContent=emptyItems.length;
  $('#resultTotal').textContent=total;
  const list=$('#resultList');list.innerHTML='';
  const heading=document.createElement('h2');heading.className='special-result-heading';
  heading.textContent=wrongItems.length?'Xato javob berilgan savollar':'Xato javob yo‘q — ajoyib natija!';
  list.appendChild(heading);
  if(wrongItems.length){
    wrongItems.forEach(({q,i,selected,correct})=>{
      const variants=pick(q,'variantlar','answers','options')||[];
      const chosen=variants[selected];const right=variants[correct];
      const card=document.createElement('article');card.className='wrong-review-card';
      const number=Number(q.raqam)||i+1;
      card.innerHTML=`<div class="wrong-review-top"><b>№ ${number}</b><span>XATO JAVOB</span></div><p class="wrong-review-question">${esc(questionText(q))}</p><div class="wrong-answer-line"><small>Sizning javobingiz</small><strong>${esc(localizedValue(chosen)??'—')}</strong></div><div class="correct-answer-line"><small>To‘g‘ri javob</small><strong>${esc(localizedValue(right)??'—')}</strong></div>`;
      list.appendChild(card);
    });
  }else{
    const success=document.createElement('p');success.className='special-result-success';success.textContent='Barcha berilgan javoblaringiz to‘g‘ri.';list.appendChild(success);
  }
  if(emptyItems.length){
    const emptyHeading=document.createElement('h3');emptyHeading.className='special-result-subheading';emptyHeading.textContent='Javobsiz qoldirilgan savollar';list.appendChild(emptyHeading);
    emptyItems.forEach(({q,i})=>{
      const row=document.createElement('div');row.className='unanswered-review-row';
      row.innerHTML=`<b>№ ${Number(q.raqam)||i+1}</b><span>${esc(questionText(q))}</span>`;list.appendChild(row);
    });
  }
  const back=$('#backTemplates');if(back)back.textContent='← Bosh sahifa';
  showView('result');
};

// Natijadan qaytish va qayta ishlash maxsus test turini saqlab qoladi.
const backTemplatesButton=$('#backTemplates');
if(backTemplatesButton)backTemplatesButton.onclick=()=>{
  if(specialTestMode){specialTestMode=false;document.body.classList.remove('special-test-active');showView('home');}
  else showView('templates');
};
const retrySpecialButton=$('#retryBtn');
if(retrySpecialButton)retrySpecialButton.onclick=()=>{
  if(specialTestMode){const type=specialTestType,count=specialTestCount,source=specialTestSource,label=specialTestLabel;startSpecialTest(type,count,source,label);}
  else if(lastRunWasExam && examPool.length){beginExam(examPool);} // Imtihon rejimida, taymer bilan qayta.
  else if(current){answered=Array(current.questions.length).fill(null);score=0;resetTimer();showView('quiz');showQuestion(0);startTimer();}
};

// Shablon bo'limiga qaytilganda sozlamadagi variant o'zgarishi keyingi ochishda qo'llanadi.
const homeButtonForSpecial=$('#homeBtn');
if(homeButtonForSpecial)homeButtonForSpecial.onclick=()=>{specialTestMode=false;document.body.classList.remove('special-test-active');showView('home');setTopActive('homeBtn');};


// GitHub va Google Drive yangilash tugmalari mustaqil ishlaydi.
(function initUpdateSettings(){
  const status=$('#updateStatus'), version=$('#currentAppVersion');
  const updater=window.APP_UPDATER;
  if(!updater)return;
  const paint=()=>{if(version)version.textContent=updater.getVersion()||window.APP_CONTENT_VERSION||'1.0.0';};
  paint();
  window.APP_UPDATE_READY?.then(paint);
  updater.setStatusCallback((message,type)=>{
    if(status){status.textContent=message;status.dataset.state=type||'info';}
    paint();
  });
  $('#checkGithubBtn')?.addEventListener('click',async()=>{
    const button=$('#checkGithubBtn');
    if(button)button.disabled=true;
    try{await updater.checkGithub();}
    finally{if(button)button.disabled=false;paint();}
  });
  $('#checkDriveBtn')?.addEventListener('click',async()=>{
    const button=$('#checkDriveBtn');
    if(button)button.disabled=true;
    const config=updater.getConfig?.()||{};
    // CORS to‘sig‘i bo‘lsa, faylni brauzerning o‘zida yuklash uchun oynani klik paytida ochib qo‘yamiz.
    const downloadTab=(config.driveConfigured && !config.driveProxyConfigured)?window.open('about:blank','_blank'):null;
    if(downloadTab){downloadTab.document.write('<p style="font:16px Segoe UI,Arial;padding:24px">Google Drive tekshirilmoqda…</p>');}
    try{
      const result=await updater.checkDrive();
      if(result?.requiresManual && result.downloadUrl){
        if(downloadTab)downloadTab.location.replace(result.downloadUrl);
        else if(status)status.textContent+=' Havolani yangi oynada ochish bloklandi; Drive ZIP’ni brauzerda yuklab oling.';
      }else if(downloadTab)downloadTab.close();
    }finally{if(button)button.disabled=false;paint();}
  });
  $('#installLocalZipBtn')?.addEventListener('click',async()=>{
    const file=$('#localUpdateZip')?.files?.[0],button=$('#installLocalZipBtn');
    if(!file){if(status)status.textContent='Avval eksport ZIP faylini tanlang.';return;}
    if(button)button.disabled=true;
    try{await updater.installZip(file);paint();}
    catch(error){if(status)status.textContent='ZIP yangilanmadi: '+(error.message||error);}
    finally{if(button)button.disabled=false;}
  });
})();

// Yangilanish test davomida kelib qolsa, testni buzmaydi; keyingi sahifaga o‘tganda qo‘llanadi.
function refreshAfterContentUpdate(payload){
  applyContentPatch(payload);
  if(payload && payload.media && window.APP_UPDATE_MEDIA){
    payload.media.forEach(item=>{const path=typeof item==='string'?item:item.path;if(path&&window.APP_UPDATE_MEDIA[path]){/* media path IDB'dan assetFor orqali olinadi */}});
  }
  if(window.__APP_MEDIA_URLS){for(const url of window.__APP_MEDIA_URLS.values())URL.revokeObjectURL(url);window.__APP_MEDIA_URLS.clear();}
  window.resetTopicsCache?.();
  initBundledProject();
  updateHomeCounts();
  renderTemplates();
  window.renderTopics?.();
}
window.applyAppContentUpdate=function(payload){
  if(document.body.classList.contains('view-quiz')){window.__PENDING_APP_CONTENT_UPDATE=payload;return false;}
  refreshAfterContentUpdate(payload);
  return true;
};
const previousShowViewForUpdates=showView;
showView=function(name){
  previousShowViewForUpdates(name);
  if(name!=='quiz'&&window.__PENDING_APP_CONTENT_UPDATE){
    const pending=window.__PENDING_APP_CONTENT_UPDATE;
    window.__PENDING_APP_CONTENT_UPDATE=null;
    refreshAfterContentUpdate(pending);
  }
};
if(window.APP_UPDATE_READY){
  window.APP_UPDATE_READY.then(payload=>{
    if(!payload)return;
    const current=String(window.APP_CONTENT_VERSION||'1.0.0').split('.').map(Number);
    const incoming=String(payload.version||'0.0.0').split('.').map(Number);
    let newer=false;
    for(let i=0;i<Math.max(current.length,incoming.length);i++){
      const diff=(incoming[i]||0)-(current[i]||0);
      if(diff){newer=diff>0;break;}
    }
    if(newer)window.applyAppContentUpdate?.(payload);
  }).catch(error=>console.warn('Saqlangan yangilanish yuklanmadi:',error));
}
