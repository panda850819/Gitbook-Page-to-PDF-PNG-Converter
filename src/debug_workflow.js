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
    const parsedSitemap = await xml2js.parseStringPromise(sitemapXML);
    
    if (parsedSitemap.sitemapindex) {
      console.log("Found sitemap index, fetching individual sitemaps...");
      const sitemapUrls = parsedSitemap.sitemapindex.sitemap.map(sitemap => sitemap.loc[0]);
      
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
    return urls.map((url) => url.loc[0]);
  } catch (error) {
    console.error("Error fetching or parsing sitemap:", error);
    return null;
  }
}

// Function to group URLs based on their categories
function categorizeUrl(url) {
  const parts = url.split("/");
  console.log(`URL: ${url}, Parts: ${JSON.stringify(parts)}`);
  
  // 處理根域名 URL
  if (parts.length <= 3) {
    console.log(`  -> Category: root`);
    return "root";
  }
  
  // 處理只有一個路徑段的 URL
  if (parts.length === 4) {
    console.log(`  -> Category: ${parts[3]}`);
    return parts[3];
  }
  
  // 處理有多個路徑段的 URL，使用第二個路徑段作為類別
  if (parts.length >= 5) {
    console.log(`  -> Category: ${parts[4]}`);
    return parts[4];
  }
  
  console.log(`  -> Category: unknown`);
  return "unknown";
}

// 獲取所有 PDF 文件並按頁面編號排序
function getAllPdfFiles(directory) {
  const files = [];
  
  function searchDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        console.log(`Found directory: ${entry.name}`);
        searchDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.pdf')) {
        const match = entry.name.match(/page_(\d+)\.pdf/);
        if (match) {
          const pageNumber = parseInt(match[1]);
          const category = path.basename(path.dirname(fullPath));
          console.log(`Found PDF: ${entry.name} in category ${category}`);
          files.push({
            path: fullPath,
            pageNumber: pageNumber,
            fileName: entry.name,
            category: category
          });
        }
      }
    }
  }
  
  searchDirectory(directory);
  files.sort((a, b) => a.pageNumber - b.pageNumber);
  return files;
}

// 簡化的合併函數（用於調試）
async function debugMerge(tempDir) {
  console.log('\n📖 開始調試合併過程...');
  
  const pdfFiles = getAllPdfFiles(tempDir);
  console.log(`📄 找到 ${pdfFiles.length} 個 PDF 文件`);
  
  // 按類別分組文件
  const filesByCategory = {};
  pdfFiles.forEach(file => {
    if (!filesByCategory[file.category]) {
      filesByCategory[file.category] = [];
    }
    filesByCategory[file.category].push(file);
  });
  
  console.log('\n📂 文件分類統計:');
  for (const [category, files] of Object.entries(filesByCategory)) {
    console.log(`  ${category}: ${files.length} 個文件`);
    files.forEach(file => {
      console.log(`    - ${file.fileName}`);
    });
  }
  
  return filesByCategory;
}

// 主要調試函數
async function debugWorkflow() {
  const tempDir = "./temp_pdfs";
  
  console.log('🚀 開始調試工作流程...\n');
  
  try {
    // 步驟 1: 創建臨時目錄
    console.log('📁 準備工作目錄...');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir);
    
    // 步驟 2: 獲取 sitemap
    console.log('🔍 獲取網站地圖...');
    const sitemapUrl = `${URL_GITBOOK}/sitemap.xml`;
    const urls = await fetchSitemap(sitemapUrl);
    
    if (!urls || urls.length === 0) {
      throw new Error('無法獲取網站地圖或網站地圖為空');
    }
    
    console.log(`📄 找到 ${urls.length} 個頁面`);
    
    // 步驟 3: 分析 URL 分類
    console.log('\n🔍 分析 URL 分類...');
    const categories = {};
    urls.forEach((url, index) => {
      console.log(`\n--- 分析 URL ${index + 1} ---`);
      const category = categorizeUrl(url);
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(url);
    });
    
    console.log('\n📊 分類統計:');
    for (const [category, urls] of Object.entries(categories)) {
      console.log(`  ${category}: ${urls.length} 個頁面`);
    }
    
    // 讓我們只下載前5個頁面進行測試
    console.log('\n⬇️ 下載前5個頁面進行測試...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    for (let i = 0; i < Math.min(5, urls.length); i++) {
      const url = urls[i];
      const category = categorizeUrl(url);
      const categoryDir = path.join(tempDir, category);
      
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }
      
      const pdfFileName = `page_${i + 1}.pdf`;
      const pdfPath = path.join(categoryDir, pdfFileName);
      
      console.log(`📄 下載頁面 ${i + 1}/5: ${url}`);
      
      try {
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(url, { waitUntil: "networkidle2" });
        await page.pdf({
          path: pdfPath,
          format: "A4",
          printBackground: true,
        });
        console.log(`✅ 成功: ${pdfFileName}`);
      } catch (error) {
        console.error(`❌ 失敗: ${error.message}`);
      }
    }
    
    await browser.close();
    
    // 步驟 4: 調試合併過程
    const filesByCategory = await debugMerge(tempDir);
    
    // 清理
    console.log('\n🧹 清理臨時文件...');
    fs.rmSync(tempDir, { recursive: true, force: true });
    
  } catch (error) {
    console.error('❌ 調試失敗:', error.message);
    
    // 清理
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

// 運行調試
debugWorkflow().catch(console.error); 