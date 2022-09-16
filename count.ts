import dotenv from "dotenv";
import { pRateLimit } from "p-ratelimit";
import twilio from "twilio";

dotenv.config();

const { ACCOUNT_SID, AUTH_TOKEN } = process.env;
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

let count = 0;

client.messages.each({}, () => {
  count++;
});

setInterval(() => {
  print();
}, 100);

let lastCount = 0;
function print() {
  if (lastCount === count) return;
  lastCount = count;
  console.clear();
  process.stdout.write(`Count: ${count.toLocaleString()}`);
}
