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
      // 如果点击的是编辑区域，添加编辑器焦点类
      const editor = editorWrapper.querySelector('.md-editor');
      if (editor && (e.target === editor || editor.contains(e.target))) {
        editorWrapper.classList.add('editor-focused');
      }
      console.log('Plugin focused');
    } else {
      // 点击在插件外部，失去焦点
      isPluginFocused = false;
      if (editorWrapper) {
        editorWrapper.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)'; // 恢复默认阴影
        editorWrapper.classList.remove('editor-focused');
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
    console.log('Exporting markdown with file library support');
    // 支持本地文件库的导出功能
    const customPath = request.customPath || null;
    const modeName = request.modeName || '默认';
    exportMarkdown(customPath, modeName);
    sendResponse({status: "exported", customPath: customPath, modeName: modeName});
  } else if (request.action === "clearEditor") {
    console.log('Clearing editor');
    clearEditor();
    sendResponse({status: "cleared"});
  } else if (request.action === "resetDirectoryHandle") {
    console.log('Resetting directory handle for mode:', request.modeName);
    removeSavedDirectoryHandle(request.modeName).then(() => {
      sendResponse({status: "reset", modeName: request.modeName});
    });
    return true; // 保持消息通道开放以支持异步响应
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
    
    // 阻止事件冒泡，防止影响背景页面
    // 修复了打字和按键滚动背景页面的问题
    const eventsToStop = ['keydown', 'keyup', 'keypress', 'mousedown', 'wheel'];
    eventsToStop.forEach(eventName => {
      editorWrapper.addEventListener(eventName, function(e) {
        e.stopPropagation();
      });
    });
    
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
    buttonContainer.setAttribute('data-notranslate', 'true');
    buttonContainer.setAttribute('translate', 'no');
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
    closeBtn.setAttribute('data-notranslate', 'true');
    closeBtn.setAttribute('translate', 'no');
    closeBtn.style.width = '12px';
    closeBtn.style.height = '12px';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.border = 'none';
    closeBtn.style.backgroundColor = '#ff5f56';
    closeBtn.style.color = 'transparent'; // 默认透明，不显示图标
    closeBtn.style.fontSize = '8px';
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
    
    // 添加导出按钮 (蓝色，替代最大化按钮)
    const exportBtn = document.createElement('button');
    exportBtn.className = 'md-export';
    exportBtn.textContent = '⬆';
    exportBtn.title = '导出为Markdown';
    exportBtn.setAttribute('data-notranslate', 'true');
    exportBtn.setAttribute('translate', 'no');
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
    exportBtn.addEventListener('click', function() {
      // 使用与插件导出相同的逻辑
      exportMarkdownWithCurrentMode();
    });
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
    
    // 添加清理缓存按钮 (黄色)
    const clearCacheBtn = document.createElement('button');
    clearCacheBtn.className = 'md-clear-cache';
    clearCacheBtn.textContent = '🗑';
    clearCacheBtn.title = '清理图片缓存';
    clearCacheBtn.style.width = '12px';
    clearCacheBtn.style.height = '12px';
    clearCacheBtn.style.borderRadius = '50%';
    clearCacheBtn.style.border = 'none';
    clearCacheBtn.style.backgroundColor = '#FFD60A';
    clearCacheBtn.style.color = 'transparent'; // 默认透明，不显示图标
    clearCacheBtn.style.fontSize = '8px';
    clearCacheBtn.style.fontWeight = 'bold';
    clearCacheBtn.style.cursor = 'pointer';
    clearCacheBtn.style.display = 'flex';
    clearCacheBtn.style.alignItems = 'center';
    clearCacheBtn.style.justifyContent = 'center';
    clearCacheBtn.style.lineHeight = '1';
    clearCacheBtn.style.padding = '0';
    clearCacheBtn.style.transition = 'all 0.2s ease';
    clearCacheBtn.addEventListener('click', function() {
      showStorageStatus();
    });
    clearCacheBtn.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#FF9500';
      this.style.color = '#4c0000'; // 悬浮时显示图标
      this.style.transform = 'scale(1.1)';
    });
    clearCacheBtn.addEventListener('mouseleave', function() {
      this.style.backgroundColor = '#FFD60A';
      this.style.color = 'transparent'; // 离开时隐藏图标
      this.style.transform = 'scale(1)';
    });
    buttonContainer.appendChild(clearCacheBtn);
    
    // 添加分享按钮 (绿色)
    const shareBtn = document.createElement('button');
    shareBtn.className = 'md-share';
    shareBtn.textContent = '↗';
    shareBtn.title = '分享笔记';
    shareBtn.style.width = '12px';
    shareBtn.style.height = '12px';
    shareBtn.style.borderRadius = '50%';
    shareBtn.style.border = 'none';
    shareBtn.style.backgroundColor = '#34C759';
    shareBtn.style.color = 'transparent'; // 默认透明，不显示图标
    shareBtn.style.fontSize = '8px';
    shareBtn.style.fontWeight = 'bold';
    shareBtn.style.cursor = 'pointer';
    shareBtn.style.display = 'flex';
    shareBtn.style.alignItems = 'center';
    shareBtn.style.justifyContent = 'center';
    shareBtn.style.lineHeight = '1';
    shareBtn.style.padding = '0';
    shareBtn.style.transition = 'all 0.2s ease';
    shareBtn.addEventListener('click', function() {
      shareNote();
    });
    shareBtn.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#30D158';
      this.style.color = '#ffffff'; // 悬浮时显示图标
      this.style.transform = 'scale(1.1)';
    });
    shareBtn.addEventListener('mouseleave', function() {
      this.style.backgroundColor = '#34C759';
      this.style.color = 'transparent'; // 离开时隐藏图标
      this.style.transform = 'scale(1)';
    });
    buttonContainer.appendChild(shareBtn);

    // 添加一键复制按钮 (紫色)
    const quickCopyBtn = document.createElement('button');
    quickCopyBtn.className = 'md-quick-copy';
    quickCopyBtn.textContent = '📋';
    quickCopyBtn.title = '一键复制全部内容 (Ctrl+A+Ctrl+C)';
    quickCopyBtn.style.width = '12px';
    quickCopyBtn.style.height = '12px';
    quickCopyBtn.style.borderRadius = '50%';
    quickCopyBtn.style.border = 'none';
    quickCopyBtn.style.backgroundColor = '#AF52DE';
    quickCopyBtn.style.color = 'transparent'; // 默认透明，不显示图标
    quickCopyBtn.style.fontSize = '8px';
    quickCopyBtn.style.fontWeight = 'bold';
    quickCopyBtn.style.cursor = 'pointer';
    quickCopyBtn.style.display = 'flex';
    quickCopyBtn.style.alignItems = 'center';
    quickCopyBtn.style.justifyContent = 'center';
    quickCopyBtn.style.lineHeight = '1';
    quickCopyBtn.style.padding = '0';
    quickCopyBtn.style.transition = 'all 0.2s ease';
    quickCopyBtn.addEventListener('click', function() {
      quickCopyAllContent();
    });
    quickCopyBtn.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#9A3FCD';
      this.style.color = '#ffffff'; // 悬浮时显示图标
      this.style.transform = 'scale(1.1)';
    });
    quickCopyBtn.addEventListener('mouseleave', function() {
      this.style.backgroundColor = '#AF52DE';
      this.style.color = 'transparent'; // 离开时隐藏图标
      this.style.transform = 'scale(1)';
    });
    buttonContainer.appendChild(quickCopyBtn);
    
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
    
    // 添加模式切换按钮 (右侧)
    const modeSwitcher = createModeSwitcher();
    toolbar.appendChild(modeSwitcher);
    
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
      editorWrapper.classList.add('editor-focused');
      console.log('Plugin focused via focus event');
    });
    
    editor.addEventListener('blur', function(e) {
      // 检查新的焦点是否仍在插件内
      setTimeout(() => {
        if (!editorWrapper.contains(document.activeElement)) {
          isPluginFocused = false;
          editorWrapper.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
          editorWrapper.classList.remove('editor-focused');
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
    
    /* Mac 风格调整大小句柄样式 - 更大的热区和视觉反馈 */
    .resize-handle {
      position: absolute;
      background: transparent;
      z-index: 10;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    
    /* 悬浮时显示微妙的视觉反馈 - 只在非编辑状态时显示 */
    .resize-handle:hover {
      background-color: rgba(0, 122, 255, 0.1);
    }
    
    /* 当编辑器获得焦点时，隐藏句柄的视觉反馈 */
    #floating-md-editor.editor-focused .resize-handle:hover {
      background-color: transparent;
    }
    
    /* 调整大小时的视觉反馈 */
    #floating-md-editor.resizing {
      box-shadow: 0 5px 25px rgba(0, 122, 255, 0.3) !important;
      transition: none !important;
    }
    
    #floating-md-editor.resizing .resize-handle:hover {
      background-color: rgba(0, 122, 255, 0.2);
    }
    
    /* 边缘句柄 - 更大的热区，悬浮时显示光标 */
    .resize-handle-n, .resize-handle-s {
      left: 0; right: 0; height: 8px;
    }
    
    .resize-handle-n:hover, .resize-handle-s:hover {
      cursor: ns-resize;
    }
    
    .resize-handle-e, .resize-handle-w {
      top: 0; bottom: 0; width: 8px;
    }
    
    .resize-handle-e:hover, .resize-handle-w:hover {
      cursor: ew-resize;
    }
    
    .resize-handle-n { top: -4px; }
    .resize-handle-s { bottom: -4px; }
    .resize-handle-e { right: -4px; }
    .resize-handle-w { left: -4px; }
    
    /* 角落句柄 - Mac 风格的大热区，悬浮时显示光标 */
    .resize-handle-ne, .resize-handle-sw {
      width: 20px; height: 20px;
    }
    
    .resize-handle-ne:hover, .resize-handle-sw:hover {
      cursor: nesw-resize;
    }
    
    .resize-handle-nw, .resize-handle-se {
      width: 20px; height: 20px;
    }
    
    .resize-handle-nw:hover, .resize-handle-se:hover {
      cursor: nwse-resize;
    }
    
    .resize-handle-ne { top: -10px; right: -10px; }
    .resize-handle-nw { top: -10px; left: -10px; }
    .resize-handle-se { bottom: -10px; right: -10px; }
    .resize-handle-sw { bottom: -10px; left: -10px; }
    
    /* 角落句柄的视觉指示器 */
    .resize-handle-se::after {
      content: '';
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 12px;
      height: 12px;
      background: linear-gradient(-45deg, transparent 30%, #ccc 30%, #ccc 35%, transparent 35%, transparent 65%, #ccc 65%, #ccc 70%, transparent 70%);
      opacity: 0.6;
      border-radius: 0 0 8px 0;
    }
    
    .resize-handle-se:hover::after {
      opacity: 1;
      background: linear-gradient(-45deg, transparent 30%, #007AFF 30%, #007AFF 35%, transparent 35%, transparent 65%, #007AFF 65%, #007AFF 70%, transparent 70%);
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

// 导出 Markdown 文件 - 支持本地文件库路径
async function exportMarkdown(customPath = null, modeName = '默认') {
  console.log('Export Markdown called with path:', customPath, 'mode:', modeName);
  console.log('File System Access API support:', 'showDirectoryPicker' in window);
  
  if (!editorContent.trim() || editorContent.includes('color: #999')) {
    console.log('No content to export');
    alert('编辑器中没有内容可导出！');
    return;
  }
  
  try {
    // 将 HTML 内容转换为 Markdown 格式
    const markdownContent = htmlToMarkdown(editorContent);
    
    // 从第一行文字提取文件名
    const fileName = getFileNameFromFirstLine(editorContent);
    
    // 如果有自定义路径，尝试使用 File System Access API
    if (customPath) {
      console.log('Attempting to save to custom path:', customPath);
      
      // 检查浏览器支持
      if ('showDirectoryPicker' in window) {
        try {
          const success = await saveToCustomPath(markdownContent, fileName, customPath, modeName);
          if (success) {
            console.log('Successfully saved to custom path');
            return;
          }
        } catch (error) {
          console.log('Custom path save failed:', error.message);
          // 显示错误提示但继续执行默认下载
          showCustomPathError(error.message, customPath, modeName);
        }
      } else {
        console.log('File System Access API not supported in this browser');
        showApiNotSupportedError(customPath, modeName);
      }
    }
    
    // 回退到默认下载方式
    console.log('Using fallback download method');
    await fallbackDownload(markdownContent, fileName, customPath, modeName);
    
  } catch (error) {
    console.error('Error exporting markdown:', error);
    alert('导出失败：' + error.message);
  }
}

// 回退下载方法
async function fallbackDownload(content, fileName, customPath, modeName) {
  const blob = new Blob([content], {type: 'text/markdown;charset=utf-8'});
  
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    // IE/Edge 支持
    window.navigator.msSaveOrOpenBlob(blob, fileName);
    showDownloadSuccess(fileName, customPath, modeName, false);
  } else {
    // 现代浏览器
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    
    downloadLink.href = url;
    downloadLink.download = fileName;
    downloadLink.style.display = 'none';
    
    document.body.appendChild(downloadLink);
    
    setTimeout(() => {
      downloadLink.click();
      
      setTimeout(() => {
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
      }, 100);
      
      console.log('Markdown file downloaded to default location:', fileName);
      showDownloadSuccess(fileName, customPath, modeName, false);
    }, 10);
  }
}

// 导出到自定义路径（实验性功能）
async function exportToCustomPath(content, fileName, customPath, modeName) {
  try {
    // 注意：由于浏览器安全限制，我们无法直接写入到指定路径
    // 这里我们仍然使用下载，但会在文件名中包含路径信息作为提示
    const blob = new Blob([content], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = fileName;
    downloadLink.click();
    
    // 显示路径提示
    showPathHint(customPath, modeName, fileName);
    
    URL.revokeObjectURL(url);
    console.log('File exported with path hint:', customPath);
  } catch (error) {
    console.error('Error exporting to custom path:', error);
    // 回退到普通下载
    const blob = new Blob([content], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = fileName;
    downloadLink.click();
    URL.revokeObjectURL(url);
  }
}

// 保存到自定义路径 - 自动保存功能
async function saveToCustomPath(content, fileName, customPath, modeName) {
  console.log('saveToCustomPath called for mode:', modeName, 'path:', customPath);
  
  try {
    // 检查是否已经获得过该路径的访问权限
    const savedDirectoryHandle = await getSavedDirectoryHandle(modeName);
    
    if (savedDirectoryHandle) {
      console.log('Using saved directory handle for mode:', modeName);
      try {
        // 验证权限是否仍然有效
        const permission = await savedDirectoryHandle.requestPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          await saveFileToDirectory(savedDirectoryHandle, fileName, content);
          showDownloadSuccess(fileName, customPath, modeName, true);
          console.log('File auto-saved to custom path:', customPath);
          return true;
        } else {
          console.log('Permission denied, removing saved handle');
          await removeSavedDirectoryHandle(modeName);
        }
      } catch (permError) {
        console.log('Saved directory handle invalid, removing:', permError.message);
        await removeSavedDirectoryHandle(modeName);
      }
    }
    
    // 如果没有保存的句柄或权限失效，请求用户选择目录
    console.log('Requesting directory picker for mode:', modeName);
    
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API not supported in this browser');
    }
    
    // 显示提示对话框
    const shouldProceed = await showDirectorySelectionDialog(modeName, customPath);
    if (!shouldProceed) {
      throw new Error('User cancelled directory selection');
    }
    
    const directoryHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });
    
    // 保存目录句柄以供将来使用
    await saveDirectoryHandle(modeName, directoryHandle);
    
    // 保存文件
    await saveFileToDirectory(directoryHandle, fileName, content);
    showDownloadSuccess(fileName, customPath, modeName, true);
    console.log('Directory selected and file saved for mode:', modeName);
    return true;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('User cancelled directory selection');
      throw new Error('用户取消了文件夹选择');
    }
    console.error('Error saving to custom path:', error);
    throw error;
  }
}

// 保存目录句柄到存储中
async function saveDirectoryHandle(modeName, directoryHandle) {
  try {
    // 使用 IndexedDB 存储目录句柄（因为 chrome.storage 不支持复杂对象）
    const request = indexedDB.open('FloatingMD_DirectoryHandles', 1);
    
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('directories')) {
          db.createObjectStore('directories', { keyPath: 'modeName' });
        }
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['directories'], 'readwrite');
        const store = transaction.objectStore('directories');
        
        store.put({
          modeName: modeName,
          directoryHandle: directoryHandle,
          timestamp: Date.now()
        });
        
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  } catch (error) {
    console.error('Error saving directory handle:', error);
  }
}

// 获取保存的目录句柄
async function getSavedDirectoryHandle(modeName) {
  try {
    const request = indexedDB.open('FloatingMD_DirectoryHandles', 1);
    
    return new Promise((resolve, reject) => {
      request.onerror = () => resolve(null); // 如果出错，返回 null
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('directories')) {
          db.createObjectStore('directories', { keyPath: 'modeName' });
        }
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['directories'], 'readonly');
        const store = transaction.objectStore('directories');
        const getRequest = store.get(modeName);
        
        getRequest.onsuccess = async () => {
          db.close();
          const result = getRequest.result;
          
          if (result && result.directoryHandle) {
            // 验证句柄是否仍然有效
            try {
              await result.directoryHandle.requestPermission({ mode: 'readwrite' });
              resolve(result.directoryHandle);
            } catch (error) {
              // 句柄无效，删除它
              await removeSavedDirectoryHandle(modeName);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
        
        getRequest.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    });
  } catch (error) {
    console.error('Error getting directory handle:', error);
    return null;
  }
}

// 删除保存的目录句柄
async function removeSavedDirectoryHandle(modeName) {
  try {
    const request = indexedDB.open('FloatingMD_DirectoryHandles', 1);
    
    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['directories'], 'readwrite');
        const store = transaction.objectStore('directories');
        
        store.delete(modeName);
        
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
      };
      
      request.onerror = () => resolve();
    });
  } catch (error) {
    console.error('Error removing directory handle:', error);
  }
}

// 保存文件到指定目录
async function saveFileToDirectory(directoryHandle, fileName, content) {
  try {
    // 创建或获取文件句柄
    const fileHandle = await directoryHandle.getFileHandle(fileName, {
      create: true
    });
    
    // 创建可写流
    const writable = await fileHandle.createWritable();
    
    // 写入内容
    await writable.write(content);
    
    // 关闭文件
    await writable.close();
    
    console.log('File saved successfully:', fileName);
  } catch (error) {
    console.error('Error saving file to directory:', error);
    throw error;
  }
}

// 显示下载成功提示
function showDownloadSuccess(fileName, customPath, modeName, savedToCustomPath = false) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #27ae60;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 350px;
    font-size: 14px;
    line-height: 1.4;
    animation: slideIn 0.3s ease-out;
  `;
  
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  if (savedToCustomPath) {
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">✅ 保存成功</div>
      <div style="margin-bottom: 8px;">📁 ${modeName} 模式</div>
      <div style="margin-bottom: 8px;">文件: ${fileName}</div>
      <div style="font-size: 12px; opacity: 0.9;">已保存到您选择的位置</div>
    `;
  } else if (customPath) {
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">✅ 导出成功</div>
      <div style="margin-bottom: 8px;">📁 ${modeName} 模式</div>
      <div style="margin-bottom: 8px;">文件: ${fileName}</div>
      <div style="font-size: 12px; opacity: 0.9;">建议移动到: ${customPath}</div>
    `;
  } else {
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">✅ 导出成功</div>
      <div style="margin-bottom: 8px;">文件: ${fileName}</div>
      <div style="font-size: 12px; opacity: 0.9;">已保存到默认下载文件夹</div>
    `;
  }
  
  document.body.appendChild(notification);
  
  // 4秒后自动消失
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }
  }, 4000);
  
  // 点击关闭
  notification.addEventListener('click', () => {
    if (document.body.contains(notification)) {
      notification.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }
  });
  
  // 添加滑出动画
  const slideOutStyle = document.createElement('style');
  slideOutStyle.textContent = `
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(slideOutStyle);
}

// 显示路径提示（保留原有功能）
function showPathHint(customPath, modeName, fileName) {
  showDownloadSuccess(fileName, customPath, modeName);
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
  const isInIgnoredTag = (n) => {
    if (!n || !n.parentElement) return false;
    const tag = n.parentElement.tagName.toLowerCase();
    return tag === 'style' || tag === 'script' || tag === 'meta' || tag === 'link' || tag === 'title' || tag === 'head';
  };
  const looksLikeCss = (text) => /\{[\s\S]*?\}/.test(text) && /:/.test(text);
  while (node = walker.nextNode()) {
    if (isInIgnoredTag(node)) continue;
    const text = node.textContent.trim();
    if (text && !looksLikeCss(text)) {
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
  
  // 只防止文本选择，不设置全局光标
  document.body.style.userSelect = 'none';
  
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
    
    // 恢复文本选择
    document.body.style.userSelect = '';
    
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
  
  // 移除样式和脚本等非内容标签，避免把CSS粘入编辑器
  const nonContentSelectors = ['style', 'script', 'meta', 'link', 'title', 'head'];
  nonContentSelectors.forEach(sel => {
    tempDiv.querySelectorAll(sel).forEach(el => el.remove());
  });
  
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
    
    // 压缩并转换为data URL - 使用优化的压缩设置
    const dataUrl = await compressImage(file);
    
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

// 压缩图片 - 优化存储空间
function compressImage(file, maxWidth = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
      // 计算压缩后的尺寸 - 更激进的压缩策略
      let { width, height } = img;
      
      // 根据文件大小动态调整压缩策略
      const fileSize = file.size;
      let targetMaxWidth = maxWidth;
      let targetQuality = quality;
      
      // 大文件使用更激进的压缩
      if (fileSize > 2 * 1024 * 1024) { // 2MB以上
        targetMaxWidth = 800;
        targetQuality = 0.6;
      } else if (fileSize > 1 * 1024 * 1024) { // 1MB以上
        targetMaxWidth = 1024;
        targetQuality = 0.7;
      }
      
      // 计算新尺寸
      if (width > targetMaxWidth || height > targetMaxWidth) {
        const ratio = Math.min(targetMaxWidth / width, targetMaxWidth / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }
      
      // 设置画布尺寸
      canvas.width = width;
      canvas.height = height;
      
      // 使用高质量绘制设置
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // 绘制图片
      ctx.drawImage(img, 0, 0, width, height);
      
      // 统一使用JPEG格式以获得更好的压缩率（除非原图是PNG且很小）
      let outputType = 'image/jpeg';
      let outputQuality = targetQuality;
      
      // 小的PNG图片保持原格式
      if (file.type === 'image/png' && fileSize < 500 * 1024) {
        outputType = 'image/png';
        outputQuality = 1.0;
      }
      
      // 转换为data URL
      const dataUrl = canvas.toDataURL(outputType, outputQuality);
      
      // 检查压缩后的大小
      const compressedSize = new Blob([dataUrl]).size;
      const compressionRatio = ((fileSize - compressedSize) / fileSize * 100).toFixed(1);
      
      console.log(`图片压缩: ${fileSize} -> ${compressedSize} bytes (减少 ${compressionRatio}%)`);
      
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

// 存储图片数据 - 带存储空间检查
async function storeImageData(fileName, dataUrl) {
  // 先检查存储空间
  const canStore = await checkStorageSpace(dataUrl);
  if (!canStore) {
    throw new Error('存储空间不足，请清理图片数据');
  }
  
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['imageData'], function(result) {
      const imageData = result.imageData || {};
      imageData[fileName] = dataUrl;
      
      chrome.storage.local.set({ imageData }, function() {
        if (chrome.runtime.lastError) {
          // 如果是配额错误，尝试自动清理
          if (chrome.runtime.lastError.message.includes('quota')) {
            showStorageFullDialog();
          }
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  });
}

// 检查存储空间
async function checkStorageSpace(newDataUrl) {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
      const maxBytes = 5 * 1024 * 1024; // 5MB 限制
      const newDataSize = new Blob([newDataUrl]).size;
      const availableSpace = maxBytes - bytesInUse;
      
      console.log(`当前使用: ${bytesInUse} bytes, 新数据: ${newDataSize} bytes, 剩余: ${availableSpace} bytes`);
      
      resolve(newDataSize < availableSpace);
    });
  });
}

// 显示存储空间不足对话框
function showStorageFullDialog() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    padding: 20px;
    border-radius: 8px;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  
  dialog.innerHTML = `
    <h3 style="margin-top: 0; color: #e74c3c;">⚠️ 存储空间已满</h3>
    <p>图片存储空间已用完，需要清理后才能继续添加图片。</p>
    <div style="margin-top: 20px;">
      <button id="clearImages" style="background: #e74c3c; color: white; border: none; padding: 8px 16px; border-radius: 4px; margin-right: 10px; cursor: pointer;">清理所有图片</button>
      <button id="cancelClear" style="background: #95a5a6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">取消</button>
    </div>
  `;
  
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  
  // 清理按钮事件
  dialog.querySelector('#clearImages').onclick = async () => {
    await clearAllImages();
    document.body.removeChild(modal);
    alert('图片数据已清理，现在可以继续添加图片了');
  };
  
  // 取消按钮事件
  dialog.querySelector('#cancelClear').onclick = () => {
    document.body.removeChild(modal);
  };
}

// 清理所有图片数据
async function clearAllImages() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['imageData'], function() {
      console.log('所有图片数据已清理');
      resolve();
    });
  });
}

// 获取存储使用情况
async function getStorageUsage() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
      const maxBytes = 5 * 1024 * 1024; // 5MB
      const usagePercent = (bytesInUse / maxBytes * 100).toFixed(1);
      resolve({
        used: bytesInUse,
        max: maxBytes,
        percent: usagePercent,
        available: maxBytes - bytesInUse
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

// 显示存储状态面板
async function showStorageStatus() {
  const usage = await getStorageUsage();
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: white;
    padding: 25px;
    border-radius: 10px;
    max-width: 450px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;
  
  // 获取图片数量
  const imageCount = await getImageCount();
  
  panel.innerHTML = `
    <h3 style="margin-top: 0; color: #2c3e50;">📊 存储空间状态</h3>
    <div style="margin: 20px 0;">
      <div style="background: #ecf0f1; height: 20px; border-radius: 10px; margin: 10px 0; overflow: hidden;">
        <div style="background: ${usage.percent > 80 ? '#e74c3c' : usage.percent > 60 ? '#f39c12' : '#27ae60'}; height: 100%; width: ${usage.percent}%; transition: width 0.3s;"></div>
      </div>
      <p style="margin: 10px 0; font-size: 14px; color: #7f8c8d;">
        已使用: ${(usage.used / 1024 / 1024).toFixed(2)} MB / ${(usage.max / 1024 / 1024).toFixed(2)} MB (${usage.percent}%)
      </p>
      <p style="margin: 10px 0; font-size: 14px; color: #7f8c8d;">
        剩余空间: ${(usage.available / 1024 / 1024).toFixed(2)} MB
      </p>
      <p style="margin: 10px 0; font-size: 14px; color: #7f8c8d;">
        存储图片: ${imageCount} 张
      </p>
    </div>
    <div style="margin-top: 20px;">
      <button id="refreshStatus" style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 4px; margin-right: 10px; cursor: pointer;">刷新</button>
      <button id="clearAllBtn" style="background: #e74c3c; color: white; border: none; padding: 8px 16px; border-radius: 4px; margin-right: 10px; cursor: pointer;">清理全部</button>
      <button id="closeStatus" style="background: #95a5a6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">关闭</button>
    </div>
  `;
  
  modal.appendChild(panel);
  document.body.appendChild(modal);
  
  // 事件处理
  panel.querySelector('#refreshStatus').onclick = () => {
    document.body.removeChild(modal);
    showStorageStatus(); // 重新显示
  };
  
  panel.querySelector('#clearAllBtn').onclick = async () => {
    if (confirm('确定要清理所有图片数据吗？此操作不可恢复！')) {
      await clearAllImages();
      document.body.removeChild(modal);
      alert('图片数据已清理完成');
    }
  };
  
  panel.querySelector('#closeStatus').onclick = () => {
    document.body.removeChild(modal);
  };
}

// 显示目录选择对话框
async function showDirectorySelectionDialog(modeName, customPath) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 25px;
      border-radius: 10px;
      max-width: 450px;
      width: 90%;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;
    
    dialog.innerHTML = `
      <h3 style="margin-top: 0; color: #2c3e50;">📁 选择保存文件夹</h3>
      <p style="margin: 15px 0; color: #7f8c8d; line-height: 1.5;">
        您设置的 "${modeName}" 模式路径为：<br>
        <strong>${customPath}</strong><br><br>
        请在接下来的对话框中选择对应的文件夹，<br>
        之后的导出将自动保存到该位置。
      </p>
      <div style="margin-top: 20px;">
        <button id="proceedBtn" style="background: #27ae60; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-right: 10px; cursor: pointer;">选择文件夹</button>
        <button id="cancelBtn" style="background: #95a5a6; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">取消</button>
      </div>
    `;
    
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    dialog.querySelector('#proceedBtn').onclick = () => {
      document.body.removeChild(modal);
      resolve(true);
    };
    
    dialog.querySelector('#cancelBtn').onclick = () => {
      document.body.removeChild(modal);
      resolve(false);
    };
  });
}

// 显示自定义路径错误
function showCustomPathError(errorMessage, customPath, modeName) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #e74c3c;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 350px;
    font-size: 14px;
    line-height: 1.4;
  `;
  
  notification.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">⚠️ 自定义路径保存失败</div>
    <div style="margin-bottom: 8px;">模式: ${modeName}</div>
    <div style="font-size: 12px; opacity: 0.9;">已回退到默认下载</div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 5000);
}

// 显示API不支持错误
function showApiNotSupportedError(customPath, modeName) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #f39c12;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 350px;
    font-size: 14px;
    line-height: 1.4;
  `;
  
  notification.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">ℹ️ 浏览器不支持</div>
    <div style="margin-bottom: 8px;">模式: ${modeName}</div>
    <div style="font-size: 12px; opacity: 0.9;">请使用 Chrome 86+ 版本以支持自定义路径</div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 6000);
}

// 创建模式切换器
function createModeSwitcher() {
  const switcherContainer = document.createElement('div');
  switcherContainer.id = 'mode-switcher-container';
  switcherContainer.style.cssText = `
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
  `;
  
  const switcherButton = document.createElement('button');
  switcherButton.id = 'mode-switcher-button';
  switcherButton.textContent = '模式';
  switcherButton.style.cssText = `
    background: #ff9800;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    transition: all 0.2s ease;
  `;
  
  switcherButton.addEventListener('mouseenter', function() {
    this.style.backgroundColor = '#f57c00';
    this.style.transform = 'scale(1.05)';
  });
  
  switcherButton.addEventListener('mouseleave', function() {
    this.style.backgroundColor = '#ff9800';
    this.style.transform = 'scale(1)';
  });
  
  // 创建下拉菜单
  const dropdown = document.createElement('div');
  dropdown.id = 'mode-switcher-dropdown';
  dropdown.style.cssText = `
    position: absolute;
    top: 100%;
    right: 0;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    z-index: 1000;
    min-width: 150px;
    max-height: 300px;
    overflow-y: auto;
    display: none;
  `;
  
  switcherButton.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleModeDropdown();
  });
  
  switcherContainer.appendChild(switcherButton);
  switcherContainer.appendChild(dropdown);
  
  // 点击外部关闭下拉菜单
  document.addEventListener('click', function(e) {
    if (!switcherContainer.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  // 初始化模式显示
  updateModeSwitcherDisplay();
  
  return switcherContainer;
}

// 切换模式下拉菜单
async function toggleModeDropdown() {
  const dropdown = document.getElementById('mode-switcher-dropdown');
  if (dropdown.style.display === 'none' || !dropdown.style.display) {
    await loadModesIntoDropdown();
    dropdown.style.display = 'block';
  } else {
    dropdown.style.display = 'none';
  }
}

// 加载模式到下拉菜单
async function loadModesIntoDropdown() {
  const dropdown = document.getElementById('mode-switcher-dropdown');
  
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['fileLibraryModes', 'currentFileLibraryMode'], function(data) {
        resolve(data);
      });
    });
    
    const modes = result.fileLibraryModes || [{ id: 'default', name: '默认', customPath: null }];
    const currentMode = result.currentFileLibraryMode || modes[0];
    
    dropdown.innerHTML = '';
    
    modes.forEach(mode => {
      const modeItem = document.createElement('div');
      modeItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
      `;
      
      const modeName = document.createElement('span');
      modeName.textContent = mode.name;
      modeName.style.color = '#333';
      
      const checkMark = document.createElement('span');
      if (currentMode.id === mode.id) {
        checkMark.textContent = '✓';
        checkMark.style.color = '#4285f4';
        checkMark.style.fontWeight = 'bold';
        modeItem.style.backgroundColor = '#f0f8ff';
      }
      
      modeItem.appendChild(modeName);
      modeItem.appendChild(checkMark);
      
      modeItem.addEventListener('mouseenter', function() {
        if (currentMode.id !== mode.id) {
          this.style.backgroundColor = '#f5f5f5';
        }
      });
      
      modeItem.addEventListener('mouseleave', function() {
        if (currentMode.id !== mode.id) {
          this.style.backgroundColor = '';
        } else {
          this.style.backgroundColor = '#f0f8ff';
        }
      });
      
      modeItem.addEventListener('click', function() {
        switchToMode(mode);
      });
      
      dropdown.appendChild(modeItem);
    });
    
  } catch (error) {
    console.error('Error loading modes:', error);
  }
}

// 切换到指定模式
async function switchToMode(mode) {
  try {
    await new Promise((resolve) => {
      chrome.storage.local.set({
        currentFileLibraryMode: mode
      }, resolve);
    });
    
    console.log('Switched to mode:', mode.name);
    
    // 更新显示
    updateModeSwitcherDisplay();
    
    // 关闭下拉菜单
    const dropdown = document.getElementById('mode-switcher-dropdown');
    dropdown.style.display = 'none';
    
    // 显示切换成功提示
    showModeChangeNotification(mode.name);
    
  } catch (error) {
    console.error('Error switching mode:', error);
  }
}

// 更新模式切换器显示
async function updateModeSwitcherDisplay() {
  const switcherButton = document.getElementById('mode-switcher-button');
  if (!switcherButton) return;
  
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['currentFileLibraryMode'], function(data) {
        resolve(data);
      });
    });
    
    const currentMode = result.currentFileLibraryMode;
    if (currentMode) {
      const displayName = currentMode.name.length > 6 
        ? currentMode.name.substring(0, 6) + '...' 
        : currentMode.name;
      switcherButton.textContent = displayName;
      switcherButton.title = `当前模式: ${currentMode.name}`;
    } else {
      switcherButton.textContent = '模式';
      switcherButton.title = '选择模式';
    }
  } catch (error) {
    console.error('Error updating mode switcher display:', error);
  }
}

// 显示模式切换通知
function showModeChangeNotification(modeName) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    background: #ff9800;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10001;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  
  notification.textContent = `已切换到 "${modeName}" 模式`;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 2000);
}

// 导出Markdown - 使用当前模式设置
async function exportMarkdownWithCurrentMode() {
  console.log('Export from editor button clicked');
  
  // 获取当前模式信息
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['currentFileLibraryMode'], function(data) {
        resolve(data);
      });
    });
    
    const currentMode = result.currentFileLibraryMode;
    let customPath = null;
    let modeName = '默认';
    
    if (currentMode) {
      customPath = currentMode.customPath;
      modeName = currentMode.name;
    }
    
    console.log('Using current mode for export:', modeName, 'path:', customPath);
    
    // 使用相同的导出逻辑
    await exportMarkdown(customPath, modeName);
    
  } catch (error) {
    console.error('Error getting current mode:', error);
    // 如果获取模式失败，使用默认导出
    await exportMarkdown(null, '默认');
  }
}

// 获取图片数量
async function getImageCount() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['imageData'], function(result) {
      const imageData = result.imageData || {};
      resolve(Object.keys(imageData).length);
    });
  });
}

// 添加快捷键支持
document.addEventListener('keydown', function(e) {
  // Ctrl+Shift+S 显示存储状态
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    showStorageStatus();
  }
  
  // CMD+M (Mac) 或 Ctrl+M (Windows/Linux) 切换笔记显示/隐藏
  if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
    e.preventDefault();
    console.log('Toggle shortcut triggered');
    
    // 如果编辑器不存在，先创建它
    if (!editorWrapper) {
      createEditor();
    }
    
    toggleEditor();
  }
});

// 一键复制全部内容功能 (模拟 Ctrl+A + Ctrl+C，支持图片)
async function quickCopyAllContent() {
  console.log('Quick copy all content clicked');
  
  if (!editorContent.trim() || editorContent.includes('color: #999')) {
    console.log('No content to copy');
    showQuickCopyNotification('编辑器中没有内容可复制！', false);
    return;
  }
  
  try {
    // 获取编辑器元素
    const editor = editorWrapper.querySelector('.md-editor');
    if (!editor) {
      throw new Error('找不到编辑器元素');
    }
    
    // 模拟 Ctrl+A (全选)
    editor.focus();
    
    // 创建选择范围选中所有内容
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // 检查是否支持富文本复制 (包含图片)
    if (navigator.clipboard && navigator.clipboard.write) {
      console.log('Attempting to copy rich content with images');
      
      try {
        // 尝试复制富文本内容 (包含图片)
        await copyRichContent(editor);
        
        // 统计内容
        const textLength = editor.textContent.length;
        const imageCount = editor.querySelectorAll('img').length;
        let message = `已复制 ${textLength} 个字符`;
        if (imageCount > 0) {
          message += ` 和 ${imageCount} 张图片`;
        }
        message += ' 到剪贴板';
        
        showQuickCopyNotification(message, true);
        
      } catch (richCopyError) {
        console.log('Rich copy failed, falling back to text copy:', richCopyError);
        // 如果富文本复制失败，回退到纯文本复制
        await copyTextOnly(selection);
      }
      
    } else {
      console.log('Rich clipboard not supported, using text copy');
      // 不支持富文本复制，使用传统方法
      await copyTextOnly(selection);
    }
    
    // 清除选择（让用户看到复制效果后再清除）
    setTimeout(() => {
      selection.removeAllRanges();
    }, 500);
    
  } catch (error) {
    console.error('Quick copy failed:', error);
    showQuickCopyNotification('复制失败：' + error.message, false);
  }
}

// 复制富文本内容（包含图片）
async function copyRichContent(editor) {
  // 创建一个临时的HTML内容
  const htmlContent = editor.innerHTML;
  
  // 创建 ClipboardItem 包含HTML和纯文本
  const clipboardItems = [];
  
  // 添加HTML格式
  const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
  
  // 添加纯文本格式作为备选
  const textContent = editor.textContent || editor.innerText || '';
  const textBlob = new Blob([textContent], { type: 'text/plain' });
  
  // 创建 ClipboardItem
  const clipboardItem = new ClipboardItem({
    'text/html': htmlBlob,
    'text/plain': textBlob
  });
  
  clipboardItems.push(clipboardItem);
  
  // 尝试写入剪贴板
  await navigator.clipboard.write(clipboardItems);
  console.log('Rich content copied successfully');
}

// 复制纯文本内容
async function copyTextOnly(selection) {
  const selectedText = selection.toString();
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    // 使用现代 Clipboard API
    await navigator.clipboard.writeText(selectedText);
    console.log('Text copied using Clipboard API');
  } else {
    // 回退到传统方法
    const success = document.execCommand('copy');
    if (!success) {
      throw new Error('传统复制方法失败');
    }
    console.log('Text copied using execCommand');
  }
  
  showQuickCopyNotification(`已复制 ${selectedText.length} 个字符到剪贴板`, true);
}

// 显示快速复制通知
function showQuickCopyNotification(message, isSuccess) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${isSuccess ? '#AF52DE' : '#FF3B30'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-size: 14px;
    font-weight: 500;
    z-index: 10001;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
    max-width: 300px;
    word-wrap: break-word;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // 动画显示
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 10);
  
  // 自动消失
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

// 分享笔记功能
async function shareNote() {
  console.log('Share note clicked');
  
  if (!editorContent.trim() || editorContent.includes('color: #999')) {
    console.log('No content to share');
    alert('编辑器中没有内容可分享！');
    return;
  }
  
  try {
    // 将HTML内容转换为纯文本，用于分享
    const textContent = htmlToPlainText(editorContent);
    const firstLineText = getFirstLineText(editorContent);
    const title = firstLineText ? firstLineText : '我的笔记';
    
    // 检查是否支持Web Share API
    if (navigator.share) {
      console.log('Using Web Share API');
      await navigator.share({
        title: title,
        text: textContent,
        url: window.location.href
      });
      console.log('Content shared successfully');
    } else {
      console.log('Web Share API not supported, showing fallback options');
      showShareOptions(title, textContent);
    }
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('User cancelled share');
    } else {
      console.error('Error sharing:', error);
      showShareOptions(title, textContent);
    }
  }
}

// 将HTML转换为纯文本
function htmlToPlainText(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // 获取纯文本内容
  let text = tempDiv.textContent || tempDiv.innerText || '';
  
  // 清理多余的空白字符
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

// 显示分享选项（回退方案）
function showShareOptions(title, content) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const sharePanel = document.createElement('div');
  sharePanel.style.cssText = `
    background: white;
    padding: 25px;
    border-radius: 12px;
    max-width: 400px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;
  
  sharePanel.innerHTML = `
    <h3 style="margin-top: 0; color: #2c3e50; font-size: 18px;">📤 分享笔记</h3>
    <p style="margin: 15px 0; color: #7f8c8d; font-size: 14px; line-height: 1.5;">
      选择分享方式：
    </p>
    <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
      <button id="copyToClipboard" style="background: #007AFF; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
        📋 复制到剪贴板
      </button>
      <button id="openNotes" style="background: #FFD60A; color: #1d1d1f; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
        📝 打开备忘录
      </button>
      <button id="openMail" style="background: #34C759; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
        ✉️ 通过邮件分享
      </button>
      <button id="openMessages" style="background: #30D158; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
        💬 通过信息分享
      </button>
    </div>
    <button id="closeShare" style="background: #8E8E93; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 20px; font-size: 13px;">
      取消
    </button>
  `;
  
  modal.appendChild(sharePanel);
  document.body.appendChild(modal);
  
  // 添加按钮事件
  sharePanel.querySelector('#copyToClipboard').onclick = async () => {
    try {
      await navigator.clipboard.writeText(content);
      showShareSuccess('内容已复制到剪贴板');
      document.body.removeChild(modal);
    } catch (error) {
      console.error('Failed to copy:', error);
      // 回退到传统复制方法
      fallbackCopyToClipboard(content);
      showShareSuccess('内容已复制到剪贴板');
      document.body.removeChild(modal);
    }
  };
  
  sharePanel.querySelector('#openNotes').onclick = () => {
    // 尝试打开备忘录应用
    const notesUrl = `x-apple-notes://new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(content)}`;
    window.open(notesUrl, '_blank');
    showShareSuccess('正在打开备忘录应用...');
    document.body.removeChild(modal);
  };
  
  sharePanel.querySelector('#openMail').onclick = () => {
    const mailUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(content)}`;
    window.open(mailUrl, '_blank');
    showShareSuccess('正在打开邮件应用...');
    document.body.removeChild(modal);
  };
  
  sharePanel.querySelector('#openMessages').onclick = () => {
    const smsUrl = `sms:?body=${encodeURIComponent(title + '\n\n' + content)}`;
    window.open(smsUrl, '_blank');
    showShareSuccess('正在打开信息应用...');
    document.body.removeChild(modal);
  };
  
  sharePanel.querySelector('#closeShare').onclick = () => {
    document.body.removeChild(modal);
  };
  
  // 点击外部关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// 传统复制到剪贴板方法（回退方案）
function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    document.execCommand('copy');
  } catch (error) {
    console.error('Fallback copy failed:', error);
  }
  
  document.body.removeChild(textArea);
}

// 显示分享成功提示
function showShareSuccess(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #34C759;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10001;
    font-size: 14px;
    line-height: 1.4;
    animation: slideInShare 0.3s ease-out;
  `;
  
  notification.textContent = message;
  
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInShare {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutShare {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // 3秒后自动消失
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.style.animation = 'slideOutShare 0.3s ease-in forwards';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }
  }, 3000);
  
  // 点击关闭
  notification.addEventListener('click', () => {
    if (document.body.contains(notification)) {
      notification.style.animation = 'slideOutShare 0.3s ease-in forwards';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }
  });
}

// 编辑器相关变量







