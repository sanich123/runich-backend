import sharp from 'sharp';
import { DEPLOYMENT_TEST_ROUTE } from './deployment-test-route';
import {
  collectOperationalMetrics,
  formatOperationalMetricsText,
  getOperationalMetricRows,
} from './operational-metrics';
import { escapeHtml, OPERATIONAL_METRICS_RECIPIENT, sendWithConfiguredSmtp } from './send-email';
import { renderRunichVectorMap } from '../src/common/maps/static-map.vector';
import { calculateStaticMapViewport, getErrorMessage, validateStaticMap } from '../src/common/maps/static-map.utils';

const mapContentId = 'runich-deployment-test-route@runich';
const environment = process.env.APP_ENV?.trim();
const commit = process.env.DEPLOY_SHA?.trim();
const runUrl = process.env.DEPLOY_RUN_URL?.trim();
const tlsCertificateExpiryEntries = (process.env.TLS_CERTIFICATE_EXPIRY ?? '')
  .split('\n')
  .map((line) => {
    const match = /^([^:\n]+):\s*(.+)$/.exec(line.trim());
    return match ? { domain: match[1], expiry: match[2] } : undefined;
  })
  .filter((entry): entry is { domain: string; expiry: string } => entry !== undefined);

if (environment !== 'stage' && environment !== 'production') {
  throw new Error('APP_ENV must be stage or production to send a deployment notice.');
}
if (!commit || !runUrl) {
  throw new Error('DEPLOY_SHA and DEPLOY_RUN_URL must be provided for a deployment notice.');
}
if (tlsCertificateExpiryEntries.length === 0) {
  throw new Error('TLS_CERTIFICATE_EXPIRY must include the deployed certificate expiry dates.');
}
const tlsCertificateExpiryText = [
  'TLS certificate expiry:',
  ...tlsCertificateExpiryEntries.map(({ domain, expiry }) => `  ${domain}: ${expiry}`),
].join('\n');
const tlsCertificateExpiryHtml = `<ul style="margin:0 0 24px;padding-left:20px">${tlsCertificateExpiryEntries
  .map(({ domain, expiry }) => `<li><strong>${escapeHtml(domain)}:</strong> ${escapeHtml(expiry)}</li>`)
  .join('')}</ul>`;

const deploymentEnvEntries = (process.env.DEPLOY_ENV_REPORT ?? '')
  .split(',')
  .map((entry) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):(set|empty)$/.exec(entry);
    return match ? { key: match[1], status: match[2] } : undefined;
  })
  .filter((entry): entry is { key: string; status: string } => entry !== undefined);
const deploymentEnvText = deploymentEnvEntries.length
  ? [
      'Deployment .env keys (values are intentionally omitted):',
      ...deploymentEnvEntries.map(({ key, status }) => `  ${key}: ${status}`),
    ].join('\n')
  : 'Deployment .env key status is unavailable.';
const deploymentEnvHtml = deploymentEnvEntries.length
  ? `<table style="border-collapse:collapse;width:100%;margin:0 0 24px"><tbody>${deploymentEnvEntries
      .map(
        ({ key, status }) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#52606d">${escapeHtml(key)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(status)}</td></tr>`,
      )
      .join('')}</tbody></table>`
  : '<p style="margin:0 0 24px;color:#8a1c1c">Environment key status is unavailable.</p>';

async function renderDeploymentTestMap() {
  try {
    const viewport = calculateStaticMapViewport(DEPLOYMENT_TEST_ROUTE);
    const webpImage = await renderRunichVectorMap(DEPLOYMENT_TEST_ROUTE, viewport.center, viewport.zoom);
    await validateStaticMap(webpImage);

    const pngImage = await sharp(webpImage).png().toBuffer();
    const metadata = await sharp(pngImage).metadata();
    if (metadata.format !== 'png' || metadata.width !== 896 || metadata.height !== 538) {
      throw new Error('Generated route image has an unexpected format or size.');
    }

    return pngImage;
  } catch (error) {
    throw new Error(`Could not render the deployment test route map: ${getErrorMessage(error)}`, { cause: error });
  }
}

const metricTableRows = (rows: ReturnType<typeof getOperationalMetricRows>) =>
  rows
    .map(
      ({ label, value }) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#52606d">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

let metricsText = 'Metrics unavailable: the read-only database snapshot failed.';
let metricsHtml = '<p style="margin:0;color:#8a1c1c">Database metrics unavailable.</p>';
try {
  const metrics = await collectOperationalMetrics();
  metricsText = formatOperationalMetricsText(metrics);
  metricsHtml = `<table style="border-collapse:collapse;width:100%;margin:0 0 24px">${metricTableRows(getOperationalMetricRows(metrics))}</table>`;
} catch (error) {
  console.warn('Could not collect operational metrics for deployment email:', getErrorMessage(error));
}

const routeMap = await renderDeploymentTestMap();
const message = (sender: string) => ({
  from: `Runich <${sender}>`,
  to: OPERATIONAL_METRICS_RECIPIENT,
  subject: `[Runich] ${environment} deploy succeeded (${commit.slice(0, 7)})`,
  text: [
    'Runich deployment succeeded.',
    `Environment: ${environment}`,
    `Commit: ${commit}`,
    `GitHub Actions run: ${runUrl}`,
    tlsCertificateExpiryText,
    deploymentEnvText,
    metricsText,
    'The deployment test route map is included as an inline image.',
  ].join('\n'),
  html: [
    '<!doctype html>',
    '<html><body style="margin:0;padding:24px;background:#f4f6f8;color:#202a33;font:15px/1.5 Arial,sans-serif">',
    '<main style="max-width:896px;margin:0 auto;padding:24px;background:#fff;border-radius:12px">',
    '<h1 style="margin:0 0 16px;font-size:22px">Runich deployment succeeded</h1>',
    `<p style="margin:4px 0"><strong>Environment:</strong> ${escapeHtml(environment)}</p>`,
    `<p style="margin:4px 0"><strong>Commit:</strong> ${escapeHtml(commit)}</p>`,
    `<p style="margin:4px 0 20px"><a href="${escapeHtml(runUrl)}">GitHub Actions run</a></p>`,
    '<h2 style="margin:0 0 10px;font-size:17px">TLS certificate validity</h2>',
    tlsCertificateExpiryHtml,
    '<h2 style="margin:0 0 10px;font-size:17px">Deployment environment key status</h2>',
    '<p style="margin:0 0 8px;color:#52606d">Values are omitted; only variable names and whether each is set are included.</p>',
    deploymentEnvHtml,
    '<h2 style="margin:0 0 10px;font-size:17px">Operational snapshot</h2>',
    metricsHtml,
    '<h2 style="margin:0 0 10px;font-size:17px">Deployment test route</h2>',
    `<img src="cid:${mapContentId}" width="896" alt="Map preview of the fixed deployment test route" style="display:block;width:100%;max-width:896px;height:auto;border-radius:8px">`,
    '</main></body></html>',
  ].join(''),
  attachments: [
    {
      filename: 'runich-deployment-test-route.png',
      content: routeMap,
      contentType: 'image/png',
      contentDisposition: 'inline' as const,
      cid: mapContentId,
    },
  ],
});

const sendingProvider = await sendWithConfiguredSmtp(message);
console.log(`Deployment success email with route map accepted by ${sendingProvider} SMTP for ${environment}.`);
