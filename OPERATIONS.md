# Runich Backend: production operations

Эта памятка содержит безопасные команды для просмотра состояния production-сервера Timeweb, логов API, worker миграции Strava и PostgreSQL.

## Подключение

На рабочем Mac настроен SSH alias `runich-timeweb`:

```bash
ssh runich-timeweb
cd /opt/runich-backend/project
```

Одноразовую команду можно выполнить без открытия интерактивной SSH-сессии:

```bash
ssh runich-timeweb 'cd /opt/runich-backend/project && docker compose ps'
```

Production Compose использует следующие сервисы:

| Сервис | Назначение |
| --- | --- |
| `nestjs_app` | HTTP API |
| `activity_migration_worker` | Фоновая обработка архивов Strava |
| `db` | PostgreSQL |

## Быстрый выбор команды

Все следующие команды выполняются после перехода в `/opt/runich-backend/project`.

| Что посмотреть | Команда |
| --- | --- |
| Состояние контейнеров | `docker compose ps` |
| Все свежие логи | `docker compose logs -f --tail=200` |
| Логи API | `docker compose logs -f --tail=200 nestjs_app` |
| Логи Strava worker | `docker compose logs -f --tail=200 activity_migration_worker` |
| Логи PostgreSQL | `docker compose logs -f --tail=100 db` |
| API и worker вместе | `docker compose logs -f --tail=200 nestjs_app activity_migration_worker` |
| Логи за последние 30 минут | `docker compose logs -t --since=30m nestjs_app activity_migration_worker` |
| Текущее потребление ресурсов | `docker stats --no-stream` |

`Ctrl+C` прекращает просмотр через `logs -f`, но не останавливает контейнеры.

## Фильтрация логов

Ошибки, предупреждения и сообщения миграции:

```bash
docker compose logs -f --tail=300 nestjs_app activity_migration_worker \
  | grep -Ei 'error|warn|migration|ошиб'
```

Сообщения конкретной задачи миграции:

```bash
docker compose logs -t --since=24h activity_migration_worker \
  | grep '<JOB_ID>'
```

Только готовый снимок логов без ожидания новых сообщений:

```bash
docker compose logs -t --tail=500 activity_migration_worker
```

Полезные параметры `docker compose logs`:

| Параметр | Действие |
| --- | --- |
| `-f` | Продолжать показывать новые сообщения |
| `-t` | Показывать временные метки |
| `--tail=200` | Ограничить количество последних строк |
| `--since=30m` | Показывать сообщения только за указанный период |

## Проверка API

Liveness проверяет, что HTTP-процесс работает:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/health/live
```

Readiness дополнительно проверяет соединение с PostgreSQL:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/health/ready
```

Ожидаемый readiness-ответ:

```json
{"status":"ok","checks":{"database":"ok"}}
```

## Очередь миграции Strava

Количество задач по статусам:

```bash
docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' -- \
  'SELECT status, COUNT(*) FROM "ActivityMigrationJob" GROUP BY status ORDER BY status;'
```

Последние десять задач:

```bash
docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' -- \
  'SELECT id, status, "totalActivities", "processedActivities", "importedActivities", "skippedActivities", "createdAt", "finishedAt" FROM "ActivityMigrationJob" ORDER BY "createdAt" DESC LIMIT 10;'
```

Эти запросы только читают данные и ничего не изменяют.

## Версия и состояние деплоя

```bash
git rev-parse --short HEAD
git status --short
docker compose images
docker compose ps
```

Параметры миграции зафиксированы в коде: архивы находятся в
`./dist/receivedArchive`, размер batch — 8, пауза — 25 мс, polling — 10 секунд,
лимит worker — 0.50 CPU. Они не передаются через `.env`.

Не выводите весь `.env` и не публикуйте вывод `docker compose config`: он может содержать production-секреты.

## Команды, изменяющие состояние

Следующие команды не нужны для обычного просмотра. Они перезапускают сервисы, поэтому используйте их только намеренно.

Перезапуск одного сервиса:

```bash
docker compose restart nestjs_app
docker compose restart activity_migration_worker
```

Пересборка и запуск API с worker:

```bash
docker compose up -d --build nestjs_app activity_migration_worker
```

После перезапуска снова выполните:

```bash
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:3000/health/ready
docker compose logs -t --tail=100 nestjs_app activity_migration_worker
```

## Резервная копия production `.env`

Защищённая резервная копия, созданная перед добавлением migration-переменных, находится вне Git-проекта и Docker build context:

```text
/root/runich-backend-env-backups/.env.backup-20260907T120251Z
```

Не копируйте её в репозиторий и не выводите её содержимое в терминал, логи или сообщения.
