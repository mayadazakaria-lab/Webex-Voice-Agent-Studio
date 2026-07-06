---
name: Twilio account has no phone numbers
description: The Twilio account behind TWILIO_* secrets owns zero incoming phone numbers; TWILIO_PHONE_NUMBER is not in the account.
---

The rule: don't assume `TWILIO_PHONE_NUMBER` (+1844...) is usable for inbound voice/SMS webhooks — as of July 2026 the account (Full/active, no subaccounts with numbers) owns **zero** incoming phone numbers, so `incomingPhoneNumbers.list({ phoneNumber })` returns empty and webhook assignment fails with 404.

**Why:** Discovered while building the phone-call-an-agent feature; the assignment endpoint reached Twilio successfully but no number could be configured. The account only has one verified outbound caller ID (+1919...).

**How to apply:** Any inbound-call/SMS feature needs the user to buy/claim a number in their Twilio console first, then update the `TWILIO_PHONE_NUMBER` secret. The app's Phone Line card surfaces the exact error when this is still unresolved.
