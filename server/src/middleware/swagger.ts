// Swagger UI 中间件 - 提供 API 文档和交互式调试界面
// 优化2：添加 Swagger/OpenAPI 文档

import { Request, Response } from 'express';
import { swaggerSpec } from '../config/swagger.js';

/**
 * 生成 Swagger UI HTML 页面
 * 使用 CDN 加载 Swagger UI 资源，无需额外 npm 依赖
 */
function getSwaggerUiHtml(): string {
  const spec = JSON.stringify(swaggerSpec, null, 2);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Parking API 文档</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .topbar { display: none; }
    .scheme-container { background: #f7f6f3 !important; }
    .swagger-ui .info .title { color: #2c2a26; }
    .swagger-ui .btn.authorize { background: #4a8564; border-color: #4a8564; }
    .swagger-ui .btn.authorize svg { fill: #fff; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        spec: ${spec},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        supportedSubmitMethods: ['get', 'post', 'put', 'delete'],
        onComplete: function() {
          console.log('Smart Parking API Docs loaded');
        }
      });
    };
  </script>
</body>
</html>`;
}

/**
 * Swagger UI 中间件
 * 挂载路径：/api-docs
 */
export function swaggerUiHandler(_req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getSwaggerUiHtml());
}

/**
 * OpenAPI JSON Spec 端点
 * 挂载路径：/api-docs.json
 */
export function swaggerJsonHandler(_req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(swaggerSpec);
}
