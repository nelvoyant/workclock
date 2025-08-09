import "./BoardView.css"; // optional tiny styles
import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

export default function BoardView() {
  const [prefs, setPrefs] = useState(null);

  useEffect(() => {
    monday.storage.getItem("workclock:user:settings").then((res) => {
      const raw = res?.data?.value;
      let normalized = {};

      if (typeof raw === "string") {
        // try to parse JSON; fall back if it was "[object Object]"
        try {
          const maybe = JSON.parse(raw);
          normalized = maybe && typeof maybe === "object" ? maybe : {};
        } catch {
          normalized = {};
        }
      } else if (raw && typeof raw === "object") {
        normalized = raw;
      }

      console.log("Normalized settings:", normalized);
      setPrefs(normalized);
    });
  }, []);

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
        Saved timezone: <b>{prefs?.timezone || "— none —"}</b>
      </div>
      {/* existing content below… */}
      <div>No people assigned yet.</div>
    </div>
  );
}
