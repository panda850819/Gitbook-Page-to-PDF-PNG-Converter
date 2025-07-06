const puppeteer = require("puppeteer");
const axios = require("axios");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const URL_GITBOOK = "";

// 通用文檔轉換器，無硬編碼結構

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

    // Remove elements by setting display to 'none'
    await page.evaluate(() => {
      // Remove the AppBar element
      const appBar = document.querySelector("div.appBarClassName");
      if (appBar) {
        appBar.style.display = "none";
      }

      // Remove the element with class "scroll-nojump"
      const scrollNoJump = document.querySelector(".scroll-nojump");
      if (scrollNoJump) {
        scrollNoJump.style.display = "none";
      }

      // Remove the menu element
      const menu = document.querySelector(
        "aside.relative.group.flex.flex-col.basis-full.bg-light"
      );
      if (menu) {
        menu.style.display = "none";
      }

      // Remove the search button
      const searchButton = document.querySelector(
        "div.flex.md\\:w-56.grow-0.shrink-0.justify-self-end"
      );
      if (searchButton) {
        searchButton.style.display = "none";
      }

      // Remove the next button div
      const nextButton = document.querySelector(
        "div.flex.flex-col.md\\:flex-row.mt-6.gap-2.max-w-3xl.mx-auto.page-api-block\\:ml-0"
      );
      if (nextButton) {
        nextButton.style.display = "none";
      }

      // Remove the "Last updated" info
      const lastUpdatedInfo = document.querySelector(
        "div.flex.flex-row.items-center.mt-6.max-w-3xl.mx-auto.page-api-block\\:ml-0"
      );
      if (lastUpdatedInfo) {
        lastUpdatedInfo.style.display = "none";
      }
    });

    // Convert the page to PDF with high-quality images
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      scale: 1,
      preferCSSPageSize: true,
    });

    console.log(`✅ PDF 已保存: ${path.basename(outputPath)}`);
  } catch (error) {
    console.error(`❌ 無法創建 PDF: ${url}`, error.message);
  }
}

// Function to group URLs based on their categories
function categorizeUrl(url) {
  const parts = url.split("/");
  
  // 處理根域名 URL
  if (parts.length <= 3) {
    return "root";
  }
  
  // 處理只有一個路徑段的 URL
  if (parts.length === 4) {
    return parts[3];
  }
  
  // 處理有多個路徑段的 URL，使用第二個路徑段作為類別
  if (parts.length >= 5) {
    return parts[4];
  }
  
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
async function createTableOfContents(mergedPdf, sections) {
  const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await mergedPdf.embedFont(StandardFonts.Helvetica);
  
  const page = mergedPdf.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();
  
  let yPosition = height - 100;
  
  // 標題
  page.drawText('Usual Money Complete Documentation', {
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
  for (const [chapterTitle, pageNum] of sections) {
    if (yPosition < 50) {
      const newPage = mergedPdf.addPage([595.28, 841.89]);
      yPosition = height - 100;
    }
    
    page.drawText(chapterTitle, {
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

// 創建章節分隔頁
async function createSectionDivider(mergedPdf, sectionTitle) {
  const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
  const page = mergedPdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  
  // 背景色
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: height,
    color: rgb(0.95, 0.95, 0.95)
  });
  
  // 標題
  page.drawText(sectionTitle, {
    x: 50,
    y: height / 2,
    size: 32,
    font: font,
    color: rgb(0, 0, 0)
  });
  
  return mergedPdf;
}

// 合併 PDF 文件
async function mergePdfs(tempDir) {
  console.log('\n📖 開始合併 PDF 文件...');
  
  const pdfFiles = getAllPdfFiles(tempDir);
  
  if (pdfFiles.length === 0) {
    throw new Error('沒有找到 PDF 文件');
  }
  
  console.log(`📄 找到 ${pdfFiles.length} 個 PDF 文件`);
  
  // 創建新的 PDF 文檔
  const mergedPdf = await PDFDocument.create();
  
  // 設置文檔元數據
  mergedPdf.setTitle('Usual Money Complete Documentation');
  mergedPdf.setAuthor('Usual Money');
  mergedPdf.setCreator('GitBook PDF Converter');
  mergedPdf.setProducer('pdf-lib');
  
  // 按類別分組文件
  const filesByCategory = {};
  pdfFiles.forEach(file => {
    if (!filesByCategory[file.category]) {
      filesByCategory[file.category] = [];
    }
    filesByCategory[file.category].push(file);
  });
  
  // 準備目錄信息
  const tableOfContents = [];
  let currentPageNumber = 2; // 從第2頁開始（第1頁是目錄）
  
  // 按類別字母順序處理所有分類（通用方式）
  const sortedCategories = Object.keys(filesByCategory).sort();
  
  for (const category of sortedCategories) {
    if (filesByCategory[category] && filesByCategory[category].length > 0) {
      const files = filesByCategory[category];
      
      // 自動格式化類別名稱
      const displayName = category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      tableOfContents.push([displayName, currentPageNumber]);
      console.log(`📝 添加分類: ${displayName}`);
      
      // 添加該類別的所有文件
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
          console.error(`❌ 處理文件 ${file.fileName} 時出錯:`, error.message);
        }
      }
    }
  }
  
  // 在開頭插入目錄頁
  console.log('📋 創建目錄頁...');
  await createTableOfContents(mergedPdf, tableOfContents);
  
  return mergedPdf;
}

// 清理臨時文件
function cleanupTempFiles(tempDir) {
  console.log('\n🧹 清理臨時文件...');
  
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('✅ 臨時文件已清理');
  }
}

// 主要工作流程
async function completeWorkflow() {
  const tempDir = "./temp_pdfs";
  const finalDir = "./pdfs";
  
  console.log('🚀 開始完整工作流程...\n');
  
  try {
    // 步驟 1: 創建臨時目錄
    console.log('📁 準備工作目錄...');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir);
    
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir);
    }
    
    // 步驟 2: 獲取 sitemap 並下載 PDF
    console.log('🔍 獲取網站地圖...');
    const sitemapUrl = `${URL_GITBOOK}/sitemap.xml`;
    const urls = await fetchSitemap(sitemapUrl);
    
    if (!urls || urls.length === 0) {
      throw new Error('無法獲取網站地圖或網站地圖為空');
    }
    
    console.log(`📄 找到 ${urls.length} 個頁面`);
    
    // 步驟 3: 下載所有頁面的 PDF
    console.log('\n⬇️ 開始下載頁面 PDF...');
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
      
      console.log(`📄 下載頁面 ${pageCounter}/${urls.length}: ${url.split('/').pop() || 'home'}`);
      await takeFullPagePdf(page, url, pdfPath);
      
      pageCounter++;
    }
    
    await browser.close();
    
    // 步驟 4: 合併 PDF
    const mergedPdf = await mergePdfs(tempDir);
    
    // 步驟 5: 保存最終 PDF
    console.log('\n💾 保存最終 PDF...');
    const finalOutputPath = path.join(finalDir, 'Usual_Money_Complete_Documentation.pdf');
    const pdfBytes = await mergedPdf.save();
    fs.writeFileSync(finalOutputPath, pdfBytes);
    
    // 步驟 6: 清理臨時文件
    cleanupTempFiles(tempDir);
    
    // 完成報告
    console.log('\n🎉 工作流程完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📄 總頁面數: ${mergedPdf.getPageCount()}`);
    console.log(`📁 輸出文件: ${finalOutputPath}`);
    console.log(`📊 文件大小: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ 工作流程失敗:', error.message);
    
    // 清理臨時文件（即使出錯也要清理）
    cleanupTempFiles(tempDir);
    
    throw error;
  }
}

// 運行完整工作流程
completeWorkflow().catch(console.error); 