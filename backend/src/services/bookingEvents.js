/** Fan-out helper: after a booking changes, push realtime updates to every interested room. */
const { emitTo } = require('../sockets/emitter');
const { rooms, SOCKET_EVENTS } = require('../sockets/events');

function broadcastBooking(booking, event, extra = {}) {
  const id = String(booking._id);
  const payload = { bookingId: id, bookingNumber: booking.bookingNumber, status: booking.status, scheduledAt: booking.scheduledAt, ...extra };
  const targets = [rooms.booking(id), rooms.customer(String(booking.customerId)), rooms.admin()];
  if (booking.assistantId) targets.push(rooms.assistant(String(booking.assistantId._id || booking.assistantId)));
  emitTo(targets, event, payload);
  if (event !== SOCKET_EVENTS.BOOKING_STATUS_CHANGED) emitTo(targets, SOCKET_EVENTS.BOOKING_STATUS_CHANGED, payload);
}

module.exports = { broadcastBooking };
