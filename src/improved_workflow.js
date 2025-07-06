const puppeteer = require("puppeteer");
const axios = require("axios");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const URL_GITBOOK = "https://docs.usual.money";
const GITBOOK_TITLE = "Usual Docs"; // 從網站標題提取的名稱

// 獲取網站標題的函數
async function getWebsiteTitle() {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL_GITBOOK);
    const title = await page.title();
    await browser.close();
    
    // 提取標題並清理為適合資料夾名稱的格式
    const cleanTitle = title.split('|')[1]?.trim() || title.split('-')[0]?.trim() || "GitBook";
    return cleanTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  } catch (error) {
    console.error("無法獲取網站標題:", error.message);
    return "Usual_Docs";
  }
}

// 獲取sitemap並解析
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

// 將頁面轉換為PDF
async function takeFullPagePdf(page, url, outputPath) {
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.emulate({
      viewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
      userAgent: "",
    });

    await page.goto(url, { waitUntil: "networkidle2" });

    // 處理 cookie 同意彈窗
    try {
      // 等待並點擊 Accept 按鈕
      await page.waitForSelector('button:has-text("Accept")', { timeout: 3000 });
      await page.click('button:has-text("Accept")');
      console.log('✅ Cookie consent accepted');
    } catch (e) {
      // 如果沒有找到彈窗，繼續執行
      try {
        // 嘗試其他可能的 Accept 按鈕選擇器
        const acceptButton = await page.$('button[data-testid="accept"], button[id*="accept"], button[class*="accept"], .cookie-accept, #cookie-accept');
        if (acceptButton) {
          await acceptButton.click();
          console.log('✅ Cookie consent accepted (alternative selector)');
        }
      } catch (e2) {
        // 忽略 cookie 彈窗錯誤，繼續生成 PDF
      }
    }

    // 等待頁面穩定
    await page.waitForTimeout(1000);

    // 移除不需要的元素
    await page.evaluate(() => {
      const elementsToRemove = [
        "div.appBarClassName",
        ".scroll-nojump",
        "aside.relative.group.flex.flex-col.basis-full.bg-light",
        "div.flex.md\\:w-56.grow-0.shrink-0.justify-self-end",
        "div.flex.flex-col.md\\:flex-row.mt-6.gap-2.max-w-3xl.mx-auto.page-api-block\\:ml-0",
        "div.flex.flex-row.items-center.mt-6.max-w-3xl.mx-auto.page-api-block\\:ml-0",
        // 移除 cookie 彈窗相關元素
        "[data-testid*='cookie']",
        "[class*='cookie']",
        "[id*='cookie']",
        ".gdpr-banner",
        ".cookie-banner",
        ".cookie-consent"
      ];

      elementsToRemove.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (element) {
            element.style.display = "none";
          }
        });
      });
    });

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      scale: 1,
      preferCSSPageSize: true,
    });

    console.log(`✅ PDF saved: ${path.basename(outputPath)}`);
  } catch (error) {
    console.error(`❌ Failed to create PDF: ${url}`, error.message);
  }
}

// URL分類函數（保持原始路徑結構）
function categorizeUrl(url) {
  const parts = url.split("/");
  
  if (parts.length <= 3) {
    return "home";
  }
  
  if (parts.length === 4) {
    return parts[3];
  }
  
  if (parts.length >= 5) {
    return parts[4];
  }
  
  return "miscellaneous";
}

// 獲取所有PDF檔案
function getAllPdfFiles(directory) {
  const files = [];
  
  function searchDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        searchDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.pdf')) {
        const match = entry.name.match(/page_(\d+)\.pdf/);
        if (match) {
          const pageNumber = parseInt(match[1]);
          const category = path.basename(path.dirname(fullPath));
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

// 創建目錄頁
async function createTableOfContents(mergedPdf, sections, websiteTitle) {
  const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await mergedPdf.embedFont(StandardFonts.Helvetica);
  
  const page = mergedPdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  
  let yPosition = height - 100;
  
  // 動態標題
  page.drawText(`${websiteTitle} Complete Documentation`, {
    x: 50,
    y: yPosition,
    size: 24,
    font: font,
    color: rgb(0, 0, 0)
  });
  
  yPosition -= 30;
  page.drawText('Table of Contents', {
    x: 50,
    y: yPosition,
    size: 18,
    font: font,
    color: rgb(0, 0, 0)
  });
  
  yPosition -= 40;
  
  // 添加章節
  for (const [sectionName, pageNum] of sections) {
    if (yPosition < 50) {
      const newPage = mergedPdf.addPage([595.28, 841.89]);
      yPosition = height - 100;
    }
    
    page.drawText(sectionName, {
      x: 50,
      y: yPosition,
      size: 12,
      font: regularFont,
      color: rgb(0, 0, 0)
    });
    
    page.drawText(`Page ${pageNum}`, {
      x: width - 100,
      y: yPosition,
      size: 12,
      font: regularFont,
      color: rgb(0, 0, 0)
    });
    
    yPosition -= 25;
  }
  
  return mergedPdf;
}

// 合併PDF檔案
async function mergePdfs(sourceDir, outputDir, websiteTitle) {
  console.log('\n📖 Starting PDF merge process...');
  
  const pdfFiles = getAllPdfFiles(sourceDir);
  
  if (pdfFiles.length === 0) {
    throw new Error('No PDF files found');
  }
  
  console.log(`📄 Found ${pdfFiles.length} PDF files`);
  
  const mergedPdf = await PDFDocument.create();
  
  // 動態設定文檔屬性
  mergedPdf.setTitle(`${websiteTitle} Complete Documentation`);
  mergedPdf.setAuthor(websiteTitle);
  mergedPdf.setCreator('GitBook PDF Converter');
  mergedPdf.setProducer('pdf-lib');
  
  // 按類別分組檔案
  const filesByCategory = {};
  pdfFiles.forEach(file => {
    if (!filesByCategory[file.category]) {
      filesByCategory[file.category] = [];
    }
    filesByCategory[file.category].push(file);
  });
  
  // 準備目錄資訊
  const tableOfContents = [];
  let currentPageNumber = 2; // 第一頁是目錄
  
  // 按類別字母順序處理檔案（更通用的排序）
  const sortedCategories = Object.keys(filesByCategory).sort();
  
  for (const category of sortedCategories) {
    const files = filesByCategory[category];
    console.log(`📝 Processing category: ${category}`);
    
    // 自動格式化類別名稱（將連字符轉為空格，首字母大寫）
    const displayName = category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    tableOfContents.push([displayName, currentPageNumber]);
    
    // 添加該類別的所有檔案
    for (const file of files) {
      try {
        const pdfBuffer = fs.readFileSync(file.path);
        const pdf = await PDFDocument.load(pdfBuffer);
        const pageIndices = pdf.getPageIndices();
        const pages = await mergedPdf.copyPages(pdf, pageIndices);
        
        pages.forEach((page) => {
          mergedPdf.addPage(page);
        });
        
        currentPageNumber += pages.length;
      } catch (error) {
        console.error(`❌ Error processing file ${file.fileName}:`, error.message);
      }
    }
  }
  
  // 插入目錄頁到開頭
  console.log('📋 Creating table of contents...');
  await createTableOfContents(mergedPdf, tableOfContents, websiteTitle);
  
  // 保存合併後的PDF
  const mergedFileName = 'Complete_Documentation.pdf';
  const mergedFilePath = path.join(outputDir, mergedFileName);
  const pdfBytes = await mergedPdf.save();
  fs.writeFileSync(mergedFilePath, pdfBytes);
  
  console.log(`✅ Merged PDF saved: ${mergedFilePath}`);
  console.log(`📊 Total pages: ${mergedPdf.getPageCount()}`);
  console.log(`📊 File size: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);
  
  return mergedFilePath;
}

// 複製檔案到目標目錄
function copyDirectory(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  
  const entries = fs.readdirSync(source, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

// 主要工作流程
async function improvedWorkflow() {
  console.log('🚀 Starting improved workflow...\n');
  
  try {
    // 步驟1：獲取GitBook標題
    console.log('📖 Getting website title...');
    const websiteTitle = await getWebsiteTitle();
    console.log(`📝 Website title: ${websiteTitle}`);
    
    // 步驟2：設定目錄結構
    const tempDir = "./temp_pdfs";
    const finalDir = "./pdfs";
    const projectDir = path.join(finalDir, websiteTitle);
    
    console.log('📁 Setting up directories...');
    
    // 清理並創建臨時目錄
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir);
    
    // 創建最終目錄結構
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir);
    }
    
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    
    // 步驟3：獲取sitemap
    console.log('🔍 Fetching sitemap...');
    const sitemapUrl = `${URL_GITBOOK}/sitemap.xml`;
    const urls = await fetchSitemap(sitemapUrl);
    
    if (!urls || urls.length === 0) {
      throw new Error('Unable to fetch sitemap or sitemap is empty');
    }
    
    console.log(`📄 Found ${urls.length} pages`);
    
    // 步驟4：下載所有頁面為PDF
    console.log('\n⬇️ Downloading pages as PDFs...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    let pageCounter = 1;
    
    for (const url of urls) {
      const category = categorizeUrl(url);
      const categoryDir = path.join(tempDir, category);
      
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }
      
      const pdfFileName = `page_${pageCounter}.pdf`;
      const pdfPath = path.join(categoryDir, pdfFileName);
      
      console.log(`📄 Downloading page ${pageCounter}/${urls.length}: ${url.split('/').pop() || 'home'}`);
      await takeFullPagePdf(page, url, pdfPath);
      
      pageCounter++;
    }
    
    await browser.close();
    
    // 步驟5：合併PDF
    const mergedPdfPath = await mergePdfs(tempDir, projectDir, websiteTitle);
    
    // 步驟6：複製個別PDF檔案到專案目錄
    console.log('\n📁 Copying individual PDFs...');
    const individualPdfsDir = path.join(projectDir, 'individual_pdfs');
    copyDirectory(tempDir, individualPdfsDir);
    
    // 步驟7：清理臨時檔案
    console.log('\n🧹 Cleaning up temporary files...');
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    // 完成報告
    console.log('\n🎉 Workflow completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📁 Project folder: ${projectDir}`);
    console.log(`📄 Merged PDF: ${path.basename(mergedPdfPath)}`);
    console.log(`📂 Individual PDFs: ${individualPdfsDir}`);
    console.log(`📊 Total pages downloaded: ${urls.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Workflow failed:', error.message);
    
    // 清理臨時檔案（即使出錯也要清理）
    const tempDir = "./temp_pdfs";
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    throw error;
  }
}

// 執行改良版工作流程
improvedWorkflow().catch(console.error); 