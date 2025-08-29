import React, { useEffect, useRef, useState } from "react";
import mondaySdk from "monday-sdk-js";
import "./BoardView.css";
import { computeStatusForNow } from "../utils/time";

const monday = mondaySdk();

// curated IANA timezone list for the inline editor dropdown
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

// dev logging helper at module scope
const isDev =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.MODE !== "production") ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV !== "production");

// Helper to debug only in development
const dbg = (...args) => {
  if (!isDev) return;
  try {
    console.debug("[BoardView]", ...args);
  } catch {}
};

export default function BoardView() {
  const [users, setUsers] = useState([]);
  const [prefs, setPrefs] = useState({});
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortCriteria, setSortCriteria] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [openTooltip, setOpenTooltip] = useState(null);
  const [hasPeopleColumn, setHasPeopleColumn] = useState(true);
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editTemp, setEditTemp] = useState({
    timezone: "",
    startHour: "09:00",
    endHour: "17:00",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const rootRef = useRef(null);
  const listenerRef = useRef(null);
  const intervalRef = useRef(null);

  // Load settings
  useEffect(() => {
    monday.storage.getItem("workclock:user:settings").then((res) => {
      let saved = {};
      try {
        const raw = res?.data?.value;
        saved = typeof raw === "string" ? JSON.parse(raw) : raw || {};
      } catch {}
      setPrefs(saved || {});
      // restore sort choices if present
      if (saved?.sortCriteria) setSortCriteria(saved.sortCriteria);
      if (saved?.sortDirection) setSortDirection(saved.sortDirection);
      // restore show-online-only preference
      if (typeof saved?.showOnlineOnly === "boolean")
        setShowOnlineOnly(!!saved.showOnlineOnly);
      // restore pagination pageSize if present
      if (saved?.pageSize) setPageSize(Number(saved.pageSize) || 10);
    });
  }, []);

  // Fetch assignees from People columns (guarded to prevent duplicate listeners in StrictMode)
  useEffect(() => {
    if (listenerRef.current) {
      // already registered
      return () => {};
    }

    const handler = async ({ data: { boardId } } = {}) => {
      if (!boardId) return;
      setLoading(true);

      try {
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
        setHasPeopleColumn((board?.columns || []).length > 0);
        const items = board?.items_page?.items ?? [];
        const ids = new Set();

        for (const it of items) {
          for (const cv of it.column_values) {
            const isPeople =
              cv.type === "people" || peopleColIds.includes(cv.id);
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

        // keep timezone info if available
        setUsers(ures?.users || []);
      } catch (err) {
        // ignore and clear loading
      } finally {
        setLoading(false);
      }
    };

    // register listener and store unsubscribe
    try {
      const unsub = monday.listen("context", handler);
      listenerRef.current = unsub;
      dbg("listener registered");
    } catch (err) {
      // failed to listen — ignore
      dbg("listener registration failed", err);
    }

    // Additionally, attempt one-time fetch of current context so we don't wait for an event
    monday.get("context").then((ctx) => {
      const boardId =
        ctx?.data?.boardId || ctx?.data?.boardId === 0
          ? ctx?.data?.boardId
          : ctx?.data?.boardId;
      // call handler with the same shape
      try {
        handler({ data: { boardId } });
      } catch {}
    });

    return () => {
      try {
        if (listenerRef.current) {
          listenerRef.current();
          listenerRef.current = null;
          dbg("listener unregistered");
        }
      } catch (e) {
        dbg("listener cleanup error", e);
      }
    };
  }, []);

  // Refresh every 2 min & on focus (guard to ensure a single interval per mount/StrictMode)
  useEffect(() => {
    if (intervalRef.current) {
      return () => {};
    }
    const id = setInterval(() => setTick((t) => t + 1), 120000);
    intervalRef.current = id;
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    dbg("Interval started");
    return () => {
      try {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          dbg("Interval stopped");
        }
      } catch {}
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

  // persist toggle for show-online-only
  const toggleShowOnline = async () => {
    const next = !showOnlineOnly;
    setShowOnlineOnly(next);
    const nextPrefs = { ...prefs, showOnlineOnly: next };
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
  const days = React.useMemo(
    () => prefs?.workDays || ["Mon", "Tue", "Wed", "Thu", "Fri"],
    [prefs?.workDays]
  );

  // Compute filtered users when showOnlineOnly is active
  const visibleUsers = React.useMemo(() => {
    if (!showOnlineOnly) return users;
    const mapping = prefs?.userTimezones || {};
    return users.filter((u) => {
      const mappedById = mapping[u.id];
      const mappedByName = mapping[u.name];
      const userTz = u.timezone || mappedById || mappedByName || tz;
      const status = computeStatusForNow(userTz, start, end, days).status;
      // treat both 'working' and 'lastHour' as "online"
      return status === "working" || status === "lastHour";
    });
  }, [users, showOnlineOnly, prefs, tz, start, end, days]);

  // Clamp page if visibleUsers changes
  useEffect(() => {
    const total = Math.max(1, Math.ceil(visibleUsers.length / pageSize));
    if (page > total) setPage(total);
  }, [visibleUsers.length, pageSize, page]);

  // Paged users to render
  const pagedUsers = React.useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return visibleUsers.slice(startIdx, startIdx + pageSize);
  }, [visibleUsers, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(visibleUsers.length / pageSize));
  const pageNumbers = React.useMemo(() => {
    const nums = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i);
      return nums;
    }
    nums.push(1);
    const left = Math.max(2, page - 2);
    const right = Math.min(totalPages - 1, page + 2);
    if (left > 2) nums.push("...");
    for (let i = left; i <= right; i++) nums.push(i);
    if (right < totalPages - 1) nums.push("...");
    nums.push(totalPages);
    return nums;
  }, [totalPages, page]);

  const openSettings = async () => {
    try {
      // Try to ask monday to open settings — the host may handle this event
      await monday.execute("settings");
    } catch (err) {
      try {
        await monday.execute("notice", {
          type: "info",
          message: "Open settings from the app gear in Monday UI.",
        });
      } catch {}
    }
  };

  // Helper: pure sort function for arrays of users
  const sortArray = React.useCallback(
    (arr, criteria, direction = "asc") => {
      const withIndex = arr.map((u, i) => ({ u, i }));

      const mapping = prefs?.userTimezones || {};
      const overrides = prefs?.userOverrides || {};

      const getKey = (user) => {
        if (criteria === "name") return (user.name || "").toLowerCase();

        if (criteria === "status") {
          const mappedById = mapping[user.id];
          const mappedByName = mapping[user.name];
          const userOverride = overrides[user.id] || {};
          const userTz =
            userOverride.timezone ||
            user.timezone ||
            mappedById ||
            mappedByName ||
            tz;
          const uStart = userOverride.startHour || start;
          const uEnd = userOverride.endHour || end;
          const s = computeStatusForNow(userTz, uStart, uEnd, days).status;
          const order = { working: 0, lastHour: 1, off: 2 };
          return order[s] ?? 3;
        }

        if (criteria === "timezone") {
          const mappedById = mapping[user.id];
          const mappedByName = mapping[user.name];
          const userOverride = overrides[user.id] || {};
          const userTz =
            userOverride.timezone ||
            user.timezone ||
            mappedById ||
            mappedByName ||
            tz ||
            "";
          return (userTz || "").toLowerCase();
        }

        return "";
      };

      withIndex.sort((a, b) => {
        const ka = getKey(a.u);
        const kb = getKey(b.u);
        if (ka < kb) return direction === "asc" ? -1 : 1;
        if (ka > kb) return direction === "asc" ? 1 : -1;
        return a.i - b.i;
      });

      return withIndex.map((x) => x.u);
    },
    [tz, start, end, days, prefs]
  );

  const applySort = async (criteria, direction = "asc") => {
    setSortCriteria(criteria);
    setSortDirection(direction);

    // persist into prefs storage
    const nextPrefs = {
      ...prefs,
      sortCriteria: criteria,
      sortDirection: direction,
    };
    setPrefs(nextPrefs);
    try {
      await monday.storage.setItem(
        "workclock:user:settings",
        JSON.stringify(nextPrefs)
      );
    } catch {}

    setUsers((prevUsers) => sortArray(prevUsers, criteria, direction));
  };

  const onSortClick = (criteria) => {
    if (criteria === sortCriteria) {
      const next = sortDirection === "asc" ? "desc" : "asc";
      applySort(criteria, next);
    } else {
      applySort(criteria, "asc");
    }
  };

  // Whenever sort choices change, re-sort any already-loaded users
  useEffect(() => {
    setUsers((prev) => sortArray(prev, sortCriteria, sortDirection));
  }, [sortCriteria, sortDirection, sortArray]);

  // If prefs were loaded with saved sort options, apply them (once)
  useEffect(() => {
    if (prefs?.sortCriteria || prefs?.sortDirection) {
      if (prefs.sortCriteria) setSortCriteria(prefs.sortCriteria);
      if (prefs.sortDirection) setSortDirection(prefs.sortDirection);
    }
    // only when prefs change
  }, [prefs]);

  // Per-user override handlers
  const startEdit = (u) => {
    const overrides = prefs?.userOverrides || {};
    const mapping = prefs?.userTimezones || {};
    const mappedById = mapping[u.id];
    const mappedByName = mapping[u.name];
    const o = overrides[u.id] || {};
    const resolvedTz =
      o.timezone || u.timezone || mappedById || mappedByName || tz;
    const s = o.startHour || prefs?.startHour || "09:00";
    const e = o.endHour || prefs?.endHour || "17:00";
    setEditTemp({ timezone: resolvedTz || "", startHour: s, endHour: e });
    setEditingUser(u.id);
    setOpenTooltip(u.id);
  };

  const saveOverride = async (userId) => {
    const old = prefs || {};
    const map = { ...(old.userOverrides || {}) };
    map[userId] = {
      timezone: editTemp.timezone || undefined,
      startHour: editTemp.startHour || undefined,
      endHour: editTemp.endHour || undefined,
    };
    const nextPrefs = { ...old, userOverrides: map };
    setPrefs(nextPrefs);
    try {
      await monday.storage.setItem(
        "workclock:user:settings",
        JSON.stringify(nextPrefs)
      );
      await monday.execute("notice", {
        type: "success",
        message: "Saved override.",
      });
    } catch {}
    setEditingUser(null);
    setOpenTooltip(null);
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setOpenTooltip(null);
  };

  if (loading) return <div className="wc-empty">Loading…</div>;
  if (!tz)
    return (
      <div className="wc-empty">
        <div>Settings incomplete — default timezone not set.</div>
        <button onClick={openSettings} style={{ marginTop: 8 }}>
          Open Settings
        </button>
      </div>
    );

  if (!hasPeopleColumn)
    return (
      <div className="wc-empty">
        Add a People column to this board to see teammates' clocks.
      </div>
    );

  if (hasPeopleColumn && !users.length)
    return (
      <div className="wc-empty">
        Assign teammates to a People column to see their clocks.
      </div>
    );

  // When the online-only filter is active but hides everyone, show a clearer message
  if (
    hasPeopleColumn &&
    users.length &&
    visibleUsers.length === 0 &&
    showOnlineOnly
  )
    return <div className="wc-empty">No teammates are online right now.</div>;

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
        <label className="wc-toggle">
          <input
            type="checkbox"
            checked={!!showOnlineOnly}
            onChange={toggleShowOnline}
          />
          Show online only
        </label>
      </div>

      <div
        className="wc-table"
        role="table"
        aria-label="Team local time and status"
      >
        <div className="wc-header" role="row" aria-hidden="false">
          <button
            onClick={() => onSortClick("name")}
            className={sortCriteria === "name" ? "active" : ""}
            aria-pressed={sortCriteria === "name"}
            aria-label={`Sort by Name, ${
              sortCriteria === "name" ? sortDirection : "asc"
            }`}
          >
            <span className="label">Name</span>
            <span className="sort-icon" aria-hidden>
              {sortCriteria === "name" ? (
                sortDirection === "asc" ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 15l6-6 6 6"
                      stroke="#0b66f6"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="#0b66f6"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )
              ) : (
                <svg
                  width="12"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 10l5-5 5 5M7 14l5 5 5-5"
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
          </button>

          <button
            onClick={() => onSortClick("status")}
            className={sortCriteria === "status" ? "active" : ""}
            aria-pressed={sortCriteria === "status"}
            aria-label={`Sort by Status, ${
              sortCriteria === "status" ? sortDirection : "asc"
            }`}
          >
            <span className="label">Status</span>
            <span className="sort-icon" aria-hidden>
              {sortCriteria === "status" ? (
                sortDirection === "asc" ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 15l6-6 6 6"
                      stroke="#0b66f6"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="#0b66f6"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )
              ) : (
                <svg
                  width="12"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 10l5-5 5 5M7 14l5 5 5-5"
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
          </button>

          <button
            onClick={() => onSortClick("timezone")}
            className={sortCriteria === "timezone" ? "active" : ""}
            aria-pressed={sortCriteria === "timezone"}
            aria-label={`Sort by Timezone, ${
              sortCriteria === "timezone" ? sortDirection : "asc"
            }`}
          >
            <span className="label">Timezone</span>
            <span className="sort-icon" aria-hidden>
              {sortCriteria === "timezone" ? (
                sortDirection === "asc" ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 15l6-6 6 6"
                      stroke="#0b66f6"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="#0b66f6"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )
              ) : (
                <svg
                  width="12"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 10l5-5 5 5M7 14l5 5 5-5"
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
          </button>
        </div>

        {pagedUsers.map((u) => {
          // Determine timezone: explicit on user, then mapping by id or name, then prefs.tz
          const mapping = prefs?.userTimezones || {};
          const mappedById = mapping[u.id];
          const mappedByName = mapping[u.name];
          const overrides = prefs?.userOverrides || {};
          const userOverride = overrides[u.id] || {};
          const userTz =
            userOverride.timezone ||
            u.timezone ||
            mappedById ||
            mappedByName ||
            tz;
          const usedAssumed = !u.timezone && !userOverride.timezone; // true if we used mapping or prefs
          const uStart = userOverride.startHour || start;
          const uEnd = userOverride.endHour || end;
          const { timeStr, status } = computeStatusForNow(
            userTz,
            uStart,
            uEnd,
            days
          );
          // Workday progress calculation (0..1)
          const toMinutes = (hhmm) => {
            const parts = (hhmm || "").split(":").map(Number);
            const h = parts[0] || 0;
            const m = parts[1] || 0;
            return h * 60 + m;
          };

          let progress = 0;
          try {
            const nowParts = new Intl.DateTimeFormat("en-CA", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: userTz,
            }).format(new Date());
            const curMin = toMinutes(nowParts);
            const sMin = toMinutes(start);
            const eMin = toMinutes(end);

            // Handle three cases:
            // 1) start === end -> treat as full-day shift
            // 2) eMin > sMin -> normal same-day shift
            // 3) eMin < sMin -> overnight shift (wraps past midnight)
            if (sMin === eMin) {
              // full day: progress is fraction of day
              const total = 24 * 60;
              const elapsed = curMin;
              progress = Math.min(1, Math.max(0, elapsed / total));
            } else if (eMin > sMin) {
              // normal same-day interval
              if (curMin <= sMin) progress = 0;
              else if (curMin >= eMin) progress = 1;
              else progress = (curMin - sMin) / (eMin - sMin);
            } else {
              // overnight: eMin < sMin (e.g., 22:00 -> 06:00)
              const total = 24 * 60 - sMin + eMin;
              const within = curMin >= sMin || curMin <= eMin;
              if (!within) {
                progress = 0;
              } else {
                let elapsed = 0;
                if (curMin >= sMin) elapsed = curMin - sMin;
                else elapsed = 24 * 60 - sMin + curMin;
                progress = Math.min(1, Math.max(0, elapsed / total));
              }
            }
          } catch {
            progress = 0;
          }
          // exact local time with seconds for tooltip
          let exactTime = "";
          try {
            exactTime = new Intl.DateTimeFormat([], {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
              timeZone: userTz,
            }).format(new Date());
          } catch {
            exactTime = timeStr;
          }
          const isOpen = openTooltip === u.id;
          return (
            <div
              key={u.id}
              className={`wc-row ${status} ${isOpen ? "open" : ""}`}
              role="row"
              tabIndex={0}
              aria-label={`${u.name}, ${status}, local time ${timeStr}`}
              onClick={() => setOpenTooltip(isOpen ? null : u.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpenTooltip(isOpen ? null : u.id);
                }
              }}
            >
              <div className="wc-col wc-name" role="cell">
                <img src={u.photo_thumb_small} alt="" className="wc-avatar" />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                  }}
                >
                  <span className="wc-name-text">{u.name}</span>
                  <div className="wc-name-meta">
                    <div className="wc-timeline" aria-hidden="true">
                      <div
                        className={`wc-timeline-fill ${status}`}
                        style={{ width: `${Math.round(progress * 100)}%` }}
                        aria-label={`Workday progress ${Math.round(
                          progress * 100
                        )} percent`}
                      />
                    </div>
                  </div>
                </div>
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
              <div className="wc-col wc-fill" role="cell" aria-hidden="false">
                <span
                  className="wc-tz"
                  aria-label={`Timezone: ${
                    userTz || prefs?.timezone || "default"
                  }`}
                >
                  {userTz || prefs?.timezone || "—"}
                  {usedAssumed && userTz ? (
                    <span className="assumed"> (assumed)</span>
                  ) : null}
                </span>
                <button
                  className="wc-edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(u);
                  }}
                >
                  Edit
                </button>
              </div>
              {/* Tooltip: appears on hover/focus, or when row is toggled open */}
              <div className="wc-tooltip" role="tooltip" aria-hidden={!isOpen}>
                {editingUser === u.id ? (
                  <div className="override-form">
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      {(() => {
                        const zones = TIMEZONES.slice();
                        if (
                          editTemp.timezone &&
                          !zones.includes(editTemp.timezone)
                        )
                          zones.unshift(editTemp.timezone);
                        return (
                          <select
                            value={editTemp.timezone || ""}
                            onChange={(e) =>
                              setEditTemp({
                                ...editTemp,
                                timezone: e.target.value,
                              })
                            }
                            style={{ flex: 1, padding: 6 }}
                          >
                            <option value="">(use default)</option>
                            {zones.map((z) => (
                              <option key={z} value={z}>
                                {z}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input
                        type="time"
                        value={editTemp.startHour}
                        onChange={(e) =>
                          setEditTemp({
                            ...editTemp,
                            startHour: e.target.value,
                          })
                        }
                        style={{ padding: 6 }}
                      />
                      <input
                        type="time"
                        value={editTemp.endHour}
                        onChange={(e) =>
                          setEditTemp({ ...editTemp, endHour: e.target.value })
                        }
                        style={{ padding: 6 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => saveOverride(u.id)}>Save</button>
                      <button onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="wc-tooltip-time">
                      Local now: {exactTime}
                    </div>
                    <div className="wc-tooltip-hours">
                      Work hours: {uStart}–{uEnd}{" "}
                      {Array.isArray(days) ? `(${days.join(",")})` : ""}
                    </div>
                    <div className="wc-tooltip-status">Status: {status}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination controls */}
      <div className="wc-pager" role="navigation" aria-label="Pagination">
        <div className="page-info">
          {visibleUsers.length === 0
            ? "0 items"
            : `${Math.min(
                (page - 1) * pageSize + 1,
                visibleUsers.length
              )}–${Math.min(page * pageSize, visibleUsers.length)} of ${
                visibleUsers.length
              }`}
        </div>

        <button
          className="page-btn"
          onClick={() => setPage(1)}
          disabled={page <= 1}
          aria-label="First page"
        >
          ⏮
        </button>

        <button
          className="page-btn"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          ◀
        </button>

        {/* Numbered page buttons */}
        {pageNumbers.map((n, idx) =>
          n === "..." ? (
            <span key={`e-${idx}`} className="page-info" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={`p-${n}`}
              className={`page-btn ${n === page ? "active" : ""}`}
              onClick={() => setPage(n)}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
            >
              {n}
            </button>
          )
        )}

        <button
          className="page-btn"
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          ▶
        </button>

        <button
          className="page-btn"
          onClick={() => setPage(totalPages)}
          disabled={page >= totalPages}
          aria-label="Last page"
        >
          ⏭
        </button>

        <label
          style={{
            marginLeft: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ color: "#64748b", fontSize: 12 }}>Per page</span>
          <select
            className="page-size"
            value={pageSize}
            onChange={async (e) => {
              const next = Number(e.target.value) || 10;
              setPageSize(next);
              setPage(1);
              const nextPrefs = { ...prefs, pageSize: next };
              setPrefs(nextPrefs);
              try {
                await monday.storage.setItem(
                  "workclock:user:settings",
                  JSON.stringify(nextPrefs)
                );
              } catch {}
            }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
    </div>
  );
}
