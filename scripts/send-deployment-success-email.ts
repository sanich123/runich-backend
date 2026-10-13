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

if (environment !== 'stage' && environment !== 'production') {
  throw new Error('APP_ENV must be stage or production to send a deployment notice.');
}
if (!commit || !runUrl) {
  throw new Error('DEPLOY_SHA and DEPLOY_RUN_URL must be provided for a deployment notice.');
}

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
