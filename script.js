const ui = {
    body: document.body,
    sidebar: document.getElementById('sidebar'),
    toggleExplorerBtn: document.getElementById('toggle-explorer'),
    collapseSidebarBtn: document.getElementById('collapse-sidebar'),
    treeContainer: document.getElementById('file-tree'),
    editorTabsContainer: document.getElementById('editor-tabs'),
    folderInput: document.getElementById('folder-input'),
    zipInput: document.getElementById('zip-input'),
    runBtn: document.getElementById('run-btn-activity'),
    clearBtn: document.getElementById('clear-btn'),
    previewView: document.getElementById('preview-view'),
    previewIframe: document.getElementById('preview-iframe'),
    backToEditorBtn: document.getElementById('back-to-editor-btn'),
    desktopViewBtn: document.getElementById('desktop-view-btn'),
    mobileViewBtn: document.getElementById('mobile-view-btn'),
};
const state = { files: {}, assetUrls: {}, currentPath: null, activeAssetMap: {} };
const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {mode: 'htmlmixed', theme: 'dracula', lineNumbers: true, autoCloseBrackets: true, viewportMargin: Infinity});

function debounce(func, delay) {let timeout; return function(...args) {clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay);};}
const isBinaryFile = (name = '') => /\.(jpe?g|png|gif|svg|webp|ico|bmp)$/i.test(name);
const isCodeFile = (name = '') => /\.(html?|css|js)$/i.test(name);
function showPreview() { ui.body.classList.add('show-preview'); }
function showEditor() { ui.body.classList.remove('show-preview'); }

async function processFiles(fileList) {
    clearAll();
    for (const file of fileList) { const name = file.webkitRelativePath || file.name; if (!name) continue; const binary = isBinaryFile(name); if (binary) { state.assetUrls[name] = URL.createObjectURL(file); state.files[name] = { file, text: undefined, isBinary: true }; } else { state.files[name] = { file, text: await file.text(), isBinary: false }; } }
    await postImportSetup();
}
async function importZip(file) {
    clearAll();
    const zip = await JSZip.loadAsync(file);
    for (const name of Object.keys(zip.files)) { const zipEntry = zip.files[name]; if (zipEntry.dir) continue; const binary = isBinaryFile(name); if (binary) { const blob = await zipEntry.async('blob'); state.assetUrls[name] = URL.createObjectURL(blob); state.files[name] = { file: null, text: undefined, isBinary: true }; } else { const text = await zipEntry.async('text'); state.files[name] = { file: null, text, isBinary: false }; } }
    await postImportSetup();
}
async function postImportSetup() {
    ensureDefaultFiles();
    renderTree();
    const firstCode = Object.keys(state.files).find(k => k.endsWith('index.html')) || Object.keys(state.files).filter(isCodeFile)[0];
    await openFile(firstCode);
    runPreview();
}

// FUNGSI runPreview DENGAN PERBAIKAN RESPONSIF
function runPreview() {
    Object.values(state.activeAssetMap).forEach(URL.revokeObjectURL);
    state.activeAssetMap = {};
    const indexKey = Object.keys(state.files).find(k => k.endsWith('index.html'));
    if (!indexKey) return;
    let html = state.files[indexKey].text || '';

    // PERBAIKAN KUNCI: Suntikkan <meta name="viewport"> jika belum ada, dengan cara yang aman
    if (!html.match(/<meta\s+name=["']viewport["']/i)) {
        const viewportTag = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
        if (html.match(/<head>/i)) {
            html = html.replace(/<head>/i, `<head>\n    ${viewportTag}`);
        } else {
            // Fallback jika tidak ada tag <head>, tambahkan di awal
            html = `<html><head>${viewportTag}</head><body>${html}</body></html>`;
        }
    }

    const getMimeType = (path) => { if (path.endsWith('.css')) return 'text/css'; if (path.endsWith('.js')) return 'application/javascript'; return 'text/plain'; };
    for (const path in state.files) {
        const fileData = state.files[path];
        if (!fileData.isBinary && typeof fileData.text === 'string') {
            const mimeType = getMimeType(path);
            const blob = new Blob([fileData.text], { type: mimeType });
            state.activeAssetMap[path] = URL.createObjectURL(blob);
        }
    }
    Object.assign(state.activeAssetMap, state.assetUrls);
    const pathReplacer = (match, attribute, pathValue) => {
        if (!pathValue || pathValue.startsWith('http') || pathValue.startsWith('data:') || pathValue.startsWith('//')) return match;
        const cleanPathValue = pathValue.replace(/^\.\//, ''); let matchedAssetKey = null;
        for (const assetKey in state.activeAssetMap) {
            if (assetKey.endsWith(cleanPathValue)) {
                const precedingCharIndex = assetKey.length - cleanPathValue.length - 1;
                if (precedingCharIndex < 0 || assetKey[precedingCharIndex] === '/') { matchedAssetKey = assetKey; break; }
            }
        }
        if (matchedAssetKey) return `${attribute}="${state.activeAssetMap[matchedAssetKey]}"`;
        return match;
    };
    html = html.replace(/(src|href)=["']([^"']+)["']/g, pathReplacer);
    const finalBlob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(finalBlob);
    state.activeAssetMap['__main_html__'] = url;
    ui.previewIframe.src = url;
}

// Sisa script.js tidak berubah...
ui.runBtn.addEventListener('click', showPreview);
ui.backToEditorBtn.addEventListener('click', showEditor);
ui.desktopViewBtn.addEventListener('click', () => { ui.previewView.classList.replace('view-mobile', 'view-desktop'); ui.desktopViewBtn.classList.add('active'); ui.mobileViewBtn.classList.remove('active'); });
ui.mobileViewBtn.addEventListener('click', () => { ui.previewView.classList.replace('view-desktop', 'view-mobile'); ui.mobileViewBtn.classList.add('active'); ui.desktopViewBtn.classList.remove('active'); });
editor.on('change', debounce(() => {
    if (state.currentPath && state.files[state.currentPath]) {
        state.files[state.currentPath].text = editor.getValue();
    }
    runPreview();
}, 500));
ui.toggleExplorerBtn.addEventListener('click', () => ui.sidebar.classList.toggle('collapsed'));
ui.collapseSidebarBtn.addEventListener('click', () => ui.sidebar.classList.toggle('collapsed'));
ui.folderInput.onchange = e => { if(e.target.files.length) processFiles(e.target.files); e.target.value = ''; };
ui.zipInput.onchange = e => { if(e.target.files[0]) importZip(e.target.files[0]); e.target.value = ''; };
ui.clearBtn.onclick = clearAll;
function clearAll(){Object.values(state.assetUrls).forEach(URL.revokeObjectURL);Object.values(state.activeAssetMap).forEach(URL.revokeObjectURL);Object.assign(state,{files:{},assetUrls:{},currentPath:null,activeAssetMap:{}});renderTabs();renderTree();editor.setValue('// Editor kosong');ui.previewIframe.src='about:blank'}
async function openFile(path){if(!path||!state.files[path]||path===state.currentPath||isBinaryFile(path))return;state.currentPath=path;editor.setValue(state.files[path].text??'');const getMode=p=>{if(p.endsWith('.css'))return'css';if(p.endsWith('.js'))return'javascript';return'htmlmixed'};editor.setOption('mode',getMode(path));renderTabs();setTimeout(()=>editor.refresh(),50)}
function renderTabs(){ui.editorTabsContainer.innerHTML='';const codeFiles=Object.keys(state.files).filter(isCodeFile).sort((a,b)=>{const o={html:1,css:2,js:3};return(o[a.split('.').pop()]||99)-(o[b.split('.').pop()]||99)});codeFiles.forEach(path=>{const btn=document.createElement('button');btn.className=`btn ${path===state.currentPath?'active':''}`;btn.onclick=()=>openFile(path);const ext=path.split('.').pop();let i='fa-regular fa-file-code';if(ext==='html')i='fa-brands fa-html5';if(ext==='css')i='fa-brands fa-css3-alt';if(ext==='js')i='fa-brands fa-js';const filename=path.split('/').pop();btn.innerHTML=`<i class="${i}"></i> <span class="filename">${filename}</span> <span class="close-btn">&times;</span>`;btn.querySelector('.close-btn').onclick=(e)=>{e.stopPropagation();console.log("Fungsi close belum diimplementasikan untuk:",path)};ui.editorTabsContainer.appendChild(btn)})}
function renderTree(){const filePaths=Object.keys(state.files);ui.treeContainer.innerHTML=filePaths.length?'':'(kosong)';if(!filePaths.length)return;const tree={};filePaths.forEach(path=>{let current=tree;path.split('/').forEach((part,i,arr)=>{current[part]=current[part]||{};if(i===arr.length-1)current[part].__path=path;current=current[part]})});function createHtml(node){const ul=document.createElement('ul');const keys=Object.keys(node).sort((a,b)=>(node[a].__path?1:-1)-(node[b].__path?1:-1)||a.localeCompare(b));keys.forEach(key=>{if(key==='__path')return;const li=document.createElement('li');const data=node[key];if(data.__path){const ext=key.split('.').pop();let icon=isBinaryFile(key)?'fa-image':'fa-file-code';li.innerHTML=`<div class="tree-item" data-path="${data.__path}"><i class="fa-regular ${icon}"></i> <span>${key}</span></div>`;li.querySelector('.tree-item').onclick=()=>{openFile(data.__path)}}else{const folderDiv=document.createElement('div');folderDiv.className='tree-item';folderDiv.innerHTML=`<span class="folder-toggle"><i class="fa-solid fa-chevron-right"></i></span><span>${key}</span>`;const nestedUl=createHtml(data);nestedUl.classList.add('nested','collapsed');li.append(folderDiv,nestedUl);folderDiv.onclick=()=>{folderDiv.querySelector('.folder-toggle').classList.toggle('expanded');nestedUl.classList.toggle('collapsed')}}ul.appendChild(li)});return ul}ui.treeContainer.appendChild(createHtml(tree))}
function ensureDefaultFiles(){if(Object.keys(state.files).length>0)return;state.files['index.html']={text:'<h1>Selamat Datang!</h1>\n<p>Klik <i class="fa-solid fa-play"></i> untuk preview.</p>\n<link rel="stylesheet" href="style.css">\n<script src="script.js"></script>',isBinary:false};state.files['style.css']={text:'body { font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #f0f8ff; }',isBinary:false};state.files['script.js']={text:'console.log("Selamat datang!");',isBinary:false}}
(async function init(){await postImportSetup()})();
