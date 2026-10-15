// Trinity Airways network (from https://en.wikipedia.org/wiki/Trinity_Airways, Oct 2026).
// Bases: Seoul Incheon (ICN) and Seoul Gimpo (GMP).
//
// Block times are typical scheduled estimates, not published timetables; they
// are only defaults and every one of them is editable on the page.

export interface NetworkAirport {
  code: string;
  city: string;
  tz: string;
  toBedMin?: number;
  fromBedMin?: number;
}

export const TRINITY_AIRPORTS: NetworkAirport[] = [
  // Bases (home): long commute from Incheon, report ~1h40 before departure.
  { code: 'ICN', city: 'Seoul Incheon', tz: 'Asia/Seoul', toBedMin: 120, fromBedMin: 210 },
  { code: 'GMP', city: 'Seoul Gimpo', tz: 'Asia/Seoul', toBedMin: 90, fromBedMin: 160 },
  // South Korea
  { code: 'PUS', city: 'Busan Gimhae', tz: 'Asia/Seoul' },
  { code: 'CJJ', city: 'Cheongju', tz: 'Asia/Seoul' },
  { code: 'TAE', city: 'Daegu', tz: 'Asia/Seoul' },
  { code: 'KWJ', city: 'Gwangju', tz: 'Asia/Seoul' },
  { code: 'CJU', city: 'Jeju', tz: 'Asia/Seoul' },
  // Japan
  { code: 'NRT', city: 'Tokyo Narita', tz: 'Asia/Tokyo', toBedMin: 120, fromBedMin: 180 },
  { code: 'KIX', city: 'Osaka Kansai', tz: 'Asia/Tokyo', toBedMin: 105 },
  { code: 'UKB', city: 'Kobe', tz: 'Asia/Tokyo' },
  { code: 'NGO', city: 'Nagoya Chubu', tz: 'Asia/Tokyo' },
  { code: 'FUK', city: 'Fukuoka', tz: 'Asia/Tokyo' },
  { code: 'KOJ', city: 'Kagoshima', tz: 'Asia/Tokyo' },
  { code: 'KMJ', city: 'Kumamoto', tz: 'Asia/Tokyo' },
  { code: 'OIT', city: 'Ōita', tz: 'Asia/Tokyo' },
  { code: 'HSG', city: 'Saga', tz: 'Asia/Tokyo' },
  { code: 'CTS', city: 'Sapporo New Chitose', tz: 'Asia/Tokyo' },
  { code: 'OKA', city: 'Naha', tz: 'Asia/Tokyo' },
  // China, Hong Kong, Macau, Taiwan
  { code: 'HAK', city: 'Haikou', tz: 'Asia/Shanghai' },
  { code: 'TAO', city: 'Qingdao Jiaodong', tz: 'Asia/Shanghai' },
  { code: 'SYX', city: 'Sanya', tz: 'Asia/Shanghai' },
  { code: 'SHE', city: 'Shenyang', tz: 'Asia/Shanghai' },
  { code: 'WNZ', city: 'Wenzhou', tz: 'Asia/Shanghai' },
  { code: 'WUH', city: 'Wuhan', tz: 'Asia/Shanghai' },
  { code: 'DYG', city: 'Zhangjiajie', tz: 'Asia/Shanghai' },
  { code: 'HKG', city: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { code: 'MFM', city: 'Macau', tz: 'Asia/Macau' },
  { code: 'TPE', city: 'Taipei Taoyuan', tz: 'Asia/Taipei' },
  { code: 'TSA', city: 'Taipei Songshan', tz: 'Asia/Taipei' },
  { code: 'KHH', city: 'Kaohsiung', tz: 'Asia/Taipei' },
  { code: 'RMQ', city: 'Taichung', tz: 'Asia/Taipei' },
  // Southeast Asia
  { code: 'BKK', city: 'Bangkok Suvarnabhumi', tz: 'Asia/Bangkok', toBedMin: 120 },
  { code: 'CNX', city: 'Chiang Mai', tz: 'Asia/Bangkok' },
  { code: 'SIN', city: 'Singapore Changi', tz: 'Asia/Singapore' },
  { code: 'DPS', city: 'Denpasar Bali', tz: 'Asia/Makassar' },
  { code: 'CGK', city: 'Jakarta Soekarno–Hatta', tz: 'Asia/Jakarta', toBedMin: 120, fromBedMin: 180 },
  { code: 'BKI', city: 'Kota Kinabalu', tz: 'Asia/Kuching' },
  { code: 'CEB', city: 'Cebu Mactan', tz: 'Asia/Manila' },
  { code: 'KLO', city: 'Kalibo', tz: 'Asia/Manila' },
  { code: 'VTE', city: 'Vientiane', tz: 'Asia/Vientiane' },
  { code: 'DAD', city: 'Da Nang', tz: 'Asia/Ho_Chi_Minh' },
  { code: 'HAN', city: 'Hanoi Noi Bai', tz: 'Asia/Ho_Chi_Minh' },
  { code: 'SGN', city: 'Ho Chi Minh City', tz: 'Asia/Ho_Chi_Minh' },
  { code: 'CXR', city: 'Nha Trang Cam Ranh', tz: 'Asia/Ho_Chi_Minh' },
  // Central Asia, Mongolia
  { code: 'FRU', city: 'Bishkek Manas', tz: 'Asia/Bishkek' },
  { code: 'TAS', city: 'Tashkent', tz: 'Asia/Tashkent' },
  { code: 'UBN', city: 'Ulaanbaatar', tz: 'Asia/Ulaanbaatar' },
  // Pacific, Oceania, Americas
  { code: 'GUM', city: 'Guam', tz: 'Pacific/Guam' },
  { code: 'SPN', city: 'Saipan', tz: 'Pacific/Saipan' },
  { code: 'SYD', city: 'Sydney', tz: 'Australia/Sydney' },
  { code: 'YVR', city: 'Vancouver', tz: 'America/Vancouver' },
  // Europe
  { code: 'CDG', city: 'Paris Charles de Gaulle', tz: 'Europe/Paris', toBedMin: 105 },
  { code: 'FRA', city: 'Frankfurt', tz: 'Europe/Berlin' },
  { code: 'FCO', city: 'Rome Fiumicino', tz: 'Europe/Rome' },
  { code: 'BCN', city: 'Barcelona', tz: 'Europe/Madrid' },
  { code: 'ZAG', city: 'Zagreb', tz: 'Europe/Zagreb' },
];

// [from, to, outbound block (min), return block (min)]
const h = (hh: number, mm = 0) => hh * 60 + mm;
const ROUTES: [string, string, number, number][] = [
  // Domestic
  ['GMP', 'CJU', h(1, 10), h(1, 5)],
  ['GMP', 'PUS', h(1, 5), h(1, 0)],
  ['PUS', 'CJU', h(1, 0), h(0, 55)],
  ['CJJ', 'CJU', h(1, 0), h(0, 55)],
  ['TAE', 'CJU', h(1, 0), h(0, 55)],
  ['KWJ', 'CJU', h(0, 50), h(0, 50)],
  // Japan
  ['ICN', 'NRT', h(2, 25), h(2, 45)],
  ['ICN', 'KIX', h(1, 50), h(2, 5)],
  ['ICN', 'UKB', h(1, 50), h(2, 5)],
  ['ICN', 'NGO', h(2, 0), h(2, 15)],
  ['ICN', 'FUK', h(1, 20), h(1, 30)],
  ['ICN', 'KOJ', h(1, 35), h(1, 45)],
  ['ICN', 'KMJ', h(1, 30), h(1, 40)],
  ['ICN', 'OIT', h(1, 30), h(1, 40)],
  ['ICN', 'HSG', h(1, 25), h(1, 35)],
  ['ICN', 'CTS', h(2, 50), h(3, 10)],
  ['ICN', 'OKA', h(2, 15), h(2, 30)],
  // China, Hong Kong, Macau, Taiwan
  ['ICN', 'HAK', h(4, 10), h(3, 45)],
  ['ICN', 'TAO', h(1, 45), h(1, 35)],
  ['ICN', 'SYX', h(4, 40), h(4, 10)],
  ['ICN', 'SHE', h(1, 50), h(1, 40)],
  ['ICN', 'WNZ', h(2, 15), h(2, 0)],
  ['ICN', 'WUH', h(2, 50), h(2, 30)],
  ['ICN', 'DYG', h(3, 15), h(2, 50)],
  ['ICN', 'HKG', h(3, 50), h(3, 30)],
  ['ICN', 'MFM', h(3, 50), h(3, 30)],
  ['ICN', 'TPE', h(2, 40), h(2, 25)],
  ['GMP', 'TSA', h(2, 30), h(2, 20)],
  ['ICN', 'KHH', h(3, 10), h(2, 50)],
  ['ICN', 'RMQ', h(2, 50), h(2, 35)],
  // Southeast Asia
  ['ICN', 'BKK', h(5, 50), h(5, 25)],
  ['ICN', 'CNX', h(5, 45), h(5, 15)],
  ['ICN', 'SIN', h(6, 30), h(6, 15)],
  ['ICN', 'DPS', h(7, 5), h(6, 50)],
  ['ICN', 'CGK', h(7, 10), h(6, 50)],
  ['ICN', 'BKI', h(5, 25), h(5, 10)],
  ['ICN', 'CEB', h(4, 40), h(4, 20)],
  ['ICN', 'KLO', h(4, 50), h(4, 30)],
  ['ICN', 'VTE', h(5, 20), h(4, 55)],
  ['ICN', 'DAD', h(4, 40), h(4, 20)],
  ['ICN', 'HAN', h(4, 40), h(4, 15)],
  ['ICN', 'SGN', h(5, 20), h(5, 0)],
  ['ICN', 'CXR', h(5, 10), h(4, 50)],
  // Central Asia, Mongolia
  ['ICN', 'FRU', h(6, 30), h(5, 50)],
  ['ICN', 'TAS', h(7, 20), h(6, 30)],
  ['ICN', 'UBN', h(3, 30), h(3, 10)],
  // Pacific, Oceania, Americas
  ['ICN', 'GUM', h(4, 20), h(4, 40)],
  ['ICN', 'SPN', h(4, 20), h(4, 40)],
  ['ICN', 'SYD', h(10, 20), h(10, 40)],
  ['ICN', 'YVR', h(9, 50), h(11, 20)],
  // Europe (routed around Russian airspace)
  ['ICN', 'CDG', h(14, 10), h(13, 0)],
  ['ICN', 'FRA', h(14, 0), h(12, 50)],
  ['ICN', 'FCO', h(13, 50), h(12, 40)],
  ['ICN', 'BCN', h(14, 40), h(13, 20)],
  ['ICN', 'ZAG', h(13, 30), h(12, 20)],
];

export interface NetworkRoute { from: string; to: string; blockMin: number }

export const TRINITY_ROUTES: NetworkRoute[] = ROUTES.flatMap(([from, to, out, back]) => [
  { from, to, blockMin: out },
  { from: to, to: from, blockMin: back },
]);
