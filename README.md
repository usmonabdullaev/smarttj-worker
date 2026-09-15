# SmartTJ Worker

> Фоновый асинхронный воркер экосистемы **SmartTJ**, построенный на базе **NestJS** и **BullMQ** (Redis). Отвечает за асинхронную обработку очередей: модерацию товаров с использованием ИИ, создание системных уведомлений и отправку сообщений через Telegram Bot API.

---

## 📌 Оглавление

- [Обзор проекта](#-обзор-проекта)
- [Технологический стек](#-технологический-стек)
- [Архитектура системы](#-архитектура-системы)
- [Очереди и обработчики (Queues)](#-очереди-и-обработчики-queues)
  - [1. Модерация товаров (`product-moderation`)](#1-модерация-товаров-product-moderation)
  - [2. Внутренние уведомления (`notification`)](#2-внутренние-уведомления-notification)
  - [3. Telegram-уведомления (`notification-telegram`)](#3-telegram-уведомления-notification-telegram)
- [Инфраструктурные сервисы](#-инфраструктурные-сервисы)
  - [M2M HTTP Client](#m2m-http-client)
  - [AI Service](#ai-service)
  - [Telegram Service](#telegram-service)
  - [Логирование (Winston)](#логирование-winston)
  - [База данных (Prisma)](#база-данных-prisma)
- [Переменные окружения](#-переменные-окружения)
- [Локальная разработка и запуск](#-локальная-разработка-и-запуск)
  - [Требования](#требования)
  - [Установка зависимостей](#установка-зависимостей)
  - [Генерация Prisma Client](#генерация-prisma-client)
  - [Доступные скрипты](#доступные-скрипты)
- [Docker и развертывание](#-docker-и-развертывание)
  - [Сборка и запуск через Docker Compose](#сборка-и-запуск-через-docker-compose)
  - [CI/CD (GitHub Actions)](#cicd-github-actions)
- [Структура проекта](#-структура-проекта)

---

## 🚀 Обзор проекта

`smarttj-worker` работает как изолированный демон (**Standalone Application Context** без входящих открытых HTTP-портов). Он подключается к брокеру сообщений Redis и базе данных PostgreSQL, слушает назначенные очереди BullMQ и выполняет ресурсоемкие или асинхронные задачи.

### Ключевые возможности:

- **Автоматическая модерация товаров (AI & Rules)**:
  - Валидация полноты данных (категория, бренд, регион, наличие фото у вариантов, обязательные атрибуты категории).
  - Интеллектуальный анализ описания и параметров товара на спам/мошенничество через микросервис `smarttj-ai` (Google Gemini).
  - Автоматическое одобрение (`ACTIVE`) или отклонение (`INACTIVE`) с уведомлением продавца, либо перевод на ручную модерацию (`MANUAL_MODERATION`) при сбоях ИИ.
- **Очередь системных уведомлений**:
  - Сохранение уведомлений пользователей в базе данных PostgreSQL с поддержкой повторных попыток (exponential backoff).
- **Очередь Telegram-уведомлений**:
  - Прямая отправка сообщений пользователям через Telegram Bot API с контролем rate-limit (до 25 сообщений/сек) и отслеживанием блокировки бота пользователем (`403 Forbidden`).
- **M2M Аутентификация**:
  - Защищенное межсервисное взаимодействие с сервисом `smarttj-ai` при помощи краткосрочных JWT токенов (HMAC-SHA256, TTL 60 сек, заголовок `x-internal-token`).
- **Надежное логирование**:
  - Цветной вывод в терминал и автоматическая ротация файлов журналов (`combined` и `error`) с архивацией (gzip).

---

## 🛠 Технологический стек

| Категория                   | Технологии                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Среда выполнения**        | [Node.js 24 LTS](https://nodejs.org/)                                                                |
| **Фреймворк**               | [NestJS 12](https://nestjs.com/) (Standalone Context)                                                |
| **Очереди задач**           | [BullMQ](https://docs.bullmq.io/) + [Redis](https://redis.io/) (ioredis)                             |
| **База данных & ORM**       | [PostgreSQL](https://www.postgresql.org/), [Prisma 7](https://www.prisma.io/) (`@prisma/adapter-pg`) |
| **Схема моделей**           | [@smarttj/core](https://www.npmjs.com/package/@smarttj/core) (общие типы и схема Prisma)             |
| **HTTP Клиент**             | [Axios](https://axios-http.com/) / `@nestjs/axios`                                                   |
| **Безопасность M2M**        | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) (HS256)                                   |
| **Логирование**             | [Winston](https://github.com/winstonjs/winston) + `winston-daily-rotate-file`                        |
| **Тестирование**            | [Vitest 4](https://vitest.dev/)                                                                      |
| **Линтер & Форматирование** | [Oxlint](https://oxc.rs/), [Prettier](https://prettier.io/)                                          |
| **Контейнеризация & CI/CD** | [Docker](https://www.docker.com/) (Multi-stage build), Docker Compose, GitHub Actions                |

---

## 📐 Архитектура системы

```mermaid
flowchart TD
    subgraph Core ["SmartTJ Backend Services"]
        API["smarttj-api / CMS"]
    end

    subgraph Broker ["Redis"]
        Q1[("Queue: product-moderation")]
        Q2[("Queue: notification")]
        Q3[("Queue: notification-telegram")]
    end

    subgraph Worker ["smarttj-worker"]
        P_MOD["ProductModerationProcessor"]
        P_NOTIF["NotificationProcessor"]
        P_TG["NotificationTelegramProcessor"]

        HTTP_SVC["HttpClientService\n(M2M JWT)"]
        TG_SVC["TelegramService"]
        PRISMA_SVC["PrismaService"]
    end

    subgraph External ["External Services & DB"]
        PG[("PostgreSQL Database")]
        AI_SRV["smarttj-ai Service\n(Google Gemini)"]
        TG_API["Telegram Bot API"]
    end

    API -->|Add Job| Q1
    API -->|Add Job| Q2
    API -->|Add Job| Q3

    Q1 --> P_MOD
    Q2 --> P_NOTIF
    Q3 --> P_TG

    P_MOD -->|1. Validate & Fetch| PRISMA_SVC
    P_MOD -->|2. Check Content| HTTP_SVC -->|POST /ask| AI_SRV
    P_MOD -->|3. Update Status| PRISMA_SVC
    P_MOD -->|4. Notify Partner| P_NOTIF

    P_NOTIF -->|Insert Notification| PRISMA_SVC --> PG
    P_TG -->|Send Message| TG_SVC -->|HTTPS POST| TG_API
```

---

## 📥 Очереди и обработчики (Queues)

Ключи очередей импортируются из пакета `@smarttj/core` (`QUEUE_KEYS`).

### 1. Модерация товаров (`product-moderation`)

- **Очередь**: `QUEUE_KEYS.PRODUCT_MODERATION`
- **Процессор**: `ProductModerationProcessor`
- **Входные данные (`job.data`)**:
  ```typescript
  {
    productId: string;
  }
  ```
- **Логика выполнения**:
  1. Извлекает товар со всеми связями (`variants`, `images`, `attributes`, `category`, `brand`, `model`, `partner`).
  2. **Первичные проверки**:
     - Наличие категории (`categoryId`), бренда (`brandId`), региона (`regionId`).
     - У каждого варианта товара должно быть минимум одно изображение.
     - Все обязательные атрибуты (`required: true`) для текущей категории должны быть заполнены.
     - При нарушении правил отправляется уведомление продавцу с подробностями, задача завершается.
  3. **ИИ-модерация**:
     - Формирует структурированный контекст (`title`, `description`, `category`, `brand`, `model`).
     - Отправляет запрос в микросервис `smarttj-ai` через `AIService.ask` (провайдер: Gemini, `temperature: 0.2`, `timeout: 20s`).
  4. **Принятие решения**:
     - `ok: true`: Товар переводится в статус `ACTIVE`, выставляется дата публикации `publishedAt: new Date()`.
     - `ok: false`: Товар переводится в статус `INACTIVE`, продавцу отправляется уведомление с причиной отклонения.
     - Ошибка ИИ / сбой ответа: На последней попытке BullMQ (`isLastAttempt`) товар переводится в статус `MANUAL_MODERATION` для ручной проверки модератором.

---

### 2. Внутренние уведомления (`notification`)

- **Очередь**: `QUEUE_KEYS.NOTIFICATION`
- **Процессор**: `NotificationProcessor`
- **Параллелизм**: `concurrency: 5`
- **Входной DTO (`SendRequest`)**:
  ```typescript
  export interface SendRequest {
    userId: string;
    type: NotificationType; // e.g. PRODUCT_MODERATION, SYSTEM, etc.
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }
  ```
- **Сервис отправки (`NotificationService`)**:
  Предоставляет метод `send(dto: SendRequest)` для добавления задачи в очередь:
  - Количество попыток: `5`
  - Стратегия повтора: `exponential backoff` (начальная задержка `5000ms`)
  - Очистка очереди: хранение последних `1000` завершенных и `1000` ошибочных задач.
- **Логика**: Проверяет существование пользователя по `userId` и создает запись в таблице `Notification`.

---

### 3. Telegram-уведомления (`notification-telegram`)

- **Очередь**: `QUEUE_KEYS.NOTIFICATION_TELEGRAM`
- **Процессор**: `NotificationTelegramProcessor`
- **Параллелизм**: `concurrency: 5`
- **Ограничение частоты (Rate Limiter)**: максимум `25` задач в секунду (`1000ms`) в соответствии с лимитами Telegram Bot API.
- **Входной DTO**:
  ```typescript
  export interface SendRequest {
    telegramId: string;
    message: string;
  }
  ```
- **Логика**: Отправляет сообщение в указанный Telegram чат. Если пользователь заблокировал бота (`TelegramBlockedException` / коды 403, 400), ошибка перехватывается без повторных бесполезных вызовов.

---

## 🧩 Инфраструктурные сервисы

### M2M HTTP Client

Расположен в `src/infra/http-client/`.

- Предоставляет `HttpClientService` для внутренних защищенных запросов между микросервисами SmartTJ.
- При каждом запросе автоматически генерирует краткосрочный JWT токен:
  ```typescript
  jwt.sign({ iss: 'smarttj-worker', aud: targetService }, secret, {
    expiresIn: '60s',
    algorithm: 'HS256',
  });
  ```
- Токен передается в заголовке `x-internal-token`.
- Межсервисные ошибки оборачиваются и логируются с целевым сервисом, URL и HTTP-статусом.

### AI Service

Расположен в `src/ai/ai.service.ts`.

- Взаимодействует с сервисом `smarttj-ai` по адресу `AI_SERVICE_URL/ask`.
- Запросы типизированы через `@smarttj/core` (`AskRequest`, `AskResponse`).
- Использует промпт `PRODUCT_MODERATE_PROMPT` и парсер `productModerateParser`.

### Telegram Service

Расположен в `src/infra/telegram/telegram.service.ts`.

- Прямое взаимодействие с Telegram Bot API (`https://api.telegram.org/bot<TOKEN>/sendMessage`).
- Поддерживает форматирование (`HTML`, `MarkdownV2`), клавиатуры (`inline_keyboard`) и тихие уведомления (`disable_notification`).
- Обрабатывает лимиты частоты Telegram (HTTP 429 с извлечением `retry_after`).

### Логирование (Winston)

Расположено в `src/logger/`.

- Вывод в консоль с цветовым кодированием уровней (`INFO`, `WARN`, `ERROR`, `DEBUG`, `VERBOSE`) и контекста.
- Ротация лог-файлов в папку `logs/`:
  - `combined-%DATE%.log`: все события от уровня `info`, глубина хранения 14 дней, сжатие gzip.
  - `error-%DATE%.log`: только ошибки (`error`), глубина хранения 30 дней, сжатие gzip.

### База данных (Prisma)

Расположена в `src/database/prisma/`.

- Подключение к PostgreSQL с использованием адаптера `@prisma/adapter-pg`.
- Корректная обработка жизненного цикла (`onModuleInit` / `onModuleDestroy`).
- Схема базы данных берется из общего пакета `@smarttj/core/prisma/schema.prisma`.

---

## ⚙️ Переменные окружения

Создайте файл `.env` в корне проекта (на основе `.env.example`):

```bash
cp .env.example .env
```

| Переменная                | Описание                                   | Пример значения                                    | Обязательная |
| ------------------------- | ------------------------------------------ | -------------------------------------------------- | :----------: |
| `REDIS_HOST`              | Хост сервера Redis для BullMQ              | `localhost` или `redis`                            |      ✅      |
| `REDIS_PORT`              | Порт сервера Redis                         | `6379`                                             |      ✅      |
| `REDIS_PASSWORD`          | Пароль к Redis (если требуется)            | `secretpassword`                                   |      ❌      |
| `DATABASE_URL`            | Строка подключения к PostgreSQL            | `postgres://user:pass@localhost:5432/smarttj`      |      ✅      |
| `TELEGRAM_BOT_TOKEN`      | Токен Telegram-бота для отправки сообщений | `123456789:ABCDefGhIJKlmNoPQRstuVWx`               |      ✅      |
| `INTERNAL_SERVICE_SECRET` | Секретный ключ для подписи M2M токенов JWT | `your-secure-m2m-secret-key`                       |      ✅      |
| `AI_SERVICE_URL`          | Базовый URL внутреннего микросервиса ИИ    | `http://localhost:3000/v1` или `http://ai:3000/v1` |      ✅      |

---

## 💻 Локальная разработка и запуск

### Требования

- **Node.js**: `^24.0.0`
- **npm**: `^10.0.0`
- Запущенные сервисы **Redis** и **PostgreSQL**

### Установка зависимостей

```bash
npm install
```

### Генерация Prisma Client

Так как схема БД находится в `@smarttj/core`, генерация клиента выполняется специальным скриптом:

```bash
npm run prisma:generate
```

Если необходимо применить миграции к БД:

```bash
npm run prisma:deploy
```

### Доступные скрипты

| Команда              | Описание                                                       |
| -------------------- | -------------------------------------------------------------- |
| `npm run start:dev`  | Запуск воркера в режиме разработки с автоперезагрузкой (watch) |
| `npm run start`      | Обычный запуск приложения                                      |
| `npm run build`      | Компиляция TypeScript кода в директорию `dist/`                |
| `npm run start:prod` | Запуск скомпилированного воркера (`node dist/main`)            |
| `npm run lint`       | Проверка кода быстрым линтером `oxlint`                        |
| `npm run format`     | Автоформатирование кода с помощью Prettier                     |
| `npm run test`       | Запуск unit-тестов через Vitest                                |
| `npm run test:watch` | Запуск тестов в режиме отслеживания изменений                  |
| `npm run test:cov`   | Запуск тестов с генерацией отчета о покрытии кода              |
| `npm run test:e2e`   | Запуск end-to-end тестов                                       |

---

## 🐳 Docker и развертывание

### Сборка и запуск через Docker Compose

Воркер сконфигурирован для работы в общей Docker-сети `smarttj-network`.

1. Убедитесь, что внешняя сеть существует:

   ```bash
   docker network inspect smarttj-network >/dev/null 2>&1 || docker network create smarttj-network
   ```

2. Сборка и запуск контейнера:

   ```bash
   docker compose up -d --build
   ```

3. Просмотр логов:

   ```bash
   docker compose logs -f worker
   ```

4. Остановка контейнера:
   ```bash
   docker compose down
   ```

### Особенности Dockerfile

Используется легковесный многоэтапный билд (`node:24-alpine`):

- **Стадия builder**: Установка зависимостей, генерация Prisma Client из `@smarttj/core`, компиляция NestJS.
- **Стадия production**: Копирование только необходимых артефактов (`dist`, `node_modules`, `prisma.config.ts`), работа под `NODE_ENV=production`.

### CI/CD (GitHub Actions)

В репозитории настроен пайплайн автоматического деплоя [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. **Тестирование и сборка**: При пуше в ветку `main` на GitHub Runner проверяется установка зависимостей, генерация Prisma и сборка проекта.
2. **Деплой на VPS**: По SSH запускается обновление кода репозитория, проверка сети `smarttj-network`, пересборка и перезапуск контейнера через `docker compose`.

---

## 📂 Структура проекта

```text
smarttj-worker/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions CI/CD пайплайн
├── src/
│   ├── ai/                         # Интеграция с ИИ
│   │   ├── prompts/
│   │   │   └── product-moderate.prompt.ts # Промпт и парсер модерации
│   │   └── ai.service.ts           # Сервис взаимодействия с smarttj-ai
│   ├── database/
│   │   └── prisma/
│   │       ├── prisma.module.ts    # Глобальный модуль базы данных
│   │       └── prisma.service.ts   # PrismaClient с адаптером @prisma/adapter-pg
│   ├── infra/                      # Инфраструктурные клиенты
│   │   ├── http-client/            # Внутренний HTTP клиент с M2M JWT аутентификацией
│   │   │   ├── interfaces/
│   │   │   ├── http-client.module.ts
│   │   │   └── http-client.service.ts
│   │   └── telegram/               # Клиент Telegram Bot API
│   │       ├── dto/
│   │       ├── telegram.module.ts
│   │       └── telegram.service.ts
│   ├── logger/                     # Winston-логгер с цветной консолью и ротацией файлов
│   │   ├── logger.config.ts
│   │   ├── logger.module.ts
│   │   └── logger.service.ts
│   ├── queues/                     # Обработчики очередей BullMQ
│   │   ├── notification/           # Очередь внутренних уведомлений пользователей
│   │   │   ├── dto/
│   │   │   ├── notification.module.ts
│   │   │   ├── notification.processor.ts
│   │   │   └── notification.service.ts
│   │   ├── notification-telegram/  # Очередь отправки сообщений в Telegram
│   │   │   ├── dto/
│   │   │   ├── notification-telegram.module.ts
│   │   │   └── notification-telegram.processor.ts
│   │   └── product-moderation/     # Очередь валидации и модерации товаров через ИИ
│   │       ├── product-moderation.module.ts
│   │       └── product-moderation.processor.ts
│   ├── app.module.ts               # Корневой модуль приложения
│   └── main.ts                     # Точка входа (Standalone context, graceful shutdown)
├── test/                           # Тесты (Vitest)
├── Dockerfile                      # Двухэтапная сборка Docker-образа
├── docker-compose.yml              # Конфигурация запуска сервиса
├── prisma.config.ts                # Конфигурация Prisma
├── package.json                    # Зависимости и npm-скрипты
└── README.md                       # Документация проекта
```

---

## 📄 Лицензия

Проект является частью закрытой экосистемы **SmartTJ** (UNLICENSED). Все права защищены.
