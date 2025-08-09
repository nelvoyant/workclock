import React, { useEffect } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

const BoardView = () => {
  useEffect(() => {
    monday.listen("context", (res) => {
      console.log("Board View Context:", res.data);
    });
  }, []);

  return (
    <div style={{ padding: "2rem" }}>
      <h2>👋 Hello from WorkClock Board View</h2>
      <p>This is your board context area.</p>
    </div>
  );
};

export default BoardView;
