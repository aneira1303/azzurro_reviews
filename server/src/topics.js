// Keyword/regex topic classifier. Transparent and fast; see README for limitations.
export const TOPICS = {
  cleanliness: { label: 'Cleanliness', re: /\b(clean\w*|dirt\w*|dust\w*|stain\w*|smell\w*|musty|mou?ld\w*|hair|bugs?|cockroach\w*|bed ?bugs?|filth\w*|hygien\w*|sticky)\b/i },
  checkin: { label: 'Check-in experience', re: /\b(check[- ]?in|check[- ]?out|key ?cards?|late arrival|early arrival|luggage|waited|waiting|queue|front desk)\b/i },
  staff: { label: 'Staff behaviour', re: /\b(staff|receptionists?|reception|manager|rude|friendly|helpful|unhelpful|service|concierge|host)\b/i },
  noise: { label: 'Noise', re: /\b(nois\w*|loud\w*|thin walls?|quiet|music|traffic|party|construction)\b/i },
  facilities: { label: 'Facilities', re: /\b(wi-?fi|internet|lifts?|elevators?|pool|gym|kitchen\w*|laundry|parking|breakfast|lounge|facilit\w*|tv)\b/i },
  location: { label: 'Location', re: /\b(location|located|walking distance|walk\w*|station|train|bus|nearby|close to|central|distance)\b/i },
  room: { label: 'Room condition', re: /\b(beds?|bathrooms?|showers?|mattress\w*|pillows?|towels?|tiny|small|cramped|dated|old|tired|renovat\w*|air[- ]?con\w*|heating|windows?)\b/i },
  value: { label: 'Value for money', re: /\b(value|price\w*|expensive|cheap\w*|worth|overpriced|money|cost\w*|affordable)\b/i },
};
export const tag = text => (text ? Object.entries(TOPICS).filter(([, v]) => v.re.test(text)).map(([k]) => k) : []);
