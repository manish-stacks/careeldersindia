import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { C, S } from '@/lib/theme';
import { Button, Loading, Notice, Screen, T } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';

type Order = { paymentId: string; keyId: string; orderId: string; amount: number; currency: string; description: string; prefill: { name?: string; email?: string; contact?: string } };
type Phase = { s: 'loading' } | { s: 'checkout'; order: Order } | { s: 'verifying' } | { s: 'done'; pending?: boolean } | { s: 'error'; message: string; code?: string } | { s: 'cancelled' };

/** Razorpay Checkout inside a WebView — works in Expo Go and needs no native SDK. The server re-verifies every payment. */
function checkoutHtml(o: Order) {
  const opts = {
    key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency, name: 'Care Elders India', description: o.description,
    prefill: o.prefill, theme: { color: '#0E5A8A' }, retry: { enabled: true, max_count: 3 },
  };
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body style="margin:0;background:#F7F8FA;font-family:sans-serif">
<script>
  function send(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
  var o=${JSON.stringify(opts)};
  o.handler=function(r){send({type:'success',data:r});};
  o.modal={ondismiss:function(){send({type:'dismiss'});},confirm_close:true};
  try{var rzp=new Razorpay(o);rzp.on('payment.failed',function(r){send({type:'failed',message:(r.error&&r.error.description)||'Payment failed'});});rzp.open();}
  catch(e){send({type:'failed',message:'Could not open payment page'});}
</script></body></html>`;
}

export default function Pay() {
  const { bookingId, planId } = useLocalSearchParams<{ bookingId?: string; planId?: string }>();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ s: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setPhase({ s: 'loading' });
    api
      .post<Order>('/customer/payments/order', bookingId ? { bookingId } : { recurringPlanId: planId })
      .then((order) => setPhase({ s: 'checkout', order }))
      .catch((e: ApiError) => setPhase({ s: 'error', message: e.message, code: e.code }));
  }, [bookingId, planId, attempt]);

  const html = useMemo(() => (phase.s === 'checkout' ? checkoutHtml(phase.order) : ''), [phase]);

  async function onMessage(e: WebViewMessageEvent) {
    let m: { type: string; data?: Record<string, string>; message?: string };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    // Late dismiss/failed events must not overwrite a payment that is already being verified or done
    if (m.type === 'dismiss') return setPhase((p) => (p.s === 'checkout' ? { s: 'cancelled' } : p));
    if (m.type === 'failed') return setPhase((p) => (p.s === 'checkout' ? { s: 'error', message: m.message || 'Payment failed' } : p));
    if (m.type === 'success' && m.data) {
      setPhase({ s: 'verifying' });
      try {
        const r = await api.post<{ status: string; pending?: boolean }>('/customer/payments/verify', m.data);
        ['home', 'bookings', 'plans', 'payments'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        setPhase({ s: 'done', pending: r.pending });
      } catch {
        // Webhook will still confirm it — never ask the customer to pay twice
        setPhase({ s: 'done', pending: true });
      }
    }
  }

  const exit = () => (bookingId ? router.replace(`/booking/${bookingId}`) : planId ? router.replace(`/plan/${planId}`) : router.replace('/home'));

  if (phase.s === 'checkout')
    return (
      <View style={{ flex: 1, backgroundColor: C.canvas }}>
        <WebView source={{ html, baseUrl: 'https://checkout.razorpay.com' }} onMessage={onMessage} javaScriptEnabled originWhitelist={['*']} startInLoadingState renderLoading={() => <Loading label="Opening secure payment…" />} />
      </View>
    );
  if (phase.s === 'loading' || phase.s === 'verifying') return <Loading label={phase.s === 'verifying' ? 'Confirming your payment…' : 'Preparing payment…'} />;

  return (
    <Screen footer={phase.s === 'done' ? <Button title={bookingId ? 'View visit' : 'View plan'} onPress={exit} /> : <View style={{ gap: S.sm }}><Button title="Try again" onPress={() => setAttempt((a) => a + 1)} /><Button title="Pay later" variant="secondary" onPress={exit} /></View>}>
      {phase.s === 'done' && (
        <View style={{ alignItems: 'center', paddingVertical: S.xxl }}>
          <Ionicons name="checkmark-circle" size={72} color={C.ok} />
          <T v="title" style={{ marginTop: S.md, textAlign: 'center' }}>{phase.pending ? 'Payment received' : 'Payment successful'}</T>
          <T style={{ textAlign: 'center', marginTop: S.sm }}>
            {phase.pending
              ? "We're confirming it with the bank. You'll get a notification in a minute, no need to pay again."
              : bookingId
                ? 'Our care team will check the details and assign a care assistant. We will keep you posted.'
                : 'Your plan is active. Visits are created two weeks ahead and each one is confirmed with you.'}
          </T>
        </View>
      )}
      {phase.s === 'cancelled' && <Notice tone="info" title="Payment not completed" body="Nothing was charged. The visit stays reserved for a short while; pay from Home to confirm it." />}
      {phase.s === 'error' && (
        <Notice
          tone={phase.code === 'PAYMENTS_NOT_CONFIGURED' ? 'warn' : 'danger'}
          title={phase.code === 'PAYMENTS_NOT_CONFIGURED' ? 'Online payment is not available yet' : 'Payment did not go through'}
          body={phase.code === 'PAYMENTS_NOT_CONFIGURED' ? 'Please call the care team to complete this booking.' : `${phase.message}. If money was deducted, it will be confirmed automatically or refunded.`}
        />
      )}
    </Screen>
  );
}
