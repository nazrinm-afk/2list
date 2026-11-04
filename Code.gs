const statuses = ['PREPRO','FILMED','EDITED','TX','CANCELLED','POST'];
const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = v => JSON.parse(JSON.stringify(v));
function duration(value) {
  const s=String(value??'').trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s)*60;
  if (!/^\d+:\d{2}(:\d{2})?$/.test(s)) throw new Error('Duration must be mm:ss or hh:mm:ss. A number alone is treated as minutes.');
  const p=s.split(':').map(Number);
  if(p.at(-1)>59 || (p.length===3 && p[1]>59)) throw new Error('Invalid minutes/seconds in duration.');
  return p.reduce((a,v)=>a*60+v,0);
}
function tc(n) { return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':'); }
function preset(slot=30) { const s=Number(slot)||30; return {slot:s,target:s===60?50:25,breaks:s===60?'1,2,3,4':'1,2',capsules:s===60?5:3,episodes:13,intro:'00:20',promo:'01:00',credit:'00:30',station:'',host:'HOST',description:'',styleReference:'',styleFiles:[],nextTxDate:'',projectType:'tv_magazine'}; }
function newProject(name,slot=30) { return {schema:1,id:uid(),name,settings:preset(slot),records:[],scripts:{}}; }
function newRecord(ep=null,cap='') { return {id:uid(),episode:(ep===null||ep===undefined||ep===''||Number.isNaN(Number(ep))||Number(ep)<=0)?null:Math.floor(Number(ep)),capsule:String(cap),type:'Interview',topic:'',description:'',guest:'',title:'',location:'',date:'',status:'PREPRO',duration:'',questions:'',vo:'',remarks:'',profile:''}; }
function keys(p) {return Array.from({length:Number(p?.settings?.capsules)||3},(_,i)=>String(i+1));}
// Missing optional episode values from older drafts / the Sheets bridge mean
// unassigned. Do not coerce strings, zero, or out-of-range assignments.
function normalizeOptionalEpisode(project) {
  if(Array.isArray(project?.records)){
    for(const r of project.records){
      if(!r)continue;
      if(r.episode===''||r.episode===undefined||r.episode===null||Number.isNaN(Number(r.episode))||Number(r.episode)<=0){
        r.episode=null;
      }else{
        r.episode=Math.floor(Number(r.episode));
      }
    }
  }
  return project;
}
function breaksForSlot(slot){return Math.max(1,Math.round((Number(slot)||30)/15));}
function validate(p) {
  normalizeOptionalEpisode(p);
  if(p.schema!==1 || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.id||'') || !String(p.name||'').trim() || !p.settings || !Array.isArray(p.records) || !p.scripts || typeof p.scripts!=='object' || Array.isArray(p.scripts)) throw new Error('Invalid project file.');
  const s=p.settings;
  if(!s.credit) s.credit='00:30';
  const slotMin=Number(s.slot), targetMin=Number(s.target);
  if(!Number.isFinite(slotMin) || slotMin<5 || slotMin>600 || !Number.isInteger(s.capsules) || s.capsules<1 || s.capsules>12 || !Number.isInteger(s.episodes) || s.episodes<1 || s.episodes>99 || !Number.isFinite(targetMin) || targetMin<1) throw new Error('Invalid program settings.');
  if(targetMin>=slotMin) throw new Error('Target content (minutes) must be lower than Broadcast slot (minutes).');
  duration(s.intro); duration(s.promo); duration(s.credit);
  s.breaks=Array.from({length:breaksForSlot(slotMin)},(_,i)=>i+1).join(',');
  const ids=new Set(); const slots=new Set();
  for(const r of p.records) {
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(r.id||'') || ids.has(r.id)) throw new Error('Record ID is empty or duplicated.'); ids.add(r.id);
    const recordLabel=`Record "${String(r.topic||'Untitled').slice(0,80)}"`;
    if(r.episode!==null&&(!Number.isInteger(r.episode)||r.episode<1||r.episode>s.episodes))throw new Error(`${recordLabel}: Episode is ${JSON.stringify(r.episode)} (${typeof r.episode}). Leave it unassigned or use a whole number from 1 to ${s.episodes}.`);
    const validCaps=new Set([...keys(p),'Op','Pr','Clo',...Array.from({length:12},(_,i)=>`T${i+1}`)]);if(r.capsule!==''&&!validCaps.has(r.capsule))throw new Error(`${recordLabel}: Capsule is ${JSON.stringify(r.capsule)}. Choose Unassigned or a capsule from 1 to ${s.capsules}.`);
    if(!statuses.includes(r.status))throw new Error(`${recordLabel}: Status is ${JSON.stringify(r.status)}. Choose PREPRO, FILMED, EDITED, TX, CANCELLED or POST.`);
    for(const f of ['capsule','type','topic','description','guest','title','location','date','status','duration','questions','vo','remarks'])if(r[f]!==undefined&&typeof r[f]!=='string')throw new Error('Record fields must be text.');
    duration(r.duration);
    const k=`${r.episode}:${r.capsule}`;
    if(r.episode!==null&&r.capsule!==''&&r.status!=='CANCELLED') slots.add(k);
  }
  for(const [ep,script] of Object.entries(p.scripts)) {
    if(!/^\d+$/.test(ep)||+ep<1||+ep>s.episodes||script.episode!==+ep||!Array.isArray(script.sections)) throw new Error('Invalid saved script.');
    const seen=new Set();
    for(const section of script.sections) {
      if(!section.id||seen.has(section.id)||!Number.isInteger(section.seconds)||section.seconds<0||typeof section.video!=='string'||typeof section.audio!=='string') throw new Error('Invalid script section.');
      seen.add(section.id);
    }
  }
  return p;
}
function timeline(sections) { let t=0;return sections.map(s=>({...s,start:t,end:(t+=s.seconds)})); }
function formatGuestsText(r){
  if(!r?.guest)return '';
  const names=String(r.guest).split('\n'),titles=String(r.title||'').split('\n');
  return names.map((n,i)=>{const name=n.trim(),title=(titles[i]||'').trim();return name?`GUEST: ${name}${title?' — '+title:''}`:'';}).filter(Boolean).join('\n');
}
function generate(p,ep) {
  validate(p); ep=Number(ep);
  if(!Number.isInteger(ep)||ep<1||ep>p.settings.episodes) throw new Error('Episode is outside the program range.');
  const records=p.records.filter(r=>r.episode===ep&&r.status!=='CANCELLED');
  const sections=[{id:'intro',label:'INTRO MONTAGE',seconds:duration(p.settings.intro),video:'Program opening montage.',audio:'MUSIC / JINGLE',source:'intro'}];
  const warnings=[]; const totalBreaks=breaksForSlot(p.settings.slot); let breakIdx=0;
  for(const key of keys(p)) {
    const matchingRecords=records.filter(r=>r.capsule===key); const isCap=/^\d+$/.test(key);
    const label=isCap?`CAPSULE ${key}`:key==='Op'?'OPENING':key==='Pr'?'PROMO':key==='Clo'?'CLOSING':`THROW ${key.slice(1)}`;
    if(!matchingRecords.length){
      warnings.push(`${label}: input not entered.`);
      sections.push({id:`missing:${key}`,source:key,label,seconds:key==='Pr'?duration(p.settings.promo):0,video:'[INPUT NOT ENTERED]',audio:'[TEXT NOT ENTERED]'});
    }else{
      matchingRecords.forEach((r,idx)=>{
        const subSuffix=matchingRecords.length>1?` (Part ${idx+1})`:'';
        if(!r.duration && key!=='Pr') warnings.push(`${label}${subSuffix}: duration not entered.`);
        sections.push({id:`record:${r.id}`,source:r.id,label:label+subSuffix+(r.topic?` · ${r.topic}`:''),seconds:key==='Pr'?duration(p.settings.promo):duration(r.duration),video:[r.description,formatGuestsText(r),isCap&&r.questions?`QUESTIONS:\n${r.questions}`:''].filter(Boolean).join('\n\n'),audio:r.vo?`${p.settings.host}${isCap?' (V.O)':''}:\n${r.vo}`:'[TEXT NOT ENTERED]'});
      });
    }
    if(isCap){
      const capNum=Number(key);
      const count=p.settings.capsules>totalBreaks?(capNum<=totalBreaks?1:0):(Math.floor(capNum*totalBreaks/p.settings.capsules)-Math.floor((capNum-1)*totalBreaks/p.settings.capsules));
      for(let b=0;b<count;b++){breakIdx++;sections.push({id:count===1?`break:${key}`:`break:${key}:${b+1}`,source:`break:${breakIdx}`,label:`COMMERCIAL BREAK ${breakIdx}`,seconds:0,video:'COMMERCIAL BREAK',audio:'Advertising duration is excluded from the content timecode.',isBreak:true});}
    }
  }
  sections.push({id:'credit',label:'ENDING CREDIT',seconds:duration(p.settings.credit||'00:30'),video:'Program ending credits.',audio:'MUSIC / ENDING THEME',source:'credit'});
  return {episode:ep,sections,warnings,generatedAt:new Date().toISOString()};
}
function refresh(old,fresh) {
  if(!old) return fresh;
  const oldById=new Map(old.sections.map(s=>[s.id,s]));
  const sections=fresh.sections.map(s=>oldById.get(s.id)?.edited?{...clone(oldById.get(s.id)),sourceChanged:JSON.stringify(oldById.get(s.id).generated)!==JSON.stringify(s),suggested:clone(s)}:s);
  for(const s of old.sections) if(s.edited&&!fresh.sections.some(n=>n.id===s.id)) sections.push({...clone(s),orphan:true});
  return {...fresh,sections};
}
function demoProjects() {
  const p=newProject('Jejak Kita',30);p.settings.host='AISYA';
  const data=[['1','Anyaman yang bercerita','Di bengkel kecil, tangan mahir menganyam warisan.','Nora','Pengusaha kraf','KCH','EDITED','06:30'],['2','Dari kebun ke meja','Ikuti perjalanan hasil kebun tempatan.','Hakim','Pekebun','MUKAH','FILMED','07:10'],['3','Irama generasi baharu','Anak muda menemukan suara melalui alat muzik tradisi.','Sara','Pemuzik','KCH','PREPRO','06:00']];
  p.records=data.map((a,i)=>({...newRecord(1,a[0]),topic:a[1],description:a[2],guest:a[3],title:a[4],location:a[5],status:a[6],duration:a[7],date:`2026-10-${String(12+i*3).padStart(2,'0')}`,questions:'Bagaimana perjalanan ini bermula?\nApakah harapan anda untuk generasi seterusnya?',vo:'Setiap usaha bermula dengan satu langkah kecil. Hari ini, kita mendekati cerita di sebaliknya.'}));
  for(const [cap,topic,dur,vo] of [['Op','Selamat datang','00:40','Salam sejahtera. Bersama saya, Aisya, dalam Jejak Kita.'],['Pr','Dalam episod ini','01:00','Warisan, cita rasa dan irama. Semuanya dalam Jejak Kita.'],['T1','Tangan dan warisan','00:30','Kita mulakan perjalanan dengan seni yang diwarisi turun-temurun.'],['T2','Hasil bumi','00:30','Seterusnya, kita menelusuri kisah di sebalik hasil kebun.'],['T3','Suara anak muda','00:30','Kini, kita dengarkan irama generasi baharu.'],['Clo','Jumpa lagi','00:40','Terima kasih kerana bersama kami. Jumpa lagi dalam Jejak Kita.']]) p.records.push({...newRecord(1,cap),topic,duration:dur,description:'HOST on camera. Medium shot.',vo,status:'PREPRO'});
  p.scripts['1']=generate(p,1);
  const q=newProject('Ruang Rasa',30);q.settings.host='DANIAL';q.records=[{...newRecord(1,'1'),topic:'Cerita secawan kopi',date:'2026-10-12',location:'KCH',description:'Contoh projek berasingan dengan episode dan kapsul yang sama.'}];
  return [p,q];
}

// Shared browser/server contract. All secrets stay on the server.
function buildDraftRequest(project, options, model) {
  const key=String(options.target||'');const questions=key==='questions';
  if(!questions&&!/^(Op|Pr|Clo|T\d+)$/.test(key))throw new Error('Choose opening, promo, closing, throw or questions.');
  const ep=Number(options.episode);
  if(!questions&&(!Number.isInteger(ep)||ep<1||ep>project.settings.episodes))throw new Error('Invalid AI episode.');
  const candidates=project.records.filter(r=>r.episode===ep&&/^\d+$/.test(r.capsule)&&r.status!=='CANCELLED');
  const selected=questions?project.records.filter(r=>r.id===options.recordId):key.startsWith('T')?candidates.filter(r=>r.capsule===key.slice(1)):candidates;
  if(!selected.length||selected.some(r=>!r.topic?.trim()||!r.description?.trim()))throw new Error('Enter the reference capsule topic and description first. For host text, assign the episode and capsule too.');
  const facts=selected.map(r=>({topic:r.topic,description:r.description,guest:options.guestName||r.guest,title:options.guestTitle||r.title,filmingLocation:r.location,publicProfile:r.profile||'',questions:r.questions,voiceOver:r.vo}));
  const combinedNotes=[options.notes||'',project.settings.styleReference?`PAST SCRIPT STYLE REFERENCE:\n${project.settings.styleReference}`:''].filter(Boolean).join('\n\n').slice(0,6000);
  const context={program:project.name,host:project.settings.host,episode:questions?null:ep,target:key,tone:String(options.tone||'Warm, natural and professional').slice(0,1000),writerNotes:combinedNotes,targetSeconds:Number(options.seconds)||30,capsules:facts};
  const input=JSON.stringify(context);if(input.length>24000)throw new Error('Facts are too long. Shorten the description/VO before requesting AI.');
  const task=questions?`Write around 10 open-ended, insightful and relevant interview questions for ${options.guestName||'the guest'}${options.guestTitle?` (${options.guestTitle})`:''} about ${selected[0]?.topic||'the topic'}, one numbered question per line, in the same language used in the input fields (e.g. Bahasa Melayu if the topic/description is in Malay). Do not invent answers or unverified claims.`:'Write ONE smooth broadcast host text in the same language used in the input fields (e.g. Bahasa Melayu if the capsule facts are in Malay). For throws, introduce the selected capsule only. For opening/promo/closing, use the given lineup. Target targetSeconds without claiming exact timing. Do not add host labels, titles, camera directions or markdown.';
  return {model,store:false,max_output_tokens:2400,tools:[{type:'web_search'}],tool_choice:'required',max_tool_calls:3,include:['web_search_call.action.sources'],instructions:`You are a professional TV magazine scriptwriter. Always write in the language used in the user's input fields (Bahasa Melayu or English). ${task} Follow any PAST SCRIPT STYLE REFERENCE provided in writerNotes. Verify public identity carefully; do not invent facts, quotes, biographies or achievements. If there are notes for review, place them after ---NOTA SEMAKAN---.`,input};
}
function extractDraft(response) {
  if(response.status&&response.status!=='completed')throw new Error('AI did not produce complete text. Try again with shorter input.');
  const text=(response.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n').trim();
  if(!text)throw new Error('AI returned no text. Try again or write manually.');
  return text;
}
function extractWriting(response){
  extractDraft(response);const contents=(response.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text');const raw=contents.map(c=>c.text).join('\n');const citations=[];const consulted=[];
  let offset=0;for(const c of contents){for(const a of c.annotations||[]){if(a.type==='url_citation'&&/^https?:\/\//i.test(a.url||''))citations.push({url:a.url,title:a.title||a.url,start:offset+a.start_index,end:offset+a.end_index,excerpt:c.text.slice(Math.max(0,a.start_index-280),a.start_index).trim()});}offset+=c.text.length+1;}
  for(const call of response.output||[])if(call.type==='web_search_call')for(const s of call.action?.sources||[])if(/^https?:\/\//i.test(s.url||''))consulted.push({url:s.url,title:s.title||s.url});
  let clean=raw;for(const c of [...citations].sort((a,b)=>b.start-a.start))if(Number.isInteger(c.start)&&Number.isInteger(c.end))clean=clean.slice(0,c.start)+clean.slice(c.end);
  clean=clean.replace(/cite[^]*/g,'').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1');
  const [text,...notes]=clean.split('---NOTA SEMAKAN---');if(!text.trim())throw new Error('AI returned no usable broadcast text.');
  return {text:text.trim(),provenance:{generatedAt:new Date().toISOString(),raw,citations,consulted,notes:notes.join('\n').trim(),searched:(response.output||[]).some(x=>x.type==='web_search_call')}};
}
function applyAI(section,result,host){
  const history=[...(section.history||[]),{audio:section.audio,seconds:section.seconds,estimatedDuration:section.estimatedDuration||false,provenance:section.provenance||null,aiOptions:section.aiOptions||null}].slice(-5);
  return {...section,generated:section.generated||{...section,history:undefined},audio:`${host}:\n${result.text}`,edited:true,history,provenance:result.provenance||null};
}
function undoAI(section){if(!section.history?.length)return section;const history=[...section.history];const previous=history.pop();return {...section,...previous,history,edited:true};}

// Fixed text-only model. No search tools, retries, or alternative providers.
const GEMINI_FREE_MODEL='gemini-3.5-flash-lite';
function buildGeminiRequest(project,options){
 const context=buildDraftRequest(project,options,'validate-only').input;
 const task=options.target==='questions'?'Write around 10 open-ended interview questions, one numbered question per line, in the same language used in the input fields (e.g. Bahasa Melayu if the topic/description is in Malay). Do not invent answers or unverified claims.':'Write ONE smooth broadcast host text in the same language used in the input fields (e.g. Bahasa Melayu if the capsule facts are in Malay). For throws use the selected capsule only; opening/promo/closing use the given lineup. Target targetSeconds. Do not add host labels, markdown or camera directions.';
 return {systemInstruction:{parts:[{text:`You are a professional TV magazine scriptwriter. Always write in the language used in the user's input fields (Bahasa Melayu or English). ${task} Use ONLY the facts in JSON and follow any PAST SCRIPT STYLE REFERENCE in writerNotes. Do not invent external facts, biographies, quotes or achievements. Place any verification notes after ---NOTA SEMAKAN---, separate from broadcast text.`}]},contents:[{role:'user',parts:[{text:context}]}],generationConfig:{maxOutputTokens:4096}};
}
function extractGeminiWriting(response){
 const candidate=response.candidates?.[0];
 if(response.promptFeedback?.blockReason||!candidate||candidate.finishReason!=='STOP')throw new Error('AI did not produce complete text. Existing text is unchanged. Try shorter input or write manually.');
 const raw=(candidate.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('\n').trim();
 const [text,...notes]=raw.split('---NOTA SEMAKAN---');
 if(!text.trim())throw new Error('AI returned no usable broadcast text. Existing text is unchanged.');
 return {text:text.trim(),model:GEMINI_FREE_MODEL,provenance:{provider:'gemini',mode:'supplied-facts',generatedAt:new Date().toISOString(),raw,citations:[],consulted:[],searched:false,notes:['Written from supplied facts only. No web research or profile verification.',...notes].join('\n').trim()}};
}

/** 2List — personal deployment only. No production workbook IDs. */
function owner_() {
  const expected=PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
  if(!expected) return;
  const actual=Session.getActiveUser().getEmail();
  if(actual && expected && actual.toLowerCase()!==expected.toLowerCase()) throw new Error('Personal access only.');
}
function doGet(e){
  if (e && e.parameter && e.parameter.action) {
    return handleApiRequest_(e.parameter);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('2list')
    .addMetaTag('viewport','width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e){
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    return handleApiRequest_(payload);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleApiRequest_(params){
  const action = params.action;
  let result = null;
  if (action === 'save' || action === 'saveProject') {
    const p = params.project;
    result = syncContentSheet_(p);
    try { syncContiSheetSpreadsheet_(p); } catch(e) {}
    try { saveProject(p, params.token); } catch(e) {}
  } else if (action === 'syncConti') {
    const p = params.project;
    result = syncContiSheetSpreadsheet_(p);
  } else if (action === 'load' || action === 'loadProject') {
    result = loadProject(params.id);
  } else if (action === 'list' || action === 'listProjects') {
    result = listProjects();
  } else if (action === 'ping') {
    result = { pong: true, time: new Date().toISOString() };
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok', result: result }))
    .setMimeType(ContentService.MimeType.JSON);
}

function syncContentSheet_(project){
  if (!project) return { error: 'No project provided' };
  const targetId = '182wThTNzgTGfqDin5n3GoAbGjmIEYbk3vpD43pFfli8';
  let book = null;
  try {
    book = SpreadsheetApp.openById(targetId);
  } catch(e) {
    const files = DriveApp.getFilesByName('2List — ' + project.name);
    if (files.hasNext()) book = SpreadsheetApp.open(files.next());
  }
  if (!book) return { error: 'Spreadsheet not found' };
  
  // 1. CONTENT SUB-SHEET (Master Production Log)
  let sheetContent = book.getSheetByName('Content');
  if (!sheetContent) sheetContent = book.insertSheet('Content');
  
  const contentHeaders = ['#', 'EP', 'CAP', 'TYPE', 'TOPIC', 'DESCRIPTION', 'GUEST', 'TITLE', 'LOCATION', 'DATE', 'STATUS', 'DURATION', 'REMARKS'];
  const allEntries = [];
  
  (project.records || []).forEach(r => {
    const numStr = String(r.id || '').replace(/^[^\d]*/, '');
    const num = parseInt(numStr, 10) || 0;
    allEntries.push({
      num: num,
      row: [
        num ? String(num) : '',
        r.episode ? String(r.episode) : '',
        r.capsule || '',
        r.type || 'Interview',
        r.topic || '',
        r.description || '',
        r.guest || '',
        r.title || '',
        r.location || '',
        r.date || '',
        r.status || '',
        r.duration || '',
        r.remarks || ''
      ]
    });
  });
  
  (project.throws || []).forEach(t => {
    const numStr = String(t.id || '').replace(/^[^\d]*/, '');
    const num = parseInt(numStr, 10) || 0;
    allEntries.push({
      num: num,
      row: [
        num ? String(num) : '',
        t.episode ? String(t.episode) : '',
        'Throw',
        'Host Throw',
        t.topic || '',
        t.description || '',
        '',
        '',
        t.location || '',
        t.date || '',
        t.status || '',
        '',
        t.remarks || ''
      ]
    });
  });
  
  allEntries.sort((a, b) => a.num - b.num);
  const contentRows = [contentHeaders];
  allEntries.forEach(item => contentRows.push(item.row));
  
  sheetContent.clearContents();
  sheetContent.getRange(1, 1, contentRows.length, contentHeaders.length).setValues(contentRows);
  sheetContent.getRange(1, 1, 1, contentHeaders.length).setBackground('#204d43').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  sheetContent.setFrozenRows(1);
  if (contentRows.length > 1) {
    sheetContent.getRange(2, 1, contentRows.length - 1, contentHeaders.length).setVerticalAlignment('top');
  }

  // 2. QUESTIONS SUB-SHEET
  let sheetQuestions = book.getSheetByName('Questions');
  if (!sheetQuestions) sheetQuestions = book.insertSheet('Questions');
  
  const questionsHeaders = ['#', 'EP', 'CAP', 'TOPIC', 'GUEST', 'TITLE', 'QUESTIONS', 'VOICE-OVER', 'STATUS'];
  const questionEntries = [];
  (project.records || []).forEach(r => {
    const numStr = String(r.id || '').replace(/^[^\d]*/, '');
    const num = parseInt(numStr, 10) || 0;
    questionEntries.push({
      num: num,
      row: [
        num ? String(num) : '',
        r.episode ? String(r.episode) : '',
        r.capsule || '',
        r.topic || '',
        r.guest || '',
        r.title || '',
        r.questions || '',
        r.vo || '',
        r.status || ''
      ]
    });
  });
  questionEntries.sort((a, b) => a.num - b.num);
  const questionsRows = [questionsHeaders];
  questionEntries.forEach(item => questionsRows.push(item.row));
  
  sheetQuestions.clearContents();
  sheetQuestions.getRange(1, 1, questionsRows.length, questionsHeaders.length).setValues(questionsRows);
  sheetQuestions.getRange(1, 1, 1, questionsHeaders.length).setBackground('#204d43').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  sheetQuestions.setFrozenRows(1);
  if (questionsRows.length > 1) {
    sheetQuestions.getRange(2, 1, questionsRows.length - 1, questionsHeaders.length).setVerticalAlignment('top');
  }

  // 3. THROWS SUB-SHEET
  let sheetThrows = book.getSheetByName('Throws');
  if (!sheetThrows) sheetThrows = book.insertSheet('Throws');
  
  const throwsHeaders = ['#', 'EP', 'THROW', 'TOPIC / SEGMENT', 'LOCATION', 'SPONSORED', 'STATUS', 'REMARKS'];
  const throwEntries = [];
  (project.throws || []).forEach(t => {
    const numStr = String(t.id || '').replace(/^[^\d]*/, '');
    const num = parseInt(numStr, 10) || 0;
    throwEntries.push({
      num: num,
      row: [
        num ? String(num) : '',
        t.episode ? String(t.episode) : '',
        t.topic || '',
        t.description || '',
        t.location || '',
        t.sponsored ? 'YES' : 'NO',
        t.status || '',
        t.remarks || ''
      ]
    });
  });
  throwEntries.sort((a, b) => a.num - b.num);
  const throwsRows = [throwsHeaders];
  throwEntries.forEach(item => throwsRows.push(item.row));
  
  sheetThrows.clearContents();
  sheetThrows.getRange(1, 1, throwsRows.length, throwsHeaders.length).setValues(throwsRows);
  sheetThrows.getRange(1, 1, 1, throwsHeaders.length).setBackground('#204d43').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  sheetThrows.setFrozenRows(1);
  if (throwsRows.length > 1) {
    sheetThrows.getRange(2, 1, throwsRows.length - 1, throwsHeaders.length).setVerticalAlignment('top');
  }

  return { updated: contentRows.length, spreadsheetId: book.getId(), sheets: ['Content', 'Questions', 'Throws'] };
}

function syncContiSheetSpreadsheet_(project){
  if (!project) return { error: 'No project provided' };
  const targetId = '1KXSrY5rYnuOlrYqG4UpOWXXJKyhu2FD34DDeXCwKUPA';
  let book = null;
  try {
    book = SpreadsheetApp.openById(targetId);
  } catch(e) {
    const files = DriveApp.getFilesByName('Conti Sheet');
    if (files.hasNext()) book = SpreadsheetApp.open(files.next());
  }
  if (!book) return { error: 'Conti Sheet spreadsheet not found' };
  
  const contiSheets = project.settings?.contiSheets || [];
  if (!contiSheets.length && project.settings?.contiRows?.length) {
    const cType = project.settings.contiType || 'Capsule';
    const epNum = project.settings.episode || 1;
    const dateStr = project.settings.contiShootDate || '';
    contiSheets.push({
      tabName: 'Ep ' + String(epNum).padStart(2, '0') + ' · ' + cType + (dateStr ? ' · ' + dateStr : ''),
      episode: epNum,
      contiType: cType,
      date: dateStr,
      rows: project.settings.contiRows
    });
  }
  
  const updatedTabs = [];
  contiSheets.forEach((s) => {
    const epStr = 'Ep ' + String(s.episode || 1).padStart(2, '0');
    const typeLabel = s.contiType === 'Host Throw' ? 'Host Throw' : 'Capsule';
    const dateLabel = s.date ? ' · ' + s.date : '';
    let tabTitle = (s.tabName && (s.tabName.includes('Capsule') || s.tabName.includes('Host Throw')))
      ? s.tabName.replace(/^CONTI · /, '')
      : `${epStr} · ${typeLabel}${dateLabel}`;
    
    tabTitle = tabTitle.replace(/[\\/?*[\]:]/g, '-').slice(0, 95);
    
    let sheet = book.getSheetByName(tabTitle);
    if (!sheet) {
      sheet = book.insertSheet(tabTitle);
    }
    
    const cams = Math.min(3, Math.max(1, Number(s.cameras) || 2));
    const showAudio = s.audio !== 'direct';
    
    const headers = ['SCENE', 'SHOT', 'TAKE', 'DESCRIPTION'];
    for (let c = 1; c <= cams; c++) headers.push('CAM ' + c);
    if (showAudio) headers.push('AUDIO');
    headers.push('REMARKS');
    
    const rows = [headers];
    const realRows = (s.rows || []).filter(r => !r.draft && String(r.description || '').trim());
    
    realRows.forEach(r => {
      const rowData = [
        String(r.scene || ''),
        String(r.shot || ''),
        String(r.take || ''),
        String(r.description || '')
      ];
      for (let c = 1; c <= cams; c++) {
        const isOff = r['cam' + c + '_off'];
        rowData.push(isOff ? '—' : String(r['cam' + c] || ''));
      }
      if (showAudio) {
        const isOff = r.audio_off;
        rowData.push(isOff ? '—' : String(r.audio || ''));
      }
      rowData.push(String(r.remarks || ''));
      rows.push(rowData);
    });
    
    sheet.clearContents();
    const range = sheet.getRange(1, 1, rows.length, headers.length);
    range.setValues(rows);
    
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#204d43').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    
    updatedTabs.push(tabTitle);
  });
  
  return { updatedTabs: updatedTabs, spreadsheetId: book.getId() };
}
function registry_(){return JSON.parse(PropertiesService.getScriptProperties().getProperty('PROJECTS')||'{}');}
function putRegistry_(registry){PropertiesService.getScriptProperties().setProperty('PROJECTS',JSON.stringify(registry));}
function listProjects(){owner_();return withLock_(()=>{
  const r=registry_();const projects=[];
  for(const id of Object.keys(r)){
    if(r[id].creating){const book=projectBook_(id);if(!state_(book).current)continue;}
    projects.push({id:id,name:r[id].name});
  }
  return projects;
});}
function deleteProject(id){owner_();return withLock_(()=>{const r=registry_();if(r[id]){delete r[id];putRegistry_(r);}return {deleted:id};});}
function hash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
const FIELDS_=['id','episode','capsule','topic','description','guest','title','location','date','status','duration','questions','vo','remarks','profile','research','questionHistory','voHistory','type'];
const BACKUPS_=3;
function state_(book){return JSON.parse(PropertiesService.getScriptProperties().getProperty('STORAGE_'+book.getId())||'null');}
function putState_(book,state){PropertiesService.getScriptProperties().setProperty('STORAGE_'+book.getId(),JSON.stringify(state));}
function sheet_(book,id){const sheet=book.getSheetById(id);if(!sheet)throw new Error('A 2List data tab is missing. Restore it from a backup before saving.');return sheet;}
function versions_(book){return book.getSheets().filter(s=>/^V\d{6}$/.test(s.getName())&&s.getRange('B1').getDisplayValue()==='COMMITTED').sort((a,b)=>a.getName().localeCompare(b.getName()));}
function withLock_(run){const lock=LockService.getScriptLock();lock.waitLock(30000);try{return run();}finally{lock.releaseLock();}}
function readVersion_(sheet){
  const values=sheet.getDataRange().getDisplayValues();
  if(values[0]?.[1]!=='COMMITTED')throw new Error('A snapshot is incomplete or its metadata was changed. Keep the tabs and recover from a complete backup.');
  const meta=JSON.parse(values[2][1]); const rows=values.slice(5).filter(r=>r[0]);
  const project={schema:1,id:meta.id,name:meta.name,settings:meta.settings,records:[],scripts:{}};
  rows.sort((a,b)=>(a[0]==='SECTION'?1:0)-(b[0]==='SECTION'?1:0));
  rows.forEach(r=>{
    if(r[0]==='RECORD') {const record={};FIELDS_.forEach((f,i)=>record[f]=r[i+1]||'');record.research=record.research?JSON.parse(record.research):null;record.questionHistory=record.questionHistory?JSON.parse(record.questionHistory):[];record.voHistory=record.voHistory?JSON.parse(record.voHistory):[];record.episode=record.episode?Number(record.episode):null;project.records.push(record);}
    else if(r[0]==='SCRIPT') {const script=JSON.parse(r[3]); project.scripts[r[1]]=script;}
    else if(r[0]==='SECTION') {if(!project.scripts[r[1]])throw new Error('SCRIPT metadata is missing.');project.scripts[r[1]].sections.push({order:Number(r[4]),value:JSON.parse(r[3])});}
  });
  Object.keys(project.scripts).forEach(ep=>{const script=project.scripts[ep];if(script.sections.length&&script.sections[0].value)script.sections=script.sections.sort((a,b)=>a.order-b.order).map(s=>s.value);});
  project.records.sort((a,b)=>a.id.localeCompare(b.id));
  const ordered={};Object.keys(project.scripts).sort().forEach(k=>ordered[k]=project.scripts[k]);project.scripts=ordered;
  return {project:project,parent:values[1][1]||'',digest:hash_(project),name:sheet.getName()};
}
// Retain the old token calculation until an explicitly requested save migrates it.
function loadLegacy_(book){
  const sheets=versions_(book);if(!sheets.length)throw new Error('No complete version found. Retry the save from your draft or JSON backup.');
  const latest=readVersion_(sheets[sheets.length-1]);const prev=sheets.length>1?readVersion_(sheets[sheets.length-2]):null;
  const token=hash_([latest.name,latest.digest,prev?prev.digest:'']);
  latest.project.spreadsheetUrl=book.getUrl();
  const result={project:latest.project,token:token,basis:latest.digest};
  if(prev&&latest.parent!==prev.digest)result.conflict={manual:prev.project,app:latest.project,token:token};
  return result;
}
function readCompact_(book,state){
  if(!state.current)throw new Error('No complete save yet. Retry from your draft or JSON backup.');
  const current=readVersion_(sheet_(book,state.current));validate(current.project);
  const observed=[];
  for(const b of state.backups){const snapshot=readVersion_(sheet_(book,b.id));observed.push({kind:'backup',id:b.id,baseline:b.baseline,snapshot:snapshot});}
  if(state.archive){const archive=SpreadsheetApp.openById(state.archive.id);for(const w of state.archive.watch){const snapshot=readVersion_(sheet_(archive,w.id));observed.push({kind:'archive',id:w.id,baseline:w.baseline,snapshot:snapshot});}}
  const token=hash_([book.getId(),state.current,state.revision,current.digest,observed.map(o=>[o.kind,o.id,o.snapshot.digest])]);
  current.project.spreadsheetUrl=book.getUrl().split('#')[0]+'#gid='+state.current;
  if(state.archive)current.project.historyArchiveUrl=SpreadsheetApp.openById(state.archive.id).getUrl();
  const result={project:current.project,token:token,basis:current.digest,storageFormat:2};
  const changed=observed.filter(o=>o.snapshot.digest!==o.baseline);
  if(changed.length){const first=changed[0];result.conflict={manual:first.snapshot.project,app:current.project,token:token,source:first.kind==='archive'?'Legacy archive / '+first.snapshot.name:first.snapshot.name,pendingCount:changed.length};result.review={kind:first.kind,id:first.id,digest:first.snapshot.digest};}
  return result;
}
function guide_(book,state){
  if(state.guideRevision===state.revision)return;
  let info=book.getSheetByName('GUIDE');if(!info){info=book.getSheets().find(s=>s.getName()==='Sheet1')||book.insertSheet('GUIDE');info.setName('GUIDE');}
  const rows=[['2List — CURRENT + 3 recent backups'],['Edit RECORD rows in CURRENT only. Open CURRENT by tab name each time; its tab ID changes after a save.'],['Keep IDs and metadata unchanged. Sort entire rows. Questions/VO follow record IDs. Edit scripts/settings in the app.'],['BACKUP tabs are recent recovery copies, not editing tabs. Older backups are removed after a safe save. Keep JSON backups for longer retention.'],['Save in the app, then reload on the other device. Conflicts retain both versions for review; unresolved recovery tabs are not pruned.'],['An interrupted save may leave _2LIST_PENDING temporarily. Reopen the app to recover; do not edit or delete it.'],['Legacy history archive (kept unchanged):'],[state.archive?SpreadsheetApp.openById(state.archive.id).getUrl():'No legacy archive needed for this project.']];
  info.getRange(1,1,rows.length,1).setValues(rows);info.setColumnWidth(1,900);info.getRange(1,1,rows.length,1).setWrap(true);
  const currentUrl=book.getUrl().split('#')[0]+'#gid='+state.current;
  info.getRange('A9').setValue(currentUrl);
  for(const id of [state.current,...state.backups.map(b=>b.id)]){
    const tab=sheet_(book,id);const active=id===state.current;
    tab.getRange('A1').setValue(active?'CURRENT':'BACKUP — OLD COPY');
    tab.getRange('C1').setFormula('=HYPERLINK("'+currentUrl+'","OPEN CURRENT")');
    tab.getRange('C2').setValue(active?'Edit RECORD rows here. Reload the app before saving.':'This tab is an older snapshot. Click OPEN CURRENT above to edit the latest data.');
    tab.getRange('A1:C2').setBackground(active?'#e0eedf':'#fff0ce').setWrap(true);
  }
  state.guideRevision=state.revision;putState_(book,state);
}
function writeSnapshot_(book,project,parent,name){
  const width=FIELDS_.length+1;const meta={id:project.id,name:project.name,settings:project.settings};
  const rows=[['STATE','PENDING'],['PARENT',parent||''],['PROJECT',JSON.stringify(meta)],['NOTE','Edit only CURRENT. Keep IDs unchanged. Questions/VO follow IDs.'],['TYPE',...FIELDS_]];
  project.records.forEach(record=>rows.push(['RECORD',...FIELDS_.map(f=>record[f]&&typeof record[f]==='object'?JSON.stringify(record[f]):record[f]??'')]));
  Object.keys(project.scripts).forEach(ep=>{const script=project.scripts[ep];rows.push(['SCRIPT',ep,'',JSON.stringify(Object.assign({},script,{sections:[]}))]);script.sections.forEach((section,index)=>rows.push(['SECTION',ep,section.id,JSON.stringify(section),index]));});
  rows.forEach(r=>{if(r.some(v=>String(v).length>45000))throw new Error('A cell exceeds the safe limit. Split long text or scripts before saving.');while(r.length<width)r.push('');});
  const sheet=book.insertSheet(name);
  if(rows.length>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),rows.length-sheet.getMaxRows());
  if(width>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),width-sheet.getMaxColumns());
  const range=sheet.getRange(1,1,rows.length,width);range.setNumberFormat('@');range.setValues(rows.map(r=>r.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v)));
  sheet.setFrozenRows(5);sheet.setColumnWidth(1,90);sheet.setColumnWidth(2,180);sheet.setColumnWidths(5,2,260);sheet.getRange(5,1,1,width).setFontWeight('bold').setBackground('#eee2b4');range.setWrap(true);
  SpreadsheetApp.flush();sheet.getRange('B1').setValue('COMMITTED');SpreadsheetApp.flush();return sheet;
}
// Journal first; never overwrite CURRENT's cells. Rename only after the candidate
// is complete. A reader can finish this sequence after any interrupted operation.
function recover_(book,state){
  if(state.pruning){
    if(!book.getSheetById(state.pruning))state.backups=state.backups.filter(b=>b.id!==state.pruning);
    state.pruning=null;putState_(book,state);
  }
  if(!state.pending)return state;
  const pending=state.pending;const stage=pending.id?book.getSheetById(pending.id):book.getSheetByName('_2LIST_PENDING');
  if(!stage||stage.getRange('B1').getDisplayValue()!=='COMMITTED'){
    if(stage)book.deleteSheet(stage);state.pending=null;putState_(book,state);return state;
  }
  const candidate=readVersion_(stage);validate(candidate.project);
  if(candidate.project.id!==state.projectId)throw new Error('Recovery project ID does not match. Keep all tabs and restore from a backup.');
  pending.id=stage.getSheetId();putState_(book,state);
  if(state.current){const old=sheet_(book,state.current);const backupName='BACKUP_'+String(state.revision).padStart(6,'0');if(old.getName()!==backupName)old.setName(backupName);}
  if(stage.getName()!=='CURRENT')stage.setName('CURRENT');
  const backups=state.current?[{id:state.current,revision:state.revision,baseline:pending.basis},...state.backups]:state.backups;
  if(pending.review){const list=pending.review.kind==='backup'?backups:state.archive.watch;const item=list.find(x=>x.id===pending.review.id);if(item)item.baseline=pending.review.digest;}
  state.current=stage.getSheetId();state.revision=pending.revision;state.backups=backups;state.pending=null;putState_(book,state);return state;
}
function prune_(book,state){
  // Any changed backup or watched legacy tab blocks pruning until explicitly reviewed.
  while(state.backups.length>BACKUPS_){
    if(readCompact_(book,state).conflict)return state;
    const oldest=state.backups[state.backups.length-1];state.pruning=oldest.id;putState_(book,state);
    const tab=sheet_(book,oldest.id);
    if(readVersion_(tab).digest!==oldest.baseline){state.pruning=null;putState_(book,state);return state;}
    book.deleteSheet(tab);state.backups.pop();state.pruning=null;putState_(book,state);
  }
  return state;
}
function syncContiSheets_(book,project){
  const sheets=project.settings&&Array.isArray(project.settings.contiSheets)?project.settings.contiSheets:[];
  sheets.forEach(cs=>{
    const tabName=String(cs.tabName||'CONTI SHEET').slice(0,95);
    if(['GUIDE','CURRENT','_2LIST_PENDING'].includes(tabName)||/^BACKUP_|^V\d{6}$/.test(tabName))return;
    let tab=book.getSheetByName(tabName);
    if(!tab)tab=book.insertSheet(tabName);
    else tab.clear();
    const cams=Math.min(3,Math.max(1,Number(cs.cameras)||2));
    const showAudio=cs.audio!=='direct';
    const width=4+cams+(showAudio?1:0)+1;
    const pad=arr=>{const r=arr.slice();while(r.length<width)r.push('');return r;};
    const titleSuffix=cs.contiType?' — '+String(cs.contiType).toUpperCase():'';
    const h1=['SCENE','SHOT','TAKE','DESCRIPTION','VIDEO'];
    for(let c=1;c<cams;c++)h1.push('');
    if(showAudio)h1.push('AUDIO');
    h1.push('REMARKS');
    const h2=['','','',''];
    for(let c=0;c<cams;c++)h2.push(cams>1?'CAM '+(c+1):'');
    if(showAudio)h2.push('');
    h2.push('');
    const hostThrowOrder=['Throw 1','Throw 2','Throw 3','Throw 4','Throw 5','Opening','Promo','Closing'];
    const cmp=(x,y)=>{
      const ix=hostThrowOrder.indexOf(String(x||'')),iy=hostThrowOrder.indexOf(String(y||''));
      if(ix!==-1||iy!==-1)return (ix===-1?999:ix)-(iy===-1?999:iy);
      return String(x||'1').localeCompare(String(y||'1'),undefined,{numeric:true,sensitivity:'base'});
    };
    const sorted=(cs.rows||[]).slice().sort((a,b)=>cmp(a.scene,b.scene)||cmp(a.shot,b.shot)||cmp(a.take,b.take));
    const rows=[
      pad([project.name+' — CONTINUITY SHEET'+titleSuffix]),
      pad(['DATE: '+(cs.date||''),'EPISODE: '+String(cs.episode||1).padStart(2,'0'),'STATUS: '+(cs.ended?'ENDED':'ACTIVE')]),
      pad([]),
      pad(h1)
    ];
    if(cams>1)rows.push(pad(h2));
    sorted.forEach(r=>{
      const line=[String(r.scene||'1'),String(r.shot||'1'),String(r.take||'1'),String(r.description||'')];
      for(let c=0;c<cams;c++)line.push(String(r['cam'+(c+1)]||''));
      if(showAudio)line.push(String(r.audio||''));
      line.push(String(r.remarks||'GT'));
      rows.push(pad(line));
    });
    const range=tab.getRange(1,1,rows.length,width);
    range.setNumberFormat('@');
    range.setValues(rows);
    tab.getRange(1,1,1,width).setFontWeight('bold');
    tab.getRange(4,1,cams>1?2:1,width).setFontWeight('bold').setBackground('#eee2b4');
    tab.setFrozenRows(cams>1?5:4);
  });
}
function commit_(book,state,project,basis,review){
  state.pending={revision:state.revision+1,basis:basis||'',review:review||null};putState_(book,state);
  const stage=writeSnapshot_(book,project,basis,'_2LIST_PENDING');state.pending.id=stage.getSheetId();putState_(book,state);
  state=recover_(book,state);state=prune_(book,state);guide_(book,state);syncContiSheets_(book,project);return readCompact_(book,state);
}
function emptyState_(projectId,archive){return {format:2,projectId:projectId,current:null,revision:0,backups:[],archive:archive||null,pending:null,pruning:null};}
function archiveWatch_(book){
  const versions=versions_(book).slice(-2);const snapshots=versions.map(sheet=>readVersion_(sheet));
  const last=snapshots[snapshots.length-1];if(!last)throw new Error('No complete legacy version to migrate.');
  return {id:book.getId(),token:hash_([last.name,last.digest,snapshots.length>1?snapshots[0].digest:'']),watch:versions.map((sheet,i)=>({id:sheet.getSheetId(),baseline:snapshots[i].digest}))};
}
// An old-format workbook is kept as the archive, without deleting or rewriting any
// of its sheets. Only the app's registry is switched after the new file is complete.
function projectBook_(id){
  const registry=registry_();const entry=registry[id];if(!entry)throw new Error('Project is not registered.');
  if(entry.migration){
    const target=SpreadsheetApp.openById(entry.migration);let state=state_(target);if(!state)throw new Error('Migration metadata is missing. Keep the original workbook and contact support.');
    state=recover_(target,state);
    if(state.current){entry.sheet=entry.migration;delete entry.migration;putRegistry_(registry);state=prune_(target,state);guide_(target,state);return target;}
  }
  const book=SpreadsheetApp.openById(entry.sheet);let state=state_(book);
  if(state){state=recover_(book,state);if(state.current){state=prune_(book,state);guide_(book,state);if(entry.creating){delete entry.creating;putRegistry_(registry);}}}
  return book;
}
function loadFromBook_(book){const state=state_(book);return state?readCompact_(book,state):loadLegacy_(book);}
function loadProject(id){owner_();return withLock_(()=>loadFromBook_(projectBook_(id)));}
function saveInto_(id,book,project,current,review){
  let state=state_(book);
  if(!state){
    const registry=registry_();const entry=registry[id];let target;
    if(entry.migration)target=SpreadsheetApp.openById(entry.migration);
    else{target=SpreadsheetApp.create('2List — '+project.name+' — Current');putState_(target,emptyState_(id,archiveWatch_(book)));entry.migration=target.getId();putRegistry_(registry);}
    // Recheck before starting a migration; any later edits stay in the untouched archive.
    const archive=archiveWatch_(book);
    if(archive.token!==current.token)throw new Error('Sheets changed before migration. Reload before saving.');
    state=emptyState_(id,archive);putState_(target,state);
    commit_(target,state,project,'',null);
    const latestRegistry=registry_();latestRegistry[id].sheet=target.getId();delete latestRegistry[id].migration;latestRegistry[id].name=project.name;putRegistry_(latestRegistry);
    return loadFromBook_(target);
  }
  const result=commit_(book,state,project,current?current.basis:'',review);
  const registry=registry_();registry[id].name=project.name;delete registry[id].creating;putRegistry_(registry);return result;
}
function saveProject(project,expectedToken){
  owner_();validate(project);return withLock_(()=>{
    let registry=registry_();let book,current=null;
    if(!registry[project.id]){
      if(expectedToken)return {error:'The project has changed. Reload first.'};
      book=SpreadsheetApp.create('2List — '+project.name);putState_(book,emptyState_(project.id));
      registry[project.id]={sheet:book.getId(),name:project.name,creating:true};putRegistry_(registry);
    }else{
      book=projectBook_(project.id);const state=state_(book);
      if(!state||state.current){current=loadFromBook_(book);if(current.conflict)return {error:'Resolve manual Sheets conflicts by reloading.'};if(current.token!==expectedToken)return {error:'Sheets has changed since it was opened. Back up your draft, then reload.'};}
      else if(expectedToken)return {error:'Saved version not found. Retry from your draft or JSON backup.'};
    }
    return saveInto_(project.id,book,project,current,null);
  });
}
function resolveConflict(id,expectedToken,choice){
  owner_();if(!['manual','app'].includes(choice))throw new Error('Invalid conflict choice.');
  return withLock_(()=>{const book=projectBook_(id);const current=loadFromBook_(book);if(current.token!==expectedToken||!current.conflict)return {error:'The conflict has changed. Reload before choosing.'};const selected=current.conflict[choice];validate(selected);return saveInto_(id,book,selected,current,current.review);});
}

// Included only in the Gemini package. No secret is embedded in this file.
function draftHost(project,options){
 owner_();validate(project);
 const props=PropertiesService.getScriptProperties();
 const key=props.getProperty('GEMINI_API_KEY');
 if(!key||props.getProperty('GEMINI_FREE_TIER_CONFIRMED')!=='true')throw new Error('AI is not configured. Verify Free tier with billing disabled and configure the server key.');
 const request=buildGeminiRequest(project,options);
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
  const today=Utilities.formatDate(new Date(),'Asia/Kuching','yyyy-MM-dd');
  const usage=JSON.parse(props.getProperty('GEMINI_USAGE')||'{}');
  const count=usage.date===today?Number(usage.count):0;
  if(!Number.isFinite(count)||count>=20)throw new Error('AI quota limit reached for today. Continue writing manually.');
  if(Number(usage.blockedUntil)>Date.now())throw new Error('AI quota temporarily unavailable. Try again later; no requests were retried.');
  props.setProperty('GEMINI_USAGE',JSON.stringify({date:today,count:count+1}));
 }finally{lock.releaseLock();}
 let response;
 try{response=UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/'+GEMINI_FREE_MODEL+':generateContent',{method:'post',contentType:'application/json',headers:{'x-goog-api-key':key},payload:JSON.stringify(request),muteHttpExceptions:true});}
 catch(e){throw new Error('AI connection failed. No automatic retry. Existing text is unchanged.');}
 const status=response.getResponseCode();
 if(status===429){
  lock.waitLock(10000);try{const usage=JSON.parse(props.getProperty('GEMINI_USAGE')||'{}');usage.blockedUntil=Date.now()+60000;props.setProperty('GEMINI_USAGE',JSON.stringify(usage));}finally{lock.releaseLock();}
  throw new Error('AI quota unavailable. Try again later or continue manually. No paid fallback.');
 }
 if(status!==200)throw new Error('AI unavailable (HTTP '+status+'). No retry or paid fallback. Existing text is unchanged.');
 let result;try{result=JSON.parse(response.getContentText());}catch(e){throw new Error('AI returned an unreadable response. Existing text is unchanged.');}
 return extractGeminiWriting(result);
}

// Owner-only, read-only diagnostic. Does not call AI, save, migrate or recover files.
function diagnose2ListRecords(){
 owner_();const registry=registry_();const report=[];
 Object.keys(registry).forEach(id=>{
  const book=SpreadsheetApp.openById(registry[id].sheet);const state=state_(book);
  const sheet=state?.current?book.getSheetById(state.current):versions_(book).slice(-1)[0];
  if(!sheet){report.push({project:registry[id].name,error:'No committed snapshot'});return;}
  const p=readVersion_(sheet).project;const issues=[];
  p.records.forEach((r,i)=>{
   const invalid=[];
   if(r.episode!==null&&(!Number.isInteger(r.episode)||r.episode<1||r.episode>p.settings.episodes))invalid.push('episode');
   if(r.capsule!==''&&!keys(p).includes(r.capsule))invalid.push('capsule');
   if(!statuses.includes(r.status))invalid.push('status');
   if(invalid.length)issues.push({record:i+1,topic:r.topic,episode:r.episode,capsule:r.capsule,status:r.status,invalid:invalid});
  });
  report.push({project:p.name,episodes:p.settings.episodes,capsules:p.settings.capsules,recordCount:p.records.length,issues:issues});
 });
 console.log(JSON.stringify(report));return report;
}
// Connectivity diagnostic only: lists models, never generates or writes Sheets.
function checkGeminiConnection(){
 owner_();const key=PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
 if(!key){console.log('Gemini key missing');return;}
 try{
  const r=UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':key},muteHttpExceptions:true});
  console.log('Gemini connection HTTP '+r.getResponseCode());
 }catch(e){console.log('Gemini connection diagnostic: '+String(e.message||e).split(key).join('[redacted]').slice(0,800));}
}
