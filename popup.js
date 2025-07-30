document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  
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
  
  // 显示/隐藏编辑器
  document.getElementById('toggleEditor').addEventListener('click', function() {
    console.log('Toggle button clicked');
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        console.error('No active tabs found');
        return;
      }
      
      const currentTab = tabs[0];
      // 只对http、https和file协议的页面有效
      if (currentTab.url && (currentTab.url.startsWith('http') || currentTab.url.startsWith('file'))) {
        console.log('Sending toggleEditor message to tab:', currentTab.id);
        chrome.tabs.sendMessage(currentTab.id, {action: "toggleEditor"}, function(response) {
          console.log('Response received:', response);
          if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError);
            
            // 如果消息发送失败，尝试先注入脚本
            chrome.runtime.sendMessage({
              action: 'injectScript',
              tabId: currentTab.id
            }, function(injectionResponse) {
              console.log('Injection after error response:', injectionResponse);
              
              // 注入后再次尝试发送消息
              if (injectionResponse && injectionResponse.success) {
                setTimeout(() => {
                  chrome.tabs.sendMessage(currentTab.id, {action: "toggleEditor"});
                }, 500); // 给content script一点时间加载
              }
            });
          }
        });
      } else {
        console.log('Cannot toggle editor on this page type:', currentTab.url);
        // 显示错误消息
        const errorMsg = document.createElement('div');
        errorMsg.textContent = '无法在此类型的页面上使用编辑器';
        errorMsg.style.color = 'red';
        errorMsg.style.padding = '10px';
        document.body.appendChild(errorMsg);
      }
    });
  });

  // 导出Markdown文件
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
        chrome.tabs.sendMessage(currentTab.id, {action: "exportMarkdown"}, function(response) {
          console.log('Response received:', response);
          if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError);
          }
        });
      }
    });
  });
}); 