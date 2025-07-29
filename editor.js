document.addEventListener('DOMContentLoaded', function() {
  const editor = document.getElementById('editor');
  const imageFileInput = document.getElementById('image-file-input');
  
  // 加载上次保存的内容
  chrome.storage.local.get(['editorContent'], function(result) {
    if (result.editorContent) {
      editor.value = result.editorContent;
    }
  });
  
  // 保存编辑器内容
  editor.addEventListener('input', function() {
    chrome.storage.local.set({editorContent: editor.value});
    
    // 如果在预览模式，实时更新预览
    if (isPreviewMode) {
      updatePreview();
    }
  });
  
  // Markdown标记按钮
  document.getElementById('btn-h1').addEventListener('click', function() {
    insertMarkdown('# ', '');
  });
  
  document.getElementById('btn-h2').addEventListener('click', function() {
    insertMarkdown('## ', '');
  });
  
  document.getElementById('btn-h3').addEventListener('click', function() {
    insertMarkdown('### ', '');
  });
  
  document.getElementById('btn-bold').addEventListener('click', function() {
    insertMarkdown('**', '**');
  });
  
  document.getElementById('btn-italic').addEventListener('click', function() {
    insertMarkdown('*', '*');
  });
  
  document.getElementById('btn-code').addEventListener('click', function() {
    insertMarkdown('`', '`');
  });
  
  document.getElementById('btn-codeblock').addEventListener('click', function() {
    insertMarkdown('```\n', '\n```');
  });
  
  document.getElementById('btn-quote').addEventListener('click', function() {
    insertMarkdown('> ', '');
  });
  
  document.getElementById('btn-list').addEventListener('click', function() {
    insertMarkdown('- ', '');
  });
  
  document.getElementById('btn-checklist').addEventListener('click', function() {
    insertMarkdown('- [ ] ', '');
  });
  
  // 图片按钮
  document.getElementById('btn-image').addEventListener('click', function() {
    imageFileInput.click();
  });
  
  // 图片文件选择
  imageFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      insertImageFromFile(file);
    }
    // 清空input，允许重复选择同一文件
    e.target.value = '';
  });
  
  // 预览按钮
  document.getElementById('btn-preview').addEventListener('click', function() {
    togglePreview();
  });
  
  // 导出按钮
  document.getElementById('btn-export').addEventListener('click', function() {
    exportMarkdown();
  });
  
  // 在光标位置插入Markdown标记
  function insertMarkdown(prefix, suffix) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    const replacement = prefix + selectedText + suffix;
    
    editor.value = editor.value.substring(0, start) + replacement + editor.value.substring(end);
    editor.focus();
    editor.selectionStart = start + prefix.length;
    editor.selectionEnd = start + prefix.length + selectedText.length;
    
    // 更新存储
    chrome.storage.local.set({editorContent: editor.value});
  }
  
  // 导出Markdown文件
  function exportMarkdown() {
    if (!editor.value.trim()) {
      alert('编辑器中没有内容可导出！');
      return;
    }
    
    const blob = new Blob([editor.value], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    
    // 提取第一行作为文件名（如果是标题）
    let fileName = 'notes.md';
    const firstLine = editor.value.split('\n')[0].trim();
    if (firstLine.startsWith('#')) {
      fileName = firstLine.replace(/^#+\s*/, '').trim() + '.md';
    }
    
    downloadLink.download = fileName;
    downloadLink.click();
    
    URL.revokeObjectURL(url);
  }
  
  // 预览功能
  let isPreviewMode = false;
  const previewDiv = document.getElementById('preview');
  
  function togglePreview() {
    isPreviewMode = !isPreviewMode;
    const previewBtn = document.getElementById('btn-preview');
    
    if (isPreviewMode) {
      // 显示预览
      editor.style.display = 'none';
      previewDiv.style.display = 'block';
      previewBtn.textContent = '编辑';
      previewBtn.style.backgroundColor = '#4285f4';
      previewBtn.style.color = 'white';
      updatePreview();
    } else {
      // 显示编辑器
      editor.style.display = 'block';
      previewDiv.style.display = 'none';
      previewBtn.textContent = '预览';
      previewBtn.style.backgroundColor = '#e0e0e0';
      previewBtn.style.color = 'black';
    }
  }
  
  function updatePreview() {
    if (typeof marked !== 'undefined') {
      previewDiv.innerHTML = marked.parse(editor.value);
      
      // 为预览中的图片添加点击放大功能
      const images = previewDiv.querySelectorAll('img');
      images.forEach(img => {
        img.style.cursor = 'pointer';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.addEventListener('click', function() {
          showImageModal(img.src, img.alt);
        });
      });
    } else {
      // 简单的文本处理
      previewDiv.innerHTML = '<p>Markdown解析器未加载，显示原始文本：</p><pre>' + editor.value + '</pre>';
    }
  }
  
  // 图片模态框显示
  function showImageModal(src, alt) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
    `;
    
    modal.appendChild(img);
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function() {
      document.body.removeChild(modal);
    });
  }
  
  // 图片处理功能
  async function insertImageFromFile(file) {
    try {
      // 压缩并转换为data URL
      const dataUrl = await compressImage(file);
      
      // 生成唯一的图片名称
      const fileName = generateImageName(file.name);
      
      // 存储图片数据
      await storeImageData(fileName, dataUrl);
      
      // 插入Markdown图片语法
      const imageMarkdown = `![${fileName}](${dataUrl})`;
      insertTextAtCursor(imageMarkdown);
      
    } catch (error) {
      console.error('插入图片失败:', error);
      alert('插入图片失败，请重试');
    }
  }
  
  // 压缩图片
  function compressImage(file, maxWidth = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = function() {
        // 计算压缩后的尺寸
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        // 设置画布尺寸
        canvas.width = width;
        canvas.height = height;
        
        // 绘制压缩后的图片
        ctx.drawImage(img, 0, 0, width, height);
        
        // 转换为data URL
        const dataUrl = canvas.toDataURL(file.type, quality);
        resolve(dataUrl);
      };
      
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = URL.createObjectURL(file);
    });
  }
  
  // 生成图片名称
  function generateImageName(originalName) {
    const timestamp = Date.now();
    const extension = originalName.split('.').pop();
    return `image_${timestamp}.${extension}`;
  }
  
  // 存储图片数据
  async function storeImageData(fileName, dataUrl) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['imageData'], function(result) {
        const imageData = result.imageData || {};
        imageData[fileName] = dataUrl;
        
        chrome.storage.local.set({ imageData }, function() {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    });
  }
  
  // 在光标位置插入文本
  function insertTextAtCursor(text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    
    editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
    editor.focus();
    
    // 将光标移动到插入文本之后
    const newCursorPos = start + text.length;
    editor.selectionStart = newCursorPos;
    editor.selectionEnd = newCursorPos;
    
    // 更新存储
    chrome.storage.local.set({editorContent: editor.value});
  }
  
  // 添加粘贴事件监听
  editor.addEventListener('paste', function(e) {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // 检查是否为图片
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // 阻止默认粘贴行为
        
        const file = item.getAsFile();
        if (file) {
          insertImageFromFile(file);
        }
        break;
      }
    }
  });
  
  // 添加拖拽事件监听
  editor.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    editor.style.backgroundColor = '#f0f8ff';
  });
  
  editor.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    editor.style.backgroundColor = '';
  });
  
  editor.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    editor.style.backgroundColor = '';
    
    const files = e.dataTransfer.files;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (file.type.startsWith('image/')) {
        // 设置光标位置到拖拽位置
        const rect = editor.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 计算文本位置（简化处理，设置到末尾）
        editor.focus();
        editor.setSelectionRange(editor.selectionStart, editor.selectionStart);
        
        insertImageFromFile(file);
        break; // 只处理第一个图片文件
      }
    }
  });
}); 