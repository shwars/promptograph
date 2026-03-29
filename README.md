# Promptograph

Promptograph is a static iPhone-friendly web app that captures a photo, turns it into a recreation-oriented image prompt with OpenAI vision, lets you edit that prompt, and then renders a new image with GPT Image 1.5.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open the local URL on your desktop browser, or expose it over HTTPS if you want to test camera access on iPhone before deploying.

## Runtime API key

The shipped app does not read `.env`. Users enter their own OpenAI API key inside the app and it is stored in `localStorage` on that device.

## GitHub Pages deployment

This repo includes a GitHub Actions workflow that builds the Vite app and deploys `dist/` to GitHub Pages.

Required repository settings:

1. In GitHub, enable Pages and set the source to `GitHub Actions`.
2. Push to `main` or `master`.

## Notes

- Camera access requires HTTPS on iPhone.
- OpenAI recommends keeping API keys server-side. This app is intentionally client-side only, so it shows that tradeoff in the UI and expects each user to supply their own key.
