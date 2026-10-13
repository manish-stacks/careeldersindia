/** India PIN code → city (district) and state, via the public India Post API. Returns null when unknown/offline. */
export async function lookupPincode(pin: string): Promise<{ city: string; state: string } | null> {
  if (!/^[1-9][0-9]{5}$/.test(pin)) return null;
  try {
    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const o = (await r.json())?.[0]?.PostOffice?.[0];
    return o ? { city: o.District || o.Block || o.Name, state: o.State } : null;
  } catch {
    return null;
  }
}
