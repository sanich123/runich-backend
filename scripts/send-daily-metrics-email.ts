import {
  collectOperationalMetrics,
  formatOperationalMetricsText,
  getOperationalMetricRows,
} from './operational-metrics';
import { escapeHtml, OPERATIONAL_METRICS_RECIPIENT, sendWithConfiguredSmtp } from './send-email';

const environment = process.env.APP_ENV?.trim();
if (environment !== 'production') {
  throw new Error('Daily operational metrics are enabled for production only.');
}

const metrics = await collectOperationalMetrics();
const rows = getOperationalMetricRows(metrics);
const capturedDate = new Date(metrics.capturedAt).toISOString().slice(0, 10);
const metricsText = formatOperationalMetricsText(metrics);
const metricsHtml = rows
  .map(
    ({ label, value }) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#52606d">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`,
  )
  .join('');

const message = (sender: string) => ({
  from: `Runich <${sender}>`,
  to: OPERATIONAL_METRICS_RECIPIENT,
  subject: `[Runich] production daily metrics (${capturedDate})`,
  text: ['Runich production operational metrics.', metricsText].join('\n\n'),
  html: [
    '<!doctype html>',
    '<html><body style="margin:0;padding:24px;background:#f4f6f8;color:#202a33;font:15px/1.5 Arial,sans-serif">',
    '<main style="max-width:640px;margin:0 auto;padding:24px;background:#fff;border-radius:12px">',
    '<h1 style="margin:0 0 16px;font-size:22px">Runich production metrics</h1>',
    `<p style="margin:4px 0 20px"><strong>Captured:</strong> ${escapeHtml(metrics.capturedAt)}</p>`,
    `<table style="border-collapse:collapse;width:100%">${metricsHtml}</table>`,
    '</main></body></html>',
  ].join(''),
});

const sendingProvider = await sendWithConfiguredSmtp(message);
console.log(`Daily operational metrics accepted by ${sendingProvider} SMTP for ${environment}.`);
