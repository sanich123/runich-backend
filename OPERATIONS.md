# Runich Backend: production operations

Эта памятка содержит безопасные команды для просмотра состояния production-сервера Timeweb, логов API, фонового worker и PostgreSQL.

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

| Сервис                      | Назначение                       |
| --------------------------- | -------------------------------- |
| `nestjs_app`                | HTTP API                         |
| `background_worker`         | Миграции Strava, blurhash и очистка S3 |
| `db`                        | PostgreSQL                       |

## Быстрый выбор команды

Все следующие команды выполняются после перехода в `/opt/runich-backend/project`.

| Что посмотреть               | Команда                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| Состояние контейнеров        | `docker compose ps`                                                       |
| Все свежие логи              | `docker compose logs -f --tail=200`                                       |
| Логи API                     | `docker compose logs -f --tail=200 nestjs_app`                            |
| Логи background worker       | `docker compose logs -f --tail=200 background_worker`                      |
| Логи PostgreSQL              | `docker compose logs -f --tail=100 db`                                    |
| API и worker вместе          | `docker compose logs -f --tail=200 nestjs_app background_worker`          |
| Логи за последние 30 минут   | `docker compose logs -t --since=30m nestjs_app background_worker`         |
| Текущее потребление ресурсов | `docker stats --no-stream`                                                |

`Ctrl+C` прекращает просмотр через `logs -f`, но не останавливает контейнеры.

## Ротация логов

Приложение пишет только ошибки в `/opt/runich-backend/project/logs.log` через
bind mount `/app/logs.log`. Конфигурация
`deploy/logrotate/runich-backend` ротирует этот файл ежедневно и хранит два
архива. Установите её на production один раз:

```bash
sudo install -m 0644 deploy/logrotate/runich-backend /etc/logrotate.d/runich-backend
sudo logrotate -d /etc/logrotate.d/runich-backend
sudo logrotate -f /etc/logrotate.d/runich-backend
```

Для Docker-сервисов Compose задаёт `json-file` с ограничением `10 MB` на файл
и максимумом `3` файлов на контейнер. Это защищает диск от бесконтрольного
роста и обычно соответствует примерно двум дням при текущем объёме логов;
фактический срок зависит от интенсивности логирования. Проверка:

```bash
docker inspect --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  $(docker compose ps -q db nestjs_app background_worker)
docker system df
```

Не используйте `docker compose down -v` или `docker system prune --volumes` для
освобождения места: это может удалить named volume `pgdata`. После успешного
health check можно отдельно удалить только rebuildable BuildKit-кэш командой
`docker builder prune --all --force`; именованные volumes она не удаляет, но
следующая сборка заново скачает и соберёт очищенные слои.

### Проверка Yandex SMTP

Проверка ниже устанавливает TCP/TLS-соединение и выполняет SMTP-auth, но не
отправляет письмо:

```bash
docker compose exec -T nestjs_app node --input-type=module -e '
  import nodemailer from "nodemailer";
  const timeout = 15000;
  const transporter = nodemailer.createTransport({
    host: "smtp.yandex.ru",
    port: 465,
    secure: true,
    auth: { user: process.env.YANDEX_SMTP_USER, pass: process.env.YANDEX_SMTP_PASSWORD },
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
  });
  await transporter.verify();
  console.log("Yandex SMTP verify: OK");
  transporter.close();
'
```

Для проверки фактической доставки задайте адрес явно в текущей shell-сессии;
команда ниже отправляет одно нейтральное тестовое письмо и не печатает пароль:

```bash
: "${TEST_EMAIL:?Set TEST_EMAIL to an explicitly approved test recipient}"
docker compose exec -T -e TEST_EMAIL="$TEST_EMAIL" nestjs_app node --input-type=module -e '
  import nodemailer from "nodemailer";
  const user = process.env.YANDEX_SMTP_USER;
  const recipient = process.env.TEST_EMAIL;
  const transporter = nodemailer.createTransport({ host: "smtp.yandex.ru", port: 465, secure: true, auth: { user, pass: process.env.YANDEX_SMTP_PASSWORD } });
  const info = await transporter.sendMail({ from: `Runich <${user}>`, to: recipient, subject: "Runich SMTP test", text: "Runich Yandex SMTP delivery test." });
  console.log(JSON.stringify({ accepted: info.accepted?.length ?? 0, rejected: info.rejected?.length ?? 0 }));
  transporter.close();
'
```

## Фильтрация логов

Ошибки, предупреждения и сообщения миграции:

```bash
docker compose logs -f --tail=300 nestjs_app background_worker \
  | grep -Ei 'error|warn|migration|ошиб'
```

Сообщения конкретной задачи миграции:

```bash
docker compose logs -t --since=24h background_worker \
  | grep '<JOB_ID>'
```

Только готовый снимок логов без ожидания новых сообщений:

```bash
docker compose logs -t --tail=500 background_worker
```

Полезные параметры `docker compose logs`:

| Параметр      | Действие                                        |
| ------------- | ----------------------------------------------- |
| `-f`          | Продолжать показывать новые сообщения           |
| `-t`          | Показывать временные метки                      |
| `--tail=200`  | Ограничить количество последних строк           |
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
{ "status": "ok", "checks": { "database": "ok" } }
```

## Переход базы на Prisma 8

В репозитории Prisma 8 использует контракт `prisma/contract.prisma` и
именованный ref `db`. На чистой базе миграция создаёт все таблицы из этого
контракта. Для существующей базы применяйте изменения в окне обслуживания.
Сначала сделайте проверенную резервную копию PostgreSQL и остановите API/worker,
чтобы во время операции не было записей.

На сервере:

```bash
cd /opt/runich-backend/project
docker compose exec -T nestjs_app yarn prisma db update --dry-run
```

Проверьте план. Применяйте его только после проверки:

```bash
docker compose exec -T nestjs_app \
  yarn prisma db update --no-interactive --confirm runich_db --advance-ref db
docker compose exec -T nestjs_app yarn prisma db verify
docker compose exec -T nestjs_app yarn prisma migration status --ascii
```

Ожидаемый результат `db verify` — `Database marker and schema match contract`, а
статус миграций — `Up to date`. После этого пересоберите API и worker и снова
проверьте `/health/ready`. Не запускайте `db update` на production без backup и
предварительного `--dry-run`: это операция, которая может изменить структуру
базы.

## Просмотр production-базы

Prisma 8 RC пока не содержит Prisma Studio. Для просмотра используйте
обычный PostgreSQL-клиент через SSH-туннель, не публикуя порт базы наружу:

```bash
ssh -N -L 15432:127.0.0.1:5432 runich-timeweb
```

Подключайтесь к `127.0.0.1:15432` из локального клиента. Для изменений сначала
сделайте backup и остановите API/worker.

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

Следующие команды перезапускают сервисы, поэтому используйте их только
намеренно.

Перезапуск одного сервиса:

```bash
docker compose restart nestjs_app
docker compose restart background_worker
```

Пересборка и запуск API с worker:

```bash
docker compose up -d --build --remove-orphans nestjs_app background_worker
```

После перезапуска снова выполните:

```bash
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:3000/health/ready
docker compose logs -t --tail=100 nestjs_app background_worker
```

## Операции с PostgreSQL

### Размер базы, таблиц и соединений

Все запросы ниже только читают состояние базы:

```bash
docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' -- \
  'SELECT current_database() AS database, pg_size_pretty(pg_database_size(current_database())) AS database_size;'

docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' -- \
  'SELECT schemaname, relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size, n_live_tup AS estimated_rows FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;'

docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' -- \
  'SELECT state, COUNT(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY state ORDER BY state;'
```

Чтобы отдельно увидеть объём JSON-маршрутов и количество активностей:

```bash
docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' -- \
  'SELECT COUNT(*) AS activities, pg_size_pretty(COALESCE(SUM(pg_column_size(locations)), 0)) AS locations_payload, pg_size_pretty(COALESCE(SUM(pg_column_size("kilometresSplit")), 0)) AS splits_payload FROM "Activity";'
```

`pg_column_size` показывает размер значений, а не всей таблицы: индексы, строковые поля,
TOAST и служебные накладные расходы нужно смотреть через `pg_total_relation_size`.

### Создание логического backup

Логический dump переносим между PostgreSQL-серверами и предпочтительнее копирования
каталога `/var/lib/postgresql`: он не зависит от внутреннего layout тома PostgreSQL.
Формат `custom` позволяет проверить архив и восстановить его через `pg_restore`.

Создание backup на сервере:

```bash
BACKUP_DIR=/opt/runich-backups/postgres
BACKUP_FILE="$BACKUP_DIR/runich_$(date -u +%Y%m%dT%H%M%SZ).dump"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
docker compose exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
docker compose exec -T db pg_restore --list - < "$BACKUP_FILE" > /dev/null
sha256sum "$BACKUP_FILE"
ls -lh "$BACKUP_FILE"
```

Проверка `pg_restore --list` должна завершиться с кодом `0`. Храните несколько
последних backup вне Git и отдельно от production-тома; один backup на том же VPS
не защищает от потери самого VPS.

Для копирования backup на рабочий Mac:

```bash
scp runich-timeweb:/opt/runich-backups/postgres/<BACKUP_FILE> ./
```

Не передавайте пароль в командной строке и не публикуйте `DATABASE_URL`, checksum
можно публиковать — он не содержит учётных данных.

### Перенос на другой PostgreSQL-сервис

Перенос возможен без изменения данных приложения. Нужен новый PostgreSQL с пустой
базой; желательно использовать ту же major-версию или более новую. Фото и видео в
этот dump не входят: они лежат в S3 и переносятся отдельной операцией.

1. Создайте и проверьте backup по процедуре выше. Сначала восстановите его на
   тестовую базу нового сервиса.
2. Для финального cutover остановите записи, сохранив named volumes:

   ```bash
   docker compose stop nestjs_app background_worker
   ```

3. Сделайте финальный dump и перенесите файл на машину, с которой доступен новый
   PostgreSQL. В этой shell-сессии задайте URL нового сервиса, не записывая его в
   Git или логи:

   ```bash
   export TARGET_DATABASE_URL='postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require'
   pg_restore --no-owner --no-acl --dbname="$TARGET_DATABASE_URL" <BACKUP_FILE>
   ```

   Команда рассчитана на пустую базу. Опции `--clean --if-exists` используйте только
   если подтверждено, что содержимое целевой базы можно удалить.

4. В production замените `DATABASE_URL_DOCKER` на URL нового сервиса, пересоберите и
   запустите API/worker:

   ```bash
   docker compose up -d --build --remove-orphans nestjs_app background_worker
   docker compose ps
   curl --fail --silent --show-error http://127.0.0.1:3000/health/ready
   ```

5. Сравните число строк как минимум в `Users`, `Profile`, `Activity`, `Comment`,
   `Like` и `Friend`, проверьте вход и чтение активности. Старую БД не удаляйте до
   завершения проверки и периода наблюдения. `docker compose down -v` и удаление
   `pgdata` для этого процесса не нужны.

Если на целевом сервисе нет локальной команды `pg_restore`, используйте установленный
клиент PostgreSQL соответствующей или более новой major-версии. Не восстанавливайте
dump поверх непроверенной production-базы: сначала отдельная пустая база, затем
проверка и только после этого переключение `DATABASE_URL_DOCKER`.

## Резервная копия production `.env`

Защищённая резервная копия, созданная перед добавлением migration-переменных, находится вне Git-проекта и Docker build context:

```text
/root/runich-backend-env-backups/.env.backup-20260907T120251Z
```

Не копируйте её в репозиторий и не выводите её содержимое в терминал, логи или сообщения.
