import { ConsoleSmsProvider } from "./console";
import type { SmsProvider } from "./provider";
import { TwilioSmsProvider } from "./twilio";

export function getSmsProvider(): SmsProvider {
  if (process.env.SMS_PROVIDER === "twilio") return new TwilioSmsProvider();
  if (process.env.NODE_ENV === "production") throw new Error("SMS_PROVIDER must be a real provider in production");
  return new ConsoleSmsProvider();
}
