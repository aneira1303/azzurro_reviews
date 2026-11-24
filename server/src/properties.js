const u = s => `https://www.booking.com/hotel/au/${s}.html`;
export const PROPERTIES = [
  { slug: 'olympic-paddington', cc: 'au', label: 'Olympic Hotel Paddington', url: u('olympic-paddington') },
  { slug: 'venus-potts-point-sydney', cc: 'au', label: 'Potts Point', url: u('venus-potts-point-sydney') },
  { slug: 'venus-surry-hills', cc: 'au', label: 'Central Sydney', url: u('venus-surry-hills') },
  { slug: 'chateau-de-venus', cc: 'au', label: 'Darling Harbour', url: u('chateau-de-venus') },
];
