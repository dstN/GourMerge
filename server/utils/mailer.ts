import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { logger } from './logger'

let _transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (_transporter) return _transporter

  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    // In dev: log emails to console instead of sending.
    _transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    })
    return _transporter
  }

  _transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  return _transporter
}

/**
 * Whether a **real** SMTP transport is configured.
 *
 * Matters because `getTransporter()` deliberately falls back to a `streamTransport`
 * when the credentials are missing, so `sendMail()` *succeeds* with nothing actually
 * delivered. That is the right trade for local dev — verification and reset mails
 * should not break a dev server — but it is dangerous for any job whose correctness
 * depends on delivery.
 *
 * The inactivity sweep is exactly such a job: it records "notice sent" and deletes
 * the account 24 hours later. With a silent stream transport, a missing SMTP
 * variable in production would turn into accounts deleted without ever being warned.
 * That sweep therefore refuses to run unless this returns true.
 */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export interface MailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@gourmerge.app'
  const transporter = getTransporter()

  try {
    const info = await transporter.sendMail({ from, ...opts })
    if (process.env.NODE_ENV !== 'production') {
      logger.info('email (dev mode — not sent)', { to: opts.to, subject: opts.subject })
    } else {
      logger.info('email sent', { to: opts.to, subject: opts.subject, messageId: info.messageId })
    }
  } catch (err) {
    logger.error('email send failed', { to: opts.to, subject: opts.subject, err: String(err) })
    throw createError({ statusCode: 500, statusMessage: 'Email delivery failed.' })
  }
}
