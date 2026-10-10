# Runich Backend: production operations

Эта памятка содержит безопасные команды для просмотра состояния production-сервера Timeweb и логов API/worker. Production PostgreSQL работает как отдельный Timeweb DBaaS-кластер и не запускается локальным Compose.

## Подключение

На рабочем Mac настроен SSH alias `runich-timeweb`:

```bash
ssh runich-timeweb
cd /opt/runich-backend/project
```

Одноразовую команду можно выполнить без открытия интерактивной SSH-сессии:

```bash
ssh runich-timeweb 'cd /opt/runich-backend/project && docker compose -f docker-compose.timeweb.yml ps'
```

Production Compose (`docker-compose.timeweb.yml`) использует следующие сервисы:

| Сервис              | Назначение                             |
| ------------------- | -------------------------------------- |
| `db_migrate`        | Одноразовый deploy job для схемы БД    |
| `nestjs_app`        | HTTP API                               |
| `background_worker` | Миграции Strava, blurhash и очистка S3 |

## Быстрый выбор команды

Все следующие команды выполняются после перехода в `/opt/runich-backend/project`.

| Что посмотреть               | Команда                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Состояние контейнеров        | `docker compose -f docker-compose.timeweb.yml ps`                                               |
| Все свежие логи              | `docker compose -f docker-compose.timeweb.yml logs -f --tail=200`                               |
| Логи API                     | `docker compose -f docker-compose.timeweb.yml logs -f --tail=200 nestjs_app`                    |
| Логи background worker       | `docker compose -f docker-compose.timeweb.yml logs -f --tail=200 background_worker`             |
| API и worker вместе          | `docker compose -f docker-compose.timeweb.yml logs -f --tail=200 nestjs_app background_worker`  |
| Логи за последние 30 минут   | `docker compose -f docker-compose.timeweb.yml logs -t --since=30m nestjs_app background_worker` |
| Текущее потребление ресурсов | `docker stats --no-stream`                                                                      |

`Ctrl+C` прекращает просмотр через `logs -f`, но не останавливает контейнеры.

## Stage deploy на Timeweb

Каждый push в `stage` запускает `.github/workflows/deploy-stage-timeweb.yml`.
Workflow собирает образ из точного коммита в GitHub Actions и подключается к
серверу `runich-stage` по SSH. На сервере запуск проходит в таком порядке:
PostgreSQL healthcheck, `db:migrate:prod`, API и worker, затем проверки API,
Alloy и HTTPS. Только после их успешного завершения тот же образ публикуется
как прошедший Stage для этого дерева исходников.

Compose-файл `docker-compose.timeweb.stage.yml` хранит PostgreSQL и состояние
Let's Encrypt в постоянных Docker volumes. Nginx принимает HTTP/HTTPS на
`stage.runich-app.ru`, проксирует запросы к API внутри Compose и обслуживает
ACME challenge. Certbot выпускает сертификат при первом деплое и проверяет его
обновление каждые 12 часов; после обновления он перезагружает Nginx. На сервере
должны быть доступны входящие TCP-порты 80 и 443.

Файлы `/opt/runich-stage/.env` и `app.env` создаются отдельно от Git checkout
и хранятся владельцем пользователя деплоя с режимом `0600`. В `.env` задайте
`DATABASE_URL_DOCKER` с хостом `db`, именем базы и паролем, совпадающими с
`POSTGRES_USER`, `POSTGRES_DB` и `POSTGRES_PASSWORD`; `app.env` содержит только
переменные API и worker. Для новой пустой базы первый деплой создаёт схему
одной начальной миграцией, после чего запускает API и worker.

Перед первым deploy с новым baseline один раз удалите старую pre-release схему
и историю миграций в Stage и Production. После сброса Stage выполните:

```bash
cd /opt/runich-stage
docker compose --project-name runich-stage -f docker-compose.timeweb.stage.yml \
  exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION CURRENT_USER;"'
```

Если в Production уже создавалась схема, выполните тот же SQL в клиенте
Production PostgreSQL от имени владельца схемы:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public AUTHORIZATION CURRENT_USER;
```

Сброс удаляет таблицы, данные, расширения и migration metadata в `public`.
`db:migrate:prod` создаст `pg_trgm` и применит начальную миграцию. После этого
среды сохраняют собственные данные и используют обычные новые миграции.

После успешных проверок API, Grafana Alloy и HTTPS stage workflow автоматически
запускает `docker system prune --all --force`. Очистка не удаляет volumes:
PostgreSQL и состояние Let's Encrypt сохраняются. Если сам prune завершается
ошибкой, уже проверенный деплой не откатывается и workflow остаётся успешным.

GitHub Actions использует environment `stage`, ограниченный веткой `stage`.
Для него нужны отдельные значения `STAGE_DEPLOY_HOST`, `STAGE_DEPLOY_USER`,
`STAGE_DEPLOY_SSH_KEY` и `STAGE_DEPLOY_KNOWN_HOSTS`; production secrets с общими
именами не переиспользуются. В `STAGE_DEPLOY_KNOWN_HOSTS` записывается проверенная
строка host key для адреса сервера.

## Как выполняется production deploy

После merge в `master` GitHub Actions ищет в GHCR image с тегом дерева исходников,
который Stage публикует только после успешных readiness-проверок. Если точное
дерево не прошло Stage, production deploy останавливается до подключения к
серверу. Timeweb не собирает образ: он получает тот же Docker image, который
прошёл Stage, переключает checkout на production commit и запускает `db_migrate`
один раз, затем API и worker. На Production повторяются внутренний readiness,
проверка worker и Alloy; workflow также проверяет публичный HTTPS readiness URL.
Ошибка миграции или readiness останавливает workflow. URLs, секреты,
наблюдаемость и `APP_ENV` задаются отдельно для каждой среды.

Локальный Compose по-прежнему собирается обычной командой ниже и использует
локальный тег `runich-backend:local`:

```bash
docker compose up --build --remove-orphans
```

Production Compose на Timeweb запускается отдельным файлом и подключается к
внешнему PostgreSQL через приватный IP. В production `.env` переменная
`DATABASE_URL_DOCKER` должна содержать URL базы Timeweb; пароль не выводите и
не добавляйте в Git:

```text
DATABASE_URL_DOCKER=postgresql://gen_user:<пароль>@192.168.0.4:5432/default_db?schema=public
```

## NestJS Observe

Интеграция включается только если в production `.env` заданы обе переменные
`OBSERVE_APP_KEY` и `OBSERVE_APP_SECRET`. Добавьте туда пару из API Keys
проекта NestJS Observe; не сохраняйте её в Git и не выводите в терминал.
Compose передаёт эти значения API и worker из `.env`, а после следующего deploy
они появятся в приложениях `runich-backend` и `runich-backend-worker`.
Версия приложения в Observe берётся из тега Docker image.

Если задать только одну переменную, приложение остановится с понятной ошибкой.
Без обеих переменных SDK не активируется. Передаются ошибки, трассы запросов,
методы Nest и runtime-метрики; логи, содержимое запросов и фрагменты исходного
кода отключены. Проверьте настройки приватности Observe перед включением
production-телеметрии.

`db:migrate:prod` перед миграцией включает расширение `pg_trgm`; начальная
миграция создаёт trigram GIN-индексы для поиска по email, имени и фамилии.
Будущие изменения схемы добавляйте отдельными migration packages в тот же
commit, что и совместимый код.

```bash
docker compose -f docker-compose.timeweb.yml ps
docker compose -f docker-compose.timeweb.yml logs -f --tail=200 nestjs_app background_worker
```

## Ротация логов

Приложение пишет только ошибки в `/opt/runich-backend/project/logs.log` через
отдельный bind mount `./logs.log:/app/logs.log`; Compose не монтирует весь
checkout приложения внутрь контейнера. Конфигурация
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
  $(docker compose -f docker-compose.timeweb.yml ps -q nestjs_app background_worker)
docker system df
```

Не используйте `docker compose down -v` или `docker system prune --volumes` для
освобождения места: это может удалить named volume `pgdata`. После успешного
health check можно отдельно удалить только rebuildable BuildKit-кэш командой
`docker builder prune --all --force`; именованные volumes она не удаляет, но
следующая сборка заново скачает и соберёт очищенные слои.

## Логи в Grafana Cloud

Stage отправляет в Loki только логи контейнеров `nestjs_app` и
`background_worker`. Подготовлены те же настройки для production; его workflow
запишет секрет и запустит Alloy только при production deploy после merge.
Grafana Alloy фильтрует контейнеры по Compose service label и добавляет метки
`environment`, `service` и `host`. Токен Loki хранится в серверном `.env` с
режимом `0600`; не коммитьте его. Stage workflow обновляет значение из GitHub
Actions secret `GRAFANA_LOKI_TOKEN` при каждом deploy.

Compose запускает `grafana_alloy` отдельно от API и worker. Его конфигурация
находится в `deploy/grafana/config.alloy`, образ закреплен на `v1.20.1`, а
отправка идет по HTTPS в Grafana Cloud Loki. Collector не публикует HTTP-порт;
root filesystem доступна только для чтения, capabilities сброшены кроме
`DAC_OVERRIDE`. Docker API позволяет Alloy обнаруживать контейнеры и читать их
логи; конфигурация отбрасывает все контейнеры, кроме API и worker.

После stage deploy откройте Grafana Explore и выберите datasource Grafana Cloud
Logs:

```logql
{job="runich/backend", environment="stage", service="nestjs_app"}
```

Для production после его deploy замените `environment="stage"` на
`environment="production"`. Для фонового worker используйте
`service="background_worker"`.

### Проверка Yandex SMTP

Проверка ниже устанавливает TCP/TLS-соединение и выполняет SMTP-auth, но не
отправляет письмо:

```bash
docker compose -f docker-compose.timeweb.yml exec -T nestjs_app node --input-type=module -e '
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
docker compose -f docker-compose.timeweb.yml exec -T -e TEST_EMAIL="$TEST_EMAIL" nestjs_app node --input-type=module -e '
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
docker compose -f docker-compose.timeweb.yml logs -f --tail=300 nestjs_app background_worker \
  | grep -Ei 'error|warn|migration|ошиб'
```

Сообщения конкретной задачи миграции:

```bash
docker compose -f docker-compose.timeweb.yml logs -t --since=24h background_worker \
  | grep '<JOB_ID>'
```

Только готовый снимок логов без ожидания новых сообщений:

```bash
docker compose -f docker-compose.timeweb.yml logs -t --tail=500 background_worker
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

## Изменения схемы Prisma 8

Production использует checked-in migrations из `migrations/`. Создавайте и
проверяйте изменения локально или на stage командой `migration plan`, читайте
`migration show`, затем включайте миграцию в тот же commit, что и код,
ожидающий новую схему. Не запускайте `prisma db update` из API-контейнера или
вручную на production: `db_migrate` выполняет `db migrate`, статус и проверку
контракта перед переключением API/worker.

При ручном production deploy используйте Stage-verified image. Сначала запустите
миграцию и дождитесь её успешного завершения, затем API и worker:

```bash
cd /opt/runich-backend/project
BACKEND_IMAGE='ghcr.io/sanich123/runich-backend:stage-verified-<source-tree-sha>' \
  docker compose -f docker-compose.timeweb.yml up --no-build --force-recreate \
  --abort-on-container-exit --exit-code-from db_migrate db_migrate
BACKEND_IMAGE='ghcr.io/sanich123/runich-backend:stage-verified-<source-tree-sha>' \
  docker compose -f docker-compose.timeweb.yml up -d --force-recreate \
  --remove-orphans --no-build nestjs_app background_worker
curl --fail --silent --show-error http://127.0.0.1:3000/health/ready
```

Команда подключается к production-БД; не запускайте её вручную параллельно с
GitHub Actions. Для изменений с потенциальной потерей данных заранее создайте и
проверьте резервную копию и спланируйте совместимый rollout.

## Просмотр production-базы

Prisma 8 RC пока не содержит Prisma Studio. Для просмотра используйте
обычный PostgreSQL-клиент через SSH-туннель, не публикуя порт базы наружу:

```bash
ssh -N -L 15432:192.168.0.4:5432 runich-timeweb
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
docker compose -f docker-compose.timeweb.yml images
docker compose -f docker-compose.timeweb.yml ps
```

Параметры миграции зафиксированы в коде: входящий upload временно находится в
`./dist/receivedArchive`, затем архив загружается в S3 под ключом
`<userId>/migrations/<migrationId>/archive.zip`. Worker скачивает его во
временный файл, а после terminal status удаляет S3-объект. Размер batch — 8,
пауза — 25 мс, polling — 10 секунд, лимит worker — 1.0 CPU. Они не
передаются через `.env`.

Production S3 должен использовать отдельный бакет `runich-production`:

```text
S3_ENDPOINT=https://s3.twcstorage.ru
S3_REGION=ru-1
S3_BUCKET=runich-production
S3_PUBLIC_URL=https://q0tsp3wn9v.cdn.twcstorage.ru
```

Не выводите весь `.env` и не публикуйте вывод `docker compose config`: он может содержать production-секреты.

## Команды, изменяющие состояние

Следующие команды перезапускают сервисы, поэтому используйте их только
намеренно.

Перезапуск одного сервиса:

```bash
docker compose -f docker-compose.timeweb.yml restart nestjs_app
docker compose -f docker-compose.timeweb.yml restart background_worker
```

Пересборка и запуск API с worker:

```bash
BACKEND_IMAGE="ghcr.io/sanich123/runich-backend:$(git rev-parse HEAD)" \
  docker compose -f docker-compose.timeweb.yml \
  up -d --always-recreate-deps --no-build --remove-orphans nestjs_app background_worker
```

После перезапуска снова выполните:

```bash
docker compose -f docker-compose.timeweb.yml ps
curl --fail --silent --show-error http://127.0.0.1:3000/health/ready
docker compose -f docker-compose.timeweb.yml logs -t --tail=100 nestjs_app background_worker
```

## Операции с PostgreSQL

В production PostgreSQL находится в отдельном Timeweb DBaaS-кластере, поэтому
команды `docker compose exec -T db ...` ниже относятся только к локальному
`docker-compose.yml` и на production не используются. Для production backup и
управление кластером выполняются в панели Timeweb; API и worker подключаются к
нему через `DATABASE_URL_DOCKER`.

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
  'SELECT COUNT(*) AS activities, pg_size_pretty(COALESCE(SUM("route_size_bytes"), 0)) AS route_payload, pg_size_pretty(COALESCE(SUM(pg_column_size("kilometresSplit")), 0)) AS splits_payload FROM "Activity";'
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
   docker compose -f docker-compose.timeweb.yml stop nestjs_app background_worker
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

4. В production замените `DATABASE_URL_DOCKER` на URL нового сервиса, сначала
   примените миграции, затем запустите API/worker:

   ```bash
   BACKEND_IMAGE="ghcr.io/sanich123/runich-backend:$(git rev-parse HEAD)" \
     docker compose -f docker-compose.timeweb.yml \
     up -d --always-recreate-deps --no-build --remove-orphans nestjs_app background_worker
   docker compose -f docker-compose.timeweb.yml ps
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
