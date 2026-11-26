# NOVARA COMMERCE — Bangladesh Single-Vendor E-Commerce Platform

Full-stack TypeScript e-commerce storefront and operations platform tailored for the Bangladesh retail market.

## Architecture & Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, **Redux Toolkit** (Cart, Auth, Toast state), React Router.
- **Backend**: Node.js + Express (`server.ts` on Port `3000`), Zod schema validation, RBAC permissions, atomic stock reservation, idempotent checkout & SSLCommerz IPN handling, Helmet security headers.
- **Database**: **MongoDB Atlas** via Mongoose (strictly explicit `503 DB_UNAVAILABLE` when `MONGODB_URI` is unconfigured — zero mock fallback).
- **Media**: **Cloudinary** signed server-side upload with magic-byte verification & reference-safe asset deletion.
- **Email**: **Resend** HTTP API for transactional notifications (`order_confirmation`, `shipment_update`, `payment_status`, `refund_update`, `back_in_stock`, `password_reset`).

## Required Environment Variables (`.env`)
Copy `.env.example` to `.env` and set:
- `MONGODB_URI`: MongoDB Atlas SRV connection string (`mongodb+srv://...`).
- `JWT_SECRET`: Strong random secret (min 32 characters).
- `APP_URL`: Public URL of your deployment (for redirects, OAuth callbacks, sitemap, and SSLCommerz callbacks).
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Cloudinary media credentials.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: Resend email delivery credentials.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth 2.0 Web Client credentials.
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`: Facebook Login App credentials.
- `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_IS_LIVE`: Bangladesh SSLCommerz credentials (COD works out of the box once MongoDB Atlas is connected).

## OAuth Callback URLs
Configure these exact Authorized Redirect URIs in Google Cloud Console and Facebook Developers:
- **Dev Preview**:
  - Google: `https://ais-dev-gopuzalwqcsoi6kssgf5ik-505851149984.asia-southeast1.run.app/api/auth/oauth/google/callback`
  - Facebook: `https://ais-dev-gopuzalwqcsoi6kssgf5ik-505851149984.asia-southeast1.run.app/api/auth/oauth/facebook/callback`
- **Shared Preview**:
  - Google: `https://ais-pre-gopuzalwqcsoi6kssgf5ik-505851149984.asia-southeast1.run.app/api/auth/oauth/google/callback`
  - Facebook: `https://ais-pre-gopuzalwqcsoi6kssgf5ik-505851149984.asia-southeast1.run.app/api/auth/oauth/facebook/callback`

## Commands
- `npm run dev` — Start Express + Vite dev server on port 3000.
- `npm test` — Run shared domain unit tests (`tsx --test shared/domain.test.ts`).
- `npm run lint` — Run TypeScript typecheck (`tsc --noEmit`).
- `npm run build` — Build production Vite client bundle (`dist/`).
- `npm run start` — Serve production build & API via `server.ts`.
- `npm run seed` — Run idempotent Bangladesh catalog seed against `MONGODB_URI`.

## First-Time Super Admin & Catalog Setup
1. Configure `MONGODB_URI` and `JWT_SECRET` in `.env` (or Render Environment Variables).
2. Open the app, click **Account → Sign In / Register**, and use **Bootstrap First Super Admin** (available only when zero staff accounts exist in MongoDB Atlas).
3. Navigate to **Admin Panel → Overview** and click **Seed Bangladesh Catalog** to populate sample Electronics, Fashion, Books, Beauty, Home & Living items, `NOVARA10` coupon, and CMS defaults.
