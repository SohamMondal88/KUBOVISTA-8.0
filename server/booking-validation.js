import { indiaDate } from '../destination-meta.js';

export function validateDepartureDate(value, today = indiaDate()) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Choose a valid departure date or leave it blank for flexible dates.');
  }
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value || value < today) {
    throw new Error('Choose a valid departure date that is today or later.');
  }
  return value;
}
