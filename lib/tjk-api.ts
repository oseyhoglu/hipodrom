import { load, type CheerioAPI } from 'cheerio';

// --- TJK Şehir ID Mapping ---
export const TJK_CITIES: Record<string, { id: number; name: string }> = {
  ISTANBUL: { id: 17, name: 'İstanbul' },
  ANKARA: { id: 2, name: 'Ankara' },
  IZMIR: { id: 18, name: 'İzmir' },
  BURSA: { id: 6, name: 'Bursa' },
  ADANA: { id: 1, name: 'Adana' },
  ANTALYA: { id: 3, name: 'Antalya' },
  ELAZIG: { id: 10, name: 'Elazığ' },
  DBAKIR: { id: 8, name: 'Diyarbakır' },
  SANLIURFA: { id: 26, name: 'Şanlıurfa' },
  KOCAELI: { id: 20, name: 'Kocaeli' },
};

const TJK_BASE_URL = 'https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisProgrami';
const TJK_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  'Accept': 'text/html, */*; q=0.01',
};

// --- Types ---
export interface RaceInfo {
  raceNo: number;
  raceName: string;
  raceTime: string;       // "13:00"
  raceType: string;       // "HANDİKAP 1-55"
  hasAltili: boolean;
  altiliNo: number | null; // 1 or 2
  horses: HorseInfo[];
}

export interface HorseInfo {
  horseNo: number;
  horseName: string;
  jockeyName: string;
  age: string;
  weight: string;
  last6Races: string;
  ganyan: number | null;
  agf1: number | null;
  agf1Rank: number | null;
  agf2: number | null;
  agf2Rank: number | null;
}

export interface BulletinData {
  cityKey: string;
  cityName: string;
  cityId: number;
  raceDate: string;       // "2026-04-18"
  races: RaceInfo[];
}

// --- Fetch TJK page ---
export async function fetchTJKProgram(cityKey: string, date: Date): Promise<string> {
  const city = TJK_CITIES[cityKey];
  if (!city) throw new Error(`Unknown city: ${cityKey}`);

  const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

  const url = `${TJK_BASE_URL}?SehirId=${city.id}&QueryParameter_Tarih=${encodeURIComponent(dateStr)}&SehirAdi=${encodeURIComponent(city.name)}&Era=today`;

  const response = await fetch(url, { headers: TJK_HEADERS });
  if (!response.ok) throw new Error(`TJK fetch failed: ${response.status}`);

  return response.text();
}

// --- Parse AGF value from title attribute ---
// title format: "%21,58(1)" or "1. 6'LI GANYAN : %11,55(4)"
function parseAgfFromTitle(title: string): { value: number | null; rank: number | null } {
  if (!title) return { value: null, rank: null };

  // Extract the last percentage pattern
  const match = title.match(/%([0-9,]+)\((\d+)\)/);
  if (!match) return { value: null, rank: null };

  const value = parseFloat(match[1].replace(',', '.'));
  const rank = parseInt(match[2], 10);
  return { value, rank };
}

// --- Parse a single race panel ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRacePanel($: CheerioAPI, panelEl: any): RaceInfo | null {
  const panel = $(panelEl);

  // Get race details
  const detailsDiv = panel.find('.race-details');
  if (!detailsDiv.length) return null;

  const raceLink = detailsDiv.find('h3.race-no > a').first();
  const raceText = raceLink.text().trim();

  // Parse "1.                        Koşu:08.45" -> raceNo=1, time="08:45"
  const raceMatch = raceText.match(/(\d+)\.\s+Koşu[:\s]*(\d{2})[.](\d{2})/);
  if (!raceMatch) return null;

  const raceNo = parseInt(raceMatch[1], 10);
  const raceTime = `${raceMatch[2]}:${raceMatch[3]}`;
  const raceName = `${raceNo}. Koşu`;

  // Race type (HANDİKAP etc.)
  const raceTypeEl = detailsDiv.find('.ozelKosuAdi');
  const raceType = raceTypeEl.text().trim() || '';

  // Parse horses from table rows
  const horses: HorseInfo[] = [];
  const rows = panel.find('table.tablesorter tbody tr');

  let hasAltili = false;
  let altiliNo: number | null = null;

  rows.each((_, rowEl) => {
    const row = $(rowEl);

    // Horse number
    const horseNoText = row.find('.gunluk-GunlukYarisProgrami-SiraId').text().trim();
    const horseNo = parseInt(horseNoText, 10);
    if (isNaN(horseNo)) return;

    // Horse name (remove tooltip text)
    const horseNameTd = row.find('.gunluk-GunlukYarisProgrami-AtAdi');
    // Get only the first text node before any span/sup elements
    let horseName = '';
    horseNameTd.contents().each((_, node) => {
      if (node.type === 'text' && !horseName) {
        horseName = $(node).text().trim();
      }
    });
    if (!horseName) horseName = horseNameTd.text().split('\n')[0].trim();

    // Jockey name
    const jockeyName = row.find('.gunluk-GunlukYarisProgrami-JokeAdi a').attr('title') || 
                       row.find('.gunluk-GunlukYarisProgrami-JokeAdi a').text().trim() || '';

    // Age
    const age = row.find('.gunluk-GunlukYarisProgrami-Yas').text().trim();

    // Weight
    const weight = row.find('.gunluk-GunlukYarisProgrami-Kilo').text().trim();

    // Last 6 races
    const last6Races = row.find('.gunluk-GunlukYarisProgrami-Son6Yaris').text().trim();

    // Ganyan
    const ganyanText = row.find('.gunluk-GunlukYarisProgrami-Gny span').text().trim();
    const ganyan = ganyanText ? parseFloat(ganyanText.replace(',', '.')) : null;

    // AGF - can have 1 or 2 values
    const agfTd = row.find('.gunluk-GunlukYarisProgrami-AGFORAN');
    const agfLinks = agfTd.find('a');

    let agf1: number | null = null;
    let agf1Rank: number | null = null;
    let agf2: number | null = null;
    let agf2Rank: number | null = null;

    if (agfLinks.length >= 1) {
      const title1 = agfLinks.eq(0).attr('title') || '';

      // Check if this is a 6'LI GANYAN AGF (has "1. 6'LI" or "2. 6'LI" in title)
      if (title1.includes("6'L")) {
        // AGF for altili ganyan
        const altiliMatch1 = title1.match(/(\d+)\.\s*6'L/);
        if (altiliMatch1) {
          const agfNum = parseInt(altiliMatch1[1], 10);
          const parsed = parseAgfFromTitle(title1);
          if (agfNum === 1) {
            agf1 = parsed.value;
            agf1Rank = parsed.rank;
            hasAltili = true;
            if (!altiliNo) altiliNo = 1;
          } else if (agfNum === 2) {
            agf2 = parsed.value;
            agf2Rank = parsed.rank;
            hasAltili = true;
          }
        }

        if (agfLinks.length >= 2) {
          const title2 = agfLinks.eq(1).attr('title') || '';
          const altiliMatch2 = title2.match(/(\d+)\.\s*6'L/);
          if (altiliMatch2) {
            const agfNum2 = parseInt(altiliMatch2[1], 10);
            const parsed2 = parseAgfFromTitle(title2);
            if (agfNum2 === 1) {
              agf1 = parsed2.value;
              agf1Rank = parsed2.rank;
            } else if (agfNum2 === 2) {
              agf2 = parsed2.value;
              agf2Rank = parsed2.rank;
            }
          }
        }
      } else {
        // Regular AGF (only 1 value)
        const parsed = parseAgfFromTitle(title1);
        agf1 = parsed.value;
        agf1Rank = parsed.rank;
      }
    }

    horses.push({
      horseNo,
      horseName,
      jockeyName,
      age,
      weight,
      last6Races,
      ganyan,
      agf1,
      agf1Rank,
      agf2,
      agf2Rank,
    });
  });

  return {
    raceNo,
    raceName,
    raceTime,
    raceType,
    hasAltili,
    altiliNo,
    horses,
  };
}

// --- Parse full bulletin HTML ---
export function parseBulletinHTML(html: string, cityKey: string, raceDate: string): BulletinData {
  const $ = load(html);
  const city = TJK_CITIES[cityKey];
  const races: RaceInfo[] = [];

  // Each race is in a div with class "races-panes" > child divs
  const panels = $('div.races-panes > div');

  panels.each((_, panelEl) => {
    const race = parseRacePanel($, panelEl);
    if (race) {
      races.push(race);
    }
  });

  // Determine altili numbers based on race ordering
  // The first race with "6'LI GANYAN" data is altili 1, second is altili 2
  let altiliCounter = 0;
  for (const race of races) {
    if (race.hasAltili) {
      altiliCounter++;
      race.altiliNo = altiliCounter;
    }
  }

  return {
    cityKey,
    cityName: city?.name || cityKey,
    cityId: city?.id || 0,
    raceDate,
    races,
  };
}

// --- Fetch available cities for today ---
export async function fetchAvailableCities(date: Date): Promise<string[]> {
  // We try each known city and see if it returns data
  const available: string[] = [];

  const promises = Object.keys(TJK_CITIES).map(async (cityKey) => {
    try {
      const html = await fetchTJKProgram(cityKey, date);
      if (html && html.includes('tablesorter')) {
        return cityKey;
      }
    } catch {
      // City not available today
    }
    return null;
  });

  const results = await Promise.all(promises);
  for (const result of results) {
    if (result) available.push(result);
  }

  return available;
}
