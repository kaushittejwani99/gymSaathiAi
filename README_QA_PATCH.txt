GymSaathi QR First-Scan Registration Fix
=======================================

Read README_QR_FIRST_SCAN.txt for the new intended flow, secure session design, complete install instructions and limitations.
Read QR_FIRST_SCAN_CHANGE_REPORT.txt for the latest local QA result.

Latest local QA after this change (after adding QR AI assistant conversation tests):
- tests/run_e2e.cjs: 53/53 passed
- tests/test_qr_edges.cjs: 24/24 passed
- tests/test_50_assistant.cjs: 50/50 passed (local fallback; no Gemini API key)
- Aggregate: 127/127 automated assertions passed in the isolated local environment.

Production/live Render, real phone camera, MongoDB Atlas, real Gemini, and Meta WhatsApp API are not tested by this local harness. Chromium browser smoke testing was attempted but blocked by the environment browser policy; public flow is verified with the local HTTP/API harness rather than a real visual browser interaction.
