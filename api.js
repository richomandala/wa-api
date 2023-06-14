require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const axios = require("axios");
const shelljs = require("shelljs");
const qrcode = require('qrcode-terminal');

const config = require("./config.json");
const { Client, LocalAuth } = require("whatsapp-web.js");

process.title = "whatsapp-node-api";
global.client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
  headless: true,
  args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // <- this one doesn't works in Windows
        '--disable-gpu', ]
  },
});

global.authed = false;

const app = express();

const port = process.env.PORT || config.port;
//Set Request Size Limit 50 MB
app.use(bodyParser.json({ limit: "50mb" }));

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

client.on("qr", (qr) => {
  qrcode.generate(qr, {small: true});
  fs.writeFileSync("./components/last.qr", qr);
});

client.on("authenticated", () => {
  console.log("AUTH!");
  authed = true;

  try {
    fs.unlinkSync("./components/last.qr");
  } catch (err) {}
});

client.on("auth_failure", () => {
  console.log("AUTH Failed !");
  process.exit();
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message", async (msg) => {
  // if (config.webhook.enabled) {
  //   if (msg.hasMedia) {
  //     const attachmentData = await msg.downloadMedia();
  //     msg.attachmentData = attachmentData;
  //   }
  //   axios.post(config.webhook.path, { msg });
  // }
  if (msg.body == "!ping") {
    msg.reply("pong");
  }
});
client.on("disconnected", () => {
  console.log("disconnected");
});
client.initialize();

const chatRoute = require("./components/chatting");
const groupRoute = require("./components/group");
const authRoute = require("./components/auth");
const contactRoute = require("./components/contact");

app.use(function (req, res, next) {
  console.log(req.method + " : " + req.path);
  console.log(req.body);
  next();
});
app.use("/chat", chatRoute);
app.use("/group", groupRoute);
app.use("/auth", authRoute);
app.use("/contact", contactRoute);

app.use("/public", express.static("public"));

app.listen(port, () => {
  console.log("Server Running Live on Port : " + port);
});
