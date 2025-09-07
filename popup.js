document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  
  // 本地文件库相关变量
  let modes = [];
  let currentMode = null;
  let isAddingMode = false;
  let editingModeId = null;
  
  // 获取DOM元素
  const fileLibraryDropdown = document.getElementById('fileLibraryDropdown');
  const fileLibraryButton = document.getElementById('fileLibraryButton');
  const currentModeText = document.getElementById('currentModeText');
  const dropdownContent = document.getElementById('dropdownContent');
  const addModeItem = document.getElementById('addModeItem');
  const pathInputDialog = document.getElementById('pathInputDialog');
  const pathInput = document.getElementById('pathInput');
  const pathSaveButton = document.getElementById('pathSaveButton');
  const pathCancelButton = document.getElementById('pathCancelButton');
  
  // 初始化
  init();
  
  function init() {
    loadModes();
    setupEventListeners();
    
    // 获取当前激活的标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      console.log('Current active tab:', currentTab.id, currentTab.url);
      
      // 尝试主动注入脚本
      if (currentTab && (currentTab.url.startsWith('http') || currentTab.url.startsWith('file'))) {
        chrome.runtime.sendMessage({
          action: 'injectScript',
          tabId: currentTab.id
        }, function(response) {
          console.log('Injection response:', response);
        });
      }
    });
  }
  
  // 加载模式数据
  function loadModes() {
    chrome.storage.local.get(['fileLibraryModes', 'currentFileLibraryMode'], function(data) {
      modes = data.fileLibraryModes || [
        { id: 'default', name: '默认', customPath: null }
      ];
      currentMode = data.currentFileLibraryMode || modes[0];
      updateUI();
    });
  }
  
  // 保存模式数据
  function saveModes() {
    chrome.storage.local.set({
      fileLibraryModes: modes,
      currentFileLibraryMode: currentMode
    });
  }
  
  // 更新UI显示
  function updateUI() {
    updateCurrentModeDisplay();
    renderDropdownContent();
  }
  
  // 更新当前模式显示
  function updateCurrentModeDisplay() {
    if (currentMode) {
      const displayName = currentMode.name.length > 8 
        ? currentMode.name.substring(0, 8) + '...' 
        : currentMode.name;
      currentModeText.textContent = displayName;
    }
  }
  
  // 渲染下拉菜单内容
  function renderDropdownContent() {
    // 清空现有内容，保留添加模式项
    dropdownContent.innerHTML = '';
    
    // 添加"添加模式"项
    const addModeDiv = document.createElement('div');
    addModeDiv.className = 'dropdown-item add-mode-item';
    addModeDiv.innerHTML = '<span>+ Add Mode (添加模式)</span>';
    addModeDiv.addEventListener('click', handleAddModeClick);
    dropdownContent.appendChild(addModeDiv);
    
    // 添加现有模式
    modes.forEach(mode => {
      const modeDiv = document.createElement('div');
      modeDiv.className = 'dropdown-item';
      
      // 模式信息区域
      const modeInfo = document.createElement('div');
      modeInfo.className = 'mode-info';
      modeInfo.addEventListener('click', () => switchMode(mode));
      
      const modeName = document.createElement('span');
      modeName.className = 'mode-name';
      modeName.textContent = mode.name;
      modeInfo.appendChild(modeName);
      
      // 选中标识
      if (currentMode && currentMode.id === mode.id) {
        const indicator = document.createElement('span');
        indicator.className = 'selected-indicator';
        indicator.textContent = '✓';
        modeInfo.appendChild(indicator);
      }
      
      // 按钮区域
      const buttonsDiv = document.createElement('div');
      buttonsDiv.className = 'mode-buttons';
      
      // 编辑按钮
      const editBtn = document.createElement('button');
      editBtn.className = 'mode-button edit-button';
      editBtn.textContent = '编辑';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editMode(mode);
      });
      
      // 位置按钮
      const locationBtn = document.createElement('button');
      locationBtn.className = 'mode-button location-button';
      locationBtn.textContent = '位置';
      locationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setModeLocation(mode);
      });
      
      // 删除按钮
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'mode-button delete-button';
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMode(mode);
      });
      
      buttonsDiv.appendChild(editBtn);
      buttonsDiv.appendChild(locationBtn);
      buttonsDiv.appendChild(deleteBtn);
      
      modeDiv.appendChild(modeInfo);
      modeDiv.appendChild(buttonsDiv);
      dropdownContent.appendChild(modeDiv);
    });
  }
  
  // 设置事件监听器
  function setupEventListeners() {
    // 文件库下拉菜单点击
    fileLibraryButton.addEventListener('click', function(e) {
      e.stopPropagation();
      fileLibraryDropdown.classList.toggle('active');
    });
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', function(e) {
      if (!fileLibraryDropdown.contains(e.target)) {
        fileLibraryDropdown.classList.remove('active');
        cancelAddMode();
      }
    });
    
    // 路径输入对话框事件
    pathSaveButton.addEventListener('click', savePathInput);
    pathCancelButton.addEventListener('click', cancelPathInput);
    pathInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        savePathInput();
      } else if (e.key === 'Escape') {
        cancelPathInput();
      }
    });
    
    // 原有的编辑器功能
    setupOriginalFeatures();
  }
  
  // 处理添加模式点击
  function handleAddModeClick(e) {
    e.stopPropagation();
    if (!isAddingMode) {
      showAddModeInput();
    }
  }
  
  // 显示添加模式输入框
  function showAddModeInput() {
    isAddingMode = true;
    const addModeDiv = dropdownContent.querySelector('.add-mode-item');
    addModeDiv.innerHTML = `
      <div class="add-mode-input">
        <input type="text" id="newModeInput" placeholder="模式名称" maxlength="20" />
        <button id="saveModeBtn">保存</button>
      </div>
    `;
    
    const input = document.getElementById('newModeInput');
    const saveBtn = document.getElementById('saveModeBtn');
    
    input.focus();
    
    input.addEventListener('keydown', function(e) {
      e.stopPropagation();
      if (e.key === 'Enter') {
        saveNewMode();
      } else if (e.key === 'Escape') {
        cancelAddMode();
      }
    });
    
    saveBtn.addEventListener('click', saveNewMode);
  }
  
  // 保存新模式
  function saveNewMode() {
    const input = document.getElementById('newModeInput');
    const name = input.value.trim();
    
    if (name) {
      const newMode = {
        id: Date.now().toString(),
        name: name,
        customPath: null
      };
      
      modes.push(newMode);
      currentMode = newMode;
      saveModes();
      updateUI();
      fileLibraryDropdown.classList.remove('active');
      showToast('模式已添加');
    }
    
    cancelAddMode();
  }
  
  // 取消添加模式
  function cancelAddMode() {
    if (isAddingMode) {
      isAddingMode = false;
      renderDropdownContent();
    }
  }
  
  // 切换模式
  function switchMode(mode) {
    currentMode = mode;
    saveModes();
    updateUI();
    fileLibraryDropdown.classList.remove('active');
    showToast(`已切换到 "${mode.name}" 模式`);
  }
  
  // 编辑模式
  function editMode(mode) {
    const modeItems = dropdownContent.querySelectorAll('.dropdown-item:not(.add-mode-item)');
    let targetModeItem = null;
    
    modeItems.forEach(item => {
      const nameSpan = item.querySelector('.mode-name');
      if (nameSpan && nameSpan.textContent === mode.name) {
        targetModeItem = item;
      }
    });
    
    if (!targetModeItem) return;
    
    const modeInfo = targetModeItem.querySelector('.mode-info');
    const originalContent = modeInfo.innerHTML;
    
    // 创建编辑输入框
    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.value = mode.name;
    editInput.maxLength = 20;
    editInput.style.cssText = `
      padding: 2px 4px;
      border: 1px solid #4285f4;
      border-radius: 3px;
      outline: none;
      font-size: 14px;
    `;
    
    modeInfo.innerHTML = '';
    modeInfo.appendChild(editInput);
    
    editInput.focus();
    editInput.select();
    
    function saveEdit() {
      const newName = editInput.value.trim();
      if (newName && newName !== mode.name) {
        const modeIndex = modes.findIndex(m => m.id === mode.id);
        if (modeIndex !== -1) {
          modes[modeIndex].name = newName;
          
          if (currentMode.id === mode.id) {
            currentMode.name = newName;
          }
          
          saveModes();
          updateUI();
          showToast(`模式 "${newName}" 已更新`);
        }
      } else {
        modeInfo.innerHTML = originalContent;
      }
    }
    
    function cancelEdit() {
      modeInfo.innerHTML = originalContent;
    }
    
    editInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        saveEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    });
    
    const clickOutsideHandler = (e) => {
      if (!targetModeItem.contains(e.target)) {
        cancelEdit();
        document.removeEventListener('click', clickOutsideHandler);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', clickOutsideHandler);
    }, 100);
  }
  
  // 设置模式位置
  function setModeLocation(mode) {
    editingModeId = mode.id;
    pathInput.value = mode.customPath || '';
    pathInputDialog.style.display = 'flex';
    pathInput.focus();
    fileLibraryDropdown.classList.remove('active');
  }
  
  // 保存路径输入
  function savePathInput() {
    const path = pathInput.value.trim();
    const modeIndex = modes.findIndex(m => m.id === editingModeId);
    
    if (modeIndex !== -1) {
      modes[modeIndex].customPath = path || null;
      
      if (currentMode.id === editingModeId) {
        currentMode.customPath = path || null;
      }
      
      saveModes();
      updateUI();
      
      const modeName = modes[modeIndex].name;
      if (path) {
        showToast(`已为 "${modeName}" 设置路径: ${path}`);
      } else {
        showToast(`已将 "${modeName}" 重置为默认路径`);
      }
    }
    
    cancelPathInput();
  }
  
  // 取消路径输入
  function cancelPathInput() {
    pathInputDialog.style.display = 'none';
    pathInput.value = '';
    editingModeId = null;
  }
  
  // 删除模式
  function deleteMode(mode) {
    if (modes.length <= 1) {
      showToast('至少需要保留一个模式');
      return;
    }
    
    if (confirm(`确定要删除模式 "${mode.name}" 吗？`)) {
      if (currentMode.id === mode.id) {
        const otherMode = modes.find(m => m.id !== mode.id);
        if (otherMode) {
          currentMode = otherMode;
        }
      }
      
      modes = modes.filter(m => m.id !== mode.id);
      saveModes();
      updateUI();
      showToast(`模式 "${mode.name}" 已删除`);
    }
  }
  
  // 显示提示消息
  function showToast(message) {
    // 创建简单的提示消息
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background-color: #333;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 3000;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 2000);
  }
  
  // 设置原有功能的事件监听器
  function setupOriginalFeatures() {
    // 显示/隐藏编辑器
    document.getElementById('toggleEditor').addEventListener('click', function() {
      console.log('Toggle button clicked');
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs || tabs.length === 0) {
          console.error('No active tabs found');
          return;
        }
        
        const currentTab = tabs[0];
        if (currentTab.url && (currentTab.url.startsWith('http') || currentTab.url.startsWith('file'))) {
          console.log('Sending toggleEditor message to tab:', currentTab.id);
          chrome.tabs.sendMessage(currentTab.id, {action: "toggleEditor"}, function(response) {
            console.log('Response received:', response);
            if (chrome.runtime.lastError) {
              console.error('Error sending message:', chrome.runtime.lastError);
              
              chrome.runtime.sendMessage({
                action: 'injectScript',
                tabId: currentTab.id
              }, function(injectionResponse) {
                console.log('Injection after error response:', injectionResponse);
                
                if (injectionResponse && injectionResponse.success) {
                  setTimeout(() => {
                    chrome.tabs.sendMessage(currentTab.id, {action: "toggleEditor"});
                  }, 500);
                }
              });
            }
          });
        } else {
          console.log('Cannot toggle editor on this page type:', currentTab.url);
          const errorMsg = document.createElement('div');
          errorMsg.textContent = '无法在此类型的页面上使用编辑器';
          errorMsg.style.color = 'red';
          errorMsg.style.padding = '10px';
          document.body.appendChild(errorMsg);
        }
      });
    });

    // 导出Markdown文件 - 集成本地文件库功能
    document.getElementById('exportMarkdown').addEventListener('click', function() {
      console.log('Export button clicked');
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs || tabs.length === 0) {
          console.error('No active tabs found');
          return;
        }
        
        const currentTab = tabs[0];
        if (currentTab.url && (currentTab.url.startsWith('http') || currentTab.url.startsWith('file'))) {
          console.log('Sending exportMarkdown message to tab:', currentTab.id);
          
          // 传递当前模式的路径信息
          const exportData = {
            action: "exportMarkdown",
            customPath: currentMode ? currentMode.customPath : null,
            modeName: currentMode ? currentMode.name : '默认'
          };
          
          chrome.tabs.sendMessage(currentTab.id, exportData, function(response) {
            console.log('Response received:', response);
            if (chrome.runtime.lastError) {
              console.error('Error sending message:', chrome.runtime.lastError);
            } else {
              const pathInfo = currentMode && currentMode.customPath 
                ? `自定义路径: ${currentMode.customPath}` 
                : '默认下载路径';
              showToast(`已导出到 ${currentMode.name} (${pathInfo})`);
            }
          });
        }
      });
    });
  }
});