import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { env } from './server/src/config/env.ts';
import { escapeXml } from './shared/security.ts';
import { connectDatabase, getDatabaseStatus } from './server/src/database/connection.ts';
import { seedDatabaseIfNeeded } from './server/src/database/seed.ts';
import { errorHandler } from './server/src/middleware/error.middleware.ts';
import authRoutes from './server/src/modules/auth/auth.routes.ts';
import cartRoutes from './server/src/modules/cart/cart.routes.ts';
import catalogRoutes from './server/src/modules/catalog/catalog.routes.ts';
import { CategoryModel, ProductModel } from './server/src/modules/catalog/catalog.model.ts';
import cmsRoutes from './server/src/modules/cms/cms.routes.ts';
import inventoryRoutes from './server/src/modules/inventory/inventory.routes.ts';
import marketingRoutes from './server/src/modules/marketing/marketing.routes.ts';
import ordersRoutes from './server/src/modules/orders/orders.routes.ts';
import paymentsRoutes from './server/src/modules/payments/payments.routes.ts';
import reviewsRoutes from './server/src/modules/reviews/reviews.routes.ts';
import supportRoutes from './server/src/modules/support/support.routes.ts';
import usersRoutes from './server/src/modules/users/users.routes.ts';

async function bootstrapServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
        const isAiStudioPreview = /^https:\/\/ais-(dev|pre)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i.test(origin);
        const allowed = origin === env.appUrl || isLocalhost || isAiStudioPreview;
        callback(null, allowed);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // Attempt MongoDB Atlas connection
  const dbConnected = await connectDatabase();
  if (dbConnected) {
    try {
      await seedDatabaseIfNeeded({ forceCatalog: false });
    } catch (err) {
      console.error('[Startup Seed Warning]', err instanceof Error ? err.message : err);
    }
  }

  // Health & Readiness Endpoint
  app.get('/api/health', (_req, res) => {
    const db = getDatabaseStatus();
    res.status(db.connected ? 200 : 503).json({
      status: db.connected ? 'ok' : 'degraded',
      service: 'novara-commerce',
      database: db,
      integrations: {
        cloudinary: env.cloudinary.isConfigured,
        resend: env.resend.isConfigured,
        googleOAuth: env.oauth.isGoogleConfigured,
        facebookOAuth: env.oauth.isFacebookConfigured,
        paymentGateway: env.payment.isGatewayConfigured,
      },
    });
  });

  // Dynamic SEO Sitemap & Robots.txt
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /checkout',
        'Disallow: /cart',
        'Disallow: /account',
        `Sitemap: ${env.appUrl}/sitemap.xml`,
      ].join('\n')
    );
  });

  app.get('/sitemap.xml', async (_req, res) => {
    const base = env.appUrl;
    const urls: string[] = [`${base}/`, `${base}/shop`, `${base}/contact`, `${base}/track-order`];
    const db = getDatabaseStatus();
    if (db.connected) {
      const [categories, products] = await Promise.all([
        CategoryModel.find({ isActive: true }).select('slug').lean(),
        ProductModel.find({ status: 'published' }).select('slug').lean(),
      ]);
      for (const c of categories) urls.push(`${base}/category/${encodeURIComponent(c.slug)}`);
      for (const p of products) urls.push(`${base}/product/${encodeURIComponent(p.slug)}`);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`)
      .join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  });

  // Modular REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/marketing', marketingRoutes);
  app.use('/api/reviews', reviewsRoutes);
  app.use('/api/cms', cmsRoutes);
  app.use('/api/support', supportRoutes);

  // Unknown API routes must return JSON 404 rather than SPA HTML
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use(errorHandler);

  // Frontend Vite Dev Middleware or Production Static Bundle
  if (!env.isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(500).send('Client production bundle not found. Run npm run build.');
      }
    });
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[NOVARA COMMERCE] Server listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
  });
}

bootstrapServer().catch((err) => {
  console.error('[Fatal Startup Error]', err);
  process.exit(1);
});
