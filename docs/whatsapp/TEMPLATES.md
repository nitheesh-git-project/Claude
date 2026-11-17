# WhatsApp: going live

WhatsApp messages are **built and switched off**. Nothing is sent until every
step below is done. The code is `src/lib/whatsappRules.ts` (who gets what),
`src/lib/whatsappTemplates.ts` (the wording), `src/lib/whatsappServer.ts`
(sending) and `src/app/api/whatsapp/webhook/route.ts` (STOP replies).

## 1. Meta Business account (needs the company registration)

1. Create a Meta Business account for the clinic at business.facebook.com and
   complete **business verification** (company registration documents).
2. In WhatsApp Manager, add a **phone number that is not used on any WhatsApp
   app** (the business number). Verify it by SMS or call.
3. Create a **System User** with a permanent access token that has the
   `whatsapp_business_messaging` permission. That token is the server's
   `WHATSAPP_ACCESS_TOKEN`; the number's ID is `WHATSAPP_PHONE_NUMBER_ID`.

## 2. Templates to submit

Submit each one under **exactly** this name, category **Utility**, language
**English**. Approval usually takes minutes to a day. Changing a body means a
new approval, so the names carry a version (`_v1`). Generated from
`whatsappTemplates.ts`; the unit tests keep the two in step.

### `mr_booking_confirmed_v1`

- **Category:** Utility
- **Language:** English (`en`)
- **Body:**

  > Hello {{1}}, your {{2}} on {{3}} with {{4}} is confirmed. {{5}} You can join or manage it from your dashboard: {{6}} See you then.

- **Samples (one per variable):**

  1. first name: Asha
  2. session type: 45-minute video session
  3. date and time: 24 Nov 2026, 6:00 pm IST
  4. physiotherapist: Dr. Meera
  5. payment line: Paid: ₹499.
  6. dashboard link: https://moverestorephysio.com/patient/dashboard

### `mr_booking_received_v1`

- **Category:** Utility
- **Language:** English (`en`)
- **Body:**

  > Hello {{1}}, we have your booking for a {{2}} on {{3}}. We are matching you with a physiotherapist and will message you as soon as they are confirmed. Your dashboard: {{4}} Thank you.

- **Samples (one per variable):**

  1. first name: Asha
  2. session type: 45-minute video session
  3. date and time: 24 Nov 2026, 6:00 pm IST
  4. dashboard link: https://moverestorephysio.com/patient/dashboard

### `mr_booking_cancelled_v1`

- **Category:** Utility
- **Language:** English (`en`)
- **Body:**

  > Hello {{1}}, your {{2}} on {{3}} has been cancelled. {{4}} You can book again from your dashboard: {{5}} Thank you.

- **Samples (one per variable):**

  1. first name: Asha
  2. session type: video session
  3. date and time: 24 Nov 2026, 6:00 pm IST
  4. refund line: A refund of ₹499 is on its way; banks usually take 5 to 7 working days.
  5. dashboard link: https://moverestorephysio.com/patient/dashboard

### `mr_reminder_tomorrow_v1`

- **Category:** Utility
- **Language:** English (`en`)
- **Body:**

  > Hello {{1}}, a reminder that your {{2}} is tomorrow, {{3}}. {{4}} Your dashboard: {{5}} See you then.

- **Samples (one per variable):**

  1. first name: Asha
  2. session type: video session
  3. date and time: 24 Nov 2026, 6:00 pm IST
  4. how it works: The Join button appears on your dashboard shortly before the start.
  5. dashboard link: https://moverestorephysio.com/patient/dashboard

### `mr_reminder_soon_v1`

- **Category:** Utility
- **Language:** English (`en`)
- **Body:**

  > Hello {{1}}, your {{2}} starts in about an hour, at {{3}}. {{4}} Your dashboard: {{5}} See you soon.

- **Samples (one per variable):**

  1. first name: Asha
  2. session type: video session
  3. time: 24 Nov 2026, 6:00 pm IST
  4. how it works: The Join button appears on your dashboard shortly before the start.
  5. dashboard link: https://moverestorephysio.com/patient/dashboard
## 3. Webhook (for STOP replies)

In the Meta app's WhatsApp settings, set the callback URL to
`https://<your-domain>/api/whatsapp/webhook`, the verify token to the value
you put in `WHATSAPP_VERIFY_TOKEN` (any long random string), and subscribe to
**messages**. The app secret (App settings -> Basic) is `WHATSAPP_APP_SECRET`.

## 4. Server variables (Vercel, Production and Preview)

| Variable | What |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | The System User's permanent token. Secret. |
| `WHATSAPP_PHONE_NUMBER_ID` | The business number's ID from WhatsApp Manager. |
| `WHATSAPP_APP_SECRET` | The Meta app's secret, to check webhook signatures. Secret. |
| `WHATSAPP_VERIFY_TOKEN` | Any long random string, also typed into the webhook settings. |
| `WHATSAPP_GRAPH_VERSION` | Optional; defaults to `v21.0`. |

Redeploy after setting them. Patients then see **WhatsApp messages** on their
profile, and can say yes.

## 5. Switch on, carefully

1. **Settings -> WhatsApp**: set **Test mode** to your own number, then switch
   **Send WhatsApp messages** on.
2. On your own patient test account (with a real email, not `@example.test`),
   say yes on the profile and book a session. The message arrives on the test
   number; **Last 100 messages** shows it.
3. Turn test mode off. From now on, patients who said yes get messages.

Costs: Meta charges per business-started message (Utility category in India
is a small amount each). The log on Settings -> WhatsApp is the count.
