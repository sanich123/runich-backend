# ONNX text moderation and worker CPU

## What can keep the worker busy

The ONNX toxicity classifier is called by `TextModerationWorkerService`, which is started by `src/app/background-worker.ts`. It is loaded lazily when the worker finds eligible text and then kept in memory for that process. The API process does not start this worker loop.

When there are no eligible pending rows, the moderation loop waits 5 seconds before checking again. When it finds a row, it claims and classifies it, then immediately checks for another row. A persisted moderation backlog can therefore keep ONNX busy even when the API receives no requests. Rows with an active moderation report are skipped. On worker startup, `processing` rows older than 15 minutes are requeued.

The production Compose service caps `background_worker` at one CPU. The Alloy configuration forwards container logs to Loki; it does not currently export per-container CPU metrics. A host-level CPU graph alone cannot attribute the observed load to ONNX.

## Guardrails and evidence

The ONNX Runtime session is configured for one intra-op thread, one inter-op thread, and sequential execution. This limits parallel inference inside the shared worker. It does not stop the worker from draining a large pending queue; that work is expected to consume CPU until the queue is drained.

The worker emits one `ONNX text moderation inference` summary per minute with the inference count, failures, average duration, and maximum duration. It logs zero counts too, and never includes text, user IDs, or row IDs. Compare these summaries with the `background_worker` CPU over the same interval:

- Inference runs alongside high worker CPU support the ONNX/backlog hypothesis.
- Zero inference runs alongside high worker CPU point to another background job or process.
- Low worker CPU with high host CPU points outside this container.

For a live check, sample `docker stats` for `background_worker` and `nestjs_app` over several minutes, then count eligible pending text rows in the database:

```sql
SELECT 'comment' AS target_type, COUNT(*) AS eligible_pending
FROM "Comment" c
WHERE c.moderation_status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM "ContentReport" r
    WHERE r.target_type = 'comment' AND r.target_id = c.id
      AND r.status IN ('open', 'in_review', 'appealed')
  )
UNION ALL
SELECT 'group_post', COUNT(*)
FROM "GroupPost" p
WHERE p.moderation_status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM "ContentReport" r
    WHERE r.target_type = 'group_post' AND r.target_id = p.id
      AND r.status IN ('open', 'in_review', 'appealed')
  )
UNION ALL
SELECT 'activity_text', COUNT(*)
FROM "Activity" a
WHERE a.text_moderation_status = 'pending'
  AND (NULLIF(BTRIM(a.title), '') IS NOT NULL OR NULLIF(BTRIM(a.description), '') IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "ContentReport" r
    WHERE r.target_type = 'activity_text' AND r.target_id = a.id
      AND r.status IN ('open', 'in_review', 'appealed')
  );
```

The previous production CPU observation is not enough to conclude that ONNX was the cause: the available Grafana pipeline contains logs, not worker CPU or queue-depth history. Use the new inference summaries, per-container CPU samples, and eligible-pending counts together to confirm or rule it out.
