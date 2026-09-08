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
| Открыть Prisma Studio | См. раздел [Prisma Studio](#prisma-studio) |

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

## Prisma Studio

Prisma Studio предоставляет полный доступ на чтение и изменение данных. Не
публикуйте порт `5555` во внешний интерфейс, не добавляйте его в firewall и не
размещайте Studio за общедоступным доменом. Запускайте Studio на рабочем Mac, а
через SSH-туннель подключайте только PostgreSQL production-сервера.

Понадобятся два терминала на рабочем Mac.

В первом терминале откройте туннель от локального порта `15432` до PostgreSQL,
который на Timeweb-сервере доступен только через `127.0.0.1:5432`:

```bash
ssh -N -L 15432:127.0.0.1:5432 runich-timeweb
```

Оставьте туннель запущенным. Он не открывает PostgreSQL во внешний интернет.

Во втором локальном терминале перейдите в локальный checkout и запустите
production-команду Studio:

```bash
cd /Users/sanich123/Desktop/runich-backend/project
yarn db:studio:production
```

Команда проверяет локальный туннель, получает `DATABASE_URL` из уже работающего
API-контейнера по SSH, заменяет host и port на локальный конец туннеля и запускает
`yarn db:studio`. Значение не выводится в терминал, не попадает в историю команд
и не записывается в файл. Параметр `schema=public` удаляется из URL намеренно:
Prisma Studio 7 подключается к PostgreSQL напрямую, а `public` и без него
является схемой по умолчанию.

После этого откройте в браузере <http://127.0.0.1:5555>. Не выполняйте
изменения, если нужен только просмотр: Studio сохраняет правки непосредственно
в production PostgreSQL.

Чтобы завершить работу:

1. Нажмите `Ctrl+C` в терминале со Studio.
2. Нажмите `Ctrl+C` в терминале с SSH-туннелем.

Если локальный порт `15432` занят, не останавливайте неизвестный процесс.
Выберите другой свободный порт, например `15433`, в обеих локальных командах:

```bash
ssh -N -L 15433:127.0.0.1:5432 runich-timeweb
```

Передайте тот же порт команде запуска Studio:

```bash
RUNICH_STUDIO_DATABASE_PORT=15433 yarn db:studio:production
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

Prisma Studio из предыдущего раздела также позволяет изменять production-данные.
Следующие команды перезапускают сервисы, поэтому используйте их только
намеренно.

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
