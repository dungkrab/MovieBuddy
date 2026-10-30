import type { SmsProvider } from "./provider";
export class ConsoleSmsProvider implements SmsProvider {
  readonly isConsole = true;
  async send(to: string, body: string) { console.log(`[SMS → ${to}] ${body}`); }
}
