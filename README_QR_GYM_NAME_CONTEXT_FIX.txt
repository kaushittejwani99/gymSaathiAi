GymSaathi QR assistant — gym-name context + clear registration name prompt
===========================================================================

What changed
------------
- The public QR assistant page shows the current gym name in the page header, an explicit registration/check-in context line and the browser tab title.
- The intro tells a first-time visitor that a new member name is stored only after successful registration, so there is no need for their name to already be in the gym's records.
- Existing members are told to use the name they gave when they joined, allowing the name + mobile check to match their existing record and avoid a duplicate.
- The assistant's first spoken/text greeting names the gym.

Patch-only files
----------------
- lib/ai.js
- public/join.html
- public/join.js
- public/join.css
- tests/run_e2e.cjs (updated assertions for this change)
- reports/readmes included for reference

How to apply
------------
This patch assumes the QR AI registration assistant has already been installed in the project. If not, use the accompanying full source ZIP instead.

1. Back up the repository and data.
2. Extract the patch ZIP at the project root, replacing the matching files.
3. Run:
   node --check lib/ai.js
   node --check public/join.js
   node tests/run_e2e.cjs
4. Review `git diff`, then commit/push and wait for Render to deploy.
5. Test on a real phone/staging gym: check that the correct gym name is displayed and spoken; the new-member question explains the name will be saved after registering; existing member name + mobile still matches the old record; and a repeat scan on the same browser does not ask for details again.

Latest local isolated tests: 54/54 E2E assertions, 24/24 QR edge assertions, 50/50 assistant fallback assertions (128/128 total).
Live Render, actual Gemini provider responses and physical-phone visual flow have not been verified here.
