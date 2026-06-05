const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('mz_test_2.html', 'utf-8');
const $ = cheerio.load(html);
const links = [];

$('a').each((_i, el) => {
  const href = $(el).attr('href');
  if (href && href.includes('stellen') && href.length > 40) {
    links.push(href);
  }
});

console.log(links.slice(0, 10));
