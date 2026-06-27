export type SmsTemplateVars = Record<string, string>;

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function renderSmsTemplate(
  template: string,
  vars: SmsTemplateVars
): string {
  return template.replace(PLACEHOLDER, (_, key: string) => vars[key] ?? "");
}

export const DEFAULT_CREDIT_SMS_TEMPLATE =
  "SUPAFUNDI: Habari {{name}}, deni lako ni {{balance}}. Tafadhali lipa haraka iwezekanavyo. Simu: {{shopPhone}}. Asante.";

export const DEFAULT_MARKETING_SMS_TEMPLATE =
  "SUPAFUNDI: {{message}} Tembelea duka letu au piga {{shopPhone}}.";
