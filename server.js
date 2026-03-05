const express = require("express");
const app = express();
app.use(express.json());

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractArgs(body) {
  try {
    const toolCall = body?.message?.toolCallList?.[0];
    if (toolCall) {
      const args = toolCall.function?.arguments;
      return typeof args === "string" ? JSON.parse(args) : args;
    }
    return body;
  } catch (e) {
    return body;
  }
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
  console.log("\n📅 check_availability called");
  console.log("Raw body:", JSON.stringify(req.body, null, 2));

  const args = extractArgs(req.body);
  console.log("Extracted args:", JSON.stringify(args, null, 2));

  const { duration_minutes } = args;

  if (!duration_minutes) {
    return res.status(400).json({ error: "duration_minutes is required" });
  }

  const slots = generateSlots(duration_minutes);
  console.log("Returning slots:", slots);

  return res.json({
    available_slots: slots,
    timezone: "America/New_York",
    duration_minutes,
  });
});

// ─── Route 2: create_calendar_event ─────────────────────────────────────────

app.post("/vapi/create-calendar-event", (req, res) => {
  console.log("\n📆 create_calendar_event called");
  console.log("Raw body:", JSON.stringify(req.body, null, 2));

  const args = extractArgs(req.body);
  const { full_name, phone_number, service_name, duration_minutes, start_time, end_time } = args;

  if (!full_name || !service_name || !start_time) {
    return res.status(400).json({ error: "full_name, service_name, and start_time are required" });
  }

  const booking = {
    id: `MINDFLOW-${Date.now()}`,
    status: "confirmed",
    client: full_name,
    phone: phone_number,
    service: service_name,
    duration: duration_minutes,
    start: start_time,
    end: end_time,
    booked_at: new Date().toISOString(),
    booked_via: "Elina (Voice Assistant)",
  };

  console.log("\n✅ BOOKING CONFIRMED:");
  console.log(JSON.stringify(booking, null, 2));

  return res.json({
    success: true,
    booking_id: booking.id,
    status: "confirmed",
    message: `Appointment confirmed for ${full_name}`,
  });
});

// ─── Route 3: send_confirmation_sms ─────────────────────────────────────────

app.post("/vapi/send-confirmation-sms", (req, res) => {
  console.log("\n📲 send_confirmation_sms called");
  console.log("Raw body:", JSON.stringify(req.body, null, 2));

  const args = extractArgs(req.body);
  const { full_name, phone_number, service_name, appointment_time } = args;

  if (!full_name || !phone_number) {
    return res.status(400).json({ error: "full_name and phone_number are required" });
  }

  const smsMessage =
`Hi ${full_name} ✨

You're confirmed for your ${service_name} at Mindflow Spa on ${appointment_time}.

If you need to reschedule, please give us at least 24 hours notice.

We look forward to seeing you 🌿

— Mindflow Spa`;

  console.log("\n📱 SMS THAT WOULD BE SENT:");
  console.log(`To: ${phone_number}`);
  console.log(`Message:\n${smsMessage}`);

  return res.json({
    success: true,
    status: "sent",
    to: phone_number,
    message: "Confirmation SMS sent successfully",
  });
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
  console.log(`\n🌿 Mindflow backend running on port ${PORT}`);
});
