import React, { useEffect, useMemo, useState } from "react";
import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// curated IANA timezone list (kept in sync with BoardView)
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function formatDays(days) {
  if (!Array.isArray(days) || days.length === 0) return "";
  // render as •MonTueFri etc. compact
  return " • " + days.map((d) => d).join("");
}

function localNowStr(timezone) {
  if (!timezone) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    }).format(new Date());
  } catch {
    return "";
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatUpdated(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export default function SettingsView() {
  const [timezone, setTimezone] = useState("");
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [workDays, setWorkDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [rowColorMode, setRowColorMode] = useState(false);

  const [userOverrides, setUserOverrides] = useState({});
  const [userNamesMap, setUserNamesMap] = useState({});

  const [editingKey, setEditingKey] = useState(null);
  const [editOverrideTemp, setEditOverrideTemp] = useState({
    timezone: "",
    startHour: "09:00",
    endHour: "17:00",
    source: "manual",
  });

  const [, setNowTick] = useState(0); // for periodic chip refresh

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
      if (typeof saved.rowColorMode === "boolean")
        setRowColorMode(saved.rowColorMode);
      // legacy: saved.userTimezones no longer edited via a textbox UI
      if (saved.userOverrides && typeof saved.userOverrides === "object") {
        setUserOverrides(saved.userOverrides);
        const ids = Object.keys(saved.userOverrides || {}).filter((k) =>
          /^\d+$/.test(k)
        );
        if (ids.length) {
          monday
            .api(`query ($ids: [ID!]) { users (ids: $ids) { id name } }`, {
              variables: { ids },
            })
            .then((r) => {
              const users = r?.data?.users || [];
              const map = {};
              users.forEach((u) => (map[u.id] = u.name));
              setUserNamesMap(map);
            })
            .catch(() => {});
        }
      }
    });
  }, []);

  // Refresh name map when overrides change
  useEffect(() => {
    const ids = Object.keys(userOverrides || {}).filter((k) => /^\d+$/.test(k));
    if (!ids.length) return;
    monday
      .api(`query ($ids: [ID!]) { users (ids: $ids) { id name } }`, {
        variables: { ids },
      })
      .then((r) => {
        const users = r?.data?.users || [];
        const map = {};
        users.forEach((u) => (map[u.id] = u.name));
        setUserNamesMap(map);
      })
      .catch(() => {});
  }, [userOverrides]);

  // helper: validate timezone
  const isValidTimeZone = (tz) => {
    if (!tz || typeof tz !== "string") return false;
    try {
      Intl.DateTimeFormat([], { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  };

  const editOverride = (key) => {
    const o = userOverrides[key] || {};
    setEditOverrideTemp({
      timezone: o.timezone || "",
      startHour: o.startHour || startHour,
      endHour: o.endHour || endHour,
      source: o.source || "manual",
    });
    setEditingKey(key);
  };

  const removeOverride = async (key) => {
    if (!window.confirm(`Remove override for ${key}?`)) return;
    const next = { ...userOverrides };
    delete next[key];
    setUserOverrides(next);
    try {
      const raw = await monday.storage.getItem("workclock:user:settings");
      const old = raw?.data?.value
        ? typeof raw.data.value === "string"
          ? JSON.parse(raw.data.value)
          : raw.data.value
        : {};
      const merged = { ...old, userOverrides: next };
      await monday.storage.setItem(
        "workclock:user:settings",
        JSON.stringify(merged)
      );
      monday.execute("notice", {
        type: "success",
        message: "Override removed.",
      });
    } catch (e) {}
  };

  const saveOverrideEdit = async () => {
    if (!editingKey) return;
    if (
      editOverrideTemp.timezone &&
      !isValidTimeZone(editOverrideTemp.timezone)
    ) {
      alert(
        "Invalid timezone. Please enter a valid IANA timezone like 'America/Toronto'."
      );
      return;
    }
    const next = { ...userOverrides };
    next[editingKey] = {
      timezone: editOverrideTemp.timezone || undefined,
      startHour: editOverrideTemp.startHour || undefined,
      endHour: editOverrideTemp.endHour || undefined,
      source: editOverrideTemp.source || "manual",
      updatedAt: Date.now(),
    };
    setUserOverrides(next);
    setEditingKey(null);
    try {
      const raw = await monday.storage.getItem("workclock:user:settings");
      const old = raw?.data?.value
        ? typeof raw.data.value === "string"
          ? JSON.parse(raw.data.value)
          : raw.data.value
        : {};
      const merged = { ...old, userOverrides: next };
      await monday.storage.setItem(
        "workclock:user:settings",
        JSON.stringify(merged)
      );
      monday.execute("notice", { type: "success", message: "Override saved." });
    } catch (e) {}
  };

  const exportOverrides = async () => {
    try {
      const json = JSON.stringify(userOverrides || {}, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        monday.execute("notice", {
          type: "success",
          message: "Overrides copied to clipboard.",
        });
      } else {
        window.prompt("Copy overrides JSON:", json);
      }
    } catch (e) {
      window.prompt(
        "Copy overrides JSON:",
        JSON.stringify(userOverrides || {}, null, 2)
      );
    }
  };

  const importOverrides = async () => {
    const txt = window.prompt(
      "Paste overrides JSON (object of key -> {timezone,startHour,endHour}):"
    );
    if (!txt) return;
    try {
      const parsed = JSON.parse(txt);
      if (parsed && typeof parsed === "object") {
        setUserOverrides(parsed);
        const raw = await monday.storage.getItem("workclock:user:settings");
        const old = raw?.data?.value
          ? typeof raw.data.value === "string"
            ? JSON.parse(raw.data.value)
            : raw.data.value
          : {};
        const merged = { ...old, userOverrides: parsed };
        await monday.storage.setItem(
          "workclock:user:settings",
          JSON.stringify(merged)
        );
        monday.execute("notice", {
          type: "success",
          message: "Overrides imported.",
        });
      } else {
        alert(
          "Invalid format: expected an object mapping keys to override objects."
        );
      }
    } catch (e) {
      alert("Failed to parse JSON: " + (e?.message || e));
    }
  };

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
      rowColorMode,
    };
    // userTimezones freeform textbox removed; centralized overrides are persisted below
    if (userOverrides && Object.keys(userOverrides).length > 0)
      payload.userOverrides = userOverrides;
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
    <div style={{ padding: 16, fontFamily: "sans-serif", maxWidth: 760 }}>
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
            checked={rowColorMode}
            onChange={(e) => setRowColorMode(e.target.checked)}
          />{" "}
          Tint entire row by status
        </label>
      </div>

      <label style={{ display: "block", marginTop: 12 }}>
        User timezone overrides
      </label>

      {/* Centralized Overrides Editor */}
      <div
        style={{ marginTop: 18, borderTop: "1px solid #eee", paddingTop: 12 }}
      >
        <h4 style={{ margin: "6px 0" }}>User Overrides</h4>
        <div style={{ color: "#666", marginBottom: 8, fontSize: 13 }}>
          Manage per-user overrides (timezone and work hours). These take
          precedence.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={exportOverrides}>
            Export JSON
          </button>
          <button type="button" onClick={importOverrides}>
            Import JSON
          </button>
          <button
            type="button"
            onClick={() => {
              const raw = window.prompt("Enter numeric user id for override:");
              if (!raw) return;
              const k = raw.trim();
              if (!/^\d+$/.test(k)) {
                window.alert("Please enter a numeric user id (digits only).");
                return;
              }
              setUserOverrides((prev) => ({
                ...(prev || {}),
                [k]: prev?.[k] || {
                  timezone: "",
                  startHour,
                  endHour,
                  source: "manual",
                  updatedAt: Date.now(),
                },
              }));
              setTimeout(() => editOverride(k), 20);
            }}
          >
            Add override
          </button>
        </div>

        <div
          style={{
            maxHeight: 260,
            overflow: "auto",
            border: "1px solid #eef2f7",
            borderRadius: 6,
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr
                style={{
                  background: "linear-gradient(90deg,#f1f5f9,#fff)",
                  color: "#0f172a",
                }}
              >
                <th
                  style={{
                    textAlign: "left",
                    padding: 8,
                    borderBottom: "1px solid #e6eefb",
                    minWidth: 60,
                  }}
                >
                  userId
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: 8,
                    borderBottom: "1px solid #e6eefb",
                    minWidth: 130,
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: 8,
                    borderBottom: "1px solid #e6eefb",
                  }}
                >
                  Timezone
                </th>
                <th style={{ padding: 8, borderBottom: "1px solid #e6eefb" }}>
                  Start
                </th>
                <th style={{ padding: 8, borderBottom: "1px solid #e6eefb" }}>
                  End
                </th>
                <th style={{ padding: 8, borderBottom: "1px solid #e6eefb" }}>
                  Updated
                </th>
                <th
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #e6eefb",
                    minWidth: 170,
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(userOverrides || {}).length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, color: "#666" }}>
                    No overrides defined.
                  </td>
                </tr>
              ) : (
                Object.entries(userOverrides || {}).map(([k, v], idx) => (
                  <tr
                    key={k}
                    style={{
                      background: idx % 2 === 0 ? "#fff" : "#fcfdff",
                      borderBottom: "1px solid #f5f7fa",
                    }}
                  >
                    <td style={{ padding: 8, fontFamily: "monospace" }}>{k}</td>
                    <td style={{ padding: 8, color: "#6b7280" }}>
                      {userNamesMap[k] ||
                        (typeof k === "string" && k.length < 30 ? k : "-")}
                    </td>
                    <td style={{ padding: 8 }}>{v?.timezone || "(default)"}</td>
                    <td style={{ padding: 8 }}>{v?.startHour || startHour}</td>
                    <td style={{ padding: 8 }}>{v?.endHour || endHour}</td>
                    <td style={{ padding: 8 }}>
                      {v?.updatedAt ? formatUpdated(v.updatedAt) : "-"}
                    </td>
                    <td
                      style={{
                        padding: 8,
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => editOverride(k)}
                        style={{
                          background: "#0b66f6",
                          color: "#fff",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: 6,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOverride(k)}
                        style={{
                          background: "#f97373",
                          color: "#fff",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: 6,
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {editingKey ? (
          <div
            style={{
              marginTop: 12,
              borderTop: "1px dashed #e6eefb",
              paddingTop: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <strong>Edit override:</strong>
              <span style={{ color: "#475569" }}>{editingKey}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                value={editOverrideTemp.timezone}
                onChange={(e) =>
                  setEditOverrideTemp({
                    ...editOverrideTemp,
                    timezone: e.target.value,
                  })
                }
                style={{ padding: 6, flex: 1 }}
              >
                <option value="">(use default)</option>
                {TIMEZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={editOverrideTemp.startHour}
                onChange={(e) =>
                  setEditOverrideTemp({
                    ...editOverrideTemp,
                    startHour: e.target.value,
                  })
                }
              />
              <input
                type="time"
                value={editOverrideTemp.endHour}
                onChange={(e) =>
                  setEditOverrideTemp({
                    ...editOverrideTemp,
                    endHour: e.target.value,
                  })
                }
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveOverrideEdit}>Save override</button>
              <button onClick={() => setEditingKey(null)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <button onClick={save} style={{ marginTop: 16 }}>
          Save
        </button>
      </div>
    </div>
  );
}
