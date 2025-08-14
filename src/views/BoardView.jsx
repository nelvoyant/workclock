import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";
import "./BoardView.css";
import { computeStatusForNow } from "../utils/time";

const monday = mondaySdk();

export default function BoardView() {
  const [users, setUsers] = useState([]);
  const [prefs, setPrefs] = useState({});
  const [tick, setTick] = useState(0); // drives re-render every 2 minutes
  const [loading, setLoading] = useState(true);

  // 1) Load saved settings once on mount
  useEffect(() => {
    monday.storage.getItem("workclock:user:settings").then((res) => {
      const raw = res?.data?.value;
      let normalized = {};
      try {
        normalized = typeof raw === "string" ? JSON.parse(raw) : raw || {};
      } catch {
        normalized = {};
      }
      setPrefs(normalized);
    });
  }, []);

  // 2) Listen for board context and fetch assigned users
  useEffect(() => {
    monday.listen("context", async ({ data: { boardId } }) => {
      if (!boardId) return;

      const { data } = await monday.api(
        `query ($board: [ID!]) {
          boards (ids: $board) {
            columns (types: people) { id title }
            items_page (limit: 200) {
              items {
                id
                name
                column_values {
                  id
                  type
                  text
                  value
                }
              }
            }
          }
        }`,
        { variables: { board: boardId } }
      );

      const board = data.boards?.[0];
      const peopleColumnId = board?.columns?.[0]?.id; // first People column
      const items = board?.items_page?.items ?? [];

      const userIds = new Set();
      for (const { column_values } of items) {
        for (const cv of column_values) {
          const isPeopleCol =
            cv.type === "people" ||
            (peopleColumnId && cv.id === peopleColumnId);
          if (isPeopleCol && cv.value) {
            try {
              const parsed = JSON.parse(cv.value);
              (parsed.personsAndTeams || [])
                .filter((p) => p.kind === "person")
                .forEach((p) => userIds.add(p.id));
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }

      if (userIds.size === 0) {
        setUsers([]);
        return;
      }

      const { data: userRes } = await monday.api(
        `query ($ids: [ID!]) {
          users (ids: $ids) { id name photo_thumb_small }
        }`,
        { variables: { ids: [...userIds] } }
      );

      setUsers(userRes.users || []);
    });
  }, []);

  // 3) Auto-refresh every 2 minutes + when tab regains focus
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120000);
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // set Loading while fetching users
  useEffect(() => {
    monday.listen("context", async ({ data: { boardId } }) => {
      if (!boardId) return;
      setLoading(true);

      try {
        const res = await monday.api(`query {
        users {
          id
          name
          photo_thumb_small
        }
      }`);

        setUsers(res?.data?.users || []);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <div className="people-list" data-tick={tick}>
      {loading ? (
        "Loading…"
      ) : users.length === 0 ? (
        <div style={{ color: "#666" }}>
          No people found. Add a <b>People</b> column on the board and assign at
          least one person.
        </div>
      ) : (
        users.map((u) => {
          const { timeStr, status } = computeStatusForNow(
            prefs?.timezone,
            prefs?.startHour || "09:00",
            prefs?.endHour || "17:00",
            prefs?.workDays || ["Mon", "Tue", "Wed", "Thu", "Fri"]
          );
          return (
            <div key={u.id} className="person">
              <img src={u.photo_thumb_small} alt="" className="avatar" />
              <span className="name">{u.name}</span>
              <span className={`dot ${status}`} />
              <span className="tz">{timeStr}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
