const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function testFetch(name: string, url: string, headers: any) {
  try {
    console.log(`[${name}] Fetching ${url}...`);
    const response = await fetch(url, { headers });
    console.log(`[${name}] Status: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.log(`[${name}] Length: ${text.length} bytes`);
    if (!response.ok) {
      console.log(`[${name}] Sample body: ${text.substring(0, 300)}`);
    }
  } catch (err: any) {
    console.error(`[${name}] Error:`, err.message);
  }
}

async function main() {
  await testFetch(
    'Muvac',
    'https://api.muvac.com/browse/opportunities/vacancy',
    {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://www.muvac.com',
      'Referer': 'https://www.muvac.com/'
    }
  );

  await testFetch(
    'Musikzeitung HTML',
    'https://www.musikzeitung.ch/stellen/?_sf_s=cello',
    {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'cs-CZ,cs;q=0.9,de;q=0.8,en;q=0.7',
      'User-Agent': BROWSER_USER_AGENT,
    }
  );

  await testFetch(
    'Musikzeitung Feed',
    'https://www.musikzeitung.ch/stellen/feed?_sf_s=cello',
    {
      'Accept': 'application/rss+xml, application/xml, text/xml',
      'User-Agent': BROWSER_USER_AGENT,
    }
  );

  await testFetch(
    'VZM',
    'https://vzm.ch/stellenanzeiger/',
    {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'de-CH,de;q=0.9,cs;q=0.8,en;q=0.7',
      'User-Agent': BROWSER_USER_AGENT,
    }
  );

  await testFetch(
    'MKZ',
    'https://www.stadt-zuerich.ch/mkz/de/ueber-mkz/jobs.html?search=q%3D%26stellentyp%3D%26dienstabteilung%3DMusikschule%2BKonservatorium%2BZ%25C3%25BCrich%26beschaeftigungsgrad%3D%26lang%3Dde%26compResource%3D%252Fcontent%252Fbetriebssites%252Fmkz%252Fde%252Fueber-mkz%252Fjobs%252Fjcr%253Acontent%252Fmainparsys%252Fjobsearch%26variant%3Ddefault%26limit%3D1',
    {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'de-CH,de;q=0.9,cs;q=0.8,en;q=0.7',
      'User-Agent': BROWSER_USER_AGENT,
    }
  );
}

main();
