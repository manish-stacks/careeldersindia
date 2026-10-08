export type Role = 'ADMIN' | 'CUSTOMER' | 'ASSISTANT';
export type User = { _id: string; name: string; email: string; mobile?: string; role: Role; country?: string; timezone?: string; status?: string };

export type BookingStatus =
  | 'DRAFT' | 'PENDING_PAYMENT' | 'PAYMENT_SUCCESS' | 'PENDING_ADMIN_VERIFICATION' | 'VERIFIED' | 'ASSISTANT_ASSIGNED' | 'ASSISTANT_ACCEPTED'
  | 'ON_THE_WAY' | 'REACHED' | 'VISIT_STARTED' | 'VISIT_COMPLETED' | 'REPORT_GENERATED' | 'COMPLETED' | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_ADMIN' | 'ASSISTANT_REJECTED' | 'NO_SHOW' | 'RESCHEDULED';
export type OverallStatus = 'STABLE' | 'NEEDS_ATTENTION' | 'URGENT_ATTENTION';

export type Address = { line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string };
export type Medicine = { name: string; dosage?: string; schedule?: { morning?: boolean; afternoon?: boolean; evening?: boolean; night?: boolean }; notes?: string };
export type Contact = { name: string; relation?: string; mobile: string };

export type VitalKey = 'bp' | 'pulse' | 'spo2' | 'temperature' | 'weight' | 'bloodSugar';
export type ServiceFields = { vitals: { key: VitalKey; required: boolean }[]; collectSymptoms?: boolean; collectMedication?: boolean; collectMobility?: boolean; collectWellbeing?: boolean; minPhotos?: number };
export type Service = { _id: string; name: string; slug: string; description?: string; basePrice: number; durationMinutes: number; recurringDiscountPercent: number; fields: ServiceFields; sheetKind?: 'NONE' | 'CHECKLIST' | 'TABLE'; items?: { key: string; label: string }[] };

export type Parent = {
  photoUrl?: string;
  _id: string; fullName: string; gender: 'MALE' | 'FEMALE' | 'OTHER'; dateOfBirth: string; age?: number; relationToOwner?: string; mobile?: string;
  address: Address; location?: { coordinates: [number, number] }; bloodGroup?: string; medicalConditions: string[]; medicines: Medicine[]; allergies: string[];
  emergencyContacts: Contact[]; specialInstructions?: string; lastVisitAt?: string; lastOverallStatus?: OverallStatus;
  access?: { isOwner?: boolean; permissions?: string[]; relation?: string; admin?: boolean };
  nextVisit?: { bookingId: string; scheduledAt: string; status: BookingStatus } | null;
  family?: { _id: string; userId?: { _id: string; name: string; email: string } | null; invitedEmail?: string; relation?: string; permissions: string[]; isOwner: boolean; status: string }[];
};

/** Booking as the customer sees it */
export type Booking = {
  _id: string; bookingNumber: string; status: BookingStatus; scheduledAt: string; endsAt: string; scheduledLocal: { date: string; time: string }; durationMinutes: number;
  parentId: string; serviceId: string; recurringPlanId?: string; paymentStatus: string; price: { amount: number; discount?: number; currency: string };
  addressSnapshot: Address; locationSnapshot?: { lat: number; lng: number }; parentSnapshot: { fullName: string; mobile?: string; gender?: string; bloodGroup?: string }; assistant?: { id: string; name: string; mobile?: string } | null; serviceSnapshot: { name: string; durationMinutes: number };
  assistant?: { id: string; name?: string } | null; customerNotes?: string; reportId?: string; visitId?: string;
  statusHistory?: { from: string | null; to: BookingStatus; at: string; note?: string }[];
  cancellation?: { role?: string; reason?: string; at?: string }; travel?: { startedAt?: string; reachedAt?: string }; createdAt: string;
};

/** Booking as the assistant sees it */
export type Job = {
  reportId?: string;
  customer?: { name: string; mobile?: string; email?: string };
  _id: string; bookingNumber: string; status: BookingStatus; scheduledAt: string; scheduledLocal: { date: string; time: string }; durationMinutes: number;
  service: { name: string; durationMinutes: number; fields?: ServiceFields }; address: Address; location?: { lat: number; lng: number };
  patient: { name: string; gender?: string; age?: number; bloodGroup?: string; medicalConditions?: string[]; allergies?: string[]; medicines?: Medicine[]; specialInstructions?: string; mobile?: string; emergencyContacts?: Contact[] };
  customerNotes?: string; visitId?: string; travel?: { startedAt?: string; reachedAt?: string }; assignment?: { assignedAt?: string; acceptedAt?: string };
};

export type Measurements = {
  bp?: { systolic: number; diastolic: number };
  pulse?: number;
  spo2?: number;
  temperature?: { value: number; unit: 'F' | 'C' };
  weight?: { value: number; unit?: 'KG' };
  bloodSugar?: { value: number; unit?: 'mg/dL'; context: 'FASTING' | 'RANDOM' | 'POST_MEAL' };
};
export type MedSlot = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';
export type MedStatus = { medicineName: string; slot: MedSlot; status: 'TAKEN' | 'MISSED' | 'NOT_DUE' | 'UNKNOWN'; reportedBy?: 'PATIENT' | 'ASSISTANT' | 'FAMILY' | 'CAREGIVER' };
export type Media = { _id: string; type: string; mime: string; caption?: string; url: string };

export type Visit = {
  _id: string; status: 'IN_PROGRESS' | 'COMPLETED'; startedAt: string; completedAt?: string; version: number; draftSavedAt?: string;
  measurements?: Measurements; symptoms?: string[]; symptomNotes?: string; medicationStatus?: MedStatus[];
  mobility?: 'INDEPENDENT' | 'NEEDS_SUPPORT' | 'ASSISTED_DEVICE' | 'BEDRIDDEN';
  wellbeing?: { appetite?: string; sleep?: string; mood?: string; hydration?: string };
  notes?: string; overallStatus?: OverallStatus; urgent?: { reason: string; notes: string; recommendedEscalation: string };
  followUpRequired?: boolean; followUpNotes?: string; media?: Media[];
  reportMode?: 'FORM' | 'IMAGE'; servicesPerformed?: string[];
  reports?: { templateId: string; name: string; kind: 'CHECKLIST' | 'TABLE'; reportDate?: string; checked?: string[]; values?: { key: string; label: string; value: string }[] }[];
  labReport?: { reportDate?: string; values: { key: string; label: string; value: string }[] };
  form?: { fields: ServiceFields; symptomsList: string[]; medicines: Medicine[]; parentName: string; reportTemplates?: ReportTemplate[] };
};

export type ReportRow = { _id: string; reportNumber: string; visitDate: string; overallStatus: OverallStatus; serviceName: string; version?: number; followUpRequired?: boolean; parentId?: string; data?: { patient?: { name: string } } };
export type Report = {
  _id: string; reportNumber: string; version: number; bookingId: string; visitDate: string; serviceName: string; overallStatus: OverallStatus;
  data: Omit<Visit, '_id' | 'status' | 'startedAt' | 'version' | 'media' | 'form'> & {
    patient: { name: string; age?: number; gender?: string; city?: string };
    visit: { bookingNumber: string; startedAt: string; completedAt: string };
    assistant?: { name: string }; disclaimer: string; followUp?: { required: boolean; notes?: string };
  };
  media?: Media[];
  versions?: { _id: string; version: number; reportNumber: string; createdAt: string }[];
};

export type Plan = {
  _id: string; planNumber: string; frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM'; intervalDays?: number; startDate: string; endDate?: string; timeOfDay: string;
  totalVisits: number; generatedCount: number; pricePerVisit: number; totalAmount: number; status: string; nextOccurrenceAt?: string;
  serviceId?: { _id: string; name: string } | string; parentId?: { _id: string; fullName: string } | string;
};

export type Payment = { _id: string; receiptNumber: string; purpose: 'BOOKING' | 'RECURRING_PLAN'; amount: number; refundedAmount: number; status: string; method?: string; capturedAt?: string; createdAt: string };
export type Notice = { _id: string; type: string; title: string; body: string; data?: Record<string, string>; readAt?: string | null; createdAt: string };
export type LiveLocation = { bookingId: string; latitude: number; longitude: number; accuracy?: number; speed?: number; heading?: number; timestamp: string };

export type AssistantProfile = {
  _id: string; verificationStatus: 'PENDING' | 'DOCUMENT_REVIEW' | 'APPROVED' | 'REJECTED'; gender?: string; dateOfBirth?: string; qualification?: string; experienceYears: number;
  languages: string[]; address?: Partial<Address>; serviceAreas: { city: string; pincodes: string[] }[]; workingHours: { day: number; start: string; end: string }[];
  isAvailable: boolean; isOnline: boolean; rating?: { avg: number; count: number }; stats?: { completedVisits: number };
  bank?: { accountHolder?: string; accountLast4?: string; ifsc?: string; upiId?: string }; pan?: { last4?: string };
  verificationHistory?: { to: string; notes?: string; at: string }[];
};
export type AssistantDoc = { _id: string; type: string; status: string; numberLast4?: string; reviewNotes?: string; createdAt: string };

export type ReportTemplate = { _id: string; name: string; kind: 'CHECKLIST' | 'TABLE'; items: { key: string; label: string }[] };
