import { load, type CheerioAPI } from 'cheerio';

// --- TJK Şehir ID Mapping (sabit ID'ler — dinamik fetch için fetchTodayCityList kullanılır) ---
export const TJK_CITIES: Record<string, { id: number; name: string }> = {
  ISTANBUL: { id: 3, name: 'İstanbul' },
  ANKARA:   { id: 5, name: 'Ankara' },
  IZMIR:    { id: 2, name: 'İzmir' },
  BURSA:    { id: 4, name: 'Bursa' },
  ADANA:    { id: 1, name: 'Adana' },
  ANTALYA:  { id: 10, name: 'Antalya' },
  ELAZIG:   { id: 7, name: 'Elazığ' },
  DBAKIR:   { id: 8, name: 'Diyarbakır' },
  SANLIURFA:{ id: 6, name: 'Şanlıurfa' },
  KOCAELI:  { id: 9, name: 'Kocaeli' },
};

// TJK şehir adı → iç key eşleşmesi (normalize edilmiş)
const CITY_NAME_TO_KEY: Record<string, string> = {
  'ankara': 'ANKARA',
  'istanbul': 'ISTANBUL',
  'izmir': 'IZMIR',
  'bursa': 'BURSA',
  'adana': 'ADANA',
  'antalya': 'ANTALYA',
  'elazig': 'ELAZIG',
  'diyarbakir': 'DBAKIR',
  'sanliurfa': 'SANLIURFA',
  'kocaeli': 'KOCAELI',
};

function normalizeTurkish(s: string): string {
  return s.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .trim();
}

// Bugünkü TJK şehir listesini canlı olarak çek (ID'ler günden güne değişebilir)
export async function fetchTodayCityList(): Promise<Array<{ cityKey: string; cityId: number; cityName: string }>> {
  const mainUrl = 'https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami';
  try {
    const response = await fetch(mainUrl, { headers: TJK_HEADERS });
    const html = await response.text();
    const { load } = await import('cheerio');
    const $ = load(html);

    const cities: Array<{ cityKey: string; cityId: number; cityName: string }> = [];
    const seen = new Set<string>();

    $('a[href*="GunlukYarisProgrami"][href*="SehirId"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const idMatch = href.match(/SehirId=(\d+)/);
      const nameMatch = href.match(/SehirAdi=([^&"]+)/);
      if (!idMatch || !nameMatch) return;

      const cityId = parseInt(idMatch[1]);
      const rawName = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      const normalized = normalizeTurkish(rawName);
      const cityKey = CITY_NAME_TO_KEY[normalized];

      if (cityKey && !seen.has(cityKey)) {
        seen.add(cityKey);
        cities.push({ cityKey, cityId, cityName: rawName });
      }
    });

    // Fallback: eğer sayfa parse edilemezse hardcoded listeden devam et
    if (cities.length === 0) {
      return Object.entries(TJK_CITIES).map(([k, v]) => ({ cityKey: k, cityId: v.id, cityName: v.name }));
    }

    return cities;
  } catch {
    // Fallback to hardcoded
    return Object.entries(TJK_CITIES).map(([k, v]) => ({ cityKey: k, cityId: v.id, cityName: v.name }));
  }
}

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
  // Yeni alanlar
  mesafe: number | null;          // metre (ör: 900)
  kosul: string;                  // "ŞARTLI, 2 Yaşlı İngilizler, 57 kg"
  eld: string;                    // "0:52:05"
  ikramiye: string;               // "835000,334000,167000,83500,41750"
  ekuri: string;                  // "[(7)MAJESTUOSA,(8)OKLAHOMA] eküridir"
  hasCifte: boolean;
  hasIkili: boolean;
  hasSiraliIkili: boolean;
  hasPlase: boolean;
  hasPlaseIkili: boolean;
  hasUcluBahis: boolean;
  has7liGanyan: boolean;
  has7liPlase: boolean;
  has3luGanyan: boolean;
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
export async function fetchTJKProgram(cityKey: string, date: Date, overrideCityId?: number): Promise<string> {
  const city = TJK_CITIES[cityKey];
  if (!city) throw new Error(`Unknown city: ${cityKey}`);

  const cityId = overrideCityId ?? city.id;
  const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

  const url = `${TJK_BASE_URL}?SehirId=${cityId}&QueryParameter_Tarih=${encodeURIComponent(dateStr)}&SehirAdi=${encodeURIComponent(city.name)}&Era=today`;

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
  const raceMatch = raceText.match(/(\d+)\.\s+Koşu[:\s]*(\d{2})[.:](\d{2})/);
  if (!raceMatch) return null;

  const raceNo = parseInt(raceMatch[1], 10);
  const raceTime = `${raceMatch[2]}:${raceMatch[3]}`;
  const raceName = `${raceNo}. Koşu`;

  // Race type (HANDİKAP etc.) — özel koşu adı
  const raceTypeEl = detailsDiv.find('.ozelKosuAdi');
  const raceType = raceTypeEl.text().trim() || '';

  // Koşul satırı: "ŞARTLI, 2 Yaşlı İngilizler, 57 kg, 900 Çm, ELD.: 0:52:05"
  const kosulEl = detailsDiv.find('.race-condition, .kosul, .race-info').first();
  const kosulRaw = kosulEl.text().trim() ||
    detailsDiv.find('p, span, div').filter((_, el) => $(el).text().includes('Çm')).first().text().trim();

  // Mesafe: "900 Çm" → 900
  const mesafeMatch = kosulRaw.match(/(\d+)\s*[Çç]m/);
  const mesafe = mesafeMatch ? parseInt(mesafeMatch[1], 10) : null;

  // ELD: "ELD.: 0:52:05"
  const eldMatch = kosulRaw.match(/ELD\.\s*[:\s]*([\d:]+)/i);
  const eld = eldMatch ? eldMatch[1].trim() : '';

  // Koşul metni (mesafe ve ELD hariç)
  const kosul = kosulRaw.replace(/\s*\d+\s*[Çç]m.*$/i, '').trim();

  // İkramiye: "1.)835.000 ₺ 2.)334.000 ₺ ..."
  const ikramiyeEl = panel.find('.ikramiye, [class*="ikram"], [class*="prim"]').first();
  const ikramiyeRaw = ikramiyeEl.text().trim();
  // Sayıları çıkar: "835.000" → 835000
  const ikramiyeNums = [...ikramiyeRaw.matchAll(/[\d.,]+\s*₺/g)]
    .map(m => m[0].replace(/[.₺\s]/g, '').replace(',', '.'))
    .join(',');
  const ikramiye = ikramiyeNums || ikramiyeRaw.slice(0, 200);

  // Ekuri bilgisi
  const ekuriEl = panel.find('[class*="ekuri"], [class*="couple"]').first();
  let ekuri = ekuriEl.text().trim();
  if (!ekuri) {
    // Alternatif: "eküridir" geçen metni bul
    panel.find('*').each((_, el) => {
      const t = $(el).text();
      if (t.includes('eküridir') && t.length < 200 && !ekuri) {
        ekuri = t.trim();
      }
    });
  }

  // Bahis türleri: Çifte, İkili, Sıralı İkili
  let hasCifte = false;
  let hasIkili = false;
  let hasSiraliIkili = false;
  let hasPlase = false;
  let hasPlaseIkili = false;
  let hasUcluBahis = false;
  let has7liGanyan = false;
  let has7liPlase = false;
  let has3luGanyan = false;

  panel.find('*').each((_, el) => {
    const t = $(el).text().toLowerCase();
    if (t.includes('çifte') && t.includes('başlar')) hasCifte = true;
    if (t.includes('ikili') && t.includes('başlar') && !t.includes('sıralı') && !t.includes('sirali') && !t.includes('plase')) hasIkili = true;
    if ((t.includes('sıralı ikili') || t.includes('sirali ikili')) && t.includes('başlar')) hasSiraliIkili = true;
    if (t.includes('plase ikili') && t.includes('başlar')) hasPlaseIkili = true;
    else if (t.includes('plase') && t.includes('başlar') && !t.includes('7\'li') && !t.includes('7li')) hasPlase = true;
    if ((t.includes('üçlü bahis') || t.includes('uclu bahis')) && t.includes('başlar')) hasUcluBahis = true;
    if (t.includes('7\'li ganyan') && t.includes('başlar')) has7liGanyan = true;
    if (t.includes('7\'li plase') && t.includes('başlar')) has7liPlase = true;
    if (t.includes('3\'lü ganyan') && t.includes('başlar')) has3luGanyan = true;
  });

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
    mesafe,
    kosul,
    eld,
    ikramiye,
    ekuri,
    hasCifte,
    hasIkili,
    hasSiraliIkili,
    hasPlase,
    hasPlaseIkili,
    hasUcluBahis,
    has7liGanyan,
    has7liPlase,
    has3luGanyan,
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

  // Altılı başlangıç koşularını belirle:
  // agf1 olan ilk koşu = 1. Altılı başlangıcı
  // agf2 olan ilk koşu = 2. Altılı başlangıcı
  // Diğer tüm koşularda hasAltili = false
  let altili1Done = false;
  let altili2Done = false;

  for (const race of races) {
    race.hasAltili = false;
    race.altiliNo = null;

    const hasAgf1 = race.horses.some(h => h.agf1 != null);
    const hasAgf2 = race.horses.some(h => h.agf2 != null);

    if (hasAgf1 && !altili1Done) {
      race.hasAltili = true;
      race.altiliNo = 1;
      altili1Done = true;
    }

    if (hasAgf2 && !altili2Done) {
      race.hasAltili = true;
      race.altiliNo = race.altiliNo === 1 ? 1 : 2; // 2. altılı (1. ile çakışmıyorsa)
      if (race.altiliNo !== 1) {
        race.altiliNo = 2;
      }
      altili2Done = true;
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

