/**
 * Faultsense Alpine conformance harness — minimal static Express server.
 *
 * Alpine.js is a purely client-side framework that runs against the
 * existing DOM: there's no backend to speak of, no compile step, no
 * module graph. So the "server" here just hands out index.html and the
 * symlinked agent/collector assets from /public.
 *
 * Kept on Express for consistency with the htmx harness rather than
 * dragging in a new static-server dependency.
 */
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3700;

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Faultsense Alpine harness listening on ${PORT}`);
});
