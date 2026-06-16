// Curated IANA timezones for the profile picker. `value` is the IANA id stored
// on the user; `label` shows the id plus a familiar abbreviation/offset so it's
// recognisable (e.g. "America/New_York (ET)").

export interface TimezoneOption {
  value: string;
  label: string;
}

export const TIMEZONES: TimezoneOption[] = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },

  // Americas
  { value: "America/New_York", label: "America/New_York (Eastern · ET)" },
  { value: "America/Chicago", label: "America/Chicago (Central · CT)" },
  { value: "America/Denver", label: "America/Denver (Mountain · MT)" },
  { value: "America/Phoenix", label: "America/Phoenix (Mountain, no DST · MST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (Pacific · PT)" },
  { value: "America/Anchorage", label: "America/Anchorage (Alaska · AKT)" },
  { value: "Pacific/Honolulu", label: "Pacific/Honolulu (Hawaii · HST)" },
  { value: "America/Toronto", label: "America/Toronto (Eastern · ET)" },
  { value: "America/Vancouver", label: "America/Vancouver (Pacific · PT)" },
  { value: "America/Mexico_City", label: "America/Mexico_City (Central · CST)" },
  { value: "America/Bogota", label: "America/Bogota (Colombia · COT)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (Brazil · BRT)" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Buenos_Aires (ART)" },

  // Europe / Africa
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Dublin", label: "Europe/Dublin (GMT/IST)" },
  { value: "Europe/Lisbon", label: "Europe/Lisbon (WET)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (Central European · CET)" },
  { value: "Europe/Paris", label: "Europe/Paris (Central European · CET)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (Central European · CET)" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam (Central European · CET)" },
  { value: "Europe/Rome", label: "Europe/Rome (Central European · CET)" },
  { value: "Europe/Warsaw", label: "Europe/Warsaw (Central European · CET)" },
  { value: "Europe/Stockholm", label: "Europe/Stockholm (Central European · CET)" },
  { value: "Europe/Athens", label: "Europe/Athens (Eastern European · EET)" },
  { value: "Europe/Helsinki", label: "Europe/Helsinki (Eastern European · EET)" },
  { value: "Europe/Istanbul", label: "Europe/Istanbul (Türkiye · TRT)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (MSK)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (West Africa · WAT)" },
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (South Africa · SAST)" },
  { value: "Africa/Cairo", label: "Africa/Cairo (Eastern European · EET)" },

  // Middle East / Asia
  { value: "Asia/Jerusalem", label: "Asia/Jerusalem (Israel · IST)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (Gulf · GST)" },
  { value: "Asia/Karachi", label: "Asia/Karachi (Pakistan · PKT)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (India · IST)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (Bangladesh · BST)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok (Indochina · ICT)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong (HKT)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (China · CST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (Japan · JST)" },
  { value: "Asia/Seoul", label: "Asia/Seoul (Korea · KST)" },

  // Oceania
  { value: "Australia/Perth", label: "Australia/Perth (AWST)" },
  { value: "Australia/Adelaide", label: "Australia/Adelaide (ACST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (New Zealand · NZST)" },
];
