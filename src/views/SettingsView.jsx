import React, { useEffect, useMemo, useState } from "react";
import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDays(days) {
  if (!Array.isArray(days) || days.length === 0) return "";
  const wk = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const idx = days
    .map((d) => wk.indexOf(d))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  const isMonFri = idx.length === 5 && idx.every((v, i) => v === i);
  return isMonFri ? " (Mon–Fri)" : ` (${days.join("·")})`;
}

function localNowStr(tz) {
  if (!tz) return "";
  try {
    return new Intl.DateTimeFormat([], {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
  } catch {
    return "";
  }
}

export default function SettingsView() {
  const [timezone, setTimezone] = useState("");
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [workDays, setWorkDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [compact, setCompact] = useState(false);
  const [rowColorMode, setRowColorMode] = useState(false);
  const [userTzText, setUserTzText] = useState(""); // lines of id=Timezone
  const [, setNowTick] = useState(0); // for live clock refresh

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
      if (typeof saved.compact === "boolean") setCompact(saved.compact);
      if (typeof saved.rowColorMode === "boolean")
        setRowColorMode(saved.rowColorMode);
      if (saved.userTimezones && typeof saved.userTimezones === "object") {
        // convert object to editable lines
        const lines = Object.entries(saved.userTimezones)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
        setUserTzText(lines);
      }
    });
  }, []);

  // Live clock in chip
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const toggleDay = (day) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const useMyTimezone = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz) setTimezone(tz);
  };

  const save = async () => {
    const payload = {
      timezone,
      startHour,
      endHour,
      workDays,
      compact,
      rowColorMode,
    };
    // parse userTzText into object mapping
    if (userTzText && userTzText.trim()) {
      const map = {};
      userTzText.split(/\r?\n/).forEach((line) => {
        const t = line.trim();
        if (!t) return;
        const [k, ...rest] = t.split(/[:=]/);
        if (!k) return;
        const v = rest.join(":") || "";
        if (v) map[k.trim()] = v.trim();
      });
      payload.userTimezones = map;
    }
    await monday.storage.setItem(
      "workclock:user:settings",
      JSON.stringify(payload)
    );
    monday.execute("notice", { type: "success", message: "Settings saved." });
  };

  const chip = useMemo(() => {
    if (!timezone) return "";
    return `${timezone} • ${startHour}–${endHour}${formatDays(
      workDays
    )} • Local now: ${localNowStr(timezone)}`;
  }, [timezone, startHour, endHour, workDays]);

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif", maxWidth: 460 }}>
      <h3 style={{ margin: 0 }}>WorkClock Settings</h3>
      {chip && (
        <div
          className="tz-chip"
          style={{
            display: "inline-block",
            padding: "4px 8px",
            marginTop: 8,
            borderRadius: 12,
            background: "#f3f4f6",
            color: "#374151",
            fontSize: 12,
          }}
          title={chip}
        >
          {chip}
        </div>
      )}

      <p style={{ marginTop: 8, color: "#555", fontSize: 13 }}>
        Default schedule applies to everyone in this board view.
      </p>

      <label style={{ display: "block", marginTop: 12 }}>Timezone</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="e.g., America/Toronto"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          style={{ padding: 6, width: "100%" }}
        />
        <button
          type="button"
          onClick={useMyTimezone}
          title="Use browser timezone"
        >
          Use mine
        </button>
      </div>

      <div
        style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap" }}
      >
        <div>
          <label style={{ display: "block" }}>Workday start</label>
          <input
            type="time"
            value={startHour}
            onChange={(e) => setStartHour(e.target.value)}
            style={{ padding: 6, width: 160 }}
          />
        </div>
        <div>
          <label style={{ display: "block" }}>Workday end</label>
          <input
            type="time"
            value={endHour}
            onChange={(e) => setEndHour(e.target.value)}
            style={{ padding: 6, width: 160 }}
          />
        </div>
      </div>

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

      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
          />{" "}
          Compact rows
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={rowColorMode}
            onChange={(e) => setRowColorMode(e.target.checked)}
          />{" "}
          Tint entire row by status
        </label>
      </div>

      <label style={{ display: "block", marginTop: 12 }}>
        User timezone overrides
      </label>
      <div style={{ marginTop: 6 }}>
        <small style={{ color: "#666" }}>
          Enter one mapping per line in the format{" "}
          <code>userId=America/Toronto</code> or{" "}
          <code>Full Name=Europe/London</code>. Mappings by user ID take
          precedence.
        </small>
        <textarea
          placeholder={"e.g. 123456=America/Toronto\nJane Doe=Europe/London"}
          value={userTzText}
          onChange={(e) => setUserTzText(e.target.value)}
          style={{ width: "100%", minHeight: 90, marginTop: 6, padding: 8 }}
        />
      </div>

      <div>
        <button onClick={save} style={{ marginTop: 16 }}>
          Save
        </button>
      </div>
    </div>
  );
}
