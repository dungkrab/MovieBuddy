/** สลับผู้ให้บริการ SMS ได้โดย implement interface นี้ */
export interface SmsProvider {
  readonly isConsole: boolean;
  send(toE164: string, body: string): Promise<void>;
}
