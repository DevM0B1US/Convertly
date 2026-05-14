import { chromium } from 'playwright';

let browser;
(async () => {
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('load');

    // Test clicking a sidebar button
    const sidebarBtn = await page.$('.w-16 button');
    if (sidebarBtn) {
      const box = await sidebarBtn.boundingBox();
      if (!box) throw new Error('Sidebar button has no bounding box — element may be hidden or not laid out.');
      console.log("Sidebar button bounding box:", box);

      // Evaluate what is at this point
      const elementAtPoint = await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.outerHTML : null;
      }, {x: box.x + box.width/2, y: box.y + box.height/2});

      console.log("Element at point for Sidebar button:", elementAtPoint);
    }

    // Test clicking Titlebar close button
    const closeBtn = await page.$('.h-10 button:last-child');
    if (closeBtn) {
      const box = await closeBtn.boundingBox();
      if (!box) throw new Error('Close button has no bounding box — element may be hidden or not laid out.');
      console.log("Close button bounding box:", box);

      const elementAtPoint = await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.outerHTML : null;
      }, {x: box.x + box.width/2, y: box.y + box.height/2});

      console.log("Element at point for Close button:", elementAtPoint);
    }
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    if (browser) await browser.close();
  }
})();
