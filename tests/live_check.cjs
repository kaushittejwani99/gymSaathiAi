// Checks the real Gemini key in .env: node tests/live_check.cjs
// Two short requests to Gemini. No database is touched and nothing goes to WhatsApp.
// For MongoDB run `node test.js mongo`: it works in a database of its own (gymsaathi_test) and drops it at the end.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const env = path.join(__dirname, '..', '.env');
if (fs.existsSync(env)) process.loadEnvFile(env);
const G = require('../lib/core');
const ai = require('../lib/ai');

(async () => {
  if (!ai.aiEnabled()) throw new Error('GEMINI_API_KEY is not set in .env');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const gym = { name: 'Live Check Gym', price1: 1000, price3: 2700 };
  const db = { gym, payments: [], deleted: [], members: [{ id: 'a', name: 'Rahul Sharma', phone: '9829011111', months: 1, start: today, end: G.endOf(today, 1), fee: 1000, paid: 600, joinedAt: today }] };
  // A failed call is logged by ai.js as "Gemini request failed: <status> <reason>" and the answer comes back 'local'
  const chat = await ai.chat({ question: 'rahul ki fees aur membership ka poora hisaab batao', db, today });
  console.log(chat.mode === 'ai' ? 'ok  ' : 'FAIL', 'question answered by', chat.mode, '-', chat.answer.split('\n')[0]);
  const reg = await ai.turn({ gym, form: {}, asked: 'name', said: 'inka naam priya jain hai, 24 saal ki hain aur wazan 58 kilo hai' });
  console.log(reg.form.age === 24 && reg.form.weight === 58 ? 'ok  ' : 'FAIL', 'registration sentence read as', JSON.stringify(reg.form));
  if (chat.mode !== 'ai' || reg.form.age !== 24) process.exitCode = 1;
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
