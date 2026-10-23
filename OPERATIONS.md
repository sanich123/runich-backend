# Runich Backend: операции

Короткая памятка для Stage и Production на Timeweb. Секреты не выводить, не
коммитить и не передавать в аргументах команд.

## Подключение и быстрые проверки

Production:

```bash
ssh runich-timeweb
cd /opt/runich-backend/project
compose() { docker compose -f docker-compose.timeweb.yml "$@"; }
```

```bash
compose ps
compose logs --tail=200 nestjs_app background_worker
curl --fail --silent --show-error http://127.0.0.1:3000/health/live
curl --fail --silent --show-error http://127.0.0.1:3000/health/ready
curl --fail --silent --show-error https://api.runich-app.ru/health/ready
cat .deployed-sha
docker system df
```

`/health/ready` подтверждает API и PostgreSQL; дополнительно проверьте worker:

```bash
compose ps --status running nestjs_app background_worker grafana_alloy
```

Логи в Grafana Cloud Loki:

```logql
{job="runich/backend", environment="production", service="nestjs_app"}
```

Для Stage замените `environment` на `stage`. Доступны только логи API и worker.

## Деплой

### Stage

Push в ветку `stage` запускает `.github/workflows/deploy-stage-timeweb.yml`.
Workflow:

1. собирает образ точного коммита и передаёт его на Stage по SSH;
2. запускает `db_migrate`, затем API и worker;
3. проверяет API, worker, Grafana Alloy и `https://stage.runich-app.ru/health/ready`;
4. отправляет deployment-письмо и очищает Docker-кэш.

Stage хранит PostgreSQL и Let's Encrypt в named volumes. Не удаляйте их.
`/opt/runich-stage/.env` — единственный источник настроек Compose, API и worker;
файл должен иметь режим `0600`. При первом успешном Stage-деплое оставшийся
`app.env` объединяется в `.env`, проверяется до миграции и удаляется после
проверки readiness. Валидатор проверяет обязательные ключи для БД, API, S3,
модерации, OAuth, почты и Grafana, а также ожидаемые настройки конкретной среды.
Observe остаётся необязательным и включается только при наличии обеих его
переменных. Mail.ru SMTP fallback обязателен в обеих средах.

Обязательны в обеих средах: `DATABASE_URL_DOCKER`, `APP_ENV`, `JWT_SECRET`,
`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY`,
`S3_QUARANTINE_BUCKET`,
`S3_QUARANTINE_PREFIX`, `YANDEX_SMTP_USER`, `YANDEX_SMTP_PASSWORD`,
`YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `YANDEX_REDIRECT_URI`,
`VK_CLIENT_ID`, `VK_REDIRECT_URI`, `MAPBOX_ACCESS_TOKEN` и
`GRAFANA_LOKI_TOKEN`. Stage дополнительно требует `POSTGRES_USER`,
`POSTGRES_PASSWORD` и `POSTGRES_DB`. Mail.ru SMTP fallback требует оба ключа:
`MAILRU_SMTP_USER` и `MAILRU_SMTP_PASSWORD`. Пара Observe должна быть либо
полностью задана, либо полностью отсутствовать. `NSFWJS_MODEL_URL`,
`AUTH_FRONTEND_REDIRECT_URI` и ключ mock-seed остаются опциональными; без
`NSFWJS_MODEL_URL` worker использует встроенную модель.
`S3_ENDPOINT` обязателен в `.env`; регион `ru-1` задан в коде и в `.env` не
хранится. Stage может не задавать `S3_PUBLIC_URL` — он строится из endpoint и
bucket; Production задаёт его явно, чтобы ссылки шли через CDN.

### Production

Push в `master` или `workflow_dispatch` запускает
`.github/workflows/deploy-timeweb.yml`. Actions собирает образ
`production-<commit-sha>-<run-id>-<attempt>`, передаёт его на сервер, проверяет
чистый checkout, запускает миграцию, API, worker и Alloy, затем проверяет
локальный и публичный readiness. PostgreSQL — внешний Timeweb DBaaS, не Compose.

После readiness workflow пишет `.deployed-sha`, очищает Docker-образы и
BuildKit-кэш, затем отправляет deployment-письмо. Ошибка SMTP на финальном шаге
не откатывает уже здоровый релиз, но делает Actions job красным.

Ежедневный production-отчёт запускает
`.github/workflows/daily-production-metrics.yml` в 09:00 по Москве. Он выполняет
read-only snapshot внутри API-контейнера и отправляет агрегаты пользователей,
контента, очередей и PostgreSQL. Ошибка snapshot не влияет на сервис, но делает
сам отчёт неуспешным.

Ручной deploy допустим только образом из успешного Actions run и не параллельно
с workflow:

```bash
BACKEND_IMAGE='ghcr.io/sanich123/runich-backend:production-<sha>-<run>-<attempt>' \
  docker compose -f docker-compose.timeweb.yml up --no-build --force-recreate \
  --abort-on-container-exit --exit-code-from db_migrate db_migrate
BACKEND_IMAGE='ghcr.io/sanich123/runich-backend:production-<sha>-<run>-<attempt>' \
  docker compose -f docker-compose.timeweb.yml up -d --force-recreate \
  --remove-orphans --no-build nestjs_app background_worker
```

## Миграции Prisma

Production и Stage применяют только checked-in migrations через
`yarn db:migrate:prod`: создаётся `pg_trgm`, выполняются миграции, затем `migration
status` и `db verify`.

Для изменения схемы локально:

```bash
yarn db:generate
yarn prisma migration plan --name describe_the_change
yarn prisma migration show migrations/app/<migration_directory>
```

Закоммитьте совместимые код, контракт и миграцию вместе. `yarn db:sync` и
`prisma db update` — только local/bootstrap; не запускайте их на Stage/Production.
`prisma db sign` допустим только после доказательства, что реальная схема уже
совпадает с контрактом; это не замена миграции.

## Диск, логи и секреты

Оба deploy workflow после внутренней проверки API/worker/Alloy выполняют:

```bash
docker system prune --all --force
```

Production дополнительно очищает BuildKit-кэш:

```bash
docker builder prune --all --force
```

Ошибка очистки не откатывает уже здоровый deploy.

Никогда не используйте `docker compose down -v` или `docker system prune
--volumes`: это может удалить PostgreSQL/Let's Encrypt или другие данные.

Docker-логи ограничены `10 MB × 3`; application error log —
`/opt/runich-backend/project/logs.log`, его rotation задаётся
`deploy/logrotate/runich-backend`. После ручного изменения сервисов проверьте:

```bash
compose ps
compose logs --tail=100 nestjs_app background_worker
curl --fail --silent --show-error http://127.0.0.1:3000/health/ready
```

Production `.env` и Stage `.env` не должны попадать в Git. В Stage используется
bucket `runich-stage`, в Production — `runich-production`.

## SMTP и deployment-письмо

Основной SMTP: Yandex `smtp.yandex.ru:465` с application password. При transient
ошибке используется Mail.ru `smtp.mail.ru:465`, если заданы обе переменные:

```text
YANDEX_SMTP_USER
YANDEX_SMTP_PASSWORD
MAILRU_SMTP_USER       # required fallback
MAILRU_SMTP_PASSWORD   # required fallback
```

Deployment-письмо запускается внутри API-контейнера под Xvfb и включает карту
тестового маршрута. Оно отправляется только после readiness. Если SMTP не
работает, сначала отделите состояние сервиса от статуса уведомления; проверьте
сетевой доступ к SMTP и логи контейнера.

## PostgreSQL backup

Production PostgreSQL находится во внешнем Timeweb DBaaS. Backup выполняйте в
панели Timeweb или согласованным `pg_dump` через PostgreSQL-клиент; не пытайтесь
использовать `docker compose exec db` — такого production-сервиса нет.

Для custom dump обязательно проверьте архив:

```bash
pg_restore --list <backup.dump> >/dev/null
```

Храните несколько копий вне Git и отдельно от сервера. Перед переносом сначала
восстановите dump в пустую тестовую базу; старую БД не удаляйте до проверки.
