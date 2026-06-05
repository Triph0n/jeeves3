const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_mz.html', 'utf-8');
const $ = cheerio.load(html);
const results = [];

$('a[href^="https://www.musikzeitung.ch/stellen/"]').each((i, el) => {
  const url = $(el).attr('href');
  if(url === 'https://www.musikzeitung.ch/stellen/' || url.includes('?')) return;
  if(!results.find(r => r.url === url)) {
    // Check if the parent is h3
    const h3 = $(el).closest('h3');
    if (h3.length) {
      // It's a title!
      const parentBlock = h3.parent(); // maybe a div containing the institution!
      results.push({
        type: 'h3_link',
        url,
        text: $(el).text().replace(/\s+/g, ' ').trim(),
        parentText: parentBlock.text().replace(/\s+/g, ' ').trim()
      });
    } else {
      results.push({
        type: 'other_link',
        url,
        text: $(el).text().replace(/\s+/g, ' ').trim(),
        parentText: $(el).parent().text().replace(/\s+/g, ' ').trim()
      });
    }
  }
});
console.log(JSON.stringify(results, null, 2));
