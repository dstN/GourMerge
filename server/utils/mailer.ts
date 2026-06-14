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
  const from = process.env.SMTP_FROM || user

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
