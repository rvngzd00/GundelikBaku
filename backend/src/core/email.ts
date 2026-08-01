import { env } from '../config/env.js';
import { AppError } from './errors.js';

type EmailMessage = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.EMAIL_PROVIDER === 'disabled') {
    if (env.NODE_ENV === 'production') {
      throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'E-poçt xidməti müvəqqəti əlçatan deyil');
    }
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html })
  });
  if (!response.ok) {
    throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'E-poçtu göndərmək mümkün olmadı');
  }
}

export function authEmailTemplate(title: string, text: string, actionLabel: string, actionUrl: string): string {
  const safeUrl = actionUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<!doctype html><html lang="az"><body style="margin:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#17191e"><div style="max-width:580px;margin:32px auto;background:#fff;border-radius:16px;padding:36px"><h1 style="margin:0 0 18px;color:#3151df;font-size:26px">${title}</h1><p style="font-size:15px;line-height:1.7">${text}</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:13px 22px;border-radius:7px;background:#3151df;color:#fff;text-decoration:none;font-weight:700">${actionLabel}</a></p><p style="color:#747985;font-size:12px;line-height:1.6">Bu keçidi siz tələb etməmisinizsə, mesajı nəzərə almayın. Gündəlik Bakı komandası.</p></div></body></html>`;
}
