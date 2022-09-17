import dotenv from "dotenv";
import fs from "fs";
import { pRateLimit } from "p-ratelimit";
import twilio from "twilio";

dotenv.config();

const { ACCOUNT_SID, AUTH_TOKEN, TO } = process.env;
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

const concurrency = 95;
const start = Date.now();
const stopped = [];
let connections = 0;
let deleted = 0;
let errorCount = 0;
let updated = 0;

const limit = pRateLimit({
  concurrency,
  interval: 1000,
  rate: 100, // 100 / second
});

let toDelete = [];
let toUpdate = [];

setInterval(() => {
  if (concurrency <= connections) return;

  if (toUpdate.length) limit(() => unscheduleMessage(toUpdate.shift()));
  else if (toDelete.length) limit(() => removeMessage(toDelete.shift()));
}, 10);

startRound(stopped.length);

setInterval(restart, 1000 * 60 * 5);
function restart() {
  stopped.push(stopped.length);
  toDelete = [];
  toUpdate = [];
  startRound(stopped.length + 1);
}

function startRound(idx: number) {
  client.messages.each({}, (msg, done) => {
    if (msg.status === "scheduled") toUpdate.push(msg.sid);
    else toDelete.push(msg.sid);
    if (stopped.includes(idx)) done();
  });
}

async function removeMessage(sid: string) {
  try {
    connections++;
    await client.messages(sid).remove();
    deleted++;
  } catch (error) {
    errorCount++;
    write(error);
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
    write(error);
  } finally {
    connections--;
  }
}

function write(err: any) {
  try {
    const str = `${JSON.stringify(err)}\n`;

    if (fs.existsSync("error.log")) fs.appendFileSync("error.log", str);
    else fs.writeFileSync("error.log", str);
  } catch (error) {}
}

setInterval(print, 500);
print();

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
  Reset / Minute................. ${Math.round(totalPerMinute).toLocaleString()}
  Reset / Second................. ${Math.round(totalPerSecond).toLocaleString()}

  Total Reset.................... ${total.toLocaleString()}
  Deleted Count.................. ${deleted.toLocaleString()}
  Updated Count.................. ${updated.toLocaleString()}

  Delete Queue Length............ ${toDelete.length.toLocaleString()}
  Update Queue Length............ ${toUpdate.length.toLocaleString()}
  Error Count.................... ${errorCount.toLocaleString()}

  Total Rounds................... ${stopped.length}
  Connections.................... ${connections.toLocaleString()}
  `);
}
