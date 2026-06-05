import https from 'https';

const options = {
  hostname: 'api.muvac.com',
  path: '/browse/opportunities/vacancy',
  method: 'GET',
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://www.muvac.com',
    'Referer': 'https://www.muvac.com/'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const json = JSON.parse(data);
    const celloVacancies = json.data.items.filter(i => 
      i.expertises && i.expertises.some(e => e.group === 'instruments.cello')
    );
    console.log(JSON.stringify(celloVacancies.slice(0, 1).map(i => ({
      title: i.title,
      slug: i.slug,
      profile: i.profile.name,
      applicationEnd: i.applicationEnd,
      subType: i.subType
    })), null, 2));
  });
});

req.on('error', error => console.error(error));
req.end();
