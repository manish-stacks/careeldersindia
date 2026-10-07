export type Role = 'ADMIN' | 'CUSTOMER' | 'ASSISTANT';
export type User = { _id: string; name: string; email: string; mobile?: string; role: Role; country?: string; timezone?: string; status?: string; createdAt?: string; lastLoginAt?: string; permissions?: string[]; isSuper?: boolean };
export type BookingStatus =
  | 'DRAFT' | 'PENDING_PAYMENT' | 'PAYMENT_SUCCESS' | 'PENDING_ADMIN_VERIFICATION' | 'VERIFIED' | 'ASSISTANT_ASSIGNED' | 'ASSISTANT_ACCEPTED'
  | 'ON_THE_WAY' | 'REACHED' | 'VISIT_STARTED' | 'VISIT_COMPLETED' | 'REPORT_GENERATED' | 'COMPLETED' | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_ADMIN' | 'ASSISTANT_REJECTED' | 'NO_SHOW' | 'RESCHEDULED';
export type OverallStatus = 'STABLE' | 'NEEDS_ATTENTION' | 'URGENT_ATTENTION';

export type Address = { line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string };
export type Ref<T> = T & { _id: string };

export type Booking = {
  _id: string;
  bookingNumber: string;
  status: BookingStatus;
  scheduledAt: string;
  endsAt: string;
  scheduledLocal?: { date: string; time: string };
  durationMinutes: number;
  customerId: Ref<{ name: string; email: string; mobile?: string; country?: string; timezone?: string }> | string;
  assistantId?: Ref<{ name: string; mobile?: string; email?: string }> | null;
  parentId: string;
  serviceId: string;
  recurringPlanId?: string;
  occurrenceIndex?: number;
  paymentStatus: string;
  paymentId?: string;
  price: { amount: number; discount?: number; currency: string };
  addressSnapshot: Address;
  locationSnapshot?: { lat: number; lng: number };
  parentSnapshot: {
    fullName: string; gender?: string; dateOfBirth?: string; bloodGroup?: string; mobile?: string; medicalConditions?: string[];
    medicines?: { name: string; dosage?: string; schedule?: Record<string, boolean> }[]; allergies?: string[];
    emergencyContacts?: { name: string; relation?: string; mobile: string }[]; specialInstructions?: string;
  };
  serviceSnapshot: { name: string; durationMinutes: number; fields?: { vitals?: { key: string; required?: boolean }[]; minPhotos?: number } };
  customerNotes?: string;
  adminNotes?: string;
  statusHistory?: { from: string; to: string; at: string; actorId?: { _id: string; name: string } | null; actorRole?: string; note?: string }[];
  assignment?: {
    assignedAt?: string; acceptedAt?: string; override?: boolean; overrideReason?: string;
    history?: { assistantId?: { _id: string; name: string } | null; assignedBy?: { _id: string; name: string } | null; assignedAt?: string; outcome: string; reason?: string }[];
  };
  travel?: { startedAt?: string; reachedAt?: string };
  cancellation?: { role?: string; reason?: string; at?: string };
  reschedules?: { fromAt: string; toAt: string; reason?: string; at: string }[];
  reportId?: string;
  visitId?: string;
  completedAt?: string;
  createdAt: string;
};

export type Measurements = {
  bp?: { systolic: number; diastolic: number };
  pulse?: number;
  spo2?: number;
  temperature?: { value: number; unit: 'F' | 'C' };
  weight?: { value: number; unit: string };
  bloodSugar?: { value: number; unit: string; context?: string };
};

export type Visit = {
  _id: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  startedAt: string;
  completedAt?: string;
  measurements?: Measurements;
  symptoms?: string[];
  symptomNotes?: string;
  reports?: { templateId: string; name: string; kind: 'CHECKLIST' | 'TABLE'; reportDate?: string; checked?: string[]; values?: { key: string; label: string; value: string }[] }[];
  medicationStatus?: { medicineName: string; slot: string; status: string; reportedBy?: string }[];
  mobility?: string;
  wellbeing?: Record<string, string>;
  notes?: string;
  overallStatus?: OverallStatus;
  urgent?: { reason?: string; notes?: string; recommendedEscalation?: string };
  followUpRequired?: boolean;
  followUpNotes?: string;
  version: number;
  draftSavedAt?: string;
  media?: { _id: string; type: string; mime: string; caption?: string; url: string }[];
  corrections?: { _id: string; field: string; oldValue: unknown; newValue: unknown; reason: string; status: string; requestedAt: string }[];
};

export type Eligible = {
  assistantId: string; name: string; mobile?: string; languages?: string[]; experienceYears?: number; rating?: { avg: number; count: number };
  isOnline?: boolean; jobsThatDay: number; distanceMeters: number | null; eligible: boolean; overridable: boolean; reasons: string[]; clashWith?: string; isCurrent: boolean;
};

export type Payment = {
  _id: string; receiptNumber: string; purpose: 'BOOKING' | 'RECURRING_PLAN'; amount: number; refundedAmount: number; status: string; method?: string;
  capturedAt?: string; createdAt: string; failureReason?: string; reference?: string; note?: string; manual?: boolean; razorpay?: { orderId?: string; paymentId?: string };
  customerId?: { _id: string; name: string; email: string } | string; bookingId?: { _id: string; bookingNumber: string } | null; recurringPlanId?: { _id: string; planNumber: string } | null;
  refunds?: { _id: string; amount: number; reason?: string; status: string; createdAt: string; razorpayRefundId?: string }[];
  transactions?: { _id: string; type?: string; event?: string; status?: string; createdAt: string; source?: string }[];
};

export type LiveLocation = { assistantId: string; bookingId: string; latitude: number; longitude: number; accuracy?: number; heading?: number; speed?: number; timestamp: string };
