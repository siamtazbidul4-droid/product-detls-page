import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  appUrl: (process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, ''),
  mongodbUri: process.env.MONGODB_URI?.trim() || '',
  jwtSecret: process.env.JWT_SECRET?.trim() || EPHEMERAL_JWT_SECRET,
  hasConfiguredJwtSecret: Boolean(process.env.JWT_SECRET?.trim()),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || '',
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD?.trim() || '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || '',
    apiKey: process.env.CLOUDINARY_API_KEY?.trim() || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || '',
    get isConfigured() {
      return Boolean(this.cloudName && this.apiKey && this.apiSecret);
    },
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY?.trim() || '',
    emailFrom:
      process.env.EMAIL_FROM?.trim() ||
      process.env.RESEND_FROM_EMAIL?.trim() ||
      'NOVARA COMMERCE <no-reply@novaracommerce.com>',
    get isConfigured() {
      return Boolean(this.apiKey);
    },
  },
  oauth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
    facebookAppId: process.env.FACEBOOK_APP_ID?.trim() || '',
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET?.trim() || '',
    get isGoogleConfigured() {
      return Boolean(this.googleClientId && this.googleClientSecret);
    },
    get isFacebookConfigured() {
      return Boolean(this.facebookAppId && this.facebookAppSecret);
    },
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER?.trim() || 'sslcommerz',
    storeId:
      process.env.PAYMENT_STORE_ID?.trim() ||
      process.env.SSLCOMMERZ_STORE_ID?.trim() ||
      '',
    storePassword:
      process.env.PAYMENT_STORE_PASSWORD?.trim() ||
      process.env.SSLCOMMERZ_STORE_PASSWORD?.trim() ||
      '',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET?.trim() || '',
    sandbox:
      process.env.SSLCOMMERZ_IS_LIVE === 'true'
        ? false
        : process.env.PAYMENT_SANDBOX !== 'false',
    get isGatewayConfigured() {
      return Boolean(this.storeId && this.storePassword);
    },
  },
};
