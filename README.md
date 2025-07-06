![Gitbook to PDF Converter](https://i.suar.me/7GV8m)

# GitBook Page to PDF & PNG Converter

## ✨ Features

- 🚀 **Universal Compatibility**: Works with any GitBook website
- 🍪 **Smart Cookie Handling**: Automatically handles cookie consent popups
- 📖 **PDF Merging**: Combines all pages into a single complete documentation
- 📁 **Organized Structure**: Creates well-organized folder structure with individual and merged PDFs
- 🎯 **Auto-categorization**: Automatically categorizes pages based on URL structure
- 🔧 **No Hardcoded Settings**: Fully generic - no need to modify code for different sites

---

# 🚀 How to Use This Project

## 1. Setup

Clone the project and don't forget to give it a ⭐!

```bash
git clone https://github.com/your-username/Gitbook-Page-to-PDF-PNG-Converter.git
cd Gitbook-Page-to-PDF-PNG-Converter
npm install
```

## 2. Configure Your GitBook URL

Edit the `URL_GITBOOK` constant in the script you want to use:

**For improved workflow (`src/improved_workflow.js`):**
```javascript
const URL_GITBOOK = "https://your-gitbook-site.com";
```

**For complete workflow (`src/complete_workflow.js`):**
```javascript
const URL_GITBOOK = "https://your-gitbook-site.com";
```

## 3. Choose Your Workflow

### 🌟 **Recommended: Improved Workflow**
The most comprehensive solution that creates organized project folders:

```bash
node src/improved_workflow.js
```

**Output Structure:**
```
pdfs/
├── Your_Site_Name/
│   ├── Complete_Documentation.pdf      # Merged PDF with table of contents
│   └── individual_pdfs/                # All individual PDF files
│       ├── category1/
│       │   ├── page_1.pdf
│       │   └── page_2.pdf
│       └── category2/
│           ├── page_3.pdf
│           └── page_4.pdf
```

### 📚 **Complete Workflow**
Alternative workflow with different organization:

```bash
node src/complete_workflow.js
```

### 🔧 **Basic Individual Scripts**
For basic PDF or PNG generation:

```bash
# Generate PDFs only
node src/index.js

# Generate PNG images only
node src/index_png.js
```

**Basic Output Structure:**
```
menu_data/
├── intro/
│   ├── page1.png
│   ├── page1.pdf
│   ├── page2.png
│   └── page2.pdf
└── another_menu/
    ├── page3.png
    ├── page3.pdf
    ├── page4.png
    └── page4.pdf
```

---

## 🎯 What Makes This Special

### 🍪 **Automatic Cookie Handling**
The script automatically:
- Detects cookie consent popups
- Clicks "Accept" buttons automatically
- Handles multiple popup formats
- Continues seamlessly if no popups are found

### 📖 **Smart PDF Merging**
- Creates a complete documentation PDF with table of contents
- Automatically categorizes pages based on URL structure
- Formats category names nicely (e.g., "user-guide" → "User Guide")
- Maintains logical page order

### 🔧 **Universal Compatibility**
- No hardcoded website-specific configurations
- Works with any GitBook site out of the box
- Automatically adapts to different site structures
- Dynamic title extraction from website

### 📁 **Organized Output**
- Creates project folders named after the website
- Preserves individual PDFs for reference
- Generates comprehensive merged documentation
- Clean, professional file organization

---

## 🛠️ Technical Details

### Dependencies
- `puppeteer` - Web scraping and PDF generation
- `axios` - HTTP requests for sitemap fetching
- `xml2js` - XML parsing for sitemaps
- `pdf-lib` - PDF manipulation and merging
- `fs` & `path` - File system operations

### Supported Features
- ✅ Sitemap XML parsing (including sitemap indexes)
- ✅ High-quality PDF generation with images
- ✅ PNG image generation
- ✅ Cookie consent handling
- ✅ Navigation element removal
- ✅ Automatic categorization
- ✅ PDF merging with table of contents
- ✅ Dynamic title extraction

---

## 📋 Requirements

- Node.js 14+ 
- npm or yarn
- Internet connection for downloading pages

---

## 💡 Feel Free to Contribute

Feel free to fork this project and use it however you'd like!
Contributions are always welcome. If you have improvements or suggestions, open a pull request!

### 🎯 Future Enhancements
- Support for more documentation platforms
- Custom styling options for merged PDFs
- Progress bars for large sites
- Resume functionality for interrupted downloads
- Export to other formats (EPUB, etc.)

---

## 🐛 Troubleshooting

**Common Issues:**
- **404 Errors**: Make sure you're using the root domain URL (e.g., `https://docs.example.com` not `https://docs.example.com/page`)
- **Cookie Popups**: The script handles most popups automatically, but some sites may need manual intervention
- **Large Sites**: For sites with many pages, the process may take several minutes

---

Thanks for using this script! 😊
Happy converting!

**Star ⭐ this repo if you find it useful!**
