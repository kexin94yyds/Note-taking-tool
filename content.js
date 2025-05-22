// 创建一个浮动编辑器实例
let editorWrapper = null;
let isEditorVisible = false;
let editorContent = '';

console.log('Content script loaded', window.location.href);

// 在页面加载完成后初始化
window.addEventListener('load', function() {
  console.log('Page loaded, initializing FloatingMD');
  // 从存储中读取上次的内容
  chrome.storage.local.get(['editorContent', 'isVisible'], function(result) {
    console.log('Storage data retrieved:', result);
    editorContent = result.editorContent || '';
    // 如果之前是可见的，则创建并显示编辑器
    if (result.isVisible) {
      console.log('Editor was previously visible, recreating it');
      createEditor();
      showEditor();
    }
  });
  
  // 预加载marked.js
  loadMarkedJS();
});

// 监听窗口大小变化事件，在window.addEventListener('load', function()下方添加
window.addEventListener('resize', function() {
  if (editorWrapper && isEditorVisible) {
    console.log('Window resized, adjusting editor');
    adjustEditorLayout();
  }
});

// 加载marked.js
function loadMarkedJS() {
  if (!window.marked) {
    console.log('Loading marked.js');
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('marked.min.js');
    script.onload = function() {
      console.log('Marked.js loaded successfully');
    };
    script.onerror = function(error) {
      console.error('Failed to load Marked.js:', error);
    };
    document.head.appendChild(script);
  } else {
    console.log('Marked.js already loaded');
  }
}

// 监听来自popup或background的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Message received in content script:', request);
  
  // 响应ping消息，用于检测content script是否已加载
  if (request.action === 'ping') {
    console.log('Ping received, responding');
    sendResponse({status: 'alive'});
    return true;
  }
  
  // 处理主要功能消息
  if (request.action === "toggleEditor") {
    console.log('Toggling editor visibility');
    toggleEditor();
    sendResponse({status: "toggled", visible: isEditorVisible});
  } else if (request.action === "exportMarkdown") {
    console.log('Exporting markdown');
    exportMarkdown();
    sendResponse({status: "exported"});
  } else if (request.action === "clearEditor") {
    console.log('Clearing editor');
    clearEditor();
    sendResponse({status: "cleared"});
  }
  return true;
});

// 创建编辑器DOM元素
function createEditor() {
  console.log('Creating editor');
  if (editorWrapper) {
    console.log('Editor wrapper already exists, not creating again');
    return;
  }
  
  try {
    // 创建编辑器包装器
    editorWrapper = document.createElement('div');
    editorWrapper.id = 'floating-md-editor';
    editorWrapper.className = 'floating-md-editor';
    
    // 立即设置无边框样式
    editorWrapper.style.border = 'none';
    editorWrapper.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
    editorWrapper.style.borderRadius = '5px';
    editorWrapper.style.overflow = 'hidden';
    
    // 设置初始位置和样式 - 更大的尺寸
    editorWrapper.style.position = 'fixed';
    editorWrapper.style.top = '50px';
    editorWrapper.style.right = '50px';
    editorWrapper.style.width = '500px';  // 更宽
    editorWrapper.style.height = '600px'; // 更高
    editorWrapper.style.zIndex = '9999999';
    editorWrapper.style.backgroundColor = '#fff';
    
    // 创建简化版标题栏
    const toolbar = document.createElement('div');
    toolbar.className = 'md-toolbar md-toolbar-minimal';
    toolbar.style.height = '12px';
    toolbar.style.padding = '2px';
    toolbar.style.cursor = 'move'; // 整个顶部区域都可拖动
    toolbar.style.opacity = '0'; // 初始状态隐藏
    toolbar.style.position = 'absolute'; // 使用绝对定位
    toolbar.style.top = '0';
    toolbar.style.left = '0';
    toolbar.style.right = '0';
    toolbar.style.zIndex = '2'; // 确保在编辑区域上方
    toolbar.style.border = 'none';
    toolbar.style.borderBottom = 'none';
    
    // 添加隐藏式关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'md-close md-close-hidden';
    closeBtn.textContent = '×';
    closeBtn.title = '关闭编辑器';
    closeBtn.style.position = 'absolute';
    closeBtn.style.right = '10px';
    closeBtn.style.top = '5px';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.color = '#ff3333';
    closeBtn.style.display = 'none';
    closeBtn.addEventListener('click', hideEditor);
    toolbar.appendChild(closeBtn);
    
    // 添加导出按钮
    const exportBtn = document.createElement('button');
    exportBtn.className = 'md-export';
    exportBtn.textContent = '⬆';
    exportBtn.title = '导出为Markdown';
    exportBtn.style.position = 'absolute';
    exportBtn.style.right = '36px';
    exportBtn.style.top = '5px';
    exportBtn.style.background = 'transparent';
    exportBtn.style.border = 'none';
    exportBtn.style.fontSize = '18px';
    exportBtn.style.fontWeight = 'bold';
    exportBtn.style.color = '#4285f4';
    exportBtn.style.display = 'none';
    exportBtn.addEventListener('click', exportMarkdown);
    toolbar.appendChild(exportBtn);
    
    // 鼠标悬停时显示控制按钮
    toolbar.addEventListener('mouseenter', function() {
      closeBtn.style.display = 'block';
      exportBtn.style.display = 'block';
      toolbar.style.opacity = '1';
      toolbar.style.height = '20px';
      toolbar.style.padding = '4px';
    });
    
    toolbar.addEventListener('mouseleave', function() {
      closeBtn.style.display = 'none';
      exportBtn.style.display = 'none';
      if (!isDragging) {
        toolbar.style.opacity = '0';
        toolbar.style.height = '12px';
        toolbar.style.padding = '2px';
      }
    });
    
    // 创建编辑区域
    const editor = document.createElement('textarea');
    editor.className = 'md-editor';
    editor.placeholder = '在此输入Markdown文本...';
    editor.value = editorContent;
    editor.style.height = '100%'; // 让编辑区域占据整个容器
    editor.style.width = '100%';
    editor.style.padding = '10px';
    editor.style.paddingTop = '24px'; // 为工具栏预留空间
    editor.style.overflowY = 'auto';
    editor.style.display = 'block';
    editor.style.position = 'relative';
    editor.style.zIndex = '1';
    editor.style.border = 'none';
    editor.style.outline = 'none';
    editor.style.backgroundColor = '#fff';
    editor.style.color = '#000';
    editor.style.borderTop = 'none';
    editor.style.borderBottom = 'none';
    editor.style.boxSizing = 'border-box';
    
    // 强制移除所有可能的边框和底部线条
    editor.style.boxShadow = 'none';
    editor.style.webkitBoxShadow = 'none';
    editor.style.mozBoxShadow = 'none';
    editor.style.webkitAppearance = 'none';
    editor.style.appearance = 'none';
    
    // 修复蓝色底线问题
    editor.style.background = 'white';
    editor.style.color = 'black';
    editor.style.webkitTextFillColor = 'black';
    
    // 给编辑器底部添加白色背景遮挡
    const bottomCover = document.createElement('div');
    bottomCover.style.position = 'absolute';
    bottomCover.style.bottom = '0';
    bottomCover.style.left = '0';
    bottomCover.style.right = '0';
    bottomCover.style.height = '1px'; // 足够遮挡底线
    bottomCover.style.backgroundColor = 'white';
    bottomCover.style.zIndex = '2';
    
    // 当鼠标移到顶部区域时显示工具栏
    editor.addEventListener('mousemove', function(e) {
      const rect = editor.getBoundingClientRect();
      // 如果鼠标在顶部30px区域内
      if (e.clientY - rect.top < 30) {
        toolbar.style.opacity = '1';
        toolbar.style.height = '20px';
        toolbar.style.padding = '4px';
      } else if (!toolbar.matches(':hover') && !isDragging) {
        // 如果鼠标不在工具栏上且不是拖动状态，隐藏工具栏
        toolbar.style.opacity = '0';
        toolbar.style.height = '12px';
        toolbar.style.padding = '2px';
      }
    });
    
    editor.addEventListener('input', function() {
      editorContent = this.value;
      saveEditorContent();
    });
    
    // 监听粘贴事件
    editor.addEventListener('paste', function(e) {
      console.log('Text pasted into editor');
      setTimeout(() => {
        adjustEditorSize();
      }, 100);
    });
    
    // 文本框变化和滚动优化
    editor.addEventListener('keydown', function(e) {
      // 当按Tab键时，插入两个空格而不是切换焦点
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        
        // 设置制表符为两个空格
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
        
        // 更新内容
        editorContent = this.value;
        saveEditorContent();
      }
      
      // 自动调整大小
      setTimeout(() => {
        adjustEditorSize();
      }, 0);
    });
    
    // 滚动优化
    editor.addEventListener('scroll', function() {
      // 如果用户滚动到底部，记录此状态
      this.isScrolledToBottom = Math.abs(this.scrollHeight - this.clientHeight - this.scrollTop) < 10;
    });
    
    editorWrapper.appendChild(editor);
    editorWrapper.appendChild(toolbar); // 工具栏放在后面，确保显示在上层
    editorWrapper.appendChild(bottomCover); // 添加底部覆盖层
    
    // 添加到页面
    document.body.appendChild(editorWrapper);
    console.log('Editor created and added to page');
    
    // 实现拖动功能
    implementDrag(toolbar);
    
    // 再次确保加载marked.js
    loadMarkedJS();
    
    // 最后确认一次所有元素无边框
    setTimeout(() => {
      removeAllBorders();
    }, 50);
    
    // 防止页面样式影响编辑器
    addIsolationStyles();
    
  } catch (error) {
    console.error('Error creating editor:', error);
  }
}

// 辅助函数：彻底移除所有边框和底线
function removeAllBorders() {
  if (!editorWrapper) return;
  
  // 递归处理所有子元素
  function processElement(element) {
    if (!element) return;
    
    // 应用无边框样式
    element.style.border = 'none';
    element.style.borderBottom = 'none';
    element.style.outline = 'none';
    element.style.boxShadow = 'none';
    
    // 处理所有子元素
    if (element.children && element.children.length > 0) {
      Array.from(element.children).forEach(child => {
        processElement(child);
      });
    }
  }
  
  // 处理编辑器及所有子元素
  processElement(editorWrapper);
  
  // 特别处理textarea
  const editor = editorWrapper.querySelector('textarea');
  if (editor) {
    editor.style.border = 'none';
    editor.style.borderBottom = 'none';
    editor.style.outline = 'none';
    editor.style.boxShadow = 'none';
    editor.style.backgroundColor = 'white';
    editor.style.webkitAppearance = 'none';
    editor.style.appearance = 'none';
  }
}

// 添加隔离样式，防止页面样式影响编辑器
function addIsolationStyles() {
  // 创建一个样式元素
  const style = document.createElement('style');
  style.textContent = `
    #floating-md-editor, 
    #floating-md-editor * {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }
    
    #floating-md-editor textarea.md-editor {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      background-color: white !important;
      color: black !important;
      -webkit-text-fill-color: black !important;
      -webkit-appearance: none !important;
    }
  `;
  
  document.head.appendChild(style);
}

// 声明一个全局变量，跟踪是否正在拖动
let isDragging = false;

// 实现拖动功能 - 修改为使用整个工具栏
function implementDrag(handle) {
  console.log('Setting up drag functionality');
  let offsetX, offsetY;
  
  handle.addEventListener('mousedown', function(e) {
    isDragging = true;
    offsetX = e.clientX - editorWrapper.getBoundingClientRect().left;
    offsetY = e.clientY - editorWrapper.getBoundingClientRect().top;
    handle.style.cursor = 'grabbing';
    console.log('Started dragging');
    
    // 防止文本选择
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    // 确保编辑器不会被拖出视口
    const newLeft = e.clientX - offsetX;
    const newTop = e.clientY - offsetY;
    
    const maxX = window.innerWidth - editorWrapper.offsetWidth;
    const maxY = window.innerHeight - editorWrapper.offsetHeight;
    
    editorWrapper.style.left = Math.max(0, Math.min(newLeft, maxX)) + 'px';
    editorWrapper.style.top = Math.max(0, Math.min(newTop, maxY)) + 'px';
    
    // 移除right属性，因为我们现在使用left
    editorWrapper.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      console.log('Stopped dragging');
      handle.style.cursor = 'move';
      
      // 拖动结束后，如果鼠标不在工具栏上，则隐藏工具栏
      if (!handle.matches(':hover')) {
        handle.style.opacity = '0';
        handle.style.height = '12px';
        handle.style.padding = '2px';
      }
    }
    isDragging = false;
    
    // 确保边框被移除
    editorWrapper.style.border = 'none';
    editorWrapper.style.outline = 'none';
    const editorElement = editorWrapper.querySelector('.md-editor');
    if (editorElement) {
      editorElement.style.border = 'none';
      editorElement.style.outline = 'none';
    }
  });
}

// 显示编辑器
function showEditor() {
  console.log('Showing editor');
  if (!editorWrapper) {
    console.log('Editor wrapper does not exist, creating it');
    createEditor();
  }
  editorWrapper.style.display = 'block';
  isEditorVisible = true;
  chrome.storage.local.set({isVisible: true});
  adjustEditorLayout();
  console.log('Editor is now visible');
}

// 隐藏编辑器
function hideEditor() {
  console.log('Hiding editor');
  if (editorWrapper) {
    editorWrapper.style.display = 'none';
    console.log('Editor is now hidden');
  } else {
    console.log('Editor wrapper does not exist, nothing to hide');
  }
  isEditorVisible = false;
  chrome.storage.local.set({isVisible: false});
}

// 切换编辑器显示/隐藏
function toggleEditor() {
  console.log('Toggle editor called, current visibility:', isEditorVisible);
  if (isEditorVisible) {
    hideEditor();
  } else {
    showEditor();
  }
}

// 保存编辑器内容
function saveEditorContent() {
  console.log('Saving editor content');
  chrome.storage.local.set({editorContent: editorContent});
}

// 导出Markdown文件
function exportMarkdown() {
  console.log('Export markdown called');
  if (!editorContent.trim()) {
    console.log('No content to export');
    alert('编辑器中没有内容可导出！');
    return;
  }
  
  try {
    const blob = new Blob([editorContent], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    
    // 提取第一行作为文件名（如果是标题）
    let fileName = 'notes.md';
    const firstLine = editorContent.split('\n')[0].trim();
    if (firstLine.startsWith('#')) {
      fileName = firstLine.replace(/^#+\s*/, '').trim() + '.md';
    }
    
    downloadLink.download = fileName;
    downloadLink.click();
    console.log('File downloaded:', fileName);
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting markdown:', error);
  }
}

// 清空编辑器
function clearEditor() {
  console.log('Clear editor called');
  if (confirm('确定要清空编辑器内容吗？此操作不可撤销。')) {
    editorContent = '';
    if (editorWrapper) {
      const editor = editorWrapper.querySelector('.md-editor');
      if (editor) {
        editor.value = '';
        console.log('Editor content cleared');
      } else {
        console.log('Editor textarea not found');
      }
    } else {
      console.log('Editor wrapper not found');
    }
    saveEditorContent();
  } else {
    console.log('Clear operation cancelled by user');
  }
}

// 添加这个函数到content.js的全局作用域
function adjustEditorSize() {
  const editor = document.querySelector('.md-editor');
  if (editor) {
    console.log('Adjusting editor size after paste');
    // 确保编辑器高度适合内容
    editor.style.height = 'calc(100% - 40px)';
    editor.scrollTop = editor.scrollHeight; // 滚动到底部以显示新粘贴的内容
  }
}

// 添加调整编辑器布局的函数
function adjustEditorLayout() {
  if (!editorWrapper) return;
  
  // 确保编辑器不超出窗口边界
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const editorRect = editorWrapper.getBoundingClientRect();
  
  // 如果编辑器超出右边界，调整位置
  if (editorRect.right > viewportWidth) {
    editorWrapper.style.right = '10px';
  }
  
  // 如果编辑器超出底部边界，调整位置
  if (editorRect.bottom > viewportHeight) {
    editorWrapper.style.top = (viewportHeight - editorRect.height - 10) + 'px';
  }
  
  // 确保高度不超过视口
  const maxHeight = viewportHeight * 0.8; // 最大高度为视口的80%
  if (editorRect.height > maxHeight) {
    editorWrapper.style.height = maxHeight + 'px';
  }
  
  // 调整编辑区域和预览区域的高度
  const editor = editorWrapper.querySelector('.md-editor');
  const preview = editorWrapper.querySelector('.md-preview');
  
  if (editor) {
    editor.style.height = 'calc(100% - 40px)';
  }
  
  if (preview) {
    preview.style.height = 'calc(100% - 40px)';
  }
}