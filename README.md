# Календарь звонков (продолжение)


[![hexlet-check](https://github.com/i-samsonov/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/i-samsonov/ai-for-developers-project-387/actions)

Интегрируйте работу агентов в GitHub проект

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Стек

- React, TypeScript, Vite
- Tailwind CSS, shadcn/ui
- Fastify (API), Vitest (тесты), Oxlint (линтер)

## API-контракт

Рукописный источник контракта — `api/main.tsp`. Выполните `npm run generate:api`, чтобы обновить OpenAPI (`generated/@typespec/openapi3/openapi.json`), типизированный клиент (`src/generated/sdk/`) и серверные типы, JSON-схемы валидации и регистрацию маршрутов (`server/generated/`). Эти артефакты не редактируются вручную. `npm run check:generated` проверяет повторяемость генерации и выполняется в CI после lint → test → build.

Серверные маршруты подключаются через `registerCalendarRoutes(app, handlers)`; генератор никогда не перезаписывает бизнес-логику. Все шесть операций доступны. Админский API не защищён авторизацией: приложение предназначено только для локального учебного использования, не размещайте его публично с реальными персональными данными.

## История проекта

Приложение перенесено из [первого проекта «Календарь звонков»](https://github.com/i-samsonov/ai-for-developers-project-386). Исходные [спецификация](https://github.com/i-samsonov/ai-for-developers-project-386/issues/11), [карта решений](https://github.com/i-samsonov/ai-for-developers-project-386/issues/2) и [обсуждения решений](https://github.com/i-samsonov/ai-for-developers-project-386/issues?q=is%3Aissue+is%3Aclosed) сохранены в прежнем репозитории. Новые задачи ведутся в [Issues этого репозитория](https://github.com/i-samsonov/ai-for-developers-project-387/issues).

## Установка

Рекомендуется Node.js 22.18+ и npm (при установке на Node.js 22.12 часть зависимостей предупреждает о несовместимой версии). По умолчанию API хранит данные в `calendar.sqlite` (SQLite, файл исключён из Git); путь можно изменить через `DATABASE_PATH`.

```bash
git clone https://github.com/i-samsonov/ai-for-developers-project-387.git
cd ai-for-developers-project-387
npm install
```

## Использование

Запустите фронтенд и API в двух терминалах:

```bash
npm run dev
npm run dev:api
```

Откройте адрес, который выведет Vite (обычно http://localhost:5173). Vite проксирует `/api` к http://127.0.0.1:3000; если API запущен с другим `PORT`, задайте тот же `PORT` при старте Vite. Vite обновляет страницу при изменениях кода, а `tsx watch` перезапускает API. Остановить серверы можно сочетанием Ctrl+C.

Проверки и просмотр собранной версии локально:

```bash
npm run lint
npm test
npm run build
npm run check:generated
npm run preview
```

`npm run preview` поднимает локальный сервер для фронтенда из `dist/`. После сборки `npm run start:api` запускает Fastify, который отдаёт фронтенд из `dist/`, API по `/api` и проверку здоровья по `/health` на одном порту (по умолчанию 3000, либо из `PORT`).

## Docker и деплой

Работающее приложение из первого проекта: https://calendar-calls-386.onrender.com (проверка `/health` возвращает HTTP 200).

```bash
docker build -t calendar-calls .
docker run --rm -e PORT=8080 -p 8080:8080 calendar-calls
```

Откройте http://localhost:8080 и http://localhost:8080/health. Контейнер слушает `0.0.0.0` и использует `PORT`, переданный платформой. Файл базы по умолчанию хранится в `/data/calendar.sqlite`; без подключённого постоянного тома данные теряются при пересоздании контейнера. Для постоянного хранения подключите том к `/data` или задайте `DATABASE_PATH` на путь в смонтированном каталоге.

Проверки запускаются также в GitHub Actions (`.github/workflows/ci.yml`). Файл `.github/workflows/hexlet-check.yml` отвечает за отдельные проверки Хекслета.

## Агент в GitHub

В комментарии к issue или PR можно упомянуть **`/oc`** или **`/opencode`** — запустится [OpenCode GitHub Action](https://opencode.ai/docs/github/) (`.github/workflows/opencode.yml`). Пример:

```text
/oc explain this issue
```

Запускать агента могут только авторы с ролью `OWNER`, `MEMBER` или `COLLABORATOR`; комментарии остальных и ботов игнорируются. Модель — `opencode/big-pickle`, ключ берётся из секрета Actions **`OPENCODE_API_KEY`** (OpenCode Console). Сессии не публикуются (`share: "false"`): доступны только прогон Actions и ответ в issue. Секрет **`HEXLET_ID`** относится к проверкам Хекслета и не связан с агентом.

Workflow аутентифицируется через [OpenCode GitHub App](https://github.com/apps/opencode-agent): OIDC-токен обменивается на установочный токен App, поэтому права на комментарии и PR выдаёт само приложение, а у workflow остаётся `contents: read`.

### Автотриаж входящих обращений

`.github/workflows/opencode-triage.yml` запускает предварительный разбор **при создании issue** без команды `/oc`. Запуск доступен только для обращений от владельца репозитория и авторов с ролью `OWNER`, `MEMBER` или `COLLABORATOR`; обращения остальных авторов не отправляются модели. Тикеты и спецификации с меткой `ready-for-agent` (а также `ready-for-human` и `wontfix`) пропускаются. Подготовленные тикеты создавайте сразу с меткой `ready-for-agent`, иначе событие открытия запустит их разбор.

Инструкция агенту находится в `prompt` workflow: он сверяет обращение с текущим приложением, оставляет вопросы при нехватке данных и рекомендует следующий шаг, но не меняет код и не начинает реализацию. Для меток используются правила из `docs/agents/triage-labels.md`; вопросы переводят обращение в `needs-info`. Триаж ограничен десятью минутами, а запуски по одному issue выполняются последовательно с ручным `/oc`.

Автотриаж использует встроенный `GITHUB_TOKEN` с правами `contents: read` и `issues: write`, чтобы агент мог прочитать репозиторий и оставить комментарий или метку. Ручной `/oc` по-прежнему использует GitHub App. Ответы на вопросы и согласование спецификации и тикетов остаются за человеком; создание issue с меткой `ready-for-agent` само по себе не запускает реализацию.

## Релизы

Используйте [Conventional Commits](https://www.conventionalcommits.org/): `feat: ...`, `fix: ...`, `chore: ...`; для несовместимых изменений — `feat!: ...`. Workflow `.github/workflows/release-please.yml` на ветке `main` поддерживает release-PR, changelog и версии. В настройках репозитория GitHub включите **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**. Для запуска CI на автоматически созданных release-PR добавьте секрет `RELEASE_PLEASE_TOKEN` (fine-grained PAT с доступом к Contents и Pull requests); без него action использует `GITHUB_TOKEN`, но созданные им PR сами не запустят другие workflow.

Новые компоненты shadcn/ui можно добавлять через `npx shadcn@latest add <имя>`; CLI не установлен как зависимость приложения.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
