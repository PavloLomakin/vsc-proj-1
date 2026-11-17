# Инвест-миллионер

Веб-игра и мобильное приложение на Expo.

## Запуск локально

1. Установите зависимости:

   ```bash
   npm install
   ```

2. Запустите проект:

   ```bash
   npm run web
   ```

Игра также сохраняет прогресс локально. Настройка Google-входа и Firebase
описана в [FIREBASE_SETUP.md](./FIREBASE_SETUP.md).

## Публикация веб-версии

При push в ветку `main` GitHub Actions собирает статический сайт Expo и публикует
его через GitHub Pages. В **Settings → Pages → Build and deployment** выберите
**Source: GitHub Actions**. После успешного workflow сайт будет доступен по адресу
`https://pavlolomakin.github.io/vsc-proj-1/`.

Локальная production-сборка:

```bash
npm run export:web
```
