import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.ts';
import { escapeHtml } from '../../../../shared/security.ts';
import { computeMembershipTier } from '../../../../shared/wishlistHelpers.ts';
import { getDatabaseStatus, requireDatabase } from '../../database/connection.ts';
import {
  clearAuthCookie,
  extractAuthToken,
  isCsrfSafeRequest,
  requireAuth,
  setAuthCookie,
  signAuthToken,
  type AuthJwtPayload,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import { sendTransactionalEmail } from '../../services/email.service.ts';
import { ReviewModel } from '../marketing/marketing.model.ts';
import { OrderModel } from '../orders/order.model.ts';
import { UserModel } from '../users/user.model.ts';

const OAUTH_STATE_COOKIE = 'novara_oauth_state';

function signOAuthState(state: string, provider: string): string {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${provider}:${state}`).digest('hex');
}

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again shortly.' },
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(150),
  phone: z.string().trim().min(6).max(25).optional(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const resetRequestSchema = z.object({
  email: z.string().trim().email(),
});

const resetConfirmSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(100),
});

export function sanitizeUser(
  user: InstanceType<typeof UserModel>,
  stats?: {
    deliveredOrdersCount?: number;
    totalDeliveredSpend?: number;
    ordersCount?: number;
    reviewsCount?: number;
  }
) {
  const membershipTier = computeMembershipTier({
    deliveredOrdersCount: stats?.deliveredOrdersCount ?? 0,
    totalDeliveredSpend: stats?.totalDeliveredSpend ?? 0,
    emailVerified: Boolean(user.emailVerified),
  });
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    gender: user.gender || undefined,
    role: user.role,
    emailVerified: user.emailVerified,
    authProvider: user.authProvider,
    avatarUrl: user.avatarUrl || '',
    avatarPublicId: user.avatarPublicId || '',
    savedAddresses: user.savedAddresses || [],
    wishlist: (user.wishlist || []).map((id: unknown) => String(id)),
    notificationPreferences: user.notificationPreferences,
    membershipTier,
    ordersCount: stats?.ordersCount ?? 0,
    reviewsCount: stats?.reviewsCount ?? 0,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : undefined,
  };
}

export async function getUserAccountStats(userId: unknown) {
  const [ordersCount, deliveredAgg, reviewsCount] = await Promise.all([
    OrderModel.countDocuments({ userId }),
    OrderModel.aggregate<{ count: number; totalSpend: number }>([
      { $match: { userId, orderStatus: 'delivered' } },
      { $group: { _id: null, count: { $sum: 1 }, totalSpend: { $sum: '$totalAmount' } } },
    ]),
    ReviewModel.countDocuments({ userId }),
  ]);

  return {
    ordersCount,
    deliveredOrdersCount: deliveredAgg[0]?.count ?? 0,
    totalDeliveredSpend: deliveredAgg[0]?.totalSpend ?? 0,
    reviewsCount,
  };
}

router.get(
  '/providers',
  asyncHandler(async (_req, res) => {
    let needsSuperAdminBootstrap = false;
    try {
      const superAdminCount = await UserModel.countDocuments({ role: 'super_admin' });
      needsSuperAdminBootstrap = superAdminCount === 0 && !env.superAdminEmail;
    } catch {
      needsSuperAdminBootstrap = false;
    }

    res.json({
      googleConfigured: env.oauth.isGoogleConfigured,
      facebookConfigured: env.oauth.isFacebookConfigured,
      needsSuperAdminBootstrap,
    });
  })
);

router.post(
  '/bootstrap-admin',
  requireDatabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const existingSuperAdmin = await UserModel.exists({ role: 'super_admin' });
    if (existingSuperAdmin || env.superAdminEmail) {
      res.status(409).json({
        error: 'Bootstrap locked',
        message: 'A Super Admin account is already configured.',
      });
      return;
    }

    const parsed = registerSchema.parse(req.body);
    const email = parsed.email.toLowerCase();
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);
    const admin = await UserModel.create({
      name: parsed.name,
      email,
      phone: parsed.phone,
      passwordHash,
      role: 'super_admin',
      emailVerified: true,
      authProvider: 'local',
      lastLoginAt: new Date(),
    });

    const token = signAuthToken(String(admin._id), admin.role, admin.tokenVersion ?? 0);
    setAuthCookie(res, token);

    await recordAuditLog({
      actorId: admin._id,
      actorEmail: admin.email,
      actorRole: admin.role,
      action: 'BOOTSTRAP_SUPER_ADMIN',
      resourceType: 'User',
      resourceId: String(admin._id),
      ipAddress: req.ip,
    });

    res.status(201).json({ token, user: sanitizeUser(admin) });
  })
);

router.post(
  '/register',
  requireDatabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.parse(req.body);
    const email = parsed.email.toLowerCase();

    const existing = await UserModel.findOne({ email });
    if (existing) {
      res.status(409).json({
        error: 'Account already exists',
        message: 'An account with this email address already exists.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);
    const verifyToken = crypto.randomBytes(24).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verifyToken).digest('hex');

    const user = await UserModel.create({
      name: parsed.name,
      email,
      phone: parsed.phone,
      passwordHash,
      role: 'customer',
      emailVerified: false,
      authProvider: 'local',
      verificationTokenHash,
      lastLoginAt: new Date(),
    });

    const token = signAuthToken(String(user._id), user.role, user.tokenVersion ?? 0);
    setAuthCookie(res, token);

    void sendTransactionalEmail({
      userId: String(user._id),
      email: user.email,
      type: 'verification',
      subject: 'Verify your NOVARA COMMERCE email',
      html: `<p>Welcome to NOVARA COMMERCE, ${escapeHtml(user.name)}.</p><p>Verify your account here: <a href="${env.appUrl}/verify-email?token=${verifyToken}">Verify Email</a></p>`,
    });

    res.status(201).json({
      token,
      user: sanitizeUser(user),
    });
  })
);

router.post(
  '/login',
  requireDatabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.parse(req.body);
    const email = parsed.email.toLowerCase();

    const user = await UserModel.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash) {
      res.status(401).json({
        error: 'Invalid credentials',
        message: 'Incorrect email or password.',
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        error: 'Account disabled',
        message: 'This account has been suspended. Please contact support.',
      });
      return;
    }

    const validPassword = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({
        error: 'Invalid credentials',
        message: 'Incorrect email or password.',
      });
      return;
    }

    user.lastLoginAt = new Date();
    await user.save();

    const stats = await getUserAccountStats(user._id);
    const token = signAuthToken(String(user._id), user.role, user.tokenVersion ?? 0);
    setAuthCookie(res, token);

    res.json({
      token,
      user: sanitizeUser(user, stats),
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = extractAuthToken(req);
    if (token && getDatabaseStatus().connected && isCsrfSafeRequest(req)) {
      try {
        const decoded = jwt.verify(token, env.jwtSecret) as AuthJwtPayload;
        if (decoded?.sub) {
          await UserModel.findByIdAndUpdate(decoded.sub, { $inc: { tokenVersion: 1 } });
        }
      } catch {
        // Expired or invalid token still clears client cookie cleanly
      }
    }
    clearAuthCookie(res);
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireDatabase,
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const stats = await getUserAccountStats(req.user!._id);
    res.json({ user: sanitizeUser(req.user!, stats) });
  })
);

router.post(
  '/verify-email',
  requireDatabase,
  asyncHandler(async (req, res) => {
    const token = z.string().min(10).parse(req.body?.token);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await UserModel.findOne({ verificationTokenHash: tokenHash }).select('+verificationTokenHash');
    if (!user) {
      res.status(400).json({ error: 'Invalid or expired verification token.' });
      return;
    }
    user.emailVerified = true;
    user.verificationTokenHash = undefined;
    await user.save();
    res.json({ ok: true, message: 'Email verified successfully.' });
  })
);

router.post(
  '/password-reset/request',
  requireDatabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = resetRequestSchema.parse(req.body);
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (user && user.authProvider === 'local') {
      const resetToken = crypto.randomBytes(24).toString('hex');
      user.resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      await sendTransactionalEmail({
        userId: String(user._id),
        email: user.email,
        type: 'password_reset',
        subject: 'Reset your NOVARA COMMERCE password',
        html: `<p>Use this link within 60 minutes to reset your password:</p><p><a href="${env.appUrl}/reset-password?token=${resetToken}">Reset Password</a></p>`,
      });
    }

    res.json({
      ok: true,
      message: 'If an eligible account exists for that email, a password reset link has been sent.',
    });
  })
);

router.post(
  '/password-reset/confirm',
  requireDatabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = resetConfirmSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(parsed.token).digest('hex');
    const user = await UserModel.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpiresAt');

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired password reset token.' });
      return;
    }

    user.passwordHash = await bcrypt.hash(parsed.newPassword, 12);
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    res.json({ ok: true, message: 'Password updated. You may now sign in.' });
  })
);

// Real OAuth Popup Flow (Google & Facebook) using APP_URL callback
router.get(
  '/oauth/:provider/url',
  asyncHandler(async (req, res) => {
    const provider = req.params.provider;
    const redirectUri = `${env.appUrl}/api/auth/oauth/${provider}/callback`;
    const state = crypto.randomBytes(16).toString('hex');
    const stateCookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      partitioned: true,
      maxAge: 10 * 60 * 1000,
      path: '/',
    };

    if (provider === 'google') {
      if (!env.oauth.isGoogleConfigured) {
        res.status(503).json({
          error: 'Google OAuth not configured',
          code: 'OAUTH_UNCONFIGURED',
          message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in.',
          callbackUrl: redirectUri,
        });
        return;
      }
      res.cookie(OAUTH_STATE_COOKIE, `${state}.${signOAuthState(state, provider)}`, stateCookieOptions);
      const params = new URLSearchParams({
        client_id: env.oauth.googleClientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      });
      res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
      return;
    }

    if (provider === 'facebook') {
      if (!env.oauth.isFacebookConfigured) {
        res.status(503).json({
          error: 'Facebook OAuth not configured',
          code: 'OAUTH_UNCONFIGURED',
          message: 'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to enable Facebook sign-in.',
          callbackUrl: redirectUri,
        });
        return;
      }
      res.cookie(OAUTH_STATE_COOKIE, `${state}.${signOAuthState(state, provider)}`, stateCookieOptions);
      const params = new URLSearchParams({
        client_id: env.oauth.facebookAppId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'email,public_profile',
        state,
      });
      res.json({ url: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}` });
      return;
    }

    res.status(400).json({ error: 'Unsupported OAuth provider' });
  })
);

router.get(
  ['/oauth/:provider/callback', '/oauth/:provider/callback/'],
  requireDatabase,
  asyncHandler(async (req, res) => {
    const provider = req.params.provider;
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const stateParam = typeof req.query.state === 'string' ? req.query.state : '';
    const cookieRaw = typeof req.cookies?.[OAUTH_STATE_COOKIE] === 'string' ? req.cookies[OAUTH_STATE_COOKIE] : '';
    const [cookieState, cookieSig] = cookieRaw.split('.');
    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
    });

    const expectedSig = cookieState ? signOAuthState(cookieState, provider) : '';
    const sigMatches =
      Boolean(cookieSig && expectedSig) &&
      cookieSig.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(cookieSig), Buffer.from(expectedSig));
    const stateValid =
      Boolean(stateParam && cookieState && sigMatches) &&
      stateParam.length === cookieState.length &&
      crypto.timingSafeEqual(Buffer.from(stateParam), Buffer.from(cookieState));

    if (!stateValid) {
      res.status(403).send('<p>Invalid or expired OAuth state. Please retry sign-in.</p>');
      return;
    }

    const redirectUri = `${env.appUrl}/api/auth/oauth/${provider}/callback`;

    if (!code) {
      res.status(400).send('<p>Authorization code missing.</p>');
      return;
    }

    let profile: { id: string; email: string; name: string; avatarUrl?: string } | null = null;

    if (provider === 'google' && env.oauth.isGoogleConfigured) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.oauth.googleClientId,
          client_secret: env.oauth.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (tokenData.access_token) {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const info = (await userInfoRes.json()) as {
          id?: string;
          email?: string;
          verified_email?: boolean;
          name?: string;
          picture?: string;
        };
        if (info.id && info.email && info.verified_email !== false) {
          profile = {
            id: info.id,
            email: info.email.toLowerCase(),
            name: info.name || info.email.split('@')[0],
            avatarUrl: info.picture,
          };
        }
      }
    } else if (provider === 'facebook' && env.oauth.isFacebookConfigured) {
      const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', env.oauth.facebookAppId);
      tokenUrl.searchParams.set('redirect_uri', redirectUri);
      tokenUrl.searchParams.set('client_secret', env.oauth.facebookAppSecret);
      tokenUrl.searchParams.set('code', code);

      const tokenRes = await fetch(tokenUrl.toString());
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (tokenData.access_token) {
        const infoUrl = new URL('https://graph.facebook.com/me');
        infoUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
        infoUrl.searchParams.set('access_token', tokenData.access_token);
        const infoRes = await fetch(infoUrl.toString());
        const info = (await infoRes.json()) as {
          id?: string;
          name?: string;
          email?: string;
          picture?: { data?: { url?: string } };
        };
        if (info.id && info.email) {
          profile = {
            id: info.id,
            email: info.email.toLowerCase(),
            name: info.name || 'Facebook User',
            avatarUrl: info.picture?.data?.url,
          };
        }
      }
    }

    if (!profile) {
      res.status(400).send('<p>Unable to verify OAuth profile with provider.</p>');
      return;
    }

    let user = await UserModel.findOne({ email: profile.email });
    if (!user) {
      user = await UserModel.create({
        name: profile.name,
        email: profile.email,
        role: 'customer',
        emailVerified: true,
        authProvider: provider === 'google' ? 'google' : 'facebook',
        providerId: profile.id,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: new Date(),
      });
    } else {
      if (!user.isActive) {
        res.status(403).send('<p>This account has been suspended. Please contact support.</p>');
        return;
      }
      user.lastLoginAt = new Date();
      if (!user.avatarUrl && profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
      await user.save();
    }

    const token = signAuthToken(String(user._id), user.role, user.tokenVersion ?? 0);
    setAuthCookie(res, token);
    const targetOrigin = new URL(env.appUrl).origin;

    res.send(`
      <!doctype html>
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'NOVARA_OAUTH_SUCCESS', token: ${JSON.stringify(token)} }, ${JSON.stringify(targetOrigin)});
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window will close automatically.</p>
        </body>
      </html>
    `);
  })
);

export default router;
