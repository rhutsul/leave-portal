#!/usr/bin/env bash
# WS11, трек B: алерт людині в Telegram з червоного smoke (.github/workflows/smoke.yml, крок `if: failure()`).
# Що впало, середовище, адреса (лише хост), коміт, посилання на прогін. Без тіла відповіді сервера, без значень змінних.
# Секрети — лише зі змінних середовища кроку: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID. Без них — попередження, код 0.
# Токен стоїть в адресі запиту до Telegram, тому: без set -x, без curl -v, stderr curl — у /dev/null.
# Інші змінні: ALERT_ENV, ALERT_BRANCH (необов'язково), ALERT_URL, ALERT_JOB, ALERT_SHA, RUN_URL; GITHUB_* — від Actions.
# Взято з (і винесено з обох jobs в один файл):
# https://github.com/koldovsky/2026-quitcode-11-devops-operations-hw/blob/main/materials/ops-kit/.github/workflows/smoke.yml
set -u

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "::warning title=alert::Немає секретів TELEGRAM_BOT_TOKEN і/або TELEGRAM_CHAT_ID — алерт пропущено (smoke однаково червоний)."
  exit 0
fi

host=$(printf '%s' "${ALERT_URL:-}" | sed -E 's#^[A-Za-z]+://##; s#[/?\#].*$##')
branch=""
if [ -n "${ALERT_BRANCH:-}" ]; then branch=" (гілка ${ALERT_BRANCH})"; fi
sha="${ALERT_SHA:-}"
text=$(printf 'ЧЕРВОНИЙ SMOKE\nРепо: %s\nWorkflow: %s, job: %s\nСередовище: %s%s\nАдреса: %s\nКоміт: %s\nПрогін: %s' \
  "${GITHUB_REPOSITORY:-?}" "${GITHUB_WORKFLOW:-smoke}" "${ALERT_JOB:-?}" "${ALERT_ENV:-?}" "$branch" \
  "${host:-не задано}" "${sha:0:7}" "${RUN_URL:-?}")

if curl -sS --fail --max-time 15 -o /dev/null "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=${text}" 2>/dev/null; then
  echo "Алерт надіслано в Telegram."
else
  echo "::warning title=alert::Telegram не прийняв повідомлення — перевірте токен бота, chat id і чи бот доданий у чат."
fi
exit 0
