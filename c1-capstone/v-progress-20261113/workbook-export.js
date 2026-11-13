// Personal workbook generation runs entirely in the learner's browser.
// The styles and package metadata come from the Artifact Tool-authored template.
function splitWorkbookText(value) {
  const chunks=[]; let text='', lines=1, width=0;
  for (const char of String(value ?? '')) {
    const advance=char==='\t'?4:(char.codePointAt(0)>=0x100 || 'MWmw'.includes(char))?2:1;
    const newline=char==='\n'||char==='\r';
    let nextLines=lines+(newline||width+advance>90?1:0);
    if (text && (text.length+char.length>700 || nextLines>12)) { chunks.push({text,lines});text='';lines=1;width=0;nextLines=newline?2:1; }
    text+=char;lines=nextLines;width=newline?0:width+advance>90?advance:width+advance;
  }
  if (text || !chunks.length) chunks.push({text,lines});
  return chunks;
}
function workbookXMLText(value) {
  return String(value).replace(/_x[0-9a-f]{4}_/gi,m=>'_x005F_'+m.slice(1))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,c=>'_x'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')+'_')
    .replace(/[&<>"'\r]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;','\r':'&#13;'}[c]));
}
function personalWorkbookRows(work,data,date) {
  const responses=[],pack=[], mp=work.meetingPack || {}, materials=data.meetingPack;
  const row=(target,label,value,kind='body')=>{
    for (const [i,part] of splitWorkbookText(value).entries())target.push({label:i?label+' (continued)':label,text:part.text,kind,lines:Math.max(part.lines,Math.ceil((i?label.length+12:label.length)/24))});
  };
  const section=(target,title)=>target.push({label:title,text:'',kind:'section',lines:Math.ceil(title.length/24)});
  const start=(target,title)=>{
    target.push({label:'',text:'',kind:'body',lines:1});row(target,title,'','title');
    row(target,'Downloaded',date.toISOString().replace('T',' ').slice(0,19)+' UTC');
    row(target,'Editable takeaway','This workbook contains your current responses. Long answers continue on additional rows.');
  };
  start(responses,'My capstone project');
  for (const task of data.tasks) {
    section(responses,task.short);row(responses,'Task',task.title,'prompt');row(responses,'Question',task.prompt,'prompt');
    row(responses,task.id==='tools'?'Earlier response / notes':'Your response',work.answers?.[task.id] || '');
    row(responses,'Your review status',(work.done || []).includes(task.id)?'Reviewed by you':'Not marked reviewed');
    if(task.id==='tools')row(responses,'Meeting pack','Your selections and meeting-pack writing are on the Meeting pack sheet.');
    responses.push({label:'',text:'',kind:'body',lines:1});
  }
  const attempted=data.questions.filter(q=>(work.choices?.[q.id] || []).length);
  if(attempted.length){
    section(responses,'Your self-review');
    for(const q of attempted){
      row(responses,'Practice question',q.text,'prompt');
      for(const choice of work.choices[q.id])row(responses,'Your selected answer',q.options[choice]);
      const checked=(work.checked || []).includes(q.id),correct=JSON.stringify([...work.choices[q.id]].sort((a,b)=>a-b))===JSON.stringify([...q.correct].sort((a,b)=>a-b));
      row(responses,'Practice check',checked?(correct?'Checked successfully':'Revisit the hint'):'Not checked');
      if(checked)row(responses,'Feedback shown',correct?q.feedback:q.hint,'prompt');
    }
  }
  start(pack,'My meeting pack');
  section(pack,'Your opening');row(pack,'Opening priority',mp.focus==='traffic'?'Website reliability':mp.focus==='data'?'Customer information':'');
  for(const [i,id] of (mp.evidence || []).entries()){
    const fact=materials.evidence.find(f=>f.id===id);if(fact){row(pack,'Selected fact '+(i+1),fact.text);row(pack,'Case section',fact.source,'prompt');}
  }
  section(pack,'Customer meeting aid');
  const visual=materials.visuals.find(v=>v.id===mp.visual);
  row(pack,'Selected visual',visual?.title || '');
  if(visual){for(const [i,text] of visual.nodes.entries())row(pack,'Visual step '+(i+1),text);row(pack,'Direction to explore',visual.option);row(pack,'What to confirm',visual.limit);}
  row(pack,'Your opening message',mp.message || '');row(pack,'Your discovery question',mp.question || '');
  section(pack,'Internal preparation');row(pack,'Your next action and rationale',mp.nextStep || '');
  const guide=materials.guides.find(g=>g.id===mp.internal);row(pack,'Selected internal guide',guide?.title || '');
  if(guide){row(pack,'Guide purpose',guide.intro,'prompt');for(const [i,text] of guide.items.entries())row(pack,'Preparation note '+(i+1),text);}
  section(pack,'Your draft-claim review');row(pack,'Colleague draft claim',visual?.claim || '','prompt');
  row(pack,'Your decision',({use:'Use as written',qualify:'Qualify before using',omit:'Leave out for now'})[mp.claimDecision] || '');
  row(pack,'Your changes / checks',mp.claimReason || '');
  row(pack,'Feedback viewed',mp.checked?'Viewed in the activity':'Not viewed for this version');
  row(pack,'Your Task 4 review',(work.done || []).includes('tools')?'Reviewed by you':'Not marked reviewed');
  if(mp.checked){
    const feedback=typeof meetingPackFeedback==='function'?meetingPackFeedback(mp,materials):require('./meeting-pack.js').meetingPackFeedback(mp,materials);
    section(pack,'Activity feedback');
    for(const [key,label] of [['missing','Complete or revisit'],['strengths','Your choices'],['review','Think about the fit'],['writing','Writing review prompt']])for(const text of feedback[key])row(pack,label,text,'prompt');
    row(pack,'About this feedback','The activity checks choices and provides writing prompts. Your free writing has not been automatically graded.','prompt');
  }
  return [{name:'Your responses',rows:responses},{name:'Meeting pack',rows:pack}];
}
function personalWorksheetXML(rows,styles) {
  const cell=(ref,value,style)=>'<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+workbookXMLText(value)+'</t></is></c>';
  const body=rows.map((row,i)=>{
    const r=i+1,height=row.kind==='title'?32:Math.max(24,Math.min(240,row.lines*17+12));
    const a=row.kind==='title'?styles.title:row.kind==='section'?styles.section:styles.label;
    const b=row.kind==='section'?styles.section:row.kind==='prompt'?styles.prompt:styles.body;
    return '<row r="'+r+'" ht="'+height+'" customHeight="1">'+cell('A'+r,row.label,a)+cell('B'+r,row.text,b)+'</row>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:B'+rows.length+'"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="B5" sqref="B5"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="100" customWidth="1"/></cols><sheetData>'+body+'</sheetData><pageMargins left="0.35" right="0.35" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
}
function workbookCRC32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function workbookZip(parts) {
  const enc=new TextEncoder(),local=[],directory=[];let offset=0;
  const header=(size)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
  for(const [name,text] of Object.entries(parts)){
    const filename=enc.encode(name),data=enc.encode(text),crc=workbookCRC32(data),h=header(30+filename.length),v=h.view;
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);h.bytes.set(filename,30);
    const c=header(46+filename.length),cv=c.view;cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x21,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);c.bytes.set(filename,46);
    local.push(h.bytes,data);directory.push(c.bytes);offset+=h.bytes.length+data.length;
  }
  const size=directory.reduce((n,b)=>n+b.length,0),end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,directory.length,true);end.view.setUint16(10,directory.length,true);end.view.setUint32(12,size,true);end.view.setUint32(16,offset,true);
  const result=new Uint8Array(offset+size+22);let position=0;for(const bytes of [...local,...directory,end.bytes]){result.set(bytes,position);position+=bytes.length;}return result;
}
function createPersonalWorkbook(work,data,template,date=new Date()) {
  const sheets=personalWorkbookRows(work,data,date),parts={...template.parts};
  for(const [i,sheet] of sheets.entries())parts['xl/worksheets/sheet'+(i+1)+'.xml']=personalWorksheetXML(sheet.rows,template.styles);
  return workbookZip(parts);
}
if(typeof module!=='undefined'&&module.exports)module.exports={splitWorkbookText,workbookXMLText,personalWorkbookRows,personalWorksheetXML,workbookCRC32,workbookZip,createPersonalWorkbook};
