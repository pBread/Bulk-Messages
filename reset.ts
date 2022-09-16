import dotenv from "dotenv";
import { pRateLimit } from "p-ratelimit";
import twilio from "twilio";
import fs from "fs";

dotenv.config();

const { ACCOUNT_SID, AUTH_TOKEN } = process.env;
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

const concurrency = 70;
const start = Date.now();
let connections = 0;
let deleted = 0;
let errorCount = 0;
let updated = 0;

const limit = pRateLimit({
  concurrency,
  interval: 1000,
  rate: 100, // 100 / second
});

const toDelete = [];
const toUpdate = [];

setInterval(() => {
  if (concurrency <= connections) return;

  if (toUpdate.length) limit(() => unscheduleMessage(toUpdate.shift()));
  else if (toDelete.length) limit(() => removeMessage(toDelete.shift()));
}, 10);

client.messages.each({ to: "+18475070348" }, (msg) => {
  if (msg.status === "scheduled") toUpdate.push(msg.sid);
  else toDelete.push(msg.sid);
});

async function removeMessage(sid: string) {
  try {
    connections++;
    await client.messages(sid).remove();
    deleted++;
  } catch (error) {
    errorCount++;
    toDelete.push(sid);
  } finally {
    connections--;
  }
}

async function unscheduleMessage(sid: string) {
  try {
    connections++;
    await client.messages(sid).update({ status: "canceled" });
    updated++;
    toDelete.push(sid);
  } catch (error) {
    errorCount++;
    toUpdate.push(sid);
  } finally {
    connections--;
  }
}

setInterval(print, 500);

function print() {
  const totalSeconds = (Date.now() - start) / 1000;
  const totalMinutes = totalSeconds / 60;

  const total = updated + deleted;
  const totalPerSecond = total / totalSeconds;
  const totalPerMinute = total / totalMinutes;

  console.clear();
  console.log(`
  == Reset Script ===
  Running Time................... ${
    Math.floor(totalMinutes / 60) > 0
      ? `${Math.floor(totalMinutes / 60).toLocaleString()} Hours, `
      : ""
  }${
    Math.floor(totalMinutes % 60) > 0
      ? `${Math.floor(totalMinutes % 60).toLocaleString()} Minutes, `
      : ""
  }${Math.round(totalSeconds % 60)} Seconds
    Reset / Minute............... ${Math.round(totalPerMinute).toLocaleString()}
    Reset / Second............... ${Math.round(totalPerSecond).toLocaleString()}

  Total Reset.................... ${total.toLocaleString()}
    Deleted Count................ ${deleted.toLocaleString()}
    Updated Count................ ${updated.toLocaleString()}

  Delete Queue Length............ ${toDelete.length.toLocaleString()}
  Update Queue Length............ ${toUpdate.length.toLocaleString()}
  Error Count.................... ${errorCount.toLocaleString()}

  Connections.................... ${connections.toLocaleString()}
  `);
}
