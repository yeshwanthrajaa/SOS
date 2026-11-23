// server.js – SOS Guardian backend for automatic dispatch via Twilio
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { twilio } = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_WHATSAPP_NUMBER, // e.g., "whatsapp:+14155238886" (Twilio sandbox)
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.error('Missing Twilio env vars – please configure .env');
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * Build a full emergency message payload.
 */
function buildMessage(emergency, location) {
  let base = `${emergency.message}`;
  if (location && location.available) {
    base += `\nLocation: ${location.mapUrl}`;
  } else {
    base += `\nLocation unavailable.`;
  }
  base += `\nTime: ${new Date().toLocaleString()}`;
  base += '\n[Sent via SOS Guardian]';
  return base;
}

app.post('/alert', async (req, res) => {
  const { emergency, contact, location, testMode } = req.body;
  if (!emergency || !contact) {
    return res.status(400).json({ error: 'Missing emergency or contact data' });
  }

  const messageBody = buildMessage(emergency, location);
  const cleanPhone = contact.phone.replace(/[^0-9+]/g, '');
  const results = {};

  if (testMode) {
    // Simulate without sending
    results.sms = { simulated: true, to: cleanPhone, body: messageBody };
    results.whatsapp = { simulated: true, to: cleanPhone, body: messageBody };
    results.call = { simulated: true, to: cleanPhone };
    return res.json({ success: true, testMode: true, results });
  }

  try {
    // Send SMS
    const sms = await client.messages.create({
      body: messageBody,
      from: TWILIO_PHONE_NUMBER,
      to: cleanPhone,
    });
    results.sms = { sid: sms.sid, status: sms.status };
  } catch (e) {
    results.sms = { error: e.message };
  }

  // Send WhatsApp if sandbox number provided
  if (TWILIO_WHATSAPP_NUMBER) {
    try {
      const wa = await client.messages.create({
        body: messageBody,
        from: TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${cleanPhone}`,
      });
      results.whatsapp = { sid: wa.sid, status: wa.status };
    } catch (e) {
      results.whatsapp = { error: e.message };
    }
  }

  // Initiate a call with TwiML that reads the message
  try {
    const call = await client.calls.create({
      to: cleanPhone,
      from: TWILIO_PHONE_NUMBER,
      twiml: `<Response><Say>${messageBody.replace(/\n/g, ' ')}</Say></Response>`,
    });
    results.call = { sid: call.sid, status: call.status };
  } catch (e) {
    results.call = { error: e.message };
  }

  res.json({ success: true, testMode: false, results });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SOS Guardian backend listening on port ${PORT}`);
});
