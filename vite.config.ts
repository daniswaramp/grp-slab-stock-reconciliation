import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.DATABASE_URL) {
    process.env.DATABASE_URL = env.DATABASE_URL;
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'api-dev-server',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && req.url.startsWith('/api/')) {
              try {
                const url = new URL(req.url, 'http://localhost');
                const route = url.pathname.replace('/api/', '').split('?')[0];

                let body: any = {};
                if (req.method === 'POST' || req.method === 'DELETE') {
                  const chunks: any[] = [];
                  for await (const chunk of req) {
                    chunks.push(chunk);
                  }
                  const raw = Buffer.concat(chunks).toString();
                  if (raw) {
                    try {
                      body = JSON.parse(raw);
                    } catch (e) {
                      body = raw;
                    }
                  }
                }

                const reqAdapter: any = req;
                reqAdapter.body = body;
                reqAdapter.query = Object.fromEntries(url.searchParams.entries());

                const resAdapter: any = res;
                resAdapter.status = (code: number) => {
                  res.statusCode = code;
                  return resAdapter;
                };
                resAdapter.json = (data: any) => {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                  return resAdapter;
                };
                resAdapter.send = (data: any) => {
                  res.end(data);
                  return resAdapter;
                };

                if (route === 'query') {
                  const mod = await server.ssrLoadModule('/api/query.ts');
                  return await mod.default(reqAdapter, resAdapter);
                } else if (route === 'storage') {
                  const mod = await server.ssrLoadModule('/api/storage.ts');
                  return await mod.default(reqAdapter, resAdapter);
                } else if (route === 'events') {
                  const mod = await server.ssrLoadModule('/api/events.ts');
                  return await mod.default(reqAdapter, resAdapter);
                }
              } catch (err: any) {
                console.error('Local API dev server error:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
