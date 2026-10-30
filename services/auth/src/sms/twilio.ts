import type { SmsProvider } from "./provider";
export class TwilioSmsProvider implements SmsProvider {
  readonly isConsole = false;
  async send(to: string, body: string) {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
    if (!sid || !token || !from) throw new Error("Twilio env is not configured");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}`);
  }
}
