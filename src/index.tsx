/** @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import { App } from "./components/App";
import { Logger } from "./lib/logger";

// Perform hygiene on startup
Logger.rotateLogs("system.log", 5 * 1024 * 1024); // 5MB limit
Logger.rotateLogs("error.log", 2 * 1024 * 1024);
Logger.rotateLogs("deploy_error.log", 2 * 1024 * 1024);

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  useMouse: true,
  enableMouseMovement: true
});

createRoot(renderer).render(<App />);
