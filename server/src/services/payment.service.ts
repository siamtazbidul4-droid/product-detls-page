import crypto from 'node:crypto';
import { env } from '../config/env.ts';
import type { IOrder } from '../modules/orders/order.model.ts';

export interface PaymentInitiationResult {
  initiated: boolean;
  provider: 'cod' | 'sslcommerz';
  transactionRef: string;
  gatewayUrl?: string;
  message?: string;
}

export interface PaymentVerificationResult {
  verified: boolean;
  transactionRef: string;
  providerValId?: string;
  amount: number;
  channel?: string;
  rawSummary?: Record<string, unknown>;
  reason?: string;
}

export function getPaymentGatewayStatus() {
  return {
    provider: env.payment.provider,
    codAvailable: true,
    gatewayConfigured: env.payment.isGatewayConfigured,
    sandbox: env.payment.sandbox,
    supportedMethods: env.payment.isGatewayConfigured
      ? ['Cash on Delivery (COD)', 'Cards (VISA / Mastercard)', 'bKash / Nagad / Rocket (via SSLCommerz)']
      : ['Cash on Delivery (COD)'],
  };
}

export async function initiateOrderPayment(order: IOrder): Promise<PaymentInitiationResult> {
  const transactionRef = `NVX-${order.orderNumber}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  if (order.paymentMethod === 'cod') {
    return {
      initiated: true,
      provider: 'cod',
      transactionRef,
      message: 'Cash on Delivery selected. Payment will be collected upon delivery.',
    };
  }

  if (!env.payment.isGatewayConfigured) {
    throw Object.assign(
      new Error(
        'Online payment gateway (SSLCommerz) credentials are not configured. Please choose Cash on Delivery or configure PAYMENT_STORE_ID and PAYMENT_STORE_PASSWORD.'
      ),
      { statusCode: 503, code: 'PAYMENT_GATEWAY_UNCONFIGURED' }
    );
  }

  const endpoint = env.payment.sandbox
    ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
    : 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';

  const body = new URLSearchParams({
    store_id: env.payment.storeId,
    store_passwd: env.payment.storePassword,
    total_amount: String(order.totalAmount),
    currency: 'BDT',
    tran_id: transactionRef,
    success_url: `${env.appUrl}/api/payments/sslcommerz/success`,
    fail_url: `${env.appUrl}/api/payments/sslcommerz/fail`,
    cancel_url: `${env.appUrl}/api/payments/sslcommerz/cancel`,
    ipn_url: `${env.appUrl}/api/payments/sslcommerz/ipn`,
    shipping_method: order.deliveryMethod === 'express' ? 'YES' : 'NO',
    product_name: `NOVARA Order ${order.orderNumber}`,
    product_category: 'Retail',
    product_profile: 'general',
    cus_name: order.customerName,
    cus_email: order.customerEmail,
    cus_add1: order.shippingAddress.houseAddress,
    cus_city: order.shippingAddress.districtName,
    cus_state: order.shippingAddress.divisionName,
    cus_postcode: '1000',
    cus_country: 'Bangladesh',
    cus_phone: order.customerPhone,
    ship_name: order.shippingAddress.recipientName,
    ship_add1: order.shippingAddress.houseAddress,
    ship_city: order.shippingAddress.districtName,
    ship_country: 'Bangladesh',
  });

  if (order.paymentChannel === 'bkash') {
    body.set('multi_card_name', 'bkash');
  } else if (order.paymentChannel === 'nagad') {
    body.set('multi_card_name', 'nagad');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const payload = (await response.json()) as {
    status?: string;
    GatewayPageURL?: string;
    failedreason?: string;
  };

  if (!response.ok || payload.status !== 'SUCCESS' || !payload.GatewayPageURL) {
    throw Object.assign(
      new Error(payload.failedreason || 'Unable to initialize SSLCommerz payment session.'),
      { statusCode: 502, code: 'PAYMENT_INIT_FAILED' }
    );
  }

  return {
    initiated: true,
    provider: 'sslcommerz',
    transactionRef,
    gatewayUrl: payload.GatewayPageURL,
  };
}

export async function verifySslCommerzCallback(params: {
  valId?: string;
  tranId?: string;
  expectedAmount: number;
}): Promise<PaymentVerificationResult> {
  if (!env.payment.isGatewayConfigured) {
    return {
      verified: false,
      transactionRef: params.tranId || '',
      amount: 0,
      reason: 'Payment gateway credentials not configured.',
    };
  }
  if (!params.valId || !params.tranId) {
    return {
      verified: false,
      transactionRef: params.tranId || '',
      amount: 0,
      reason: 'Missing val_id or tran_id from payment callback.',
    };
  }

  const validatorBase = env.payment.sandbox
    ? 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'
    : 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php';

  const url = new URL(validatorBase);
  url.searchParams.set('val_id', params.valId);
  url.searchParams.set('store_id', env.payment.storeId);
  url.searchParams.set('store_passwd', env.payment.storePassword);
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status?: string;
    tran_id?: string;
    val_id?: string;
    amount?: string;
    currency?: string;
    card_type?: string;
  };

  const paidAmount = Number(data.amount || 0);
  const statusValid = data.status === 'VALID' || data.status === 'VALIDATED';
  const tranValid = data.tran_id === params.tranId;
  const amountValid = Math.abs(paidAmount - params.expectedAmount) < 0.01 && data.currency === 'BDT';

  if (!statusValid || !tranValid || !amountValid) {
    return {
      verified: false,
      transactionRef: params.tranId,
      providerValId: params.valId,
      amount: paidAmount,
      reason: 'Gateway validation mismatch on status, transaction ID, or BDT amount.',
      rawSummary: { status: data.status, amount: data.amount, currency: data.currency },
    };
  }

  return {
    verified: true,
    transactionRef: params.tranId,
    providerValId: data.val_id || params.valId,
    amount: paidAmount,
    channel: data.card_type || 'SSLCommerz',
    rawSummary: { status: data.status, card_type: data.card_type, amount: data.amount },
  };
}

export function verifySslCommerzIpnSignature(
  payload: Record<string, unknown>,
  storePassword: string
): boolean {
  const verifySign = typeof payload.verify_sign === 'string' ? payload.verify_sign.trim() : '';
  const verifyKeyRaw = typeof payload.verify_key === 'string' ? payload.verify_key.trim() : '';
  if (!verifySign || !verifyKeyRaw || !storePassword) {
    return false;
  }

  const keys = verifyKeyRaw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) return false;

  const storePasswdMd5 = crypto.createHash('md5').update(storePassword).digest('hex');
  const map: Record<string, string> = { store_passwd: storePasswdMd5 };
  for (const key of keys) {
    if (key === 'store_passwd') continue;
    const rawVal = payload[key];
    map[key] = rawVal === undefined || rawVal === null ? '' : String(rawVal);
  }

  const sortedQuery = Object.keys(map)
    .sort()
    .map((k) => `${k}=${map[k]}`)
    .join('&');
  const expectedHash = crypto.createHash('md5').update(sortedQuery).digest('hex');

  return (
    expectedHash.length === verifySign.length &&
    crypto.timingSafeEqual(Buffer.from(expectedHash.toLowerCase()), Buffer.from(verifySign.toLowerCase()))
  );
}
