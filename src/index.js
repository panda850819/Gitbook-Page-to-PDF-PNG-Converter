const puppeteer = require("puppeteer");
const axios = require("axios");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");

const URL_GITBOOK = "https://docs.usual.money";

// Function to fetch the sitemap XML and parse it
async function fetchSitemap(url) {
  try {
    const response = await axios.get(url);
    const sitemapXML = response.data;

    // Parse the XML sitemap into JSON
    const parsedSitemap = await xml2js.parseStringPromise(sitemapXML);
    
    // 檢查是否是 sitemapindex 而不是 urlset
    if (parsedSitemap.sitemapindex) {
      console.log("Found sitemap index, fetching individual sitemaps...");
      const sitemapUrls = parsedSitemap.sitemapindex.sitemap.map(sitemap => sitemap.loc[0]);
      
      // 獲取所有子 sitemap 的 URLs
      const allUrls = [];
      for (const sitemapUrl of sitemapUrls) {
        const subUrls = await fetchSitemap(sitemapUrl);
        if (subUrls) {
          allUrls.push(...subUrls);
        }
      }
      return allUrls;
    }
    
    if (!parsedSitemap.urlset || !parsedSitemap.urlset.url) {
      console.log("No urlset.url found in sitemap");
      return null;
    }
    
    const urls = parsedSitemap.urlset.url;

    return urls.map((url) => url.loc[0]); // Extract the 'loc' elements (URLs)
  } catch (error) {
    console.error("Error fetching or parsing sitemap:", error);
    return null;
  }
}

// Function to convert a page to PDF with selectable text and high-quality images
async function takeFullPagePdf(page, url, outputPath) {
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

    // Remove elements by setting display to 'none'
    await page.evaluate(() => {
      // Remove the AppBar element
      const appBar = document.querySelector("div.appBarClassName"); // Replace with the correct selector for the AppBar
      if (appBar) {
        appBar.style.display = "none"; // Hide the AppBar
      }

      // Remove the element with class "scroll-nojump"
      const scrollNoJump = document.querySelector(".scroll-nojump");
      if (scrollNoJump) {
        scrollNoJump.style.display = "none"; // Hide the scroll-nojump element
      }

      // Remove the menu element
      const menu = document.querySelector(
        "aside.relative.group.flex.flex-col.basis-full.bg-light"
      );
      if (menu) {
        menu.style.display = "none"; // Hide the menu
      }

      // Remove the search button
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

      // Remove the "Last updated" info
      const lastUpdatedInfo = document.querySelector(
        "div.flex.flex-row.items-center.mt-6.max-w-3xl.mx-auto.page-api-block\\:ml-0"
      );
      if (lastUpdatedInfo) {
        lastUpdatedInfo.style.display = "none"; // Hide the "Last updated" div
      }
    });

    // Convert the page to PDF with high-quality images
    await page.pdf({
      path: outputPath,
      format: "A4", // Use A4 paper size for PDF
      printBackground: true, // Ensure background images and colors are included
      scale: 1, // Keep the original scale
      preferCSSPageSize: true, // Ensure that the page uses CSS page size
    });

    console.log(`Saved PDF for: ${url} at ${outputPath}`);
  } catch (error) {
    console.error(`Failed to take PDF for: ${url}`, error);
  }
}

// Function to group URLs based on their categories (like 'settings', 'android')
function categorizeUrl(url) {
  const parts = url.split("/");
  
  // 處理根域名 URL
  if (parts.length <= 3) {
    return "root"; // 根域名頁面
  }
  
  // 處理只有一個路徑段的 URL（例如 /start-here）
  if (parts.length === 4) {
    return parts[3]; // 第一個路徑段
  }
  
  // 處理有多個路徑段的 URL，使用第二個路徑段作為類別
  if (parts.length >= 5) {
    return parts[4]; // 第二個路徑段
  }
  
  return "unknown"; // 備用類別
}

// Main function to run the script
async function run() {
  const sitemapUrl = `${URL_GITBOOK}/sitemap.xml`; // Replace with the actual sitemap URL
  const saveDir = "./pdfs"; // Directory where PDFs will be saved

  // Create the output directory if it doesn't exist
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir);
  }

  // Fetch the sitemap URLs
  const urls = await fetchSitemap(sitemapUrl);
  if (!urls) return;

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Initialize the page counter
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

    // Generate a sequential filename for the PDF (page_1.pdf, page_2.pdf, ...)
    const pdfFileName = `page_${pageCounter}.pdf`; // Use pageCounter for unique file names
    const pdfPath = path.join(categoryDir, pdfFileName);

    // Capture the full page as a PDF
    await takeFullPagePdf(page, url, pdfPath);

    // Increment the page counter
    pageCounter++;
  }

  await browser.close();
}

run().catch(console.error);
