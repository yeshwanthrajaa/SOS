// server.js – SOS Guardian backend for automatic dispatch via Twilio
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
const allowedOrigins = (process.env.WEB_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_WHATSAPP_NUMBER, // e.g., "whatsapp:+14155238886" (Twilio sandbox)
} = process.env;

function getTwilioClient() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    const error = new Error('Twilio credentials are not configured. Set them in backend/.env.');
    error.statusCode = 503;
    throw error;
  }
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

function getSmsSender() {
  if (!TWILIO_PHONE_NUMBER) {
    const error = new Error('SMS is not configured. Set TWILIO_PHONE_NUMBER in backend/.env.');
    error.statusCode = 503;
    throw error;
  }
  return TWILIO_PHONE_NUMBER;
}

function getWhatsAppSender() {
  if (!TWILIO_WHATSAPP_NUMBER || !/^whatsapp:\+[1-9]\d{6,14}$/.test(TWILIO_WHATSAPP_NUMBER)) {
    const error = new Error(
      'WhatsApp is not configured. Set TWILIO_WHATSAPP_NUMBER to your Twilio WhatsApp sender in backend/.env.'
    );
    error.statusCode = 503;
    throw error;
  }
  return TWILIO_WHATSAPP_NUMBER;
}

app.post('/sms', async (req, res) => {
  const { to, body } = req.body || {};
  if (typeof to !== 'string' || !/^\+[1-9]\d{6,14}$/.test(to)) {
    return res.status(400).json({ error: 'A valid international phone number is required.' });
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 1600) {
    return res.status(400).json({ error: 'Message body must contain 1 to 1600 characters.' });
  }

  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      body,
      from: getSmsSender(),
      to,
    });
    return res.json({ success: true, sid: message.sid, status: message.status });
  } catch (error) {
    console.error('Twilio SMS send failed:', error.message);
    return res.status(error.statusCode || 502).json({
      error: error.statusCode
        ? error.message
        : `Twilio could not accept the SMS${error.code ? ` (code ${error.code})` : ''}. Check the backend logs.`,
    });
  }
});

app.post('/whatsapp', async (req, res) => {
  const { to, body, testMode } = req.body || {};
  if (typeof to !== 'string' || !/^\+[1-9]\d{6,14}$/.test(to)) {
    return res.status(400).json({ error: 'A valid international phone number is required.' });
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 4096) {
    return res.status(400).json({ error: 'Message body must contain 1 to 4096 characters.' });
  }

  if (testMode === true) {
    return res.json({ success: true, testMode: true, simulated: true });
  }

  try {
    const message = await getTwilioClient().messages.create({
      body,
      from: getWhatsAppSender(),
      to: `whatsapp:${to}`,
    });
    return res.json({ success: true, sid: message.sid, status: message.status });
  } catch (error) {
    console.error('Twilio WhatsApp send failed:', error.message);
    return res.status(error.statusCode || 502).json({
      error: error.statusCode
        ? error.message
        : `Twilio could not accept the WhatsApp message${error.code ? ` (code ${error.code})` : ''}. Check the backend logs.`,
    });
  }
});

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
    const client = getTwilioClient();
    const sms = await client.messages.create({
      body: messageBody,
      from: getSmsSender(),
      to: cleanPhone,
    });
    results.sms = { sid: sms.sid, status: sms.status };
  } catch (e) {
    results.sms = { error: e.message };
  }

  // Send WhatsApp if sandbox number provided
  if (TWILIO_WHATSAPP_NUMBER) {
    try {
      const wa = await getTwilioClient().messages.create({
        body: messageBody,
        from: getWhatsAppSender(),
        to: `whatsapp:${cleanPhone}`,
      });
      results.whatsapp = { sid: wa.sid, status: wa.status };
    } catch (e) {
      results.whatsapp = { error: e.message };
    }
  }

  // Initiate a call with TwiML that reads the message
  try {
    const call = await getTwilioClient().calls.create({
      to: cleanPhone,
      from: getSmsSender(),
      twiml: `<Response><Say>${messageBody.replace(/\n/g, ' ')}</Say></Response>`,
    });
    results.call = { sid: call.sid, status: call.status };
  } catch (e) {
    results.call = { error: e.message };
  }

  res.json({ success: true, testMode: false, results });
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`SOS Guardian backend listening at http://${HOST}:${PORT}`);
});
