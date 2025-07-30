// 创建一个浮动编辑器实例
let editorWrapper = null;
let isEditorVisible = false;
let editorContent = '';

console.log('Content script loaded', window.location.href);

// 插件焦点状态管理
let isPluginFocused = false;

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
      // 延迟更新标题，确保编辑器完全创建完成
      setTimeout(() => {
        updateTitle();
      }, 100);
    }
  });
  
  // 富文本编辑器初始化完成
  console.log('Rich text editor initialization completed');
  
  // 添加全局点击事件监听器来管理焦点
  document.addEventListener('click', function(e) {
    if (editorWrapper && editorWrapper.contains(e.target)) {
      // 点击在插件内部，设置焦点
      isPluginFocused = true;
      editorWrapper.style.boxShadow = '0 5px 15px rgba(66, 133, 244, 0.3)'; // 蓝色阴影表示焦点
      console.log('Plugin focused');
    } else {
      // 点击在插件外部，失去焦点
      isPluginFocused = false;
      if (editorWrapper) {
        editorWrapper.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)'; // 恢复默认阴影
      }
      console.log('Plugin unfocused');
    }
  });
});

// 监听窗口大小变化事件，在window.addEventListener('load', function()下方添加
window.addEventListener('resize', function() {
  if (editorWrapper && isEditorVisible) {
    console.log('Window resized, adjusting editor');
    adjustEditorLayout();
  }
});



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
    
    // 设置苹果风格的边框样式
    editorWrapper.style.border = '1px solid #d1d1d1';
    editorWrapper.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
    editorWrapper.style.borderRadius = '8px';
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
    toolbar.style.height = '30px';
    toolbar.style.padding = '5px';
    toolbar.style.cursor = 'move'; // 整个顶部区域都可拖动
    toolbar.style.opacity = '1'; // 始终显示
    toolbar.style.position = 'absolute'; // 使用绝对定位
    toolbar.style.top = '0';
    toolbar.style.left = '0';
    toolbar.style.right = '0';
    toolbar.style.zIndex = '2'; // 确保在编辑区域上方
    toolbar.style.border = 'none';
    toolbar.style.borderBottom = 'none';
    toolbar.style.backgroundColor = '#f6f6f6'; // 更接近苹果风格的背景色
    toolbar.style.borderRadius = '7px 7px 0 0'; // 顶部圆角，配合8px的外边框
    toolbar.style.borderBottom = '1px solid #e5e5e5'; // 底部分割线
    
    // 创建macOS风格的按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.position = 'absolute';
    buttonContainer.style.left = '12px';
    buttonContainer.style.top = '50%';
    buttonContainer.style.transform = 'translateY(-50%)';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.alignItems = 'center';
    
    // 添加关闭按钮 (红色)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'md-close';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭编辑器';
    closeBtn.style.width = '12px';
    closeBtn.style.height = '12px';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.border = 'none';
    closeBtn.style.backgroundColor = '#ff5f56';
    closeBtn.style.color = 'transparent'; // 默认透明，不显示图标
    closeBtn.style.fontSize = '10px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.padding = '0';
    closeBtn.style.transition = 'all 0.2s ease';
    closeBtn.addEventListener('click', hideEditor);
    closeBtn.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#ff453a';
      this.style.color = '#4c0000'; // 悬浮时显示图标
      this.style.transform = 'scale(1.1)';
    });
    closeBtn.addEventListener('mouseleave', function() {
      this.style.backgroundColor = '#ff5f56';
      this.style.color = 'transparent'; // 离开时隐藏图标
      this.style.transform = 'scale(1)';
    });
    buttonContainer.appendChild(closeBtn);
    
    // 添加导出按钮 (绿色，替代最大化按钮)
    const exportBtn = document.createElement('button');
    exportBtn.className = 'md-export';
    exportBtn.textContent = '⬆';
    exportBtn.title = '导出为Markdown';
    exportBtn.style.width = '12px';
    exportBtn.style.height = '12px';
    exportBtn.style.borderRadius = '50%';
    exportBtn.style.border = 'none';
    exportBtn.style.backgroundColor = '#007AFF';
    exportBtn.style.color = 'transparent'; // 默认透明，不显示图标
    exportBtn.style.fontSize = '8px';
    exportBtn.style.fontWeight = 'bold';
    exportBtn.style.cursor = 'pointer';
    exportBtn.style.display = 'flex';
    exportBtn.style.alignItems = 'center';
    exportBtn.style.justifyContent = 'center';
    exportBtn.style.lineHeight = '1';
    exportBtn.style.padding = '0';
    exportBtn.style.transition = 'all 0.2s ease';
    exportBtn.addEventListener('click', exportMarkdown);
    exportBtn.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#0056CC';
      this.style.color = '#ffffff'; // 悬浮时显示图标
      this.style.transform = 'scale(1.1)';
    });
    exportBtn.addEventListener('mouseleave', function() {
      this.style.backgroundColor = '#007AFF';
      this.style.color = 'transparent'; // 离开时隐藏图标
      this.style.transform = 'scale(1)';
    });
    buttonContainer.appendChild(exportBtn);
    
    toolbar.appendChild(buttonContainer);
    
    // 添加标题文字 (居中显示)
    const titleText = document.createElement('span');
    titleText.id = 'md-title-text';
    titleText.textContent = '笔记';
    titleText.style.position = 'absolute';
    titleText.style.left = '50%';
    titleText.style.top = '50%';
    titleText.style.transform = 'translate(-50%, -50%)';
    titleText.style.fontSize = '13px';
    titleText.style.color = '#666';
    titleText.style.fontWeight = '500';
    titleText.style.userSelect = 'none';
    titleText.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    titleText.style.maxWidth = '200px'; // 限制最大宽度
    titleText.style.overflow = 'hidden'; // 超出隐藏
    titleText.style.textOverflow = 'ellipsis'; // 显示省略号
    titleText.style.whiteSpace = 'nowrap'; // 不换行
    toolbar.appendChild(titleText);
    
    // 创建富文本编辑区域
    const editor = document.createElement('div');
    editor.className = 'md-editor';
    editor.contentEditable = true;
    editor.style.height = '100%'; // 让编辑区域占据整个容器
    editor.style.width = '100%';
    editor.style.padding = '10px';
    editor.style.paddingTop = '40px'; // 为更高的工具栏预留空间
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
    editor.style.minHeight = '200px';
    editor.style.fontFamily = 'Arial, sans-serif';
    editor.style.fontSize = '14px';
    editor.style.lineHeight = '1.6';
    
    // 设置占位符
    if (!editorContent || editorContent.trim() === '') {
      editor.innerHTML = '';
      editor.setAttribute('data-placeholder', '在此输入内容或粘贴富文本...');
    } else {
      editor.innerHTML = editorContent;
      editor.removeAttribute('data-placeholder');
    }
    
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
    
    // 创建调整大小的句柄
    const resizeHandles = createResizeHandles();
    resizeHandles.forEach(handle => editorWrapper.appendChild(handle));
    
    // 工具栏现在始终显示，不需要鼠标悬停控制
    
    // 处理占位符
    // 处理输入事件
    editor.addEventListener('input', function() {
      editorContent = this.innerHTML;
      saveEditorContent();
      
      // 处理占位符显示/隐藏
      if (this.textContent.trim() === '') {
        this.setAttribute('data-placeholder', '在此输入内容或粘贴富文本...');
      } else {
        this.removeAttribute('data-placeholder');
      }
      
      // 动态更新标题
      updateTitle();
    });
    
    // 处理焦点事件
    editor.addEventListener('focus', function() {
      isPluginFocused = true;
      editorWrapper.style.boxShadow = '0 5px 15px rgba(66, 133, 244, 0.3)';
      console.log('Plugin focused via focus event');
    });
    
    editor.addEventListener('blur', function(e) {
      // 检查新的焦点是否仍在插件内
      setTimeout(() => {
        if (!editorWrapper.contains(document.activeElement)) {
          isPluginFocused = false;
          editorWrapper.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
          console.log('Plugin unfocused via blur event');
        }
      }, 0);
    });
    

    
    // 监听粘贴事件
    editor.addEventListener('paste', function(e) {
      console.log('Paste event triggered');
      
      // 检查是否包含图片
      const items = e.clipboardData.items;
      let hasImage = false;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          hasImage = true;
          const file = item.getAsFile();
          if (file) {
            handleImagePaste(file, editor);
          }
          break;
        }
      }
      
      if (!hasImage) {
        console.log('Rich text paste event triggered');
        handleRichTextPaste(e, editor);
      }
    });
    
    // 键盘事件处理
    editor.addEventListener('keydown', function(e) {
      // 当按Tab键时，插入缩进
      if (e.key === 'Tab') {
        e.preventDefault();
        
        // 插入不间断空格来实现缩进
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const tabSpan = document.createElement('span');
        tabSpan.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;'; // 4个空格
        range.insertNode(tabSpan);
        
        // 移动光标到插入内容后面
        range.setStartAfter(tabSpan);
        range.setEndAfter(tabSpan);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // 更新内容
        editorContent = this.innerHTML;
        saveEditorContent();
        
        // 更新标题
        updateTitle();
      }
      
      // Enter键处理，确保有合适的段落结构
      if (e.key === 'Enter') {
        // 让浏览器默认处理，但确保结构正确
        setTimeout(() => {
          editorContent = this.innerHTML;
          saveEditorContent();
          updateTitle();
        }, 0);
      }
    });
    
    // 滚动优化和焦点管理
    editor.addEventListener('scroll', function() {
      // 如果用户滚动到底部，记录此状态
      this.isScrolledToBottom = Math.abs(this.scrollHeight - this.clientHeight - this.scrollTop) < 10;
    });
    
    // 阻止编辑器滚动事件冒泡到页面（只有在插件获得焦点时才允许滚动）
    editor.addEventListener('wheel', function(e) {
      if (!isPluginFocused) {
        // 如果插件没有焦点，阻止滚动
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // 如果已经滚动到顶部但继续向上滚动，或者滚动到底部但继续向下滚动，则阻止事件冒泡
      const atTop = this.scrollTop === 0;
      const atBottom = this.scrollTop >= (this.scrollHeight - this.clientHeight);
      
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        // 在边界继续滚动时，不阻止事件，让页面可以滚动
        return true;
      } else {
        // 在编辑器内部滚动时，阻止事件冒泡
        e.stopPropagation();
      }
    }, { passive: false });
    
    // 为整个编辑器包装器添加滚动控制
    editorWrapper.addEventListener('wheel', function(e) {
      if (!isPluginFocused) {
        // 如果插件没有焦点，完全阻止滚动
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, { passive: false });
    
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
          handleImagePaste(file, editor);
          break; // 只处理第一个图片文件
        }
      }
    });
    
    editorWrapper.appendChild(editor);
    editorWrapper.appendChild(toolbar); // 工具栏放在后面，确保显示在上层
    editorWrapper.appendChild(bottomCover); // 添加底部覆盖层
    
    // 添加到页面
    document.body.appendChild(editorWrapper);
    console.log('Editor created and added to page');
    
    // 实现拖动功能
    implementDrag(toolbar);
    
    // 编辑器已创建，无需额外处理
    console.log('Rich text editor created successfully');
    
    // 确保苹果风格样式正确应用
    setTimeout(() => {
      editorWrapper.style.border = '1px solid #d1d1d1';
      // 初始化标题显示
      updateTitle();
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
    #floating-md-editor {
      border: 1px solid #d1d1d1 !important;
      outline: none !important;
    }
    
    #floating-md-editor .md-editor {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }
    
    #floating-md-editor .md-editor {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      background-color: white !important;
      color: black !important;
      -webkit-text-fill-color: black !important;
      -webkit-appearance: none !important;
      position: relative;
      transition: all 0.2s ease;
    }
    
    /* 占位符样式 */
    #floating-md-editor .md-editor[data-placeholder]:empty::before {
      content: attr(data-placeholder);
      color: #999;
      pointer-events: none;
      position: absolute;
      left: 10px;
      top: 40px;
      font-size: 14px;
      line-height: 1.6;
    }
    
    /* 焦点状态样式 */
    #floating-md-editor {
      transition: box-shadow 0.2s ease;
    }
    
    /* 调整大小句柄样式 */
    .resize-handle {
      position: absolute;
      background: transparent;
      z-index: 10;
    }
    
    .resize-handle-n, .resize-handle-s {
      left: 10px; right: 10px; height: 5px;
      cursor: ns-resize;
    }
    
    .resize-handle-e, .resize-handle-w {
      top: 10px; bottom: 10px; width: 5px;
      cursor: ew-resize;
    }
    
    .resize-handle-n { top: -2px; }
    .resize-handle-s { bottom: -2px; }
    .resize-handle-e { right: -2px; }
    .resize-handle-w { left: -2px; }
    
    .resize-handle-ne, .resize-handle-sw {
      width: 10px; height: 10px;
      cursor: nesw-resize;
    }
    
    .resize-handle-nw, .resize-handle-se {
      width: 10px; height: 10px;
      cursor: nwse-resize;
    }
    
    .resize-handle-ne { top: -2px; right: -2px; }
    .resize-handle-nw { top: -2px; left: -2px; }
    .resize-handle-se { bottom: -2px; right: -2px; }
    .resize-handle-sw { bottom: -2px; left: -2px; }
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
    if (isDragging) {
      // 确保编辑器不会被拖出视口
      const newLeft = e.clientX - offsetX;
      const newTop = e.clientY - offsetY;
      
      const maxX = window.innerWidth - editorWrapper.offsetWidth;
      const maxY = window.innerHeight - editorWrapper.offsetHeight;
      
      editorWrapper.style.left = Math.max(0, Math.min(newLeft, maxX)) + 'px';
      editorWrapper.style.top = Math.max(0, Math.min(newTop, maxY)) + 'px';
      
      // 移除right属性，因为我们现在使用left
      editorWrapper.style.right = 'auto';
    }
    
    // 处理调整大小
    if (isResizing) {
      handleResize(e);
    }
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      console.log('Stopped dragging');
      handle.style.cursor = 'move';
      // 工具栏始终显示，不需要隐藏
    }
    isDragging = false;
    
    // 结束调整大小
    stopResize();
    
    // 确保保持苹果风格边框
    editorWrapper.style.border = '1px solid #d1d1d1';
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
  
  // 显示编辑器时默认不获得焦点，需要用户主动点击
  isPluginFocused = false;
  editorWrapper.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
  
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

// 导出 Markdown 文件
function exportMarkdown() {
  console.log('Export Markdown called');
  if (!editorContent.trim() || editorContent.includes('color: #999')) {
    console.log('No content to export');
    alert('编辑器中没有内容可导出！');
    return;
  }
  
  try {
    // 将 HTML 内容转换为 Markdown 格式
    const markdownContent = htmlToMarkdown(editorContent);
    
    const blob = new Blob([markdownContent], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    
    // 从第一行文字提取文件名
    const fileName = getFileNameFromFirstLine(editorContent);
    downloadLink.download = fileName;
    downloadLink.click();
    console.log('Markdown file downloaded:', fileName);
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting markdown:', error);
    alert('导出失败：' + error.message);
  }
}

// 动态更新标题函数
function updateTitle() {
  const titleElement = document.getElementById('md-title-text');
  if (!titleElement || !editorWrapper) return;
  
  const editor = editorWrapper.querySelector('.md-editor');
  if (!editor) return;
  
  // 获取编辑器的第一行内容
  const firstLineText = getFirstLineText(editor.innerHTML);
  
  if (firstLineText && firstLineText.trim()) {
    // 如果有内容，显示第一行（限制长度）
    const truncatedText = firstLineText.length > 20 ? 
      firstLineText.substring(0, 20) + '...' : firstLineText;
    titleElement.textContent = truncatedText;
    titleElement.title = firstLineText; // 完整内容作为tooltip
  } else {
    // 如果没有内容，显示默认标题
    titleElement.textContent = '笔记';
    titleElement.title = '';
  }
}

// 提取第一行文本内容
function getFirstLineText(htmlContent) {
  if (!htmlContent || htmlContent.trim() === '') return '';
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  
  // 获取第一个有内容的文本节点或元素
  const walker = document.createTreeWalker(
    tempDiv,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let firstText = '';
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text) {
      firstText = text;
      break;
    }
  }
  
  // 如果没有找到文本节点，尝试从第一个元素获取
  if (!firstText) {
    const firstElement = tempDiv.querySelector('p, div, h1, h2, h3, h4, h5, h6, span');
    if (firstElement) {
      firstText = firstElement.textContent.trim();
    }
  }
  
  // 只获取第一行（按换行符分割）
  if (firstText) {
    firstText = firstText.split('\n')[0].trim();
  }
  
  return firstText;
}

// 从第一行文字提取文件名
function getFileNameFromFirstLine(htmlContent) {
  let firstLineText = getFirstLineText(htmlContent);
  
  // 清理文件名，移除不允许的字符
  if (firstLineText) {
    firstLineText = firstLineText
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // 移除不允许的文件名字符
      .replace(/\s+/g, '_') // 空格替换为下划线
      .substring(0, 50); // 限制长度
  }
  
  return firstLineText ? `${firstLineText}.md` : 'notes.md';
}

// 将 HTML 转换为 Markdown
function htmlToMarkdown(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  let markdown = '';
  
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    
    const tagName = node.tagName.toLowerCase();
    let content = '';
    
    // 递归处理子节点
    for (let child of node.childNodes) {
      content += processNode(child);
    }
    
    switch (tagName) {
      case 'h1':
        return `# ${content}\n\n`;
      case 'h2':
        return `## ${content}\n\n`;
      case 'h3':
        return `### ${content}\n\n`;
      case 'h4':
        return `#### ${content}\n\n`;
      case 'h5':
        return `##### ${content}\n\n`;
      case 'h6':
        return `###### ${content}\n\n`;
      case 'p':
        return `${content}\n\n`;
      case 'br':
        return '\n';
      case 'strong':
      case 'b':
        return `**${content}**`;
      case 'em':
      case 'i':
        return `*${content}*`;
      case 'code':
        return `\`${content}\``;
      case 'pre':
        return `\`\`\`\n${content}\n\`\`\`\n\n`;
      case 'blockquote':
        return `> ${content}\n\n`;
      case 'ul':
        return `${content}\n`;
      case 'ol':
        return `${content}\n`;
      case 'li':
        const listMarker = node.parentNode.tagName.toLowerCase() === 'ol' ? '1. ' : '- ';
        return `${listMarker}${content}\n`;
      case 'a':
        const href = node.getAttribute('href') || '';
        return href ? `[${content}](${href})` : content;
      case 'img':
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || '';
        return src ? `![${alt}](${src})` : '';
      case 'table':
        return convertTableToMarkdown(node);
      case 'hr':
        return '---\n\n';
      case 'div':
      case 'span':
        return content;
      default:
        return content;
    }
  }
  
  markdown = processNode(tempDiv);
  
  // 清理多余的空行
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  
  return markdown.trim();
}

// 转换表格为 Markdown
function convertTableToMarkdown(tableNode) {
  const rows = tableNode.querySelectorAll('tr');
  if (rows.length === 0) return '';
  
  let markdown = '';
  
  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('td, th');
    const cellContents = Array.from(cells).map(cell => cell.textContent.trim());
    
    markdown += '| ' + cellContents.join(' | ') + ' |\n';
    
    // 如果是第一行，添加分隔符
    if (rowIndex === 0) {
      markdown += '|' + ' --- |'.repeat(cells.length) + '\n';
    }
  });
  
  return markdown + '\n';
}

// 清空编辑器
function clearEditor() {
  console.log('Clear editor called');
  if (confirm('确定要清空编辑器内容吗？此操作不可撤销。')) {
    editorContent = '';
    if (editorWrapper) {
      const editor = editorWrapper.querySelector('.md-editor');
      if (editor) {
        editor.innerHTML = '';
        editor.setAttribute('data-placeholder', '在此输入内容或粘贴富文本...');
        console.log('Editor content cleared');
      } else {
        console.log('Editor element not found');
      }
    } else {
      console.log('Editor wrapper not found');
    }
    saveEditorContent();
    
    // 更新标题
    updateTitle();
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

// 创建调整大小的句柄
function createResizeHandles() {
  const handles = [];
  const handleTypes = [
    'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'
  ];
  
  handleTypes.forEach(type => {
    const handle = document.createElement('div');
    handle.className = `resize-handle resize-handle-${type}`;
    handle.addEventListener('mousedown', (e) => startResize(e, type));
    handles.push(handle);
  });
  
  return handles;
}

// 调整大小变量
let isResizing = false;
let resizeType = '';
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;
let resizeStartLeft = 0;
let resizeStartTop = 0;

// 开始调整大小
function startResize(e, type) {
  if (isDragging) return; // 如果正在拖拽，不处理调整大小
  
  isResizing = true;
  resizeType = type;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  
  const rect = editorWrapper.getBoundingClientRect();
  resizeStartWidth = rect.width;
  resizeStartHeight = rect.height;
  resizeStartLeft = rect.left;
  resizeStartTop = rect.top;
  
  editorWrapper.classList.add('resizing');
  
  e.preventDefault();
  e.stopPropagation();
  
  console.log('Started resizing:', type);
}

// 处理调整大小
function handleResize(e) {
  if (!isResizing) return;
  
  const deltaX = e.clientX - resizeStartX;
  const deltaY = e.clientY - resizeStartY;
  
  let newWidth = resizeStartWidth;
  let newHeight = resizeStartHeight;
  let newLeft = resizeStartLeft;
  let newTop = resizeStartTop;
  
  // 根据调整类型计算新的尺寸和位置
  if (resizeType.includes('e')) {
    newWidth = Math.max(300, resizeStartWidth + deltaX);
  }
  if (resizeType.includes('w')) {
    newWidth = Math.max(300, resizeStartWidth - deltaX);
    newLeft = resizeStartLeft + (resizeStartWidth - newWidth);
  }
  if (resizeType.includes('s')) {
    newHeight = Math.max(200, resizeStartHeight + deltaY);
  }
  if (resizeType.includes('n')) {
    newHeight = Math.max(200, resizeStartHeight - deltaY);
    newTop = resizeStartTop + (resizeStartHeight - newHeight);
  }
  
  // 确保不超出视口边界
  const maxWidth = window.innerWidth * 0.9;
  const maxHeight = window.innerHeight * 0.9;
  
  newWidth = Math.min(newWidth, maxWidth);
  newHeight = Math.min(newHeight, maxHeight);
  
  // 确保不会移出视口
  newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - newWidth));
  newTop = Math.max(0, Math.min(newTop, window.innerHeight - newHeight));
  
  // 应用新的尺寸和位置
  editorWrapper.style.width = newWidth + 'px';
  editorWrapper.style.height = newHeight + 'px';
  editorWrapper.style.left = newLeft + 'px';
  editorWrapper.style.top = newTop + 'px';
  editorWrapper.style.right = 'auto';
  editorWrapper.style.bottom = 'auto';
}

// 结束调整大小
function stopResize() {
  if (isResizing) {
    isResizing = false;
    resizeType = '';
    editorWrapper.classList.remove('resizing');
    console.log('Stopped resizing');
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

// 处理富文本粘贴事件
function handleRichTextPaste(e, editor) {
  e.preventDefault();
  
  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData) {
    console.log('No clipboard data available');
    return;
  }
  
  // 优先获取HTML格式的数据
  const htmlData = clipboardData.getData('text/html');
  const plainTextData = clipboardData.getData('text/plain');
  
  console.log('HTML data:', htmlData ? 'Available' : 'Not available');
  console.log('Plain text data:', plainTextData ? 'Available' : 'Not available');
  
  let contentToInsert = '';
  
  if (htmlData && htmlData.trim()) {
    // 如果有HTML数据，清理并直接插入
    console.log('Using HTML content');
    contentToInsert = cleanHtmlForPaste(htmlData);
  } else if (plainTextData) {
    // 如果只有纯文本，转换为HTML段落
    console.log('Converting plain text to HTML');
    contentToInsert = plainTextToHtml(plainTextData);
  } else {
    console.log('No usable clipboard data');
    return;
  }
  
  // 插入内容到编辑器
  insertHtmlAtCursor(editor, contentToInsert);
  
  // 更新编辑器内容
  editorContent = editor.innerHTML;
  saveEditorContent();
  
  // 更新标题
  updateTitle();
}

// 在光标位置插入HTML内容
function insertHtmlAtCursor(editor, html) {
  editor.focus();
  
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    
    // 清除占位符属性
    editor.removeAttribute('data-placeholder');
    
    // 删除选中的内容
    range.deleteContents();
    
    // 创建一个临时容器来解析HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 逐个插入节点
    const fragment = document.createDocumentFragment();
    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
    
    range.insertNode(fragment);
    
    // 移动光标到插入内容后面
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    // 如果没有选择范围，直接添加到末尾
    editor.innerHTML += html;
    editor.removeAttribute('data-placeholder');
  }
}

// 清理粘贴的HTML内容
function cleanHtmlForPaste(html) {
  // 创建临时元素来解析HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // 移除不需要的属性和样式，但保留基本格式
  const elementsToClean = tempDiv.querySelectorAll('*');
  elementsToClean.forEach(el => {
    // 保留重要的样式属性
    const allowedStyles = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration'];
    const currentStyle = el.getAttribute('style');
    
    if (currentStyle) {
      const newStyles = [];
      allowedStyles.forEach(prop => {
        const value = el.style.getPropertyValue(prop);
        if (value) {
          newStyles.push(`${prop}: ${value}`);
        }
      });
      
      if (newStyles.length > 0) {
        el.setAttribute('style', newStyles.join('; '));
      } else {
        el.removeAttribute('style');
      }
    }
    
    // 移除不需要的属性
    const attributesToRemove = ['class', 'id', 'data-*', 'onclick', 'onload'];
    attributesToRemove.forEach(attr => {
      if (attr.includes('*')) {
        // 移除以特定前缀开头的属性
        const prefix = attr.replace('*', '');
        Array.from(el.attributes).forEach(attribute => {
          if (attribute.name.startsWith(prefix)) {
            el.removeAttribute(attribute.name);
          }
        });
      } else {
        el.removeAttribute(attr);
      }
    });
  });
  
  return tempDiv.innerHTML;
}

// 将纯文本转换为HTML
function plainTextToHtml(text) {
  // 按行分割文本
  const lines = text.split('\n');
  const htmlLines = lines.map(line => {
    if (line.trim() === '') {
      return '<br>';
    } else {
      return `<p>${line}</p>`;
    }
  });
  
  return htmlLines.join('');
}



// 图片处理功能
async function handleImagePaste(file, editor) {
  try {
    console.log('处理图片粘贴:', file.name, file.type);
    
    // 压缩并转换为data URL - 对截图使用最高质量设置
    const dataUrl = await compressImage(file, 2560, 0.98);
    
    // 生成唯一的图片名称
    const fileName = generateImageName(file.name);
    
    // 存储图片数据
    await storeImageData(fileName, dataUrl);
    
    // 创建图片元素并插入到编辑器
    const imgElement = document.createElement('img');
    imgElement.src = dataUrl;
    imgElement.alt = fileName;
    imgElement.style.maxWidth = '100%';
    imgElement.style.height = 'auto';
    imgElement.style.cursor = 'pointer';
    imgElement.title = '点击放大查看';
    
    // 添加点击放大功能
    imgElement.addEventListener('click', function() {
      showImageModal(dataUrl, fileName);
    });
    
    // 插入图片到编辑器
    insertElementAtCursor(editor, imgElement);
    
    // 更新编辑器内容
    editorContent = editor.innerHTML;
    saveEditorContent();
    updateTitle();
    
    console.log('图片插入成功');
    
  } catch (error) {
    console.error('插入图片失败:', error);
    alert('插入图片失败，请重试');
  }
}

// 压缩图片 - 保持高清质量
function compressImage(file, maxWidth = 1920, quality = 0.95) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
      // 计算压缩后的尺寸
      let { width, height } = img;
      
      // 只有在图片宽度真的很大时才进行尺寸压缩
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      // 设置画布尺寸
      canvas.width = width;
      canvas.height = height;
      
      // 使用高质量绘制设置
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // 绘制图片
      ctx.drawImage(img, 0, 0, width, height);
      
      // 对于PNG格式使用无损压缩，其他格式使用高质量压缩
      const outputType = file.type === 'image/png' ? 'image/png' : file.type;
      const outputQuality = file.type === 'image/png' ? 1.0 : quality;
      
      // 转换为data URL
      const dataUrl = canvas.toDataURL(outputType, outputQuality);
      resolve(dataUrl);
    };
    
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = URL.createObjectURL(file);
  });
}

// 生成图片名称
function generateImageName(originalName) {
  const timestamp = Date.now();
  const extension = originalName.split('.').pop() || 'png';
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

// 在光标位置插入元素
function insertElementAtCursor(editor, element) {
  editor.focus();
  
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    
    // 清除占位符属性
    editor.removeAttribute('data-placeholder');
    
    // 删除选中的内容
    range.deleteContents();
    
    // 添加换行符以确保图片在新行显示
    const br1 = document.createElement('br');
    const br2 = document.createElement('br');
    
    range.insertNode(br2);
    range.insertNode(element);
    range.insertNode(br1);
    
    // 移动光标到插入内容后面
    range.setStartAfter(br2);
    range.setEndAfter(br2);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    // 如果没有选择范围，直接添加到末尾
    const br = document.createElement('br');
    editor.appendChild(br);
    editor.appendChild(element);
    editor.appendChild(document.createElement('br'));
    editor.removeAttribute('data-placeholder');
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

// 编辑器相关变量







