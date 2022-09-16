import dotenv from "dotenv";
import { pRateLimit } from "p-ratelimit";
import twilio from "twilio";
import fs from "fs";

dotenv.config();

const { ACCOUNT_SID, AUTH_TOKEN, MSG_SVC_SID, TO } = process.env;
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

const concurrency = 70;

const limit = pRateLimit({
  concurrency,
  interval: 1000,
  rate: 100, // 100 / second
});

let isComplete = false;

let connections = 0;
let scheduled = 0;
let errorCount = 0;
const start = Date.now();

const retryQueue = [];

let idx = 0;

let printInterval = setInterval(print, 500);

let sleepCounter = 0;

setInterval(() => {
  sleepCounter = Math.max(sleepCounter, 0);
  if (sleepCounter > 0) return --sleepCounter;

  if (scheduled >= 250000) isComplete = true;
  if (isComplete) {
    clearInterval(printInterval);
    print();

    process.exit();
  }

  if (connections >= concurrency) return;
  else if (idx < 250000) limit(() => scheduleMessage(++idx));
  else limit(() => handleRetry(retryQueue.shift()));
}, 5);

async function scheduleMessage(idx: number) {
  try {
    connections++;
    await client.messages.create({
      body: `Bulk Message # ${idx}`,
      messagingServiceSid: MSG_SVC_SID,
      scheduleType: "fixed",
      sendAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2 + 500 * idx),
      to: TO,
    });
    connections--;
    scheduled++;
  } catch (error) {
    connections--;
    errorCount++;
    retryQueue.push(idx);
    write(error);
  }
}

async function handleRetry(idx: number) {
  await new Promise((resolve) => setTimeout(() => resolve(null), 100));
  scheduleMessage(idx);
}

function write(err: any) {
  const str = `${JSON.stringify(err)}\n`;

  if (fs.existsSync("error.log")) fs.appendFileSync("error.log", str);
  else fs.writeFileSync("error.log", str);
}

function print() {
  const totalSeconds = (Date.now() - start) / 1000;
  const totalMinutes = totalSeconds / 60;

  const msgsPerMin = scheduled / totalMinutes;
  const msgsPerSec = scheduled / totalSeconds;

  const estimatedCompletionTime = 250000 / msgsPerMin;

  if (!isComplete) console.clear();
  process.stdout.write(`
  Running Time.................... ${
    Math.floor(totalMinutes / 60) > 0
      ? `${Math.floor(totalMinutes / 60).toLocaleString()} Hours, `
      : ""
  }${
    Math.floor(totalMinutes % 60) > 0
      ? `${Math.floor(totalMinutes % 60).toLocaleString()} Minutes, `
      : ""
  }${Math.round(totalSeconds % 60)} Seconds
  Estimated Completion Time....... ${Math.floor(
    estimatedCompletionTime
  ).toLocaleString()} Minutes, ${Math.round(totalSeconds % 60)} Seconds

  Scheduled....................... ${scheduled.toLocaleString()}
  Scheduled / Minute.............. ${Math.round(msgsPerMin).toLocaleString()}
  Scheduled / Second.............. ${Math.round(msgsPerSec).toLocaleString()}

  Connections..................... ${connections.toLocaleString()}
  Errors.......................... ${errorCount.toLocaleString()}

  Record Index.................... ${idx.toLocaleString()}
  Retry Queue Length.............. ${retryQueue.length.toLocaleString()}
  `);
}
