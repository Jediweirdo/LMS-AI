export interface ICSEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart: string; // YYYY-MM-DD (all-day)
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line: string): string {
  // RFC 5545 line folding at 75 octets.
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    const next = current + char;
    if (new TextEncoder().encode(next).length > 75) {
      parts.push(current);
      current = ` ${char}`;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts.join('\r\n');
}

function toICSDate(date: string): string {
  return date.replace(/-/g, '');
}

export function generateICS(events: ICSEvent[], calName = 'Deliverables'): string {
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LMS-AI//DeliverableCalendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeICSText(calName)}`),
    'X-WR-TIMEZONE:UTC',
  ];

  for (const event of events) {
    const [year, month, day] = event.dtstart.split('-').map(Number);
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const dtend =
      String(nextDay.getUTCFullYear()) +
      String(nextDay.getUTCMonth() + 1).padStart(2, '0') +
      String(nextDay.getUTCDate()).padStart(2, '0');

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${escapeICSText(event.uid)}`));
    lines.push(`DTSTAMP:${now}Z`);
    lines.push(`DTSTART;VALUE=DATE:${toICSDate(event.dtstart)}`);
    lines.push(`DTEND;VALUE=DATE:${dtend}`);
    lines.push(foldLine(`SUMMARY:${escapeICSText(event.summary)}`));
    if (event.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeICSText(event.description)}`));
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
