# Правила проекта

- `npm run dev` запускает только Vite; API запускается отдельно через `npm run dev:api` (127.0.0.1:3000, порт настраивается через `PORT`). Фронтенд обращается к `/api` через сгенерированный SDK; Vite проксирует эти запросы к API.
- Контракт API меняйте в `api/main.tsp` и обновляйте OpenAPI, SDK и серверные артефакты командой `npm run generate:api`; не редактируйте сгенерированные файлы вручную. Бизнес-логику маршрутов размещайте в `server/app.ts` через `createApp()` и `registerCalendarRoutes()`; `server/index.ts` только запускает сервер. В относительных импортах серверного TypeScript используйте расширение `.js` для совместимости с NodeNext после сборки.
- `npm run build` проверяет типы и собирает фронтенд в `dist/`, API — в `dist-server/`; `npm run start:api` требует предварительной сборки.
- Перед коммитом выполняйте `npm run lint`, `npm test`, `npm run build`, `npm run check:generated` (тот же порядок в CI). Тесты запускают HTTP-серверы на случайных локальных портах, внешние сервисы не требуются.
- shadcn/ui CLI вызывайте по необходимости через `npx shadcn@latest`; не добавляйте `shadcn` в зависимости приложения. Не экспортируйте `buttonVariants` из `src/components/ui/button.tsx`: это ломает Fast Refresh в Vite.
- Коммиты оформляйте по Conventional Commits (`feat:`, `fix:`, `chore:`; несовместимые изменения — `feat!:`): release-please формирует release-PR по истории `main`.
- Не изменяйте `.github/workflows/hexlet-check.yml` и не переименовывайте репозиторий — это проверка Хекслета.

## Agent skills

### Issue tracker

Задачи и спецификации ведутся в GitHub Issues этого репозитория. См. `docs/agents/issue-tracker.md`.

### Triage labels

Для разбора задач используются стандартные метки `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. См. `docs/agents/triage-labels.md`.

### Domain docs

Один контекст: глоссарий в корневом `GLOSSARY.md`, решения в `docs/adr/`. См. `docs/agents/domain.md`.
