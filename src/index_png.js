const puppeteer = require("puppeteer");
const axios = require("axios");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");

const URL_GITBOOK = "https://azul-mouad.gitbook.io/goldtv-iptv-documments";

// Function to fetch the sitemap XML and parse it
async function fetchSitemap(url) {
  try {
    const response = await axios.get(url);
    const sitemapXML = response.data;

    // Parse the XML sitemap into JSON
    const parsedSitemap = await xml2js.parseStringPromise(sitemapXML);
    const urls = parsedSitemap.urlset.url;

    return urls.map((url) => url.loc[0]); // Extract the 'loc' elements (URLs)
  } catch (error) {
    console.error("Error fetching or parsing sitemap:", error);
  }
}

// Function to take a full-page screenshot with a high DPI setting

async function takeFullPageScreenshot(page, url, outputPath) {
  try {
    // Set the viewport to a reasonable width (e.g., 1280px) for full-page capture
    await page.setViewport({ width: 1280, height: 800 });

    // Set device scale factor for high DPI (2 is Retina)
    await page.emulate({
      viewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
      userAgent: "",
    });

    // Go to the page and wait for it to load completely
    await page.goto(url, { waitUntil: "networkidle2" });

    // Remove the menu by setting display to 'none'
    await page.evaluate(() => {
      // Remove the first element (the menu)
      const menu = document.querySelector(
        "aside.relative.group.flex.flex-col.basis-full.bg-light"
      );
      if (menu) {
        menu.style.display = "none"; // Hide the menu
      }

      // Remove the second element (the search button div)
      const searchButton = document.querySelector(
        "div.flex.md\\:w-56.grow-0.shrink-0.justify-self-end"
      );
      if (searchButton) {
        searchButton.style.display = "none"; // Hide the search button div
      }

      // Remove the next button div
      const nextButton = document.querySelector(
        "div.flex.flex-col.md\\:flex-row.mt-6.gap-2.max-w-3xl.mx-auto.page-api-block\\:ml-0"
      );
      if (nextButton) {
        nextButton.style.display = "none"; // Hide the next button div
      }

      // Remove the "Last updated" info div
      const lastUpdatedInfo = document.querySelector(
        "div.flex.flex-row.items-center.mt-6.max-w-3xl.mx-auto.page-api-block\\:ml-0"
      );
      if (lastUpdatedInfo) {
        lastUpdatedInfo.style.display = "none"; // Hide the "Last updated" div
      }
    });

    // Take a full-page screenshot with high quality (no quality setting for PNG)
    await page.screenshot({
      path: outputPath,
      fullPage: true, // Capture the entire page, even the off-screen part
      type: "png", // PNG format is better for non-compressed images
    });

    console.log(`Saved screenshot for: ${url} at ${outputPath}`);
  } catch (error) {
    console.error(`Failed to take screenshot for: ${url}`, error);
  }
}

// Function to group URLs based on their categories (like 'settings', 'android')
function categorizeUrl(url) {
  const parts = url.split("/");
  const category = parts[4]; // Assuming categories are the 5th part of the URL

  return category; // Return the category name (e.g., 'settings', 'android')
}

// Main function to run the script
async function run() {
  const sitemapUrl = `${URL_GITBOOK}/sitemap.xml`; // Replace with the actual sitemap URL
  const saveDir = "./screenshots"; // Directory where screenshots will be saved

  // Create the output directory if it doesn't exist
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir);
  }

  // Fetch the sitemap URLs
  const urls = await fetchSitemap(sitemapUrl);
  if (!urls) return;

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Initialize the page counter for screenshots
  let pageCounter = 1;

  // Loop through each URL in the sitemap
  for (const url of urls) {
    // Determine the category based on the URL
    const category = categorizeUrl(url);
    const categoryDir = path.join(saveDir, category);

    // Create a folder for the category if it doesn't exist
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    // Generate a sequential filename for the screenshot (page_1.png, page_2.png, ...)
    const screenshotFileName = `page_${pageCounter}.png`; // Use pageCounter for unique file names
    const screenshotPath = path.join(categoryDir, screenshotFileName);

    // Capture the full page screenshot after hiding the menu
    await takeFullPageScreenshot(page, url, screenshotPath);

    // Increment the page counter
    pageCounter++;
  }

  await browser.close();
}
run().catch(console.error);
