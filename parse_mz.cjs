const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_mz_latest.html', 'utf-8');
const $ = cheerio.load(html);

const links = $('a').toArray()
  .filter(a => $(a).attr('href') && $(a).attr('href').includes('/stellen/') && !$(a).attr('href').includes('?_sf_s'))
  .map(a => {
    const el = $(a);
    const parentText = el.parent().text().trim().replace(/\s+/g, ' ');
    const grandParentText = el.parent().parent().text().trim().replace(/\s+/g, ' ');
    return {
      link: el.attr('href'),
      text: el.text().trim(),
      parentTag: el.parent()[0]?.name,
      parentText,
      grandParentText
    };
  });

fs.writeFileSync('mz_links.json', JSON.stringify(links, null, 2));
console.log('Wrote to mz_links.json');
