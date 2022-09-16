import dotenv from "dotenv";
import { pRateLimit } from "p-ratelimit";
import twilio from "twilio";

dotenv.config();

const { ACCOUNT_SID, AUTH_TOKEN } = process.env;
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
const start = Date.now();

const errors = [];
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

    let errIdx = 0;
    for (const error of errors) console.error(`== Error ${errIdx}==`, error);

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
      messagingServiceSid: "MG6ed676f3ef93d47374423a5342948a4a",
      scheduleType: "fixed",
      sendAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2 + 500 * idx),
      to: "+18475070348",
    });
    connections--;
    scheduled++;
  } catch (error) {
    connections--;
    errors.push(error);
    retryQueue.push(idx);
  }
}

async function handleRetry(idx: number) {
  await new Promise((resolve) => setTimeout(() => resolve(null), 100));
  scheduleMessage(idx);
}

function print() {
  const totalSeconds = (Date.now() - start) / 1000;
  const totalMinutes = totalSeconds / 60;

  const msgsPerMin = scheduled / totalMinutes;
  const msgsPerSec = scheduled / totalSeconds;

  const estimatedCompletionTime = 250000 / msgsPerMin;

  if (!isComplete) console.clear();
  process.stdout.write(`
  Running Time.................... ${Math.floor(
    totalMinutes
  ).toLocaleString()} Minutes, ${Math.round(totalSeconds % 60)} Seconds
  Estimated Completion Time....... ${Math.floor(
    estimatedCompletionTime
  ).toLocaleString()} Minutes, ${Math.round(totalSeconds % 60)} Seconds

  Scheduled....................... ${scheduled.toLocaleString()}
  Scheduled / Minute.............. ${Math.round(msgsPerMin).toLocaleString()}
  Scheduled / Second.............. ${Math.round(msgsPerSec).toLocaleString()}

  Connections..................... ${connections.toLocaleString()}
  Errors.......................... ${errors.length.toLocaleString()}

  Record Index.................... ${idx.toLocaleString()}
  Retry Queue Length.............. ${retryQueue.length.toLocaleString()}
  `);
}
