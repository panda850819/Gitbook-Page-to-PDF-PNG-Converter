const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// 定義文檔結構和章節
const documentStructure = {
  "開始了解 Usual": ["start-here"],
  "Usual 產品": ["usual-products"],
  "資源與生態系統": ["resources-and-ecosystem"],
  "其他頁面": ["root", "unknown"]
};

// 章節標題映射
const sectionTitles = {
  "root": "首頁",
  "start-here": "開始了解 Usual",
  "why-usual": "為什麼選擇 Usual",
  "usual-model": "Usual 模式",
  "faq": "常見問題",
  "glossary": "詞彙表",
  "usual-products": "Usual 產品",
  "usd0-stablecoin": "USD0 穩定幣",
  "usd0-liquid-staking-token": "USD0 流動性質押代幣",
  "eth0-synthetic": "ETH0 合成資產",
  "usual-governance-token": "Usual 治理代幣",
  "usual-stability-loans-usl": "Usual 穩定性貸款",
  "usual-vaults": "Usual 金庫",
  "resources-and-ecosystem": "資源與生態系統",
  "whitepaper": "白皮書",
  "legal-documentation": "法律文件",
  "analytics": "分析",
  "usd0-risk-policy": "USD0 風險政策",
  "usual-backers": "Usual 支持者",
  "media-assets": "媒體資源"
};

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
  page.drawText('Usual Money 完整文檔', {
    x: 50,
    y: yPosition,
    size: 24,
    font: font,
    color: rgb(0, 0, 0)
  });
  
  yPosition -= 30;
  page.drawText('目錄', {
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
      // 如果空間不夠，添加新頁面
      const newPage = mergedPdf.addPage([595.28, 841.89]);
      yPosition = height - 100;
      page = newPage;
    }
    
    page.drawText(chapterTitle, {
      x: 50,
      y: yPosition,
      size: 12,
      font: regularFont,
      color: rgb(0, 0, 0)
    });
    
    page.drawText(`第 ${pageNum} 頁`, {
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

// 合併 PDF 文件（增強版）
async function mergePdfsEnhanced() {
  try {
    console.log('開始創建增強版 PDF 電子書...');
    
    const pdfFiles = getAllPdfFiles('./pdfs');
    
    if (pdfFiles.length === 0) {
      console.log('沒有找到 PDF 文件');
      return;
    }
    
    console.log(`找到 ${pdfFiles.length} 個 PDF 文件`);
    
    // 創建新的 PDF 文檔
    const mergedPdf = await PDFDocument.create();
    
    // 設置文檔元數據
    mergedPdf.setTitle('Usual Money 完整文檔');
    mergedPdf.setAuthor('Usual Money');
    mergedPdf.setCreator('GitBook PDF Converter Enhanced');
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
    
    // 按結構順序處理章節
    for (const [chapterTitle, categories] of Object.entries(documentStructure)) {
      let chapterAdded = false;
      
      for (const category of categories) {
        if (filesByCategory[category] && filesByCategory[category].length > 0) {
          if (!chapterAdded) {
            tableOfContents.push([chapterTitle, currentPageNumber]);
            console.log(`添加章節分隔頁: ${chapterTitle}`);
            await createSectionDivider(mergedPdf, chapterTitle);
            currentPageNumber++;
            chapterAdded = true;
          }
          
          const sectionTitle = sectionTitles[category] || category;
          tableOfContents.push([`  ${sectionTitle}`, currentPageNumber]);
          
          // 添加該類別的所有文件
          for (const file of filesByCategory[category]) {
            console.log(`正在處理 ${file.fileName} (${file.category})`);
            
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
              console.error(`處理文件 ${file.fileName} 時出錯:`, error.message);
            }
          }
        }
      }
    }
    
    // 在開頭插入目錄頁
    console.log('創建目錄頁...');
    await createTableOfContents(mergedPdf, tableOfContents);
    
    // 保存合併後的 PDF
    const outputPath = './Usual_Money_Complete_Book.pdf';
    const pdfBytes = await mergedPdf.save();
    
    fs.writeFileSync(outputPath, pdfBytes);
    
    console.log(`✅ 增強版電子書創建完成！`);
    console.log(`📄 總頁面數: ${mergedPdf.getPageCount()}`);
    console.log(`📁 輸出文件: ${outputPath}`);
    console.log(`📊 文件大小: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('創建增強版電子書時出錯:', error);
  }
}

// 運行增強版合併腳本
mergePdfsEnhanced().catch(console.error); 