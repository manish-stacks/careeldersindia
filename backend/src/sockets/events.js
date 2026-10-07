const SOCKET_EVENTS = Object.freeze({
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_VERIFIED: 'BOOKING_VERIFIED',
  ASSISTANT_ASSIGNED: 'ASSISTANT_ASSIGNED',
  JOB_ASSIGNED: 'JOB_ASSIGNED',
  JOB_ACCEPTED: 'JOB_ACCEPTED',
  JOB_REJECTED: 'JOB_REJECTED',
  JOB_CANCELLED: 'JOB_CANCELLED',
  ON_THE_WAY: 'ON_THE_WAY',
  LOCATION_UPDATED: 'LOCATION_UPDATED',
  ASSISTANT_REACHED: 'ASSISTANT_REACHED',
  VISIT_STARTED: 'VISIT_STARTED',
  HEALTH_DATA_UPDATED: 'HEALTH_DATA_UPDATED',
  VISIT_COMPLETED: 'VISIT_COMPLETED',
  REPORT_GENERATED: 'REPORT_GENERATED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  BOOKING_STATUS_CHANGED: 'BOOKING_STATUS_CHANGED',
  PAYMENT_UPDATED: 'PAYMENT_UPDATED',
  EMERGENCY_ALERT: 'EMERGENCY_ALERT',
  NOTIFICATION: 'NOTIFICATION',
  ASSISTANT_PRESENCE: 'ASSISTANT_PRESENCE',
});

// Client → server
const CLIENT_EVENTS = Object.freeze({
  BOOKING_SUBSCRIBE: 'booking:subscribe',
  BOOKING_UNSUBSCRIBE: 'booking:unsubscribe',
  LOCATION_UPDATE: 'location:update',
});

// assistant room keyed by assistant's User id (booking.assistantId is a User ref)
const rooms = {
  customer: (userId) => `customer:${userId}`,
  assistant: (assistantUserId) => `assistant:${assistantUserId}`,
  booking: (bookingId) => `booking:${bookingId}`,
  admin: () => 'admin',
  user: (userId) => `user:${userId}`, // every socket joins its own user room (notifications)
};

module.exports = { SOCKET_EVENTS, CLIENT_EVENTS, rooms };
