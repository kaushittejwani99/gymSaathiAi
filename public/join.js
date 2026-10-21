'use strict';
(() => {
  const token = window.location.pathname.split('/').filter(Boolean).at(-1) || '';
  const $ = (selector) => document.querySelector(selector);
  const panels = ['#assistantPanel', '#lookupPanel', '#successPanel'];
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let gym = null;
  let plans = [];
  let extras = { pt: 0, diet: 0 };
  let turnState = { form: {}, asked: '', tries: 0, fee: 0, identityChecked: false, blocked: false };
  let busy = false;
  let recognition = null;
  let synth = window.speechSynthesis || null;
  const money = (amount) => `₹${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const visible = (selector) => { for (const panel of panels) $(panel).hidden = panel !== selector; };
  const notice = (message, good = false) => {
    const el = $('#notice');
    el.textContent = message;
    el.classList.toggle('success', good);
    el.hidden = !message;
  };
  async function request(path = '', body, method = 'GET') {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let response;
    try { response = await fetch(`/api/public/join/${token}${path}`, options); }
    catch { throw Object.assign(new Error('Server se connect nahi ho paya. Internet check karke dobara try karein.'), { network: true }); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request complete nahi ho payi. Dobara try karein.');
    return data;
  }
  const setBusy = (value) => {
    busy = value;
    $('#sendButton').disabled = value;
    $('#confirmButton').disabled = value;
    $('#replyInput').disabled = value;
    $('#micButton').disabled = value || !SpeechRecognition;
    $('#skipButton').disabled = value;
    $('#lookupButton').disabled = value;
  };
  const value = (form, key) => String(new FormData(form).get(key) || '').trim();
  const validPhone = (phone) => {
    const digits = phone.replace(/\D/g, '').replace(/^(0|91|0091)(?=\d{10}$)/, '');
    return /^[6-9]\d{9}$/.test(digits) ? digits : '';
  };
  function addMessage(text, who = 'assistant', speak = false) {
    const log = $('#chatLog');
    const item = document.createElement('div');
    item.className = `chat-msg ${who}`;
    item.textContent = text;
    log.append(item);
    log.scrollTop = log.scrollHeight;
    if (speak && who === 'assistant') sayAloud(text);
    return item;
  }
  function sayAloud(text) {
    if (!synth || !text || !text.trim()) return;
    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/[*_]/g, ''));
      utterance.lang = /[\u0900-\u097F]/.test(text) ? 'hi-IN' : 'en-IN';
      utterance.rate = 0.96;
      synth.speak(utterance);
    } catch { /* Text chat remains available if speech synthesis is unsupported. */ }
  }
  function showSuccess(title, message, fee) {
    visible('#successPanel');
    notice('', true);
    $('#successTitle').textContent = title;
    $('#successMessage').textContent = message;
    const feeLine = $('#feeLine');
    feeLine.hidden = fee == null;
    feeLine.textContent = fee == null ? '' : `Membership fee: ${money(fee)} · Payment not recorded`;
    $('#switchMemberButton').hidden = false;
  }
  function setButtonsForQuestion() {
    const required = ['name', 'phone', 'months', 'paid'].includes(turnState.asked);
    $('#skipButton').hidden = !turnState.asked || required || turnState.blocked;
    $('#restartButton').hidden = !turnState.blocked;
    $('#manualVerifyButton').hidden = turnState.blocked;
    $('#replyInput').disabled = turnState.blocked || busy;
    $('#sendButton').disabled = turnState.blocked || busy;
    $('#micButton').disabled = turnState.blocked || busy || !SpeechRecognition;
  }
  const optionalLabel = (key) => ({
    gender: 'Gender', age: 'Age', weight: 'Weight', height: 'Height', goal: 'Fitness goal',
    health: 'Health notes', batch: 'Preferred batch', pt: 'Personal trainer', diet: 'Diet plan',
  }[key] || key);
  function renderReview() {
    const form = turnState.form;
    const plan = plans.find((item) => item.months === Number(form.months));
    const rows = [
      ['Name', form.name], ['Mobile', form.phone], ['Gender', form.gender], ['Age', form.age],
      ['Weight', form.weight ? `${form.weight} kg` : ''], ['Height', form.height], ['Fitness goal', form.goal],
      ['Health notes', form.health], ['Batch', form.batch], ['Personal trainer', !extras.pt ? '' : form.pt ? 'Yes' : (form.pt === false ? 'No' : '')],
      ['Diet plan', !extras.diet ? '' : form.diet ? 'Yes' : (form.diet === false ? 'No' : '')], ['Membership plan', plan ? plan.label : `${form.months} months`],
    ].filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '');
    const summary = $('#reviewSummary');
    summary.replaceChildren();
    for (const [label, val] of rows) {
      const row = document.createElement('div'); row.className = 'review-row';
      const name = document.createElement('span'); name.textContent = label;
      const valueEl = document.createElement('strong'); valueEl.textContent = String(val);
      row.append(name, valueEl); summary.append(row);
    }
    const fee = document.createElement('div'); fee.className = 'review-row total';
    const feeLabel = document.createElement('span'); feeLabel.textContent = 'Membership fee';
    const feeValue = document.createElement('strong'); feeValue.textContent = money(turnState.fee);
    fee.append(feeLabel, feeValue); summary.append(fee);
    const due = document.createElement('div'); due.className = 'review-row';
    const dueLabel = document.createElement('span'); dueLabel.textContent = 'Paid now / due';
    const dueValue = document.createElement('strong'); dueValue.textContent = `${money(0)} paid · ${money(turnState.fee)} pending`;
    due.append(dueLabel, dueValue); summary.append(due);
    $('#reviewPanel').hidden = false;
    $('#confirmButton').disabled = false;
  }
  // Called with the form as the latest turn left it, before turnState moves on: if the lookup fails, the same answer can
  // simply be sent again.
  async function checkExistingAfterIdentity(form) {
    if (turnState.identityChecked || !form.name || !validPhone(String(form.phone || ''))) return null;
    const result = await request('/lookup', { name: form.name, phone: form.phone }, 'POST');
    turnState.identityChecked = true;
    if (result.status === 'present' || result.status === 'already') {
      showSuccess(result.status === 'present' ? 'Attendance marked' : 'Already checked in', `${result.memberName ? `Namaste ${result.memberName}. ` : ''}${result.message || 'Aaj ki attendance confirm ho gayi.'}`, null);
      return 'finished';
    }
    if (result.status === 'inactive') {
      showSuccess('Membership active nahi hai', `${result.memberName ? `Namaste ${result.memberName}. ` : ''}${result.message}`, null);
      return 'finished';
    }
    if (result.status === 'mismatch') {
      turnState.blocked = true;
      notice(result.message || 'Yeh mobile number pehle se registered hai, lekin naam match nahi hua. Registered naam ke saath dobara shuru karein.');
      addMessage('Yeh mobile number is gym mein pehle se registered hai, lekin naam match nahi hua. “Start again” dabakar wahi naam batayein jo gym ke record mein hai.', 'system');
      setButtonsForQuestion();
      return 'blocked';
    }
    return null; // new mobile: continue the conversational registration
  }
  async function askAssistant(said, spoken = false, showUser = true) {
    const text = String(said || '').trim();
    if (busy || turnState.blocked) return;
    if (showUser && !text) return;
    if (showUser) addMessage(text, 'user');
    setBusy(true);
    $('#voiceStatus').textContent = spoken ? 'Aapka jawab process ho raha hai…' : 'Assistant soch raha hai…';
    try {
      let result = await request('/assistant-turn', {
        form: turnState.form, asked: turnState.asked, said: text, tries: turnState.tries, spoken,
      }, 'POST');
      if (result.setup) { // result.say is written for the gym owner, not for a member
        notice('Is gym mein abhi naya registration band hai. Existing member apna naam aur mobile verify karke check-in kar sakte hain, ya gym desk se baat karein.');
        visible('#lookupPanel');
        return;
      }
      if (result.echo) {
        $('#voiceStatus').textContent = 'Awaaz clear nahi aayi. Dobara boliye ya type karein.';
        turnState.form = result.form || turnState.form;
        turnState.asked = result.next || turnState.asked;
        turnState.tries = result.tries || 0;
        return true;
      }
      // QR self-registration never accepts or records payment. Internally answer the staff-registration turn as ₹0 paid.
      if (result.next === 'paid' && !result.done && !result.cancel) {
        result = await request('/assistant-turn', {
          form: { ...(result.form || {}), paid: 0 }, asked: 'paid', said: '0', tries: 0, spoken: false,
        }, 'POST');
      }
      // Existing members complete only name + mobile: the matching record gets attendance; no duplicate member is created.
      const checked = result.cancel ? null : await checkExistingAfterIdentity(result.form || {});
      if (checked) { $('#voiceStatus').textContent = 'Check-in result received.'; return true; }
      notice('');
      turnState.form = result.form || {};
      turnState.asked = result.next || '';
      turnState.tries = result.tries || 0;
      turnState.fee = Number(result.fee) || 0;
      if (result.cancel) {
        $('#reviewPanel').hidden = true;
        turnState.blocked = true;
        addMessage(result.say || 'Registration cancel kar di gayi.', 'assistant', true);
        $('#voiceStatus').textContent = 'Registration paused. Start again to begin another time.';
        setButtonsForQuestion();
        return true;
      }
      if (result.say) addMessage(result.say, 'assistant', true);
      if (result.done) {
        turnState.asked = '';
        $('#voiceStatus').textContent = 'Details ready. Review them before registration.';
        renderReview();
      } else {
        $('#reviewPanel').hidden = true;
        $('#voiceStatus').textContent = SpeechRecognition ? 'Type your reply or tap Speak.' : 'Speech input is not available in this browser; you can type your reply.';
      }
      setButtonsForQuestion();
      $('#replyInput').focus();
      return true;
    } catch (error) {
      notice(error.message);
      $('#voiceStatus').textContent = 'Request failed. Aap dobara try kar sakte hain.';
      return false;
    } finally {
      setBusy(false);
      setButtonsForQuestion();
    }
  }
  async function startAssistant() {
    turnState = { form: {}, asked: '', tries: 0, fee: 0, identityChecked: false, blocked: false };
    $('#chatLog').replaceChildren();
    $('#reviewPanel').hidden = true;
    $('#restartButton').hidden = true;
    $('#skipButton').hidden = true;
    $('#manualVerifyButton').hidden = false;
    visible('#assistantPanel');
    notice('');
    $('#voiceStatus').textContent = 'Starting assistant…';
    await askAssistant('', false, false);
  }
  $('#replyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('#replyInput');
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    if (!(await askAssistant(text, false, true))) input.value = text; // not sent: the answer stays to send again
  });
  $('#skipButton').addEventListener('click', async () => { if (!busy && !turnState.blocked) await askAssistant('skip', false, true); });
  $('#restartButton').addEventListener('click', async () => { await startAssistant(); });
  $('#editButton').addEventListener('click', async () => { await startAssistant(); });
  $('#manualVerifyButton').addEventListener('click', () => { visible('#lookupPanel'); notice('Apna registered full name aur mobile number enter karein.'); });
  $('#backToAssistantButton').addEventListener('click', () => { visible('#assistantPanel'); notice('Registration assistant se baat jaari rakhein.'); $('#replyInput').focus(); });
  $('#confirmButton').addEventListener('click', async () => {
    if (busy) return;
    const form = turnState.form;
    if (!form.name || !validPhone(String(form.phone || ''))) return notice('Naam aur valid mobile number dobara enter karein. Start again dabayein.');
    setBusy(true);
    notice('Registration save ho rahi hai…', true);
    try {
      const result = await request('/register', {
        name: form.name, phone: form.phone, months: Number(form.months), gender: form.gender || '', age: form.age ?? '',
        weight: form.weight ?? '', height: form.height || '', goal: form.goal || '', health: form.health || '', batch: form.batch || '',
        pt: form.pt === true, diet: form.diet === true, accept: true,
      }, 'POST');
      if (result.status === 'present' || result.status === 'already') {
        showSuccess(result.status === 'present' ? 'Attendance marked' : 'Already checked in', `${result.memberName ? `Namaste ${result.memberName}. ` : ''}${result.message || 'Aaj ki attendance confirm ho gayi.'}`, null);
      } else if (result.status === 'inactive') {
        showSuccess('Membership active nahi hai', `${result.memberName ? `Namaste ${result.memberName}. ` : ''}${result.message}`, null);
      } else {
        showSuccess('Registration complete', result.message || 'Member registration save ho gayi. Aaj ki attendance status upar diya hai.', result.fee);
      }
    } catch (error) {
      notice(error.message);
      addMessage(error.message, 'system');
    } finally { setBusy(false); }
  });
  $('#lookupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    notice('');
    const form = event.currentTarget;
    const name = value(form, 'name');
    const phone = validPhone(value(form, 'phone'));
    if (!name) return notice('Apna registered full name enter karein.');
    if (!phone) return notice('Valid 10-digit Indian mobile number enter karein.');
    setBusy(true);
    try {
      const result = await request('/lookup', { name, phone }, 'POST');
      if (result.status === 'present' || result.status === 'already') {
        showSuccess(result.status === 'present' ? 'Attendance marked' : 'Already checked in', `${result.memberName ? `Namaste ${result.memberName}. ` : ''}${result.message || 'Aaj ki attendance confirm ho gayi.'}`, null);
      } else if (result.status === 'inactive') {
        showSuccess('Membership active nahi hai', `${result.memberName ? `Namaste ${result.memberName}. ` : ''}${result.message}`, null);
      } else if (result.status === 'mismatch') {
        notice(result.message || 'Name aur mobile number match nahi hua.');
      } else if (!plans.length) {
        notice('Is mobile number se koi member nahi mila, aur is gym mein abhi naya registration band hai. Gym desk se baat karein.');
      } else {
        visible('#assistantPanel');
        turnState = { form: { name, phone }, asked: 'gender', tries: 0, fee: 0, identityChecked: true, blocked: false };
        addMessage('Is mobile number se member nahi mila. Chaliye registration complete karte hain.', 'assistant', true);
        addMessage('Gender batayein, ya Skip this question dabayein.', 'assistant', true);
        $('#skipButton').hidden = false;
      }
    } catch (error) { notice(error.message); }
    finally { setBusy(false); }
  });
  $('#switchMemberButton').addEventListener('click', async () => {
    const button = $('#switchMemberButton'); button.disabled = true;
    try {
      await request('/logout', {}, 'POST');
      turnState = { form: {}, asked: '', tries: 0, fee: 0, identityChecked: false, blocked: false };
      await startAssistant();
    } catch (error) { notice(error.message); }
    finally { button.disabled = false; }
  });
  if (SpeechRecognition) {
    $('#micButton').disabled = false;
    $('#micButton').addEventListener('click', () => {
      if (busy || turnState.blocked) return;
      if (synth) { try { synth.cancel(); } catch {} }
      if (recognition) { try { recognition.stop(); } catch {} }
      recognition = new SpeechRecognition();
      recognition.lang = 'hi-IN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
      $('#voiceStatus').textContent = 'Sun raha hoon… ab apna jawab boliye.';
      $('#micButton').textContent = '🎙 Listening…';
      recognition.onresult = async (event) => {
        const spoken = event.results?.[0]?.[0]?.transcript || '';
        $('#micButton').textContent = '🎙 Speak';
        $('#replyInput').value = spoken;
        await askAssistant(spoken, true, true);
        $('#replyInput').value = '';
      };
      recognition.onerror = (event) => {
        $('#micButton').textContent = '🎙 Speak';
        $('#voiceStatus').textContent = event.error === 'not-allowed' ? 'Microphone permission allow karein; ya reply type karein.' : 'Awaaz clear nahi aayi. Dobara try karein ya type karein.';
      };
      recognition.onend = () => { $('#micButton').textContent = '🎙 Speak'; };
      try { recognition.start(); } catch { $('#voiceStatus').textContent = 'Mic start nahi hua. Reply type karein.'; }
    });
  } else {
    $('#micButton').disabled = true;
    $('#voiceStatus').textContent = 'Voice input is not available in this browser. Text replies still work.';
  }

  async function start() {
    if (!/^[a-f0-9]{48}$/.test(token)) throw new Error('This QR link is not valid. Please ask gym staff for the correct code.');
    const result = await request();
    gym = result.gym;
    plans = Array.isArray(result.plans) ? result.plans : [];
    extras = result.extras || extras;
    const gymName = String(gym.name || '').trim() || 'GymSaathi';
    $('#gymName').textContent = gymName;
    document.title = `${gymName} — Registration & Attendance | GymSaathi`;
    $('#assistantGymContext').textContent = `Registration / check-in at ${gymName}`;
    $('#assistantIntro').textContent = `Namaste! Aap ${gymName} mein registration ya check-in kar rahe hain. Agar aap naye member hain, to naam abhi batayein—registration complete hone ke baad hi yeh gym ke record mein save hoga. Agar aap pehle se member hain, to wahi naam batayein jo aapne membership lete waqt diya tha. Main ek-ek karke details poochunga; aap type kar sakte hain ya mic se bol sakte hain.`;
    const details = [gym.timings, gym.amenities].filter(Boolean).join(' · ');
    $('#gymDetails').textContent = details || 'Member registration and check-in';
    if (result.status === 'present' || result.status === 'already') {
      showSuccess(result.status === 'present' ? 'Attendance marked' : 'Already checked in', `${result.memberName ? `Namaste ${result.memberName}. ` : ''}${result.message}`, null);
      return;
    }
    if (result.status === 'inactive') {
      showSuccess('Membership active nahi hai', `${result.memberName ? `Namaste ${result.memberName}. ` : ''}${result.message}`, null);
      return;
    }
    if (result.canRegister && plans.length) {
      await startAssistant();
    } else {
      visible('#lookupPanel');
      notice('New registration ke liye gym ki membership fee set honi zaroori hai. Existing members yahan apna registered naam aur mobile verify kar sakte hain.');
    }
  }
  start().catch((error) => {
    panels.forEach((selector) => { $(selector).hidden = true; });
    $('#gymName').textContent = error.network ? 'No connection' : 'QR link unavailable';
    $('#gymDetails').textContent = '';
    notice(error.message);
  });
})();
