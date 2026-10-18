const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const baseDir = path.resolve(__dirname, '..');
const dataDir = path.join(require('node:os').tmpdir(), 'gymsaathi_qr_e2e_review_data');
fs.rmSync(dataDir, { recursive: true, force: true });
process.env.DATA_DIR = dataDir;
process.env.ADMIN_EMAIL = 'owner@example.test';
process.env.ADMIN_PASSWORD = 'StrongAdmin123!';
delete process.env.GEMINI_API_KEY;
delete process.env.MONGODB_URI;
delete process.env.REDIS_URL;
const serverMod = require(path.join(baseDir, 'server.js'));
const db = require(path.join(baseDir, 'lib/db.js'));
const ai = require(path.join(baseDir, 'lib/ai.js'));
const indiaDay=(d=new Date())=>{const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}); const parts=Object.fromEntries(f.formatToParts(d).map(p=>[p.type,p.value])); return `${parts.year}-${parts.month}-${parts.day}`;};
const checks=[];
function ok(name, pass, detail='') { checks.push({name,pass:!!pass,detail}); if (!pass) console.error('FAIL:',name,detail); else console.log('PASS:',name,detail); }
function assert(cond,msg) { if (!cond) throw new Error(msg); }
function parseCookie(res, cookieName) {
 const v = res.headers.get('set-cookie') || '';
 const m = new RegExp('(?:^|,\\s*)('+cookieName+'=[^;,]+)').exec(v);
 return m ? m[1] : '';
}
async function main(){
 const srv = await serverMod.start(0);
 const origin = `http://127.0.0.1:${srv.address().port}`;
 async function req(path, {method='GET',body, cookie='', headers={}}={}){
   const h={...headers}; if(body!==undefined){h['content-type']='application/json';}
   if(cookie) h.cookie=cookie;
   const res=await fetch(origin+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
   const text=await res.text(); let json; try{json=JSON.parse(text)}catch{json=text};
   return {res,json,text,headers:res.headers};
 }
 try {
   const ping=await req('/ping'); ok('server starts and ping works',ping.res.status===200 && ping.text==='ok',`status=${ping.res.status}`);
   const unauth=await req('/api/data'); ok('private API denied to unauthenticated request',unauth.res.status===401,`status=${unauth.res.status}`);
   const adminLogin=await req('/api/auth/login',{method:'POST',body:{email:'owner@example.test',password:'StrongAdmin123!'}});
   const adminCookie=parseCookie(adminLogin.res,'sid'); ok('admin login',adminLogin.res.status===200 && !!adminCookie,`status=${adminLogin.res.status}`);
   const create=await req('/api/admin/gyms',{method:'POST',cookie:adminCookie,body:{email:'testgym@example.test',password:'StrongGym123!',name:'Test Gym',owner:'Owner Test',phone:'9876543210',timings:'5am-10pm',amenities:'Cardio',price1:500,price3:1300,price6:2400,price12:4500,ptPrice:100,dietPrice:50,staff:[]}});
   ok('create gym through admin API',create.res.status===200 && !!create.json.id,`status=${create.res.status} body=${JSON.stringify(create.json)}`);
   const gymId=create.json.id;
   const gymLogin=await req('/api/auth/login',{method:'POST',body:{email:'testgym@example.test',password:'StrongGym123!'}});
   const gymCookie=parseCookie(gymLogin.res,'sid'); ok('gym login',gymLogin.res.status===200 && !!gymCookie,`status=${gymLogin.res.status}`);
   let dataR=await req('/api/data',{cookie:gymCookie}); const data0=dataR.json;
   ok('GET /api/data has gym and generated join token',dataR.res.status===200 && data0.gym && /^[a-f0-9]{48}$/.test(data0.joinToken||''),`status=${dataR.res.status} joinToken=${!!data0.joinToken}`);
   const token=data0.joinToken;
   const details={...data0.gym,name:'Test Gym',owner:'Owner Test',phone:'9876543210',address:'Bhilwara',timings:'5am-10pm',amenities:'Cardio, weights',upi:'test@upi',price1:500,price3:1300,price6:2400,price12:4500,ptPrice:100,dietPrice:50,staff:[{name:'Rohit Sharma',phone:'9598908555',designation:'Trainer'}]};
   const saveSettings=await req('/api/gym',{method:'PUT',cookie:gymCookie,body:details});
   ok('Settings save staff/prices/details',saveSettings.res.status===200 && saveSettings.json.staff?.[0]?.name==='Rohit Sharma',`status=${saveSettings.res.status}`);
   dataR=await req('/api/data',{cookie:gymCookie});
   ok('Settings persist across GET /api/data',dataR.json.gym?.staff?.[0]?.name==='Rohit Sharma' && dataR.json.gym?.price1===500,`staff=${dataR.json.gym?.staff?.length||0}`);
   const page=await req(`/join/${token}`);
   ok('public QR page loads and is limited join page',page.res.status===200 && page.text.includes('AI Registration Assistant') && !page.text.includes('href="#/dashboard"'),`status=${page.res.status}`);
   ok('QR assistant shows a dedicated dynamic gym-name context and registration explanation',page.text.includes('id="assistantGymContext"') && page.text.includes('id="assistantIntro"') && page.text.includes('registration ke baad'),`gym context slot=${page.text.includes('assistantGymContext')}; intro slot=${page.text.includes('assistantIntro')}`);
   const joinJs=await req('/join.js');
   ok('first scan UI is wired to open registration before manual lookup and inserts the actual gym name',joinJs.res.status===200 && joinJs.text.includes("/assistant-turn") && joinJs.text.includes('startAssistant') && joinJs.text.includes("result.canRegister && plans.length") && joinJs.text.includes("$('#assistantGymContext').textContent") && joinJs.text.includes('document.title = `${gymName}'),`status=${joinJs.res.status}`);
   const first=await req(`/api/public/join/${token}`);
   ok('first scan with no saved cookie returns first_visit so UI can show registration',first.res.status===200 && first.json.status==='first_visit' && first.json.canRegister===true,`status=${first.res.status} response=${JSON.stringify(first.json)}`);
   const initialTurn=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:{},asked:'',said:'',tries:0}});
   ok('QR registration assistant names the target gym and clarifies new-name saving vs existing-member matching',initialTurn.res.status===200 && initialTurn.json.next==='name' && /Test Gym/.test(initialTurn.json.say||'') && /रजिस्ट्रेशन के बाद[\s\S]*रिकॉर्ड में सेव/.test(initialTurn.json.say||'') && !/जैसा जिम के रिकॉर्ड में होना चाहिए/.test(initialTurn.json.say||''),`status=${initialTurn.res.status}; next=${initialTurn.json.next}; say=${initialTurn.json.say}`);
   const naturalHindiName=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:{},asked:'name',said:'मेरा नाम राहुल शर्मा है',tries:0}});
   ok('QR AI handles a natural Hindi introduction without requiring a Gemini key',naturalHindiName.res.status===200 && naturalHindiName.json.form?.name==='राहुल शर्मा' && naturalHindiName.json.next==='phone',`name=${naturalHindiName.json.form?.name}; next=${naturalHindiName.json.next}`);
   // Public QR AI assistant: ask one question at a time, resolve existing members after name + phone,
   // then collect a new visitor's registration, review it, save it and verify the first/repeat attendance flow.
   let qrState=initialTurn.json;
   let qrTurn=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:qrState.form,asked:qrState.next,said:'QR AI New Person',tries:qrState.tries||0}});
   qrState=qrTurn.json;
   ok('QR AI accepts a new member name and asks for mobile',qrTurn.res.status===200 && qrState.form?.name==='QR AI New Person' && qrState.next==='phone',`status=${qrTurn.res.status}; next=${qrState.next}; name=${qrState.form?.name}`);
   qrTurn=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:qrState.form,asked:qrState.next,said:'9876543290',tries:qrState.tries||0}});
   qrState=qrTurn.json;
   const qrIdentity=await req(`/api/public/join/${token}/lookup`,{method:'POST',body:{name:qrState.form.name,phone:qrState.form.phone}});
   ok('QR AI collects mobile and safely checks whether this gym already has that member',qrTurn.res.status===200 && qrState.form?.phone==='9876543290' && qrState.next==='gender' && qrIdentity.json.status==='new' && !('members' in qrState),`next=${qrState.next}; identity=${qrIdentity.json.status}; response keys=${Object.keys(qrState).join(',')}`);
   const qrAnswers={gender:'male',age:'24',weight:'72',height:'5 ft 8 in',goal:'weight loss',health:'skip',batch:'morning',pt:'no',diet:'no',months:'1 month'};
   let qrSteps=0;
   while(qrState.next && qrState.next!=='paid' && qrSteps<20){
     const answer=qrAnswers[qrState.next] ?? 'skip';
     qrTurn=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:qrState.form,asked:qrState.next,said:answer,tries:qrState.tries||0}});
     if(qrTurn.res.status!==200) break;
     qrState=qrTurn.json; qrSteps++;
   }
   if(qrState.next==='paid'){
     qrTurn=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:{...qrState.form,paid:0},asked:'paid',said:'0',tries:0}});
     qrState=qrTurn.json;
   }
   ok('QR AI conversation reaches confirmation, computes the right fee and never asks to record payment',qrState.done===true && qrState.next===null && qrState.form.name==='QR AI New Person' && qrState.form.phone==='9876543290' && qrState.form.gender==='Male' && qrState.form.age===24 && qrState.form.weight===72 && qrState.form.height==='5 ft 8 in' && qrState.form.goal==='Weight loss' && qrState.form.health==='' && qrState.form.batch==='Morning' && qrState.form.months===1 && qrState.form.paid===0 && qrState.fee===500,`done=${qrState.done}; next=${qrState.next}; months=${qrState.form.months}; paid=${qrState.form.paid}; fee=${qrState.fee}; steps=${qrSteps}`);
   const qrAiSave=await req(`/api/public/join/${token}/register`,{method:'POST',body:{name:qrState.form.name,phone:qrState.form.phone,months:qrState.form.months,gender:qrState.form.gender||'',age:qrState.form.age??'',weight:qrState.form.weight??'',height:qrState.form.height||'',goal:qrState.form.goal||'',health:qrState.form.health||'',batch:qrState.form.batch||'',pt:qrState.form.pt===true,diet:qrState.form.diet===true,accept:true}});
   const qrAiCookie=parseCookie(qrAiSave.res,`gs_member_${token}`);
   ok('QR AI-confirmed registration creates member, unpaid membership, saved-device cookie and first attendance',qrAiSave.res.status===200 && qrAiSave.json.status==='registered' && qrAiSave.json.attendanceMarked===true && qrAiSave.json.due===500 && !!qrAiCookie,`status=${qrAiSave.res.status}; result=${JSON.stringify(qrAiSave.json)}; cookie=${!!qrAiCookie}`);
   const qrAiRepeat=await req(`/api/public/join/${token}`,{cookie:qrAiCookie});
   const qrAiDashboard=await req('/api/data',{cookie:gymCookie});
   const qrSavedMember=qrAiDashboard.json.members.find(m=>m.phone==='9876543290');
   ok('AI-registered member is auto-recognized next time and shows once in member + attendance lists',qrAiRepeat.json.status==='already' && qrAiRepeat.json.recognized===true && qrAiDashboard.json.members.filter(m=>m.phone==='9876543290').length===1 && qrAiDashboard.json.attendance.filter(a=>a.phone==='9876543290').length===1,`repeat=${qrAiRepeat.json.status}; members=${qrAiDashboard.json.members.filter(m=>m.phone==='9876543290').length}; attendance=${qrAiDashboard.json.attendance.filter(a=>a.phone==='9876543290').length}`);
   ok('QR AI optional details are persisted to the real member record',qrSavedMember?.gender==='Male' && qrSavedMember?.age===24 && qrSavedMember?.weight===72 && qrSavedMember?.height==='5 ft 8 in' && qrSavedMember?.goal==='Weight loss' && qrSavedMember?.batch==='Morning' && qrSavedMember?.paid===0,`gender=${qrSavedMember?.gender}; age=${qrSavedMember?.age}; weight=${qrSavedMember?.weight}; height=${qrSavedMember?.height}; goal=${qrSavedMember?.goal}; batch=${qrSavedMember?.batch}; paid=${qrSavedMember?.paid}`);

   const createdMember=await req('/api/members',{method:'POST',cookie:gymCookie,body:{name:'Existing Active',phone:'9876543211',months:1,paid:0,start:indiaDay()}});
   ok('normal member registration saves via backend',createdMember.res.status===200 && createdMember.json.name==='Existing Active',`status=${createdMember.res.status}`);
   const lookup=await req(`/api/public/join/${token}/lookup`,{method:'POST',body:{name:'Existing Active',phone:'9876543211'}});
   const memberCookie=parseCookie(lookup.res,`gs_member_${token}`);
   ok('first existing-member verification creates session + attendance',lookup.res.status===200 && lookup.json.status==='present' && !!memberCookie && /HttpOnly/i.test(lookup.res.headers.get('set-cookie')||''),`status=${lookup.res.status}; result=${lookup.json.status}; cookie=${!!memberCookie}`);
   const repeat=await req(`/api/public/join/${token}`,{cookie:memberCookie});
   ok('second scan recognizes from cookie; no name/phone required',repeat.res.status===200 && repeat.json.status==='already' && repeat.json.recognized===true,`status=${repeat.res.status}; result=${repeat.json.status}`);
   let after=await req('/api/data',{cookie:gymCookie});
   const nAttendance=(after.json.attendance||[]).filter(x=>x.id===createdMember.json.id).length;
   ok('dashboard data reflects QR attendance exactly once',nAttendance===1,`member rows=${after.json.members?.length}; attendance matches=${nAttendance}`);
   const memberForAssistant=await req('/api/members',{method:'POST',cookie:gymCookie,body:{name:'Existing AI QR Member',phone:'9876543232',months:1,paid:0,start:indiaDay()}});
   const existingAIStart=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:{},asked:'',said:'',tries:0}});
   const existingAIName=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:existingAIStart.json.form,asked:existingAIStart.json.next,said:'Existing AI QR Member',tries:0}});
   const existingAIPhone=await req(`/api/public/join/${token}/assistant-turn`,{method:'POST',body:{form:existingAIName.json.form,asked:existingAIName.json.next,said:'9876543232',tries:0}});
   const existingAICheckin=await req(`/api/public/join/${token}/lookup`,{method:'POST',body:{name:existingAIPhone.json.form.name,phone:existingAIPhone.json.form.phone}});
   const existingAICookie=parseCookie(existingAICheckin.res,`gs_member_${token}`);
   const afterExistingAI=await req('/api/data',{cookie:gymCookie});
   ok('QR AI recognizes an existing registered member after name + phone and skips duplicate registration',memberForAssistant.res.status===200 && existingAIPhone.json.next==='gender' && existingAICheckin.json.status==='present' && !!existingAICookie && afterExistingAI.json.members.filter(m=>m.phone==='9876543232').length===1,`checkin=${existingAICheckin.json.status}; member records=${afterExistingAI.json.members.filter(m=>m.phone==='9876543232').length}`);

   // A member whose record already exists but has no QR cookie opens the registration form first.
   // Submitting the same registered full name + mobile must recognize that record, not add a duplicate.
   const beforeFormMember=await req('/api/data',{cookie:gymCookie});
   const formExisting=await req('/api/members',{method:'POST',cookie:gymCookie,body:{name:'Existing Via First Form',phone:'9876543220',months:1,paid:0,start:indiaDay()}});
   const formExistingResult=await req(`/api/public/join/${token}/register`,{method:'POST',body:{name:'Existing Via First Form',phone:'9876543220',months:1,accept:true}});
   const formExistingCookie=parseCookie(formExistingResult.res,`gs_member_${token}`);
   const afterFormExisting=await req('/api/data',{cookie:gymCookie});
   ok('registration-form submit recognizes existing member rather than duplicating',formExisting.res.status===200 && formExistingResult.res.status===200 && formExistingResult.json.status==='present' && formExistingResult.json.memberName==='Existing Via First Form' && !!formExistingCookie && afterFormExisting.json.members.filter(m=>m.phone==='9876543220').length===1,`status=${formExistingResult.res.status}; result=${formExistingResult.json.status}; matching records=${afterFormExisting.json.members.filter(m=>m.phone==='9876543220').length}`);
   const formExistingRepeat=await req(`/api/public/join/${token}`,{cookie:formExistingCookie});
   ok('existing member matched from first form is remembered for next scan',formExistingRepeat.res.status===200 && formExistingRepeat.json.status==='already' && formExistingRepeat.json.recognized===true,`status=${formExistingRepeat.res.status}; result=${formExistingRepeat.json.status}`);

   const directRegistration=await req(`/api/public/join/${token}/register`,{method:'POST',body:{name:'Direct QR New Member',phone:'9876543216',months:3,accept:true}});
   const directCookie=parseCookie(directRegistration.res,`gs_member_${token}`);
   ok('new visitor can register directly without lookup endpoint',directRegistration.res.status===200 && directRegistration.json.status==='registered' && directRegistration.json.attendanceMarked===true && !!directCookie,`status=${directRegistration.res.status}; result=${directRegistration.json.status}; marked=${directRegistration.json.attendanceMarked}`);
   const directRepeat=await req(`/api/public/join/${token}`,{cookie:directCookie});
   ok('directly registered new member is auto-recognized on next scan',directRepeat.res.status===200 && directRepeat.json.status==='already' && directRepeat.json.memberName==='Direct QR New Member',`status=${directRepeat.res.status}; result=${directRepeat.json.status}`);
   const directData=await req('/api/data',{cookie:gymCookie});
   ok('direct QR registration appears once in GymSaathi members and attendance',directData.json.members.filter(m=>m.phone==='9876543216').length===1 && directData.json.attendance.filter(a=>a.phone==='9876543216').length===1,`members=${directData.json.members.filter(m=>m.phone==='9876543216').length}; attendance=${directData.json.attendance.filter(a=>a.phone==='9876543216').length}`);

   const switchMember=await req(`/api/public/join/${token}/logout`,{method:'POST',cookie:memberCookie,body:{}});
   ok('switch member revokes cookie/session',switchMember.res.status===200 && switchMember.json.status==='first_visit' && /Max-Age=0/i.test(switchMember.res.headers.get('set-cookie')||''),`status=${switchMember.res.status}`);
   const afterLogout=await req(`/api/public/join/${token}`,{cookie:memberCookie});
   ok('revoked cookie no longer recognizes member',afterLogout.res.status===200 && afterLogout.json.status==='first_visit',`status=${afterLogout.res.status}`);
   const bad=await req(`/api/public/join/${token}/lookup`,{method:'POST',body:{name:'Wrong Name',phone:'9876543211'}});
   ok('wrong name does not attach existing membership',bad.res.status===200 && bad.json.status==='mismatch',`status=${bad.res.status}; ${bad.json.status}`);
   const newLookup=await req(`/api/public/join/${token}/lookup`,{method:'POST',body:{name:'New QR Person',phone:'9876543212'}});
   ok('unknown phone enters self-registration path',newLookup.res.status===200 && newLookup.json.status==='new',`status=${newLookup.res.status}`);
   const reg=await req(`/api/public/join/${token}/register`,{method:'POST',body:{name:'New QR Person',phone:'9876543212',months:1,gender:'Female',age:24,batch:'Morning',goal:'Fitness',accept:true}});
   const regCookie=parseCookie(reg.res,`gs_member_${token}`);
   ok('QR self-registration creates member + membership + 0 paid + session + attendance',reg.res.status===200 && reg.json.status==='registered' && reg.json.active===true && reg.json.attendanceMarked===true && reg.json.due===500 && !!regCookie,`status=${reg.res.status}; payload=${JSON.stringify(reg.json)}`);
   const regScan=await req(`/api/public/join/${token}`,{cookie:regCookie});
   ok('registered user auto-checks in on next QR scan',regScan.res.status===200 && regScan.json.status==='already' && regScan.json.memberName==='New QR Person',`status=${regScan.res.status}; result=${regScan.json.status}`);
   const duplicateReg=await req(`/api/public/join/${token}/register`,{method:'POST',body:{name:'Second QR Person',phone:'9876543212',months:1,accept:true}});
   ok('duplicate phone registration blocked',duplicateReg.res.status===409,`status=${duplicateReg.res.status}`);
   after=await req('/api/data',{cookie:gymCookie});
   const regMember=after.json.members.find(m=>m.phone==='9876543212');
   ok('new QR person appears in gym database-backed page data',!!regMember && regMember.name==='New QR Person' && regMember.fee===500 && regMember.paid===0 && (after.json.attendance||[]).some(a=>a.id===regMember.id),`found=${!!regMember}; fee=${regMember?.fee}; paid=${regMember?.paid}`);
   const expiredStart='2020-01-01';
   const expiredMember=await req('/api/members',{method:'POST',cookie:gymCookie,body:{name:'Expired QR Person',phone:'9876543213',months:1,paid:0,start:expiredStart}});
   const expiredLookup=await req(`/api/public/join/${token}/lookup`,{method:'POST',body:{name:'Expired QR Person',phone:'9876543213'}});
   const expCookie=parseCookie(expiredLookup.res,`gs_member_${token}`);
   ok('expired membership blocks check-in but identifies member',expiredLookup.res.status===200 && expiredLookup.json.status==='inactive' && !!expCookie,`status=${expiredLookup.res.status}; result=${expiredLookup.json.status}`);
   const expScan=await req(`/api/public/join/${token}`,{cookie:expCookie});
   ok('repeat scan keeps expired member inactive',expScan.res.status===200 && expScan.json.status==='inactive',`result=${expScan.json.status}`);
   after=await req('/api/data',{cookie:gymCookie});
   ok('expired member has no attendance record for today',!(after.json.attendance||[]).some(a=>a.id===expiredMember.json.id),`today attendance=${after.json.attendance?.length}`);
   // Assistant: staff response and new-registration intent, using local fallback (no Gemini API key).
   const chatStaff=await req('/api/chat',{method:'POST',cookie:gymCookie,body:{question:'staff me kon kon h?'}});
   ok('assistant answers staff list from gym settings',chatStaff.res.status===200 && JSON.stringify(chatStaff.json).includes('Rohit Sharma') && JSON.stringify(chatStaff.json).includes('9598908555'),`status=${chatStaff.res.status}; body=${JSON.stringify(chatStaff.json).slice(0,250)}`);
   const chatNew=await req('/api/chat',{method:'POST',cookie:gymCookie,body:{question:'naya member add karo'}});
   ok('assistant “naya member add” starts registration',chatNew.res.status===200 && chatNew.json.start==='register',`status=${chatNew.res.status}; body=${JSON.stringify(chatNew.json)}`);
   // Simulate the voice/text registration turn flow without Gemini; required fields must be acquired and form can complete.
   let turn=await req('/api/register/turn',{method:'POST',cookie:gymCookie,body:{form:{},asked:'',said:'',tries:0,spoken:false}});
   let form=turn.json.form||{}, asked=turn.json.next; const answers={name:'Assistant Member',phone:'9876543214',gender:'skip',age:'skip',weight:'skip',height:'skip',goal:'skip',health:'skip',batch:'skip',pt:'skip',diet:'skip',months:'1',paid:'0'};
   let steps=0;
   while(asked && steps<20){
      const said=answers[asked] ?? 'skip';
      turn=await req('/api/register/turn',{method:'POST',cookie:gymCookie,body:{form,asked,said,tries:0,spoken:false}});
      if(turn.res.status!==200) break;
      form=turn.json.form||form; asked=turn.json.next; steps++;
   }
   ok('assistant registration dialogue reaches review/save confirmation',turn.res.status===200 && turn.json.done===true && turn.json.form?.name==='Assistant Member' && turn.json.form?.months===1 && turn.json.form?.paid===0,`http=${turn.res.status}; steps=${steps}; next=${asked}; response=${JSON.stringify(turn.json).slice(0,240)}`);
   const assistantSaved=await req('/api/members',{method:'POST',cookie:gymCookie,body:{...turn.json.form,fee:turn.json.fee,mode:'Cash'}});
   const assistantAfter=await req('/api/data',{cookie:gymCookie});
   ok('assistant-confirmed member save persists to database-backed member list',assistantSaved.res.status===200 && assistantSaved.json.name==='Assistant Member' && assistantAfter.json.members.some(m=>m.name==='Assistant Member' && m.phone==='9876543214' && m.paid===0),`status=${assistantSaved.res.status}; found=${assistantAfter.json.members.some(m=>m.name==='Assistant Member')}`);
   // Backup data from the gym and daily snapshot/restore via owner routes.
   const backup=await req('/api/backup',{cookie:gymCookie});
   ok('downloadable gym backup includes members and QR attendance',backup.res.status===200 && Array.isArray(backup.json.customers) && Array.isArray(backup.json.memberships) && Array.isArray(backup.json.transactions) && Array.isArray(backup.json.attendance) && backup.json.attendance.length>=2,`status=${backup.res.status}; customers=${backup.json.customers?.length}; attendances=${backup.json.attendance?.length}`);
   await serverMod.daily();
   const backups=await req(`/api/admin/gyms/${gymId}/backups`,{cookie:adminCookie});
   const todayBackup=backups.json.find(b=>b.date===indiaDay());
   ok('daily snapshot stored with today date',backups.res.status===200 && backups.json.length>0 && !!todayBackup,`status=${backups.res.status}; dates=${(backups.json||[]).map(x=>x.date).join(',')}`);
   const snap=await db.find('backups',{_id:`${gymId}:${indiaDay()}`});
   let snapshotData=null; try { snapshotData=JSON.parse(zlib.gunzipSync(Buffer.from(snap[0].data,'base64')).toString()); } catch {}
   ok('automatic snapshot payload contains attendance',!!snapshotData && Array.isArray(snapshotData.attendance),`attendances=${snapshotData?.attendance?.length}`);
   // Now create a post-snapshot member, then restore today's snapshot (isolated test DB only).
   const late=await req('/api/members',{method:'POST',cookie:gymCookie,body:{name:'After Backup Member',phone:'9876543215',months:1,paid:0}});
   const restore=await req(`/api/admin/gyms/${gymId}/backups`,{method:'POST',cookie:adminCookie,body:{date:indiaDay()}});
   const afterRestore=await req('/api/data',{cookie:gymCookie});
   ok('daily backup restore restores attendance and removes post-snapshot member',restore.res.status===200 && !(afterRestore.json.members||[]).some(m=>m.phone==='9876543215') && Array.isArray(afterRestore.json.attendance) && afterRestore.json.attendance.length>=2,`restore=${restore.res.status}; restoredMembers=${restore.json?.members}; attendance=${afterRestore.json.attendance?.length}`);
   const gzipBackup=await req('/api/admin/backup',{cookie:adminCookie});
   let adminBackupJson=null; try { adminBackupJson=JSON.parse(zlib.gunzipSync(Buffer.from(gzipBackup.text,'binary')).toString()); } catch {}
   // Fetch as arrayBuffer to properly parse gzip since text() may alter bytes; redo request explicitly.
   const rawAdmin=await fetch(origin+'/api/admin/backup',{headers:{cookie:adminCookie}}); let parsedAdmin=null; try{ parsedAdmin=JSON.parse(zlib.gunzipSync(Buffer.from(await rawAdmin.arrayBuffer())).toString());}catch{}
   ok('service owner compressed backup includes attendance collection',rawAdmin.status===200 && Array.isArray(parsedAdmin?.attendance),`status=${rawAdmin.status}; attendance rows=${parsedAdmin?.attendance?.length}`);
   // Ensure routes hidden from a public visitor.
   const publicData=await req('/api/data');
   ok('public visitor still cannot read management data',publicData.res.status===401,`status=${publicData.res.status}`);
   const badToken=await req('/join/'+('a'.repeat(48)));
   ok('invalid QR route rejected',badToken.res.status===404,`status=${badToken.res.status}`);
   // backup restore a before-restore snapshot is visible (and can be selected) after restore.
   const backups2=await req(`/api/admin/gyms/${gymId}/backups`,{cookie:adminCookie});
   ok('pre-restore copy is kept for rollback',backups2.res.status===200 && backups2.json.some(b=>b.date==='before restore'),`dates=${backups2.json.map(b=>b.date).join(',')}`);
   // HTTP static assets load.
   const joinjs=await req('/join.js'); const css=await req('/join.css');
   ok('QR page JS/CSS served',joinjs.res.status===200 && joinjs.text.includes('/api/public/join/') && css.res.status===200,`js=${joinjs.res.status}; css=${css.res.status}`);
 } finally {
   srv.close();
 }
 console.log('\nRESULT',checks.filter(x=>x.pass).length,'/',checks.length,'passed');
 console.log(JSON.stringify(checks.filter(x=>!x.pass),null,2));
 if(checks.some(x=>!x.pass)) process.exitCode=1;
}
main().catch(e=>{console.error('FATAL E2E:',e.stack||e);process.exitCode=2;});
