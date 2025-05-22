document.addEventListener('DOMContentLoaded', function() {
  const editor = document.getElementById('editor');
  
  // 加载上次保存的内容
  chrome.storage.local.get(['editorContent'], function(result) {
    if (result.editorContent) {
      editor.value = result.editorContent;
    }
  });
  
  // 保存编辑器内容
  editor.addEventListener('input', function() {
    chrome.storage.local.set({editorContent: editor.value});
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
}); 