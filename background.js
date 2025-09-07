console.log('Background script initialized');

// 监听快捷键命令
chrome.commands.onCommand.addListener(function(command) {
  console.log('Command triggered:', command);
  
  if (command === 'toggle-editor') {
    // 获取当前活动标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length > 0) {
        const tab = tabs[0];
        console.log('Toggling editor on tab:', tab.id);
        
        // 向当前标签页发送toggleEditor消息
        if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
          chrome.tabs.sendMessage(tab.id, {action: "toggleEditor"})
            .catch(error => {
              console.log('Error sending toggle message via command, attempting to inject content script first:', error);
              
              // 尝试注入content script然后再发送消息
              injectContentScript(tab.id)
                .then(() => {
                  // 延迟一下再发送消息，确保脚本已加载
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tab.id, {action: "toggleEditor"});
                  }, 100);
                });
            });
        } else {
          console.log('Cannot use shortcut on this tab type:', tab.url);
        }
      }
    });
  }
});

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('Extension installed:', details);
});

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(function(tab) {
  console.log('Extension icon clicked on tab:', tab.id);
  
  // 直接向当前标签页发送toggleEditor消息
  if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
    chrome.tabs.sendMessage(tab.id, {action: "toggleEditor"})
      .catch(error => {
        console.log('Error sending toggle message, attempting to inject content script first:', error);
        
        // 尝试注入content script
        injectContentScript(tab.id);
      });
  } else {
    console.log('Cannot inject content script into this tab type:', tab.url);
  }
});

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  // 只在页面完全加载时执行
  if (changeInfo.status === 'complete' && tab.url && 
     (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
    
    console.log('Tab updated to complete status:', tabId, tab.url);
    
    // 我们不自动注入脚本，而是等待用户点击扩展图标
    // 这样可以避免不必要的权限错误
  }
});

// 监听来自popup或content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Background received message:', request);
  
  if (request.action === 'injectScript') {
    // 从popup请求注入content script
    const tabId = request.tabId;
    if (tabId) {
      injectContentScript(tabId)
        .then(() => sendResponse({success: true}))
        .catch(error => sendResponse({success: false, error: error.message}));
      return true; // 异步响应
    }
  }
  
  if (request.action === 'debug') {
    // 调试消息
    console.log('Debug info:', request.data);
    sendResponse({received: true});
  }
  
  return true;
});

// 注入content script和CSS的函数
function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    // 首先尝试注入JS
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      files: ['content.js']
    })
    .then(() => {
      console.log('Content script successfully injected into tab:', tabId);
      
      // 然后注入CSS
      return chrome.scripting.insertCSS({
        target: {tabId: tabId},
        files: ['floating-editor.css']
      });
    })
    .then(() => {
      console.log('CSS successfully injected into tab:', tabId);
      resolve();
    })
    .catch(error => {
      console.error('Error injecting scripts:', error);
      reject(error);
    });
  });
} 