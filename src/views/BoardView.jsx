import React, { useEffect, useRef, useState } from "react";
import mondaySdk from "monday-sdk-js";
import "./BoardView.css";
import { computeStatusForNow } from "../utils/time";

const monday = mondaySdk();

export default function BoardView() {
  const [users, setUsers] = useState([]);
  const [prefs, setPrefs] = useState({});
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef(null);

  // Load settings
  useEffect(() => {
    monday.storage.getItem("workclock:user:settings").then((res) => {
      let saved = {};
      try {
        const raw = res?.data?.value;
        saved = typeof raw === "string" ? JSON.parse(raw) : raw || {};
      } catch {}
      setPrefs(saved || {});
    });
  }, []);

  // Fetch assignees from People columns
  useEffect(() => {
    const unsub = monday.listen("context", async ({ data: { boardId } }) => {
      if (!boardId) return;
      setLoading(true);

      const { data } = await monday.api(
        `query ($board: [ID!]) {
          boards (ids: $board) {
            columns (types: people) { id }
            items_page (limit: 200) {
              items { column_values { id type value } }
            }
          }
        }`,
        { variables: { board: boardId } }
      );

      const board = data?.boards?.[0];
      const peopleColIds = (board?.columns || []).map((c) => c.id);
      const items = board?.items_page?.items ?? [];
      const ids = new Set();

      for (const it of items) {
        for (const cv of it.column_values) {
          const isPeople = cv.type === "people" || peopleColIds.includes(cv.id);
          if (isPeople && cv.value) {
            try {
              const parsed = JSON.parse(cv.value);
              (parsed.personsAndTeams || [])
                .filter((p) => p.kind === "person")
                .forEach((p) => ids.add(p.id));
            } catch {}
          }
        }
      }

      if (ids.size === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const { data: ures } = await monday.api(
        `query ($ids: [ID!]) { users (ids: $ids) { id name photo_thumb_small } }`,
        { variables: { ids: [...ids] } }
      );

      setUsers(ures?.users || []);
      setLoading(false);
    });

    return () => {
      try {
        unsub();
      } catch {}
    };
  }, []);

  // Refresh every 2 min & on focus
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120000);
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // === Uniform time alignment: measure widest name (avatar + gap + text) and set CSS var
  useEffect(() => {
    if (!rootRef.current || users.length === 0) return;

    // Create a measuring canvas with the same font as rows
    const font =
      getComputedStyle(rootRef.current)
        .getPropertyValue("--wc-row-font")
        .trim() ||
      "13px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = font;

    const AVATAR = 18; // px
    const GAP = 6; // px between avatar/name and time

    let max = 0;
    for (const u of users) {
      const w = Math.ceil(ctx.measureText(u.name || "").width);
      max = Math.max(max, AVATAR + GAP + w);
    }
    // Add a tiny buffer so text doesn’t touch the time
    const px = max + 4;
    rootRef.current.style.setProperty("--name-col", px + "px");
  }, [users]);

  // Toolbar actions: Row tint toggle (persist)
  const toggleRowTint = async () => {
    const next = !prefs?.rowColorMode;
    const nextPrefs = { ...prefs, rowColorMode: next };
    setPrefs(nextPrefs);
    try {
      await monday.storage.setItem(
        "workclock:user:settings",
        JSON.stringify(nextPrefs)
      );
    } catch {}
  };

  const tz = prefs?.timezone;
  const start = prefs?.startHour || "09:00";
  const end = prefs?.endHour || "17:00";
  const days = prefs?.workDays || ["Mon", "Tue", "Wed", "Thu", "Fri"];

  if (loading) return <div className="wc-empty">Loading…</div>;
  if (!tz) return <div className="wc-empty">Set a Timezone in Settings.</div>;
  if (!users.length) return <div className="wc-empty">No people found.</div>;

  return (
    <div
      ref={rootRef}
      className={`wc-root ${prefs?.rowColorMode ? "row-color" : ""}`}
      data-tick={tick}
    >
      <div className="wc-toolbar" role="toolbar" aria-label="Display options">
        <div className="wc-legend" aria-hidden="true">
          <span className="chip">
            <span className="key working" /> Working
          </span>
          <span className="chip">
            <span className="key lastHour" /> Ending soon (&lt; 60m)
          </span>
          <span className="chip">
            <span className="key off" /> Off hours
          </span>
        </div>
        <label className="wc-toggle">
          <input
            type="checkbox"
            checked={!!prefs?.rowColorMode}
            onChange={toggleRowTint}
          />
          Row tint
        </label>
      </div>

      <div
        className="wc-table"
        role="table"
        aria-label="Team local time and status"
      >
        {users.map((u) => {
          const { timeStr, status } = computeStatusForNow(tz, start, end, days);
          return (
            <div
              key={u.id}
              className={`wc-row ${status}`}
              role="row"
              aria-label={`${u.name}, ${status}, local time ${timeStr}`}
            >
              <div className="wc-col wc-name" role="cell">
                <img src={u.photo_thumb_small} alt="" className="wc-avatar" />
                <span className="wc-name-text">{u.name}</span>
              </div>

              {/* col 2: time + glyph, left-aligned at longest-name boundary (via --name-col) */}
              <div
                className="wc-col wc-timewrap"
                role="cell"
                aria-live="polite"
              >
                <span className="wc-time">{timeStr}</span>
                <span className={`wc-glyph ${status}`} aria-hidden="true" />
              </div>

              {/* col 3: flexible filler */}
              <div className="wc-col wc-fill" role="cell" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
