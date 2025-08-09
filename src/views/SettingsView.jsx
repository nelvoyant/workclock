import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

export default function SettingsView() {
  const [timezone, setTimezone] = useState("");

  // Load previously saved value (if any)
  useEffect(() => {
    monday.storage.getItem("workclock:user:settings").then((res) => {
      const saved = res?.data?.value;
      if (saved?.timezone) setTimezone(saved.timezone);
    });
  }, []);

  const save = async () => {
    const payload = { timezone };
    await monday.storage.setItem(
      "workclock:user:settings",
      JSON.stringify(payload)
    );
    monday.execute("notice", { type: "success", message: "Saved!" });
  };

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h3>WorkClock Settings</h3>
      <label style={{ display: "block", marginBottom: 8 }}>Timezone</label>
      <input
        type="text"
        placeholder="e.g., America/Toronto"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        style={{ padding: 6, width: 260 }}
      />
      <div>
        <button onClick={save} style={{ marginTop: 12 }}>
          Save
        </button>
      </div>
    </div>
  );
}
