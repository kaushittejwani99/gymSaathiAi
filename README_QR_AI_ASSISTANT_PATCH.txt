GymSaathi QR AI Registration Assistant — Patch-only package
==========================================================

WHAT THIS CHANGES
-----------------
- On the first QR scan without a remembered device session, the public page opens a chat-style AI registration assistant when at least one plan price is configured.
- The assistant visibly names the target gym in the QR page, assistant context line and browser title, so members can confirm which gym they are registering with. The assistant speaks the gym name in its opening message where available.
- The first name question explicitly explains that new members do not need to already exist in the gym records; the name is saved only after registration. Existing members are asked to use the name they gave previously so the same record can be matched.
- The assistant asks name and mobile first. If these match an existing member in that gym, it marks attendance (only if the membership is active), remembers the device, and does not create a duplicate.
- If the number is new, the assistant gathers the registration details one at a time, supports typed replies and speech input in compatible browsers, shows a review summary, then saves the member with ₹0 paid and marks first-day attendance if active.
- Subsequent scans in the same browser use the secure HttpOnly gym-scoped cookie and do not ask for name/mobile again. Same-day duplicate attendance is prevented.
- Public AI assistant requests are rate-limited and the unauthenticated assistant is not given the gym's member list.

FILES IN THIS PATCH ZIP
-----------------------
Copy the files and paths into the same paths in your project root:
- server.js
- lib/ai.js
- public/app.js
- public/join.html
- public/join.js
- public/join.css
- tests/run_e2e.cjs
- tests/test_qr_edges.cjs
- tests/test_50_assistant.cjs
- README_QR_FIRST_SCAN.txt
- README_QA_PATCH.txt
- QR_FIRST_SCAN_CHANGE_REPORT.txt
- GymSaathi_50_Assistant_Test_Results.json
- GymSaathi_QR_Edge_Test_Results.json

INSTALL SAFELY
--------------
1. Back up the project, current production data/backups and environment settings first. Never commit `.env`.
2. Apply this patch to a new Git branch or staging copy, replacing only the listed matching files; it is a patch-only archive and intentionally does not include `lib/core.js`, `lib/db.js`, `lib/cache.js`, `lib/sample.js`, `lib/whatsapp.js`, `lib/xlsx.js`, or `public/styles.css`.
3. From the project root, run:
     node --check server.js
     node --check lib/ai.js
     node --check public/app.js
     node --check public/join.js
     node tests/run_e2e.cjs
     node tests/test_qr_edges.cjs
     node tests/test_50_assistant.cjs
4. Review `git diff` before committing. Suggested commands:
     git add server.js lib/ai.js public/app.js public/join.html public/join.js public/join.css tests/run_e2e.cjs tests/test_qr_edges.cjs tests/test_50_assistant.cjs
     git commit -m "Open AI registration assistant from QR scan"
     git push origin main
5. Let Render deploy. Test on a staging gym and a real phone before relying on it in production.

LOCAL QA
--------
- QR/core integration: 54/54 passed.
- QR edge cases: 24/24 passed.
- 50 assistant response assertions: 50/50 passed with local fallback (no Gemini key).
- Total: 128/128 isolated automated assertions passed.
- Live Render, production MongoDB, real Gemini API, WhatsApp sending and a physical phone were not tested. A headless Chromium smoke attempt was blocked by the local environment's administrator policy, so no real visual browser-interaction test is claimed.

SECURITY LIMITATION
-------------------
First-time member verification is based on matching name + mobile, not OTP. Someone who knows both could try to bind a new device. For stronger identity proof, add SMS/WhatsApp OTP or a staff-issued activation code.
