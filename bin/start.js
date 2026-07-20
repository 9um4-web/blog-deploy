#!/usr/bin/env node
require("dotenv").config();

const { loadConfig } = require("../src/config");
const { createApp } = require("../src/server");

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Listening for webhooks on 127.0.0.1:${config.port}`);
});
