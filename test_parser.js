const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('test_mz.html', 'utf-8');
const $ = cheerio.load(html);

$('a').each((_i, el) => {
  const href = $(el).attr('href');
  if (href && href.includes('stellen') && !href.includes('?')) {
    console.log($(el).text().trim().replace(/\s+/g, ' '), ' -> ', href);
  }
});
