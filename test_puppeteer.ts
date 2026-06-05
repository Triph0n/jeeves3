import puppeteer from 'puppeteer'; 
(async () => {
    try {
        console.log('launching');
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        console.log('going to url');
        await page.goto('https://www.musikzeitung.ch/stellen/?_sf_s=cello', { waitUntil: 'networkidle2' });
        console.log('evaluating');
        const res = await page.evaluate(() => { return document.title });
        console.log('result:', res);
        await browser.close();
    } catch(e) {
        console.error('PUPPETEER ERROR:', e.message);
    }
})();
