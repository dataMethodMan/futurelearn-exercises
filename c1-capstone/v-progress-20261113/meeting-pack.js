function normaliseMeetingPack(value, data) {
  if (value === undefined) value = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid meeting pack');
  const text = {};
  for (const field of ['message','question','nextStep','claimReason']) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || value[field].length > 2000)) throw Error('Invalid pack field');
    text[field] = value[field] || '';
  }
  if (value.evidence !== undefined && !Array.isArray(value.evidence)) throw Error('Invalid pack evidence');
  const choose = (v, allowed) => allowed.includes(v) ? v : '';
  return {...text, focus: choose(value.focus,['traffic','data']), visual: choose(value.visual,data.visuals.map(v=>v.id)),
    evidence: [...new Set(value.evidence || [])].filter(id=>data.evidence.some(f=>f.id===id)).slice(0,2),
    claimDecision: choose(value.claimDecision,['use','qualify','omit']), internal: choose(value.internal,data.guides.map(g=>g.id)), checked: value.checked === true};
}
function meetingPackHasWork(pack) {
  return !!(pack.focus || pack.visual || pack.evidence.length || pack.message || pack.question || pack.nextStep || pack.claimReason || pack.internal || pack.claimDecision);
}
function meetingPackFeedback(pack, data) {
  const missing=[], review=[], strengths=[];
  if (!pack.focus) missing.push('Choose an opening priority.');
  if (pack.evidence.length!==2) missing.push('Choose two case facts to support your opening.');
  if (!pack.visual) missing.push('Choose a customer visual.');
  for (const [key,label] of [['message','Write your opening message.'],['question','Write a discovery question.'],['nextStep','Explain your next action and why this priority should lead.'],['claimReason','Explain what you would change or confirm in the draft claim.']]) if (!pack[key].trim()) missing.push(label);
  if (!pack.internal) missing.push('Select an internal preparation guide.');
  if (!pack.claimDecision) missing.push('Decide what to do with the draft claim.');
  const visual=data.visuals.find(v=>v.id===pack.visual);
  if (pack.focus && pack.evidence.length===2) {
    const relevant=pack.evidence.filter(id=>data.evidence.find(f=>f.id===id).focus.includes(pack.focus));
    if (!relevant.length) review.push('Your two facts point to the other opening priority. Explain the connection in your next-action note, or reconsider your evidence or priority.');
    else strengths.push('Your selected evidence includes a case fact directly relevant to your opening priority. Explain the business consequence in your own message.');
  }
  if (visual && pack.focus && visual.id!==pack.focus) review.push('Your visual leads with a different issue from your selected priority. Explain how you would use it to support that opening, or choose the other visual.');
  if (visual && pack.claimDecision==='use') missing.push('Revisit "Use as written". '+visual.claim_feedback);
  if (visual && pack.claimDecision==='qualify') strengths.push('Qualifying this line is a sound choice. '+visual.claim_feedback+' One possible wording: '+visual.bounded_example);
  if (visual && pack.claimDecision==='omit') strengths.push('Leaving this line out is defensible at this stage. '+visual.claim_feedback+' Your next action should identify the evidence needed before making a stronger statement.');
  if (pack.internal) review.push(pack.internal==='change' ? 'Use the cost and disruption guide to prepare questions about operational effort and change. It does not establish that this customer has agreed a budget or migration.' : 'Use the information guide to test data readiness. It does not establish that records are accurate or that every team should have access.');
  return {missing,review,strengths,writing:data.copy_review,ready:missing.length===0};
}
function meetingPackSummary(pack, data) {
  const visual=data.visuals.find(v=>v.id===pack.visual),guide=data.guides.find(g=>g.id===pack.internal);
  return ['Meeting-pack notes','Opening priority: '+(pack.focus==='traffic'?'Website reliability':pack.focus==='data'?'Customer information':'Not selected'),
    'Case evidence: '+pack.evidence.map(id=>data.evidence.find(f=>f.id===id).text).join(' '),
    'Customer visual: '+(visual?.title || 'Not selected'),'Opening message: '+pack.message,'Discovery question: '+pack.question,
    'Draft claim: '+(pack.claimDecision || 'Not reviewed')+'. '+pack.claimReason,'Internal preparation: '+(guide?.title || 'Not selected'),
    'Next action and rationale: '+pack.nextStep].join('\n');
}
function appendMeetingPackNotes(existing, notes) {
  if (existing.includes(notes)) return {changed:false,value:existing};
  const value=existing+(existing?'\n\n':'')+notes;
  if (value.length>12000) return {changed:false,value:existing,tooLong:true};
  return {changed:true,value};
}
function packEscape(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function meetingPackVisualHTML(visual) {
  return '<figure class="pack-figure"><div class="pack-flow">'+visual.nodes.map(n=>'<div class="pack-node">'+packEscape(n)+'</div>').join('')+'</div><figcaption><strong>Possible direction to explore</strong><p>'+packEscape(visual.option)+'</p><p>'+packEscape(visual.limit)+'</p></figcaption></figure>';
}
function meetingPackExportHTML(pack,data,internal=true) {
  const visual=data.visuals.find(v=>v.id===pack.visual),guide=data.guides.find(g=>g.id===pack.internal);
  return '<article class="pack-preview"><p class="pack-label">Customer meeting aid</p><h3>'+packEscape(visual?.title || 'Choose a visual to start your meeting aid')+'</h3>'+(visual?meetingPackVisualHTML(visual):'')+
    '<ul>'+pack.evidence.map(id=>'<li>'+packEscape(data.evidence.find(f=>f.id===id).text)+'</li>').join('')+
    '<h4>Opening message</h4><p class="pack-user-copy">'+packEscape(pack.message || 'Your message will appear here.')+'</p><h4>Discovery question</h4><p class="pack-user-copy">'+packEscape(pack.question || 'Your question will appear here.')+'</p></article>'+
    (internal?'<section class="pack-internal"><h3>Internal preparation</h3><p>'+packEscape(guide?.title || 'Choose an internal guide.')+'</p>'+(guide?'<ul>'+guide.items.map(t=>'<li>'+packEscape(t)+'</li>').join('')+'</ul>':'')+'<p class="pack-user-copy">'+packEscape(pack.nextStep)+'</p><h4>Draft-claim review</h4><p>'+packEscape(pack.claimDecision || 'Not reviewed')+': '+packEscape(pack.claimReason)+'</p></section>':'');
}
function initMeetingPack(options) {
  const root=document.getElementById('meeting-pack-workspace'),data=options.data,get=options.get;
  const fields=['message','question','nextStep','claimReason','claimDecision','internal'];
  function paint() {
    const pack=get(),visual=data.visuals.find(v=>v.id===pack.visual);
    root.querySelector('#pack-preview').innerHTML=meetingPackExportHTML(pack,data);
    root.querySelector('#pack-claim').textContent=visual?'Colleague\'s draft line: '+visual.claim:'Choose a visual above to see the line you need to review.';
    root.querySelector('#pack-feedback').hidden=!pack.checked;
    root.querySelector('#pack-download').disabled=!pack.visual;
    root.querySelector('#pack-to-crm').disabled=!pack.visual;
    if (pack.checked) paintFeedback();
  }
  function paintFeedback() {
    const feedback=meetingPackFeedback(get(),data),box=root.querySelector('#pack-feedback');
    box.innerHTML='<h3>Review your pack</h3>'+(feedback.missing.length?'<h4>Complete or revisit</h4><ul>'+feedback.missing.map(t=>'<li>'+packEscape(t)+'</li>').join('')+'</ul>':'<p>The required parts are present. Review the guidance below before marking this task checked.</p>')+
      (feedback.strengths.length?'<h4>Your choices</h4><ul>'+feedback.strengths.map(t=>'<li>'+packEscape(t)+'</li>').join('')+'</ul>':'')+
      (feedback.review.length?'<h4>Think about the fit</h4><ul>'+feedback.review.map(t=>'<li>'+packEscape(t)+'</li>').join('')+'</ul>':'')+
      '<h4>Check your writing</h4><ul>'+feedback.writing.map(t=>'<li>'+packEscape(t)+'</li>').join('')+'</ul><p class="mini">These prompts support your judgment. Your sentences have not been automatically graded.</p>';
    box.hidden=false;
  }
  function restore() {
    const pack=get();
    for(const name of ['focus','visual'])root.querySelectorAll('[name="pack-'+name+'"]').forEach(e=>{e.checked=e.value===pack[name];});
    root.querySelectorAll('[name="pack-evidence"]').forEach(e=>{e.checked=pack.evidence.includes(e.value);});
    for(const field of fields)root.querySelector('#pack-'+field).value=pack[field];
    root.querySelector('#pack-crm-confirmation').hidden=true;paint();
  }
  function edited(event) {
    const selected=[...root.querySelectorAll('[name="pack-evidence"]:checked')].map(e=>e.value);
    if(selected.length>2){event.target.checked=false;options.say('Choose two case facts. Remove one before selecting another.');return;}
    const value={...get(),evidence:selected,checked:false};
    for(const name of ['focus','visual'])value[name]=root.querySelector('[name="pack-'+name+'"]:checked')?.value || '';
    for(const field of fields)value[field]=root.querySelector('#pack-'+field).value;
    options.change(normaliseMeetingPack(value,data),true);root.querySelector('#pack-crm-confirmation').hidden=true;paint();
  }
  root.querySelectorAll('input,select').forEach(e=>e.addEventListener('change',edited));
  root.querySelectorAll('textarea').forEach(e=>e.addEventListener('input',edited));
  function check() { options.change({...get(),checked:true},false);paintFeedback();const box=root.querySelector('#pack-feedback');box.tabIndex=-1;box.focus();return meetingPackFeedback(get(),data); }
  root.querySelector('#pack-check').addEventListener('click',check);
  root.querySelector('#pack-download').addEventListener('click',()=>{
    const content='<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sto Lat Select meeting pack</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#192c3c;max-width:900px;margin:24px auto;padding:0 18px}.pack-flow{display:flex;gap:10px;flex-wrap:wrap}.pack-node{flex:1;min-width:130px;padding:12px;background:#eef5ff;border:1px solid #91b2de}.pack-preview,.pack-internal{margin:20px 0}.pack-internal{border-top:2px solid #506577;padding-top:18px}.pack-user-copy{white-space:pre-wrap}h3,h4{margin-bottom:6px}.pack-label{font-weight:bold}figure{margin:16px 0}@media print{.pack-internal{break-before:page}}</style>'+meetingPackExportHTML(get(),data)+'</html>';
    options.download(content,'sto-lat-select-meeting-pack.html','text/html');options.say((meetingPackFeedback(get(),data).ready ? 'Meeting pack' : 'Meeting pack draft')+' downloaded with the customer aid and separate internal preparation notes.');
  });
  root.querySelector('#pack-to-crm').addEventListener('click',()=>{root.querySelector('#pack-crm-confirmation').hidden=false;root.querySelector('#pack-crm-confirm').focus();});
  root.querySelector('#pack-crm-cancel').addEventListener('click',()=>{root.querySelector('#pack-crm-confirmation').hidden=true;options.say('CRM draft kept as it is.');});
  root.querySelector('#pack-crm-confirm').addEventListener('click',()=>{options.appendToCRM(meetingPackSummary(get(),data));root.querySelector('#pack-crm-confirmation').hidden=true;});
  restore();return {restore,check};
}
if(typeof module!=='undefined'&&module.exports)module.exports={normaliseMeetingPack,meetingPackHasWork,meetingPackFeedback,meetingPackSummary,appendMeetingPackNotes,meetingPackExportHTML};
