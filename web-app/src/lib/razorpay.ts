import { post } from './api';

type Order = { keyId: string; orderId: string; amount: number; currency: string; description: string; prefill?: Record<string, string> };
type RzInstance = { open: () => void; on: (event: string, cb: () => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RzInstance;
  }
}

function loadCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Checkout is only available in the browser'));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://checkout.razorpay.com/v1/checkout.js';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.body.appendChild(el);
  });
}

/** Creates the order, opens Razorpay checkout, then verifies the payment on the server. */
export async function payFor(target: { bookingId?: string; recurringPlanId?: string }): Promise<'paid' | 'dismissed'> {
  const order = (await post<Order>('/customer/payments/order', target)).data;
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rz = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'Care Elders India',
      description: order.description,
      prefill: order.prefill,
      theme: { color: '#0E5A8A' },
      handler: async (r: Record<string, string>) => {
        try {
          await post('/customer/payments/verify', r);
          resolve('paid');
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => resolve('dismissed') },
    });
    rz.on('payment.failed', () => reject(new Error('Payment failed. Please try again.')));
    rz.open();
  });
}
