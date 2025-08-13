import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";
import "./BoardView.css";

const monday = mondaySdk();

export default function BoardView() {
  const [users, setUsers] = useState([]);
  const [prefs, setPrefs] = useState({});

  // Load saved settings (timezone)
  useEffect(() => {
    monday.storage.getItem("workclock:user:settings").then((res) => {
      const raw = res?.data?.value;
      let normalized = {};

      if (typeof raw === "string") {
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

  // Load people from board
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

      // use the first People column we find
      const board = data.boards?.[0];
      const peopleColumnId = board?.columns?.[0]?.id; // may be something like "person"

      const items = board?.items_page?.items ?? [];

      // collect distinct user IDs from column_values where type === "people" or id matches
      const userIds = new Set();
      items.forEach(({ column_values }) => {
        column_values.forEach((cv) => {
          const isPeopleCol =
            cv.type === "people" ||
            (peopleColumnId && cv.id === peopleColumnId);
          if (isPeopleCol && cv.value) {
            try {
              const parsed = JSON.parse(cv.value);
              (parsed.personsAndTeams || [])
                .filter((p) => p.kind === "person")
                .forEach((p) => userIds.add(p.id));
            } catch {}
          }
        });
      });

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

      // Keep mock statuses for now
      const MOCK = [
        { status: "working" },
        { status: "lastHour" },
        { status: "off" },
      ];

      const enriched = userRes.users.map((u, i) => ({
        ...u,
        status: MOCK[i % MOCK.length].status,
      }));
      setUsers(enriched);
    });
  }, []);

  return (
    <div className="people-list">
      {users.length === 0
        ? "No people assigned yet."
        : users.map((u) => (
            <div key={u.id} className="person">
              <img src={u.photo_thumb_small} alt="" className="avatar" />
              <span className="name">{u.name}</span>
              <span className={`dot ${u.status}`} />
              {/* Use saved timezone here */}
              <span className="tz">{prefs?.timezone ?? "UTC"}</span>
            </div>
          ))}
    </div>
  );
}
