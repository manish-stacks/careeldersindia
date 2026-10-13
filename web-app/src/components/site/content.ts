import { HeartHandshake, Stethoscope, Home, BedDouble, Cross } from 'lucide-react';

export const CATEGORIES = [
  { icon: HeartHandshake, title: 'Personal Care Assistance', body: 'Help with daily activities like bathing, dressing, mobility and hygiene.', img: '/images/personal-care.jpg' },
  { icon: Stethoscope, title: 'Nursing Care at Home', body: 'Skilled nurses for medical care, post-surgery support and chronic condition management.', img: '/images/nursing.jpg' },
  { icon: Home, title: 'Home Care Services', body: 'Companionship, meal support, medication reminders and light housekeeping.', img: '/images/home-care.jpg' },
  { icon: BedDouble, title: 'Senior Living & Care Homes', body: 'Safe, comfortable and well-equipped living spaces with 24/7 care.', img: '/images/senior-living.jpg' },
  { icon: Cross, title: 'Specialized Care', body: 'Dementia, Alzheimer\'s, palliative care and more.', img: '/images/specialized.jpg' },
];
export const FALLBACK_PHONE = '+91 98765 43210';
