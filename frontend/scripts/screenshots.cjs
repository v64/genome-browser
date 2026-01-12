// Playwright script to capture screenshots for documentation
const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');
const BASE_URL = 'http://localhost:5173';

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  // Wait for app to be ready
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('Capturing screenshots...\n');

  // 1.1 Main Dashboard
  console.log('1.1 Main Dashboard');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '1.1-main-dashboard.png') });

  // 4.1 Browse Main Page - this is the one that changed the most
  console.log('4.1 Browse Main Page');
  // Click Browse tab using keyboard shortcut
  await page.keyboard.press('4');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Click chromosome 1 button (just shows "1")
  const chr1Button = page.locator('button[title*="Chr 1:"]');
  if (await chr1Button.count() > 0) {
    await chr1Button.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '4.1-browse-main-page.png') });

  // 4.2 Browse with Label Filter (NEW)
  console.log('4.2 Browse with Label Filter');
  // Click on "risk" label button
  const riskButton = page.locator('button:has-text("risk")').first();
  if (await riskButton.count() > 0) {
    await riskButton.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '4.2-browse-label-filter.png') });
  }

  // 4.3 Browse with Tag Search (NEW)
  console.log('4.3 Browse with Tag Search');
  // Clear filters first
  const clearAllButton = page.locator('button:has-text("Clear all filters")');
  if (await clearAllButton.count() > 0) {
    await clearAllButton.click();
    await page.waitForTimeout(500);
  }

  // Search for a tag
  const tagSearch = page.locator('input[placeholder="Search tags..."]');
  if (await tagSearch.count() > 0) {
    await tagSearch.fill('cardio');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '4.3-browse-tag-search.png') });
  }

  // 4.4 Browse with multi-tag selection (NEW)
  console.log('4.4 Browse with Multi-Tag Selection');
  await tagSearch.clear();
  await page.waitForTimeout(500);
  // Click a couple tags
  const pharmacoTag = page.locator('button:has-text("pharmacogenomics")').first();
  if (await pharmacoTag.count() > 0) {
    await pharmacoTag.click();
    await page.waitForTimeout(500);
  }
  const metabolismTag = page.locator('button:has-text("metabolism")').first();
  if (await metabolismTag.count() > 0) {
    await metabolismTag.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '4.4-browse-multi-tag.png') });
  }

  // 2.7 Gene Main Page with reanalyze button
  console.log('2.7 Gene Main Page');
  await page.goto(BASE_URL + '/snp/rs1801133');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '2.7-gene-main-page.png') });

  await browser.close();
  console.log('\nDone! Screenshots saved to:', SCREENSHOTS_DIR);
}

captureScreenshots().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
