import express, { Router } from 'express';
import swaggerUiDist from 'swagger-ui-dist';
import { openApiDocument } from './openapi.js';

/**
 * Swagger UI at /api/docs. Asset URLs are absolute and the page is served at the bare path, because
 * the Vercel rewrite strips trailing slashes (swagger-ui-express relies on `/api/docs/` + relative URLs).
 * The bootstrap script is a separate file so the strict CSP needs no 'unsafe-inline' for scripts.
 */
const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LAMS API</title>
  <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
  <script src="/api/docs/init.js"></script>
</body>
</html>`;

const INIT = `window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true });`;

export const docsRouter = Router();
docsRouter.get('/openapi.json', (_req, res) => res.json(openApiDocument()));
docsRouter.get('/docs', (_req, res) => res.type('html').send(PAGE));
docsRouter.get('/docs/init.js', (_req, res) => res.type('application/javascript').send(INIT));
docsRouter.use('/docs/assets', express.static(swaggerUiDist.getAbsoluteFSPath(), { index: false, maxAge: '7d' }));
