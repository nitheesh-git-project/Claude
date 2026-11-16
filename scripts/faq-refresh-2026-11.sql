-- FAQ refresh, November 2026: plainer wording for every published
-- question, and new ones people actually ask.
--
-- Run once in the Supabase SQL editor (production, then any other project
-- whose /faq should match). Safe to run twice: it upserts by id.
--   * The 27 questions already published keep their row (same id) and get
--     the simpler wording and a new position. Nothing is deleted.
--   * The new questions get fixed ids, so a second run updates them rather
--     than adding copies.
-- After this, Admin -> Settings -> FAQ edits them as usual. The home-visit
-- coverage answer is not a row: /faq builds it from the live service areas.
-- No price, hour count or other figure is typed into an answer on purpose;
-- those are admin settings and a typed number goes stale.

begin;

insert into faqs (id, question, answer, display_order, active)
values
  ('ac0e638d-30ca-4bb6-bda1-e0fc74ae801e'::uuid, 'What physiotherapy services do you offer?', 'Video sessions with a physiotherapist, and home visits in the areas we cover. After your first session, your physiotherapist may suggest a treatment programme, exercises or follow-up sessions.', 10, true),
  ('1603bc98-c7f9-4000-bc9f-b44fa52b0472'::uuid, 'What problems can physiotherapy help with?', 'Back and neck pain, joint problems, sports injuries, stiffness, trouble moving, and recovery after surgery, among others. Pick the closest match when you book. Your physiotherapist will tell you if we are the right fit.', 20, true),
  ('5b2688f5-e4e7-45c1-a562-e8fbbbc200cc'::uuid, 'How does online physiotherapy work?', 'You meet your physiotherapist on a video call. They ask about your pain and your health, watch you do a few movements, and show you the right exercises. Your plan is adjusted in later sessions as you improve.', 30, true),
  ('3a7d5917-c258-41ac-bbdb-ab4e234fc235'::uuid, 'Is online physiotherapy right for everyone?', 'Not always. Your physiotherapist will tell you honestly if you need a home visit, an in-person check, or to see a doctor first.', 40, true),
  ('76a79c57-8672-5eb5-b9e7-608c63cdb604'::uuid, 'Can older parents or children have sessions?', 'Yes. Many of our patients are older adults. A family member can sit beside them to help with the camera and the movements. For a child, a parent should always be there.', 50, true),
  ('ce2a92a1-a847-5f4b-97c2-61566139c029'::uuid, 'Who are your physiotherapists?', 'Every physiotherapist is licensed, and our team checks their qualifications before they can see patients. You can meet the team on our Team page.', 60, true),
  ('e03b064a-c1a5-56c5-aa8f-32ead4c33603'::uuid, 'Is this for emergencies?', 'No. If you have had a bad fall, sudden weakness or numbness, chest pain, or pain that is quickly getting worse, call emergency services or go to a hospital straight away.', 70, true),
  ('23e975e1-872a-4cb9-bbe0-4045639d12bd'::uuid, 'How do I book a session?', 'Sign up or log in, choose what you need help with and the type of session, pick a time, and pay. Your booking then shows in your dashboard. Check its status there: a requested booking is not confirmed yet.', 80, true),
  ('2660655e-c00e-58b1-a5cc-bd8b59662f8b'::uuid, 'Can I book for my mother, father or someone else in my family?', 'Yes. Book from your own account and choose "Someone in my family" under "Who is this for?". Add their name, age and how they are related, so the physiotherapist knows who they are meeting.', 90, true),
  ('b0959d58-bade-43bb-b8c9-17c514eb917e'::uuid, 'Can I choose my physiotherapist or language?', 'Yes, where the option is shown. It depends on who is free at the time you pick. You can see who your physiotherapist is in your booking details.', 100, true),
  ('ebf6d8ca-ed5e-5312-89d5-829f6e99db9a'::uuid, 'Can I book from outside India?', 'Yes, for video sessions. Times are shown in your own timezone, so you never have to work out the difference. Check the payment options at checkout before you book.', 110, true),
  ('5a1224b4-4299-51de-99a3-8ac6fcba6440'::uuid, 'My hospital referred me. What do I do?', 'Enter the referral code your hospital gave you when you sign up or book. It links your sessions to that referral.', 120, true),
  ('75ed1259-d4d9-48f9-ac3a-d322d24fab23'::uuid, 'Do I need medical reports or a doctor''s note to book?', 'No. You can book without them. If you have a prescription, scan, X-ray or past treatment notes, uploading them helps your physiotherapist prepare. They will tell you if they need anything else.', 130, true),
  ('cc937ddb-4a5b-4137-9329-0e1df69bc65e'::uuid, 'What happens in my first session?', 'Your physiotherapist asks about your pain, your health history and what you want to get back to doing. They check how you move, then explain what they found and what to do next.', 140, true),
  ('358edefe-c0d2-4bd3-abd0-df7e1f7315ec'::uuid, 'How do I get ready for a video session?', 'Use a phone, tablet or laptop with a camera, microphone and good internet. Wear loose, comfortable clothes. Choose a bright room with space to move safely, and keep any reports close by.', 150, true),
  ('96c34501-694e-5eb5-be21-e3dd0359fcb9'::uuid, 'Do I need to install an app?', 'No, there is no app of ours to install. The call runs on Google Meet. On a phone, Google Meet may ask you to open its free app.', 160, true),
  ('f8342e05-50a9-45ab-850e-eaa3f3edbfe5'::uuid, 'How do I join my video session?', 'Open the session in your dashboard and tap the join button when it appears. Sessions run on Google Meet. Check your camera, microphone and internet a few minutes before.', 170, true),
  ('1c2b7f94-8e5a-5309-a09e-7e6f0a601806'::uuid, 'What if my internet drops during the call?', 'Open the session in your dashboard again and rejoin with the same link. Your physiotherapist will wait for you.', 180, true),
  ('62537846-982f-4bcd-8c08-ffe302215a43'::uuid, 'How long is a session?', 'It depends on the session you choose. The length is shown when you book. Keep a little extra time free for questions.', 190, true),
  ('c1be99ca-9498-4a56-831e-938f9d1f029c'::uuid, 'How do I book a home visit?', 'Choose home visit and enter your pincode. If we cover your area, pick a time and add your full address, with anything that helps the physiotherapist find you.', 200, true),
  ('faea507a-991c-46f2-98c5-9d8d73cd20d9'::uuid, 'What if you don''t do home visits where I live?', 'You can join the waitlist where it is offered. That does not book a visit or promise a date. A video session may still work for you in the meantime.', 210, true),
  ('82da4ff4-4f7f-4ff6-8b34-4a0848c4be03'::uuid, 'How do I get ready for a home visit?', 'Clear a safe space to move in and keep your reports ready. Tell us about stairs or anything that makes it hard to get in. If you need help moving, ask a family member to be there.', 220, true),
  ('da16672e-aeef-4eb2-8e99-b451dd326e12'::uuid, 'How much does it cost?', 'It depends on the session, home visit or programme you choose. You see the full price, including any travel fee for a home visit, before you pay.', 230, true),
  ('f98898a4-805d-4dec-82f4-60d4342e2757'::uuid, 'How do I pay?', 'Online, through Razorpay, using any payment method shown at checkout. Your payment history and receipts are in your account.', 240, true),
  ('f9a0b1fa-242f-5cdf-9f8e-4e69321580a9'::uuid, 'Can I get a receipt for insurance or my employer?', 'You can download a receipt for each payment from the Payments page in your dashboard. Whether your insurer or employer pays you back depends on their own rules.', 250, true),
  ('ff40c4a2-bd54-42d3-bbef-7608372b5652'::uuid, 'Can I use a promo code or get a free session?', 'If you have a promo code, enter it at checkout. Free sessions and discounts only apply when they are offered to you. Always check the final amount before you pay.', 260, true),
  ('804938cb-d372-40e6-91ca-1fc723331908'::uuid, 'Can I pay later or pay in cash?', 'Only when that option is offered and approved for your booking. If it is, your booking details will say so. If you don''t see it, pay online as usual.', 270, true),
  ('4bc2df91-46fd-4a6b-8245-d889d8a84a1b'::uuid, 'I paid, but my booking isn''t confirmed. What should I do?', 'First check your dashboard and payment history. If it is still missing, contact us with your payment reference. Please don''t pay again until we have checked the first payment.', 280, true),
  ('6d53dbea-e4a1-4de3-adb3-429c7e4196c7'::uuid, 'How do I buy a treatment programme?', 'A programme is suggested by your physiotherapist after your assessment. If they suggest one, you will see it in your dashboard with the sessions, price and how long it lasts, and you can buy it there.', 290, true),
  ('a4b49bf1-c091-4d39-9270-de21fae7bdac'::uuid, 'How do I book the sessions in my programme?', 'Open your programme and pick a time. Each booking uses one of your remaining sessions. Use them before the programme''s end date. A suggested date is only a suggestion until you book it.', 300, true),
  ('b52d8faf-e5ac-4f59-8e29-f2fbdce410d7'::uuid, 'How many sessions will I need?', 'It depends on your problem, your goals and how you respond. Your physiotherapist will suggest a plan and review your progress with you. Everyone recovers differently, so nobody can promise an exact number.', 310, true),
  ('ae6e7c46-0e5f-5414-a1a1-d200fa010abc'::uuid, 'Do I have to do exercises between sessions?', 'Yes. Most of the progress happens between sessions. Your exercise plan is in your dashboard, and you can note how each day went so your physiotherapist can see it.', 320, true),
  ('af5a8a13-36a2-43bf-bc75-c24368e89c54'::uuid, 'How do I cancel, and will I get a refund?', 'Open the session in your dashboard and tap cancel, if it is shown. Whether you get a refund depends on how early you cancel and on your booking terms. You can follow your refund in your account.', 330, true),
  ('dc0539cf-c91b-4e3d-b824-21b5365f8b5e'::uuid, 'Can I change my time or my physiotherapist?', 'Contact us and we will try to change it. It depends on who is free. Your current booking stays as it is until we confirm the change.', 340, true),
  ('947a55af-07c2-40dd-9b38-b2b6807daba5'::uuid, 'Where do I see my health information and plan?', 'In your dashboard. You can update your health profile, fill in your pain map, upload reports, see your care plan and download your health information as a PDF.', 350, true),
  ('0688e28f-5f41-47ae-8082-491642ad9b8b'::uuid, 'Who can see my medical information?', 'Only your physiotherapist and the clinic staff who need it for your care. Your files are stored privately. Our Privacy Policy has the details.', 360, true),
  ('a0f620d8-050e-56fa-a28f-43a2df7c7d0f'::uuid, 'Can I close my account?', 'Yes. Contact us from the email or phone number on your account and we will close it. Records of payments are kept even after an account is closed.', 370, true),
  ('11ba6ff6-ba91-42db-b73e-86c37c3af717'::uuid, 'Can I invite someone and get a reward?', 'Yes, where the invite option is shown in your account. Rewards depend on the current offer''s rules, which are shown before you share your invite.', 380, true),
  ('7d3f26bf-d232-4294-b791-4538cb9e7628'::uuid, 'How do I give feedback or get help?', 'You can rate a session and leave feedback from your dashboard. For help with a booking, payment, refund or signing in, use the contact details on our website, and include your booking or payment reference.', 390, true)
on conflict (id) do update
  set question = excluded.question,
      answer = excluded.answer,
      display_order = excluded.display_order,
      active = true;

commit;

-- Check: every row above, in order.
select display_order, question from faqs where active order by display_order;
