# Cutover: pointing the 833 line at the demo, and back

**Owner only.** (833) 302-8947 is Royal Pawz's live toll-free number. Today its webhook goes to the production SMS service. For the demo window it goes to this agents service, which hands every text without the gate code straight back to production (docs/CONTRACTS.md, "833 gate"). Keep the window short and revert right after.

Nothing in this file contains a secret or the production URL. `$PROD` below is the value of `PROD_SMS_WEBHOOK_URL` in your private `.env`.

## Before
1. The agents service runs on its always-on host, or on a laptop behind ngrok, with these set:
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER=+18333028947`
   - `TWILIO_VALIDATE_SIGNATURE=true`
   - `PUBLIC_AGENTS_URL=<its public https URL>`
   - `AI_GATE_CODE`, `PROD_SMS_WEBHOOK_URL`, `OWNER_PHONE`
   - `LLM_FAKE=false`
2. `curl $PUBLIC_AGENTS_URL/health` returns `{"ok":true}`.
3. `python -m agents.tests.test_gate` passes.
4. Record the number's current settings. You restore exactly these later.

```bash
export SID=... TOKEN=...          # Twilio account SID and auth token
curl -s -u "$SID:$TOKEN" "https://api.twilio.com/2010-04-01/Accounts/$SID/IncomingPhoneNumbers.json?PhoneNumber=%2B18333028947" \
  | python3 -c 'import json,sys; n=json.load(sys.stdin)["incoming_phone_numbers"][0]; print(n["sid"], n["sms_url"], n["sms_fallback_url"], sep="\n")'
```

As of 2026-09-19:
- `sms_url` was `$PROD`, the production `/webhooks/twilio/incoming`.
- `sms_fallback_url` was production's `/webhooks/twilio/status`. That fallback looks like a misconfiguration, but restore it as-is; fixing it is a separate change.

## Cut over
```bash
export PN=PN...                    # the sid printed above
curl -s -u "$SID:$TOKEN" "https://api.twilio.com/2010-04-01/Accounts/$SID/IncomingPhoneNumbers/$PN.json" \
  --data-urlencode "SmsUrl=$PUBLIC_AGENTS_URL/sms" -d SmsMethod=POST \
  --data-urlencode "SmsFallbackUrl=$PROD" -d SmsFallbackMethod=POST
```

The fallback is production itself. If the demo service is down, slow, or answers 5xx, Twilio delivers straight to production.

## Test, in this order
1. **A phone that is not a tester** texts "test". It shows up in the rp-admin SMS inbox, and nothing appears in the demo's Inbox panel. The agents log says `gate: forwarded, production answered 200`. **If this fails, roll back now.**
2. **A tester phone** texts `<AI_GATE_CODE> hi`. An AI reply arrives within about 20 seconds, and the Inbox panel shows the thread.
3. The tester texts `EXIT` and gets "You're back with the Royal Pawz team…".

## Roll back (right after the demo)
```bash
curl -s -u "$SID:$TOKEN" "https://api.twilio.com/2010-04-01/Accounts/$SID/IncomingPhoneNumbers/$PN.json" \
  --data-urlencode "SmsUrl=<recorded sms_url>" -d SmsMethod=POST \
  --data-urlencode "SmsFallbackUrl=<recorded sms_fallback_url>" -d SmsFallbackMethod=POST
```
Run the GET from "Before" step 4 again and confirm both URLs match what you recorded. Then text "test" from a non-tester phone and check that it reaches the rp-admin inbox.

## Known risks while live
- **Every real customer text passes through the demo host.** If the host is slow, their texts are delayed, not lost.
- **A text can be delivered twice.** If a forward to production takes longer than Twilio's timeout (about 15 s), Twilio also calls the fallback, and production can see that text twice. The gate gives up after 8 s to keep this rare.
- **A tester who texts a bare `STOP` or `CANCEL`** is opted out by Twilio itself. The agent's replies then fail until they text `START`.
- **The demo service runs with the production Twilio token.** Keep that host's env private, and do not give the token to teammates. They develop without it.
