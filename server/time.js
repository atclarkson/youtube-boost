const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T12:00:00Z`);
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
      return new Date(value.replace(' ', 'T') + 'Z');
    }
  }

  return new Date(value);
}

function getPacificDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(toDate(value));

  return {
    year: parts.find((part) => part.type === 'year')?.value,
    month: parts.find((part) => part.type === 'month')?.value,
    day: parts.find((part) => part.type === 'day')?.value
  };
}

function getPacificDateString(value = new Date()) {
  const { year, month, day } = getPacificDateParts(value);
  return `${year}-${month}-${day}`;
}

module.exports = {
  PACIFIC_TIME_ZONE,
  getPacificDateString,
  toDate
};
