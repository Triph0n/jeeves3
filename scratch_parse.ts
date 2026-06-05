import * as cheerio from 'cheerio';

const CELLO_TERMS = ["cello", "violoncello", "violoncelle", "violoncelo"];
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const normalizeSearchText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const hasCelloTerm = (...values: unknown[]) => {
  const haystack = normalizeSearchText(values.filter(Boolean).join(" "));
  return CELLO_TERMS.some(term => haystack.includes(term));
};

const toAbsoluteUrl = (url: string, baseUrl: string) => {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

const parseMusikzeitungHtmlVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const results: any[] = [];

  $('a[href*="/stellen/"]').each((_, element) => {
    const rawUrl = $(element).attr('href') || '';
    if (!rawUrl || rawUrl.includes('?_sf_s') || rawUrl.replace(/\/$/, '').endsWith('/stellen')) return;

    const url = toAbsoluteUrl(rawUrl, 'https://www.musikzeitung.ch');
    const lines = $(element).text().split('\n').map(line => line.trim()).filter(Boolean);
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    const parentText = $(element).parent().text().replace(/\s+/g, ' ').trim();
    const cardText = $(element).closest('article, .post, .elementor-post, .jet-listing-grid__item, div').text().replace(/\s+/g, ' ').trim();
    const sourceText = [text, parentText, cardText].find(value => hasCelloTerm(value)) || '';

    if (!sourceText) return;
    if (results.some(item => item.url === url)) return;

    const date = sourceText.match(/\d{2}\.\d{2}\.\d{2,4}/)?.[0] || '';
    const title = lines.find(line => hasCelloTerm(line))
      || lines.find(line => !/Lehrpersonen|Dozentinnen|Orchestermusiker/i.test(line))
      || sourceText.replace(/\s*\|\s*\d{2}\.\d{2}\.\d{2,4}.*/, '').trim()
      || 'Inzerát Musikzeitung';
    const detailLine = lines[lines.length - 1] || '';
    const institution = detailLine.includes('|')
      ? detailLine.split('|')[0].trim()
      : 'Více na webu';

    results.push({
      id: url,
      title,
      url,
      institution,
      date,
    });
  });

  return results;
};

const parseMusikzeitungFeedVacancies = (xml: string) => {
  const $ = cheerio.load(xml, { xmlMode: true });

  return $('item').toArray()
    .map((item) => {
      const element = $(item);
      const title = element.find('title').first().text().trim();
      const url = element.find('link').first().text().trim();
      const pubDate = element.find('pubDate').first().text().trim();
      const description = element.find('description').first().text();
      const content = element.find('content\\:encoded').first().text();

      return {
        id: url,
        title: title || 'Inzerát Musikzeitung',
        url,
        institution: 'Více na webu',
        date: pubDate ? new Date(pubDate).toLocaleDateString('cs-CZ') : '',
        searchText: [title, url, description, content].join(' '),
      };
    })
    .filter(item => item.url && hasCelloTerm(item.searchText))
    .map(({ searchText, ...item }) => item);
};

const parseVzmVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const textLines = $('body').text().split('\n').map(line => line.trim()).filter(Boolean);
  const startIndex = textLines.findIndex(line => line === 'Stellenanzeiger');
  const footerIndex = textLines.findIndex(line => line === 'Verband Zürcher Musikschulen');
  const lines = textLines.slice(
    startIndex === -1 ? 0 : startIndex + 1,
    footerIndex === -1 ? undefined : footerIndex
  );
  const links = $('a[href]').toArray()
    .map(element => {
      const href = $(element).attr('href') || '';
      const label = $(element).text().replace(/\s+/g, ' ').trim();
      return { href: toAbsoluteUrl(href, 'https://vzm.ch'), label };
    })
    .filter(link =>
      /stellen|pdf|successfactors|stadt-zuerich/i.test(link.href + ' ' + link.label)
        && !/datenschutz/i.test(link.href + ' ' + link.label)
    );
  const vacancies: any[] = [];
  let linkIndex = 0;
  let index = 0;

  while (index < lines.length - 1) {
    const institution = lines[index];
    const title = lines[index + 1];
    if (!institution || !title || /^(Pensum|Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):?$/.test(institution)) {
      index += 1;
      continue;
    }

    const details: string[] = [];
    index += 2;
    while (index < lines.length) {
      const line = lines[index];
      details.push(line);
      index += 1;
      if (line === 'Stelleninserat:') {
        if (index < lines.length && /^(pdf|Link)/i.test(lines[index])) index += 1;
        break;
      }
    }

    const detailText = details.join(' ');
    const workload = detailText.match(/Pensum:\s*(.*?)(?:\s+(?:Arbeitsort|Unterrichtsort|Unterrichtstage|Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const deadline = detailText.match(/Bewerbung:\s*(.*?)(?:\s+(?:Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const location = detailText.match(/(?:Arbeitsort|Unterrichtsort):\s*(.*?)(?:\s+(?:Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const link = links[linkIndex];
    linkIndex += 1;

    vacancies.push({
      id: link?.href || `${institution}-${title}-${vacancies.length}`,
      title,
      institution,
      workload,
      location,
      deadline,
      url: link?.href || 'https://vzm.ch/stellenanzeiger/',
    });
  }

  return vacancies;
};

const parseMkzVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const lines = bodyText
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const links = $('a[href]').toArray()
    .map(element => {
      const href = $(element).attr('href') || '';
      const label = $(element).text().replace(/\s+/g, ' ').trim();
      return { href: toAbsoluteUrl(href, 'https://www.stadt-zuerich.ch'), label };
    })
    .filter(link => /job|stellen|bewerb|smartrecruiters|successfactors|stadt-zuerich/i.test(link.href + ' ' + link.label));
  const vacancies: any[] = [];

  const addVacancy = (title: string, institution: string, date: string, url?: string) => {
    const cleanTitle = title.replace(/^#+\s*/, '').trim();
    if (!cleanTitle || /^Job$|^Jobs$|^Suchergebnis/i.test(cleanTitle)) return;
    if (vacancies.some(item => normalizeSearchText(item.title) === normalizeSearchText(cleanTitle))) return;

    const matchingLink = links.find(link =>
      normalizeSearchText(link.label).includes(normalizeSearchText(cleanTitle))
        || normalizeSearchText(cleanTitle).includes(normalizeSearchText(link.label))
    );

    vacancies.push({
      id: matchingLink?.href || url || `${cleanTitle}-${vacancies.length}`,
      title: cleanTitle,
      institution: institution || 'Musikschule Konservatorium Zürich',
      date,
      url: matchingLink?.href || url || 'https://www.stadt-zuerich.ch/mkz/de/ueber-mkz/jobs.html',
    });
  };

  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr('href') || '';
    const cardText = anchor.closest('article, li, .mod, .component, .teaser, div').text().replace(/\s+/g, ' ').trim();
    if (!/Musikschule Konservatorium Zürich|Lehrperson|Musikalische Leitung/i.test(cardText)) return;

    const title = anchor.text().replace(/\s+/g, ' ').trim()
      || cardText.match(/(?:Lehrperson|Musikalische Leitung)[^.!?]*(?:%|$)/i)?.[0]
      || '';
    const date = cardText.match(/\d{1,2}\.\s+[A-Za-zÄÖÜäöüéû]+\s+\d{4}/)?.[0] || '';
    addVacancy(title, 'Musikschule Konservatorium Zürich', date, toAbsoluteUrl(href, 'https://www.stadt-zuerich.ch'));
  });

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || '';
    if (!/Musikschule Konservatorium Zürich/i.test(nextLine)) continue;
    if (!/(Lehrperson|Musikalische Leitung|Dozent|Leitung|Klavier|Violine|Cello|Saxophon|Querflöte|Orchester)/i.test(line)) continue;

    const date = lines[index + 2]?.match(/\d{1,2}\.\s+[A-Za-zÄÖÜäöüéû]+\s+\d{4}/)?.[0] || '';
    addVacancy(line, nextLine, date);
  }

  return vacancies;
};

async function testScraping() {
  // Test Muvac
  try {
    const res = await fetch('https://api.muvac.com/browse/opportunities/vacancy', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.muvac.com',
        'Referer': 'https://www.muvac.com/'
      }
    });
    const json: any = await res.json();
    const items = Array.isArray(json?.data?.items)
      ? json.data.items
      : Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
          ? json.data
          : [];
    console.log(`[Muvac] Total items in JSON: ${items.length}`);
    const celloVacancies = items
      .filter((i: any) => !i.subType || ['temporary', 'permanent'].includes(i.subType))
      .filter((i: any) => {
        const expertiseText = Array.isArray(i.expertises)
          ? i.expertises.map((e: any) => [e.group, e.id, e.name, e.label, e.title].filter(Boolean).join(' ')).join(' ')
          : '';
        return hasCelloTerm(i.title, i.name, i.description, expertiseText);
      });
    console.log(`[Muvac] Filtered cello vacancies: ${celloVacancies.length}`);
    if (celloVacancies.length > 0) {
      console.log(`[Muvac] Sample:`, JSON.stringify(celloVacancies.slice(0, 1), null, 2));
    }
  } catch (err: any) {
    console.error('[Muvac] Parsing failed:', err.message);
  }

  // Test Musikzeitung HTML
  try {
    const res = await fetch('https://www.musikzeitung.ch/stellen/?_sf_s=cello', {
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    });
    const html = await res.text();
    const vacancies = parseMusikzeitungHtmlVacancies(html);
    console.log(`[Musikzeitung HTML] Parsed vacancies: ${vacancies.length}`);
    if (vacancies.length > 0) {
      console.log(`[Musikzeitung HTML] Sample:`, JSON.stringify(vacancies.slice(0, 1), null, 2));
    } else {
      console.log('[Musikzeitung HTML] Zero vacancies. Trying feed fallback...');
      const feedRes = await fetch('https://www.musikzeitung.ch/stellen/feed?_sf_s=cello', {
        headers: { 'User-Agent': BROWSER_USER_AGENT }
      });
      const feedXml = await feedRes.text();
      const feedVacancies = parseMusikzeitungFeedVacancies(feedXml);
      console.log(`[Musikzeitung Feed] Parsed vacancies: ${feedVacancies.length}`);
      if (feedVacancies.length > 0) {
        console.log(`[Musikzeitung Feed] Sample:`, JSON.stringify(feedVacancies.slice(0, 1), null, 2));
      }
    }
  } catch (err: any) {
    console.error('[Musikzeitung] Parsing failed:', err.message);
  }

  // Test VZM
  try {
    const res = await fetch('https://vzm.ch/stellenanzeiger/', {
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    });
    const html = await res.text();
    const vacancies = parseVzmVacancies(html);
    console.log(`[VZM] Parsed vacancies: ${vacancies.length}`);
    const celloVacancies = vacancies.filter(v => hasCelloTerm(v.title, v.institution, v.workload, v.location));
    console.log(`[VZM] Filtered cello vacancies: ${celloVacancies.length}`);
    if (celloVacancies.length > 0) {
      console.log(`[VZM] Sample:`, JSON.stringify(celloVacancies.slice(0, 1), null, 2));
    }
  } catch (err: any) {
    console.error('[VZM] Parsing failed:', err.message);
  }

  // Test MKZ
  try {
    const res = await fetch('https://www.stadt-zuerich.ch/mkz/de/ueber-mkz/jobs.html?search=q%3D%26stellentyp%3D%26dienstabteilung%3DMusikschule%2BKonservatorium%2BZ%25C3%25BCrich%26beschaeftigungsgrad%3D%26lang%3Dde%26compResource%3D%252Fcontent%252Fbetriebssites%252Fmkz%252Fde%252Fueber-mkz%252Fjobs%252Fjcr%253Acontent%252Fmainparsys%252Fjobsearch%26variant%3Ddefault%26limit%3D1', {
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    });
    const html = await res.text();
    const vacancies = parseMkzVacancies(html);
    console.log(`[MKZ] Parsed vacancies: ${vacancies.length}`);
    const celloVacancies = vacancies.filter(v => hasCelloTerm(v.title, v.institution));
    console.log(`[MKZ] Filtered cello vacancies: ${celloVacancies.length}`);
    if (celloVacancies.length > 0) {
      console.log(`[MKZ] Sample:`, JSON.stringify(celloVacancies.slice(0, 1), null, 2));
    }
  } catch (err: any) {
    console.error('[MKZ] Parsing failed:', err.message);
  }
}

testScraping();
