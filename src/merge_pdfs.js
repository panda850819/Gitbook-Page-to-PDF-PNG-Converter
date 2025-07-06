const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// 獲取所有 PDF 文件並按頁面編號排序
function getAllPdfFiles(directory) {
  const files = [];
  
  // 遞歸搜索所有 PDF 文件
  function searchDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        searchDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.pdf')) {
        // 提取頁面編號
        const match = entry.name.match(/page_(\d+)\.pdf/);
        if (match) {
          const pageNumber = parseInt(match[1]);
          files.push({
            path: fullPath,
            pageNumber: pageNumber,
            fileName: entry.name
          });
        }
      }
    }
  }
  
  searchDirectory(directory);
  
  // 按頁面編號排序
  files.sort((a, b) => a.pageNumber - b.pageNumber);
  
  return files;
}

// 合併 PDF 文件
async function mergePdfs() {
  try {
    console.log('開始合併 PDF 文件...');
    
    // 獲取所有 PDF 文件
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
    mergedPdf.setCreator('GitBook PDF Converter');
    mergedPdf.setProducer('pdf-lib');
    
    // 逐個添加 PDF 文件
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      console.log(`正在處理 ${file.fileName} (${i + 1}/${pdfFiles.length})`);
      
      try {
        // 讀取 PDF 文件
        const pdfBuffer = fs.readFileSync(file.path);
        const pdf = await PDFDocument.load(pdfBuffer);
        
        // 獲取所有頁面
        const pageIndices = pdf.getPageIndices();
        
        // 複製頁面到合併的 PDF
        const pages = await mergedPdf.copyPages(pdf, pageIndices);
        
        // 添加頁面
        pages.forEach((page) => {
          mergedPdf.addPage(page);
        });
        
      } catch (error) {
        console.error(`處理文件 ${file.fileName} 時出錯:`, error.message);
      }
    }
    
    // 保存合併後的 PDF
    const outputPath = './Usual_Money_Complete_Documentation.pdf';
    const pdfBytes = await mergedPdf.save();
    
    fs.writeFileSync(outputPath, pdfBytes);
    
    console.log(`✅ 合併完成！`);
    console.log(`📄 總頁面數: ${mergedPdf.getPageCount()}`);
    console.log(`📁 輸出文件: ${outputPath}`);
    console.log(`📊 文件大小: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('合併 PDF 時出錯:', error);
  }
}

// 運行合併腳本
mergePdfs().catch(console.error); 