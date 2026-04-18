import { NextResponse } from 'next/server';
import { fetchTJKProgram } from '@/lib/tjk-api';
import { load } from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city') || 'ANKARA';

  try {
    const html = await fetchTJKProgram(city, new Date());
    const $ = load(html);

    // İlk koşunun ilk 2 atını incele
    const panel = $('div.races-panes > div').first();
    const rows = panel.find('table.tablesorter tbody tr').slice(0, 2);

    const debug: object[] = [];

    rows.each((_, rowEl) => {
      const row = $(rowEl);
      const atAdiTd = row.find('.gunluk-GunlukYarisProgrami-AtAdi');

      debug.push({
        // data attributes on <tr>
        dataHorseName: $(rowEl).attr('data-horse-name'),
        dataHorseNo: $(rowEl).attr('data-horse-no'),
        // AtAdi cell
        atAdiHtml: atAdiTd.html()?.slice(0, 300),
        atAdiText: atAdiTd.text().trim().slice(0, 100),
        atAdiAnchorText: atAdiTd.find('a').text().trim(),
        atAdiAnchorTitle: atAdiTd.find('a').attr('title'),
        atAdiAnchorHref: atAdiTd.find('a').attr('href'),
        // JokeAdi cell
        jokeAdiText: row.find('.gunluk-GunlukYarisProgrami-JokeAdi').text().trim().slice(0, 100),
        jokeAdiAnchorText: row.find('.gunluk-GunlukYarisProgrami-JokeAdi a').text().trim(),
        jokeAdiAnchorTitle: row.find('.gunluk-GunlukYarisProgrami-JokeAdi a').attr('title'),
        // All data-* attrs on row
        rowAttribs: (rowEl as { attribs?: Record<string, string> }).attribs,
      });
    });

    return NextResponse.json({ city, debug });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

