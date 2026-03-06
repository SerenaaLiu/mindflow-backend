const express = require("express");
const app = express();
app.use((req, res, next) => {
  express.json()(req, res, (err) => {
    if (err) {
      console.log('JSON parse error:', err.message, '| raw:', req.body);
    }
    next();
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractToolCall(body) {
  return body?.message?.toolCallList?.[0]
    || body?.message?.toolCalls?.[0]
    || body?.toolCalls?.[0]
    || null;
}

function extractArgs(toolCall, body) {
  if (toolCall) {
    const args = toolCall.function?.arguments;
    return typeof args === "string" ? JSON.parse(args) : (args || {});
  }
  return body || {};
}

function getToolCallId(body) {
  // Use same extraction as debug endpoint which worked
  return body?.message?.toolCallList?.[0]?.id 
    || body?.message?.toolCalls?.[0]?.id
    || body?.toolCalls?.[0]?.id
    || "";
}

function vapiResponse(res, toolCallId, resultObj) {
  const resultStr = typeof resultObj === "string" ? resultObj : JSON.stringify(resultObj);
  // Always return results array - Vapi requires this regardless of toolCallId
  return res.json({ results: [{ toolCallId: toolCallId || "", result: resultStr }] });
}

function generateSlots(durationMinutes) {
  const now = new Date();
  const slots = [];
  const startHours = [10, 13, 15, 16];

  for (let dayOffset = 1; dayOffset <= 2; dayOffset++) {
    for (const hour of startHours) {
      const slotStart = new Date(now);
      slotStart.setDate(now.getDate() + dayOffset);
      slotStart.setHours(hour, 0, 0, 0);

      const minStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      if (slotStart < minStart) continue;

      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

      slots.push({
        start_time: slotStart.toISOString(),
        end_time: slotEnd.toISOString(),
        display: formatSlotDisplay(slotStart),
      });

      if (slots.length === 3) break;
    }
    if (slots.length === 3) break;
  }

  return slots;
}

function formatSlotDisplay(date) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayName = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNum = date.getDate();
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minStr = minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`;
  return `${dayName}, ${month} ${dayNum} at ${hours}${minStr} ${ampm}`;
}

// ─── Route 1: check_availability ────────────────────────────────────────────

app.post("/vapi/check-availability", (req, res) => {
  const toolCall = extractToolCall(req.body);
  const args = extractArgs(toolCall, req.body);
  const toolCallId = getToolCallId(req.body);
  const duration_minutes = Number(args?.duration_minutes || args?.durationMinutes || 60);

  console.log("check_availability | duration:", duration_minutes, "| toolCallId:", toolCallId, "| bodyKeys:", Object.keys(req.body || {}));

  const slots = generateSlots(duration_minutes);
  const result = {
    available_slots: slots,
    timezone: "America/New_York",
    duration_minutes,
  };

  return vapiResponse(res, toolCallId, result);
});

// ─── Route 2: create_calendar_event ─────────────────────────────────────────

app.post("/vapi/create-calendar-event", (req, res) => {
  const toolCall = extractToolCall(req.body);
  const args = extractArgs(toolCall, req.body);
  const toolCallId = getToolCallId(req.body);
  const { full_name, phone_number, service_name, duration_minutes, start_time, end_time } = args;

  console.log("create_calendar_event | client:", full_name, "| service:", service_name, "| start:", start_time);

  if (!full_name || !service_name || !start_time) {
    return vapiResponse(res, toolCallId, "Missing required fields: full_name, service_name, start_time");
  }

  const bookingId = `MINDFLOW-${Date.now()}`;
  console.log("BOOKING CONFIRMED:", bookingId, full_name, service_name, start_time);

  return vapiResponse(res, toolCallId, {
    success: true,
    booking_id: bookingId,
    status: "confirmed",
    message: `Appointment confirmed for ${full_name}`,
  });
});

// ─── Route 3: send_confirmation_sms ─────────────────────────────────────────

app.post("/vapi/send-confirmation-sms", (req, res) => {
  const toolCall = extractToolCall(req.body);
  const args = extractArgs(toolCall, req.body);
  const toolCallId = getToolCallId(req.body);
  const { full_name, phone_number, service_name, appointment_time } = args;

  console.log("send_confirmation_sms | to:", phone_number, "| client:", full_name);

  if (!full_name || !phone_number) {
    return vapiResponse(res, toolCallId, "Missing required fields: full_name, phone_number");
  }

  const smsMessage = `Hi ${full_name}! You are confirmed for your ${service_name} at Mindflow Spa on ${appointment_time}. Please give us 24 hours notice to reschedule. We look forward to seeing you! - Mindflow Spa`;

  console.log("SMS TO:", phone_number, "|", smsMessage);

  return vapiResponse(res, toolCallId, {
    success: true,
    status: "sent",
    to: phone_number,
    message: "Confirmation SMS sent successfully",
  });
});


// --- Debug endpoint ---

app.post("/vapi/debug", (req, res) => {
  const toolCallId = req.body?.message?.toolCallList?.[0]?.id || req.body?.message?.toolCalls?.[0]?.id || "test";
  const slots = generateSlots(60);
  const result = {
    available_slots: slots,
    timezone: "America/New_York",
    duration_minutes: 60
  };
  console.log("debug | toolCallId:", toolCallId, "| slots:", slots.length);
  res.json({ results: [{ toolCallId, result: JSON.stringify(result) }] });
});

// ─── Health check ────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    status: "Mindflow Spa backend is live ✅",
    endpoints: [
      "POST /vapi/check-availability",
      "POST /vapi/create-calendar-event",
      "POST /vapi/send-confirmation-sms",
    ],
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mindflow backend running on port ${PORT}`);
});
