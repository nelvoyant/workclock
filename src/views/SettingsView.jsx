import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SettingsView() {
  const [timezone, setTimezone] = useState("");
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [workDays, setWorkDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri"]);

  // Load saved settings
  useEffect(() => {
    monday.storage.getItem("workclock:user:settings").then((res) => {
      const raw = res?.data?.value;
      let saved = {};
      try {
        saved = typeof raw === "string" ? JSON.parse(raw) : raw || {};
      } catch {
        saved = {};
      }
      if (saved.timezone) setTimezone(saved.timezone);
      if (saved.startHour) setStartHour(saved.startHour);
      if (saved.endHour) setEndHour(saved.endHour);
      if (Array.isArray(saved.workDays)) setWorkDays(saved.workDays);
    });
  }, []);

  const toggleDay = (day) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const save = async () => {
    const payload = { timezone, startHour, endHour, workDays };
    await monday.storage.setItem(
      "workclock:user:settings",
      JSON.stringify(payload)
    );
    monday.execute("notice", { type: "success", message: "Saved!" });
  };

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif", maxWidth: 360 }}>
      <h3>WorkClock Settings</h3>

      <label style={{ display: "block", marginTop: 12 }}>Timezone</label>
      <input
        type="text"
        placeholder="e.g., America/Toronto"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        style={{ padding: 6, width: "100%" }}
      />

      <label style={{ display: "block", marginTop: 12 }}>Workday start</label>
      <input
        type="time"
        value={startHour}
        onChange={(e) => setStartHour(e.target.value)}
        style={{ padding: 6, width: 160 }}
      />

      <label style={{ display: "block", marginTop: 12 }}>Workday end</label>
      <input
        type="time"
        value={endHour}
        onChange={(e) => setEndHour(e.target.value)}
        style={{ padding: 6, width: 160 }}
      />

      <label style={{ display: "block", marginTop: 12 }}>Working days</label>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
        {WEEKDAYS.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => toggleDay(day)}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #ccc",
              background: workDays.includes(day) ? "#00c875" : "#fff",
              color: workDays.includes(day) ? "#fff" : "#000",
              cursor: "pointer",
            }}
          >
            {day}
          </button>
        ))}
      </div>

      <div>
        <button onClick={save} style={{ marginTop: 16 }}>
          Save
        </button>
      </div>
    </div>
  );
}
