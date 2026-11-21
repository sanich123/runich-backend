# Backend observability

## Application metrics

The API exposes Prometheus metrics at `GET /metrics`. The endpoint is available to
containers on the Compose network; the API Nginx virtual host returns `404` for
public requests to `/metrics`.

The endpoint exports:

- `runich_http_requests_total` by HTTP method, route template, and status class.
- `runich_http_request_duration_seconds` with histogram buckets for the same labels.
- `runich_operation_duration_seconds` for database and external operations.
- Node.js process and runtime metrics with the `runich_` prefix.

Use route templates and bounded labels. Do not add user IDs, request IDs, or full
URLs as Prometheus labels.

Example PromQL for API p95 latency:

```promql
histogram_quantile(
  0.95,
  sum by (le, route) (
    rate(runich_http_request_duration_seconds_bucket{job="runich/backend", environment="production"}[5m])
  )
)
```

Example PromQL for the 5xx request ratio:

```promql
sum(rate(runich_http_requests_total{job="runich/backend", environment="production", status_class="5xx"}[5m]))
/
sum(rate(runich_http_requests_total{job="runich/backend", environment="production"}[5m]))
```

The `LatencyMetricsService` currently feeds application observations into this
endpoint. Grafana Alloy must scrape `/metrics` and forward the samples to the
Grafana Cloud Prometheus remote-write endpoint before these queries return data.
Remote-write URL, instance username, and token belong in the deployment secret
store and runtime environment, never in this file or source control.

## Logs

Grafana Alloy sends API and worker container logs to Loki. Nginx access logs are
restricted to HTTP 5xx responses and include the host, URI without query string,
status, request duration, and upstream duration. This provides a separate signal
for failures at the public edge, including `502` and `504` responses that never
reach NestJS.

For a Loki metric alert, wrap a log selector in `count_over_time` or `rate` and
compare the resulting number with a threshold. If no lines match, Loki returns
no series; configure the alert's no-data behavior as `Normal` when no matching
errors is the expected healthy state.

The Grafana Cloud `runich-production` evaluation group sends these log alerts to
the `Runich Production 500 errors` contact point:

- Any NestJS HTTP `500` log entry in a rolling 5-minute window.
- Three or more Nginx `502`, `503`, or `504` responses in 5 minutes.
- Any unhandled exception, unhandled Promise rejection, or API/worker startup
  failure in 5 minutes.
- Five or more background worker cycle errors in 10 minutes.

All four rules treat no matching logs as a normal state. The edge alert depends
on the updated Nginx 5xx-only access log and Alloy discovery configuration being
deployed; until then it has no Nginx log data to evaluate.
